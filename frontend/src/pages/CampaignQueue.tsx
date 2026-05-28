import { Bell, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ErrorBanner } from "../components/ErrorBanner";
import { LoadingBlock } from "../components/LoadingBlock";
import { PageHeader } from "../components/PageHeader";
import { getCampaignQueue, notifyQueueError, reprocessQueueItem } from "../services/api";
import type { CampaignQueueItem } from "../types";

export function CampaignQueue() {
  const [params] = useSearchParams();
  const [items, setItems] = useState<CampaignQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const planId = params.get("plan_id");

  function load() {
    getCampaignQueue(planId ? Number(planId) : undefined).then(setItems).catch((err: Error) => setError(err.message)).finally(() => setLoading(false));
  }

  useEffect(load, [planId]);

  async function reprocess(id: number) {
    await reprocessQueueItem(id);
    load();
  }

  async function notifyError(item: CampaignQueueItem) {
    await notifyQueueError(item.id, item.error_message || "Notificacao manual de erro da fila.");
  }

  async function reprocessAndNotify(item: CampaignQueueItem) {
    await reprocessQueueItem(item.id);
    await notifyQueueError(item.id, item.error_message || "Item reenfileirado para reprocessamento.");
    load();
  }

  return (
    <>
      <PageHeader title="Fila de Geracao" description="Itens agendados e processados pelo worker backend." />
      {error && <ErrorBanner message={error} />}
      {loading ? <LoadingBlock /> : (
        <div className="panel overflow-hidden">
          {items.map((item) => (
            <div key={item.id} className="grid gap-3 border-b border-slate-100 p-4 last:border-b-0 lg:grid-cols-[1fr_180px_120px_120px]">
              <div>
                <p className="font-semibold text-ink">{item.client_name}</p>
                <p className="text-sm text-slate-500">{item.theme} · {item.variation_type || "variacao"}</p>
                {item.error_message && <p className="mt-1 text-sm text-red-600">{item.error_message}</p>}
              </div>
              <p className="text-sm text-slate-600">{new Date(item.scheduled_at).toLocaleString("pt-BR")}</p>
              <p className="text-sm text-slate-600">{item.status}<br />{item.attempt_count}/{item.max_attempts}</p>
              <div className="flex flex-wrap gap-2">
                {item.generated_campaign_id && <Link className="rounded-md border border-slate-300 px-3 py-2 text-xs" to={`/campanhas/${item.generated_campaign_id}`}>Campanha</Link>}
                {item.status === "failed" && (
                  <>
                    <button className="rounded-md border border-slate-300 px-3 py-2 text-xs" title="Notificar erro agora" onClick={() => notifyError(item)}><Bell size={14} /></button>
                    <button className="rounded-md border border-slate-300 px-3 py-2 text-xs" title="Reprocessar e notificar" onClick={() => reprocessAndNotify(item)}><RotateCcw size={14} /></button>
                    <button className="rounded-md bg-brand px-3 py-2 text-xs text-white" title="Reprocessar" onClick={() => reprocess(item.id)}><RotateCcw size={14} /></button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
