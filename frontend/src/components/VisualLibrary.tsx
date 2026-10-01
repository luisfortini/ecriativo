import { useEffect, useState } from "react";
import { request } from "../services/api";
import { useAuth } from "../auth/AuthContext";
import { SafeImage } from "./SafeImage";

export interface VisualSubject {
  id:number; kind:"product"|"person"; name:string; description:string; sku:string; preservation_notes:string;
  active:boolean; approved:boolean; allow_ads:boolean; allow_social:boolean; consent_note:string; expires_on:string|null;
  photos:Array<{id:number;file_url:string;is_primary:boolean;caption:string}>;
}
const initial = {kind:"product" as "product"|"person",name:"",description:"",sku:"",preservation_notes:"",active:true,approved:false,allow_ads:false,allow_social:false,consent_note:"",expires_on:""};

export function VisualLibrary({clientId}:{clientId:number}) {
  const {user}=useAuth();
  const canManage=user?.organizationRole!=="member";
  const [items,setItems]=useState<VisualSubject[]>([]);
  const [form,setForm]=useState(initial);
  const [editId,setEditId]=useState<number|null>(null);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const base=`/clients/${clientId}/visual-library`;
  const load=()=>request<VisualSubject[]>(base).then(setItems);
  useEffect(()=>{load().catch(e=>setError(e.message));},[clientId]);
  async function perform(action:()=>Promise<unknown>) {setBusy(true);setError("");try{await action();await load();}catch(e){setError(e instanceof Error?e.message:"Falha na biblioteca.");}finally{setBusy(false);}}
  return <div className="space-y-5">
    <p className="text-sm text-slate-600">Cadastre produtos e pessoas com fotos reais. Somente itens ativos, aprovados e autorizados entram na geração. Use imagens nítidas com pelo menos 256 × 256 pixels.</p>
    {error&&<p role="alert" className="text-red-700">{error}</p>}
    {canManage&&<form className="panel grid gap-3 p-5 md:grid-cols-2" onSubmit={e=>{e.preventDefault();void perform(async()=>{await request(editId?`${base}/${editId}`:base,{method:editId?"PUT":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...form,expires_on:form.expires_on||null})});setEditId(null);setForm(initial);});}}>
      <label className="label">Tipo<select className="field" value={form.kind} onChange={e=>setForm({...form,kind:e.target.value as "product"|"person"})}><option value="product">Produto</option><option value="person">Pessoa/modelo</option></select></label>
      <label className="label">Nome<input className="field" value={form.name} required minLength={2} onChange={e=>setForm({...form,name:e.target.value})}/></label>
      {([['description','Descrição'],['sku','Código/SKU (produto)'],['preservation_notes','Características que devem ser preservadas'],['consent_note','Autorização e restrições de uso da imagem']] as const).map(([key,label])=><label className="label" key={key}>{label}<textarea className="field" value={form[key]} onChange={e=>setForm({...form,[key]:e.target.value})}/></label>)}
      <label className="label">Validade da autorização<input className="field" type="date" value={form.expires_on} onChange={e=>setForm({...form,expires_on:e.target.value})}/></label>
      <div className="flex flex-wrap gap-4">{([['active','Ativo'],['approved','Aprovado'],['allow_ads','Anúncios'],['allow_social','Conteúdo orgânico']] as const).map(([key,label])=><label key={key} className="text-sm"><input type="checkbox" checked={form[key]} onChange={e=>setForm({...form,[key]:e.target.checked})}/> {label}</label>)}</div>
      <button disabled={busy} className="rounded-md bg-brand p-3 text-white">{busy?"Salvando…":editId?"Salvar alterações":"Cadastrar item"}</button>
      {editId&&<button type="button" onClick={()=>{setEditId(null);setForm(initial);}}>Cancelar edição</button>}
    </form>}
    <div className="grid gap-4 md:grid-cols-2">{items.map(item=><article className="panel p-4" key={item.id}>
      <h3 className="font-bold">{item.name} · {item.kind==="person"?"Pessoa":"Produto"}</h3><p className="text-sm">{item.active?"Ativo":"Arquivado"} · {item.approved?"Aprovado":"Aguardando aprovação"}</p><p className="my-2 text-sm">{item.description}</p>
      <div className="flex flex-wrap gap-2">{item.photos.map(photo=><div key={photo.id}><SafeImage src={photo.file_url} className="h-28 w-28 rounded object-contain" alt={photo.caption||item.name}/>{photo.is_primary?<span className="text-xs">Principal</span>:canManage&&<button disabled={busy} className="text-xs underline" onClick={()=>void perform(()=>request(`${base}/${item.id}/photos/${photo.id}/primary`,{method:"POST"}))}>Definir principal</button>}</div>)}</div>
      {canManage&&<div className="mt-3 space-y-2"><button className="mr-4 text-brand underline" onClick={()=>{setEditId(Number(item.id));setForm({...item,expires_on:item.expires_on?.slice(0,10)||""});}}>Editar / arquivar</button><label className="label">Adicionar foto<input disabled={busy} type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>{const file=e.target.files?.[0];if(!file)return;const data=new FormData();data.append("file",file);void perform(()=>request(`${base}/${item.id}/photos`,{method:"POST",body:data}));e.target.value="";}}/></label></div>}
    </article>)}</div>
  </div>;
}

