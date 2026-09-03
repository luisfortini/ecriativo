import { Save } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ErrorBanner } from "../components/ErrorBanner";
import { LoadingBlock } from "../components/LoadingBlock";
import { PageHeader } from "../components/PageHeader";
import { appendDictation, VoiceDictationButton } from "../components/VoiceDictationButton";
import { getCampaignPlan, getClients, saveCampaignPlan } from "../services/api";
import type { CampaignPlan, ClientSummary } from "../types";
import { optionLabel } from "../utils/uiLabels";

const initial = {
  name: "",
  theme: "",
  strategic_description: "",
  objective: "",
  start_date: localDateValue(new Date()),
  end_date: localDateValue(new Date(Date.now() + 30 * 86400000)),
  recurrence_type: "once",
  preferred_time: "09:00",
  ads_per_client: "1",
  ad_format: "1:1",
  max_ads_per_day: "5",
  max_ads_per_hour: "1",
  min_interval_minutes: "5",
  approval_mode: "waiting_review",
  variation_mode: "sazonal",
  status: "draft"
};

const days = [
  ["0", "Dom"],
  ["1", "Seg"],
  ["2", "Ter"],
  ["3", "Qua"],
  ["4", "Qui"],
  ["5", "Sex"],
  ["6", "Sab"]
];

