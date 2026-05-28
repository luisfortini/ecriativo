import { ImageUp, Save } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ErrorBanner } from "../components/ErrorBanner";
import { LoadingBlock } from "../components/LoadingBlock";
import { PageHeader } from "../components/PageHeader";
import { analyzeClientBrand, applyBrandAnalysis, getClient, getClientWhatsappSettings, reanalyzeClientMaterials, saveClientWhatsappSettings, updateClient, uploadClientAsset } from "../services/api";
import type { ClientAssetType, ClientProfile } from "../types";

const fields = {
  name: "",
  segment: "",
  business_description: "",
  target_audience: "",
  differentiators: "",
  brand_voice: "",
  positioning: "",
  color_palette: "",
  forbidden_colors: "",
  preferred_typography: "",
  visual_references: "",
  approved_styles: "",
  forbidden_styles: "",
  communication_restrictions: "",
  preferred_ctas: "",
  segment_policies: "",
  strategic_notes: "",
  brand_memory_summary: "",
  site_url: "",
  instagram_url: ""
};

const tabs = ["Dados gerais", "Identidade visual", "Tom de voz", "Referencias", "Restricoes", "Analise de Marca", "Historico", "Aprendizados", "Notificações"];

const notificationDefaults: Record<string, string | boolean> = {
  responsible_phone: "",
  whatsapp_group: "",
  receive_generated_campaigns: false,
  receive_errors: false,
  receive_weekly_summary: false,
  delivery_format: "image_caption",
  active: true
};

const assetLabels: Record<ClientAssetType, string> = {
  logo_main: "Logo principal",
  logo_white: "Logo branca",
  logo_dark: "Logo escura",
  reference_image: "Imagem de referencia",
  approved_ad: "Arte aprovada",
  rejected_ad: "Arte reprovada",
  instagram_screenshot: "Print de Instagram",
  website_screenshot: "Print de site",
  approved_reference: "Referencia aprovada",
  rejected_reference: "Referencia reprovada",
  previous_campaign: "Campanha anterior",
  brand_material: "Material da marca"
};

