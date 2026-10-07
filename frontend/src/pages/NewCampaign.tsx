import { ImageUp, Loader2, Wand2 } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ErrorBanner } from "../components/ErrorBanner";
import { PageHeader } from "../components/PageHeader";
import { appendDictation, VoiceDictationButton } from "../components/VoiceDictationButton";
import { createCampaign, getClient, getClients } from "../services/api";
import type { ClientProfile, ClientSummary } from "../types";
import { VisualSelector, emptySelection } from "../components/VisualLibrary";
import { useResolveErrorFeedback } from "../components/FeedbackProvider";
import { useStudio } from "../studio/StudioContext";

const formats = ["1:1", "4:5", "9:16", "16:9"] as const;

const initialForm = {
  client_id: "",
  free_briefing: "",
  objetivo: "",
  publico_alvo: "",
  oferta: "",
  formato: "1:1",
  tom_marca: "",
  paleta_cores: "",
  referencias_visuais: "",
  restricoes: "",
  observacoes: ""
};

export function NewCampaign() {
  const {brand,isCompany}=useStudio();
  const resolveError = useResolveErrorFeedback();
  const [step, setStep] = useState(0);
  const [invalid, setInvalid] = useState({client: false, idea: false});
  useEffect(() => {
    if (step === 0 && (invalid.client || invalid.idea)) {
      const target = document.getElementById(invalid.client ? "campaign-client" : "free_briefing");
      target?.focus();
      target?.scrollIntoView({block: "center"});
    }
  }, [invalid, step]);
  const [visualSelection,setVisualSelection]=useState(emptySelection);
  const [form, setForm] = useState({...initialForm,client_id:brand?String(brand.id):""});
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [memory, setMemory] = useState<ClientProfile | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    getClients().then(setClients).catch((err: Error) => setError(err.message));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const clientId = params.get("client_id");
    if (clientId) setForm((current) => ({ ...current, client_id: clientId }));
  }, [location.search]);

  useEffect(() => {
    let active = true;
    setVisualSelection(emptySelection);
    if (!form.client_id) {
      setMemory(null);
      return;
    }
    setMemory(null);
    getClient(form.client_id).then(value => { if (active) setMemory(value); }).catch(() => { if (active) setMemory(null); });
    return () => { active = false; };
  }, [form.client_id]);

  function update(name: string, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (loading) return;
    if (!form.client_id || !form.free_briefing.trim()) {
      setInvalid({client: !form.client_id, idea: !form.free_briefing.trim()});
      setStep(0);
      return;
    }
    setInvalid({client: false, idea: false});
    setError("");
    if (step < 2) { setStep(current => current + 1); return; }
    setLoading(true);

    const data = new FormData();
    data.append("visual_selection",JSON.stringify(visualSelection));
    Object.entries(form).forEach(([key, value]) => data.append(key, value));
    if (file) data.append("referencia_arquivo", file);

    try {
      const campaign = await createCampaign(data);
      resolveError(error);
      navigate(`/campanhas/${campaign.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível criar a campanha.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Vamos criar seu anúncio"
        description="Conte o que você quer anunciar. Os padrões da marca já cadastrados ajudam a preencher o restante."
      />
      {error && <ErrorBanner message={error} />}

      <ol aria-label="Etapas da campanha" className="mb-6 grid gap-2 sm:grid-cols-3">
        {["Cliente e ideia", "Imagens e formato", "Revisar e gerar"].map((label, index) => <li key={label}><button type="button" aria-current={step === index ? "step" : undefined} disabled={index > step || loading} className={`flex min-h-12 w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm ${step === index ? "border-brand bg-brand text-white" : "border-slate-200 bg-white text-slate-600"}`} onClick={() => setStep(index)}><span className="font-semibold">{index + 1}</span>{label}</button></li>)}
      </ol>

      <form noValidate className="grid gap-6 xl:grid-cols-[1fr_380px]" onSubmit={handleSubmit}>
        <section className="panel p-5 sm:p-6">
          <h2 className="mb-4 text-lg font-semibold">{["Para quem e sobre o quê?", "Como seu anúncio deve aparecer?", "Confira antes de gerar"][step]}</h2>
          {step === 0 && <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="label" htmlFor="campaign-client">{isCompany?"Sua marca":"Marca do anúncio"}</label>
              <select id="campaign-client" className="field" required disabled={isCompany} aria-invalid={invalid.client} aria-describedby={invalid.client ? "client-error" : undefined} value={form.client_id} onChange={(event) => {update("client_id", event.target.value);setInvalid(current => ({...current, client: false}));}}>
                <option value="">Selecione um cliente</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
              {invalid.client && <p id="client-error" role="alert" className="mt-2 text-sm text-red-800">Selecione o cliente para quem vamos criar o anúncio.</p>}
            </div>
            <div className="md:col-span-2">
              <TextArea label="O que você quer anunciar?" name="free_briefing" value={form.free_briefing} onChange={(name,value)=>{update(name,value);setInvalid(current=>({...current,idea:false}));}} required invalid={invalid.idea}/>
              {invalid.idea && <p id="free_briefing-error" role="alert" className="mt-2 text-sm text-red-800">Descreva o produto, serviço ou oferta que você quer divulgar.</p>}
              <p className="helper">Exemplo: divulgar os novos produtos da loja para pessoas da região, destacando a entrega rápida.</p>
            </div>
            <Field label="Objetivo da campanha" name="objetivo" value={form.objetivo} onChange={update} dictation />
            <Field label="Oferta" name="oferta" value={form.oferta} onChange={update} dictation />
          </div>}
          {step === 1 && <>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="label">Formato</label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {formats.map((format) => (
                  <button
                    key={format}
                    type="button"
                    aria-pressed={form.formato === format}
                    className={`rounded-md border px-3 py-2 text-sm font-semibold ${
                      form.formato === format ? "border-brand bg-brand text-white" : "border-slate-300 bg-white text-slate-700"
                    }`}
                    onClick={() => update("formato", format)}
                  >
                    <span>{format}<span className="mt-1 block text-xs font-normal">{{"1:1":"Quadrado","4:5":"Vertical","9:16":"Story","16:9":"Horizontal"}[format]}</span></span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="mt-4 grid gap-4">
            <VisualSelector clientId={Number(form.client_id)} value={visualSelection} onChange={setVisualSelection}/>
            <details className="rounded-xl border border-slate-200 p-4"><summary className="cursor-pointer text-sm font-medium">Ajustes opcionais da marca</summary><p className="helper">Preencha apenas se quiser mudar os padrões cadastrados para este anúncio.</p><div className="mt-4 grid gap-4 md:grid-cols-2">
            <Field label="Quem você quer alcançar?" name="publico_alvo" value={form.publico_alvo} onChange={update} dictation />
            <Field label="Tom da marca" name="tom_marca" value={form.tom_marca} onChange={update} />
            <Field label="Paleta de cores" name="paleta_cores" value={form.paleta_cores} onChange={update} />
            <TextArea label="Referências visuais desta campanha" name="referencias_visuais" value={form.referencias_visuais} onChange={update} />
            <TextArea label="Restrições desta campanha" name="restricoes" value={form.restricoes} onChange={update} />
            <TextArea label="Observações" name="observacoes" value={form.observacoes} onChange={update} />
            </div></details>
          </div>
          </>}
          {step === 2 && <dl className="space-y-4 text-sm"><div><dt className="text-slate-500">Cliente</dt><dd className="font-semibold">{clients.find(client => String(client.id) === form.client_id)?.name || "Cliente selecionado"}</dd></div><div><dt className="text-slate-500">O que será anunciado</dt><dd className="mt-1 whitespace-pre-wrap">{form.free_briefing}</dd></div><div><dt className="text-slate-500">Formato</dt><dd>{form.formato}</dd></div><div><dt className="text-slate-500">Fotos reais</dt><dd>Produtos: {visualSelection.products === "none" ? "não utilizar" : visualSelection.products === "auto" ? "seleção automática" : "seleção manual"} · Pessoas: {visualSelection.no_people ? "não incluir pessoas" : visualSelection.people === "none" ? "não utilizar cadastradas" : visualSelection.people === "auto" ? "seleção automática" : "seleção manual"}</dd></div>{file && <div><dt className="text-slate-500">Referência adicional</dt><dd>{file.name}</dd></div>}<p className="helper">A geração utiliza IA e pode levar alguns minutos. Revise o resultado antes de utilizar o anúncio. Essa ação pode gerar custos de IA.</p></dl>}
        </section>

        <aside className="space-y-4">
          <div className="panel p-5">
            <h2 className="mb-3 font-semibold text-ink">Padrões da marca</h2>
            {memory ? (
              <div className="space-y-3 text-sm text-slate-700">
                <Memory label="Idioma" value={memory.content_language||"Português brasileiro"}/>
                <Memory label="Contato público" value={[memory.contact_phone,memory.instagram_handle&&"@"+memory.instagram_handle,memory.address].filter(Boolean).join(" · ")||null}/>
                <Memory label="Segmento" value={memory.segment} />
                <Memory label="Público" value={memory.target_audience} />
                <Memory label="Tom" value={memory.brand_voice} />
                <Memory label="Paleta" value={memory.color_palette} />
                <Memory label="Estilos aprovados" value={memory.approved_styles} />
                <Memory label="Estilos proibidos" value={memory.forbidden_styles} />
                <p className="helper">{memory.assets.length} arquivos da marca disponíveis. Você não precisa preencher tudo novamente.</p>
              </div>
            ) : (
              <p className="text-sm text-slate-500">Selecione um cliente para carregar padrões de marca.</p>
            )}
          </div>

          {step === 1 && <div className="panel p-5">
            <label className="label">Referência adicional da campanha</label>
            <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600 hover:border-brand">
              <ImageUp size={26} className="text-brand" />
              <span>{file ? file.name : "Enviar arquivo opcional"}</span>
              <input className="sr-only" type="file" accept="image/*,.pdf" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
            </label>
          </div>}
        </aside>
        <div className="action-bar flex flex-wrap items-center justify-between gap-3 xl:col-span-2">
          {error&&<p role="alert" className="studio-inline-error w-full">{error}</p>}
          <span className="text-sm text-slate-600">Etapa {step + 1} de 3</span>
          <div className="flex flex-wrap gap-2">{step > 0 && <button type="button" className="btn-secondary" disabled={loading} onClick={() => setStep(current => current - 1)}>Voltar</button>}<button
            className="btn-primary"
            type="submit"
            disabled={loading}
          >
            {loading ? <Loader2 className="animate-spin" size={18} /> : step === 2 ? <Wand2 size={18} /> : null}
            {loading ? "Enviando anúncio..." : step === 2 ? "Gerar anúncio com IA" : "Continuar"}
          </button></div>
        </div>
      </form>
    </>
  );
}

function Memory({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
      <p>{value || "Não informado"}</p>
    </div>
  );
}

function Field(props: { label: string; name: string; value: string; dictation?: boolean; onChange: (name: string, value: string) => void }) {
  return (
    <div>
      <label className="label" htmlFor={props.name}>
        {props.label}
      </label>
      <div className="flex items-start gap-2">
        <input className="field" id={props.name} name={props.name} value={props.value} onChange={(event) => props.onChange(props.name, event.target.value)} />
        {props.dictation && <VoiceDictationButton onTranscript={(text) => props.onChange(props.name, appendDictation(props.value, text))} />}
      </div>
    </div>
  );
}

function TextArea(props: { label: string; name: string; value: string; required?: boolean; invalid?: boolean; onChange: (name: string, value: string) => void }) {
  return (
    <div>
      <label className="label" htmlFor={props.name}>
        {props.label}
      </label>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <textarea
          className="field min-h-28 resize-y"
          id={props.name}
          name={props.name}
          required={props.required}
          aria-invalid={props.invalid}
          aria-describedby={props.invalid ? `${props.name}-error` : undefined}
          value={props.value}
          onChange={(event) => props.onChange(props.name, event.target.value)}
        />
        <VoiceDictationButton onTranscript={(text) => props.onChange(props.name, appendDictation(props.value, text))} />
      </div>
    </div>
  );
}
