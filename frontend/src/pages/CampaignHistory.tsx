import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { EmptyState } from "../components/EmptyState";
import { ErrorBanner } from "../components/ErrorBanner";
import { LoadingBlock } from "../components/LoadingBlock";
import { PageHeader } from "../components/PageHeader";
import { getCreatives } from "../services/api";
import type { CreativeHistoryItem } from "../types";

export function CampaignHistory() {
  const [items, setItems] = useState<CreativeHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    getCreatives()
      .then(setItems)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <PageHeader title="Histórico de Criativos" description="Biblioteca de imagens, prompts e direções visuais gerados pelo fluxo de agentes." />
      {error && <ErrorBanner message={error} />}
      {loading ? (
        <LoadingBlock />
      ) : items.length === 0 ? (
        <EmptyState>Nenhum criativo gerado ainda.</EmptyState>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <Link key={item.id} className="panel overflow-hidden hover:border-brand" to={`/campanhas/${item.id}`}>
              <div className="aspect-[4/3] bg-slate-100">
                {item.image_url ? <img className="h-full w-full object-cover" src={item.image_url} alt="" /> : null}
              </div>
              <div className="p-4">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <h2 className="font-bold text-ink">{item.cliente}</h2>
                  <span className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-600">{item.formato}</span>
                </div>
                <p className="line-clamp-2 text-sm text-slate-700">{item.creative.direcao_visual_resumida}</p>
                <p className="mt-3 text-xs text-slate-500">{new Date(item.created_at).toLocaleString("pt-BR")}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
