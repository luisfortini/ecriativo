import { useEffect, useState } from "react";
import { getClients, request } from "../services/api";
import { PageHeader } from "../components/PageHeader";
import { VisualSelector, emptySelection, type VisualSelection } from "../components/VisualLibrary";
import type { ClientSummary } from "../types";
import { getAuthToken } from "../auth/authStorage";
import { API_URL } from "../services/api";
import { SocialContentCard, type SocialContent } from "../components/SocialContentCard";
import { ErrorBanner } from "../components/ErrorBanner";
import { EmptyState } from "../components/EmptyState";
import { LoadingBlock } from "../components/LoadingBlock";
import { useResolveErrorFeedback } from "../components/FeedbackProvider";

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
type Content = SocialContent;
interface Calendar {plan:Plan;batches:Array<{id:number;week_start:string;status:string;research_note:string;image_calls:number}>;contents:Content[]}
const initial={client_id:"",name:"",posts_per_week:5,pillars:"Educação\nRelacionamento\nBastidores",formats:["post"],weekly_image_limit:10,automatic:false,active:false};
const labels:Record<string,string>={draft:"Pauta para aprovação",pending:"Na fila",processing:"Produzindo",review:"Revisar conteúdo",approved:"Aprovado",rejected:"Reprovado",failed:"Falhou",cancelled:"Cancelado",planning:"Pesquisando",ready:"Planejado"};
const json=(body:unknown)=>({headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});

function ContentEditor({item,busy,save}:{item:Content;busy:boolean;save:(body:unknown)=>Promise<void>}) {
  const [topic,setTopic]=useState(item.topic);
  const [caption,setCaption]=useState(item.caption);
  const [alt,setAlt]=useState(item.alt_text);
  useEffect(()=>{setTopic(item.topic);setCaption(item.caption);setAlt(item.alt_text);},[item.topic,item.caption,item.alt_text]);
  return <details className="rounded-xl border border-slate-200 p-3"><summary className="cursor-pointer text-sm font-medium">Editar ideia e legenda</summary><div className="my-3 space-y-3">
    <label className="label">Pauta<textarea className="field" value={topic} onChange={e=>setTopic(e.target.value)}/></label>
    {item.status!=="draft"&&<><label className="label">Legenda<textarea rows={5} className="field" value={caption} onChange={e=>setCaption(e.target.value)}/></label><label className="label">Texto alternativo<textarea className="field" value={alt} onChange={e=>setAlt(e.target.value)}/></label></>}
    <button type="button" disabled={busy} className="btn-secondary" onClick={()=>void save({topic,caption,alt_text:alt})}>Salvar texto</button>
    <p className="text-xs text-slate-500">Alterar o texto não refaz imagens. Para isso, informe os ajustes e use “Refazer com ajustes”.</p>
  </div></details>;
}

