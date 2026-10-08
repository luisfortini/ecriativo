import assert from "node:assert/strict";
import { Pool } from "pg";
import dotenv from "dotenv";
dotenv.config({ path: process.env.CREATION_TEST_ENV || "backend/.env" });

async function main() {
  const staging=process.env.STAGING_DATABASE_URL || (process.env.CREATION_TEST_ENV?process.env.DATABASE_URL:undefined);
  if(!staging)throw new Error("Indique STAGING_DATABASE_URL ou CREATION_TEST_ENV para um banco de testes autorizado.");
  const schema="smoke_creation_"+Date.now();
  const admin=new Pool({connectionString:staging,max:1});
  let appPool:Pool|undefined,created=false;
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);created=true;
    const url=new URL(staging);url.searchParams.set("options","-c search_path="+schema);
    process.env.DATABASE_URL=url.toString();process.env.OPENAI_API_KEY="";
    process.env.ADMIN_NAME="";process.env.ADMIN_EMAIL="";process.env.ADMIN_PASSWORD="";
    process.env.JWT_SECRET="isolated-creation-test-secret-at-least-32";
    const db=await import("../db/connection.js");appPool=db.pool;
    const {migrate}=await import("../db/migrate.js");await migrate();await db.validateTenantRole();
    const {createOrganization}=await import("../services/organizationService.js");
    const {createClient}=await import("../services/clientService.js");
    const {persistMedia}=await import("../services/mediaStorageService.js");
    const {resolveCreationStyle}=await import("../services/creationDirectionService.js");
    const {saveEditorialPlan}=await import("../services/editorialService.js");
    const userId=Number((await db.run("INSERT INTO users(name,email,password_hash,role,active) VALUES('Teste','creation@test.invalid','fixture','user',TRUE)")).lastInsertRowid);
    const orgA=await createOrganization(userId,"Criação A","agency"),orgB=await createOrganization(userId,"Criação B","agency");
    const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jH0kAAAAASUVORK5CYII=","base64");
    let clientId=0,assetId=0;
    await db.runWithOrganizationContext(orgA.id,async()=>{
      clientId=Number((await createClient({name:"Marca A",content_language:"English (US)"}))!.id);
      const other=Number((await createClient({name:"Outra marca"}))!.id);
      const add=async(type:string,filename:string)=>Number((await db.run("INSERT INTO client_assets(client_id,type,file_url) VALUES(?,?,?)",[clientId,type,"https://fixture.invalid/uploads/"+filename])).lastInsertRowid);
      await persistMedia("uploads","style.png",png);
      assetId=await add("approved_reference","style.png");
      const pdfId=await add("approved_ad","document.pdf");await persistMedia("uploads","document.pdf",Buffer.from("%PDF-1.7 fixture"));
      const missingId=await add("approved_reference","unavailable-"+schema+".png");
      await add("logo_main","style.png");await add("rejected_reference","style.png");
      assert.equal((await resolveCreationStyle(clientId))!.id,assetId);
      assert.equal((await resolveCreationStyle(clientId,assetId))!.filename,"style.png");
      await assert.rejects(()=>resolveCreationStyle(other,assetId),/não pertence/);
      await assert.rejects(()=>resolveCreationStyle(clientId,pdfId),/PNG/);
      await assert.rejects(()=>resolveCreationStyle(clientId,missingId),/indisponível/);
      const raw={client_id:clientId,name:"Semana de teste",posts_per_week:3,pillars:["Dicas"],formats:["post"],weekly_image_limit:3,visual_selection:{style_asset_id:assetId}};
      const plan=await saveEditorialPlan(raw);
      const stored=await db.get<{active:boolean;automatic:boolean;visual_selection:{style_asset_id:number}}>("SELECT active,automatic,visual_selection FROM editorial_plans WHERE id=?",[plan.id]);
      assert.equal(stored!.visual_selection.style_asset_id,assetId);assert.equal(stored!.active,false);assert.equal(stored!.automatic,false);
      await assert.rejects(()=>saveEditorialPlan({...raw,client_id:other}),/não pertence/);
      assert.equal((await db.all("SELECT * FROM editorial_batches")).length,0);
    });
    await db.runWithOrganizationContext(orgB.id,async()=>{
      assert.equal((await db.all("SELECT * FROM client_assets")).length,0);
      await assert.rejects(()=>resolveCreationStyle(clientId,assetId),/não pertence/);
      assert.equal((await db.all("SELECT * FROM editorial_plans")).length,0);
    });
    console.log("PASS: shared style selection, invalid/missing file protection, cross-client/tenant isolation, selected style persistence and paused plan without generation. No paid API calls.");
  } finally {
    await appPool?.end();
    if(created&&/^smoke_creation_\d+$/.test(schema))await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.end();
  }
}
main().catch(error=>{console.error(error instanceof Error?error.message:"Creation smoke failed");process.exitCode=1;});
