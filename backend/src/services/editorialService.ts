import { z } from "zod";
import path from "node:path";
import sharp from "sharp";
import { all, get, run, transaction, runWithOrganizationContext } from "../db/connection.js";
import { AppError } from "../utils/errors.js";
import type { ClientProfile } from "../types.js";
import { addDays, anniversaryInWeek, localDate, weekStart } from "./editorialCalendar.js";
import { researchEditorial, writeSocialContent, reviewSocialImage, type EditorialEvidence } from "./editorialAiService.js";
import { requireClient, resolveVisuals, validateVisualReferences, visualSelectionSchema, type VisualSelection, type VisualReference } from "./visualLibraryService.js";
import { generateImage } from "./openaiService.js";
import { mediaFilename, readMedia } from "./mediaStorageService.js";
import { requestEditorialCorrections, type CorrectionRequest } from "./editorialCorrectionService.js";
import { socialImagePrompt } from "./socialBrandContract.js";
import { assertContentNotScheduled } from "./socialPublishingService.js";

export const editorialPlanSchema = z.object({
  client_id: z.coerce.number().int().positive(), name: z.string().trim().min(2).max(120),
  active: z.boolean().default(false), automatic: z.boolean().default(false),
  posts_per_week: z.coerce.number().int().min(1).max(21),
  pillars: z.array(z.string().trim().min(2).max(250)).min(1).max(12),
  formats: z.array(z.enum(["post", "carousel", "story"])).min(1).max(3),
  visual_selection: visualSelectionSchema.default({}),
  weekly_image_limit: z.coerce.number().int().min(1).max(100)
}).refine(v => v.weekly_image_limit >= Array.from({length:v.posts_per_week}, (_,i) => v.formats[i % v.formats.length] === "carousel" ? 3 : 1).reduce((a,b) => a+b,0), "O limite de imagens não comporta a quantidade e os formatos da semana.");

interface Plan { id: number; client_id: number; name: string; active: boolean; automatic: boolean; posts_per_week: number; pillars: string[]; formats: string[]; visual_selection: VisualSelection; weekly_image_limit: number; }
export async function listEditorialPlans() { return all("SELECT p.*,c.name client_name FROM editorial_plans p JOIN clients c ON c.id=p.client_id ORDER BY p.id DESC"); }
export async function saveEditorialPlan(raw: unknown, id?: number) {
  const parsed = editorialPlanSchema.safeParse(raw);
  if (!parsed.success) throw new AppError(parsed.error.issues[0].message, 422);
  const value = parsed.data;
  await requireClient(value.client_id);
  if (value.active) await resolveVisuals(value.client_id, value.visual_selection, "social");
  const params = { ...value, pillars: JSON.stringify(value.pillars), formats: JSON.stringify(value.formats), visual_selection: JSON.stringify(value.visual_selection) };
  if (id) {
    const result = await run(`UPDATE editorial_plans SET name=@name,active=@active,automatic=@automatic,posts_per_week=@posts_per_week,
      pillars=@pillars::jsonb,formats=@formats::jsonb,visual_selection=@visual_selection::jsonb,weekly_image_limit=@weekly_image_limit WHERE id=@id AND client_id=@client_id`, { ...params, id });
    if (!result.rowCount) throw new AppError("Plano não encontrado.",404);
    if (!value.active) await run("UPDATE social_contents SET status='cancelled' WHERE status='pending' AND batch_id IN (SELECT id FROM editorial_batches WHERE plan_id=?)", [id]);
    return {id};
  }
  const result = await run(`INSERT INTO editorial_plans(client_id,name,active,automatic,posts_per_week,pillars,formats,visual_selection,weekly_image_limit)
    VALUES(@client_id,@name,@active,@automatic,@posts_per_week,@pillars::jsonb,@formats::jsonb,@visual_selection::jsonb,@weekly_image_limit)`,params);
  return {id:Number(result.lastInsertRowid)};
}

