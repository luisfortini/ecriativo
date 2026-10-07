import assert from "node:assert/strict";
import { Pool } from "pg";
import dotenv from "dotenv";
dotenv.config(); dotenv.config({path:"backend/.env"});

async function main() {
  const staging=process.env.STAGING_DATABASE_URL;
  if(!staging)throw new Error("Configure STAGING_DATABASE_URL para este teste isolado.");
  const schema="smoke_guided_studio_"+Date.now();
  const admin=new Pool({connectionString:staging,max:1});
  let pool:Pool|undefined;
  let created=false;
  try {
    await admin.query('CREATE SCHEMA "'+schema+'"');created=true;
    const url=new URL(staging);url.searchParams.set("options","-c search_path="+schema);
    process.env.DATABASE_URL=url.toString();
    process.env.OPENAI_API_KEY="";
    process.env.ADMIN_NAME="";process.env.ADMIN_EMAIL="";process.env.ADMIN_PASSWORD="";
    process.env.JWT_SECRET="isolated-studio-test-secret-at-least-32";
    const db=await import("../db/connection.js");pool=db.pool;
    const {migrate}=await import("../db/migrate.js");
    try{await migrate();}catch(error){console.log("Migrações aplicadas no teste:",(await db.all<{id:string}>("SELECT id FROM schema_migrations ORDER BY id")).map(item=>item.id).join(", "));throw error;}
    await db.validateTenantRole();
    const clients=await import("../services/clientService.js");
    const organizations=await import("../services/organizationService.js");
    const auth=await import("../services/authService.js");
    const {buildClientPromptContext}=await import("../services/clientPromptContextService.js");
    const user=Number((await db.run("INSERT INTO users(name,email,password_hash,role,active) VALUES('Operador','studio@test.invalid','fixture','user',TRUE)")).lastInsertRowid);
    const company=await organizations.createOrganization(user,"Empresa teste","company");
    const agency=await organizations.createOrganization(user,"Agência teste","agency");
    let companyBrand=0,agencyBrand=0;
    await db.runWithOrganizationContext(company.id,async()=>{
      const result=await Promise.allSettled([clients.createClient({name:"Minha marca"}),clients.createClient({name:"Outra marca simultânea"})]);
      assert.equal(result.filter(item=>item.status==="fulfilled").length,1);
      assert.equal(result.filter(item=>item.status==="rejected").length,1);
      const rows=await clients.listClients();assert.equal(rows.length,1);companyBrand=Number(rows[0].id);
      const updated=await clients.updateClient(companyBrand,{contact_phone:"+55 19 99999-9999",instagram_handle:"minhamarca",address:"Rua Principal, 10",content_language:"English (US)"});
      assert.equal(updated!.instagram_handle,"minhamarca");
      assert.equal(updated!.address,"Rua Principal, 10");
      const context=await buildClientPromptContext(companyBrand);
      assert.equal(context.contato_publico!.instagram,"@minhamarca");
      assert.equal(context.contato_publico!.telefone,"+55 19 99999-9999");
    });
    await db.runWithOrganizationContext(agency.id,async()=>{
      agencyBrand=Number((await clients.createClient({name:"Marca A"}))!.id);
      await clients.createClient({name:"Marca B"});
      await assert.rejects(()=>organizations.updateAccountType(agency.id,"company"),/várias marcas/);
      assert.equal((await clients.listClients()).length,2);
      assert.equal(await clients.getClient(companyBrand),null);
      assert.equal((await db.get<{account_type:string}>("SELECT account_type FROM organizations WHERE id=?",[agency.id]))!.account_type,"agency");
    });
    await db.runWithOrganizationContext(company.id,async()=>{
      assert.equal(await clients.getClient(agencyBrand),null);
      await organizations.updateAccountType(company.id,"agency");
      await clients.createClient({name:"Marca adicional autorizada"});
      assert.equal((await clients.listClients()).length,2);
    });
    const session=await auth.switchOrganization(user,company.id);
    assert.equal(session.user.organization.accountType,"agency");
    assert.equal(session.user.organizationRole,"owner");
    assert.equal((await auth.authenticateToken(session.token)).organization.accountType,"agency");
    console.log("PASS: migrations, contacts persisted, prompt context, simultaneous company creation limit, agency brands, safe mode change, unchanged roles and tenant isolation.");
  } finally {
    await pool?.end();
    if(created) {
      // Only the exact disposable schema created in this run may be removed.
      if(!/^smoke_guided_studio_\d+$/.test(schema))throw new Error("Unexpected temporary schema.");
      await admin.query('DROP SCHEMA "'+schema+'" CASCADE');
      console.log("Área temporária de teste removida. Cadastros existentes preservados.");
    }
    await admin.end();
  }
}
main().catch(error=>{console.error(error instanceof Error?error.stack:"Teste falhou");process.exitCode=1;});
