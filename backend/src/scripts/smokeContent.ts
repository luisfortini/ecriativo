import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Pool } from "pg";
import dotenv from "dotenv";
import sharp from "sharp";
import express from "express";
import jwt from "jsonwebtoken";
dotenv.config();
dotenv.config({path:"backend/.env"});

async function main() {
  const url=process.env.STAGING_DATABASE_URL;
  if(!url)throw new Error("Configure STAGING_DATABASE_URL.");
  const schema=`smoke_content_${Date.now()}`;
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),"ediretor-content-"));
  const admin=new Pool({connectionString:url,max:1});
  let pool:Pool|undefined;
  let server:ReturnType<ReturnType<typeof express>["listen"]>|undefined;
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    const isolated=new URL(url);isolated.searchParams.set("options",`-c search_path=${schema}`);
    process.env.DATABASE_URL=isolated.toString();process.env.UPLOAD_FILES_DIR=temp;process.env.GENERATED_FILES_DIR=temp;
    process.env.OPENAI_API_KEY="fake-content-smoke-no-live-access";process.env.JWT_SECRET="content-smoke-secret-at-least-32-characters";
    process.env.ADMIN_NAME="";process.env.ADMIN_EMAIL="";process.env.ADMIN_PASSWORD="";
    const db=await import("../db/connection.js");pool=db.pool;
    const {migrate}=await import("../db/migrate.js");await migrate();await db.validateTenantRole();
    console.log("Estrutura temporária e isolamento validados.");
    const library=await import("../services/visualLibraryService.js");
    const storage=await import("../services/mediaStorageService.js");
    const corrections=await import("../services/editorialCorrectionService.js");
    const editorial=await import("../services/editorialService.js");
    const calendar=await import("../services/editorialCalendar.js");
    const clients=await import("../services/clientService.js");
    const orgA=Number((await db.get<{id:number}>("SELECT id FROM organizations ORDER BY id LIMIT 1"))!.id);
    const orgB=Number((await db.run("INSERT INTO organizations(name,slug) VALUES('Segunda empresa','segunda')")).lastInsertRowid);
    let clientId=0,otherClientId=0,subjectId=0,planId=0,photo="",contentId=0;
    const today=calendar.localDate(new Date(),"America/Sao_Paulo");
    const selection=library.visualSelectionSchema.parse({products:"auto",mode:"composition"});
    await db.runWithOrganizationContext(orgA,async()=>{
      const client=await clients.createClient({name:"Marca teste",country:"Brasil",state:"SP",city:"Campinas",anniversary_date:today.slice(5),time_zone:"America/Sao_Paulo",founding_year:"2010"});
      clientId=Number(client!.id);otherClientId=Number((await clients.createClient({name:"Outro cliente"}))!.id);
      assert.equal(client!.city,"Campinas");
      subjectId=(await library.saveSubject(clientId,null,{kind:"product",name:"Produto real",approved:true,allow_ads:true,allow_social:true})).id;
      const fixture=path.join(temp,"fixture.png");await sharp({create:{width:512,height:512,channels:4,background:"#ee9922"}}).png().toFile(fixture);
      await library.addPhoto(clientId,subjectId,fixture,"Frente");
      const resolved=await library.resolveVisuals(clientId,selection,"social");assert.equal(resolved.length,1);photo=resolved[0].filename;
      await assert.rejects(()=>library.resolveVisuals(otherClientId,library.visualSelectionSchema.parse({products:"manual",product_ids:[subjectId]}),"ads"));
      planId=(await editorial.saveEditorialPlan({client_id:clientId,name:"Semanal",active:true,automatic:false,posts_per_week:2,pillars:["Educação","Comunidade"],formats:["post"],weekly_image_limit:2,visual_selection:selection})).id;
      let searches=0;
      const research=async()=>{searches++;return [];};
      const [one,two]=await Promise.all([editorial.createEditorialBatch(planId,undefined,research),editorial.createEditorialBatch(planId,undefined,research)]);
      assert.equal(one!.id,two!.id);assert.equal(searches,1);
      const list=await editorial.getEditorialCalendar(planId);assert.equal(list.contents.length,2);
      assert.ok(list.contents.some(c=>String(c.topic).includes("Aniversário")));
      contentId=Number(list.contents[0].id);await editorial.contentAction(contentId,"generate");
    });
    console.log("Biblioteca, aniversário e planejamento concorrente validados.");
    await db.runWithOrganizationContext(orgB,async()=>{
      assert.equal((await db.all("SELECT id FROM visual_subjects")).length,0);
      assert.equal((await db.all("SELECT id FROM social_contents")).length,0);
      await assert.rejects(()=>editorial.getEditorialCalendar(planId));
      await assert.rejects(()=>library.listSubjects(clientId));
      await assert.rejects(()=>db.run("INSERT INTO visual_photos(client_id,subject_id,filename) VALUES(?,?,?)",[clientId,subjectId,"invalid.png"]));
    });
    const {requireAuth}=await import("../middleware/authMiddleware.js");
    const {requireOrganization}=await import("../middleware/organizationMiddleware.js");
    const {contentRoutes}=await import("../routes/contentRoutes.js");
    const {uploadedMediaController,generatedMediaController}=await import("../controllers/mediaController.js");
    const {asyncHandler}=await import("../utils/asyncHandler.js");
    const {errorHandler}=await import("../utils/errors.js");
    const userId=Number((await db.run("INSERT INTO users(name,email,password_hash,role,active) VALUES('Membro','member@test.invalid','unused','user',TRUE)")).lastInsertRowid);
    await db.run("INSERT INTO organization_members(organization_id,user_id,role,status) VALUES(?,?,'member','active')",[orgA,userId]);
    const token=jwt.sign({organizationId:orgA},process.env.JWT_SECRET,{subject:String(userId),issuer:"e-criativo",audience:"e-criativo-web",expiresIn:600});
    const app=express();app.use(express.json());app.use("/api",requireAuth,requireOrganization,contentRoutes);app.get("/uploads/:filename",requireAuth,requireOrganization,asyncHandler(uploadedMediaController));app.get("/generated/:filename",requireAuth,requireOrganization,asyncHandler(generatedMediaController));app.use(errorHandler);
    server=app.listen(0,"127.0.0.1");await new Promise<void>(resolve=>server!.once("listening",resolve));
    const address=server.address() as {port:number};const base=`http://127.0.0.1:${address.port}`;
    assert.equal((await fetch(`${base}/api/social-media/plans`,{headers:{Authorization:`Bearer ${token}`}})).status,403);
    assert.equal((await fetch(`${base}/uploads/${photo}`)).status,401);
    assert.equal((await fetch(`${base}/uploads/${photo}`,{headers:{Authorization:`Bearer ${token}`}})).status,200);
    await fs.unlink(path.join(temp,photo));
    assert.equal((await fetch(`${base}/uploads/${photo}`,{headers:{Authorization:`Bearer ${token}`}})).status,200);
    console.log("Acesso HTTP e mídia privada validados.");
    let generations=0;
    await editorial.processEditorialQueue({research:async()=>[],write:async()=>({caption:"Legenda teste",alt_text:"Produto",image_prompts:["Produto em fundo limpo"]}),image:async()=>{generations++;return {imagePath:path.join(temp,"result.png"),imageUrl:"https://test.invalid/generated/result.png",aiUsageLogId:1};}});
    await editorial.processEditorialQueue({research:async()=>[],write:async()=>{throw new Error("Não deveria repetir");},image:async()=>{throw new Error("Não deveria repetir");}});
    assert.equal(generations,1);
    const whatsapp=await import("../services/whatsappNotificationService.js");
    const testImage=await sharp({create:{width:16,height:16,channels:3,background:"#114488"}}).png().toBuffer();
    await db.runWithOrganizationContext(orgA,async()=>{
      await storage.persistMedia("generated","result.png",testImage);
      await whatsapp.updateGlobalWhatsappSettings({whatsapp_delivery_enabled:true,evolution_base_url:"https://whatsapp.test.invalid",evolution_api_key:"fake",evolution_instance_name:"test"});
      await whatsapp.updateClientWhatsappSettings(clientId,{whatsapp_group:"5511999999999@g.us"});
    });
    const originalFetch=globalThis.fetch;
    const sentMedia:Array<{number:string;media:string;caption:string}>=[];
    globalThis.fetch=(async(input:RequestInfo|URL,init?:RequestInit)=>{
      if(String(input).startsWith("https://whatsapp.test.invalid/")){
        const body=JSON.parse(String(init?.body));sentMedia.push(body);
        return new Response(JSON.stringify({id:"fake-message"}),{status:200,headers:{"content-type":"application/json"}});
      }
      return originalFetch(input,init);
    }) as typeof fetch;
    try {
      await db.runWithOrganizationContext(orgB,()=>assert.rejects(()=>whatsapp.sendSocialContentWhatsapp(contentId),/Conteúdo não encontrado/));
      const sent=await db.runWithOrganizationContext(orgA,()=>whatsapp.sendSocialContentWhatsapp(contentId));
      assert.deepEqual({sent:sent.sent,total:sent.total},{sent:1,total:1});
      assert.equal(sentMedia[0].number,"5511999999999@g.us");
      assert.equal(sentMedia[0].media,testImage.toString("base64"));
      assert.match(sentMedia[0].caption,/Legenda teste/);
      const logged=await db.runWithOrganizationContext(orgA,()=>db.get<{status:string}>("SELECT status FROM notification_logs WHERE notification_type='social_content' ORDER BY id DESC LIMIT 1"));
      assert.equal(logged?.status,"sent");
    } finally {globalThis.fetch=originalFetch;}
    await db.runWithOrganizationContext(orgA,async()=>{
      const item=await db.get<{status:string}>("SELECT status FROM social_contents WHERE id=?",[contentId]);assert.equal(item!.status,"review");
      await editorial.contentAction(contentId,"approve");
      await assert.rejects(()=>editorial.contentAction(contentId,"generate"));
      await editorial.contentAction(contentId,"reject","Ajustar a composição");
      await editorial.contentAction(contentId,"regenerate","Usar fundo claro");
      const version=await db.get<{revisions:unknown[];status:string}>("SELECT revisions,status FROM social_contents WHERE id=?",[contentId]);
      assert.equal(version!.revisions.length,1);assert.equal(version!.status,"pending");
      const refs=await library.resolveVisuals(clientId,selection,"social");
      await library.saveSubject(clientId,subjectId,{kind:"product",name:"Produto real",approved:true,allow_ads:true,allow_social:true,active:false});
      await assert.rejects(()=>library.resolveVisuals(clientId,selection,"social"));
      await assert.rejects(()=>library.validateVisualReferences(clientId,refs,"social"));
    });
    let carouselId=0,correctionPlan=0,untouchedId=0;
    const oldImages=[0,1,2].map(i=>({url:`https://old-host.invalid/generated/old-slide-${i}.png`,filename:`old-slide-${i}.png`}));
    await db.runWithOrganizationContext(orgA,async()=>{
      await db.run("UPDATE social_contents SET status='cancelled' WHERE id=?",[contentId]);
      correctionPlan=(await editorial.saveEditorialPlan({client_id:clientId,name:"Correções",active:true,automatic:false,posts_per_week:2,pillars:["Educação"],formats:["carousel"],weekly_image_limit:10})).id;
      const batch=await editorial.createEditorialBatch(correctionPlan,undefined,async()=>[]);
      const items=await db.all<{id:number}>("SELECT id FROM social_contents WHERE batch_id=? ORDER BY position",[batch!.id]);
      carouselId=Number(items[0].id);untouchedId=Number(items[1].id);
      await db.run("UPDATE editorial_batches SET week_start=?,image_calls=3 WHERE id=?",[calendar.addDays(calendar.weekStart(today),-7),batch!.id]);
      await db.run("UPDATE social_contents SET status='failed',caption='Preservar legenda',alt_text='Descrição original',image_prompts=?::jsonb,images=?::jsonb WHERE id=?",[JSON.stringify(["Arte um","Arte dois","Arte três"]),JSON.stringify(oldImages),carouselId]);
      const bytes=await sharp({create:{width:256,height:256,channels:3,background:"#111188"}}).png().toBuffer();
      for(const image of oldImages)await storage.persistMedia("generated",image.filename,bytes);
      await assert.rejects(()=>corrections.requestEditorialCorrections(correctionPlan,{note:"Corrigir fundo",targets:[{content_id:carouselId,image_indexes:[1]},{content_id:99999999,image_indexes:[0]}]}));
      assert.equal((await db.get<{status:string}>("SELECT status FROM social_contents WHERE id=?",[carouselId]))!.status,"failed");
      await corrections.requestEditorialCorrections(correctionPlan,{note:"Fundo vermelho",targets:[{content_id:carouselId,image_indexes:[1]}]});
    });
    let correctionCalls=0;
    await editorial.processEditorialQueue({research:async()=>[],write:async()=>{throw new Error("A correção não deve refazer texto.");},image:async(prompt,_format,_metadata,visual)=>{
      assert.ok(prompt.includes("Fundo vermelho"));correctionCalls++;
      assert.equal(visual?.creative_filename,"old-slide-1.png");
      const bytes=await sharp({create:{width:256,height:256,channels:3,background:"#aa1111"}}).png().toBuffer();
      await storage.persistMedia("generated","corrected-slide.png",bytes);
      return {imagePath:path.join(temp,"corrected-slide.png"),imageUrl:"https://new-host.invalid/generated/corrected-slide.png",aiUsageLogId:1};
    }});
    assert.equal(correctionCalls,1);
    await db.runWithOrganizationContext(orgA,async()=>{
      const result=await db.get<{caption:string;alt_text:string;images:typeof oldImages;status:string;revisions:unknown[]}>("SELECT * FROM social_contents WHERE id=?",[carouselId]);
      assert.equal(result!.status,"review");assert.equal(result!.caption,"Preservar legenda");assert.equal(result!.alt_text,"Descrição original");
      assert.deepEqual(result!.images[0],oldImages[0]);assert.deepEqual(result!.images[2],oldImages[2]);assert.equal(result!.images[1].filename,"corrected-slide.png");assert.equal(result!.revisions.length,1);
      assert.equal((await db.get<{status:string}>("SELECT status FROM social_contents WHERE id=?",[untouchedId]))!.status,"draft");
      const restored=await storage.ensureMediaPath("generated","corrected-slide.png");assert.ok((await fs.stat(restored)).size);
      await fs.unlink(restored);
    });
    assert.equal((await fetch(`${base}/generated/corrected-slide.png`,{headers:{Authorization:`Bearer ${token}`}})).status,200);
    assert.equal((await fetch(`${base}/generated/old-slide-1.png`,{headers:{Authorization:`Bearer ${token}`}})).status,200);
    await db.runWithOrganizationContext(orgA,()=>corrections.requestEditorialCorrections(correctionPlan,{note:"Ajuste parcial",targets:[{content_id:carouselId,image_indexes:[0,2]}]}));
    let partialCalls=0;
    await editorial.processEditorialQueue({research:async()=>[],write:async()=>{throw new Error("Não deve refazer texto");},image:async()=>{
      partialCalls++;
      if(partialCalls===2)throw new Error("Falha simulada na segunda correção.");
      await storage.persistMedia("generated","partial-slide.png",Buffer.from("fixture"));
      return {imagePath:path.join(temp,"partial-slide.png"),imageUrl:"https://test.invalid/generated/partial-slide.png",aiUsageLogId:1};
    }});
    await db.runWithOrganizationContext(orgA,async()=>{
      const item=await db.get<{status:string;correction_request:{completed:number[]}}>("SELECT status,correction_request FROM social_contents WHERE id=?",[carouselId]);
      assert.equal(item!.status,"failed");assert.deepEqual(item!.correction_request.completed,[0]);
      await editorial.contentAction(carouselId,"generate");
    });
    let retryCalls=0;
    await editorial.processEditorialQueue({research:async()=>[],write:async()=>{throw new Error("Não deve refazer texto");},image:async(prompt)=>{
      retryCalls++;assert.ok(prompt.startsWith("Arte três"));
      await storage.persistMedia("generated","retried-slide.png",Buffer.from("fixture"));
      return {imagePath:path.join(temp,"retried-slide.png"),imageUrl:"https://test.invalid/generated/retried-slide.png",aiUsageLogId:1};
    }});
    assert.equal(partialCalls,2);assert.equal(retryCalls,1);
    await db.runWithOrganizationContext(orgA,async()=>{
      const item=await db.get<{status:string;images:typeof oldImages;caption:string}>("SELECT status,images,caption FROM social_contents WHERE id=?",[carouselId]);
      assert.equal(item!.status,"review");assert.equal(item!.images[0].filename,"partial-slide.png");
      assert.equal(item!.images[1].filename,"corrected-slide.png");assert.equal(item!.images[2].filename,"retried-slide.png");assert.equal(item!.caption,"Preservar legenda");
    });
    const carouselFetch=globalThis.fetch;
    const carouselMessages:string[]=[];
    globalThis.fetch=(async(input:RequestInfo|URL,init?:RequestInit)=>{
      if(String(input).startsWith("https://whatsapp.test.invalid/")){
        carouselMessages.push(JSON.parse(String(init?.body)).caption);
        return new Response(JSON.stringify({id:"fake-carousel"}),{status:200,headers:{"content-type":"application/json"}});
      }
      return carouselFetch(input,init);
    }) as typeof fetch;
    try {
      const sent=await db.runWithOrganizationContext(orgA,()=>whatsapp.sendSocialContentWhatsapp(carouselId));
      assert.equal(sent.sent,3);assert.equal(carouselMessages.length,3);
      assert.match(carouselMessages[0],/Preservar legenda/);
      assert.match(carouselMessages[2],/Arte 3 de 3/);
    } finally {globalThis.fetch=carouselFetch;}
    await db.runWithOrganizationContext(orgB,async()=>{
      await assert.rejects(()=>storage.readMedia("generated","corrected-slide.png"));
      await assert.rejects(()=>corrections.requestEditorialCorrections(correctionPlan,{note:"Tentativa externa",targets:[{content_id:carouselId,image_indexes:[1]}]}));
    });
    const legacyName="legacy-slide.png";
    const legacyBytes=await sharp({create:{width:256,height:256,channels:3,background:"#114488"}}).png().toBuffer();
    await fs.writeFile(path.join(temp,legacyName),legacyBytes);
    await db.runWithOrganizationContext(orgA,()=>db.run("UPDATE social_contents SET images=?::jsonb WHERE id=?",[JSON.stringify([{url:`https://old-host.invalid/generated/${legacyName}`,filename:legacyName}]),untouchedId]));
    const migrated=await storage.backfillPersistentMedia();assert.ok(migrated.saved>=1);
    await fs.unlink(path.join(temp,legacyName));
    assert.equal((await fetch(`${base}/generated/${legacyName}`,{headers:{Authorization:`Bearer ${token}`}})).status,200);
    const {Images}=await import("openai/resources/images");
    const originalEdit=Images.prototype.edit;
    let editCalls=0;
    Images.prototype.edit=((async(input:{image:Array<{arrayBuffer:()=>Promise<ArrayBuffer>}>;prompt:string})=>{
      editCalls++;assert.equal(input.image.length,1);assert.ok(input.prompt.includes("primeira imagem"));
      const inputBytes=Buffer.from(await input.image[0].arrayBuffer());assert.equal((await sharp(inputBytes).metadata()).width,256);
      return {data:[{b64_json:legacyBytes.toString("base64")}]};
    }) as unknown) as typeof originalEdit;
    try {
      await db.runWithOrganizationContext(orgA,async()=>{
        const {generateImage}=await import("../services/openaiService.js");
        const result=await generateImage("Corrigir somente o fundo","4:5",{clientId},{references:[],mode:"reference",no_people:true,creative_filename:legacyName});
        assert.ok(result.imagePath);await fs.unlink(result.imagePath!);
        assert.equal((await storage.readMedia("generated",path.basename(result.imagePath!))).content_type,"image/png");
      });
      assert.equal(editCalls,1);
    } finally {Images.prototype.edit=originalEdit;}
    console.log("Correção seletiva, legenda preservada, semana antiga, histórico e mídia sem disco validados.");
    console.log(JSON.stringify({status:"ok",checks:["localização e aniversário","biblioteca e imagens privadas","isolamento empresa e cliente","revogação de material","lote semanal idempotente","produção e aprovação","envio WhatsApp simulado","permissões HTTP"]}));
  } finally {
    if(server)await new Promise<void>(resolve=>server!.close(()=>resolve()));
    if(pool)await pool.end();
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.end();
    await fs.rm(temp,{recursive:true,force:true});
  }
}
void main().catch(error=>{console.error(error instanceof Error?error.message:error);process.exitCode=1;});
