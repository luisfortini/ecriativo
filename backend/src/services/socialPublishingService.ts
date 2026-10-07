import { z } from "zod";
import sharp from "sharp";
import { all,get,run,transaction,runWithOrganizationContext } from "../db/connection.js";
import { getDatabaseRequestContext } from "../db/requestContext.js";
import { config } from "../config.js";
import { AppError } from "../utils/errors.js";
import { requireClient } from "./visualLibraryService.js";
import { readMedia,mediaFilename } from "./mediaStorageService.js";
import { sealSecret,openSecret,publishingSettings,isTimeZone,validatePublishable,type PublicationSnapshot } from "./socialPublishingSecurity.js";
import { prepareMetaPublication,publishMetaPublication,metaPermalink } from "./metaPublishingService.js";

export async function publishingOverview(clientId:number) {
  await requireClient(clientId);
  const client=await get<{time_zone:string}>("SELECT time_zone FROM clients WHERE id=?",[clientId]);
  const settings=publishingSettings();
  return {enabled:settings.enabled,configured:Boolean(settings.appId&&settings.appSecret&&settings.redirectUri&&/^[a-f0-9]{64}$/i.test(settings.key)&&/^v\d+\.\d+$/.test(settings.version)),time_zone:client?.time_zone||"America/Sao_Paulo",
    accounts:await all("SELECT id,platform,account_id,name,active,connected_at FROM social_accounts WHERE client_id=? ORDER BY platform,name",[clientId]),
    publications:await all(`SELECT p.id,p.content_id,p.account_id,p.scheduled_at,p.time_zone,p.status,p.published_at,p.provider_id,p.permalink,p.error_message,a.platform,a.name account_name FROM social_publications p JOIN social_accounts a ON a.id=p.account_id WHERE p.client_id=? ORDER BY p.scheduled_at DESC LIMIT 200`,[clientId])};
}
export async function setSocialAccount(id:number,active:boolean) {
  return transaction(async db=>{
    const account=await get("SELECT id FROM social_accounts WHERE id=? FOR UPDATE",[id],db);
    if(!account)throw new AppError("Conta não encontrada.",404);
    if(await get("SELECT id FROM social_publications WHERE account_id=? AND status IN ('publishing','uncertain') LIMIT 1",[id],db))throw new AppError("Confira as publicações em andamento ou incertas antes de alterar a conexão.",409);
    await run("UPDATE social_accounts SET active=? WHERE id=?",[active,id],db);
    if(!active)await run("UPDATE social_publications SET status='cancelled',error_message='Agendamento cancelado ao desativar a conta.' WHERE account_id=? AND status='scheduled'",[id],db);
  });
}
export async function scheduleSocialPublication(contentId:number,raw:unknown) {
  const parsed=z.object({account_id:z.coerce.number().int().positive(),local_datetime:z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/),time_zone:z.string().min(1).max(80)}).safeParse(raw);
  if(!parsed.success || !isTimeZone(parsed.data.time_zone))throw new AppError("Informe uma data, horário e fuso válidos.",422);
  const value=parsed.data;
  return transaction(async db=>{
    const content=await get<PublicationSnapshot & {id:number;client_id:number;status:string}>("SELECT * FROM social_contents WHERE id=? FOR UPDATE",[contentId],db);
    if(!content)throw new AppError("Conteúdo não encontrado.",404);
    const account=await get<{id:number;platform:string;active:boolean}>("SELECT id,platform,active FROM social_accounts WHERE id=? AND client_id=? FOR UPDATE",[value.account_id,content.client_id],db);
    if(!account || !account.active)throw new AppError("Selecione uma conta ativa deste cliente.",422);
    validatePublishable(content,account.platform);
    const duplicate=await get("SELECT id FROM social_publications WHERE content_id=? AND account_id=? AND status IN ('scheduled','publishing','published','uncertain')",[contentId,account.id],db);
    if(duplicate)throw new AppError("Este conteúdo já está agendado, publicado ou precisa de conferência nesta conta.",409);
    // Preflight uses persisted bytes, not private browser URLs.
    for(const image of content.images)await publicationJpeg(image);
    let date:{at:Date;valid:boolean}|undefined;
    try {date=await get("SELECT (?::timestamp AT TIME ZONE ?) at, ((?::timestamp AT TIME ZONE ?) AT TIME ZONE ?) = ?::timestamp valid",[value.local_datetime,value.time_zone,value.local_datetime,value.time_zone,value.time_zone,value.local_datetime],db);}catch {throw new AppError("Data ou horário inválido.",422);}
    if(!date?.valid || date.at.getTime()<=Date.now()+60000 || date.at.getTime()>Date.now()+366*86400000)throw new AppError("Escolha um horário válido, entre um minuto no futuro e os próximos 12 meses. Evite horários de transição do horário de verão.",422);
    const snapshot:PublicationSnapshot={caption:content.caption,alt_text:content.alt_text,format:content.format,images:content.images};
    return run("INSERT INTO social_publications(client_id,content_id,account_id,scheduled_at,time_zone,snapshot) VALUES(?,?,?,?,?,?::jsonb)",[content.client_id,contentId,account.id,date.at.toISOString(),value.time_zone,JSON.stringify(snapshot)],db);
  });
}
export async function cancelSocialPublication(id:number) {
  return transaction(async db=>{
    const item=await get<{content_id:number}>("SELECT content_id FROM social_publications WHERE id=?",[id],db);
    if(!item)throw new AppError("Agendamento não encontrado.",404);
    await get("SELECT id FROM social_contents WHERE id=? FOR UPDATE",[item.content_id],db);
    const result=await run("UPDATE social_publications SET status='cancelled',error_message=NULL WHERE id=? AND status='scheduled'",[id],db);
    if(!result.rowCount)throw new AppError("Só é possível cancelar antes do início da publicação.",409);
  });
}
export async function assertContentNotScheduled(id:number) {
  if(await get("SELECT id FROM social_publications WHERE content_id=? AND status IN ('scheduled','publishing','uncertain') LIMIT 1",[id]))throw new AppError("Cancele os agendamentos ou confira a publicação antes de corrigir ou reprovar o conteúdo.",409);
}
export async function reconcileSocialPublication(id:number,raw:unknown) {
  const input=z.object({checked_on_network:z.literal(true),outcome:z.enum(['published','not_published']),permalink:z.string().url().max(1000).optional()}).safeParse(raw);
  if(!input.success)throw new AppError("Confira o resultado diretamente na rede e informe se foi publicado.",422);
  const value=input.data;
  if(value.permalink) {
    const url=new URL(value.permalink);
    if(url.protocol!=="https:"||!/(^|\.)(instagram\.com|facebook\.com)$/.test(url.hostname))throw new AppError("Informe um link válido da publicação no Instagram ou Facebook.",422);
  }
  const result=await run("UPDATE social_publications SET status=?,permalink=?,error_message=?,published_at=CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE NULL END WHERE id=? AND status='uncertain'",[value.outcome==='published'?'published':'cancelled',value.permalink||null,value.outcome==='published'?'Publicação confirmada manualmente pelo administrador.':'Administrador conferiu a rede e confirmou que não foi publicado.',value.outcome==='published',id]);
  if(!result.rowCount)throw new AppError("Só é possível conferir publicações com resultado incerto.",409);
}
async function publicationJpeg(image:PublicationSnapshot["images"][number]) {
  const source=await readMedia("generated",mediaFilename(image.filename||image.url));
  const buffer=await sharp(source.data,{limitInputPixels:40_000_000}).rotate().flatten({background:"#ffffff"}).jpeg({quality:90}).toBuffer();
  if(buffer.length>8*1024*1024)throw new AppError("Uma das imagens excede 8 MB após preparar para a rede.",422);
  const meta=await sharp(buffer).metadata();
  const ratio=meta.width!/meta.height!;
  if(ratio<0.8 || ratio>1.91)throw new AppError("O feed exige imagens entre 4:5 e 1,91:1. Refaça a arte no formato de publicação.",422);
  return buffer;
}
export function signedPublicationMedia(org:number,id:number,index:number) {
  const token=sealSecret(JSON.stringify({org,id,index,expires:Date.now()+2*3600000}));
  return `${config.publicBaseUrl.replace(/\/$/,"")}/api/social-publishing/media/${encodeURIComponent(token)}.jpg`;
}
export async function readPublicationMedia(token:string) {
  let value:{org:number;id:number;index:number;expires:number};
  try {value=JSON.parse(openSecret(token));}catch {throw new AppError("Link de mídia inválido.",403);}
  if(!Number.isSafeInteger(value.org)||!Number.isSafeInteger(value.id)||!Number.isInteger(value.index)||value.index<0||value.index>2||!Number.isFinite(value.expires)||value.expires<Date.now())throw new AppError("Link de mídia expirado ou inválido.",403);
  return runWithOrganizationContext(value.org,async()=>{
    const item=await get<{snapshot:PublicationSnapshot}>("SELECT snapshot FROM social_publications WHERE id=? AND status='publishing'",[value.id]);
    const image=item?.snapshot.images[value.index];
    if(!image)throw new AppError("Mídia indisponível.",404);
    return publicationJpeg(image);
  });
}
let running=false;
export async function processSocialPublications() {
  if(running || !publishingSettings().enabled)return;
  running=true;
  try {
    const organizations=await all<{id:number}>("SELECT id FROM organizations WHERE status='active' ORDER BY id");
    for(const org of organizations)await runWithOrganizationContext(Number(org.id),()=>processOrganization()).catch(()=>console.error(`Falha na fila de publicação da organização ${org.id}; consulte o histórico.`));
  } finally {running=false;}
}
async function processOrganization() {
  await run("UPDATE social_publications SET status='uncertain',error_message='Execução interrompida. Confira a rede antes de qualquer novo envio.' WHERE status='publishing' AND started_at<CURRENT_TIMESTAMP-INTERVAL '10 minutes'");
  await run("UPDATE social_publications SET status='failed',error_message='Horário ultrapassado em mais de 15 minutos. Revise e agende um novo horário; nada foi publicado.' WHERE status='scheduled' AND scheduled_at<CURRENT_TIMESTAMP-INTERVAL '15 minutes'");
  const candidate=await get<{id:number;content_id:number;account_id:number}>("SELECT id,content_id,account_id FROM social_publications WHERE status='scheduled' AND scheduled_at<=CURRENT_TIMESTAMP ORDER BY scheduled_at,id LIMIT 1");
  if(!candidate)return;
  const item=await transaction(async db=>{
    // Same lock order as scheduling/cancellation prevents conflicting claims.
    const content=await get<{status:string}>("SELECT status FROM social_contents WHERE id=? FOR UPDATE",[candidate.content_id],db);
    const account=await get<{active:boolean}>("SELECT active FROM social_accounts WHERE id=? FOR UPDATE",[candidate.account_id],db);
    if(content?.status!=="approved" || !account?.active) {
      await run("UPDATE social_publications SET status='failed',error_message='Conteúdo não aprovado ou conta desativada.' WHERE id=? AND status='scheduled'",[candidate.id],db);return;
    }
    return get<{id:number;account_id:number;snapshot:PublicationSnapshot}>("UPDATE social_publications SET status='publishing',started_at=CURRENT_TIMESTAMP,error_message=NULL WHERE id=? AND status='scheduled' RETURNING id,account_id,snapshot",[candidate.id],db);
  });
  if(!item)return;
  let attemptedPublish=false;
  try {
    const settings=publishingSettings();
    if(!settings.enabled)throw new AppError("Publicação real desativada.",503);
    if(!config.publicBaseUrl.startsWith("https://"))throw new AppError("Configure PUBLIC_BASE_URL com HTTPS público para a Meta acessar as imagens.",503);
    const account=await get<{platform:string;account_id:string;token_encrypted:string}>("SELECT platform,account_id,token_encrypted FROM social_accounts WHERE id=?",[item.account_id]);
    if(!account)throw new AppError("Conta desconectada.",409);
    const connected={...account,token:openSecret(account.token_encrypted)};
    for(const image of item.snapshot.images)await publicationJpeg(image);
    const org=getDatabaseRequestContext()!.organizationId;
    const urls=item.snapshot.images.map((_,index)=>signedPublicationMedia(org,Number(item.id),index));
    const prepared=await prepareMetaPublication(connected,item.snapshot,urls);
    attemptedPublish=true;
    const providerId=await publishMetaPublication(connected,item.snapshot,prepared);
    // Persist confirmation BEFORE optional permalink lookup.
    await run("UPDATE social_publications SET status='published',provider_id=?,published_at=CURRENT_TIMESTAMP WHERE id=? AND status='publishing'",[providerId,item.id]);
    const permalink=await metaPermalink(connected,providerId).catch(()=>null);
    if(permalink)await run("UPDATE social_publications SET permalink=? WHERE id=?",[permalink,item.id]);
  } catch(error) {
    const message=error instanceof AppError?error.message:"Não foi possível concluir a publicação. Confira a conexão e as mídias.";
    await run("UPDATE social_publications SET status=?,error_message=? WHERE id=? AND status='publishing'",[attemptedPublish?"uncertain":"failed",attemptedPublish?`${message} Confira a rede antes de reenviar; não haverá repetição automática.`:message,item.id]);
  }
}
