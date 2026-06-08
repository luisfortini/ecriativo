import { AlertTriangle, BarChart3, Download, Eye, Save } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { ErrorBanner } from "../components/ErrorBanner";
import { LoadingBlock } from "../components/LoadingBlock";
import { PageHeader } from "../components/PageHeader";
import {
  getAgents,
  getAiCostSettings,
  getAiCosts,
  getAiModelPrices,
  getAiUsageDetail,
  getCampaignPlans,
  getCampaigns,
  getClients,
  saveAiCostSettings,
  saveAiModelPrice,
  API_URL
} from "../services/api";
import type { Agent, AiCostDashboard, AiModelPrice, CampaignPlan, CampaignSummary, ClientSummary } from "../types";

const operationOptions = [
  ["", "Todas"],
  ["normalizacao_briefing", "Normalizacao de briefing"],
  ["estrategista", "Estrategista"],
  ["criativo", "Criativo"],
  ["analise_marca", "Analise de marca"],
  ["geracao_imagem", "Geracao de imagem"],
  ["rotina_agendada", "Rotina agendada"],
  ["reprocessamento", "Reprocessamento"]
];

const emptyFilters = {
  start_date: "",
  end_date: "",
  client_id: "",
  campaign_id: "",
  campaign_plan_id: "",
  agent_id: "",
  model: "",
  status: "",
  operation_type: ""
};