export async function createEditorialBatch(planId: number, requestedWeek?: string, research = researchEditorial, retry = false) {
  const plan = await get<Plan>("SELECT * FROM editorial_plans WHERE id=?",[planId]);
  if (!plan) throw new AppError("Plano não encontrado.",404);
  const client = await get<ClientProfile>("SELECT * FROM clients WHERE id=?",[plan.client_id]);
  if (!client) throw new AppError("Cliente não encontrado.",404);
  const today = localDate(new Date(),client.time_zone || "America/Sao_Paulo");
  const week = requestedWeek || weekStart(today);
  if (weekStart(week) !== week || week < weekStart(today) || week > addDays(weekStart(today),28)) throw new AppError("Escolha uma segunda-feira entre esta semana e as próximas quatro.",422);
  const insert = await run(`INSERT INTO editorial_batches(client_id,plan_id,week_start,snapshot) VALUES(?,?,? ,?::jsonb) ON CONFLICT(plan_id,week_start) DO NOTHING`,[plan.client_id,plan.id,week,JSON.stringify({plan,client:{name:client.name,country:client.country,state:client.state,city:client.city,anniversary_date:client.anniversary_date,founding_year:client.founding_year,time_zone:client.time_zone}})]);
  let batchId = Number(insert.lastInsertRowid);
  if (!batchId && retry) {
    const reclaimed = await get<{id:number}>(`UPDATE editorial_batches SET status='planning',created_at=CURRENT_TIMESTAMP
      WHERE plan_id=? AND week_start=? AND (status='failed' OR (status='planning' AND created_at < CURRENT_TIMESTAMP - INTERVAL '30 minutes'))
      AND NOT EXISTS(SELECT 1 FROM social_contents WHERE batch_id=editorial_batches.id) RETURNING id`,[plan.id,week]);
    batchId=Number(reclaimed?.id);
  }
  if (!batchId) return get("SELECT * FROM editorial_batches WHERE plan_id=? AND week_start=?",[plan.id,week]);
  try {
    let evidence: EditorialEvidence[] = [];
    let note = "Pesquisa concluída. Assuntos sem evidência foram descartados.";
    try { evidence = await research(client,week,addDays(week,6)); }
    catch { note = "Pesquisa indisponível. Programação baseada nos pilares e no aniversário cadastrado."; }
    const candidateAnniversary = anniversaryInWeek(client.anniversary_date ?? null,week);
    const anniversary = candidateAnniversary && candidateAnniversary >= today ? candidateAnniversary : null;
    const opportunities = evidence.filter(e => e.kind === "local_date" && e.date >= today);
    const recent = week <= today ? evidence.filter(e => e.kind !== "local_date") : [];
    await transaction(async db => {
      for (let i=0;i<plan.posts_per_week;i++) {
        const item = opportunities[i - (anniversary ? 1 : 0)] || (i % 3 === 1 ? recent[Math.floor(i/3)] : undefined);
        const firstDay = today > week ? today : week;
        const daysLeft = Math.round((Date.parse(addDays(week,6))-Date.parse(firstDay))/86_400_000)+1;
        const date = anniversary && i === 0 ? anniversary : item?.kind === "local_date" ? item.date : addDays(firstDay,Math.floor(i * daysLeft / plan.posts_per_week));
        const years = client.founding_year ? Number((anniversary || week).slice(0,4)) - Number(client.founding_year) : null;
        const topic = anniversary && i === 0 ? `Aniversário da ${client.name}${years && years > 0 ? `: ${years} anos` : ""}. Valorize trajetória e comunidade sem inventar fatos.` : item ? `${item.title}. ${item.reason}` : `${plan.pillars[(i + Number(week.slice(8))) % plan.pillars.length]} — conteúdo útil para ${client.target_audience || "o público da marca"}. Abordagem ${i+1} da semana ${week}.`;
        await run(`INSERT INTO social_contents(client_id,batch_id,position,scheduled_date,format,topic,sources,status) VALUES(?,?,?,?,?,?,?::jsonb,?)`,[plan.client_id,batchId,i,date,plan.formats[i % plan.formats.length],topic,JSON.stringify(item && !(anniversary && i===0) ? [item] : []),plan.automatic && plan.active ? "pending":"draft"],db);
      }
      await run("UPDATE editorial_batches SET status='ready',evidence=?::jsonb,research_note=? WHERE id=?",[JSON.stringify(evidence),note,batchId],db);
    });
  } catch(error) { await run("UPDATE editorial_batches SET status='failed',research_note=? WHERE id=?",[error instanceof Error ? error.message:"Falha no planejamento",batchId]); throw error; }
  return get("SELECT * FROM editorial_batches WHERE id=?",[batchId]);
}

