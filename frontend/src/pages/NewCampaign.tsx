import { ImageUp, Loader2, Wand2, ImagePlus, Megaphone } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { ErrorBanner } from "../components/ErrorBanner";
import { PageHeader } from "../components/PageHeader";
import { appendDictation, VoiceDictationButton } from "../components/VoiceDictationButton";
import { createCampaign, getClient, getClients, request } from "../services/api";
import type { ClientProfile, ClientSummary } from "../types";
import { VisualSelector, emptySelection } from "../components/VisualLibrary";
import { useResolveErrorFeedback } from "../components/FeedbackProvider";
import { useStudio } from "../studio/StudioContext";
import { StyleReference } from "../components/StyleReference";

const socialFormats = {post:"Post",carousel:"Carrossel (3 artes)",story:"Story"} as const;
const initialPlan = {name:"",posts_per_week:5,pillars:"Dicas e educação\nBastidores\nNovidades",formats:["post"] as string[],weekly_image_limit:10};

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
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  params.set("purpose", "ads");
  return <Navigate to={"/criar?" + params.toString()} replace/>;
}

export function UnifiedCreation() {
  const {brand,isCompany,canManage,selectBrand}=useStudio();
  const location = useLocation();
  const purpose = canManage && new URLSearchParams(location.search).get("purpose") === "social" ? "social" : "ads";
  const social = purpose === "social";
  const [plan,setPlan]=useState(initialPlan);
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
  const [memoryLoading, setMemoryLoading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  const imageCount = Array.from({length:Math.max(0,Math.min(21,plan.posts_per_week))},(_,i)=>plan.formats[i%plan.formats.length]==="carousel"?3:1).reduce((a,b)=>a+b,0);

  useEffect(()=>{setStep(0);setVisualSelection(current=>({...emptySelection,style_asset_id:current.style_asset_id,mode:current.mode,no_people:current.no_people}));setFile(null);setError("");},[purpose]);
  useEffect(()=>{if(brand)setForm(current=>({...current,client_id:String(brand.id)}));},[brand?.id]);

  useEffect(() => {
    getClients().then(setClients).catch((err: Error) => setError(err.message));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const clientId = params.get("client_id");
    if (clientId && !isCompany) {setForm((current) => ({ ...current, client_id: clientId }));selectBrand(Number(clientId));}
  }, [location.search]);

  useEffect(() => {
    let active = true;
    setVisualSelection(emptySelection);
    setFile(null);
    if (!form.client_id) {
      setMemory(null);
      return;
    }
    setMemory(null);
    setMemoryLoading(true);
    getClient(form.client_id).then(value => { if (active) setMemory(value); }).catch(err => { if (active) setError(err.message || "Não foi possível carregar a marca. Tente novamente."); }).finally(()=>{if(active)setMemoryLoading(false);});
    return () => { active = false; };
  }, [form.client_id]);

  function update(name: string, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (loading) return;
    if (!form.client_id || (!social && !form.free_briefing.trim())) {
      setInvalid({client: !form.client_id, idea: !form.free_briefing.trim()});
      setStep(0);
      return;
    }
    setInvalid({client: false, idea: false});
    setError("");
    if (!memory || memoryLoading) {setError("Aguarde o carregamento do perfil da marca antes de continuar.");return;}
    if(social && (plan.name.trim().length<2 || plan.name.trim().length>120 || !Number.isInteger(plan.posts_per_week) || plan.posts_per_week<1 || plan.posts_per_week>21 || !plan.pillars.trim() || plan.pillars.split("\n").filter(line=>line.trim()).some(line=>line.trim().length<2||line.trim().length>250) || plan.pillars.split("\n").filter(line=>line.trim()).length>12)) {setStep(0);setError("Informe um nome de 2 a 120 caracteres, de 1 a 21 publicações e até 12 assuntos (2 a 250 caracteres cada).");return;}
    if(social && step>0 && (!plan.formats.length || !Number.isInteger(plan.weekly_image_limit) || plan.weekly_image_limit<imageCount || plan.weekly_image_limit>100)) {setStep(1);setError(`Escolha um formato e um limite entre ${imageCount} e 100 imagens para comportar esta semana.`);return;}
    if(step>0 && ((visualSelection.products==="manual"&&!visualSelection.product_ids.length)||(visualSelection.people==="manual"&&!visualSelection.person_ids.length))) {setStep(1);setError("Escolha as fotos na seleção manual ou altere para seleção automática / não usar cadastrados.");return;}
    if (step < 2) { setStep(current => current + 1); return; }
    setLoading(true);

    const data = new FormData();
    data.append("visual_selection",JSON.stringify(visualSelection));
    Object.entries(form).forEach(([key, value]) => data.append(key, value));
    if (file) data.append("referencia_arquivo", file);

    try {
      if(social) {
        const saved=await request<{id:number}>("/social-media/plans",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({...plan,client_id:Number(form.client_id),pillars:plan.pillars.split("\n").map(line=>line.trim()).filter(Boolean),visual_selection:visualSelection,active:false,automatic:false})});
        selectBrand(Number(form.client_id));
        resolveError(error);
        navigate(`/social-media?plan_id=${saved.id}&created=1`);
        return;
      }
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
        title="Estúdio de criação"
        description="Uma marca, o mesmo estilo. Escolha o objetivo e vamos da ideia até a revisão juntos."
      />
      {error && <ErrorBanner message={error} />}

      <ol aria-label="Etapas da criação" className="mb-6 grid gap-2 sm:grid-cols-3">
        {["Marca e ideia", "Identidade e imagens", "Conferir e criar"].map((label, index) => <li key={label}><button type="button" aria-current={step === index ? "step" : undefined} disabled={index > step || loading} className={`flex min-h-12 w-full items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm ${step === index ? "border-brand bg-brand text-white" : "border-slate-200 bg-white text-slate-600"}`} onClick={() => setStep(index)}><span className="font-semibold">{index + 1}</span>{label}</button></li>)}
      </ol>

      <form noValidate className="grid gap-6 xl:grid-cols-[1fr_380px]" onSubmit={handleSubmit}>
        <fieldset disabled={loading} className="grid gap-3 sm:grid-cols-2 xl:col-span-2" aria-label="Objetivo da criação">
          {(["ads",...(canManage?["social"]:[])] as Array<"ads"|"social">).map(value=><button type="button" key={value} aria-pressed={purpose===value} className="panel creation-purpose flex items-start gap-3 p-5 text-left" onClick={()=>navigate(`/criar?purpose=${value}`)}>{value==="ads"?<Megaphone size={24}/>:<ImagePlus size={24}/>}<span><strong>{value==="ads"?"Arte para anúncio":"Planejamento para redes sociais"}</strong><span className="helper block">{value==="ads"?"Uma oferta ou serviço para conquistar clientes. Não ativa mídia paga.":"Uma semana de posts, carrosséis e stories. Você revisa antes de publicar."}</span>{purpose===value&&<span className="mt-2 block text-xs font-semibold">✓ Objetivo selecionado</span>}</span></button>)}
        </fieldset>
        <fieldset disabled={loading} className="contents"><section className="panel p-5 sm:p-6">
          <h2 className="mb-4 text-lg font-semibold">{["Para quem e sobre o quê?", "Como suas artes devem aparecer?", "Confira antes de criar"][step]}</h2>
          {step === 0 && <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="label" htmlFor="campaign-client">{isCompany?"Sua marca":"Marca em trabalho"}</label>
              <select id="campaign-client" className="field" required disabled={isCompany||loading} aria-invalid={invalid.client} aria-describedby={invalid.client ? "client-error" : undefined} value={form.client_id} onChange={(event) => {update("client_id", event.target.value);selectBrand(Number(event.target.value));setInvalid(current => ({...current, client: false}));}}>
                <option value="">Selecione um cliente</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
              {invalid.client && <p id="client-error" role="alert" className="mt-2 text-sm text-red-800">Selecione o cliente para quem vamos criar o anúncio.</p>}
            </div>
            {!social && <><div className="md:col-span-2">
              <TextArea label="O que você quer anunciar?" name="free_briefing" value={form.free_briefing} onChange={(name,value)=>{update(name,value);setInvalid(current=>({...current,idea:false}));}} required invalid={invalid.idea}/>
              {invalid.idea && <p id="free_briefing-error" role="alert" className="mt-2 text-sm text-red-800">Descreva o produto, serviço ou oferta que você quer divulgar.</p>}
              <p className="helper">Exemplo: divulgar os novos produtos da loja para pessoas da região, destacando a entrega rápida.</p>
            </div>
            <Field label="Objetivo da campanha" name="objetivo" value={form.objetivo} onChange={update} dictation />
            <Field label="Oferta" name="oferta" value={form.oferta} onChange={update} dictation />
            </>}
            {social && <>
              <label className="label">Nome do planejamento<input className="field" value={plan.name} maxLength={120} placeholder="Ex.: Presença semanal da marca" onChange={e=>setPlan({...plan,name:e.target.value})}/></label>
              <label className="label">Publicações por semana<input className="field" type="number" min={1} max={21} value={plan.posts_per_week} onChange={e=>setPlan({...plan,posts_per_week:Number(e.target.value)})}/></label>
              <label className="label md:col-span-2">Assuntos para explorar (um por linha)<textarea className="field min-h-28" value={plan.pillars} onChange={e=>setPlan({...plan,pillars:e.target.value})}/><span className="helper">A pesquisa procura tendências relacionadas a estes assuntos. Localização e aniversário vêm do perfil da marca.</span></label>
            </>}
          </div>}
          {step === 1 && <>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="label">{social?"Formatos da semana":"Formato"}</label>
              {social?<><div className="flex flex-wrap gap-3">{Object.entries(socialFormats).map(([value,label])=><label key={value} className="studio-option"><input type="checkbox" checked={plan.formats.includes(value)} onChange={e=>setPlan({...plan,formats:e.target.checked?[...plan.formats,value]:plan.formats.filter(f=>f!==value)})}/>{label}</label>)}</div><label className="label mt-4">Limite de imagens por semana<input type="number" className="field" min={imageCount} max={100} value={plan.weekly_image_limit} onChange={e=>setPlan({...plan,weekly_image_limit:Number(e.target.value)})}/></label><p className="helper">Esta combinação precisa de {imageCount} imagens. Novas tentativas também consomem o limite. Pesquisa e texto têm custos adicionais.</p></>:
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
              }
            </div>
          </div>

          <div className="mt-4 grid gap-4">
            <StyleReference memory={memory} selected={visualSelection.style_asset_id} onChange={id=>setVisualSelection({...visualSelection,style_asset_id:id})}/>
            <VisualSelector key={`${form.client_id}-${purpose}`} clientId={Number(form.client_id)} purpose={purpose} value={visualSelection} onChange={setVisualSelection}/>
            {!social&&<details className="rounded-xl border border-slate-200 p-4"><summary className="cursor-pointer text-sm font-medium">Ajustes opcionais da marca</summary><p className="helper">Preencha apenas se quiser mudar os padrões cadastrados para este anúncio.</p><div className="mt-4 grid gap-4 md:grid-cols-2">
            <Field label="Quem você quer alcançar?" name="publico_alvo" value={form.publico_alvo} onChange={update} dictation />
            <Field label="Tom da marca" name="tom_marca" value={form.tom_marca} onChange={update} />
            <Field label="Paleta de cores" name="paleta_cores" value={form.paleta_cores} onChange={update} />
            <TextArea label="Referências visuais desta campanha" name="referencias_visuais" value={form.referencias_visuais} onChange={update} />
            <TextArea label="Restrições desta campanha" name="restricoes" value={form.restricoes} onChange={update} />
            <TextArea label="Observações" name="observacoes" value={form.observacoes} onChange={update} />
            </div></details>}
          </div>
          </>}
          {step === 2 && <dl className="space-y-4 text-sm">
            <div><dt className="text-slate-500">Marca e objetivo</dt><dd className="font-semibold">{memory?.name} · {social?"Conteúdo para redes sociais":"Arte para anúncio"}</dd></div>
            {social?<><div><dt className="text-slate-500">Planejamento</dt><dd>{plan.name} · {plan.posts_per_week} publicações por semana</dd></div><div><dt className="text-slate-500">Assuntos</dt><dd className="whitespace-pre-wrap">{plan.pillars}</dd></div><div><dt className="text-slate-500">Formatos e limite</dt><dd>{plan.formats.map(f=>socialFormats[f as keyof typeof socialFormats]).join(", ")} · até {plan.weekly_image_limit} imagens/semana</dd></div></>:<><div><dt className="text-slate-500">O que será anunciado</dt><dd className="whitespace-pre-wrap">{form.free_briefing}</dd></div><div><dt className="text-slate-500">Formato</dt><dd>{form.formato}</dd></div></>}
            <div><dt className="text-slate-500">Referência de estilo</dt><dd>{memory?.assets.find(asset=>Number(asset.id)===visualSelection.style_asset_id)?.description||"Seleção automática da biblioteca da marca"}</dd></div>
            <div><dt className="text-slate-500">Fotos reais</dt><dd>Produtos: {visualSelection.products === "none" ? "não utilizar" : visualSelection.products === "auto" ? "seleção automática" : "seleção manual"} · Pessoas: {visualSelection.no_people ? "não incluir pessoas" : visualSelection.people === "none" ? "não utilizar cadastradas" : visualSelection.people === "auto" ? "seleção automática" : "seleção manual"}</dd></div>
            {file&&!social&&<div><dt className="text-slate-500">Arquivo adicional do briefing</dt><dd>{file.name}</dd></div>}
            <p className="helper">{social?"Vamos salvar um plano pausado, sem cobranças de geração nesta etapa. Depois você pode ativar o plano e planejar uma semana. Pesquisa, texto e imagens utilizam IA e têm custos. A publicação exige aprovação e agendamento separados.":"A geração utiliza IA, tem custos e pode levar alguns minutos. Revise antes de usar. Esta ação não ativa uma campanha paga. O envio automático por WhatsApp segue a configuração existente do cliente."}</p>
          </dl>}
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
              <p className="text-sm text-slate-500">{memoryLoading?"Carregando a identidade da marca…":"Selecione uma marca para carregar seus padrões."}</p>
            )}
          </div>

          {step === 1 && !social && <div className="panel p-5">
            <label className="label">Arquivo adicional do briefing</label>
            <p className="helper mb-3">Ajuda a descrever a ideia. Para definir o estilo da imagem, use uma referência cadastrada na biblioteca.</p>
            <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600 hover:border-brand">
              <ImageUp size={26} className="text-brand" />
              <span>{file ? file.name : "Enviar arquivo opcional"}</span>
              <input className="sr-only" type="file" accept="image/*,.pdf" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
            </label>
          </div>}
        </aside></fieldset>
        <div className="action-bar flex flex-wrap items-center justify-between gap-3 xl:col-span-2">
          {error&&<p role="alert" className="studio-inline-error w-full">{error}</p>}
          <span className="text-sm text-slate-600">Etapa {step + 1} de 3</span>
          <div className="flex flex-wrap gap-2">{step > 0 && <button type="button" className="btn-secondary" disabled={loading} onClick={() => setStep(current => current - 1)}>Voltar</button>}<button
            className="btn-primary"
            type="submit"
            disabled={loading||memoryLoading}
          >
            {loading ? <Loader2 className="animate-spin" size={18} /> : step === 2 ? <Wand2 size={18} /> : null}
            {loading ? social?"Salvando planejamento…":"Gerando anúncio…" : step === 2 ? social?"Salvar planejamento":"Gerar anúncio com IA" : "Continuar"}
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
