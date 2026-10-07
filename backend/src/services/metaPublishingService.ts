import { AppError } from "../utils/errors.js";
import { createHmac } from "node:crypto";
import { publishingSettings, type PublicationSnapshot } from "./socialPublishingSecurity.js";

export interface MetaAccount { platform:string;account_id:string;token:string }
export async function metaRequest(endpoint:string,token:string,params:Record<string,string>={},method="GET",transport:typeof fetch=fetch):Promise<any> {
  const {version,appSecret}=publishingSettings();
  if(!/^v\d+\.\d+$/.test(version))throw new AppError("Configure META_GRAPH_VERSION com uma versão suportada pela Meta.",503);
  const url=new URL(`https://graph.facebook.com/${version}/${endpoint}`);
  const headers:Record<string,string>={Authorization:`Bearer ${token}`};
  if(appSecret)params={...params,appsecret_proof:createHmac("sha256",appSecret).update(token).digest("hex")};
  let body:URLSearchParams|undefined;
  if(method==="GET")Object.entries(params).forEach(([key,value])=>url.searchParams.set(key,value));
  else {body=new URLSearchParams(params);headers["Content-Type"]="application/x-www-form-urlencoded";}
  let response:Response;
  try {response=await transport(url,{method,headers,body,signal:AbortSignal.timeout(30000)});}catch {throw new AppError("A Meta não respondeu. Verifique a conexão e o histórico antes de tentar novamente.",502);}
  const data=await response.json().catch(()=>null);
  if(!response.ok || data?.error) {
    const code=Number(data?.error?.code);
    throw new AppError(code===190?"A autorização da Meta expirou ou foi revogada. Reconecte a conta.":`A Meta recusou a operação${Number.isFinite(code)?` (código ${code})`:""}. Confira as permissões, o formato e a conexão da conta.`,502);
  }
  if(!data || typeof data!=="object")throw new AppError("Resposta inválida da Meta.",502);
  return data;
}
function providerId(value:any) {
  if(typeof value?.id!=="string" || !/^\d+(?:_\d+)?$/.test(value.id))throw new AppError("A Meta não retornou o identificador esperado.",502);
  return value.id as string;
}
export async function prepareMetaPublication(account:MetaAccount,snapshot:PublicationSnapshot,urls:string[],transport:typeof fetch=fetch):Promise<Record<string,string>> {
  if(account.platform==="facebook") {
    const ids:string[]=[];
    for(const url of urls)ids.push(providerId(await metaRequest(`${account.account_id}/photos`,account.token,{url,published:"false"},"POST",transport)));
    return {attached_media:JSON.stringify(ids.map(media_fbid=>({media_fbid})))};
  }
  if(urls.length===1) {
    const id=providerId(await metaRequest(`${account.account_id}/media`,account.token,{image_url:urls[0],caption:snapshot.caption,alt_text:snapshot.alt_text.slice(0,1000)},"POST",transport));
    await waitForContainer(id,account.token,transport);
    return {creation_id:id};
  }
  const children:string[]=[];
  for(const url of urls) {
    const id=providerId(await metaRequest(`${account.account_id}/media`,account.token,{image_url:url,is_carousel_item:"true",alt_text:snapshot.alt_text.slice(0,1000)},"POST",transport));
    await waitForContainer(id,account.token,transport);children.push(id);
  }
  const id=providerId(await metaRequest(`${account.account_id}/media`,account.token,{media_type:"CAROUSEL",children:children.join(","),caption:snapshot.caption},"POST",transport));
  await waitForContainer(id,account.token,transport);
  return {creation_id:id};
}
async function waitForContainer(id:string,token:string,transport:typeof fetch) {
  for(let i=0;i<6;i++) {
    const status=await metaRequest(id,token,{fields:"status_code"},"GET",transport);
    if(status.status_code==="FINISHED")return;
    if(["ERROR","EXPIRED"].includes(status.status_code))throw new AppError("A Meta não conseguiu preparar as imagens. Revise o formato e tente agendar novamente.",502);
    if(i<5)await new Promise(resolve=>setTimeout(resolve,1000));
  }
  throw new AppError("As imagens ainda não ficaram prontas na Meta. Nenhuma publicação foi solicitada; tente agendar novamente mais tarde.",502);
}
export async function publishMetaPublication(account:MetaAccount,snapshot:PublicationSnapshot,prepared:Record<string,string>,transport:typeof fetch=fetch) {
  return providerId(await metaRequest(`${account.account_id}/${account.platform==="instagram"?"media_publish":"feed"}`,account.token,account.platform==="instagram"?prepared:{...prepared,message:snapshot.caption},"POST",transport));
}
export async function metaPermalink(account:MetaAccount,id:string,transport:typeof fetch=fetch) {
  const field=account.platform==="instagram"?"permalink":"permalink_url";
  const data=await metaRequest(id,account.token,{fields:field},"GET",transport);
  const value=data[field];
  if(typeof value!=="string")return null;
  const url=new URL(value);
  return url.protocol==="https:" && /(^|\.)(instagram\.com|facebook\.com)$/.test(url.hostname)?value:null;
}
