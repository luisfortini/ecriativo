import { ArrowRight, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { EmptyState } from "../components/EmptyState";
import { ErrorBanner } from "../components/ErrorBanner";
import { LoadingBlock } from "../components/LoadingBlock";
import { PageHeader } from "../components/PageHeader";
import { getCampaigns } from "../services/api";
import type { CampaignSummary } from "../types";

export function Dashboard() {
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    getCampaigns()
      .then(setCampaigns)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <PageHeader
        title="Campanhas"
        description="Acompanhe campanhas geradas por IA, copie decisões estratégicas e reabra resultados para reutilizar prompts."
        action={
          <Link className="inline-flex items-center gap-2 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-hover" to="/nova-campanha">
            <Plus size={16} />
            Nova campanha
          </Link>
        }
      />

      {error && <ErrorBanner message={error} />}
      {loading ? (
        <LoadingBlock />
      ) : campaigns.length === 0 ? (
        <EmptyState>
          <div>
            <p className="font-semibold text-ink">Nenhuma campanha criada ainda.</p>
            <Link className="mt-3 inline-flex items-center gap-2 rounded-md bg-brand px-4 py-2 text-white" to="/nova-campanha">
              <Plus size={16} />
              Criar primeira campanha
            </Link>
          </div>
        </EmptyState>
      ) : (
        <div className="panel overflow-hidden">
          <div className="grid grid-cols-[96px_1fr_auto] gap-4 border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase text-slate-500">
            <span>Imagem</span>
            <span>Campanha</span>
            <span>Ação</span>
          </div>
          {campaigns.map((campaign) => (
            <Link
              key={campaign.id}
              to={`/campanhas/${campaign.id}`}
              className="grid grid-cols-[96px_1fr_auto] items-center gap-4 border-b border-slate-100 px-4 py-4 last:border-b-0 hover:bg-slate-50"
            >
              <div className="h-16 w-20 overflow-hidden rounded-md bg-slate-200">
                {campaign.image_url ? <img className="h-full w-full object-cover" src={campaign.image_url} alt="" /> : null}
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-ink">{campaign.cliente}</p>
                  <span className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-600">{campaign.formato}</span>
                </div>
                <p className="mt-1 text-sm text-slate-600">{campaign.objetivo}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {campaign.segmento} · {new Date(campaign.created_at).toLocaleString("pt-BR")}
                </p>
              </div>
              <ArrowRight className="text-slate-400" size={18} />
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
