import { Link } from "react-router-dom";
import type { ClientProfile } from "../types";
import { SafeImage } from "./SafeImage";

export function StyleReference({memory,selected,onChange}:{memory:ClientProfile|null;selected?:number|null;onChange:(id:number|null)=>void}) {
  const assets=(memory?.assets||[]).filter(asset=>["approved_reference","approved_ad","reference_image"].includes(asset.type)&&/\.(png|jpe?g|webp)(?:\?|$)/i.test(asset.file_url)).sort((a,b)=>Number(a.type==="reference_image")-Number(b.type==="reference_image")||Number(b.id)-Number(a.id));
  const preview=assets.find(asset=>Number(asset.id)===selected)||(!selected?assets[0]:undefined);
  return <section className="rounded-xl border border-slate-200 p-4" aria-label="Referência de estilo">
    <h3 className="font-semibold">Qual estilo vamos seguir?</h3>
    <p className="helper">Anúncios e posts usam a mesma biblioteca. A referência orienta o visual, não copia textos nem logos de outras marcas.</p>
    <label className="label mt-3" htmlFor="creation-style">Referência visual</label><select id="creation-style" className="field" value={selected??""} onChange={e=>onChange(e.target.value?Number(e.target.value):null)}><option value="">Automática: referência aprovada mais recente</option>{assets.map(asset=><option key={asset.id} value={asset.id}>{asset.description||`Referência ${asset.id}`}</option>)}</select>
    {preview?<div className="mt-3 flex items-center gap-3"><SafeImage src={preview.file_url} alt={preview.description||"Referência de estilo da marca"} className="h-28 w-24 rounded-lg border bg-slate-50 object-contain"/><p className="helper">{preview.description||"Referência cadastrada"}<span className="block">A paleta e o idioma atuais da marca têm prioridade.</span></p></div>:<p className="helper mt-3">Sem imagem de referência. Vamos usar a paleta, tipografia e descrições da marca.</p>}
    {memory&&<Link className="studio-text-link mt-3" to={`/clientes/${memory.id}`}>Ver arquivos e ajustar a identidade da marca</Link>}
  </section>;
}
