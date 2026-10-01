import { useEffect, useState } from "react";
import { getClients, request } from "../services/api";
import { PageHeader } from "../components/PageHeader";
import { SafeImage } from "../components/SafeImage";
import { VisualSelector, emptySelection, type VisualSelection } from "../components/VisualLibrary";
import type { ClientSummary } from "../types";
import { getAuthToken } from "../auth/authStorage";
import { API_URL } from "../services/api";

async function downloadImage(url:string,filename:string) {
  const source=new URL(url,API_URL);
  const mediaPath=source.pathname.match(/\/(generated|uploads)\/[^/]+$/)?.[0];
  if(!mediaPath) throw new Error("Arquivo não disponível para download.");
  const token=getAuthToken();
  const response=await fetch(new URL(mediaPath,API_URL),{credentials:"include",headers:token?{Authorization:`Bearer ${token}`}:undefined});
  if(!response.ok)throw new Error("Não foi possível baixar a imagem.");
  const objectUrl=URL.createObjectURL(await response.blob());
  const link=document.createElement("a");link.href=objectUrl;link.download=filename;link.click();
  setTimeout(()=>URL.revokeObjectURL(objectUrl),1000);
}

interface Plan {id:number;client_id:number;client_name:string;name:string;active:boolean;automatic:boolean;posts_per_week:number;pillars:string[];formats:string[];weekly_image_limit:number;visual_selection:VisualSelection}
interface Content {id:number;batch_id:number;scheduled_date:string;format:string;topic:string;caption:string;alt_text:string;status:string;error_message:string|null;images:Array<{url:string}>;sources:Array<{title:string;url:string;date:string}>}
interface Calendar {plan:Plan;batches:Array<{id:number;week_start:string;status:string;research_note:string;image_calls:number}>;contents:Content[]}
const initial={client_id:"",name:"",posts_per_week:5,pillars:"Educação\nRelacionamento\nBastidores",formats:["post"],weekly_image_limit:10,automatic:false,active:false};
const labels:Record<string,string>={draft:"Pauta para aprovação",pending:"Na fila",processing:"Produzindo",review:"Revisar conteúdo",approved:"Aprovado",rejected:"Reprovado",failed:"Falhou",cancelled:"Cancelado",planning:"Pesquisando",ready:"Planejado"};
const json=(body:unknown)=>({headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});

function ContentEditor({item,busy,save}:{item:Content;busy:boolean;save:(body:unknown)=>Promise<void>}) {
  const [topic,setTopic]=useState(item.topic);
  const [caption,setCaption]=useState(item.caption);
  const [alt,setAlt]=useState(item.alt_text);
  useEffect(()=>{setTopic(item.topic);setCaption(item.caption);setAlt(item.alt_text);},[item.topic,item.caption,item.alt_text]);
  return <details><summary className="cursor-pointer text-sm underline">Editar pauta e texto</summary><div className="my-3 space-y-3">
    <label className="label">Pauta<textarea className="field" value={topic} onChange={e=>setTopic(e.target.value)}/></label>
    {item.status!=="draft"&&<><label className="label">Legenda<textarea rows={5} className="field" value={caption} onChange={e=>setCaption(e.target.value)}/></label><label className="label">Texto alternativo<textarea className="field" value={alt} onChange={e=>setAlt(e.target.value)}/></label></>}
    <button disabled={busy} className="rounded bg-brand px-3 py-2 text-white" onClick={()=>void save({topic,caption,alt_text:alt})}>Salvar texto</button>
    <p className="text-xs text-slate-500">Alterar o texto não refaz imagens. Para isso, informe os ajustes e use “Refazer com ajustes”.</p>
  </div></details>;
}