export async function getEditorialCalendar(planId: number) {
  const plan = await get("SELECT * FROM editorial_plans WHERE id=?",[planId]);
  if (!plan) throw new AppError("Plano não encontrado.",404);
  return {plan,batches:await all("SELECT * FROM editorial_batches WHERE plan_id=? ORDER BY week_start DESC",[planId]),contents:await all("SELECT c.* FROM social_contents c JOIN editorial_batches b ON b.id=c.batch_id WHERE b.plan_id=? ORDER BY c.scheduled_date,c.position",[planId])};
}

export async function contentAction(id: number, action: string, note = "") {
  if(action === "reject" || action === "regenerate")await assertContentNotScheduled(id);
  const item = await get<{status:string; plan_id:number;active:boolean;format:string}>("SELECT c.status,c.format,b.plan_id,p.active FROM social_contents c JOIN editorial_batches b ON b.id=c.batch_id JOIN editorial_plans p ON p.id=b.plan_id WHERE c.id=?",[id]);
  if (!item) throw new AppError("Conteúdo não encontrado.",404);
  if (action === "regenerate") {
    await requestEditorialCorrections(Number(item.plan_id),{note,targets:[{content_id:id,image_indexes:item.format==="carousel"?[0,1,2]:[0]}]});
    return;
  }
  const allowed: Record<string,{from:string[];to:string}> = {generate:{from:["draft","failed","cancelled"],to:"pending"},approve:{from:["review"],to:"approved"},reject:{from:["review","approved"],to:"rejected"}};
  const transition = allowed[action];
  if (!transition || !transition.from.includes(item.status)) throw new AppError("Ação incompatível com o estado atual.",409);
  if (action === "generate" && !item.active) throw new AppError("Ative o plano antes de gerar.",409);
  if (action === "reject" && note.trim().length < 3) throw new AppError("Informe o motivo da reprovação.",422);
  const changed = await run("UPDATE social_contents SET status=?,review_note=?,error_message=NULL WHERE id=? AND status=?",[transition.to,note.slice(0,2000),id,item.status]);
  if (!changed.rowCount) throw new AppError("Conteúdo alterado por outra operação. Atualize a tela.",409);
}

export async function editEditorialContent(id:number, raw:unknown) {
  const input = z.object({topic:z.string().trim().min(5).max(5000),caption:z.string().max(10000).default(""),alt_text:z.string().max(3000).default("")}).safeParse(raw);
  if (!input.success) throw new AppError("Revise a pauta, legenda e texto alternativo.",422);
  const result = await run("UPDATE social_contents SET topic=?,caption=?,alt_text=? WHERE id=? AND status IN ('draft','review','rejected')",[input.data.topic,input.data.caption,input.data.alt_text,id]);
  if (!result.rowCount) throw new AppError("Só é possível editar pautas e conteúdos fora da fila e ainda não aprovados.",409);
}

let running = false;
const defaultEngine = {research:researchEditorial,write:writeSocialContent,image:generateImage,review:reviewSocialImage};
type EditorialEngine = Omit<typeof defaultEngine,"review"> & Partial<Pick<typeof defaultEngine,"review">>;
export async function processEditorialQueue(engine:EditorialEngine = defaultEngine) {
  if (running) return;
  running = true;
  try {
    const organizations = await all<{id:number}>("SELECT id FROM organizations WHERE status='active' ORDER BY id");
    for (const org of organizations) {
      try { await runWithOrganizationContext(Number(org.id),()=>processEditorialOrganization(engine)); }
      catch(error) { console.error(`Erro editorial na organização ${org.id}`,error); }
    }
  } finally { running=false; }
}

