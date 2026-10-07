import assert from "node:assert/strict";
import { Pool } from "pg";
import dotenv from "dotenv";
import sharp from "sharp";
dotenv.config();dotenv.config({path:"backend/.env"});

async function main() {
  const staging=process.env.STAGING_DATABASE_URL;if(!staging)throw new Error("Configure STAGING_DATABASE_URL para este teste isolado.");
  const schema=`smoke_social_publishing_${Date.now()}`;
  const admin=new Pool({connectionString:staging,max:1});
  let pool:Pool|undefined;const originalFetch=globalThis.fetch;
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    const url=new URL(staging);url.searchParams.set("options",`-c search_path=${schema}`);
    process.env.DATABASE_URL=url.toString();process.env.SOCIAL_TOKEN_ENCRYPTION_KEY="ab".repeat(32);
    process.env.SOCIAL_PUBLISHING_ENABLED="false";process.env.META_GRAPH_VERSION="v25.0";
    process.env.META_APP_ID="111";process.env.META_APP_SECRET="fake-secret";
    process.env.META_REDIRECT_URI="https://test.invalid/api/social-publishing/meta/callback";
    process.env.PUBLIC_BASE_URL="https://test.invalid";
    // No AI, no real Meta, no real tokens. Only this disposable schema is used.
    const db=await import("../db/connection.js");pool=db.pool;
    await db.exec(`
      CREATE FUNCTION app_current_organization_id() RETURNS BIGINT LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('app.organization_id',true),'')::bigint $$;
      CREATE TABLE organizations(id BIGSERIAL PRIMARY KEY,status TEXT NOT NULL DEFAULT 'active');
      CREATE TABLE users(id BIGINT PRIMARY KEY,active BOOLEAN NOT NULL DEFAULT TRUE);
      INSERT INTO users(id) VALUES(10);
      CREATE TABLE clients(id BIGSERIAL PRIMARY KEY,organization_id BIGINT NOT NULL DEFAULT app_current_organization_id(),name TEXT,time_zone TEXT DEFAULT 'America/Sao_Paulo',UNIQUE(organization_id,id));
      CREATE TABLE organization_members(id BIGSERIAL PRIMARY KEY,organization_id BIGINT NOT NULL DEFAULT app_current_organization_id(),user_id BIGINT,role TEXT,status TEXT);
      CREATE TABLE social_contents(id BIGSERIAL PRIMARY KEY,organization_id BIGINT NOT NULL DEFAULT app_current_organization_id(),client_id BIGINT NOT NULL,caption TEXT NOT NULL,alt_text TEXT NOT NULL,images JSONB NOT NULL,status TEXT NOT NULL,format TEXT NOT NULL);
      CREATE TABLE media_files(id BIGSERIAL PRIMARY KEY,organization_id BIGINT NOT NULL DEFAULT app_current_organization_id(),kind TEXT,filename TEXT,content_type TEXT,data BYTEA,UNIQUE(organization_id,kind,filename));
      DO $$ DECLARE tbl TEXT; BEGIN FOREACH tbl IN ARRAY ARRAY['clients','organization_members','social_contents','media_files'] LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',tbl);EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',tbl);
        EXECUTE format('CREATE POLICY organization_isolation ON %I USING (organization_id=app_current_organization_id()) WITH CHECK (organization_id=app_current_organization_id())',tbl);
      END LOOP; END $$;
    `);
    const migration=await import("../db/socialPublishingMigration.js");await db.exec(migration.socialPublishingMigration.up);
    await db.exec(`GRANT USAGE ON SCHEMA "${schema}" TO ecriativo_tenant; GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA "${schema}" TO ecriativo_tenant; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA "${schema}" TO ecriativo_tenant;`);
    const publishing=await import("../services/socialPublishingService.js");
    const security=await import("../services/socialPublishingSecurity.js");
    const oauth=await import("../services/socialOAuthService.js");
    const storage=await import("../services/mediaStorageService.js");
    const orgA=Number((await db.run("INSERT INTO organizations(status) VALUES('active')")).lastInsertRowid);
    const orgB=Number((await db.run("INSERT INTO organizations(status) VALUES('active')")).lastInsertRowid);
    let clientId=0,otherClient=0,contentId=0,ig=0,fb=0,igJob=0,fbJob=0,oauthState="";
    await db.runWithOrganizationContext(orgA,async()=>{
      clientId=Number((await db.run("INSERT INTO clients(name) VALUES('Cliente A')")).lastInsertRowid);
      otherClient=Number((await db.run("INSERT INTO clients(name) VALUES('Outro cliente')")).lastInsertRowid);
      await db.run("INSERT INTO organization_members(user_id,role,status) VALUES(10,'owner','active')");
      const image=await sharp({create:{width:1080,height:1350,channels:3,background:"#205b38"}}).png().toBuffer();
      await storage.persistMedia("generated","social-test.png",image);
      contentId=Number((await db.run("INSERT INTO social_contents(client_id,caption,alt_text,images,status,format) VALUES(?,?,?,?::jsonb,'review','post')",[clientId,"Legenda aprovada","Descrição",JSON.stringify([{url:"https://test.invalid/generated/social-test.png"}])])).lastInsertRowid);
      for(const platform of ["instagram","facebook"]) {
        const account=Number((await db.run("INSERT INTO social_accounts(client_id,platform,account_id,name,token_encrypted,active) VALUES(?,?,?,?,?,TRUE)",[clientId,platform,platform==="instagram"?"123":"456",platform,security.sealSecret("fake-token")])).lastInsertRowid);
        if(platform==="instagram")ig=account;else fb=account;
      }
      const tomorrow=new Date(Date.now()+86400000).toISOString().slice(0,10)+"T10:00";
      const input={account_id:ig,local_datetime:tomorrow,time_zone:"America/Sao_Paulo"};
      await assert.rejects(()=>publishing.scheduleSocialPublication(contentId,input),/Aprove/);
      await db.run("UPDATE social_contents SET status='approved' WHERE id=?",[contentId]);
      igJob=Number((await publishing.scheduleSocialPublication(contentId,input)).lastInsertRowid);
      fbJob=Number((await publishing.scheduleSocialPublication(contentId,{...input,account_id:fb,time_zone:"America/New_York"})).lastInsertRowid);
      const jobs=await db.all<{scheduled_at:Date}>("SELECT scheduled_at FROM social_publications ORDER BY id");assert.notEqual(jobs[0].scheduled_at.toISOString(),jobs[1].scheduled_at.toISOString());
      await assert.rejects(()=>publishing.scheduleSocialPublication(contentId,input),/já está/);
      await assert.rejects(()=>publishing.assertContentNotScheduled(contentId),/Cancele/);
      await assert.rejects(()=>db.run("UPDATE social_contents SET caption='Alterada' WHERE id=?",[contentId]),/Cancele/);
      const overview=await publishing.publishingOverview(clientId);assert.ok(!JSON.stringify(overview).includes("token_encrypted"));
      const wrong=Number((await db.run("INSERT INTO social_accounts(client_id,platform,account_id,name,token_encrypted,active) VALUES(?,'instagram','999','Outra',?,TRUE)",[otherClient,security.sealSecret("fake")])).lastInsertRowid);
      await assert.rejects(()=>publishing.scheduleSocialPublication(contentId,{...input,account_id:wrong}),/deste cliente/);
      const connect=await oauth.startMetaConnection(clientId);oauthState=new URL(connect.url).searchParams.get("state")!;
      await db.run("UPDATE social_publications SET scheduled_at=CURRENT_TIMESTAMP-INTERVAL '1 second'");
    },10);
    await db.runWithOrganizationContext(orgB,async()=>{
      assert.equal((await db.all("SELECT * FROM social_accounts")).length,0);
      assert.equal((await db.all("SELECT * FROM social_publications")).length,0);
      await assert.rejects(()=>publishing.publishingOverview(clientId),/não encontrado/);
      await assert.rejects(()=>publishing.cancelSocialPublication(igJob),/não encontrado/);
      await assert.rejects(()=>db.run("INSERT INTO social_accounts(client_id,platform,account_id,name,token_encrypted) VALUES(?,'facebook','456','Intrusa','fake')",[clientId]));
    });
    console.log("Migração, RLS, aprovação, fuso, duplicação e proteção do conteúdo validados.");
    let finalPosts=0;let oauthCalls=0;
    globalThis.fetch=(async(input:any,options:any)=>{
      const url=new URL(String(input));assert.equal(url.hostname,"graph.facebook.com");
      if(url.pathname.endsWith("oauth/access_token")){oauthCalls++;return Response.json({access_token:"fake-user-token"});}
      if(url.pathname.endsWith("me/accounts"))return Response.json({data:[{id:"777",name:"Página autorizada",access_token:"fake-page-token",instagram_business_account:{id:"888",username:"instagram_cliente"}}]});
      const params=new URLSearchParams(options?.body||url.search);
      if(url.pathname.endsWith("media")||url.pathname.endsWith("photos")) {
        const signed=new URL(params.get("image_url")||params.get("url")!);
        const token=decodeURIComponent(signed.pathname.split("/").pop()!.replace(/\.jpg$/,""));
        const bytes=await publishing.readPublicationMedia(token);assert.equal((await sharp(bytes).metadata()).format,"jpeg");
        return Response.json({id:"1000"});
      }
      if(params.get("fields")==="status_code")return Response.json({status_code:"FINISHED"});
      if(url.pathname.endsWith("media_publish")){finalPosts++;return Response.json({id:"2000"});}
      if(url.pathname.endsWith("feed")){finalPosts++;throw new Error("Timeout simulado após envio");}
      if(params.get("fields")==="permalink")return Response.json({permalink:"https://www.instagram.com/p/test/"});
      throw new Error("Endpoint inesperado no teste");
    }) as typeof fetch;
    await publishing.processSocialPublications();assert.equal(finalPosts,0);
    process.env.SOCIAL_PUBLISHING_ENABLED="true";
    await publishing.processSocialPublications();await publishing.processSocialPublications();await publishing.processSocialPublications();
    assert.equal(finalPosts,2);
    await db.runWithOrganizationContext(orgA,async()=>{
      assert.equal((await db.get("SELECT status FROM social_publications WHERE id=?",[igJob]))?.status,"published");
      assert.equal((await db.get("SELECT status FROM social_publications WHERE id=?",[fbJob]))?.status,"uncertain");
      await assert.rejects(()=>publishing.cancelSocialPublication(fbJob));
      await assert.rejects(()=>publishing.reconcileSocialPublication(fbJob,{outcome:"not_published"}));
      await publishing.reconcileSocialPublication(fbJob,{checked_on_network:true,outcome:"not_published"});
      const date=new Date(Date.now()+86400000).toISOString().slice(0,10)+"T11:00";
      const next=Number((await publishing.scheduleSocialPublication(contentId,{account_id:fb,local_datetime:date,time_zone:"America/Sao_Paulo"})).lastInsertRowid);
      await publishing.setSocialAccount(fb,false);assert.equal((await db.get("SELECT status FROM social_publications WHERE id=?",[next]))?.status,"cancelled");
      await assert.rejects(()=>publishing.readPublicationMedia(security.sealSecret(JSON.stringify({org:orgA,id:igJob,index:0,expires:Date.now()-1}))),/expirado/);
    });
    const result=await oauth.finishMetaConnection(oauthState,"fake-code");assert.equal(result.count,2);assert.equal(oauthCalls,2);
    await assert.rejects(()=>oauth.finishMetaConnection(oauthState,"fake-code"),/já foi usada/);
    await db.runWithOrganizationContext(orgA,async()=>{
      const connected=await db.all<{active:boolean;token_encrypted:string}>("SELECT active,token_encrypted FROM social_accounts WHERE account_id IN ('777','888')");
      assert.equal(connected.length,2);assert.ok(connected.every(a=>!a.active&&a.token_encrypted!=="fake-page-token"));
    });
    console.log("Publicação simulada, JPEG privado, resultado incerto sem reenvio, cancelamento e OAuth de uso único validados.");
    console.log(JSON.stringify({status:"ok",real_publications:0}));
  } finally {
    globalThis.fetch=originalFetch;process.env.SOCIAL_PUBLISHING_ENABLED="false";
    await pool?.end();await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);await admin.end();
  }
}
void main().catch(error=>{console.error(error instanceof Error?error.message:"Falha no teste isolado.");process.exitCode=1;});
