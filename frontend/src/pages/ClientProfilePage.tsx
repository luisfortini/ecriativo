import { ImageUp, Save } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ErrorBanner } from "../components/ErrorBanner";
import { useResolveErrorFeedback } from "../components/FeedbackProvider";
import { LoadingBlock } from "../components/LoadingBlock";
import { PageHeader } from "../components/PageHeader";
import { analyzeClientBrand, applyBrandAnalysis, getClient, getClientWhatsappSettings, reanalyzeClientMaterials, saveClientWhatsappSettings, updateClient, uploadClientAsset } from "../services/api";
import type { ClientAssetType, ClientProfile } from "../types";
import { uiLabel } from "../utils/uiLabels";
import { VisualLibrary } from "../components/VisualLibrary";
import { Steps } from "../components/Steps";
import { useStudio } from "../studio/StudioContext";

const fields = {
  contact_phone: "", instagram_handle: "", address: "",
  content_language: "",
  country: "", state: "", city: "", time_zone: "America/Sao_Paulo", anniversary_date: "", founding_year: "",
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

const fieldLabels: Record<keyof typeof fields, string> = {
  contact_phone: "Telefone de contato público", instagram_handle: "@ do Instagram", address: "Endereço para divulgação",
  content_language: "Idioma dos conteúdos e artes",
  country: "País", state: "Estado", city: "Cidade", time_zone: "Fuso horário (ex.: America/Sao_Paulo)", anniversary_date: "Aniversário da empresa (MM-DD)", founding_year: "Ano de fundação (opcional)",
  name: "Nome",
  segment: "Segmento",
  business_description: "Descrição do negócio",
  target_audience: "Público-alvo",
  differentiators: "Diferenciais",
  brand_voice: "Tom de voz",
  positioning: "Posicionamento",
  color_palette: "Paleta de cores",
  forbidden_colors: "Cores proibidas",
  preferred_typography: "Tipografia preferida",
  visual_references: "Referências visuais",
  approved_styles: "Estilos aprovados",
  forbidden_styles: "Estilos proibidos",
  communication_restrictions: "Restrições de comunicação",
  preferred_ctas: "Chamadas para ação preferidas",
  segment_policies: "Políticas do segmento",
  strategic_notes: "Observações estratégicas",
  brand_memory_summary: "Resumo da memória da marca",
  site_url: "Site",
  instagram_url: "Instagram"
};

const tabs = ["Dados gerais", "Produtos e pessoas", "Identidade visual", "Tom de voz", "Referências", "Restrições", "Análise de Marca", "Histórico", "Aprendizados", "Notificações"];
const guidedTabs = ["Dados gerais", "Identidade visual", "Produtos e pessoas", "Resumo"];

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
  reference_image: "Imagem de referência",
  approved_ad: "Arte aprovada",
  rejected_ad: "Arte reprovada",
  instagram_screenshot: "Print de Instagram",
  website_screenshot: "Print de site",
  approved_reference: "Referência aprovada",
  rejected_reference: "Referência reprovada",
  previous_campaign: "Campanha anterior",
  brand_material: "Material da marca"
};

const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];

async function validateAssetFile(type: ClientAssetType, file: File) {
  if (type !== "logo_main") return "";
  const signature = new Uint8Array(await file.slice(0, pngSignature.length).arrayBuffer());
  const isPng = signature.length === pngSignature.length && pngSignature.every((byte, index) => signature[index] === byte);
  return isPng ? "" : "A logo principal precisa ser um arquivo PNG com fundo transparente. Se sua logo estiver em JPG, exporte-a como PNG antes de enviar.";
}