export interface VisualSelection {products:"none"|"auto"|"manual";people:"none"|"auto"|"manual";product_ids:number[];person_ids:number[];no_people:boolean;mode:"reference"|"composition"}
export const emptySelection:VisualSelection={products:"none",people:"none",product_ids:[],person_ids:[],no_people:false,mode:"reference"};
export function VisualSelector({clientId,value,onChange}:{clientId:number;value:VisualSelection;onChange:(value:VisualSelection)=>void}) {
  const [items,setItems]=useState<VisualSubject[]>([]);
  const [error,setError]=useState("");
  useEffect(()=>{setItems([]);setError("");if(clientId)request<VisualSubject[]>(`/clients/${clientId}/visual-library`).then(setItems).catch(e=>setError(e.message));},[clientId]);
  return <fieldset className="my-4 rounded border border-slate-200 p-4"><legend className="font-semibold">Fotos reais da marca</legend>{error&&<p role="alert">{error}</p>}
    {([['products','product','Produtos','product_ids'],['people','person','Pessoas/modelos','person_ids']] as const).map(([key,kind,label,ids])=><div className="my-3" key={key}><label className="label">{label}<select className="field" value={value[key]} onChange={e=>onChange({...value,[key]:e.target.value,...(key==='people'&&e.target.value!=='none'?{no_people:false}:{})})}><option value="none">Não usar cadastrados</option><option value="auto">Seleção automática</option><option value="manual">Escolher manualmente</option></select></label>
      {value[key]==="manual"&&<div className="flex flex-wrap gap-3">{items.filter(i=>i.kind===kind&&i.active&&i.approved).map(item=><label key={item.id} className="text-sm"><input type="checkbox" checked={value[ids].includes(Number(item.id))} onChange={e=>onChange({...value,[ids]:e.target.checked?[...value[ids],Number(item.id)].slice(0,2):value[ids].filter(id=>id!==Number(item.id))})}/>{item.photos[0]&&<SafeImage alt="" src={item.photos[0].file_url} className="h-16 w-16 object-contain"/>}{item.name}</label>)}</div>}
    </div>)}
    <label className="label">Tratamento visual<select className="field" value={value.mode} onChange={e=>onChange({...value,mode:e.target.value as VisualSelection['mode']})}><option value="reference">Cena com imagens de referência (revisar fidelidade)</option><option value="composition">Colagem com fotos originais</option></select></label>
    <label className="text-sm"><input type="checkbox" checked={value.no_people} onChange={e=>onChange({...value,no_people:e.target.checked,...(e.target.checked?{people:"none" as const,person_ids:[]}:{})})}/> Não incluir pessoas na imagem</label>
  </fieldset>;
}
