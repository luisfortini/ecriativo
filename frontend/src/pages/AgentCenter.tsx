import { Bot, Copy, History, Play, RotateCcw, Save } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { ErrorBanner } from "../components/ErrorBanner";
import { LoadingBlock } from "../components/LoadingBlock";
import { PageHeader } from "../components/PageHeader";
import {
  compareAgentVersion,
  duplicateAgent,
  getAgent,
  getAgentLogs,
  getAgents,
  getClients,
  restoreAgentVersion,
  saveAgent,
  testAgent
} from "../services/api";
import type { Agent, AgentExecutionLog, AgentTestResult, ClientSummary } from "../types";

const tabs = ["Configuracoes", "Prompt do sistema", "Template de entrada", "Schema de saida", "Teste do agente", "Historico de versoes", "Logs"];

const emptyAgent = {
  name: "",
  key: "",
  description: "",
  role: "",
  model: "gpt-5.4-mini",
  temperature: 0.4,
  max_tokens: 1800,
  system_prompt: "",
  prompt_template: "{{context_json}}",
  output_schema_json: '{\n  "type": "object",\n  "required": [],\n  "properties": {}\n}',
  is_active: true,
  execution_order: 1,
  change_notes: ""
};

export function AgentCenter() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selected, setSelected] = useState<Agent | null>(null);
  const [form, setForm] = useState(emptyAgent);
  const [tab, setTab] = useState(tabs[0]);
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [testBriefing, setTestBriefing] = useState("");
  const [testClientId, setTestClientId] = useState("");
  const [testContext, setTestContext] = useState("");
  const [testResult, setTestResult] = useState<AgentTestResult | null>(null);
  const [logs, setLogs] = useState<AgentExecutionLog[]>([]);
  const [compare, setCompare] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  function loadAgents(nextId?: number) {
    setLoading(true);
    getAgents()
      .then(async (items) => {
        setAgents(items);
        const id = nextId ?? selected?.id ?? items[0]?.id;
        if (id) await selectAgent(id);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }

  async function selectAgent(id: number) {
    const agent = await getAgent(id);
    setSelected(agent);
    setForm({
      name: agent.name,
      key: agent.key,
      description: agent.description || "",
      role: agent.role || "",
      model: agent.model,
      temperature: agent.temperature ?? 0.4,
      max_tokens: agent.max_tokens ?? 1800,
      system_prompt: agent.system_prompt,
      prompt_template: agent.prompt_template,
      output_schema_json: agent.output_schema_json,
      is_active: agent.is_active,
      execution_order: agent.execution_order,
      change_notes: ""
    });
    setLogs(agent.logs || []);
    setCompare("");
  }

  useEffect(() => {
    loadAgents();
    getClients().then(setClients).catch(() => setClients([]));
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (selected?.is_active && !window.confirm("Este agente esta ativo. Salvar alteracoes criara uma nova versao e afetara o fluxo principal. Continuar?")) {
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const saved = await saveAgent(selected?.id ?? null, form);
      setMessage("Nova versao salva.");
      loadAgents(saved.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel salvar o agente.");
    } finally {
      setSaving(false);
    }
  }

  async function duplicateCurrent() {
    if (!selected) return;
    const copy = await duplicateAgent(selected.id);
    setMessage("Agente duplicado como inativo.");
    loadAgents(copy.id);
  }

  async function runTest() {
    if (!selected) return;
    setTestResult(null);
    setError("");
    try {
      const result = await testAgent(selected.id, {
        briefing: testBriefing,
        client_id: testClientId || null,
        context_json: testContext
      });
      setTestResult(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha no teste do agente.");
    }
  }

  async function restore(versionId: number) {
    if (!selected || !window.confirm("Restaurar esta versao criara uma nova versao atual. Continuar?")) return;
    const agent = await restoreAgentVersion(selected.id, versionId);
    setMessage("Versao restaurada.");
    loadAgents(agent.id);
  }

  async function compareVersion(versionId: number) {
    if (!selected) return;
    const result = await compareAgentVersion(selected.id, versionId);
    setCompare(`Campos alterados: ${result.changed_fields.join(", ") || "nenhum"}`);
  }

  async function loadLogs() {
    if (!selected) return;
    setLogs(await getAgentLogs(selected.id));
  }

  if (loading && agents.length === 0) return <LoadingBlock label="Carregando agentes..." />;

  return (
    <>
      <PageHeader title="Central de Agentes" description="Configure, teste e versione os agentes usados no fluxo principal de campanhas." />
      {error && <ErrorBanner message={error} />}
      {message && <div className="mb-4 rounded-md border border-accent/30 bg-accent-soft px-4 py-3 text-sm text-accent-hover">{message}</div>}

      <div className="grid gap-6 xl:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="panel overflow-hidden">
          <div className="border-b border-slate-200 p-4">
            <h2 className="font-bold text-ink">Agentes</h2>
          </div>
          {agents.map((agent) => (
            <button
              key={agent.id}
              className={`block w-full border-b border-slate-100 p-4 text-left hover:bg-slate-50 ${selected?.id === agent.id ? "bg-slate-50" : ""}`}
              type="button"
              onClick={() => selectAgent(agent.id)}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-ink">{agent.name}</p>
                <span className={`rounded px-2 py-1 text-xs ${agent.is_active ? "bg-accent-soft text-accent-hover" : "bg-slate-100 text-slate-600"}`}>
                  {agent.is_active ? "ativo" : "inativo"}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-500">{agent.key}</p>
            </button>
          ))}
        </aside>

        <section className="min-w-0">
          <div className="mb-4 flex flex-wrap gap-2">
            {tabs.map((item) => (
              <button
                key={item}
                className={`rounded-md px-3 py-2 text-sm font-medium ${tab === item ? "bg-brand text-white" : "bg-white text-slate-700"}`}
                type="button"
                onClick={() => {
                  setTab(item);
                  if (item === "Logs") loadLogs();
                }}
              >
                {item}
              </button>
            ))}
          </div>

          <form className="panel p-5" onSubmit={submit}>
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-md bg-brand text-white">
                  <Bot size={19} />
                </div>
                <div>
                  <h2 className="font-bold text-ink">{selected?.name || "Novo agente"}</h2>
                  <p className="text-xs text-slate-500">{selected?.key}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold" type="button" onClick={duplicateCurrent}>
                  <Copy size={15} />
                  Duplicar agente
                </button>
                <button className="inline-flex items-center gap-2 rounded-md bg-accent px-3 py-2 text-sm font-semibold text-white" disabled={saving}>
                  <Save size={15} />
                  {saving ? "Salvando..." : "Salvar nova versao"}
                </button>
              </div>
            </div>

            {tab === "Configuracoes" && <Settings form={form} setForm={setForm} />}
            {tab === "Prompt do sistema" && <Editor label="system_prompt" value={form.system_prompt} onChange={(value) => setForm((current) => ({ ...current, system_prompt: value }))} />}
            {tab === "Template de entrada" && <Editor label="prompt_template" value={form.prompt_template} onChange={(value) => setForm((current) => ({ ...current, prompt_template: value }))} />}
            {tab === "Schema de saida" && <Editor label="output_schema_json" value={form.output_schema_json} onChange={(value) => setForm((current) => ({ ...current, output_schema_json: value }))} />}
            {tab === "Teste do agente" && (
              <TestPanel
                clients={clients}
                briefing={testBriefing}
                setBriefing={setTestBriefing}
                clientId={testClientId}
                setClientId={setTestClientId}
                context={testContext}
                setContext={setTestContext}
                result={testResult}
                onRun={runTest}
              />
            )}
            {tab === "Historico de versoes" && (
              <VersionPanel selected={selected} compare={compare} onRestore={restore} onCompare={compareVersion} />
            )}
            {tab === "Logs" && <LogsPanel logs={logs} />}
          </form>
        </section>
      </div>
    </>
  );
}

function Settings({ form, setForm }: { form: typeof emptyAgent; setForm: React.Dispatch<React.SetStateAction<typeof emptyAgent>> }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Field label="Nome" value={form.name} onChange={(value) => setForm((current) => ({ ...current, name: value }))} />
      <Field label="Chave interna" value={form.key} onChange={(value) => setForm((current) => ({ ...current, key: value }))} />
      <Field label="Modelo OpenAI" value={form.model} onChange={(value) => setForm((current) => ({ ...current, model: value }))} />
      <Field label="Ordem de execucao" type="number" value={String(form.execution_order)} onChange={(value) => setForm((current) => ({ ...current, execution_order: Number(value) }))} />
      <Field label="Temperatura" type="number" value={String(form.temperature)} onChange={(value) => setForm((current) => ({ ...current, temperature: Number(value) }))} />
      <Field label="Max tokens" type="number" value={String(form.max_tokens)} onChange={(value) => setForm((current) => ({ ...current, max_tokens: Number(value) }))} />
      <div className="md:col-span-2">
        <label className="label">Descricao</label>
        <textarea className="field min-h-20" value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} />
      </div>
      <div className="md:col-span-2">
        <label className="label">Funcao no fluxo</label>
        <textarea className="field min-h-20" value={form.role} onChange={(event) => setForm((current) => ({ ...current, role: event.target.value }))} />
      </div>
      <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
        <input checked={Boolean(form.is_active)} type="checkbox" onChange={(event) => setForm((current) => ({ ...current, is_active: event.target.checked }))} />
        Ativo
      </label>
      <div>
        <label className="label">Notas da alteracao</label>
        <input className="field" value={form.change_notes} onChange={(event) => setForm((current) => ({ ...current, change_notes: event.target.value }))} />
      </div>
    </div>
  );
}

function Field({ label, type = "text", value, onChange }: { label: string; type?: string; value: string; onChange: (value: string) => void }) {
  return (
    <div>
      <label className="label">{label}</label>
      <input className="field" type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function Editor({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div>
      <label className="label">{label}</label>
      <textarea className="field min-h-[520px] font-mono text-xs leading-5" value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function TestPanel(props: {
  clients: ClientSummary[];
  briefing: string;
  setBriefing: (value: string) => void;
  clientId: string;
  setClientId: (value: string) => void;
  context: string;
  setContext: (value: string) => void;
  result: AgentTestResult | null;
  onRun: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="label">Cliente existente</label>
          <select className="field" value={props.clientId} onChange={(event) => props.setClientId(event.target.value)}>
            <option value="">Sem cliente</option>
            {props.clients.map((client) => (
              <option key={client.id} value={client.id}>{client.name}</option>
            ))}
          </select>
        </div>
        <div className="flex items-end">
          <button className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white" type="button" onClick={props.onRun}>
            <Play size={15} />
            Testar agente
          </button>
        </div>
      </div>
      <div>
        <label className="label">Briefing de teste</label>
        <textarea className="field min-h-24" value={props.briefing} onChange={(event) => props.setBriefing(event.target.value)} />
      </div>
      <div>
        <label className="label">Contexto JSON manual opcional</label>
        <textarea className="field min-h-32 font-mono text-xs" value={props.context} onChange={(event) => props.setContext(event.target.value)} />
      </div>
      {props.result && (
        <div className="grid gap-4 xl:grid-cols-3">
          <Result title="Entrada enviada" value={JSON.stringify(props.result.input, null, 2)} />
          <Result title="Resposta bruta" value={props.result.outputRaw || ""} />
          <Result title="JSON parseado / erros" value={props.result.schema_errors.length ? props.result.schema_errors.join("\n") : JSON.stringify(props.result.parsed, null, 2)} />
        </div>
      )}
    </div>
  );
}

function Result({ title, value }: { title: string; value: string }) {
  return (
    <div>
      <p className="label">{title}</p>
      <pre className="max-h-96 overflow-auto rounded-md bg-slate-950 p-3 text-xs leading-5 text-slate-100">{value}</pre>
    </div>
  );
}

function VersionPanel({ selected, compare, onRestore, onCompare }: { selected: Agent | null; compare: string; onRestore: (id: number) => void; onCompare: (id: number) => void }) {
  return (
    <div className="space-y-3">
      {compare && <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">{compare}</div>}
      {selected?.versions?.map((version) => (
        <div key={version.id} className="rounded-md border border-slate-200 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-ink">Versao {version.version_number} · {version.name}</p>
              <p className="text-xs text-slate-500">{version.change_notes || "Sem notas"} · {new Date(version.created_at).toLocaleString("pt-BR")}</p>
            </div>
            <div className="flex gap-2">
              <button className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold" type="button" onClick={() => onCompare(version.id)}>
                <History size={14} />
                Comparar
              </button>
              <button className="inline-flex items-center gap-2 rounded-md bg-brand px-3 py-2 text-xs font-semibold text-white" type="button" onClick={() => onRestore(version.id)}>
                <RotateCcw size={14} />
                Restaurar versao
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function LogsPanel({ logs }: { logs: AgentExecutionLog[] }) {
  return (
    <div className="space-y-3">
      {logs.map((log) => {
        const excessive = (log.tokens_input ?? 0) > 10000 || log.context_warning === "contexto excessivo";
        const total = log.total_tokens ?? ((log.tokens_input ?? 0) + (log.tokens_output ?? 0));
        return (
        <details key={log.id} className={`rounded-md border p-4 ${excessive ? "border-amber-300 bg-amber-50" : "border-slate-200"}`}>
          <summary className="cursor-pointer text-sm font-semibold text-ink">
            {log.status} · {log.latency_ms ?? 0}ms · {new Date(log.created_at).toLocaleString("pt-BR")}
            {excessive && <span className="ml-2 rounded bg-amber-200 px-2 py-1 text-xs text-amber-900">contexto excessivo</span>}
          </summary>
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
            <span>input: {log.tokens_input ?? "-"}</span>
            <span>output: {log.tokens_output ?? "-"}</span>
            <span>total: {total || "-"}</span>
            <span>contexto: {log.context_chars ?? log.tamanho_contexto_caracteres ?? "-"} chars</span>
            {log.campaign_id && <span>campanha: {log.campaign_id}</span>}
            {log.client_id && <span>cliente: {log.client_id}</span>}
          </div>
          <div className="mt-3 grid gap-3 xl:grid-cols-2">
            <Result title="Input" value={log.input_json} />
            <Result title="Output" value={log.output_parsed_json || log.output_raw || log.error_message || ""} />
          </div>
        </details>
        );
      })}
    </div>
  );
}
