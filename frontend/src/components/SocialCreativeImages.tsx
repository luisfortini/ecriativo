import { SafeImage } from "./SafeImage";

export interface SocialImage {url:string}
export function SocialCreativeImages({content,selected,onSelect,busy,download}:{content:{id:number;format:string;status:string;alt_text:string;images:SocialImage[]};selected:number[];onSelect:(indexes:number[])=>void;busy:boolean;download:(url:string,filename:string)=>void}) {
  const count=content.format==="carousel"?3:1;
  const selectable=["review","rejected","approved","failed","cancelled"].includes(content.status);
  return <div className="space-y-2">
    {selectable&&<button type="button" disabled={busy} className="text-sm underline" onClick={()=>onSelect(selected.length===count?[]:Array.from({length:count},(_,i)=>i))}>{selected.length===count?"Desmarcar artes":"Selecionar todas as artes deste conteúdo"}</button>}
    <div className="flex flex-wrap gap-3">{Array.from({length:count},(_,index)=>{
      const image=content.images[index];
      return <div key={index} className={selected.includes(index)?"rounded border-2 border-brand p-2":"rounded border border-slate-200 p-2"}>
        {selectable&&<label className="mb-2 flex items-center gap-2 text-sm"><input type="checkbox" disabled={busy} checked={selected.includes(index)} onChange={e=>onSelect(e.target.checked?[...selected,index]:selected.filter(i=>i!==index))}/> Corrigir arte {index+1}</label>}
        {image?.url?<><SafeImage src={image.url} alt={content.alt_text||`Arte ${index+1}`} className="max-h-80 w-56 rounded object-contain"/><button type="button" className="text-sm underline" onClick={()=>download(image.url,`conteudo-${content.id}-${index+1}.png`)}>Baixar arte {index+1}</button></>:<div className="flex h-48 w-56 items-center justify-center rounded bg-slate-100 p-4 text-center text-sm text-slate-500">Arte {index+1} ainda sem imagem</div>}
      </div>;
    })}</div>
  </div>;
}
