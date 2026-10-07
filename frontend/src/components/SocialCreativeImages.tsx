import { useState } from "react";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { SafeImage } from "./SafeImage";
export interface SocialImage {url:string;quality_issues?:string[]}
export function SocialCreativeImages({content,selected,onSelect,busy,download}:{content:{id:number;format:string;status:string;alt_text:string;images:SocialImage[]};selected:number[];onSelect:(indexes:number[])=>void;busy:boolean;download:(url:string,filename:string)=>void}) {
  const [active,setActive]=useState(0);
  const count=content.format==="carousel"?3:1;
  const index=Math.min(active,count-1);
  const image=content.images[index];
  const selectable=["review","rejected","approved","failed","cancelled"].includes(content.status);
  return <div className="studio-art-review">
    <div className="studio-art-canvas">
      {image?.url?<SafeImage src={image.url} alt={content.alt_text||"Arte "+(index+1)} className="studio-art-image"/>:<div className="studio-art-missing"><strong>Arte {index+1}</strong><p>{selectable?"Imagem não disponível. Selecione para pedir uma correção.":"Aguardando geração da imagem."}</p></div>}
    </div>
    {Boolean(image?.quality_issues?.length)&&<p role="alert" className="studio-inline-error">{image.quality_issues!.join(" ")}</p>}
    {count>1&&<div className="studio-slide-selector" aria-label="Páginas do carrossel"><button type="button" className="btn-secondary" aria-label="Arte anterior" disabled={index===0} onClick={()=>setActive(index-1)}><ChevronLeft size={17}/></button>{Array.from({length:count},(_,i)=><button type="button" key={i} aria-pressed={index===i} className={index===i?"active":""} onClick={()=>setActive(i)}><span>Arte {i+1}</span>{selected.includes(i)&&<small>Para corrigir</small>}</button>)}<button type="button" className="btn-secondary" aria-label="Próxima arte" disabled={index===count-1} onClick={()=>setActive(index+1)}><ChevronRight size={17}/></button></div>}
    {selectable&&<div className="studio-art-selection"><label><input type="checkbox" disabled={busy} checked={selected.includes(index)} onChange={event=>onSelect(event.target.checked?[...selected,index]:selected.filter(i=>i!==index))}/> Corrigir arte {index+1}</label>{count>1&&<button type="button" disabled={busy} className="btn-secondary" onClick={()=>onSelect(selected.length===count?[]:Array.from({length:count},(_,i)=>i))}>{selected.length===count?"Desmarcar todas":"Corrigir todas"}</button>}</div>}
    {image?.url&&<button type="button" className="btn-secondary w-full" onClick={()=>download(image.url,"conteudo-"+content.id+"-"+(index+1)+".png")}><Download size={16}/> Baixar arte {index+1}</button>}
    {selected.length>0&&<p className="helper">{selected.length} arte{selected.length>1?"s":""} selecionada{selected.length>1?"s":""}. Descreva o ajuste na área de correção abaixo.</p>}
  </div>;
}