async function processEditorialOrganization(engine:EditorialEngine) {
  const plans = await all<Plan>("SELECT * FROM editorial_plans WHERE active ORDER BY id");
  for (const plan of plans) {
    try { await createEditorialBatch(Number(plan.id),undefined,engine.research); }
    catch(error) { console.error(`Erro ao planejar ${plan.id}`,error); }
  }
  // Uma chamada interrompida precisa de decisão humana antes de voltar a gastar.
  await run("UPDATE social_contents SET status='failed',error_message='Execução interrompida. Revise antes de tentar novamente.' WHERE status='processing' AND started_at < CURRENT_TIMESTAMP - INTERVAL '30 minutes'");
  const item = await transaction(async db => get<{id:number; client_id:number;batch_id:number;topic:string;format:string;image_prompts:string[];images:Array<{url:string;filename:string;quality_issues?:string[]}>;sources:EditorialEvidence[];position:number;visual_snapshot:VisualReference[];visual_direction:string;correction_request:CorrectionRequest|null}>(`WITH candidate AS (
    SELECT c.id FROM social_contents c JOIN editorial_batches b ON b.id=c.batch_id JOIN editorial_plans p ON p.id=b.plan_id
    WHERE c.status='pending' AND p.active ORDER BY c.scheduled_date,c.id FOR UPDATE OF c SKIP LOCKED LIMIT 1
  ) UPDATE social_contents SET status='processing',started_at=CURRENT_TIMESTAMP,attempt_count=attempt_count+1 WHERE id IN(SELECT id FROM candidate) RETURNING *`,undefined,db));
  if (!item) return;
  try {
    const batch = await get<{snapshot:{plan:Plan};week_start:string}>("SELECT snapshot,week_start::text FROM editorial_batches WHERE id=?",[item.batch_id]);
    if (!batch) throw new Error("Lote não encontrado.");
    const plan = batch.snapshot.plan;
    const client = await get<ClientProfile>("SELECT * FROM clients WHERE id=?",[item.client_id]);
    if (!client) throw new Error("Cliente não encontrado.");
    if (!item.correction_request && localDate(new Date(),client.time_zone || "America/Sao_Paulo") > addDays(batch.week_start,6)) throw new Error("Semana encerrada. Use solicitar correção para refazer as artes deste conteúdo.");
    const refs = item.image_prompts.length ? item.visual_snapshot : await resolveVisuals(Number(item.client_id),visualSelectionSchema.parse(plan.visual_selection),"social",item.position);
    await validateVisualReferences(Number(item.client_id),refs,"social");
    if(item.correction_request) {
      for(const index of item.correction_request.indexes.filter(i=>!item.correction_request!.completed.includes(i))) {
        if(item.images[index]?.url && !item.images[index].quality_issues?.length)item.images[index].quality_issues=["Esta versão aguarda a correção solicitada."];
      }
      await run("UPDATE social_contents SET images=?::jsonb WHERE id=?",[JSON.stringify(item.images),item.id]);
    }
    if (!item.image_prompts.length || (item.correction_request?.rewrite_text && !item.correction_request.text_updated)) {
      const content = await engine.write(client,`${item.topic}\n${item.correction_request?.rewrite_text ? `Reescreva os textos no idioma atual do cliente. Ajustes: ${item.correction_request.note}` : ""}\nMateriais autorizados: ${JSON.stringify(refs.map(r=>({name:r.name,kind:r.kind,preserve:r.preservation_notes})))}`,item.format,item.sources);
      item.image_prompts = content.image_prompts;
      item.visual_direction = content.visual_direction || "";
      if(item.correction_request?.rewrite_text)item.correction_request.text_updated=true;
      await run("UPDATE social_contents SET caption=?,alt_text=?,image_prompts=?::jsonb,visual_snapshot=?::jsonb,visual_direction=?,correction_request=?::jsonb WHERE id=?",[content.caption,content.alt_text,JSON.stringify(content.image_prompts),JSON.stringify(refs),item.visual_direction,JSON.stringify(item.correction_request),item.id]);
    }
    const brandAssets = await all<{type:string;file_url:string}>("SELECT type,file_url FROM client_assets WHERE client_id=? AND type IN ('logo_main','approved_reference','approved_ad') ORDER BY id DESC",[item.client_id]);
    const logo=brandAssets.find(asset=>asset.type==="logo_main");
    let approvedStyle:typeof brandAssets[number]|undefined;
    for(const asset of brandAssets.filter(asset=>asset.type!=="logo_main")) {
      const stored=await readMedia("uploads",mediaFilename(asset.file_url));
      const metadata=await sharp(stored.data).metadata().catch(()=>undefined);
      if(metadata?.format && ["png","jpeg","webp"].includes(metadata.format)){approvedStyle=asset;break;}
    }
    const indexes=item.correction_request ? item.correction_request.indexes.filter(i=>!item.correction_request!.completed.includes(i)) : item.image_prompts.map((_,i)=>i).filter(i=>!item.images[i]?.url || Boolean(item.images[i]?.quality_issues?.length));
    for (const i of indexes) {
      const current = await get<{active:boolean;weekly_image_limit:number}>("SELECT active,weekly_image_limit FROM editorial_plans WHERE id=?",[plan.id]);
      if (!current?.active) throw new Error("Plano pausado durante a produção. Nenhuma nova imagem foi solicitada.");
      await validateVisualReferences(Number(item.client_id),refs,"social");
      const reserved = await run("UPDATE editorial_batches SET image_calls=image_calls+1 WHERE id=? AND image_calls < ?",[item.batch_id,current.weekly_image_limit]);
      if (!reserved.rowCount) throw new Error("Limite semanal de imagens atingido; tentativas também consomem o limite.");
      const prompt=socialImagePrompt(client,item.image_prompts[i],i,item.image_prompts.length,item.visual_direction,item.correction_request?.note);
      const oldImage=item.images[i];
      const creativeFilename=item.correction_request && !item.correction_request.rewrite_text && oldImage?.url ? mediaFilename(oldImage.filename||oldImage.url) : undefined;
      const anchor=i>0 ? item.images[0] : undefined;
      const image = await engine.image(prompt,item.format === "story" ? "9:16":"4:5",{clientId:Number(item.client_id),operationType:"rotina_agendada"},{references:refs,mode:plan.visual_selection.mode,no_people:plan.visual_selection.no_people,creative_filename:creativeFilename,style_filename:anchor?.url?mediaFilename(anchor.filename||anchor.url):approvedStyle?mediaFilename(approvedStyle.file_url):undefined,style_kind:anchor?.url?"generated":"uploads",brand_logo_filename:logo?mediaFilename(logo.file_url):undefined,social_layout:true});
      while(item.images.length<=i)item.images.push({url:"",filename:""});
      item.images[i]={url:image.imageUrl,filename:image.imagePath ? path.basename(image.imagePath):"",quality_issues:engine.review?["Revisão visual pendente."]:[]};
      await run("UPDATE social_contents SET images=?::jsonb WHERE id=?",[JSON.stringify(item.images),item.id]);
      if(engine.review){
        const review=await engine.review(client,item.images[i].filename || mediaFilename(image.imageUrl),anchor?.url?mediaFilename(anchor.filename||anchor.url):undefined,logo?mediaFilename(logo.file_url):undefined);
        item.images[i].quality_issues=review.approved?[]:review.issues.length?review.issues:["A arte não passou na revisão de marca e idioma."];
        await run("UPDATE social_contents SET images=?::jsonb WHERE id=?",[JSON.stringify(item.images),item.id]);
        if(!review.approved)throw new Error(`Arte ${i+1}: ${item.images[i].quality_issues!.join(" ")} Selecione esta arte para corrigir ou reescreva todo o conteúdo com o perfil atual.`);
      }
      if(item.correction_request)item.correction_request.completed.push(i);
      await run("UPDATE social_contents SET images=?::jsonb,correction_request=?::jsonb WHERE id=?",[JSON.stringify(item.images),JSON.stringify(item.correction_request),item.id]);
    }
    const missing=item.image_prompts.some((_,i)=>!item.images[i]?.url || Boolean(item.images[i]?.quality_issues?.length));
    await run("UPDATE social_contents SET status=?,error_message=?,correction_request=NULL WHERE id=? AND status='processing'",[missing?"failed":"review",missing?"Ainda existem artes ausentes ou reprovadas na revisão visual. Selecione-as para corrigir.":null,item.id]);
  } catch(error) { await run("UPDATE social_contents SET status='failed',error_message=? WHERE id=?",[error instanceof Error ? error.message:"Falha na geração",item.id]); }
}