export function AiCosts() {
  const [filters, setFilters] = useState(emptyFilters);
  const [dashboard, setDashboard] = useState<AiCostDashboard | null>(null);
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [plans, setPlans] = useState<CampaignPlan[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [prices, setPrices] = useState<AiModelPrice[]>([]);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [tab, setTab] = useState("analise");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const query = useMemo(() => new URLSearchParams(Object.entries(filters).filter(([, value]) => value)).toString(), [filters]);

  function load() {
    setLoading(true);
    setError("");
    Promise.all([
      getAiCosts(query),
      getClients(),
      getCampaigns(),
      getCampaignPlans(),
      getAgents(),
      getAiModelPrices(),
      getAiCostSettings()
    ])
      .then(([costs, clientItems, campaignItems, planItems, agentItems, priceItems, settingItems]) => {
        setDashboard(costs);
        setClients(clientItems);
        setCampaigns(campaignItems);
        setPlans(planItems);
        setAgents(agentItems);
        setPrices(priceItems);
        setSettings(settingItems);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, [query]);

  async function openDetail(id: number) {
    setDetail(await getAiUsageDetail(id));
  }

  if (loading && !dashboard) return <LoadingBlock label="Carregando custos de IA..." />;
  if (error) return <ErrorBanner message={error} />;
  if (!dashboard) return null;

  const summary = dashboard.summary;
  const currency = prices[0]?.currency || settings.ai_default_currency || "USD";

  return (
    <>
      <PageHeader title="Custos de IA" description="Analise custos, tokens, imagens, gargalos e alertas de uso da OpenAI por campanha, cliente, agente e rotina." />

      <Filters
        filters={filters}
        setFilters={setFilters}
        clients={clients}
        campaigns={campaigns}
        plans={plans}
        agents={agents}
        models={prices.map((price) => price.model)}
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {["analise", "rankings", "execucoes", "precos", "configuracoes"].map((item) => (
          <button key={item} className={`rounded-md px-3 py-2 text-sm font-medium ${tab === item ? "bg-brand text-white" : "bg-white text-slate-700"}`} onClick={() => setTab(item)}>
            {item}
          </button>
        ))}
        <a className="ml-auto inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold" href={`${API_URL}/ai-costs/export/csv?${query}`}>
          <Download size={15} /> CSV
        </a>
        <a className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold" href={`${API_URL}/ai-costs/export/excel?${query}`}>
          <Download size={15} /> Excel
        </a>
        <a className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold" href={`${API_URL}/ai-costs/export/json?${query}`}>
          <Download size={15} /> JSON
        </a>
      </div>

      {tab === "analise" && (
        <div className="space-y-5">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Metric title="Custo total no periodo" value={money(summary.total_cost, currency)} />
            <Metric title="Total de tokens" value={number(summary.total_tokens)} />
            <Metric title="Total de imagens geradas" value={number(summary.image_count)} />
            <Metric title="Custo medio por campanha" value={money(summary.avg_cost_per_campaign, currency)} />
            <Metric title="Cliente mais caro" value={summary.top_client?.name || "-"} sub={money(summary.top_client?.total_cost, currency)} />
            <Metric title="Agente mais caro" value={summary.top_agent?.name || summary.top_agent?.agent_key || "-"} sub={money(summary.top_agent?.total_cost, currency)} />
            <Metric title="Maior execucao individual" value={number(summary.largest_execution?.total_tokens)} sub={money(summary.largest_execution?.total_estimated_cost, currency)} />
            <Metric title="Percentual de erros" value={`${Math.round(Number(summary.error_rate ?? 0) * 100)}%`} sub={`${number(summary.error_count)} erros`} />
          </div>

          <Insights alerts={dashboard.alerts} insights={dashboard.insights} />

          <div className="grid gap-4 xl:grid-cols-2">
            <BarPanel title="Custo por dia" rows={dashboard.groups.costByDay} currency={currency} />
            <BarPanel title="Custo por cliente" rows={dashboard.groups.costByClient} currency={currency} />
            <BarPanel title="Custo por agente" rows={dashboard.groups.costByAgent} currency={currency} />
            <BarPanel title="Custo por modelo" rows={dashboard.groups.costByModel} currency={currency} />
            <BarPanel title="Tokens por agente" rows={dashboard.groups.tokensByAgent} />
            <BarPanel title="Campanhas mais caras" rows={dashboard.groups.campaigns} currency={currency} />
            <BarPanel title="Rotinas mais caras" rows={dashboard.groups.routines} currency={currency} />
          </div>
        </div>
      )}

      {tab === "rankings" && <Rankings rankings={dashboard.rankings} currency={currency} />}
      {tab === "execucoes" && <UsageTable logs={dashboard.logs} currency={currency} onDetail={openDetail} />}
      {tab === "precos" && <PricesPanel prices={prices} onSave={async (payload) => setPrices(await saveAiModelPrice(payload))} />}
      {tab === "configuracoes" && <SettingsPanel settings={settings} setSettings={setSettings} onSave={async () => setSettings(await saveAiCostSettings(settings))} />}

      {detail && <DetailModal detail={detail} currency={currency} onClose={() => setDetail(null)} />}
    </>
  );
}

function Filters(props: {
  filters: typeof emptyFilters;
  setFilters: React.Dispatch<React.SetStateAction<typeof emptyFilters>>;
  clients: ClientSummary[];
  campaigns: CampaignSummary[];
  plans: CampaignPlan[];
  agents: Agent[];
  models: string[];
}) {
  function set(key: keyof typeof emptyFilters, value: string) {
    props.setFilters((current) => ({ ...current, [key]: value }));
  }
  return (
    <section className="panel mb-5 p-4">
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Field label="Inicio" type="date" value={props.filters.start_date} onChange={(value) => set("start_date", value)} />
        <Field label="Fim" type="date" value={props.filters.end_date} onChange={(value) => set("end_date", value)} />
        <Select label="Cliente" value={props.filters.client_id} onChange={(value) => set("client_id", value)} options={[["", "Todos"], ...props.clients.map((item) => [String(item.id), item.name] as [string, string])]} />
        <Select label="Campanha" value={props.filters.campaign_id} onChange={(value) => set("campaign_id", value)} options={[["", "Todas"], ...props.campaigns.map((item) => [String(item.id), `${item.id} - ${item.cliente}`] as [string, string])]} />
        <Select label="Planejamento/rotina" value={props.filters.campaign_plan_id} onChange={(value) => set("campaign_plan_id", value)} options={[["", "Todos"], ...props.plans.map((item) => [String(item.id), item.name] as [string, string])]} />
        <Select label="Agente" value={props.filters.agent_id} onChange={(value) => set("agent_id", value)} options={[["", "Todos"], ...props.agents.map((item) => [String(item.id), item.name] as [string, string])]} />
        <Select label="Modelo" value={props.filters.model} onChange={(value) => set("model", value)} options={[["", "Todos"], ...props.models.map((item) => [item, item] as [string, string])]} />
        <Select label="Status" value={props.filters.status} onChange={(value) => set("status", value)} options={[["", "Todos"], ["success", "success"], ["error", "error"]]} />
        <Select label="Tipo de operacao" value={props.filters.operation_type} onChange={(value) => set("operation_type", value)} options={operationOptions as [string, string][]} />
        <div className="flex items-end">
          <button className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold" onClick={() => props.setFilters(emptyFilters)} type="button">
            Limpar filtros
          </button>
        </div>
      </div>
    </section>
  );
}

function Metric({ title, value, sub }: { title: string; value: string; sub?: string }) {
  return (
    <div className="panel p-4">
      <p className="text-xs font-semibold uppercase text-slate-500">{title}</p>
      <p className="mt-2 text-2xl font-bold text-ink">{value}</p>
      {sub && <p className="mt-1 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

function Insights({ alerts, insights }: { alerts: string[]; insights: string[] }) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <section className="panel p-4">
        <h2 className="mb-3 flex items-center gap-2 font-bold text-ink"><AlertTriangle size={17} /> Alertas</h2>
        <List items={alerts} empty="Nenhum alerta no periodo filtrado." />
      </section>
      <section className="panel p-4">
        <h2 className="mb-3 flex items-center gap-2 font-bold text-ink"><BarChart3 size={17} /> Insights automaticos</h2>
        <List items={insights} empty="Sem insights suficientes para este filtro." />
      </section>
    </div>
  );
}

function BarPanel({ title, rows, currency }: { title: string; rows?: Array<Record<string, any>>; currency?: string }) {
  const items = rows ?? [];
  const max = Math.max(...items.map((item) => Number(item.value ?? 0)), 1);
  return (
    <section className="panel p-4">
      <h2 className="mb-3 font-bold text-ink">{title}</h2>
      <div className="space-y-3">
        {items.length === 0 && <p className="text-sm text-slate-500">Sem dados.</p>}
        {items.map((item, index) => (
          <div key={`${item.label}-${index}`}>
            <div className="mb-1 flex justify-between gap-3 text-xs">
              <span className="truncate text-slate-700">{String(item.label)}</span>
              <span className="font-semibold text-ink">{currency ? money(item.value, currency) : number(item.value)}</span>
            </div>
            <div className="h-2 overflow-hidden rounded bg-slate-100">
              <div className="h-full bg-brand" style={{ width: `${Math.max(2, (Number(item.value ?? 0) / max) * 100)}%` }} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function Rankings({ rankings, currency }: { rankings: AiCostDashboard["rankings"]; currency: string }) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Ranking title="Top 10 clientes mais caros" rows={rankings.clients} currency={currency} />
      <Ranking title="Top 10 campanhas mais caras" rows={rankings.campaigns} currency={currency} />
      <Ranking title="Top 10 agentes mais caros" rows={rankings.agents} currency={currency} />
      <Ranking title="Top 10 execucoes mais caras" rows={rankings.executions} currency={currency} />
      <Ranking title="Top 10 rotinas mais caras" rows={rankings.routines} currency={currency} />
    </div>
  );
}

function Ranking({ title, rows, currency }: { title: string; rows?: Array<Record<string, any>>; currency: string }) {
  return (
    <section className="panel p-4">
      <h2 className="mb-3 font-bold text-ink">{title}</h2>
      <div className="space-y-2">
        {(rows ?? []).map((row, index) => (
          <div key={index} className="flex items-center justify-between gap-3 rounded-md border border-slate-100 px-3 py-2 text-sm">
            <span className="truncate">{row.label || row.client_name || row.agent_key || `#${row.id}`}</span>
            <span className="font-semibold">{money(row.total_cost ?? row.total_estimated_cost, currency)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function UsageTable({ logs, currency, onDetail }: { logs: Array<Record<string, any>>; currency: string; onDetail: (id: number) => void }) {
  return (
    <section className="panel overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              {["Data", "Cliente", "Operacao", "Agente", "Modelo", "Tokens", "Custo", "Status", ""].map((item) => (
                <th key={item} className="px-3 py-2">{item}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id} className="border-t border-slate-100">
                <td className="px-3 py-2">{new Date(log.created_at).toLocaleString("pt-BR")}</td>
                <td className="px-3 py-2">{log.client_name || "-"}</td>
                <td className="px-3 py-2">{log.operation_type}</td>
                <td className="px-3 py-2">{log.agent_name || log.agent_key || "-"}</td>
                <td className="px-3 py-2">{log.model || "-"}</td>
                <td className="px-3 py-2">{number(log.total_tokens)}</td>
                <td className="px-3 py-2">{money(log.total_estimated_cost, currency)}</td>
                <td className="px-3 py-2">{log.status}</td>
                <td className="px-3 py-2">
                  <button className="rounded border border-slate-300 p-1" onClick={() => onDetail(Number(log.id))} title="Detalhe">
                    <Eye size={15} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function PricesPanel({ prices, onSave }: { prices: AiModelPrice[]; onSave: (payload: Record<string, unknown>) => Promise<void> }) {
  const [rows, setRows] = useState<Record<number, Record<string, string>>>({});
  const [form, setForm] = useState<Record<string, string>>({
    model: "",
    input_price_per_1m_tokens: "0",
    output_price_per_1m_tokens: "0",
    image_price: "0",
    currency: prices[0]?.currency || "USD",
    active: "1"
  });

  useEffect(() => {
    setRows(
      Object.fromEntries(
        prices.map((price) => [
          price.id,
          {
            id: String(price.id),
            model: price.model,
            input_price_per_1m_tokens: String(price.input_price_per_1m_tokens),
            output_price_per_1m_tokens: String(price.output_price_per_1m_tokens),
            image_price: String(price.image_price),
            currency: price.currency,
            active: String(price.active)
          }
        ])
      )
    );
  }, [prices]);

  async function submitNew(event: FormEvent) {
    event.preventDefault();
    await onSave({ ...form, active: form.active === "1" });
    setForm({ model: "", input_price_per_1m_tokens: "0", output_price_per_1m_tokens: "0", image_price: "0", currency: form.currency || "USD", active: "1" });
  }

  async function saveRow(id: number) {
    const row = rows[id];
    if (!row) return;
    await onSave({
      ...row,
      id,
      active: row.active === "1"
    });
  }

  function updateRow(id: number, key: string, value: string) {
    setRows((current) => ({
      ...current,
      [id]: {
        ...current[id],
        [key]: value
      }
    }));
  }

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
      <section className="panel overflow-hidden">
        <div className="border-b border-slate-200 p-4">
          <h2 className="font-bold text-ink">Precos por modelo</h2>
          <p className="mt-1 text-sm text-slate-500">Edite valores por 1 milhao de tokens e custo unitario de imagem. As execucoes futuras salvam snapshot desses valores.</p>
        </div>
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Modelo</th>
              <th className="px-3 py-2">Input / 1M tokens</th>
              <th className="px-3 py-2">Output / 1M tokens</th>
              <th className="px-3 py-2">Imagem</th>
              <th className="px-3 py-2">Moeda</th>
              <th className="px-3 py-2">Ativo</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {prices.map((price) => {
              const row = rows[price.id];
              if (!row) return null;
              return (
                <tr key={price.id} className="border-t border-slate-100 align-top">
                  <td className="px-3 py-2">
                    <input className="field min-w-44" value={row.model} onChange={(event) => updateRow(price.id, "model", event.target.value)} />
                  </td>
                  <td className="px-3 py-2">
                    <input className="field w-32" type="number" step="0.000001" value={row.input_price_per_1m_tokens} onChange={(event) => updateRow(price.id, "input_price_per_1m_tokens", event.target.value)} />
                  </td>
                  <td className="px-3 py-2">
                    <input className="field w-32" type="number" step="0.000001" value={row.output_price_per_1m_tokens} onChange={(event) => updateRow(price.id, "output_price_per_1m_tokens", event.target.value)} />
                  </td>
                  <td className="px-3 py-2">
                    <input className="field w-28" type="number" step="0.000001" value={row.image_price} onChange={(event) => updateRow(price.id, "image_price", event.target.value)} />
                  </td>
                  <td className="px-3 py-2">
                    <select className="field w-24" value={row.currency} onChange={(event) => updateRow(price.id, "currency", event.target.value)}>
                      <option value="USD">USD</option>
                      <option value="BRL">BRL</option>
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <select className="field w-24" value={row.active} onChange={(event) => updateRow(price.id, "active", event.target.value)}>
                      <option value="1">sim</option>
                      <option value="0">nao</option>
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <button className="inline-flex items-center gap-2 rounded-md bg-brand px-3 py-2 text-xs font-semibold text-white" type="button" onClick={() => saveRow(price.id)}>
                      <Save size={14} /> Salvar
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
      <form className="panel p-4" onSubmit={submitNew}>
        <h2 className="mb-3 font-bold text-ink">Adicionar modelo</h2>
        <Field label="Modelo" value={form.model} onChange={(value) => setForm((current) => ({ ...current, model: value }))} />
        <Field label="Input / 1M tokens" type="number" value={form.input_price_per_1m_tokens} onChange={(value) => setForm((current) => ({ ...current, input_price_per_1m_tokens: value }))} />
        <Field label="Output / 1M tokens" type="number" value={form.output_price_per_1m_tokens} onChange={(value) => setForm((current) => ({ ...current, output_price_per_1m_tokens: value }))} />
        <Field label="Imagem" type="number" value={form.image_price} onChange={(value) => setForm((current) => ({ ...current, image_price: value }))} />
        <Select label="Moeda" value={form.currency} onChange={(value) => setForm((current) => ({ ...current, currency: value }))} options={[["USD", "USD"], ["BRL", "BRL"]]} />
        <Select label="Ativo" value={form.active} onChange={(value) => setForm((current) => ({ ...current, active: value }))} options={[["1", "sim"], ["0", "nao"]]} />
        <button className="mt-3 inline-flex items-center gap-2 rounded-md bg-brand px-3 py-2 text-sm font-semibold text-white"><Save size={15} /> Adicionar preco</button>
      </form>
    </div>
  );
}

function SettingsPanel({ settings, setSettings, onSave }: { settings: Record<string, string>; setSettings: React.Dispatch<React.SetStateAction<Record<string, string>>>; onSave: () => Promise<void> }) {
  return (
    <section className="panel max-w-3xl p-4">
      <div className="grid gap-3 md:grid-cols-2">
        {[
          ["ai_cost_max_per_campaign", "Custo maximo por campanha"],
          ["ai_cost_max_per_client_month", "Custo maximo por cliente por mes"],
          ["ai_cost_max_per_routine", "Custo maximo por rotina"],
          ["ai_default_currency", "Moeda padrao"]
        ].map(([key, label]) => (
          <Field key={key} label={label} value={settings[key] ?? ""} onChange={(value) => setSettings((current) => ({ ...current, [key]: value }))} />
        ))}
        <Select label="Acao ao ultrapassar limite" value={settings.ai_cost_limit_mode ?? "alert"} onChange={(value) => setSettings((current) => ({ ...current, ai_cost_limit_mode: value }))} options={[["alert", "Apenas alertar"], ["block", "Bloquear geracao"]]} />
      </div>
      <button className="mt-4 inline-flex items-center gap-2 rounded-md bg-brand px-3 py-2 text-sm font-semibold text-white" onClick={onSave}><Save size={15} /> Salvar configuracoes</button>
    </section>
  );
}

function DetailModal({ detail, currency, onClose }: { detail: Record<string, unknown>; currency: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <section className="max-h-[90vh] w-full max-w-4xl overflow-auto rounded-md bg-white p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-ink">Detalhe de Execucao #{String(detail.id)}</h2>
          <button className="rounded-md border border-slate-300 px-3 py-1 text-sm" onClick={onClose}>Fechar</button>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <Metric title="Agente" value={String(detail.agent_name || detail.agent_key || "-")} />
          <Metric title="Modelo" value={String(detail.model || "-")} />
          <Metric title="Custo" value={money(detail.total_estimated_cost, currency)} />
          <Metric title="Tokens" value={number(detail.total_tokens)} sub={`in ${number(detail.input_tokens)} / out ${number(detail.output_tokens)}`} />
          <Metric title="Cliente" value={String(detail.client_name || "-")} />
          <Metric title="Campanha" value={String(detail.campaign_name || detail.campaign_id || "-")} />
          <Metric title="Tempo" value={`${number(detail.latency_ms)}ms`} />
          <Metric title="Contexto" value={`${number(detail.context_characters)} chars`} />
          <Metric title="Status" value={String(detail.status)} />
        </div>
        {Boolean(detail.error_message) && <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{String(detail.error_message)}</div>}
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Pre title="Input resumido" value={String(detail.metadata_json || "").slice(0, 2000)} />
          <Pre title="Output resumido" value={String(detail.price_snapshot_json || "").slice(0, 2000)} />
        </div>
      </section>
    </div>
  );
}

function Field({ label, value, type = "text", onChange }: { label: string; value: string; type?: string; onChange: (value: string) => void }) {
  return <div><label className="label">{label}</label><input className="field" type={type} value={value} onChange={(event) => onChange(event.target.value)} /></div>;
}

function Select({ label, value, options, onChange }: { label: string; value: string; options: Array<[string, string]>; onChange: (value: string) => void }) {
  return <div><label className="label">{label}</label><select className="field" value={value} onChange={(event) => onChange(event.target.value)}>{options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}</select></div>;
}

function List({ items, empty }: { items: string[]; empty: string }) {
  return <div className="space-y-2">{items.length ? items.map((item, index) => <p key={index} className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">{item}</p>) : <p className="text-sm text-slate-500">{empty}</p>}</div>;
}

function Pre({ title, value }: { title: string; value: string }) {
  return <div><p className="label">{title}</p><pre className="max-h-72 overflow-auto rounded-md bg-slate-950 p-3 text-xs leading-5 text-slate-100">{value || "-"}</pre></div>;
}

function money(value: unknown, currency: string) {
  return `${currency} ${Number(value ?? 0).toFixed(4)}`;
}

function number(value: unknown) {
  return Number(value ?? 0).toLocaleString("pt-BR");
}