export function SocialMedia() {
  const [plans,setPlans]=useState<Plan[]>([]);
  const [clients,setClients]=useState<ClientSummary[]>([]);
  const [form,setForm]=useState(initial);
  const [visual,setVisual]=useState(emptySelection);
  const [editing,setEditing]=useState<number|null>(null);
  const [selected,setSelected]=useState<number|null>(null);
  const [calendar,setCalendar]=useState<Calendar|null>(null);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const [week,setWeek]=useState("");
  const [reviewNote,setReviewNote]=useState("");
  const load=()=>request<Plan[]>("/social-media/plans").then(setPlans);
  const refresh=async()=>{await load();if(selected)setCalendar(await request<Calendar>(`/social-media/plans/${selected}/calendar`));};
  useEffect(()=>{void Promise.all([load(),getClients().then(setClients)]).catch(e=>setError(e.message));},[]);
  useEffect(()=>{let active=true;setCalendar(null);if(!selected)return;const reload=()=>request<Calendar>(`/social-media/plans/${selected}/calendar`).then(data=>{if(active)setCalendar(data);}).catch(e=>{if(active)setError(e.message);});void reload();const timer=setInterval(reload,20000);return()=>{active=false;clearInterval(timer);};},[selected]);
  async function perform(action:()=>Promise<unknown>) {setBusy(true);setError("");try{await action();await refresh();}catch(e){setError(e instanceof Error?e.message:"Não foi possível concluir.");}finally{setBusy(false);}}
  function edit(plan:Plan) {setEditing(Number(plan.id));setForm({client_id:String(plan.client_id),name:plan.name,posts_per_week:plan.posts_per_week,pillars:plan.pillars.join("\n"),formats:plan.formats,weekly_image_limit:plan.weekly_image_limit,automatic:plan.automatic,active:plan.active});setVisual({...emptySelection,...plan.visual_selection});}
  return <>
    <PageHeader title="Social media" description="Conteúdo orgânico semanal com tendências, datas locais e a identidade de cada cliente."/>
    {error&&<p className="mb-4 rounded bg-red-50 p-4 text-red-700" role="alert">{error}</p>}
    <div className="grid gap-6 xl:grid-cols-[380px_1fr]">
      <div className="space-y-5">
        <form className="panel space-y-3 p-5" onSubmit={e=>{e.preventDefault();void perform(async()=>{const saved=await request<{id:number}>(editing?`/social-media/plans/${editing}`:"/social-media/plans",{method:editing?"PUT":"POST",...json({...form,client_id:Number(form.client_id),pillars:form.pillars.split("\n").map(s=>s.trim()).filter(Boolean),visual_selection:visual})});setSelected(Number(saved.id));setEditing(null);setForm(initial);setVisual(emptySelection);});}}>
          <h2 className="font-bold">{editing?"Editar plano":"Novo plano editorial"}</h2>
          <label className="label">Cliente<select required disabled={Boolean(editing)} className="field" value={form.client_id} onChange={e=>{setForm({...form,client_id:e.target.value});setVisual(emptySelection);}}><option value="">Selecione</option>{clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <p className="text-xs text-slate-500">Cidade, estado, país e aniversário vêm dos dados gerais do cliente.</p>
          <label className="label">Nome do plano<input required minLength={2} className="field" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label>
          <label className="label">Publicações por semana<input type="number" min={1} max={21} required className="field" value={form.posts_per_week} onChange={e=>setForm({...form,posts_per_week:Number(e.target.value)})}/></label>
          <label className="label">Pilares editoriais (um por linha)<textarea required rows={4} className="field" value={form.pillars} onChange={e=>setForm({...form,pillars:e.target.value})}/></label>
          <div className="flex flex-wrap gap-3">{[['post','Post'],['carousel','Carrossel (3 artes)'],['story','Story']].map(([value,label])=><label className="text-sm" key={value}><input type="checkbox" checked={form.formats.includes(value)} onChange={e=>setForm({...form,formats:e.target.checked?[...form.formats,value]:form.formats.filter(f=>f!==value)})}/> {label}</label>)}</div>
          <label className="label">Limite de imagens por semana<input type="number" min={1} max={100} required className="field" value={form.weekly_image_limit} onChange={e=>setForm({...form,weekly_image_limit:Number(e.target.value)})}/></label>
          <p className="text-xs text-slate-500">Cada arte e nova tentativa consome uma unidade. Pesquisa e texto também têm custos registrados em Custos de IA.</p>
          <VisualSelector clientId={Number(form.client_id)} value={visual} onChange={setVisual}/>
          <label className="block text-sm"><input type="checkbox" checked={form.automatic} onChange={e=>setForm({...form,automatic:e.target.checked})}/> Produzir automaticamente as pautas da semana</label>
          <label className="block text-sm"><input type="checkbox" checked={form.active} onChange={e=>setForm({...form,active:e.target.checked})}/> Plano ativo</label>
          <p className="text-xs text-slate-500">Conteúdos produzidos aguardam revisão final. Ativar um plano permite pesquisa e geração conforme os limites.</p>
          <button disabled={busy} className="w-full rounded bg-brand p-3 text-white">{busy?"Salvando…":"Salvar plano"}</button>
          {editing&&<button type="button" onClick={()=>{setEditing(null);setForm(initial);setVisual(emptySelection);}}>Cancelar edição</button>}
        </form>
      </div>
      <div className="space-y-5">
        <section className="panel p-5"><h2 className="mb-3 font-bold">Planos editoriais</h2>{!plans.length&&<p className="text-slate-500">Cadastre o primeiro plano para organizar a produção semanal.</p>}{plans.map(plan=><div className="flex flex-wrap items-center justify-between gap-3 border-b py-3" key={plan.id}><button className="text-left" onClick={()=>setSelected(Number(plan.id))}><strong>{plan.name}</strong><p className="text-sm text-slate-500">{plan.client_name} · {plan.posts_per_week}/semana · {plan.active?"Ativo":"Pausado"}</p></button><div><button className="mr-3 underline" onClick={()=>edit(plan)}>Editar</button><button disabled={busy} className="underline" onClick={()=>void perform(()=>request(`/social-media/plans/${plan.id}`,{method:"PUT",...json({...plan,active:!plan.active})}))}>{plan.active?"Pausar":"Ativar"}</button></div></div>)}</section>
        {calendar&&<>
          <section className="panel p-5"><h2 className="font-bold">Calendário · {calendar.plan.name}</h2><div className="my-3 flex flex-wrap items-end gap-3"><label className="label">Semana (segunda-feira)<input className="field" type="date" value={week} onChange={e=>setWeek(e.target.value)}/></label><button disabled={busy} className="rounded bg-brand p-3 text-white" onClick={()=>void perform(()=>request(`/social-media/plans/${selected}/batches`,{method:"POST",...json({...(week?{week_start:week}:{}),retry:true})}))}>{busy?"Pesquisando e planejando…":"Planejar semana"}</button></div><p className="text-xs text-slate-500">Em branco: semana atual. Cada semana tem um único lote. “Planejar semana” também retoma um planejamento com falha ou interrompido há mais de 30 minutos. Atualização automática a cada 20 segundos.</p>{calendar.batches.map(batch=><p key={batch.id} className="mt-3 border-t pt-3 text-sm">Semana {batch.week_start.slice(0,10)} · {labels[batch.status]||batch.status} · {batch.image_calls} imagens solicitadas<br/>{batch.research_note}</p>)}</section>
          <label className="label">Observação para revisão/reprovação<textarea className="field" value={reviewNote} onChange={e=>setReviewNote(e.target.value)}/></label>
          {calendar.contents.map(item=><article key={item.id} className="panel space-y-3 p-5"><div className="flex justify-between gap-2"><span className="text-sm text-slate-500">{item.scheduled_date.slice(0,10)} · {item.format}</span><span className="rounded bg-slate-100 px-2 py-1 text-xs">{labels[item.status]||item.status}</span></div><h3 className="font-semibold">{item.topic}</h3>{["draft","review","rejected"].includes(item.status)&&<ContentEditor key={`${item.id}-${item.status}`} item={item} busy={busy} save={body=>perform(()=>request(`/social-media/contents/${item.id}`,{method:"PUT",...json(body)}))}/>}{item.error_message&&<p className="text-red-700">{item.error_message}</p>}<div className="flex flex-wrap gap-3">{item.images.map((image,i)=><div key={image.url}><SafeImage src={image.url} alt={item.alt_text||`Arte ${i+1}`} className="max-h-80 w-56 rounded object-contain"/><button className="text-sm underline" onClick={()=>void downloadImage(image.url,`conteudo-${item.id}-${i+1}.png`).catch(e=>setError(e.message))}>Baixar arte {i+1}</button></div>)}</div>{item.caption&&<><p className="whitespace-pre-wrap text-sm">{item.caption}</p><p className="text-xs text-slate-500">Texto alternativo: {item.alt_text}</p><button className="text-sm underline" onClick={()=>void navigator.clipboard.writeText(item.caption).catch(()=>setError("Não foi possível copiar a legenda."))}>Copiar legenda</button></>}{item.sources.map(source=><a className="block text-xs text-brand underline" key={source.url} href={source.url} target="_blank" rel="noreferrer">Fonte: {source.title} · {source.date}</a>)}<div className="flex gap-3">{["review","rejected"].includes(item.status)&&<button disabled={busy} className="underline" onClick={()=>void perform(()=>request(`/social-media/contents/${item.id}/regenerate`,{method:"POST",...json({note:reviewNote})}))}>Refazer com ajustes</button>}{["draft","failed","cancelled"].includes(item.status)&&<button disabled={busy} className="rounded bg-brand px-3 py-2 text-white" onClick={()=>void perform(()=>request(`/social-media/contents/${item.id}/generate`,{method:"POST",...json({})}))}>Aprovar pauta e gerar</button>}{item.status==="review"&&<button disabled={busy} className="rounded bg-accent px-3 py-2 text-white" onClick={()=>void perform(()=>request(`/social-media/contents/${item.id}/approve`,{method:"POST",...json({note:reviewNote})}))}>Aprovar conteúdo</button>}{["review","approved"].includes(item.status)&&<button disabled={busy} className="underline" onClick={()=>void perform(()=>request(`/social-media/contents/${item.id}/reject`,{method:"POST",...json({note:reviewNote})}))}>Reprovar</button>}</div></article>)}
        </>}
      </div>
    </div>
  </>;
}
