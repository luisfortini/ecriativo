import { SafeImage } from "./SafeImage";

export interface SocialImage {url:string;quality_issues?:string[]}
export function SocialCreativeImages({content,selected,onSelect,busy,download}:{content:{id:number;format:string;status:string;alt_text:string;images:SocialImage[]};selected:number[];onSelect:(indexes:number[])=>void;busy:boolean;download:(url:string,filename:string)=>void}) {
  const count=content.format==="carousel"?3:1;
  const selectable=["review","rejected","approved","failed","cancelled"].includes(content.status);
  return <div className="space-y-3">
    {selectable&&<div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm text-slate-600">Selecione as artes que precisam de ajuste.</p><button type="button" disabled={busy} className="btn-secondary" onClick={()=>onSelect(selected.length===count?[]:Array.from({length:count},(_,i)=>i))}>{selected.length===count?"Desmarcar todas":"Selecionar todas"}</button></div>}
    <div className={count===1?"max-w-sm":"grid gap-3 sm:grid-cols-2 xl:grid-cols-3"}>{Array.from({length:count},(_,index)=>{
      const image=content.images[index];
      return <div key={index} className={selected.includes(index)?"min-w-0 rounded-xl border-2 border-brand bg-slate-50 p-3":"min-w-0 rounded-xl border border-slate-200 p-3"}>
        {Boolean(image?.quality_issues?.length)&&<p role="alert" className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-800">{image.quality_issues!.join(" ")}</p>}
        {selectable?<label className="mb-3 flex min-h-11 items-center gap-2 text-sm font-medium"><input type="checkbox" disabled={busy} checked={selected.includes(index)} onChange={e=>onSelect(e.target.checked?[...selected,index]:selected.filter(i=>i!==index))}/> Corrigir arte {index+1}</label>:<p className="mb-3 text-sm font-medium">Arte {index+1}</p>}
        {image?.url?<><SafeImage src={image.url} alt={content.alt_text||`Arte ${index+1}`} className="max-h-80 w-full rounded-lg object-contain"/><button type="button" className="btn-secondary mt-3 w-full" onClick={()=>download(image.url,`conteudo-${content.id}-${index+1}.png`)}>Baixar arte {index+1}</button></>:<div className="flex min-h-40 items-center justify-center rounded-lg bg-slate-100 p-4 text-center text-sm text-slate-600">Arte {index+1}<br/>{selectable?"Imagem não disponível. Selecione para pedir uma correção.":"Aguardando geração da imagem."}</div>}
      </div>;
    })}</div>
  </div>;
}
