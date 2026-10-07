import { useState, type ReactNode } from "react";
import { SafeImage } from "./SafeImage";
import { SocialCreativeImages } from "./SocialCreativeImages";
import { MessageCircle } from "lucide-react";
import { Link } from "react-router-dom";

export interface SocialContent {
  id:number; batch_id:number; scheduled_date:string; format:string; topic:string; caption:string;
  alt_text:string; status:string; error_message:string|null; images:Array<{url:string;quality_issues?:string[]}>;
  sources:Array<{title:string;url:string;date:string}>;
  revisions?:Array<{at:string;images:Array<{url:string}>}>;
}
const statuses:Record<string,string>={draft:"Ideia para aprovação",pending:"Na fila",processing:"Produzindo",review:"Aguardando sua revisão",approved:"Aprovado",rejected:"Reprovado",failed:"Precisa de atenção",cancelled:"Cancelado"};
const formats:Record<string,string>={post:"Publicação",carousel:"Carrossel",story:"Story"};

export function SocialContentCard({item,busy,selected,onSelect,download,act,editor,onError,onSendWhatsapp}:{
  item:SocialContent; busy:boolean; selected:number[]; onSelect:(indexes:number[])=>void;
  download:(url:string,filename:string)=>void;
  onError:(message:string)=>void;
  onSendWhatsapp:(id:number)=>void;
  act:(action:"generate"|"approve"|"reject",note?:string)=>Promise<void>; editor:ReactNode;
}) {
  const [rejectOpen,setRejectOpen]=useState(false);
  const [note,setNote]=useState("");
  return <article className={`panel space-y-4 p-5 sm:p-6 ${selected.length?"ring-2 ring-brand/20":""}`}>
    <header className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm text-slate-500">{item.scheduled_date.slice(0,10).split("-").reverse().join("/")} · {formats[item.format]||item.format}</span><span className={`status-badge ${item.status==="failed"?"bg-red-50 text-red-800":item.status==="approved"?"bg-emerald-50 text-emerald-800":""}`}>{statuses[item.status]||item.status}</span></header>
    <h3 className="text-lg font-semibold">{item.topic}</h3>
    {item.error_message&&<div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><p className="font-semibold">Esta produção precisa de atenção</p><p className="mt-1 break-words">{item.error_message}</p><p className="mt-2">Tente novamente ou selecione a arte para pedir uma correção. As imagens disponíveis serão preservadas.</p></div>}
    <div className="studio-review-grid">
    <SocialCreativeImages content={item} selected={selected} onSelect={onSelect} busy={busy} download={download}/>
    <div className="space-y-4">
    {item.caption&&<section aria-label="Legenda do conteúdo" className="rounded-xl bg-slate-50 p-4"><h4 className="mb-2 text-sm font-semibold">Legenda</h4><p className="whitespace-pre-wrap text-sm leading-relaxed">{item.caption}</p><button type="button" className="btn-secondary mt-3" onClick={()=>{if(!navigator.clipboard){onError("Não foi possível copiar a legenda. Selecione o texto e copie manualmente.");return;}void navigator.clipboard.writeText(item.caption).catch(()=>onError("Não foi possível copiar a legenda. Selecione o texto e copie manualmente."));}}>Copiar legenda</button>{item.alt_text&&<details className="mt-3"><summary className="cursor-pointer text-sm text-slate-600">Descrição acessível da imagem</summary><p className="mt-2 text-sm">{item.alt_text}</p></details>}</section>}
    {editor}
    {!item.caption&&<p className="helper">A legenda aparecerá aqui depois de gerar o conteúdo.</p>}
    <div className="studio-summary"><strong>Antes de aprovar</strong><p className="helper">Confira o idioma, a identidade da marca e os dados de contato. Para ajustar imagens, selecione as artes e descreva a correção.</p></div>
    <div className="flex flex-wrap gap-2">
      {["review","approved"].includes(item.status)&&item.images.filter(image=>Boolean(image?.url)).length >= (item.format==="carousel"?3:1)&&<button type="button" disabled={busy} className="btn-secondary" onClick={()=>onSendWhatsapp(item.id)}><MessageCircle size={16}/> Enviar via WhatsApp</button>}
      {["draft","failed","cancelled"].includes(item.status)&&<button type="button" disabled={busy} className="btn-primary" onClick={()=>void act("generate")}>{item.status==="draft"?"Aprovar ideia e gerar":"Tentar geração novamente"}</button>}
      {item.status==="review"&&<button type="button" disabled={busy} className="btn-primary" onClick={()=>void act("approve")}>Aprovar conteúdo</button>}
      {item.status==="approved"&&<Link className="btn-primary" to="/calendario">Agendar publicação</Link>}
      {["review","approved"].includes(item.status)&&<button type="button" disabled={busy} className="btn-secondary" aria-expanded={rejectOpen} onClick={()=>setRejectOpen(current=>!current)}>Reprovar conteúdo</button>}
    </div>
    {rejectOpen&&<div className="rounded-xl border border-slate-200 p-4"><label className="label" htmlFor={`reject-${item.id}`}>O que precisa melhorar?<textarea id={`reject-${item.id}`} className="field" rows={2} value={note} onChange={e=>setNote(e.target.value)} placeholder="Descreva o motivo da reprovação"/></label><p className="helper">Reprovar não refaz as imagens. Para isso, selecione as artes e peça uma correção.</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={busy} className="btn-danger" onClick={()=>void act("reject",note)}>Confirmar reprovação</button><button type="button" disabled={busy} className="btn-secondary" onClick={()=>setRejectOpen(false)}>Cancelar</button></div></div>}
    </div></div>
    {item.sources.length>0&&<details><summary className="cursor-pointer text-sm font-medium">Fontes da pesquisa ({item.sources.length})</summary><div className="mt-2 space-y-2">{item.sources.map(source=><a className="block break-words text-sm text-brand underline" key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.title} · {source.date}</a>)}</div></details>}
    {Boolean(item.revisions?.length)&&<details><summary className="cursor-pointer text-sm font-medium">Versões anteriores ({item.revisions?.length})</summary>{item.revisions?.map((revision,version)=><div key={version} className="mt-3"><p className="text-xs text-slate-500">Versão {version+1} · {new Date(revision.at).toLocaleString("pt-BR")}</p><div className="mt-2 flex flex-wrap gap-2">{revision.images.filter(image=>image?.url).map((image,index)=><SafeImage key={index} src={image.url} alt={`Versão anterior, arte ${index+1}`} className="max-h-48 w-32 rounded-lg object-contain"/>)}</div></div>)}</details>}
  </article>;
}
