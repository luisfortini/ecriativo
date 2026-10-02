import { Bot, Building2, CalendarClock, Clock3, DollarSign, LayoutDashboard, LogOut, Menu, MessageCircle, Plus, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { ErrorBanner } from "./ErrorBanner";

const navItems = [
  { to: "/", label: "Meus anúncios", icon: LayoutDashboard, group: "Criar e acompanhar" },
  { to: "/nova-campanha", label: "Criar anúncio", icon: Plus, group: "Criar e acompanhar" },
  { to: "/social-media", label: "Social media", icon: CalendarClock, manager: true, group: "Criar e acompanhar" },
  { to: "/clientes", label: "Clientes e marcas", icon: Users, group: "Organizar" },
  { to: "/planejador", label: "Planejar anúncios", icon: CalendarClock, manager: true, group: "Organizar" },
  { to: "/historico", label: "Histórico", icon: Clock3, group: "Organizar" },
  { to: "/agentes", label: "Central de Agentes", icon: Bot, manager: true, group: "Administração" },
  { to: "/custos-ia", label: "Custos de IA", icon: DollarSign, manager: true, group: "Administração" },
  { to: "/whatsapp", label: "WhatsApp", icon: MessageCircle, manager: true, group: "Administração" },
  { to: "/empresa", label: "Empresa e equipe", icon: Building2, manager: true, group: "Administração" }
];

export function AppShell() {
  const { user, logout, switchOrganization } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [error, setError] = useState("");
  const [switching, setSwitching] = useState(false);
  useEffect(() => { setMenuOpen(false); }, [location.pathname]);
  const canManage = user?.organizationRole === "owner" || user?.organizationRole === "admin";
  const visibleNavItems = navItems.filter((item) => !item.manager || canManage);

  async function signOut() {
    try { await logout(); navigate("/login", { replace: true }); }
    catch (err) { setError(err instanceof Error ? err.message : "Não foi possível sair. Tente novamente."); }
  }
  async function changeOrganization(id: number) {
    if (switching) return;
    setSwitching(true);
    try { await switchOrganization(id); setError(""); navigate("/", { replace: true }); }
    catch (err) { setError(err instanceof Error ? err.message : "Não foi possível trocar de empresa."); }
    finally { setSwitching(false); }
  }

  return (
    <div className="min-h-screen bg-mist">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-xl focus:bg-white focus:p-4">Ir para o conteúdo</a>
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col overflow-y-auto border-r border-slate-200 bg-white px-5 py-6 lg:flex">
        <div>
          <img
            src="/brand/logo-dark.png"
            alt="e-Criativo"
            className="h-12 w-auto max-w-[190px] object-contain"
          />
          <p className="mt-2 text-xs text-slate-500">Sua marca. Conteúdo com clareza.</p>
        </div>

        <nav aria-label="Navegação principal" className="mt-6 flex-1 space-y-1">
          {visibleNavItems.map((item, index) => (
            <div key={item.to}>
            {(index === 0 || visibleNavItems[index - 1].group !== item.group) && <p className="pb-2 pt-4 text-xs font-medium text-slate-500">{item.group}</p>}
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium ${
                  isActive ? "bg-brand text-white" : "text-slate-700 hover:bg-slate-100"
                }`
              }
            >
              <item.icon size={18} />
              {item.label}
            </NavLink>
            </div>
          ))}
        </nav>

        <div className="border-t border-slate-200 pt-4">
          <label className="mb-1 block text-xs font-medium text-slate-500" htmlFor="organization-switcher">
            Empresa
          </label>
          <select
            id="organization-switcher"
            className="mb-3 w-full rounded-md border border-slate-200 bg-white px-2 py-2 text-sm text-ink"
            value={user?.organization.id ?? ""}
            disabled={switching}
            onChange={(event) => void changeOrganization(Number(event.target.value))}
          >
            {user?.organizations.map((organization) => (
              <option key={organization.id} value={organization.id}>{organization.name}</option>
            ))}
          </select>
          <p className="truncate text-sm font-semibold text-ink">{user?.name}</p>
          <p className="truncate text-xs text-slate-500">{user?.email}</p>
          <button
            className="mt-3 flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            onClick={() => void signOut()}
            type="button"
          >
            <LogOut size={17} />
            Sair
          </button>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
          <div className="mb-3 flex items-center justify-between gap-3">
            <img
              src="/brand/logo-dark.png"
              alt="e-Criativo"
              className="h-8 w-auto max-w-[120px] object-contain sm:h-9 sm:max-w-[160px]"
            />
            <div className="flex gap-2"><button type="button" className="btn-secondary" aria-expanded={menuOpen} aria-controls="mobile-navigation" onClick={() => setMenuOpen(current => !current)}><Menu size={18} /> Menu</button><button
              aria-label="Sair"
              className="rounded-md p-2 text-slate-600 hover:bg-slate-100"
              onClick={() => void signOut()}
              type="button"
            >
              <LogOut size={18} />
            </button>
            </div>
          </div>
          <nav id="mobile-navigation" aria-label="Navegação principal" hidden={!menuOpen} className={`${menuOpen ? "grid" : "hidden"} max-h-[50vh] gap-2 overflow-y-auto sm:grid-cols-2`}>
            {visibleNavItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm ${
                    isActive ? "bg-brand text-white" : "bg-slate-100 text-slate-700"
                  }`
                }
              >
                <item.icon size={16} />
                {item.label}
              </NavLink>
            ))}
          </nav>
          <label className="mt-3 block text-xs font-medium text-slate-500" htmlFor="mobile-organization-switcher">Empresa</label>
          <select
            id="mobile-organization-switcher"
            className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-2 text-sm text-ink"
            value={user?.organization.id ?? ""}
            disabled={switching}
            onChange={(event) => void changeOrganization(Number(event.target.value))}
          >
            {user?.organizations.map((organization) => (
              <option key={organization.id} value={organization.id}>{organization.name}</option>
            ))}
          </select>
        </header>
        <main id="main-content" tabIndex={-1} className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-10">
          {error && <ErrorBanner message={error} />}
          <Outlet key={user?.organization.id} />
        </main>
      </div>
    </div>
  );
}
