import { Ban, Check, Eye, LoaderCircle, Pause, Play, RotateCcw, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ErrorBanner } from "../components/ErrorBanner";
import { LoadingBlock } from "../components/LoadingBlock";
import { PageHeader } from "../components/PageHeader";
import { campaignPlanAction, getCampaignPlan } from "../services/api";
import type { CampaignPlan } from "../types";

type PlanActionName = "activate" | "pause" | "resume" | "cancel-pending" | "retry-failures" | "generate-now";

const actionFeedback: Record<PlanActionName, { pending: string; completed: string; message: string }> = {
  activate: { pending: "Ativando...", completed: "Ativado", message: "Planejamento ativado e fila preparada." },
  pause: { pending: "Pausando...", completed: "Pausado", message: "Planejamento pausado." },
  resume: { pending: "Retomando...", completed: "Retomado", message: "Planejamento retomado." },
  "cancel-pending": { pending: "Cancelando...", completed: "Cancelados", message: "Itens pendentes cancelados." },
  "retry-failures": { pending: "Reprocessando...", completed: "Reenfileiradas", message: "Falhas reenfileiradas para uma nova tentativa." },
  "generate-now": { pending: "Liberando...", completed: "Liberado", message: "Itens pendentes liberados para execucao agora." }
};

export function CampaignPlanDetail() {
  const { id } = useParams();
  const [plan, setPlan] = useState<CampaignPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pendingAction, setPendingAction] = useState<PlanActionName | null>(null);
  const [completedAction, setCompletedAction] = useState<PlanActionName | null>(null);

  function load() {
    if (!id) return;
    getCampaignPlan(id).then(setPlan).catch((err: Error) => setError(err.message)).finally(() => setLoading(false));
  }

  useEffect(load, [id]);

  async function action(name: PlanActionName) {
    if (!plan) return;
    setError("");
    setMessage("");
    setCompletedAction(null);
    setPendingAction(name);
    try {
      setPlan(await campaignPlanAction(plan.id, name));
      setCompletedAction(name);
      setMessage(actionFeedback[name].message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel executar a acao.");
    } finally {
      setPendingAction(null);
    }
  }

  if (loading) return <LoadingBlock label="Carregando planejamento..." />;
  if (error && !plan) return <ErrorBanner message={error} />;
  if (!plan) return null;

  return (
    <>
      <PageHeader title={plan.name} description={`${plan.theme} · ${plan.status} · ${plan.start_date} ate ${plan.end_date}`} />
      <div className="mb-5 flex flex-wrap gap-2">
        <Action icon={<Play size={15} />} label="Ativar" action="activate" pendingAction={pendingAction} completedAction={completedAction} onClick={() => action("activate")} />
        <Action icon={<Pause size={15} />} label="Pausar planejamento" action="pause" pendingAction={pendingAction} completedAction={completedAction} onClick={() => action("pause")} />
        <Action icon={<Play size={15} />} label="Retomar planejamento" action="resume" pendingAction={pendingAction} completedAction={completedAction} onClick={() => action("resume")} />
        <Action icon={<Ban size={15} />} label="Cancelar itens pendentes" action="cancel-pending" pendingAction={pendingAction} completedAction={completedAction} onClick={() => action("cancel-pending")} />
        <Action icon={<RotateCcw size={15} />} label="Reprocessar falhas" action="retry-failures" pendingAction={pendingAction} completedAction={completedAction} onClick={() => action("retry-failures")} />
        <Action icon={<Zap size={15} />} label="Gerar agora" action="generate-now" pendingAction={pendingAction} completedAction={completedAction} onClick={() => action("generate-now")} />
        <Link className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700" to={`/fila-geracao?plan_id=${plan.id}`}><Eye size={15} />Visualizar fila</Link>
      </div>
      <div aria-live="polite" className="mb-5">
        {error && <ErrorBanner message={error} />}
        {message && <div className="rounded-md border border-accent/30 bg-accent-soft px-4 py-3 text-sm font-semibold text-accent-hover">{message}</div>}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <section className="space-y-4">
          <div className="panel p-5">
            <h2 className="mb-3 font-bold text-ink">Resumo</h2>
            <div className="grid gap-3 md:grid-cols-3">
              <Info label="Objetivo" value={plan.objective} />
              <Info label="Formato" value={plan.ad_format} />
              <Info label="Recorrencia" value={plan.recurrence_type} />
              <Info label="Aprovacao" value={plan.approval_mode} />
              <Info label="Limite diario" value={String(plan.max_ads_per_day)} />
              <Info label="Intervalo" value={`${plan.min_interval_minutes} min`} />
            </div>
          </div>
          <div className="panel overflow-hidden">
            <div className="border-b border-slate-200 p-4"><h2 className="font-bold text-ink">Fila recente</h2></div>
            {plan.queue?.slice(0, 20).map((item) => (
              <div key={item.id} className="grid grid-cols-[1fr_auto] gap-3 border-b border-slate-100 p-4 last:border-b-0">
                <div>
                  <p className="font-semibold text-ink">{item.client_name}</p>
                  <p className="text-sm text-slate-500">{new Date(item.scheduled_at).toLocaleString("pt-BR")} · {item.variation_type}</p>
                </div>
                <span className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-700">{item.status}</span>
              </div>
            ))}
          </div>
        </section>
        <aside className="space-y-4">
          <div className="panel p-5">
            <h2 className="mb-3 font-bold text-ink">Clientes</h2>
            <div className="space-y-2">
              {plan.clients?.map((client) => <p key={client.id} className="rounded-md border border-slate-200 p-3 text-sm"><strong>{client.name}</strong><br />{client.ads_quantity} anuncios</p>)}
            </div>
          </div>
          <Link className="block rounded-md bg-brand px-4 py-3 text-center text-sm font-semibold text-white" to="/execucoes-planejador">Visualizar historico de execucoes</Link>
        </aside>
      </div>
    </>
  );
}

function Action({
  icon,
  label,
  action,
  pendingAction,
  completedAction,
  onClick
}: {
  icon: React.ReactNode;
  label: string;
  action: PlanActionName;
  pendingAction: PlanActionName | null;
  completedAction: PlanActionName | null;
  onClick: () => void;
}) {
  const pending = pendingAction === action;
  const completed = completedAction === action;
  const disabled = pendingAction !== null;
  return (
    <button
      className={`inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-semibold transition ${
        completed
          ? "border-accent/40 bg-accent-soft text-accent-hover"
          : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
      } disabled:cursor-wait disabled:opacity-60`}
      type="button"
      disabled={disabled}
      aria-busy={pending}
      onClick={onClick}
    >
      {pending ? <LoaderCircle className="animate-spin" size={15} /> : completed ? <Check size={15} /> : icon}
      {pending ? actionFeedback[action].pending : completed ? actionFeedback[action].completed : label}
    </button>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><p className="label">{label}</p><p className="text-sm text-slate-700">{value}</p></div>;
}
