import { useEffect,useState } from "react";
import { request } from "../services/api";
import { ErrorBanner } from "./ErrorBanner";
import type { SocialContent } from "./SocialContentCard";

interface Account {id:number;platform:string;name:string;active:boolean}
interface Publication {id:number;content_id:number;account_id:number;platform:string;account_name:string;scheduled_at:string;time_zone:string;status:string;permalink:string|null;error_message:string|null}
interface Overview {enabled:boolean;configured:boolean;time_zone:string;accounts:Account[];publications:Publication[]}
const labels:Record<string,string>={scheduled:"Agendado",publishing:"Publicando",published:"Publicado",failed:"Não publicado — precisa de atenção",uncertain:"Resultado incerto — confira na rede",cancelled:"Cancelado"};
const networks:Record<string,string>={instagram:"Instagram",facebook:"Facebook"};
const json=(body:unknown)=>({headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});

function ReconcilePublication({item,busy,onResolve}:{item:Publication;busy:boolean;onResolve:(id:number,body:unknown)=>void}) {
  const [checked,setChecked]=useState(false);
  const [link,setLink]=useState("");
  return <details className="mt-3"><summary className="cursor-pointer font-medium">Conferir resultado</summary><div className="mt-3 space-y-3">
    <p>Abra a conta na rede e confira se este conteúdo apareceu. O sistema não reenviará enquanto houver dúvida.</p>
    <label className="flex items-start gap-2"><input type="checkbox" checked={checked} onChange={e=>setChecked(e.target.checked)}/> Conferi diretamente na conta correta e sei o resultado.</label>
    <label className="label">Link da publicação (opcional)<input type="url" className="field" placeholder="https://…" value={link} onChange={e=>setLink(e.target.value)}/></label>
    <div className="flex flex-wrap gap-2"><button type="button" className="btn-primary" disabled={busy||!checked} onClick={()=>onResolve(item.id,{checked_on_network:true,outcome:"published",...(link?{permalink:link}:{})})}>Confirmar que foi publicado</button><button type="button" className="btn-secondary" disabled={busy||!checked} onClick={()=>onResolve(item.id,{checked_on_network:true,outcome:"not_published"})}>Confirmar que não foi publicado</button></div>
  </div></details>;
}

