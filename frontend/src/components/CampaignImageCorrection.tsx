import { useEffect, useRef, useState, type FormEvent } from "react";
import { CheckCircle2, Clock3, History, LoaderCircle, WandSparkles } from "lucide-react";
import { useAuth } from "../auth/AuthContext";
import { correctCampaignImage, getCampaign } from "../services/api";
import type { CampaignDetail, CampaignImageCorrection as Correction } from "../types";
import { SafeImage } from "./SafeImage";

const statusLabels = { queued: "Na fila", processing: "Corrigindo a imagem", completed: "Concluída", failed: "Não concluída" };

export function CampaignImageCorrection({ campaign, onUpdated }: { campaign: CampaignDetail; onUpdated: (campaign: CampaignDetail) => void }) {
  const { user } = useAuth();
  const canManage = user?.organizationRole === "owner" || user?.organizationRole === "admin";
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [pollError, setPollError] = useState("");
  const textarea = useRef<HTMLTextAreaElement>(null);
  const history = campaign.image_corrections || [];
  const active = history.find(item => item.status === "queued" || item.status === "processing");
  const latest = history[0];

  useEffect(() => {
    if (!active) { setPollError(""); return; }
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try { const updated = await getCampaign(String(campaign.id)); if (alive) { setPollError(""); onUpdated(updated); } }
      catch { if (alive) setPollError("Não conseguimos atualizar o andamento. A correção continua na fila; tente atualizar a página para conferir."); }
      finally { if (alive) timer = setTimeout(poll, 5000); }
    }
    timer = setTimeout(poll, 5000);
    return () => { alive = false; clearTimeout(timer); };
  }, [campaign.id, active?.id, onUpdated]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (active || submitting) return;
    if (note.trim().length < 5) { setError("Descreva o ajuste desejado com pelo menos 5 caracteres."); textarea.current?.focus(); return; }
    if (!campaign.image_url) { setError("Este anúncio não tem uma arte disponível para corrigir."); return; }
    setSubmitting(true); setError("");
    try {
      const response = await correctCampaignImage(campaign.id, note.trim(), campaign.image_url);
      onUpdated({ ...campaign, image_corrections: [response.correction, ...history] });
      setNote(""); setEditing(false);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível solicitar a correção. Tente novamente."); }
    finally { setSubmitting(false); }
  }

  return <section className="panel p-4" aria-labelledby="ad-correction-title">
    <h2 id="ad-correction-title" className="font-bold text-ink flex items-center gap-2"><WandSparkles size={19} aria-hidden="true" /> Quer ajustar esta arte?</h2>
    <p className="helper mb-4">Diga o que precisa mudar na imagem. A legenda é mantida e as versões anteriores ficam no histórico.</p>
    {active ? <div className="ad-correction-progress" role="status">{active.status === "processing" ? <LoaderCircle size={20} className="animate-spin" aria-hidden="true" /> : <Clock3 size={20} aria-hidden="true" />}<div><strong>{statusLabels[active.status]}</strong><p>Pode levar alguns minutos. A correção continua mesmo se você sair desta página. A imagem atual permanece até a nova ficar pronta.</p></div></div> : latest?.status === "completed" ? <p className="studio-success mb-4 flex items-start gap-2" role="status"><CheckCircle2 size={19} className="shrink-0" aria-hidden="true" />{campaign.creative_status === "approved" ? "Última correção concluída. Esta versão já foi aprovada." : "Nova versão pronta. Confira a imagem e aprove novamente antes de usar."}</p> : latest?.status === "failed" ? <div role="alert" className="studio-inline-error mb-4"><strong>A correção não foi concluída. A arte anterior foi mantida.</strong><p className="mt-1">{latest.error_message}</p></div> : null}
    {pollError && <p role="alert" className="studio-inline-error mt-3">{pollError}</p>}
    {canManage && !active && (!editing ? <button className="btn-secondary w-full" type="button" onClick={() => { setEditing(true); setError(""); }}><WandSparkles size={17} aria-hidden="true" /> Corrigir arte</button> : <form onSubmit={submit} noValidate className="space-y-3">
      <label htmlFor="ad-correction-note" className="label">O que você quer corrigir?</label>
      <textarea ref={textarea} id="ad-correction-note" className="field min-h-32" maxLength={2000} value={note} onChange={event => setNote(event.target.value)} placeholder={'Ex.: troque o título por “Sua casa, sempre bem cuidada”, aumente o telefone e mantenha as cores e as fotos.'} autoFocus disabled={submitting} aria-describedby="ad-correction-help" aria-invalid={Boolean(error) && note.trim().length < 5} />
      <p id="ad-correction-help" className="text-xs text-slate-500">A IA usa a arte atual e o perfil da marca. A logo oficial será reaplicada pelo sistema. Esta ação pode gerar custo de IA. Nada será enviado ou publicado automaticamente.</p>
      {error && <p role="alert" className="studio-inline-error">{error}</p>}
      <div className="flex flex-wrap gap-2"><button type="submit" className="btn-primary" disabled={submitting}>{submitting ? <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> : <WandSparkles size={16} aria-hidden="true" />}{submitting ? "Solicitando…" : "Gerar versão corrigida"}</button><button type="button" className="btn-secondary" disabled={submitting} onClick={() => { setEditing(false); setError(""); }}>Cancelar</button></div>
    </form>)}
    {!canManage && <p className="text-xs text-slate-500">Peça a um administrador da conta para solicitar uma correção.</p>}
    {history.length > 0 && <details className="mt-5 border-t border-slate-200 pt-3"><summary className="flex items-center gap-2 cursor-pointer text-sm font-semibold"><History size={16} aria-hidden="true" /> Histórico de correções ({history.length})</summary><div className="mt-3 space-y-4">{history.map(item => <CorrectionHistory key={item.id} item={item} canRetry={canManage && !active && !submitting} onRetry={() => { setEditing(true); setNote(item.note); setError(""); setTimeout(() => textarea.current?.focus(), 0); }} />)}</div></details>}
  </section>;
}

function CorrectionHistory({ item, canRetry, onRetry }: { item: Correction; canRetry: boolean; onRetry: () => void }) {
  return <article className="ad-correction-history"><header><strong>{statusLabels[item.status]}</strong><time>{new Date(item.created_at).toLocaleString("pt-BR")}</time></header><p className="mt-2 whitespace-pre-wrap break-words text-xs text-slate-700">{item.note}</p>{item.requester_name && <p className="mt-1 text-xs text-slate-500">Solicitada por {item.requester_name}</p>}
    {item.status === "completed" && item.image_url && <div className="ad-correction-comparison"><figure><figcaption>Antes</figcaption><SafeImage src={item.before_image_url} alt="Arte antes desta correção" className="ad-correction-history-image" /></figure><figure><figcaption>Depois</figcaption><SafeImage src={item.image_url} alt="Arte corrigida nesta versão" className="ad-correction-history-image" /></figure></div>}
    {item.status === "failed" && <><p className="studio-inline-error mt-2" role="alert">{item.error_message || "A arte anterior foi mantida."}</p>{canRetry && <button type="button" className="btn-secondary mt-2 text-xs" onClick={onRetry}>Usar este pedido novamente</button>}</>}
  </article>;
}
