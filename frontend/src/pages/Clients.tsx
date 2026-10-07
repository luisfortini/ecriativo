import { Plus, Save, Users } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { EmptyState } from "../components/EmptyState";
import { ErrorBanner } from "../components/ErrorBanner";
import { LoadingBlock } from "../components/LoadingBlock";
import { PageHeader } from "../components/PageHeader";
import { createClient, getClients } from "../services/api";
import type { ClientSummary } from "../types";
import { useStudio } from "../studio/StudioContext";

const initial = {
  contact_phone: "", instagram_handle: "", address: "",
  name: "",
  segment: "",
  business_description: "",
  target_audience: "",
  brand_voice: "",
  positioning: "",
  color_palette: ""
};

export function Clients() {
  const {isCompany,reloadBrands}=useStudio();
  const [showForm,setShowForm]=useState(false);
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
      await reloadBrands(Number(client.id));
      navigate(`/clientes/${client.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível salvar o cliente.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader title={isCompany?"Minha marca":"Clientes e marcas"} description="Um perfil para cada identidade. Os dados e as fotos acompanham todas as suas criações." action={(!isCompany||!clients.length)&&<button type="button" className="btn-primary" onClick={()=>setShowForm(current=>!current)}><Plus size={17}/>{isCompany?"Preparar minha marca":"Adicionar marca"}</button>}/>
      {error && <ErrorBanner message={error} />}

      <div className={`grid gap-6 ${showForm||!clients.length?"xl:grid-cols-[minmax(0,1fr)_420px]":""}`}>
        <section>
          {loading ? (
            <LoadingBlock />
          ) : clients.length === 0 ? (
            <EmptyState>Nenhum cliente cadastrado ainda.</EmptyState>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {clients.map((client) => (
                <Link key={client.id} className="panel p-6 hover:border-brand" to={`/clientes/${client.id}`}>
                  <div className="mb-4 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-md bg-slate-100 text-brand">
                      <Users size={18} />
                    </div>
                    <div>
                      <h2 className="font-bold text-ink">{client.name}</h2>
                      <p className="text-sm text-slate-500">{client.segment || "Segmento não informado"}</p>
                    </div>
                  </div>
                  <p className="text-sm text-slate-700">{client.brand_voice || "Tom de voz ainda não definido."}</p>
                  <p className="mt-2 text-xs text-slate-500">{client.color_palette || "Paleta pendente"}</p>
                </Link>
              ))}
            </div>
          )}
        </section>

        {(!isCompany||!clients.length)&&(showForm||!clients.length)&&<form className="panel p-6" onSubmit={submit}>
          <div className="mb-4 flex items-center gap-2">
            <Plus size={18} className="text-brand" />
            <h2 className="font-bold text-ink">Vamos conhecer a marca</h2>
          </div>
          <div className="space-y-3">
            <Field label="Nome" name="name" value={form.name} onChange={setForm} required />
            <Field label="Segmento" name="segment" value={form.segment} onChange={setForm} />
            <Field label="Descrição do negócio" name="business_description" value={form.business_description} onChange={setForm} />
            <Field label="Telefone de contato público" name="contact_phone" value={form.contact_phone} onChange={setForm} />
            <Field label="@ do Instagram" name="instagram_handle" value={form.instagram_handle} onChange={setForm} />
            <Field label="Endereço para divulgação" name="address" value={form.address} onChange={setForm} />
          </div>
          <p className="helper">Esses contatos poderão aparecer nas publicações e legendas. Depois vamos definir idioma, identidade visual e fotos reais.</p>
          {error&&<p role="alert" className="studio-inline-error mt-4">{error}</p>}
          <button className="btn-primary mt-4 w-full" disabled={saving}>
            <Save size={16} />
            {saving ? "Salvando..." : "Criar perfil"}
          </button>
        </form>}
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
      <label className="label" htmlFor={`client-${props.name}`}>{props.label}</label>
      <input
        className="field"
        id={`client-${props.name}`}
        required={props.required}
        type={props.name==="contact_phone"?"tel":"text"}
        minLength={props.name==="name"?2:undefined}
        maxLength={props.name==="address"?500:props.name==="contact_phone"?40:props.name==="instagram_handle"?31:undefined}
        value={props.value}
        onChange={(event) => props.onChange((current) => ({ ...current, [props.name]: event.target.value }))}
      />
    </div>
  );
}
