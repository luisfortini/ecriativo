import { useEffect, useState } from "react";
import { ErrorBanner } from "../components/ErrorBanner";
import { LoadingBlock } from "../components/LoadingBlock";
import { PageHeader } from "../components/PageHeader";
import { getCampaignGenerationLogs } from "../services/api";
import type { CampaignGenerationLog } from "../types";

export function CampaignPlannerLogs() {
  const [logs, setLogs] = useState<CampaignGenerationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    getCampaignGenerationLogs().then(setLogs).catch((err: Error) => setError(err.message)).finally(() => setLoading(false));
  }, []);

  return (
    <>
      <PageHeader title="Historico de Execucoes" description="Logs do worker e das acoes do Planejador de Campanhas." />
      {error && <ErrorBanner message={error} />}
      {loading ? <LoadingBlock /> : (
        <div className="panel overflow-hidden">
          {logs.map((log) => (
            <div key={log.id} className="border-b border-slate-100 p-4 last:border-b-0">
              <p className="font-semibold text-ink">{log.status}</p>
              <p className="text-sm text-slate-700">{log.message}</p>
              <p className="mt-1 text-xs text-slate-500">{new Date(log.created_at).toLocaleString("pt-BR")}</p>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
