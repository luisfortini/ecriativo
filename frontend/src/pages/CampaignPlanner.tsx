import { CalendarClock, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { EmptyState } from "../components/EmptyState";
import { ErrorBanner } from "../components/ErrorBanner";
import { LoadingBlock } from "../components/LoadingBlock";
import { PageHeader } from "../components/PageHeader";
import { getCampaignPlans } from "../services/api";
import type { CampaignPlan } from "../types";

export function CampaignPlanner() {
  const [plans, setPlans] = useState<CampaignPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    getCampaignPlans().then(setPlans).catch((err: Error) => setError(err.message)).finally(() => setLoading(false));
  }, []);

  return (
    <>
      <PageHeader
        title="Planejador de Campanhas"
        description="Agende campanhas em massa para varios clientes com fila controlada no backend."
        action={<Link className="inline-flex items-center gap-2 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white" to="/planejador/novo"><Plus size={16} />Novo planejamento</Link>}
      />
      {error && <ErrorBanner message={error} />}
      {loading ? <LoadingBlock /> : plans.length === 0 ? <EmptyState>Nenhum planejamento criado.</EmptyState> : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {plans.map((plan) => (
            <Link key={plan.id} className="panel p-5 hover:border-brand" to={`/planejador/${plan.id}`}>
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-slate-100 text-brand"><CalendarClock size={18} /></div>
                <div>
                  <h2 className="font-bold text-ink">{plan.name}</h2>
                  <p className="text-sm text-slate-500">{plan.theme}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="rounded bg-slate-100 px-2 py-1">{plan.status}</span>
                <span className="rounded bg-slate-100 px-2 py-1">{plan.clients_count ?? 0} clientes</span>
                <span className="rounded bg-slate-100 px-2 py-1">{plan.completed_count ?? 0}/{plan.queue_count ?? 0} gerados</span>
              </div>
              <p className="mt-3 text-sm text-slate-600">{plan.objective}</p>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
