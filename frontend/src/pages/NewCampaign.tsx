import { ImageUp, Loader2, Wand2 } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ErrorBanner } from "../components/ErrorBanner";
import { PageHeader } from "../components/PageHeader";
import { createCampaign, getClient, getClients } from "../services/api";
import type { ClientProfile, ClientSummary } from "../types";

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
  const [form, setForm] = useState(initialForm);
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
    if (!form.client_id) {
      setMemory(null);
      return;
    }
    getClient(form.client_id).then(setMemory).catch(() => setMemory(null));
  }, [form.client_id]);

  function update(name: string, value: string) {
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");

    const data = new FormData();
    Object.entries(form).forEach(([key, value]) => data.append(key, value));
    if (file) data.append("referencia_arquivo", file);

    try {
      const campaign = await createCampaign(data);
      navigate(`/campanhas/${campaign.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel criar a campanha.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Nova Campanha"
        description="Selecione um cliente, escreva o briefing livre e sobrescreva apenas os campos que devem ter prioridade sobre a memoria."
      />
      {error && <ErrorBanner message={error} />}

      <form className="grid gap-6 xl:grid-cols-[1fr_380px]" onSubmit={handleSubmit}>
        <section className="panel p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <label className="label">Cliente</label>
              <select className="field" required value={form.client_id} onChange={(event) => update("client_id", event.target.value)}>
                <option value="">Selecione um cliente</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <TextArea label="Briefing livre" name="free_briefing" value={form.free_briefing} onChange={update} required />
            </div>
            <Field label="Objetivo da campanha" name="objetivo" value={form.objetivo} onChange={update} />
            <Field label="Oferta" name="oferta" value={form.oferta} onChange={update} />
            <Field label="Publico-alvo" name="publico_alvo" value={form.publico_alvo} onChange={update} />
            <Field label="Tom da marca" name="tom_marca" value={form.tom_marca} onChange={update} />
            <div>
              <label className="label">Formato</label>
              <div className="grid grid-cols-4 gap-2">
                {formats.map((format) => (
                  <button
                    key={format}
                    type="button"
                    className={`rounded-md border px-3 py-2 text-sm font-semibold ${
                      form.formato === format ? "border-brand bg-brand text-white" : "border-slate-300 bg-white text-slate-700"
                    }`}
                    onClick={() => update("formato", format)}
                  >
                    {format}
                  </button>
                ))}
              </div>
            </div>
            <Field label="Paleta de cores" name="paleta_cores" value={form.paleta_cores} onChange={update} />
          </div>

          <div className="mt-4 grid gap-4">
            <TextArea label="Referencias visuais desta campanha" name="referencias_visuais" value={form.referencias_visuais} onChange={update} />
            <TextArea label="Restricoes desta campanha" name="restricoes" value={form.restricoes} onChange={update} />
            <TextArea label="Observacoes" name="observacoes" value={form.observacoes} onChange={update} />
          </div>
        </section>

        <aside className="space-y-4">
          <div className="panel p-5">
            <h2 className="mb-3 font-bold text-ink">Memoria carregada</h2>
            {memory ? (
              <div className="space-y-3 text-sm text-slate-700">
                <Memory label="Segmento" value={memory.segment} />
                <Memory label="Publico" value={memory.target_audience} />
                <Memory label="Tom" value={memory.brand_voice} />
                <Memory label="Paleta" value={memory.color_palette} />
                <Memory label="Estilos aprovados" value={memory.approved_styles} />
                <Memory label="Estilos proibidos" value={memory.forbidden_styles} />
                <p className="text-xs text-slate-500">{memory.assets.length} assets disponiveis para os agentes.</p>
              </div>
            ) : (
              <p className="text-sm text-slate-500">Selecione um cliente para carregar padroes de marca.</p>
            )}
          </div>

          <div className="panel p-5">
            <label className="label">Referencia adicional da campanha</label>
            <label className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-md border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600 hover:border-brand">
              <ImageUp size={26} className="text-brand" />
              <span>{file ? file.name : "Enviar arquivo opcional"}</span>
              <input className="sr-only" type="file" accept="image/*,.pdf" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
            </label>
          </div>

          <button
            className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-accent px-4 py-3 text-sm font-bold text-white hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-70"
            type="submit"
            disabled={loading}
          >
            {loading ? <Loader2 className="animate-spin" size={18} /> : <Wand2 size={18} />}
            {loading ? "Gerando campanha..." : "Gerar com IA"}
          </button>
        </aside>
      </form>
    </>
  );
}

function Memory({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase text-slate-500">{label}</p>
      <p>{value || "Nao informado"}</p>
    </div>
  );
}

function Field(props: { label: string; name: string; value: string; onChange: (name: string, value: string) => void }) {
  return (
    <div>
      <label className="label" htmlFor={props.name}>
        {props.label}
      </label>
      <input className="field" id={props.name} name={props.name} value={props.value} onChange={(event) => props.onChange(props.name, event.target.value)} />
    </div>
  );
}

function TextArea(props: { label: string; name: string; value: string; required?: boolean; onChange: (name: string, value: string) => void }) {
  return (
    <div>
      <label className="label" htmlFor={props.name}>
        {props.label}
      </label>
      <textarea
        className="field min-h-28 resize-y"
        id={props.name}
        name={props.name}
        required={props.required}
        value={props.value}
        onChange={(event) => props.onChange(props.name, event.target.value)}
      />
    </div>
  );
}
