import assert from "node:assert/strict";
import { test } from "node:test";
import { sealSecret,openSecret,validatePublishable,isTimeZone,publishingSettings,type PublicationSnapshot } from "../services/socialPublishingSecurity.js";
import { prepareMetaPublication,publishMetaPublication,metaPermalink } from "../services/metaPublishingService.js";
import express from "express";
import { socialPublishingRoutes,socialPublishingPublicRoutes } from "../routes/socialPublishingRoutes.js";
import { errorHandler } from "../utils/errors.js";

process.env.SOCIAL_TOKEN_ENCRYPTION_KEY="ab".repeat(32);
process.env.META_GRAPH_VERSION="v25.0";
process.env.SOCIAL_PUBLISHING_ENABLED="false";
const snapshot:PublicationSnapshot={caption:"Legenda aprovada",alt_text:"Produto",format:"post",images:[{url:"https://test.invalid/generated/1.png"}]};
test("tokens protegidos e adulteração rejeitada; publicação real desligada",()=>{
  const encrypted=sealSecret("token-super-secreto");
  assert.ok(!encrypted.includes("token-super-secreto"));assert.equal(openSecret(encrypted),"token-super-secreto");
  const bytes=Buffer.from(encrypted,"base64url");bytes[bytes.length-1]^=1;
  assert.throws(()=>openSecret(bytes.toString("base64url")));assert.equal(publishingSettings().enabled,false);
  assert.notEqual(sealSecret("token"),sealSecret("token"));
});
test("aprovação, qualidade, formatos e limites de legenda obrigatórios",()=>{
  validatePublishable({...snapshot,status:"approved"},"instagram");
  assert.throws(()=>validatePublishable({...snapshot,status:"review"},"instagram"));
  assert.throws(()=>validatePublishable({...snapshot,status:"approved",format:"story"},"instagram"));
  assert.throws(()=>validatePublishable({...snapshot,status:"approved",format:"carousel"},"instagram"));
  assert.throws(()=>validatePublishable({...snapshot,status:"approved",images:[{url:"ok",quality_issues:["Idioma errado"]}]},"instagram"));
  assert.throws(()=>validatePublishable({...snapshot,status:"approved",caption:"x".repeat(2201)},"instagram"));
  assert.equal(isTimeZone("America/New_York"),true);assert.equal(isTimeZone("Fuso_inexistente"),false);
});
test("Instagram: três filhos ordenados, um carrossel e uma publicação final",async()=>{
  const calls:Array<{path:string;params:URLSearchParams}>=[];let id=100;
  const transport=(async(url:any,options:any)=>{
    const parsed=new URL(String(url));assert.equal(parsed.hostname,"graph.facebook.com");
    assert.equal(options.headers.Authorization,"Bearer fake");assert.equal(parsed.searchParams.has("access_token"),false);
    const params=new URLSearchParams(options.body||parsed.search);calls.push({path:parsed.pathname,params});
    return Response.json(options.method==="GET"?{status_code:"FINISHED"}:{id:String(++id)});
  }) as typeof fetch;
  const account={platform:"instagram",account_id:"123",token:"fake"};
  const carousel={...snapshot,format:"carousel",images:[...snapshot.images,...snapshot.images,...snapshot.images]};
  const prepared=await prepareMetaPublication(account,carousel,["https://media/1","https://media/2","https://media/3"],transport);
  assert.equal(calls.filter(c=>c.path.endsWith("media_publish")).length,0);
  const children=calls.filter(c=>c.params.get("is_carousel_item")==="true");assert.deepEqual(children.map(c=>c.params.get("image_url")),["https://media/1","https://media/2","https://media/3"]);
  assert.equal(calls.find(c=>c.params.get("media_type")==="CAROUSEL")?.params.get("children"),"101,102,103");
  await publishMetaPublication(account,carousel,prepared,transport);
  assert.equal(calls.filter(c=>c.path.endsWith("media_publish")).length,1);
});
test("Facebook: fotos não publicadas, seguidas de um único post com legenda",async()=>{
  const calls:Array<{path:string;params:URLSearchParams}>=[];let id=200;
  const transport=(async(url:any,options:any)=>{calls.push({path:new URL(String(url)).pathname,params:new URLSearchParams(options.body)});return Response.json({id:String(++id)});}) as typeof fetch;
  const account={platform:"facebook",account_id:"123",token:"fake"};
  const prepared=await prepareMetaPublication(account,snapshot,["https://media/1","https://media/2"],transport);
  assert.equal(calls.length,2);assert.ok(calls.every(c=>c.params.get("published")==="false"));
  assert.deepEqual(JSON.parse(prepared.attached_media),[{media_fbid:"201"},{media_fbid:"202"}]);
  await publishMetaPublication(account,snapshot,prepared,transport);
  assert.equal(calls[2].path,"/v25.0/123/feed");assert.equal(calls[2].params.get("message"),snapshot.caption);
});
test("falhas da Meta não expõem credenciais nem repetem publicação",async()=>{
  let calls=0;
  const transport=(async()=>{calls++;return Response.json({error:{code:190,message:"token-secreto"}},{status:400});}) as typeof fetch;
  await assert.rejects(()=>publishMetaPublication({platform:"instagram",account_id:"123",token:"token-secreto"},snapshot,{creation_id:"1"},transport),error=>error instanceof Error&&!error.message.includes("token-secreto"));
  assert.equal(calls,1);
  const unsafe=(async()=>Response.json({permalink:"https://malicious.invalid/"})) as typeof fetch;
  assert.equal(await metaPermalink({platform:"instagram",account_id:"123",token:"fake"},"1",unsafe),null);
});
test("rotas de agendamento exigem administrador sem bloquear outras áreas da API",async()=>{
  const app=express();app.use("/api",socialPublishingPublicRoutes);
  // A member identity fixture, not a substitute for production authentication.
  app.use((req,_res,next)=>{req.user={organizationRole:"member"} as typeof req.user;next();});
  app.use("/api",socialPublishingRoutes);app.get("/api/unrelated",(_req,res)=>res.json({ok:true}));app.use(errorHandler);
  const server=app.listen(0,"127.0.0.1");await new Promise<void>(resolve=>server.once("listening",resolve));
  const address=server.address() as {port:number};const base=`http://127.0.0.1:${address.port}`;
  try {
    assert.equal((await fetch(`${base}/api/unrelated`)).status,200);
    assert.equal((await fetch(`${base}/api/social-media/clients/1/publishing`)).status,403);
    assert.equal((await fetch(`${base}/api/social-publishing/media/${"x".repeat(30)}.jpg`)).status,403);
    assert.equal((await fetch(`${base}/api/social-publishing/meta/callback?state=${"x".repeat(30)}&code=fake`)).status,403);
  } finally {await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
});