export function ClientProfilePage() {
  const {reloadBrands, selectBrand, clients:studioClients, canManage}=useStudio();
  const { id } = useParams();
  const resolveErrorFeedback = useResolveErrorFeedback();
  const [client, setClient] = useState<ClientProfile | null>(null);
  const [form, setForm] = useState(fields);
  const [tab, setTab] = useState(tabs[0]);
  const [assetType, setAssetType] = useState<ClientAssetType>("logo_main");
  const [assetFile, setAssetFile] = useState<File | null>(null);
  const [assetDescription, setAssetDescription] = useState("");
  const [assetFeedback, setAssetFeedback] = useState("");
  const [assetError, setAssetError] = useState("");
  const [assetSuccess, setAssetSuccess] = useState("");
  const [uploadingAsset, setUploadingAsset] = useState(false);
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
  const [success, setSuccess] = useState("");

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
  useEffect(()=>{if(id)selectBrand(Number(id));},[id,studioClients.length]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!client) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const updated = await updateClient(client.id, form);
      setClient(updated);
      await reloadBrands();
      selectBrand(Number(updated.id));
      setSuccess("Perfil salvo. Esses dados serão usados nas próximas gerações.");
      const currentStep=guidedTabs.indexOf(tab);
      if(currentStep>=0&&currentStep<2)setTab(guidedTabs[currentStep+1]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar o perfil.");
    } finally {
      setSaving(false);
    }
  }

  async function sendAsset(event: FormEvent) {
    event.preventDefault();
    if (!client || !assetFile || uploadingAsset) return;
    if (assetError) resolveErrorFeedback(assetError);
    setAssetError("");
    setAssetSuccess("");
    setError((current) => current === assetError ? "" : current);
    const validationError = await validateAssetFile(assetType, assetFile);
    if (validationError) {
      setAssetError(validationError);
      setError(validationError);
      return;
    }
    const data = new FormData();
    data.append("type", assetType);
    data.append("description", assetDescription);
    data.append("user_feedback", assetFeedback);
    data.append("file", assetFile);
    setUploadingAsset(true);
    setError("");
    try {
      await uploadClientAsset(client.id, data);
      setAssetFile(null);
      setAssetDescription("");
      setAssetFeedback("");
      setAssetSuccess("Arquivo adicionado com sucesso.");
      load();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Não foi possível adicionar o arquivo. Tente novamente.";
      setAssetError(message);
      setError(message);
    } finally {
      setUploadingAsset(false);
    }
  }

  function changeAssetType(value: ClientAssetType) {
    if (assetError) resolveErrorFeedback(assetError);
    setAssetType(value);
    setAssetFile(null);
    setAssetError("");
    setAssetSuccess("");
    setError((current) => current === assetError ? "" : current);
  }

  function changeAssetFile(file: File | null) {
    if (assetError) resolveErrorFeedback(assetError);
    setAssetFile(file);
    setAssetError("");
    setAssetSuccess("");
    setError((current) => current === assetError ? "" : current);
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
      setError(err instanceof Error ? err.message : "Não foi possível analisar a marca.");
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
      setError(err instanceof Error ? err.message : "Não foi possível reanalisar materiais.");
    } finally {
      setSaving(false);
    }
  }

  async function applySuggestion(field: string) {
    const analysisId = analysisResult?.analysis.id ?? client?.brand_analyses?.[0]?.id;
    if (!client || !analysisId) {
      setError("Execute uma análise de marca antes de aplicar sugestões.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const updated = await applyBrandAnalysis(client.id, analysisId, [field]);
      setClient(updated);
      setForm(Object.fromEntries(Object.keys(fields).map((item) => [item, String(updated[item as keyof ClientProfile] ?? "")])) as typeof fields);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível aplicar a sugestão.");
    } finally {
      setSaving(false);
    }
  }

  async function applyAllSuggestions() {
    const analysisId = analysisResult?.analysis.id ?? client?.brand_analyses?.[0]?.id;
    const comparison = analysisResult?.comparison ?? (client ? buildComparisonFromLatest(client) : []);
    const fieldsToApply = comparison.filter((item) => item.suggestion).map((item) => item.field);
    if (!client || !analysisId || fieldsToApply.length === 0) {
      setError("Execute uma análise de marca antes de aplicar aprendizados.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const updated = await applyBrandAnalysis(client.id, analysisId, fieldsToApply);
      setClient(updated);
      setForm(Object.fromEntries(Object.keys(fields).map((item) => [item, String(updated[item as keyof ClientProfile] ?? "")])) as typeof fields);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível aplicar os aprendizados.");
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
      setError(err instanceof Error ? err.message : "Não foi possível salvar notificações.");
    } finally {
      setSaving(false);
    }
  }

  const visibleFields = useMemo(() => {
    if (tab === "Dados gerais") return ["name", "segment", "business_description", "contact_phone", "instagram_handle", "address", "country", "state", "city", "time_zone", "anniversary_date", "founding_year"];
    if (tab === "Identidade visual") return ["content_language", "color_palette", "approved_styles", "brand_voice", "preferred_typography", "forbidden_colors"];
    if (tab === "Estratégia") return ["target_audience", "differentiators", "positioning", "site_url", "instagram_url"];
    if (tab === "Tom de voz") return ["content_language", "brand_voice", "preferred_ctas"];
    if (tab === "Referências") return ["visual_references", "approved_styles"];
    if (tab === "Restrições") return ["forbidden_styles", "communication_restrictions", "segment_policies"];
    if (tab === "Aprendizados") return ["brand_memory_summary", "strategic_notes"];
    return [];
  }, [tab]);

  if (loading) return <LoadingBlock label="Carregando cliente..." />;
  if (!client) return <ErrorBanner message={error || "Cliente não encontrado."} />;

  return (
    <>
      <PageHeader title={"Vamos preparar " + client.name} description="Faça uma vez, use em cada criação. Comece com o essencial e aperfeiçoe o perfil quando quiser." />
      {error && <ErrorBanner message={error} />}
      {success&&<p role="status" className="studio-success mb-5">{success}</p>}
      <Steps labels={["Sua empresa","Identidade e idioma","Fotos reais","Tudo pronto"]} current={Math.max(0,guidedTabs.indexOf(tab))} onChange={index=>setTab(guidedTabs[index])} disabled={saving}/>
      <details className="mb-6 studio-secondary-tools"><summary>Personalizar mais: estratégia, referências e histórico</summary><div className="studio-tabs mt-3">
        {["Estratégia",...tabs.filter(item=>!guidedTabs.includes(item)&&(canManage||item!=="Notificações"))].map((item) => (
          <button
            key={item}
            className={tab===item?"active":""}
            aria-pressed={tab===item}
            onClick={() => setTab(item)}
            type="button"
          >
            {item}
          </button>
        ))}
      </div></details>

      {tab === "Resumo" ? <section className="panel p-6 sm:p-8"><span className="studio-eyebrow">PERFIL DA MARCA</span><h2 className="studio-section-title mt-2">{client.name}</h2><dl className="studio-profile-summary">{["segment","content_language","color_palette","contact_phone","instagram_handle","address","city","anniversary_date"].map(key=><div key={key}><dt>{fieldLabels[key as keyof typeof fields]}</dt><dd>{String(client[key as keyof ClientProfile]||"Não informado")}</dd></div>)}</dl><p className="helper">{!client.content_language||!client.color_palette?"Defina idioma e paleta em Identidade e idioma para orientar a geração.":"A marca está preparada para criar. Você pode atualizar o perfil a qualquer momento."}</p><Link className="btn-primary mt-5" to="/criar">Começar a criar</Link></section> : tab === "Produtos e pessoas" ? <><VisualLibrary clientId={Number(client.id)} /><div className="action-bar mt-5 flex justify-between"><button type="button" className="btn-secondary" onClick={()=>setTab("Identidade visual")}>Voltar</button><button type="button" className="btn-primary" onClick={()=>setTab("Resumo")}>Ver resumo da marca</button></div></> : tab === "Análise de Marca" ? (
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
          setAssetType={changeAssetType}
          assetDescription={assetDescription}
          setAssetDescription={setAssetDescription}
          assetFeedback={assetFeedback}
          setAssetFeedback={setAssetFeedback}
          assetFile={assetFile}
          setAssetFile={changeAssetFile}
          assetError={assetError}
          assetSuccess={assetSuccess}
          uploadingAsset={uploadingAsset}
          onUpload={sendAsset}
        />
      ) : tab === "Notificações" ? (
        <NotificationTab form={notificationForm} setForm={setNotificationForm} saving={saving} onSave={saveNotifications} />
      ) : tab === "Histórico" ? (
        <div className="panel overflow-hidden">
          {client.campaigns.map((campaign) => (
            <Link key={campaign.id} className="block border-b border-slate-100 p-4 last:border-b-0 hover:bg-slate-50" to={`/campanhas/${campaign.id}`}>
              <p className="font-semibold text-ink">{campaign.objetivo || "Campanha sem objetivo nomeado"}</p>
              <p className="text-sm text-slate-500">{uiLabel(campaign.status)} · {new Date(campaign.created_at).toLocaleString("pt-BR")}</p>
            </Link>
          ))}
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
          <form className="panel p-5" onSubmit={submit}>
            <h2 className="studio-section-title mb-2">{tab==="Dados gerais"?"Conheça sua empresa":tab==="Identidade visual"?"Uma identidade, em cada publicação":tab}</h2>
            <p className="helper mb-5">{tab==="Dados gerais"?"O contato e o endereço abaixo são públicos e podem aparecer nas artes e legendas. Não confunda com o WhatsApp interno da equipe.":tab==="Identidade visual"?"Escolha o idioma e descreva a paleta e o estilo. As próximas gerações usarão essas definições.":"Estes ajustes complementam o perfil da marca."}</p>
            <div className="grid gap-4 md:grid-cols-2">
              {visibleFields.map((field) => (
                <TextField key={field} field={field as keyof typeof fields} value={form[field as keyof typeof fields]} onChange={setForm} />
              ))}
            </div>
            {error&&<p role="alert" className="studio-inline-error mt-4">{error}</p>}
            <button className="btn-primary mt-5" disabled={saving}>
              <Save size={16} />
              {saving ? "Salvando..." : guidedTabs.includes(tab) ? "Salvar e continuar" : "Salvar perfil"}
            </button>
          </form>

          <aside className="space-y-4">
            <div className="studio-summary"><strong>Seu perfil acompanha cada criação</strong><p className="helper">Você não precisa preencher a marca novamente a cada conteúdo. Preencha telefone e @ exatamente como devem aparecer.</p><p className="helper">Cidade e aniversário ajudam a descobrir oportunidades locais.</p></div>
            <form className="panel p-5" onSubmit={sendAsset}>
              <h2 className="mb-4 font-bold text-ink">Arquivos da marca</h2>
              <label className="label">Tipo</label>
              <select className="field mb-3" value={assetType} onChange={(event) => changeAssetType(event.target.value as ClientAssetType)}>
                {Object.entries(assetLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
              <label className="label">Descrição</label>
              <input className="field mb-3" value={assetDescription} onChange={(event) => setAssetDescription(event.target.value)} />
              <label className="flex cursor-pointer flex-col items-center gap-2 rounded-md border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
                <ImageUp size={22} className="text-brand" />
                {assetFile ? assetFile.name : "Enviar arquivo"}
                <input className="sr-only" type="file" accept={assetType === "logo_main" ? "image/png,.png" : "image/*,.pdf"} onChange={(event) => changeAssetFile(event.target.files?.[0] ?? null)} />
              </label>
              {assetType === "logo_main" && (
                <p className="mt-2 text-xs text-slate-500">Formato obrigatório: PNG com fundo transparente. JPG não pode ser usado como logo principal.</p>
              )}
              {assetError && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{assetError}</p>}
              {assetSuccess && <p role="status" className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{assetSuccess}</p>}
              <button className="btn-primary mt-3 w-full" disabled={!assetFile || uploadingAsset}>
                {uploadingAsset ? "Adicionando..." : "Adicionar arquivo"}
              </button>
            </form>

            <div className="panel p-5">
              <h2 className="mb-3 font-bold text-ink">Arquivos cadastrados</h2>
              <div className="space-y-3">
                {client.assets.map((asset) => (
                  <a key={asset.id} className="block rounded-md border border-slate-200 p-3 text-sm hover:border-brand" href={asset.file_url} target="_blank">
                    <p className="font-semibold text-ink">{assetLabels[asset.type]}</p>
                    <p className="text-slate-500">{asset.description || "Sem descrição"}</p>
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
  const label = fieldLabels[props.field];
  if (props.field === "content_language") return <div className="md:col-span-2"><label className="label">{label}<input className="field" maxLength={120} value={props.value} placeholder="Ex.: English (US), Português brasileiro, Español" onChange={event=>props.onChange(current=>({...current,content_language:event.target.value}))}/></label><p className="helper">Vale para as legendas e para os textos dentro das imagens do Social Media. Preencha explicitamente para ter prioridade sobre as observações antigas.</p></div>;
  if (props.field === "anniversary_date") {
    const [month,day] = (props.value || "-").split("-");
    return <div><label className="label">Aniversário da empresa</label><div className="flex gap-2"><input aria-label="Dia do aniversário" className="field" type="number" min={1} max={31} placeholder="Dia" value={day || ""} onChange={e=>props.onChange(current=>({...current,anniversary_date:`${month || ""}-${e.target.value ? e.target.value.padStart(2,"0") : ""}`}))}/><select aria-label="Mês do aniversário" className="field" value={month || ""} onChange={e=>props.onChange(current=>({...current,anniversary_date:`${e.target.value}-${day || ""}`}))}><option value="">Mês</option>{["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"].map((name,index)=><option key={name} value={String(index+1).padStart(2,"0")}>{name}</option>)}</select></div><button type="button" className="btn-secondary" onClick={()=>props.onChange(current=>({...current,anniversary_date:""}))}>Limpar data</button><p className="text-xs text-slate-500">O ano de fundação é opcional e permite calcular quantos anos a empresa completa.</p></div>;
  }
  const isLong = !["name", "segment", "color_palette", "forbidden_colors", "preferred_typography", "country", "state", "city", "time_zone", "founding_year","contact_phone","instagram_handle","site_url","instagram_url"].includes(props.field);
  return (
    <div className={isLong ? "md:col-span-2" : undefined}>
      <label className="label" htmlFor={"brand-"+props.field}>{label}</label>
      {isLong ? (
        <textarea id={"brand-"+props.field} className="field min-h-28" maxLength={props.field==="address"?500:undefined} placeholder={props.field==="address"?"Rua, número, bairro e complemento. Inclua cidade se desejar.":undefined} value={props.value} onChange={(event) => props.onChange((current) => ({ ...current, [props.field]: event.target.value }))} />
      ) : (
        <input id={"brand-"+props.field} className="field" type={props.field==="contact_phone"?"tel":"text"} required={props.field==="name"} minLength={props.field==="name"?2:undefined} maxLength={props.field==="contact_phone"?40:props.field==="instagram_handle"?31:undefined} placeholder={props.field==="contact_phone"?"+55 (19) 99999-9999":props.field==="instagram_handle"?"@suamarca":undefined} value={props.value} onChange={(event) => props.onChange((current) => ({ ...current, [props.field]: event.target.value }))} />
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
          <label className="label">Situação</label>
          <select className="field" value={props.form.active ? "1" : "0"} onChange={(event) => props.setForm((current) => ({ ...current, active: event.target.value === "1" }))}>
            <option value="1">Ativo</option>
            <option value="0">Inativo</option>
          </select>
        </div>
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-3">
        <Toggle label="Receber campanhas geradas" checked={Boolean(props.form.receive_generated_campaigns)} onChange={(value) => props.setForm((current) => ({ ...current, receive_generated_campaigns: value }))} />
        <Toggle label="Receber erros" checked={Boolean(props.form.receive_errors)} onChange={(value) => props.setForm((current) => ({ ...current, receive_errors: value }))} />
        <Toggle label="Receber resumo semanal" checked={Boolean(props.form.receive_weekly_summary)} onChange={(value) => props.setForm((current) => ({ ...current, receive_weekly_summary: value }))} />
      </div>
      <button className="btn-primary mt-5" type="button" disabled={props.saving} onClick={props.onSave}>
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
  assetError: string;
  assetSuccess: string;
  uploadingAsset: boolean;
  onUpload: (event: FormEvent) => void;
}) {
  const latest = props.analysisResult?.comparison ?? buildComparisonFromLatest(props.client);
  const activeDiagnostic = props.client.profile_diagnostics?.find((item) => item.status === "active");

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
      <section className="space-y-4">
        <div className="panel p-5">
          <h2 className="mb-4 font-bold text-ink">Analisar presença digital</h2>
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
          <label className="label mt-4">Textos copiados da bio, legendas ou observações manuais</label>
          <textarea className="field min-h-28" value={props.manualNotes} onChange={(event) => props.setManualNotes(event.target.value)} />
          <button className="btn-primary mt-4" type="button" onClick={props.onAnalyze} disabled={props.saving}>
            {props.saving ? "Analisando..." : "Analisar marca com IA"}
          </button>
        </div>

        <div className="panel p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="font-bold text-ink">Revisão antes de salvar</h2>
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
              <button className="btn-primary" type="button" onClick={props.onApplyAll}>
                Aplicar aprendizados do cliente
              </button>
            </div>
          </div>
          <div className="space-y-3">
            {latest.length === 0 ? (
              <p className="text-sm text-slate-500">Execute uma análise para comparar o valor atual e a sugestão da IA.</p>
            ) : (
              latest.map((item) => (
                <div key={item.field} className="rounded-md border border-slate-200 p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <p className="font-semibold text-ink">{item.label}</p>
                    <button className="btn-primary" type="button" onClick={() => props.onApply(item.field)}>
                      Aplicar
                    </button>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <div>
                      <p className="label">Valor atual</p>
                      <p className="whitespace-pre-wrap rounded-md bg-slate-50 p-3 text-sm text-slate-700">{item.current || "Não preenchido"}</p>
                    </div>
                    <div>
                      <p className="label">Sugestão da IA</p>
                      <p className="whitespace-pre-wrap rounded-md bg-accent-soft p-3 text-sm text-accent-hover">{item.suggestion || "Sem sugestão"}</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <aside className="space-y-4">
        <div className="panel p-5">
          <h2 className="mb-3 font-bold text-ink">Diagnóstico oficial</h2>
          {activeDiagnostic ? (
            <div className="space-y-2 text-sm text-slate-700">
              <p><strong>Versão:</strong> {activeDiagnostic.version} · esquema {activeDiagnostic.schema_version}</p>
              <p><strong>Confiança:</strong> {Math.round(activeDiagnostic.payload.confidenceScore * 100)}%</p>
              <p><strong>Posicionamento:</strong> {activeDiagnostic.payload.positioning}</p>
              <p className="text-xs text-slate-500">Este diagnóstico será reutilizado pelos fluxos enquanto permanecer ativo.</p>
            </div>
          ) : (
            <p className="text-sm text-slate-500">Nenhum diagnóstico de perfil ativo. Uma nova análise criará a versão inicial.</p>
          )}
        </div>

        <form className="panel p-5" onSubmit={props.onUpload}>
          <h2 className="mb-4 font-bold text-ink">Analisar por referências enviadas</h2>
          <label className="label">Classificação</label>
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
          <label className="label">Descrição</label>
          <textarea className="field mb-3 min-h-20" value={props.assetDescription} onChange={(event) => props.setAssetDescription(event.target.value)} />
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-md border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-600">
            <ImageUp size={22} className="text-brand" />
            {props.assetFile ? props.assetFile.name : "Enviar print, logo, banner, post, story ou campanha"}
            <input
              className="sr-only"
              type="file"
              accept={props.assetType === "logo_main" ? "image/png" : "image/*,.pdf"}
              onChange={(event) => props.setAssetFile(event.target.files?.[0] ?? null)}
            />
          </label>
          {props.assetType === "logo_main" && (
            <p className="mt-2 text-xs text-slate-500">Formato obrigatório: PNG com fundo transparente. JPG não pode ser usado como logo principal. A nova logo substituirá a atual.</p>
          )}
          {props.assetError && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{props.assetError}</p>}
          {props.assetSuccess && <p role="status" className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{props.assetSuccess}</p>}
          <button className="btn-primary mt-3 w-full" disabled={!props.assetFile || props.uploadingAsset}>
            {props.uploadingAsset ? "Enviando..." : "Enviar material"}
          </button>
        </form>

        <div className="panel p-5">
          <h2 className="mb-3 font-bold text-ink">Histórico de análises</h2>
          <div className="space-y-3">
            {props.client.brand_analyses?.map((analysis) => (
              <div key={analysis.id} className="rounded-md border border-slate-200 p-3 text-sm">
                <p className="font-semibold text-ink">{analysis.source_type}</p>
                <p className="text-xs text-slate-500">{new Date(analysis.created_at).toLocaleString("pt-BR")}</p>
                <p className="mt-2 text-slate-600">{analysis.suggested_visual_style || analysis.suggested_positioning || "Análise salva"}</p>
              </div>
            ))}
            {props.client.brand_analyses?.length === 0 && <p className="text-sm text-slate-500">Nenhuma análise salva ainda.</p>}
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
    { field: "target_audience", label: "Público-alvo", current: client.target_audience, suggestion: latest.suggested_target_audience || "" },
    { field: "color_palette", label: "Paleta de cores", current: client.color_palette, suggestion: latest.suggested_color_palette || "" },
    { field: "visual_style", label: "Referências visuais", current: client.visual_references, suggestion: latest.suggested_visual_style || "" },
    { field: "common_ctas", label: "CTAs preferidos", current: client.preferred_ctas, suggestion: latest.suggested_ctas || "" },
    { field: "restrictions", label: "Restrições recomendadas", current: client.communication_restrictions, suggestion: latest.suggested_restrictions || "" }
  ];
}