export function ClientProfilePage() {
  const { id } = useParams();
  const [client, setClient] = useState<ClientProfile | null>(null);
  const [form, setForm] = useState(fields);
  const [tab, setTab] = useState(tabs[0]);
  const [assetType, setAssetType] = useState<ClientAssetType>("logo_main");
  const [assetFile, setAssetFile] = useState<File | null>(null);
  const [assetDescription, setAssetDescription] = useState("");
  const [assetFeedback, setAssetFeedback] = useState("");
  const [manualNotes, setManualNotes] = useState("");
  const [notificationForm, setNotificationForm] = useState(notificationDefaults);
  const [analysisResult, setAnalysisResult] = useState<{
    analysis: { id: number };
    comparison: Array<{ field: string; label: string; current: string | null; suggestion: string }>;
    suggestions: Record<string, unknown>;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function load() {
    if (!id) return;
    setLoading(true);
    getClient(id)
      .then((data) => {
        setClient(data);
        setForm(Object.fromEntries(Object.keys(fields).map((field) => [field, String(data[field as keyof ClientProfile] ?? "")])) as typeof fields);
        getClientWhatsappSettings(data.id).then((settings) => setNotificationForm({ ...notificationDefaults, ...settings } as Record<string, string | boolean>)).catch(() => setNotificationForm(notificationDefaults));
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(load, [id]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!client) return;
    setSaving(true);
    setError("");
    try {
      const updated = await updateClient(client.id, form);
      setClient(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel salvar o perfil.");
    } finally {
      setSaving(false);
    }
  }

  async function sendAsset(event: FormEvent) {
    event.preventDefault();
    if (!client || !assetFile) return;
    const data = new FormData();
    data.append("type", assetType);
    data.append("description", assetDescription);
    data.append("user_feedback", assetFeedback);
    data.append("file", assetFile);
    await uploadClientAsset(client.id, data);
    setAssetFile(null);
    setAssetDescription("");
    setAssetFeedback("");
    load();
  }

  async function runBrandAnalysis() {
    if (!client) return;
    setSaving(true);
    setError("");
    try {
      const result = await analyzeClientBrand(client.id, {
        site_url: form.site_url,
        instagram_url: form.instagram_url,
        manual_notes: manualNotes,
        asset_ids: client.assets.map((asset) => asset.id)
      });
      setAnalysisResult(result);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel analisar a marca.");
    } finally {
      setSaving(false);
    }
  }

  async function runMaterialReanalysis() {
    if (!client) return;
    setSaving(true);
    setError("");
    try {
      const result = await reanalyzeClientMaterials(client.id);
      setAnalysisResult(result);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel reanalisar materiais.");
    } finally {
      setSaving(false);
    }
  }

  async function applySuggestion(field: string) {
    const analysisId = analysisResult?.analysis.id ?? client?.brand_analyses?.[0]?.id;
    if (!client || !analysisId) {
      setError("Execute uma analise de marca antes de aplicar sugestoes.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const updated = await applyBrandAnalysis(client.id, analysisId, [field]);
      setClient(updated);
      setForm(Object.fromEntries(Object.keys(fields).map((item) => [item, String(updated[item as keyof ClientProfile] ?? "")])) as typeof fields);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel aplicar a sugestao.");
    } finally {
      setSaving(false);
    }
  }

  async function applyAllSuggestions() {
    const analysisId = analysisResult?.analysis.id ?? client?.brand_analyses?.[0]?.id;
    const comparison = analysisResult?.comparison ?? (client ? buildComparisonFromLatest(client) : []);
    const fieldsToApply = comparison.filter((item) => item.suggestion).map((item) => item.field);
    if (!client || !analysisId || fieldsToApply.length === 0) {
      setError("Execute uma analise de marca antes de aplicar aprendizados.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const updated = await applyBrandAnalysis(client.id, analysisId, fieldsToApply);
      setClient(updated);
      setForm(Object.fromEntries(Object.keys(fields).map((item) => [item, String(updated[item as keyof ClientProfile] ?? "")])) as typeof fields);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel aplicar os aprendizados.");
    } finally {
      setSaving(false);
    }
  }

  async function saveNotifications() {
    if (!client) return;
    setSaving(true);
    setError("");
    try {
      setNotificationForm({ ...notificationDefaults, ...(await saveClientWhatsappSettings(client.id, notificationForm)) } as Record<string, string | boolean>);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel salvar notificacoes.");
    } finally {
      setSaving(false);
    }
  }

  const visibleFields = useMemo(() => {
    if (tab === "Dados gerais") return ["name", "segment", "business_description", "target_audience", "differentiators", "positioning", "site_url", "instagram_url"];
    if (tab === "Identidade visual") return ["color_palette", "forbidden_colors", "preferred_typography"];
    if (tab === "Tom de voz") return ["brand_voice", "preferred_ctas"];
    if (tab === "Referencias") return ["visual_references", "approved_styles"];
    if (tab === "Restricoes") return ["forbidden_styles", "communication_restrictions", "segment_policies"];
    if (tab === "Aprendizados") return ["brand_memory_summary", "strategic_notes"];
    return [];
  }, [tab]);

  if (loading) return <LoadingBlock label="Carregando cliente..." />;
  if (!client) return <ErrorBanner message={error || "Cliente nao encontrado."} />;

  return (
    <>
      <PageHeader title={client.name} description="Perfil Criativo do Cliente: memoria estrategica e visual usada automaticamente pelos agentes." />
      {error && <ErrorBanner message={error} />}

      <div className="mb-5 flex gap-2 overflow-x-auto">
        {tabs.map((item) => (
          <button
            key={item}
            className={`shrink-0 rounded-md px-3 py-2 text-sm font-medium ${tab === item ? "bg-brand text-white" : "bg-white text-slate-700"}`}
            onClick={() => setTab(item)}
            type="button"
          >
            {item}
          </button>
        ))}
      </div>

      {tab === "Analise de Marca" ? (
        <BrandAnalysisTab
          client={client}
          form={form}
          setForm={setForm}
          manualNotes={manualNotes}
          setManualNotes={setManualNotes}
          saving={saving}
          analysisResult={analysisResult}
          onAnalyze={runBrandAnalysis}
          onApply={applySuggestion}
          onApplyAll={applyAllSuggestions}
          onReanalyze={runMaterialReanalysis}
          assetType={assetType}
          setAssetType={setAssetType}
          assetDescription={assetDescription}
          setAssetDescription={setAssetDescription}
          assetFeedback={assetFeedback}
          setAssetFeedback={setAssetFeedback}
          assetFile={assetFile}
          setAssetFile={setAssetFile}
          onUpload={sendAsset}
        />
      ) : tab === "Notificações" ? (
        <NotificationTab form={notificationForm} setForm={setNotificationForm} saving={saving} onSave={saveNotifications} />
      ) : tab === "Historico" ? (
        <div className="panel overflow-hidden">
          {client.campaigns.map((campaign) => (
            <Link key={campaign.id} className="block border-b border-slate-100 p-4 last:border-b-0 hover:bg-slate-50" to={`/campanhas/${campaign.id}`}>
              <p className="font-semibold text-ink">{campaign.objetivo || "Campanha sem objetivo nomeado"}</p>
              <p className="text-sm text-slate-500">{campaign.status} · {new Date(campaign.created_at).toLocaleString("pt-BR")}</p>
            </Link>
          ))}
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
          <form className="panel p-5" onSubmit={submit}>
            <div className="grid gap-4 md:grid-cols-2">
              {visibleFields.map((field) => (
                <TextField key={field} field={field as keyof typeof fields} value={form[field as keyof typeof fields]} onChange={setForm} />
              ))}
            </div>
            <button className="mt-5 inline-flex items-center gap-2 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white" disabled={saving}>
              <Save size={16} />
              {saving ? "Salvando..." : "Salvar perfil"}
            </button>
          </form>

          <aside className="space-y-4">
            <form className="panel p-5" onSubmit={sendAsset}>
              <h2 className="mb-4 font-bold text-ink">Arquivos da marca</h2>
              <label className="label">Tipo</label>
              <select className="field mb-3" value={assetType} onChange={(event) => setAssetType(event.target.value as ClientAssetType)}>
                {Object.entries(assetLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
              <label className="label">Descricao</label>
              <input className="field mb-3" value={assetDescription} onChange={(event) => setAssetDescription(event.target.value)} />
              <label className="flex cursor-pointer flex-col items-center gap-2 rounded-md border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
                <ImageUp size={22} className="text-brand" />
                {assetFile ? assetFile.name : "Enviar arquivo"}
                <input className="sr-only" type="file" accept="image/*,.pdf" onChange={(event) => setAssetFile(event.target.files?.[0] ?? null)} />
              </label>
              <button className="mt-3 w-full rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white" disabled={!assetFile}>
                Adicionar asset
              </button>
            </form>

            <div className="panel p-5">
              <h2 className="mb-3 font-bold text-ink">Assets cadastrados</h2>
              <div className="space-y-3">
                {client.assets.map((asset) => (
                  <a key={asset.id} className="block rounded-md border border-slate-200 p-3 text-sm hover:border-brand" href={asset.file_url} target="_blank">
                    <p className="font-semibold text-ink">{assetLabels[asset.type]}</p>
                    <p className="text-slate-500">{asset.description || "Sem descricao"}</p>
                    {asset.ai_summary && <p className="mt-2 text-xs text-slate-500">{asset.ai_summary}</p>}
                  </a>
                ))}
              </div>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}

function TextField(props: { field: keyof typeof fields; value: string; onChange: React.Dispatch<React.SetStateAction<typeof fields>> }) {
  const label = props.field.replace(/_/g, " ");
  const isLong = !["name", "segment", "color_palette", "forbidden_colors", "preferred_typography"].includes(props.field);
  return (
    <div className={isLong ? "md:col-span-2" : undefined}>
      <label className="label">{label}</label>
      {isLong ? (
        <textarea className="field min-h-28" value={props.value} onChange={(event) => props.onChange((current) => ({ ...current, [props.field]: event.target.value }))} />
      ) : (
        <input className="field" value={props.value} onChange={(event) => props.onChange((current) => ({ ...current, [props.field]: event.target.value }))} />
      )}
    </div>
  );
}

function NotificationTab(props: {
  form: Record<string, string | boolean>;
  setForm: React.Dispatch<React.SetStateAction<Record<string, string | boolean>>>;
  saving: boolean;
  onSave: () => void;
}) {
  return (
    <section className="panel max-w-3xl p-5">
      <h2 className="mb-4 font-bold text-ink">Notificações do cliente</h2>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="label">Telefone do responsável</label>
          <input className="field" value={String(props.form.responsible_phone || "")} onChange={(event) => props.setForm((current) => ({ ...current, responsible_phone: event.target.value }))} />
        </div>
        <div>
          <label className="label">Grupo de WhatsApp opcional</label>
          <input className="field" value={String(props.form.whatsapp_group || "")} onChange={(event) => props.setForm((current) => ({ ...current, whatsapp_group: event.target.value }))} />
        </div>
        <div>
          <label className="label">Formato de envio</label>
          <select className="field" value={String(props.form.delivery_format)} onChange={(event) => props.setForm((current) => ({ ...current, delivery_format: event.target.value }))}>
            <option value="image_caption">imagem + legenda</option>
            <option value="link_only">somente link</option>
            <option value="internal_alert">somente alerta interno</option>
          </select>
        </div>
        <div>
          <label className="label">Status</label>
          <select className="field" value={props.form.active ? "1" : "0"} onChange={(event) => props.setForm((current) => ({ ...current, active: event.target.value === "1" }))}>
            <option value="1">ativo</option>
            <option value="0">inativo</option>
          </select>
        </div>
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-3">
        <Toggle label="Receber campanhas geradas" checked={Boolean(props.form.receive_generated_campaigns)} onChange={(value) => props.setForm((current) => ({ ...current, receive_generated_campaigns: value }))} />
        <Toggle label="Receber erros" checked={Boolean(props.form.receive_errors)} onChange={(value) => props.setForm((current) => ({ ...current, receive_errors: value }))} />
        <Toggle label="Receber resumo semanal" checked={Boolean(props.form.receive_weekly_summary)} onChange={(value) => props.setForm((current) => ({ ...current, receive_weekly_summary: value }))} />
      </div>
      <button className="mt-5 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white" type="button" disabled={props.saving} onClick={props.onSave}>
        {props.saving ? "Salvando..." : "Salvar notificações"}
      </button>
    </section>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}

function BrandAnalysisTab(props: {
  client: ClientProfile;
  form: typeof fields;
  setForm: React.Dispatch<React.SetStateAction<typeof fields>>;
  manualNotes: string;
  setManualNotes: (value: string) => void;
  saving: boolean;
  analysisResult: {
    analysis: { id: number };
    comparison: Array<{ field: string; label: string; current: string | null; suggestion: string }>;
    suggestions: Record<string, unknown>;
  } | null;
  onAnalyze: () => void;
  onApply: (field: string) => void;
  onApplyAll: () => void;
  onReanalyze: () => void;
  assetType: ClientAssetType;
  setAssetType: (value: ClientAssetType) => void;
  assetDescription: string;
  setAssetDescription: (value: string) => void;
  assetFeedback: string;
  setAssetFeedback: (value: string) => void;
  assetFile: File | null;
  setAssetFile: (value: File | null) => void;
  onUpload: (event: FormEvent) => void;
}) {
  const latest = props.analysisResult?.comparison ?? buildComparisonFromLatest(props.client);

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
      <section className="space-y-4">
        <div className="panel p-5">
          <h2 className="mb-4 font-bold text-ink">Analisar presenca digital</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="label">Site</label>
              <input className="field" value={props.form.site_url} onChange={(event) => props.setForm((current) => ({ ...current, site_url: event.target.value }))} />
            </div>
            <div>
              <label className="label">Instagram</label>
              <input className="field" value={props.form.instagram_url} onChange={(event) => props.setForm((current) => ({ ...current, instagram_url: event.target.value }))} />
            </div>
          </div>
          <label className="label mt-4">Textos copiados da bio, legendas ou observacoes manuais</label>
          <textarea className="field min-h-28" value={props.manualNotes} onChange={(event) => props.setManualNotes(event.target.value)} />
          <button className="mt-4 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white" type="button" onClick={props.onAnalyze} disabled={props.saving}>
            {props.saving ? "Analisando..." : "Analisar marca com IA"}
          </button>
        </div>

        <div className="panel p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="font-bold text-ink">Revisao antes de salvar</h2>
            <div className="flex flex-wrap gap-2">
              <button className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700" type="button" onClick={() => props.onApply("approved_styles")}>
                Salvar como estilo aprovado
              </button>
              <button className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700" type="button" onClick={() => props.onApply("forbidden_styles")}>
                Salvar como estilo proibido
              </button>
              <button className="rounded-md border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700" type="button" onClick={props.onReanalyze}>
                Reanalisar materiais
              </button>
              <button className="rounded-md bg-brand px-3 py-2 text-xs font-semibold text-white" type="button" onClick={props.onApplyAll}>
                Aplicar aprendizados do cliente
              </button>
            </div>
          </div>
          <div className="space-y-3">
            {latest.length === 0 ? (
              <p className="text-sm text-slate-500">Execute uma analise para comparar valor atual e sugestao da IA.</p>
            ) : (
              latest.map((item) => (
                <div key={item.field} className="rounded-md border border-slate-200 p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <p className="font-semibold text-ink">{item.label}</p>
                    <button className="rounded-md bg-accent px-3 py-2 text-xs font-semibold text-white" type="button" onClick={() => props.onApply(item.field)}>
                      Aplicar
                    </button>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <p className="label">Valor atual</p>
                      <p className="whitespace-pre-wrap rounded-md bg-slate-50 p-3 text-sm text-slate-700">{item.current || "Nao preenchido"}</p>
                    </div>
                    <div>
                      <p className="label">Sugestao da IA</p>
                      <p className="whitespace-pre-wrap rounded-md bg-accent-soft p-3 text-sm text-accent-hover">{item.suggestion || "Sem sugestao"}</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <aside className="space-y-4">
        <form className="panel p-5" onSubmit={props.onUpload}>
          <h2 className="mb-4 font-bold text-ink">Analisar por referencias enviadas</h2>
          <label className="label">Classificacao</label>
          <select className="field mb-3" value={props.assetType} onChange={(event) => props.setAssetType(event.target.value as ClientAssetType)}>
            {Object.entries(assetLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <label className="label">Aprovado/Reprovado e contexto</label>
          <select className="field mb-3" value={props.assetFeedback} onChange={(event) => props.setAssetFeedback(event.target.value)}>
            <option value="">Sem feedback</option>
            <option value="aprovado">Aprovado</option>
            <option value="reprovado">Reprovado</option>
            <option value="manter estilo">Manter estilo</option>
            <option value="evitar estilo">Evitar estilo</option>
          </select>
          <label className="label">Descricao</label>
          <textarea className="field mb-3 min-h-20" value={props.assetDescription} onChange={(event) => props.setAssetDescription(event.target.value)} />
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-md border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
            <ImageUp size={22} className="text-brand" />
            {props.assetFile ? props.assetFile.name : "Enviar print, logo, banner, post, story ou campanha"}
            <input className="sr-only" type="file" accept="image/*,.pdf" onChange={(event) => props.setAssetFile(event.target.files?.[0] ?? null)} />
          </label>
          <button className="mt-3 w-full rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white" disabled={!props.assetFile}>
            Enviar material
          </button>
        </form>

        <div className="panel p-5">
          <h2 className="mb-3 font-bold text-ink">Historico de analises</h2>
          <div className="space-y-3">
            {props.client.brand_analyses?.map((analysis) => (
              <div key={analysis.id} className="rounded-md border border-slate-200 p-3 text-sm">
                <p className="font-semibold text-ink">{analysis.source_type}</p>
                <p className="text-xs text-slate-500">{new Date(analysis.created_at).toLocaleString("pt-BR")}</p>
                <p className="mt-2 text-slate-600">{analysis.suggested_visual_style || analysis.suggested_positioning || "Analise salva"}</p>
              </div>
            ))}
            {props.client.brand_analyses?.length === 0 && <p className="text-sm text-slate-500">Nenhuma analise salva ainda.</p>}
          </div>
        </div>
      </aside>
    </div>
  );
}

function buildComparisonFromLatest(client: ClientProfile) {
  const latest = client.brand_analyses?.[0];
  if (!latest) return [];
  return [
    { field: "brand_voice", label: "Tom de voz", current: client.brand_voice, suggestion: latest.suggested_brand_voice || "" },
    { field: "positioning", label: "Posicionamento", current: client.positioning, suggestion: latest.suggested_positioning || "" },
    { field: "target_audience", label: "Publico-alvo", current: client.target_audience, suggestion: latest.suggested_target_audience || "" },
    { field: "color_palette", label: "Paleta de cores", current: client.color_palette, suggestion: latest.suggested_color_palette || "" },
    { field: "visual_style", label: "Referencias visuais", current: client.visual_references, suggestion: latest.suggested_visual_style || "" },
    { field: "common_ctas", label: "CTAs preferidos", current: client.preferred_ctas, suggestion: latest.suggested_ctas || "" },
    { field: "restrictions", label: "Restricoes recomendadas", current: client.communication_restrictions, suggestion: latest.suggested_restrictions || "" }
  ];
}
