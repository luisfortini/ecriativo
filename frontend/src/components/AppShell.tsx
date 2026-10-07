import { Bot, Building2, CalendarDays, CheckCheck, ChevronDown, Clock3, DollarSign, Home, LogOut, Menu, MessageCircle, Plus, Settings, Users, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { StudioProvider, useStudio } from "../studio/StudioContext";
import { ErrorBanner } from "./ErrorBanner";

export function AppShell() {
  const { user } = useAuth();
  return <StudioProvider key={user?.id + ":" + user?.organization.id}><StudioShell /></StudioProvider>;
}
function StudioShell() {
  const { user, logout, switchOrganization } = useAuth();
  const { brand, clients, selectBrand, isCompany, canManage, error: brandError, loading } = useStudio();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [wide, setWide] = useState(()=>window.matchMedia("(min-width: 1024px)").matches);
  useEffect(()=>{
    const media=window.matchMedia("(min-width: 1024px)");
    const changed=()=>setWide(media.matches);
    media.addEventListener("change",changed);return()=>media.removeEventListener("change",changed);
  },[]);
  useEffect(()=>{
    if(!menuOpen)return;
    const close=(event:KeyboardEvent)=>{if(event.key==="Escape"){setMenuOpen(false);document.querySelector<HTMLButtonElement>('[aria-label="Abrir menu"]')?.focus();}};
    window.addEventListener("keydown",close);return()=>window.removeEventListener("keydown",close);
  },[menuOpen]);
  const [error, setError] = useState("");
  const [switching, setSwitching] = useState(false);
  useEffect(() => { setMenuOpen(false); document.getElementById("main-content")?.focus(); window.scrollTo(0, 0); }, [location.pathname]);
  const navItems = [
    { to: "/", label: "Início", icon: Home },
    { to: "/criar", label: "Criar", icon: Plus },
    { to: "/revisar", label: "Revisar", icon: CheckCheck },
    ...(canManage ? [{ to: "/calendario", label: "Calendário", icon: CalendarDays }] : []),
    { to: isCompany && brand ? "/clientes/" + brand.id : "/clientes", label: isCompany ? "Minha marca" : "Clientes e marcas", icon: Users },
    ...(canManage ? [{ to: "/redes", label: "Redes conectadas", icon: MessageCircle }, { to: "/empresa", label: "Configurações", icon: Settings }] : [])
  ];
  async function signOut() {
    try { await logout(); navigate("/login", { replace: true }); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível sair."); }
  }
  async function changeOrganization(id: number) {
    if (switching) return;
    setSwitching(true);
    try { await switchOrganization(id); navigate("/", { replace: true }); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível trocar de conta."); }
    finally { setSwitching(false); }
  }
  return <div className="studio-app">
    <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-xl focus:bg-white focus:p-4">Ir para o conteúdo</a>
    {menuOpen && <button type="button" className="studio-menu-backdrop" aria-label="Fechar menu" onClick={() => setMenuOpen(false)} />}
    <aside id="studio-navigation" aria-hidden={!wide&&!menuOpen?true:undefined} {...(!wide&&!menuOpen?{inert:""}:{})} className={menuOpen ? "studio-sidebar is-open" : "studio-sidebar"}>
      <div className="flex items-start justify-between gap-2"><Link to="/" className="studio-wordmark">e<span>•</span>Criativo<small>Seu estúdio de conteúdo</small></Link><button type="button" className="studio-icon-button lg:hidden" aria-label="Fechar menu" onClick={() => setMenuOpen(false)}><X size={20}/></button></div>
      <div className="studio-account"><Building2 size={18}/><div className="min-w-0"><strong>{user?.organization.name}</strong><small>{isCompany ? "Empresa · sua própria marca" : "Agência / profissional"}</small></div></div>
      <nav aria-label="Navegação principal" className="studio-nav">{navItems.map(item => <NavLink key={item.to} end={item.to === "/"} to={item.to} className={({ isActive }) => isActive ? "active" : ""}><item.icon size={19}/>{item.label}</NavLink>)}</nav>
      <details className="studio-advanced"><summary><ChevronDown size={16}/> Mais ferramentas</summary><nav aria-label="Ferramentas adicionais">
        <NavLink to="/anuncios"><Clock3 size={16}/> Anúncios da marca</NavLink><NavLink to="/historico"><Clock3 size={16}/> Histórico de artes</NavLink>
        {canManage && <><NavLink to="/planejador"><CalendarDays size={16}/> Planejamento de anúncios</NavLink><NavLink to="/social-media"><CalendarDays size={16}/> Todos os planos sociais</NavLink><NavLink to="/agentes"><Bot size={16}/> Agentes de IA</NavLink><NavLink to="/custos-ia"><DollarSign size={16}/> Custos de IA</NavLink><NavLink to="/whatsapp"><MessageCircle size={16}/> WhatsApp</NavLink><NavLink to="/fila-geracao">Fila de produção</NavLink><NavLink to="/execucoes-planejador">Histórico do planejador</NavLink></>}
      </nav></details>
      <div className="studio-sidebar-footer">
        {(user?.organizations.length || 0) > 1 && <label>Ambiente de trabalho<select aria-label="Trocar ambiente de trabalho" value={user?.organization.id} disabled={switching} onChange={event => void changeOrganization(Number(event.target.value))}>{user?.organizations.map(org => <option key={org.id} value={org.id}>{org.name}</option>)}</select></label>}
        <strong>{user?.name}</strong><small>{user?.email}</small><button type="button" onClick={() => void signOut()}><LogOut size={16}/> Sair da conta</button>
      </div>
    </aside>
    <div className="studio-workspace">
      <header className="studio-topbar">
        <button type="button" className="btn-secondary lg:hidden" aria-label="Abrir menu" aria-expanded={menuOpen} aria-controls="studio-navigation" onClick={() => setMenuOpen(true)}><Menu size={19}/></button>
        <div className="studio-context"><span>{isCompany ? "Sua marca" : "Você está trabalhando para"}</span>
          {!isCompany && clients.length > 0 ? <select aria-label="Marca em trabalho" value={brand?.id ?? ""} disabled={loading} onChange={event => {selectBrand(Number(event.target.value)); navigate("/");}}>{clients.map(client => <option key={client.id} value={client.id}>{client.name}</option>)}</select> : <strong>{brand?.name || (loading ? "Carregando…" : "Prepare sua primeira marca")}</strong>}
        </div>
        <Link className="studio-topbar-link" to={brand ? "/clientes/" + brand.id : "/clientes"}>Perfil da marca <Users size={16}/></Link>
      </header>
      <main id="main-content" tabIndex={-1} className="studio-main">
        {(error || brandError) && <ErrorBanner message={error || brandError}/>}
        <Outlet key={brand?.id ?? "no-brand"}/>
      </main>
      <footer className="studio-footer">e-Criativo · Você cria com IA. Você decide o que publicar.</footer>
    </div>
  </div>;
}