export function NewCampaignPlan() {
  const { id } = useParams();
  const editing = Boolean(id);
  const [form, setForm] = useState(initial);
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [selected, setSelected] = useState<Record<number, boolean>>({});
  const [recurrenceDays, setRecurrenceDays] = useState<number[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(editing);
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([getClients(), id ? getCampaignPlan(id) : Promise.resolve(null)])
      .then(([clientItems, plan]) => {
        setClients(clientItems);
        if (plan) fillPlanForm(plan);
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  function fillPlanForm(plan: CampaignPlan) {
    setForm({
      name: plan.name,
      theme: plan.theme,
      strategic_description: plan.strategic_description || "",
      objective: plan.objective,
      start_date: plan.start_date,
      end_date: plan.end_date,
      recurrence_type: plan.recurrence_type,
      preferred_time: plan.preferred_time || "09:00",
      ads_per_client: String(plan.ads_per_client),
      ad_format: plan.ad_format,
      max_ads_per_day: String(plan.max_ads_per_day),
      max_ads_per_hour: String(plan.max_ads_per_hour),
      min_interval_minutes: String(plan.min_interval_minutes),
      approval_mode: plan.approval_mode,
      variation_mode: plan.variation_mode,
      status: plan.status
    });
    setSelected(Object.fromEntries((plan.clients || []).map((client) => [client.client_id, true])));
    try {
      const parsed = JSON.parse(plan.recurrence_days_json || "[]");
      setRecurrenceDays(Array.isArray(parsed) ? parsed.map(Number) : []);
    } catch {
      setRecurrenceDays([]);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const payload = {
        ...form,
        ads_per_client: Number(form.ads_per_client),
        max_ads_per_day: Number(form.max_ads_per_day),
        max_ads_per_hour: Number(form.max_ads_per_hour),
        min_interval_minutes: Number(form.min_interval_minutes),
        recurrence_days: recurrenceDays,
        clients: Object.entries(selected).filter(([, value]) => value).map(([client_id]) => ({ client_id: Number(client_id), ads_quantity: Number(form.ads_per_client) }))
      };
      const plan = await saveCampaignPlan(id ? Number(id) : null, payload);
      navigate(`/planejador/${plan.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar o planejamento.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingBlock label="Carregando planejamento..." />;

  return (
    <>
      <PageHeader
        title={editing ? "Editar planejamento" : "Novo planejamento"}
        description={editing ? "Altere a configuração; os itens futuros da fila serão recalculados." : "Defina tema, período, clientes e limites para criar a fila de geração controlada."}
      />
      {error && <ErrorBanner message={error} />}
      <form className="grid gap-6 xl:grid-cols-[1fr_380px]" onSubmit={submit}>
        <section className="panel p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Nome" value={form.name} onChange={(v) => setForm({ ...form, name: v })} required />
            <Field label="Tema da campanha" value={form.theme} onChange={(v) => setForm({ ...form, theme: v })} required dictation />
            <Field label="Objetivo" value={form.objective} onChange={(v) => setForm({ ...form, objective: v })} required dictation />
            <Select label="Formato" value={form.ad_format} onChange={(v) => setForm({ ...form, ad_format: v })} options={["1:1", "4:5", "9:16", "16:9"]} />
            <Field label="Início" type="date" value={form.start_date} onChange={(v) => setForm({ ...form, start_date: v })} />
            <Field label="Fim" type="date" value={form.end_date} onChange={(v) => setForm({ ...form, end_date: v })} />
            <Select label="Recorrência" value={form.recurrence_type} onChange={(v) => setForm({ ...form, recurrence_type: v })} options={["once", "daily", "weekly", "biweekly", "monthly"]} />
            <Field label="Horário preferencial" type="time" value={form.preferred_time} onChange={(v) => setForm({ ...form, preferred_time: v })} />
            <Field label="Anúncios por cliente" type="number" value={form.ads_per_client} onChange={(v) => setForm({ ...form, ads_per_client: v })} />
            <Field label="Máximo de anúncios por dia" type="number" value={form.max_ads_per_day} onChange={(v) => setForm({ ...form, max_ads_per_day: v })} />
            <Field label="Máximo de anúncios por hora" type="number" value={form.max_ads_per_hour} onChange={(v) => setForm({ ...form, max_ads_per_hour: v })} />
            <Field label="Intervalo mínimo em minutos" type="number" value={form.min_interval_minutes} onChange={(v) => setForm({ ...form, min_interval_minutes: v })} />
            <Select label="Modo de aprovação" value={form.approval_mode} onChange={(v) => setForm({ ...form, approval_mode: v })} options={["draft", "waiting_review", "approved"]} />
            <Select label="Variação desejada" value={form.variation_mode} onChange={(v) => setForm({ ...form, variation_mode: v })} options={["institucional", "promocional", "emocional", "oportunidade", "autoridade", "educativo", "sazonal"]} />
            {editing ? (
              <div>
                <p className="label">Situação</p>
                <p className="field bg-slate-50 text-slate-600">{optionLabel(form.status)}</p>
              </div>
            ) : (
              <Select label="Situação" value={form.status} onChange={(v) => setForm({ ...form, status: v })} options={["draft", "active", "paused"]} />
            )}
          </div>
          <TextArea label="Descrição estratégica" value={form.strategic_description} onChange={(value) => setForm({ ...form, strategic_description: value })} dictation />
          <div className="mt-4">
            <label className="label">Dias da semana permitidos</label>
            <div className="flex flex-wrap gap-2">
              {days.map(([value, label]) => (
                <button key={value} className={`rounded-md border px-3 py-2 text-sm ${recurrenceDays.includes(Number(value)) ? "bg-brand text-white" : "bg-white text-slate-700"}`} type="button" onClick={() => setRecurrenceDays((cur) => cur.includes(Number(value)) ? cur.filter((d) => d !== Number(value)) : [...cur, Number(value)])}>{label}</button>
              ))}
            </div>
          </div>
        </section>
        <aside className="space-y-4">
          <div className="panel p-5">
            <h2 className="mb-3 font-bold text-ink">Clientes selecionados</h2>
            <div className="max-h-[520px] space-y-2 overflow-auto">
              {clients.map((client) => (
                <label key={client.id} className="flex items-center gap-3 rounded-md border border-slate-200 p-3 text-sm">
                  <input type="checkbox" checked={Boolean(selected[client.id])} onChange={(e) => setSelected({ ...selected, [client.id]: e.target.checked })} />
                  <span><strong>{client.name}</strong><br /><span className="text-slate-500">{client.segment || "Sem segmento"}</span></span>
                </label>
              ))}
            </div>
          </div>
          <button className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-accent px-4 py-3 text-sm font-bold text-white" disabled={saving}>
            <Save size={16} />{saving ? "Salvando..." : editing ? "Salvar alterações" : "Salvar planejamento"}
          </button>
        </aside>
      </form>
    </>
  );
}

function Field({ label, value, onChange, type = "text", required, dictation = false }: { label: string; value: string; type?: string; required?: boolean; dictation?: boolean; onChange: (value: string) => void }) {
  return <div><label className="label">{label}</label><div className="flex items-start gap-2"><input className="field" required={required} type={type} value={value} onChange={(e) => onChange(e.target.value)} />{dictation && <VoiceDictationButton onTranscript={(text) => onChange(appendDictation(value, text))} />}</div></div>;
}

function TextArea({ label, value, onChange, dictation = false }: { label: string; value: string; dictation?: boolean; onChange: (value: string) => void }) {
  return <div className="mt-4"><label className="label">{label}</label><div className="flex items-start gap-2"><textarea className="field min-h-28 resize-y" value={value} onChange={(event) => onChange(event.target.value)} />{dictation && <VoiceDictationButton onTranscript={(text) => onChange(appendDictation(value, text))} />}</div></div>;
}

function Select({ label, value, onChange, options }: { label: string; value: string; options: string[]; onChange: (value: string) => void }) {
  return <div><label className="label">{label}</label><select className="field" value={value} onChange={(e) => onChange(e.target.value)}>{options.map((option) => <option key={option} value={option}>{optionLabel(option)}</option>)}</select></div>;
}

function localDateValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
