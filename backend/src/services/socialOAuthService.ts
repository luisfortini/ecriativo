import { randomBytes } from "node:crypto";
import { get,run,transaction,runWithOrganizationContext } from "../db/connection.js";
import { getDatabaseRequestContext } from "../db/requestContext.js";
import { AppError } from "../utils/errors.js";
import { requireClient } from "./visualLibraryService.js";
import { metaRequest } from "./metaPublishingService.js";
import { hashState,openSecret,publishingSettings,sealSecret } from "./socialPublishingSecurity.js";

export async function startMetaConnection(clientId:number) {
  await requireClient(clientId);
  const settings=publishingSettings();
  if(!settings.appId||!settings.appSecret||!/^https:\/\//.test(settings.redirectUri)||!/^v\d+\.\d+$/.test(settings.version))throw new AppError("A integração Meta ainda não foi configurada no servidor. Consulte as instruções de implantação.",503);
  const context=getDatabaseRequestContext()!;
  const state=sealSecret(JSON.stringify({org:context.organizationId,user:context.userId,client:clientId,nonce:randomBytes(24).toString("hex"),expires:Date.now()+10*60000}));
  await run("DELETE FROM social_oauth_states WHERE expires_at<CURRENT_TIMESTAMP");
  await run("INSERT INTO social_oauth_states(client_id,state_hash,expires_at) VALUES(?,?,CURRENT_TIMESTAMP+INTERVAL '10 minutes')",[clientId,hashState(state)]);
  const url=new URL(`https://www.facebook.com/${settings.version}/dialog/oauth`);
  url.search=new URLSearchParams({client_id:settings.appId,redirect_uri:settings.redirectUri,state,response_type:"code",scope:"pages_show_list,pages_read_engagement,pages_manage_posts,instagram_basic,instagram_content_publish"}).toString();
  return {url:url.toString()};
}
async function exchangeToken(params:Record<string,string>) {
  const settings=publishingSettings();
  const url=new URL(`https://graph.facebook.com/${settings.version}/oauth/access_token`);
  url.search=new URLSearchParams({...params,client_id:settings.appId,client_secret:settings.appSecret}).toString();
  try {
    const response=await fetch(url,{signal:AbortSignal.timeout(30000)});
    const data=await response.json();
    if(!response.ok||typeof data.access_token!=="string")throw new Error();
    return data.access_token as string;
  } catch {throw new AppError("A Meta não autorizou a conexão. Confira as permissões e tente conectar novamente.",502);}
}
export async function finishMetaConnection(state:string,code:string) {
  let value:{org:number;user:number;client:number;expires:number};
  try {value=JSON.parse(openSecret(state));}catch {throw new AppError("Autorização inválida. Inicie a conexão novamente.",403);}
  if(![value.org,value.user,value.client].every(Number.isSafeInteger)||!Number.isFinite(value.expires)||value.expires<Date.now())throw new AppError("Autorização expirada. Inicie a conexão novamente.",403);
  return runWithOrganizationContext(value.org,async()=>{
    const member=await get("SELECT m.user_id FROM organization_members m JOIN users u ON u.id=m.user_id JOIN organizations o ON o.id=m.organization_id WHERE m.organization_id=? AND m.user_id=? AND m.status='active' AND m.role IN ('owner','admin') AND u.active AND o.status='active'",[value.org,value.user]);
    if(!member)throw new AppError("Seu acesso administrativo mudou. Inicie uma nova conexão.",403);
    const consumed=await get("DELETE FROM social_oauth_states WHERE state_hash=? AND client_id=? AND expires_at>CURRENT_TIMESTAMP RETURNING id",[hashState(state),value.client]);
    if(!consumed)throw new AppError("Esta autorização já foi usada ou expirou.",403);
    const short=await exchangeToken({code,redirect_uri:publishingSettings().redirectUri});
    const token=await exchangeToken({grant_type:"fb_exchange_token",fb_exchange_token:short});
    const pages:Array<{id:string;name:string;access_token:string;instagram_business_account?:{id:string;username?:string}}>=[];
    let after="";
    for(let n=0;n<10;n++) {
      const result=await metaRequest("me/accounts",token,{fields:"id,name,access_token,instagram_business_account{id,username}",limit:"100",...(after?{after}:{})});
      if(!Array.isArray(result.data))throw new AppError("A Meta não retornou as Páginas disponíveis.",502);
      pages.push(...result.data);
      if(!result.paging?.next)break;
      after=result.paging?.cursors?.after;
      if(!after || n===9)throw new AppError("A lista de Páginas é muito extensa. Autorize somente as Páginas deste cliente.",422);
    }
    if(!pages.length)throw new AppError("Nenhuma Página autorizada. Selecione a Página do cliente e conecte o Instagram profissional a ela.",422);
    return transaction(async db=>{
      let count=0;
      for(const page of pages) {
        if(!/^\d+$/.test(page.id)||typeof page.access_token!=="string"||typeof page.name!=="string")throw new AppError("A Meta retornou uma conta inválida.",502);
        const accounts=[{platform:"facebook",id:page.id,name:page.name},...(page.instagram_business_account?[{platform:"instagram",id:page.instagram_business_account.id,name:page.instagram_business_account.username||page.name}]:[])];
        for(const account of accounts) {
          if(!/^\d+$/.test(account.id))throw new AppError("Conta de Instagram inválida.",502);
          const existing=await get<{id:number}>("SELECT id FROM social_accounts WHERE client_id=? AND platform=? AND account_id=? FOR UPDATE",[value.client,account.platform,account.id],db);
          if(existing && await get("SELECT id FROM social_publications WHERE account_id=? AND status IN ('publishing','uncertain') LIMIT 1",[existing.id],db))throw new AppError("Confira as publicações em andamento desta conta antes de reconectar.",409);
          if(existing)await run("UPDATE social_publications SET status='cancelled',error_message='Conta reconectada. Revise e agende novamente.' WHERE account_id=? AND status='scheduled'",[existing.id],db);
          await run(`INSERT INTO social_accounts(client_id,platform,account_id,name,token_encrypted) VALUES(?,?,?,?,?)
            ON CONFLICT(organization_id,client_id,platform,account_id) DO UPDATE SET name=EXCLUDED.name,token_encrypted=EXCLUDED.token_encrypted,active=FALSE,connected_at=CURRENT_TIMESTAMP`,[value.client,account.platform,account.id,account.name,sealSecret(page.access_token)],db);
          count++;
        }
      }
      return {count};
    });
  },value.user);
}
