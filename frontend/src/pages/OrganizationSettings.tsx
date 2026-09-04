import { Building2, Plus, UserPlus } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { ErrorBanner } from "../components/ErrorBanner";
import { LoadingBlock } from "../components/LoadingBlock";
import { PageHeader } from "../components/PageHeader";
import { addOrganizationMember, createOrganizationRequest, getOrganizationMembers } from "../services/api";
import type { OrganizationMember } from "../types";

export function OrganizationSettings() {
  const { user, switchOrganization } = useAuth();
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [member, setMember] = useState({ name: "", email: "", password: "", role: "member" as "admin" | "member" });
  const canManage = user?.organizationRole === "owner" || user?.organizationRole === "admin";

  useEffect(() => {
    getOrganizationMembers()
      .then(setMembers)
      .catch((reason: Error) => setError(reason.message))
      .finally(() => setLoading(false));
  }, [user?.organization.id]);

  async function createCompany(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      const organization = await createOrganizationRequest(companyName);
      await switchOrganization(organization.id);
      setCompanyName("");
      setMessage("Empresa criada e selecionada.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível criar a empresa.");
    }
  }

  async function addMember(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      setMembers(await addOrganizationMember({ ...member, password: member.password || undefined }));
      setMember({ name: "", email: "", password: "", role: "member" });
      setMessage("Membro adicionado à empresa.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível adicionar o membro.");
    }
  }

  if (loading) return <LoadingBlock label="Carregando empresa..." />;

  return <>
    <PageHeader title="Empresa e equipe" description="Gerencie a organização ativa e quem pode acessar seus dados." />
    {error && <ErrorBanner message={error} />}
    {message && <div className="mb-4 rounded-md border border-accent/30 bg-accent-soft px-4 py-3 text-sm text-accent-hover">{message}</div>}

    <section className="panel p-5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-brand text-white"><Building2 size={19} /></div>
        <div><h2 className="font-bold text-ink">{user?.organization.name}</h2><p className="text-sm text-slate-500">Plano: {user?.organization.planCode} · Seu papel: {roleLabel(user?.organizationRole)}</p></div>
      </div>
    </section>

    <section className="panel mt-5 p-5">
      <h2 className="mb-4 font-bold text-ink">Equipe</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm"><thead><tr className="border-b border-slate-200 text-slate-500"><th className="py-2">Nome</th><th>E-mail</th><th>Papel</th><th>Status</th></tr></thead>
          <tbody>{members.map((item) => <tr key={item.id} className="border-b border-slate-100"><td className="py-3 font-medium text-ink">{item.name}</td><td>{item.email}</td><td>{roleLabel(item.role)}</td><td>{item.status === "active" ? "Ativo" : item.status}</td></tr>)}</tbody>
        </table>
      </div>
      {canManage && <form className="mt-5 grid gap-3 border-t border-slate-200 pt-5 md:grid-cols-2" onSubmit={addMember}>
        <input className="field" placeholder="Nome do membro" value={member.name} onChange={(event) => setMember((current) => ({ ...current, name: event.target.value }))} required />
        <input className="field" type="email" placeholder="E-mail" value={member.email} onChange={(event) => setMember((current) => ({ ...current, email: event.target.value }))} required />
        <input className="field" type="password" placeholder="Senha inicial (novo usuário)" value={member.password} onChange={(event) => setMember((current) => ({ ...current, password: event.target.value }))} />
        <select className="field" value={member.role} onChange={(event) => setMember((current) => ({ ...current, role: event.target.value as "admin" | "member" }))}><option value="member">Membro</option><option value="admin">Administrador</option></select>
        <button className="inline-flex items-center justify-center gap-2 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white md:col-span-2" type="submit"><UserPlus size={16} />Adicionar membro</button>
      </form>}
    </section>

    <section className="panel mt-5 p-5">
      <h2 className="mb-2 font-bold text-ink">Nova empresa</h2>
      <p className="mb-4 text-sm text-slate-500">Cria um ambiente independente, sem compartilhar clientes, campanhas, custos ou configurações.</p>
      <form className="flex flex-col gap-3 sm:flex-row" onSubmit={createCompany}>
        <input className="field flex-1" placeholder="Nome da empresa" value={companyName} onChange={(event) => setCompanyName(event.target.value)} required minLength={2} />
        <button className="inline-flex items-center justify-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white" type="submit"><Plus size={16} />Criar empresa</button>
      </form>
    </section>
  </>;
}

function roleLabel(role: string | undefined) {
  if (role === "owner") return "Proprietário";
  if (role === "admin") return "Administrador";
  return "Membro";
}
