import { Plus, Save, Users } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { EmptyState } from "../components/EmptyState";
import { ErrorBanner } from "../components/ErrorBanner";
import { LoadingBlock } from "../components/LoadingBlock";
import { PageHeader } from "../components/PageHeader";
import { createClient, getClients } from "../services/api";
import type { ClientSummary } from "../types";

const initial = {
  name: "",
  segment: "",
  business_description: "",
  target_audience: "",
  brand_voice: "",
  positioning: "",
  color_palette: ""
};

export function Clients() {
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [form, setForm] = useState(initial);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    getClients()
      .then(setClients)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const client = await createClient(form);
      navigate(`/clientes/${client.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nao foi possivel salvar o cliente.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader title="Clientes" description="Perfis criativos com memoria estrategica, visual, restricoes e aprendizados por marca." />
      {error && <ErrorBanner message={error} />}

      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <section>
          {loading ? (
            <LoadingBlock />
          ) : clients.length === 0 ? (
            <EmptyState>Nenhum cliente cadastrado ainda.</EmptyState>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {clients.map((client) => (
                <Link key={client.id} className="panel p-5 hover:border-brand" to={`/clientes/${client.id}`}>
                  <div className="mb-4 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-md bg-slate-100 text-brand">
                      <Users size={18} />
                    </div>
                    <div>
                      <h2 className="font-bold text-ink">{client.name}</h2>
                      <p className="text-sm text-slate-500">{client.segment || "Segmento nao informado"}</p>
                    </div>
                  </div>
                  <p className="text-sm text-slate-700">{client.brand_voice || "Tom de voz ainda nao definido."}</p>
                  <p className="mt-2 text-xs text-slate-500">{client.color_palette || "Paleta pendente"}</p>
                </Link>
              ))}
            </div>
          )}
        </section>

        <form className="panel p-5" onSubmit={submit}>
          <div className="mb-4 flex items-center gap-2">
            <Plus size={18} className="text-brand" />
            <h2 className="font-bold text-ink">Novo cliente</h2>
          </div>
          <div className="space-y-3">
            <Field label="Nome" name="name" value={form.name} onChange={setForm} required />
            <Field label="Segmento" name="segment" value={form.segment} onChange={setForm} />
            <Field label="Descricao do negocio" name="business_description" value={form.business_description} onChange={setForm} />
            <Field label="Publico-alvo principal" name="target_audience" value={form.target_audience} onChange={setForm} />
            <Field label="Tom de voz" name="brand_voice" value={form.brand_voice} onChange={setForm} />
            <Field label="Posicionamento" name="positioning" value={form.positioning} onChange={setForm} />
            <Field label="Paleta de cores" name="color_palette" value={form.color_palette} onChange={setForm} />
          </div>
          <button className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white" disabled={saving}>
            <Save size={16} />
            {saving ? "Salvando..." : "Criar perfil"}
          </button>
        </form>
      </div>
    </>
  );
}

function Field(props: {
  label: string;
  name: keyof typeof initial;
  value: string;
  required?: boolean;
  onChange: React.Dispatch<React.SetStateAction<typeof initial>>;
}) {
  return (
    <div>
      <label className="label">{props.label}</label>
      <input
        className="field"
        required={props.required}
        value={props.value}
        onChange={(event) => props.onChange((current) => ({ ...current, [props.name]: event.target.value }))}
      />
    </div>
  );
}
