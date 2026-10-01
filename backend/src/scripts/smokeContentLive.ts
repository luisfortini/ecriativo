import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Pool } from "pg";
import dotenv from "dotenv";
import sharp from "sharp";
dotenv.config();
dotenv.config({path:"backend/.env"});

// Opt-in: este teste faz uma pesquisa web, uma redação e uma imagem pagas.
async function main() {
  if(process.env.CONFIRM_LIVE_CONTENT_TEST!=="yes")throw new Error("Defina CONFIRM_LIVE_CONTENT_TEST=yes para autorizar as três chamadas reais.");
  const url=process.env.STAGING_DATABASE_URL;
  if(!url || !process.env.OPENAI_API_KEY)throw new Error("Configure banco de testes e chave de IA.");
  const schema=`smoke_content_live_${Date.now()}`;
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),"ediretor-content-live-"));
  const admin=new Pool({connectionString:url,connectionTimeoutMillis:10000,max:1});
  let pool:Pool|undefined;
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    const isolated=new URL(url);isolated.searchParams.set("options",`-c search_path=${schema}`);
    process.env.DATABASE_URL=isolated.toString();process.env.UPLOAD_FILES_DIR=temp;process.env.GENERATED_FILES_DIR=temp;
    process.env.ADMIN_NAME="";process.env.ADMIN_EMAIL="";process.env.ADMIN_PASSWORD="";
    const db=await import("../db/connection.js");pool=db.pool;
    const {migrate}=await import("../db/migrate.js");await migrate();
    const {createClient}=await import("../services/clientService.js");
    const library=await import("../services/visualLibraryService.js");
    const ai=await import("../services/editorialAiService.js");
    const {generateImage}=await import("../services/openaiService.js");
    const calendar=await import("../services/editorialCalendar.js");
    const org=Number((await db.get<{id:number}>("SELECT id FROM organizations ORDER BY id LIMIT 1"))!.id);
    await db.runWithOrganizationContext(org,async()=>{
      const client=await createClient({name:"Marca Fictícia de Teste",segment:"Papelaria",country:"Brasil",state:"SP",city:"Campinas",time_zone:"America/Sao_Paulo",business_description:"Marca fictícia usada exclusivamente para validar o software. Vende cadernos simples."});
      assert.ok(client);
      const id=Number(client.id);
      const subject=await library.saveSubject(id,null,{kind:"product",name:"Caderno de teste",description:"Caderno azul com faixa laranja sem texto",preservation_notes:"Capa azul, faixa vertical laranja à esquerda, formato retangular.",approved:true,allow_social:true,allow_ads:true});
      const fixture=path.join(temp,"fixture.png");
      await sharp(Buffer.from('<svg width="512" height="512"><rect width="512" height="512" fill="white"/><rect x="130" y="55" width="270" height="400" rx="10" fill="#1740a0"/><rect x="130" y="55" width="25" height="400" fill="#ef7923"/></svg>')).png().toFile(fixture);
      await library.addPhoto(id,subject.id,fixture,"Produto inteiramente fictício de teste");
      const week=calendar.weekStart(calendar.localDate(new Date(),"America/Sao_Paulo"));
      const evidence=await ai.researchEditorial(client,week,calendar.addDays(week,6));
      console.log(JSON.stringify({stage:"research",citedItems:evidence.length}));
      const content=await ai.writeSocialContent(client,"Dica educativa de organização de estudos com um caderno azul. Não inventar características adicionais.","post",[]);
      assert.equal(content.image_prompts.length,1);assert.ok(content.caption.length);
      console.log(JSON.stringify({stage:"copy",valid:true}));
      const refs=await library.resolveVisuals(id,library.visualSelectionSchema.parse({products:"auto"}),"social");
      const image=await generateImage(content.image_prompts[0],"4:5",{clientId:id},{references:refs,mode:"reference",no_people:true});
      assert.ok(image.imagePath);
      const metadata=await sharp(image.imagePath!).metadata();assert.equal(metadata.width,1080);assert.equal(metadata.height,1350);
      console.log(JSON.stringify({stage:"reference_image",width:metadata.width,height:metadata.height,status:"ok"}));
    });
  } finally {
    if(pool)await pool.end();
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.end();
    await fs.rm(temp,{recursive:true,force:true});
  }
}
void main().catch(error=>{console.error(error instanceof Error?error.message:"Falha no teste real");process.exitCode=1;});