export function SocialPublishingPanel({clientId,contents,mode="all"}:{clientId:number;contents:SocialContent[];mode?:"all"|"calendar"|"connections"}) {
  const [data,setData]=useState<Overview|null>(null);
  const [error,setError]=useState("");
  const [success,setSuccess]=useState("");
  const [busy,setBusy]=useState(false);
  const [contentId,setContentId]=useState("");
  const [accountId,setAccountId]=useState("");
  const [date,setDate]=useState("");
  const [zone,setZone]=useState("");
  const approved=contents.filter(item=>item.status==="approved"&&["post","carousel"].includes(item.format));
  const reload=async()=>{const value=await request<Overview>(`/social-media/clients/${clientId}/publishing`);setData(value);setZone(current=>current||value.time_zone);};
  useEffect(()=>{let active=true;setData(null);setZone("");setContentId("");setAccountId("");setDate("");setError("");setSuccess("");
    const load=()=>request<Overview>(`/social-media/clients/${clientId}/publishing`).then(value=>{if(active){setData(value);setZone(current=>current||value.time_zone);}}).catch(e=>{if(active)setError(e.message);});
    void load();const timer=setInterval(load,20000);return()=>{active=false;clearInterval(timer);};
  },[clientId]);
  async function perform(action:()=>Promise<unknown>,message:string) {
    if(busy)return;setBusy(true);setError("");setSuccess("");
    try{await action();setSuccess(message);await reload();}catch(e){setError(e instanceof Error?e.message:"Não foi possível concluir. Seu preenchimento foi mantido.");}finally{setBusy(false);}
  }
  return <section className="panel space-y-5 p-5 sm:p-6" aria-label="Agendamento nas redes sociais">
    <div><h2 className="text-lg font-semibold">Agendar nas redes sociais</h2><p className="helper mt-1">Primeiro conecte a conta, depois aprove o conteúdo e escolha o horário. Instagram e Facebook têm agendamentos independentes.</p></div>
    {error&&<ErrorBanner message={error}/>}
    {success&&<p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{success}</p>}
    {!data&&<button type="button" disabled={busy} className="btn-secondary" onClick={()=>void perform(reload,"Conexões atualizadas.")}>{error?"Tentar carregar novamente":"Carregando conexões…"}</button>}
    {data&&<>
      {!data.enabled&&<div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><strong>Publicação real desativada no servidor.</strong><p className="mt-1">Você pode preparar os agendamentos, mas nada será publicado. A integração precisa ser configurada e validada antes de ser liberada.</p></div>}
      {mode!=="calendar"&&<><div className="flex flex-wrap gap-2"><button type="button" disabled={busy||!data.configured} className="btn-primary" onClick={()=>{
        const popup=window.open("about:blank","_blank");if(popup)popup.opener=null;
        void perform(async()=>{try{const result=await request<{url:string}>(`/social-media/clients/${clientId}/meta-connect`,{method:"POST"});if(popup)popup.location.href=result.url;else window.location.assign(result.url);}catch(e){popup?.close();throw e;}},"Continue a autorização na aba da Meta. Depois volte e atualize as conexões.");
      }}>Conectar Instagram e Facebook</button><button type="button" className="btn-secondary" disabled={busy} onClick={()=>void perform(reload,"Conexões atualizadas.")}>Atualizar conexões</button></div>
      {!data.configured&&<p className="helper">O administrador precisa configurar o aplicativo Meta, a URL de retorno, a versão da API e a chave de proteção das credenciais no servidor.</p>}
      <div className="space-y-2"><h3 className="font-semibold">Contas deste cliente</h3><p className="helper">Na autorização da Meta, selecione somente as contas deste cliente. Ative abaixo apenas as contas corretas. O Instagram precisa ser profissional e estar vinculado à Página conectada.</p>
        {!data.accounts.length&&<p className="text-sm text-slate-500">Nenhuma conta conectada ainda.</p>}
        {data.accounts.map(account=><label key={account.id} className="flex items-start gap-3 rounded-xl border border-slate-200 p-3 text-sm"><input type="checkbox" disabled={busy} checked={account.active} onChange={e=>void perform(()=>request(`/social-media/accounts/${account.id}`,{method:"PATCH",...json({active:e.target.checked})}),e.target.checked?"Conta ativada para agendamentos.":"Conta desativada. Seus agendamentos pendentes foram cancelados.")}/><span><strong>{networks[account.platform]} · {account.name}</strong><span className="block text-slate-500">{account.active?"Disponível para agendar":"Conectada, mas desativada"}</span></span></label>)}
      </div>
      </>}
      {mode!=="connections"&&<><form className="space-y-3 rounded-xl bg-slate-50 p-4" onSubmit={e=>{e.preventDefault();void perform(async()=>{await request(`/social-media/contents/${contentId}/schedule`,{method:"POST",...json({account_id:Number(accountId),local_datetime:date,time_zone:zone})});setDate("");},data.enabled?"Publicação agendada. Acompanhe o resultado no histórico.":"Agendamento salvo. Nada será publicado enquanto a publicação real estiver desativada.");}}>
        <h3 className="font-semibold">Escolher conteúdo e horário</h3>
        <label className="label">Conteúdo aprovado<select required className="field" value={contentId} onChange={e=>setContentId(e.target.value)}><option value="">Selecione um conteúdo</option>{approved.map(item=><option key={item.id} value={item.id}>{item.topic}</option>)}</select></label>
        {!approved.length&&<p className="helper">Aprove um post ou carrossel para agendar. Stories não estão incluídos nesta primeira versão.</p>}
        <label className="label">Publicar em<select required className="field" value={accountId} onChange={e=>setAccountId(e.target.value)}><option value="">Selecione uma conta ativa</option>{data.accounts.filter(a=>a.active).map(a=><option key={a.id} value={a.id}>{networks[a.platform]} · {a.name}</option>)}</select></label>
        <div className="grid gap-3 sm:grid-cols-2"><label className="label">Dia e horário no fuso abaixo<input type="datetime-local" required className="field" value={date} onChange={e=>setDate(e.target.value)}/></label><label className="label">Fuso horário<input required className="field" value={zone} onChange={e=>setZone(e.target.value)} placeholder="America/Sao_Paulo"/></label></div>
        <p className="helper">Ex.: America/Sao_Paulo ou America/New_York. O horário é o da conta do cliente, não necessariamente o do seu computador. Para ajustar textos ou imagens, cancele os agendamentos primeiro.</p>
        <button className="btn-primary" disabled={busy||!approved.length||!data.accounts.some(a=>a.active)}>{busy?"Salvando…":"Salvar agendamento"}</button>
      </form>
      <div className="space-y-3"><h3 className="font-semibold">Agenda e histórico de publicações</h3>{!data.publications.length&&<p className="text-sm text-slate-500">Seus agendamentos aparecerão aqui, com o resultado de cada rede.</p>}
        {data.publications.map(item=><article key={item.id} className="rounded-xl border border-slate-200 p-4 text-sm"><div className="flex flex-wrap justify-between gap-2"><strong>{networks[item.platform]} · {item.account_name}</strong><span className="status-badge">{labels[item.status]||item.status}</span></div>
          <p className="mt-2">{new Intl.DateTimeFormat("pt-BR",{timeZone:item.time_zone,dateStyle:"short",timeStyle:"short"}).format(new Date(item.scheduled_at))} · {item.time_zone}</p>
          <p className="mt-1 text-slate-600">{contents.find(c=>Number(c.id)===Number(item.content_id))?.topic||`Conteúdo #${item.content_id}`}</p>
          {item.error_message&&<p role={['failed','uncertain'].includes(item.status)?"alert":undefined} className="mt-3 rounded-lg bg-amber-50 p-3 text-amber-900">{item.error_message}</p>}
          {item.permalink&&<a className="btn-secondary mt-3 inline-flex" href={item.permalink} target="_blank" rel="noopener noreferrer">Ver publicação na rede</a>}
          {item.status==="scheduled"&&<button type="button" className="btn-secondary mt-3" disabled={busy} onClick={()=>void perform(()=>request(`/social-media/publications/${item.id}/cancel`,{method:"POST"}),"Agendamento cancelado. Você pode escolher outro horário acima.")}>Cancelar para reagendar</button>}
          {item.status==="uncertain"&&<ReconcilePublication item={item} busy={busy} onResolve={(id,body)=>void perform(()=>request(`/social-media/publications/${id}/reconcile`,{method:"POST",...json(body)}),"Conferência registrada. O histórico foi atualizado.")}/>}
        </article>)}
      </div></>}
    </>}
  </section>;
}