export function SocialMedia() {
  const resolveError=useResolveErrorFeedback();
  const [view,setView]=useState<"review"|"plans">("review");
  const [loading,setLoading]=useState(true);
  const [calendarLoading,setCalendarLoading]=useState(false);
  const [filter,setFilter]=useState("all");
  const [plans,setPlans]=useState<Plan[]>([]);
  const [clients,setClients]=useState<ClientSummary[]>([]);
  const [form,setForm]=useState(initial);
  const [visual,setVisual]=useState(emptySelection);
  const [editing,setEditing]=useState<number|null>(null);
  const [selected,setSelected]=useState<number|null>(null);
  const [calendar,setCalendar]=useState<Calendar|null>(null);
  const [error,setError]=useState("");
  const [success,setSuccess]=useState("");
  const [busy,setBusy]=useState(false);
  const [week,setWeek]=useState("");
  const [correctionNote,setCorrectionNote]=useState("");
  const [correctionError,setCorrectionError]=useState(false);
  const [selectedImages,setSelectedImages]=useState<Record<string,number[]>>({});
  const selectedCount=Object.values(selectedImages).reduce((total,indexes)=>total+indexes.length,0);
  useEffect(()=>{setSelectedImages({});setCorrectionNote("");setCorrectionError(false);},[selected]);
  const load=()=>request<Plan[]>("/social-media/plans").then(data=>{setPlans(data);setSelected(current=>current??(data[0]?Number(data[0].id):null));});
  const refresh=async()=>{await load();if(selected)setCalendar(await request<Calendar>(`/social-media/plans/${selected}/calendar`));};
  useEffect(()=>{void Promise.all([load(),getClients().then(setClients)]).catch(e=>setError(e.message)).finally(()=>setLoading(false));},[]);
  useEffect(()=>{let active=true;setCalendar(null);setCalendarLoading(Boolean(selected));if(!selected)return;const reload=()=>request<Calendar>(`/social-media/plans/${selected}/calendar`).then(data=>{if(active)setCalendar(data);}).catch(e=>{if(active)setError(e.message);}).finally(()=>{if(active)setCalendarLoading(false);});void reload();const timer=setInterval(reload,20000);return()=>{active=false;clearInterval(timer);};},[selected]);
  async function perform(action:()=>Promise<unknown>) {if(busy)return;setBusy(true);setError("");setSuccess("");try{await action();setSuccess("Solicitação recebida. Acompanhe o andamento nos conteúdos deste plano.");await refresh();resolveError(error);}catch(e){setSuccess("");setError(e instanceof Error?e.message:"Não foi possível concluir. Seu preenchimento foi mantido.");}finally{setBusy(false);}}
  function edit(plan:Plan) {setView("plans");setEditing(Number(plan.id));setForm({client_id:String(plan.client_id),name:plan.name,posts_per_week:plan.posts_per_week,pillars:plan.pillars.join("\n"),formats:plan.formats,weekly_image_limit:plan.weekly_image_limit,automatic:plan.automatic,active:plan.active});setVisual({...emptySelection,...plan.visual_selection});}
  return <>
    <PageHeader title="Social media" description="Conteúdo orgânico semanal com tendências, datas locais e a identidade de cada cliente."/>
    {error&&<ErrorBanner message={error}/>}
    {success&&<div role="status" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700"><p>{success}</p><button type="button" className="btn-secondary" onClick={()=>setSuccess("")}>Fechar confirmação</button></div>}
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4"><div role="group" aria-label="Área de social media" className="flex flex-wrap gap-2"><button type="button" className={view==="review"?"btn-primary":"btn-secondary"} aria-pressed={view==="review"} onClick={()=>setView("review")}>Revisar conteúdos</button><button type="button" className={view==="plans"?"btn-primary":"btn-secondary"} aria-pressed={view==="plans"} onClick={()=>setView("plans")}>Configurar planos</button></div>{plans.length>0&&<label className="label m-0 w-full sm:w-72">Plano de conteúdo<select className="field" disabled={busy} value={selected??""} onChange={e=>setSelected(Number(e.target.value))}>{plans.map(plan=><option key={plan.id} value={plan.id}>{plan.client_name} · {plan.name}</option>)}</select></label>}</div>
    {busy&&<p role="status" className="mb-4 rounded-xl bg-slate-100 p-3 text-sm text-slate-700">Estamos processando sua solicitação. Aguarde para realizar outra ação.</p>}
    {loading?<LoadingBlock/>:<div className={`grid gap-6 ${view==="plans"?"xl:grid-cols-[380px_1fr]":""}`}>
      {view==="plans"&&<div className="space-y-5">
        <form className="panel space-y-4 p-5" onSubmit={e=>{e.preventDefault();if(!form.formats.length){setError("Escolha pelo menos um formato para as publicações.");return;}void perform(async()=>{const saved=await request<{id:number}>(editing?`/social-media/plans/${editing}`:"/social-media/plans",{method:editing?"PUT":"POST",...json({...form,client_id:Number(form.client_id),pillars:form.pillars.split("\n").map(s=>s.trim()).filter(Boolean),visual_selection:visual})});setSelected(Number(saved.id));setEditing(null);setForm(initial);setVisual(emptySelection);setView("review");});}}>
          <h2 className="font-bold">{editing?"Editar plano":"Novo plano editorial"}</h2>
          <label className="label">Cliente<select required disabled={Boolean(editing)} className="field" value={form.client_id} onChange={e=>{setForm({...form,client_id:e.target.value});setVisual(emptySelection);}}><option value="">Selecione</option>{clients.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <p className="text-xs text-slate-500">Cidade, estado, país e aniversário vêm dos dados gerais do cliente.</p>
          <label className="label">Nome do plano<input required minLength={2} className="field" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label>
          <label className="label">Publicações por semana<input type="number" min={1} max={21} required className="field" value={form.posts_per_week} onChange={e=>setForm({...form,posts_per_week:Number(e.target.value)})}/></label>
          <label className="label">Assuntos da marca (um por linha)<textarea required rows={3} className="field" value={form.pillars} onChange={e=>setForm({...form,pillars:e.target.value})}/></label>
          <p className="helper">Por exemplo: dicas, bastidores e novidades dos produtos.</p>
          <div className="flex flex-wrap gap-3">{[['post','Post'],['carousel','Carrossel (3 artes)'],['story','Story']].map(([value,label])=><label className="text-sm" key={value}><input type="checkbox" checked={form.formats.includes(value)} onChange={e=>setForm({...form,formats:e.target.checked?[...form.formats,value]:form.formats.filter(f=>f!==value)})}/> {label}</label>)}</div>
          <label className="label">Limite de imagens por semana<input type="number" min={1} max={100} required className="field" value={form.weekly_image_limit} onChange={e=>setForm({...form,weekly_image_limit:Number(e.target.value)})}/></label>
          <p className="text-xs text-slate-500">Cada arte e nova tentativa consome uma unidade. Pesquisa e texto também têm custos registrados em Custos de IA.</p>
          <VisualSelector clientId={Number(form.client_id)} value={visual} onChange={setVisual}/>
          <label className="block text-sm"><input type="checkbox" checked={form.automatic} onChange={e=>setForm({...form,automatic:e.target.checked})}/> Produzir automaticamente as pautas da semana</label>
          <label className="block text-sm"><input type="checkbox" checked={form.active} onChange={e=>setForm({...form,active:e.target.checked})}/> Plano ativo</label>
          <p className="text-xs text-slate-500">Conteúdos produzidos aguardam revisão final. Ativar um plano permite pesquisa e geração conforme os limites.</p>
          <button disabled={busy} className="btn-primary w-full">{busy?"Salvando…":"Salvar e ir para os conteúdos"}</button>
          {editing&&<button type="button" className="btn-secondary w-full" disabled={busy} onClick={()=>{setEditing(null);setForm(initial);setVisual(emptySelection);}}>Cancelar edição</button>}
        </form>
      </div>}
      <div className="space-y-5">
        {view==="plans"&&<section className="panel p-5"><h2 className="mb-3 font-semibold">Planos de conteúdo</h2>{!plans.length&&<p className="text-slate-500">Cadastre o primeiro plano para organizar a produção semanal.</p>}{plans.map(plan=><div className="flex flex-wrap items-center justify-between gap-3 border-b py-3" key={plan.id}><button type="button" disabled={busy} className="rounded-xl p-2 text-left hover:bg-slate-100" onClick={()=>{setSelected(Number(plan.id));setView("review");}}><strong>{plan.name}</strong><p className="text-sm text-slate-500">{plan.client_name} · {plan.posts_per_week}/semana · {plan.active?"Ativo":"Pausado"}</p></button><div className="flex gap-2"><button type="button" disabled={busy} className="btn-secondary" onClick={()=>edit(plan)}>Editar</button><button type="button" disabled={busy} className="btn-secondary" onClick={()=>void perform(()=>request(`/social-media/plans/${plan.id}`,{method:"PUT",...json({...plan,active:!plan.active})}))}>{plan.active?"Pausar":"Ativar"}</button></div></div>)}</section>}
        {view==="review"&&!selected&&<EmptyState><p className="font-semibold">Vamos planejar o primeiro conteúdo?</p><p className="helper">Escolha o cliente, os assuntos e a quantidade de publicações por semana.</p><button type="button" className="btn-primary mt-4" onClick={()=>setView("plans")}>Criar meu primeiro plano</button></EmptyState>}
        {view==="review"&&selected&&!calendar&&(calendarLoading?<LoadingBlock/>:<EmptyState><p>Não foi possível carregar os conteúdos deste plano.</p><button type="button" className="btn-secondary mt-3" disabled={busy} onClick={()=>void perform(refresh)}>Tentar novamente</button></EmptyState>)}
        {view==="review"&&calendar&&<>
          <section className="panel p-5"><h2 className="text-lg font-semibold">Planejar a semana · {calendar.plan.name}</h2><div className="my-3 flex flex-wrap items-end gap-3"><label className="label">Início da semana (segunda-feira)<input className="field" type="date" value={week} onChange={e=>setWeek(e.target.value)}/></label><button type="button" disabled={busy||!calendar.plan.active} className="btn-primary" onClick={()=>void perform(()=>request(`/social-media/plans/${selected}/batches`,{method:"POST",...json({...(week?{week_start:week}:{}),retry:true})}))}>{busy?"Processando…":"Planejar semana"}</button></div><p className="helper">Deixe a data em branco para usar a semana atual. Vamos pesquisar ideias e organizar as publicações. Se uma tentativa falhar, use este botão para retomar.</p>{!calendar.plan.active&&<p className="mt-3 text-sm text-amber-800">Este plano está pausado. Ative-o em “Configurar planos” para planejar a produção.</p>}{calendar.batches.map(batch=><div key={batch.id} className="mt-3 rounded-xl bg-slate-50 p-3 text-sm"><span className="font-medium">Semana de {batch.week_start.slice(0,10).split("-").reverse().join("/")}</span><span className="status-badge ml-2">{labels[batch.status]||batch.status}</span><p className="mt-2 text-slate-600">{batch.research_note}</p><p className="mt-1 text-xs text-slate-500">{batch.image_calls} imagens solicitadas</p></div>)}</section>
          <div className="flex flex-wrap items-end justify-between gap-3"><h2 className="text-lg font-semibold">Conteúdos para acompanhar</h2><label className="label m-0">Mostrar<select className="field" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">Todos os conteúdos</option><option value="review">Aguardando revisão</option><option value="failed">Com erro</option><option value="approved">Aprovados</option></select></label></div>
          {!calendar.contents.length&&<EmptyState>Seu plano está pronto. Use “Planejar semana” para pesquisar ideias e organizar as publicações.</EmptyState>}
          {calendar.contents.length>0&&!calendar.contents.some(item=>filter==="all"||item.status===filter)&&<EmptyState>Nenhum conteúdo nesta situação. Escolha outro filtro.</EmptyState>}
          {calendar.contents.filter(item=>filter==="all"||item.status===filter).map(item=><SocialContentCard key={item.id} item={item} busy={busy} selected={selectedImages[String(item.id)]||[]} onSelect={indexes=>setSelectedImages(current=>({...current,[String(item.id)]:indexes}))} onError={setError} download={(url,filename)=>void downloadImage(url,filename).catch(e=>setError(e.message))} act={(action,note)=>perform(()=>request(`/social-media/contents/${item.id}/${action}`,{method:"POST",...json(action==="generate"?{}:{note:note||""})}))} editor={["draft","review","rejected"].includes(item.status)?<ContentEditor key={`${item.id}-${item.status}`} item={item} busy={busy} save={body=>perform(()=>request(`/social-media/contents/${item.id}`,{method:"PUT",...json(body)}))}/>:null}/>)}
          {selectedCount>0&&<section aria-label="Corrigir artes selecionadas" className="action-bar space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{selectedCount} arte{selectedCount>1?"s":""} selecionada{selectedCount>1?"s":""} para corrigir</h3><button type="button" className="btn-secondary" disabled={busy} onClick={()=>setSelectedImages({})}>Limpar seleção</button></div>
            <label className="label" htmlFor="social-correction-note">O que devemos corrigir?</label><textarea id="social-correction-note" className="field" rows={2} aria-invalid={correctionError} aria-describedby={correctionError?"social-correction-error":undefined} value={correctionNote} onChange={e=>{setCorrectionNote(e.target.value);setCorrectionError(false);}} placeholder="Ex.: manter a embalagem original e deixar o texto mais legível"/>
            {correctionError&&<p id="social-correction-error" role="alert" className="text-sm text-red-800">Descreva o que deve mudar antes de solicitar a correção.</p>}
            <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-slate-600">As outras artes e a legenda serão mantidas. Cada arte selecionada utiliza uma nova geração.</p><button type="button" disabled={busy||!calendar.plan.active} className="btn-primary" onClick={()=>{
              if(correctionNote.trim().length<3){setCorrectionError(true);document.getElementById("social-correction-note")?.focus();return;}
              void perform(async()=>{
                const targets=Object.entries(selectedImages).filter(([,indexes])=>indexes.length).map(([id,indexes])=>({content_id:Number(id),image_indexes:indexes}));
                await request(`/social-media/plans/${selected}/corrections`,{method:"POST",...json({note:correctionNote,targets})});
                setSelectedImages({});setCorrectionNote("");
              });
            }}>{busy?"Enviando…":"Refazer artes selecionadas"}</button></div>
            {!calendar.plan.active&&<p className="text-sm text-amber-800">Este plano está pausado. Ative-o em “Configurar planos” para solicitar correções.</p>}
          </section>}
        </>}
      </div>
    </div>}
  </>;
}
