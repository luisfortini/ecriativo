import { Ban, Eye, Pause, Play, RotateCcw, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ErrorBanner } from "../components/ErrorBanner";
import { LoadingBlock } from "../components/LoadingBlock";
import { PageHeader } from "../components/PageHeader";
import { campaignPlanAction, getCampaignPlan } from "../services/api";
import type { CampaignPlan } from "../types";

export function CampaignPlanDetail() {
  const { id } = useParams();
  const [plan, setPlan] = useState<CampaignPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  function load() {
    if (!id) return;
    getCampaignPlan(id).then(setPlan).catch((err: Error) => setError(err.message)).finally(() => setLoading(false));
  }

  useEffect(load, [id]);

  async function action(name: string) {
    if (!plan) return;
    setPlan(await campaignPlanAction(plan.id, name));
  }

  if (loading) return <LoadingBlock label="Carregando planejamento..." />;
  if (error) return <ErrorBanner message={error} />;
  if (!plan) return null;

  return (
    <>
      <PageHeader title={plan.name} description={`${plan.theme} · ${plan.status} · ${plan.start_date} ate ${plan.end_date}`} />
      <div className="mb-5 flex flex-wrap gap-2">
        <Action icon={<Play size={15} />} label="Ativar" onClick={() => action("activate")} />
        <Action icon={<Pause size={15} />} label="Pausar planejamento" onClick={() => action("pause")} />
        <Action icon={<Play size={15} />} label="Retomar planejamento" onClick={() => action("resume")} />
        <Action icon={<Ban size={15} />} label="Cancelar itens pendentes" onClick={() => action("cancel-pending")} />
        <Action icon={<RotateCcw size={15} />} label="Reprocessar falhas" onClick={() => action("retry-failures")} />
        <Action icon={<Zap size={15} />} label="Gerar agora" onClick={() => action("generate-now")} />
        <Link className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700" to={`/fila-geracao?plan_id=${plan.id}`}><Eye size={15} />Visualizar fila</Link>
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

function Action({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return <button className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700" type="button" onClick={onClick}>{icon}{label}</button>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><p className="label">{label}</p><p className="text-sm text-slate-700">{value}</p></div>;
}
