import { MessageCircle, Save, Send } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { ErrorBanner } from "../components/ErrorBanner";
import { LoadingBlock } from "../components/LoadingBlock";
import { PageHeader } from "../components/PageHeader";
import { getWhatsappSettings, saveWhatsappSettings, sendWhatsappTest, testWhatsappConnection } from "../services/api";

const defaults: Record<string, string | boolean> = {
  evolution_base_url: "",
  evolution_api_key: "",
  evolution_instance_name: "",
  evolution_text_endpoint_path: "/message/sendText/{instance}",
  evolution_image_endpoint_path: "/message/sendMedia/{instance}",
  evolution_connection_endpoint_path: "/instance/connectionState/{instance}",
  default_notification_phone: "",
  notify_on_campaign_completed: false,
  notify_on_campaign_failed: true,
  notify_on_queue_failed: true,
  notify_on_agent_error: true,
  notify_on_daily_summary: false,
  whatsapp_delivery_enabled: false
};

export function WhatsappSettings() {
  const [form, setForm] = useState(defaults);
  const [testMessage, setTestMessage] = useState("Mensagem de teste do e-Criativo via WhatsApp.");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    getWhatsappSettings()
      .then((settings) => setForm({ ...defaults, ...settings } as Record<string, string | boolean>))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      setForm({ ...defaults, ...(await saveWhatsappSettings(form)) } as Record<string, string | boolean>);
      setMessage("Configuracoes salvas.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function runConnectionTest() {
    setError("");
    setMessage("");
    try {
      await testWhatsappConnection();
      setMessage("Conexao com a Evolution API validada.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao testar conexao.");
    }
  }

  async function runMessageTest() {
    setError("");
    setMessage("");
    try {
      await sendWhatsappTest({ message: testMessage, to: form.default_notification_phone });
      setMessage("Mensagem de teste enviada ou registrada.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao enviar teste.");
    }
  }

  if (loading) return <LoadingBlock label="Carregando WhatsApp..." />;

  return (
    <>
      <PageHeader title="Configurações de WhatsApp" description="Configure Evolution API e regras globais de entrega de campanhas e alertas." />
      {error && <ErrorBanner message={error} />}
      {message && <div className="mb-4 rounded-md border border-accent/30 bg-accent-soft px-4 py-3 text-sm text-accent-hover">{message}</div>}

      <form className="panel p-5" onSubmit={submit}>
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-brand text-white"><MessageCircle size={18} /></div>
          <div>
            <h2 className="font-bold text-ink">Evolution API</h2>
            <p className="text-sm text-slate-500">Os endpoints aceitam {"{instance}"} para compatibilidade entre versões.</p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Field label="URL base da Evolution API" value={String(form.evolution_base_url)} onChange={(value) => setForm((current) => ({ ...current, evolution_base_url: value }))} />
          <Field label="API Key" value={String(form.evolution_api_key)} onChange={(value) => setForm((current) => ({ ...current, evolution_api_key: value }))} />
          <Field label="Nome da instância" value={String(form.evolution_instance_name)} onChange={(value) => setForm((current) => ({ ...current, evolution_instance_name: value }))} />
          <Field label="Número padrão para notificações" value={String(form.default_notification_phone)} onChange={(value) => setForm((current) => ({ ...current, default_notification_phone: value }))} />
          <Field label="Endpoint texto" value={String(form.evolution_text_endpoint_path)} onChange={(value) => setForm((current) => ({ ...current, evolution_text_endpoint_path: value }))} />
          <Field label="Endpoint imagem" value={String(form.evolution_image_endpoint_path)} onChange={(value) => setForm((current) => ({ ...current, evolution_image_endpoint_path: value }))} />
          <Field label="Endpoint conexão" value={String(form.evolution_connection_endpoint_path)} onChange={(value) => setForm((current) => ({ ...current, evolution_connection_endpoint_path: value }))} />
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <Toggle label="Ativar envio via WhatsApp" checked={Boolean(form.whatsapp_delivery_enabled)} onChange={(value) => setForm((current) => ({ ...current, whatsapp_delivery_enabled: value }))} />
          <Toggle label="Enviar campanha concluída" checked={Boolean(form.notify_on_campaign_completed)} onChange={(value) => setForm((current) => ({ ...current, notify_on_campaign_completed: value }))} />
          <Toggle label="Alertar campanha com erro" checked={Boolean(form.notify_on_campaign_failed)} onChange={(value) => setForm((current) => ({ ...current, notify_on_campaign_failed: value }))} />
          <Toggle label="Alertar erro na fila" checked={Boolean(form.notify_on_queue_failed)} onChange={(value) => setForm((current) => ({ ...current, notify_on_queue_failed: value }))} />
          <Toggle label="Alertar erro de agente" checked={Boolean(form.notify_on_agent_error)} onChange={(value) => setForm((current) => ({ ...current, notify_on_agent_error: value }))} />
          <Toggle label="Enviar resumo diário" checked={Boolean(form.notify_on_daily_summary)} onChange={(value) => setForm((current) => ({ ...current, notify_on_daily_summary: value }))} />
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <button className="inline-flex items-center gap-2 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white" disabled={saving}><Save size={15} /> Salvar</button>
          <button className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-semibold" type="button" onClick={runConnectionTest}>Testar conexão</button>
        </div>
      </form>

      <section className="panel mt-5 p-5">
        <h2 className="mb-3 font-bold text-ink">Mensagem de teste</h2>
        <textarea className="field min-h-24" value={testMessage} onChange={(event) => setTestMessage(event.target.value)} />
        <button className="mt-3 inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white" type="button" onClick={runMessageTest}>
          <Send size={15} /> Enviar mensagem de teste
        </button>
      </section>
    </>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <div><label className="label">{label}</label><input className="field" value={value} onChange={(event) => onChange(event.target.value)} /></div>;
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return <label className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />{label}</label>;
}
