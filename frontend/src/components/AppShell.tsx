import { Bot, Building2, CalendarClock, Clock3, DollarSign, LayoutDashboard, LogOut, MessageCircle, Plus, Users } from "lucide-react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";

const navItems = [
  { to: "/", label: "Campanhas", icon: LayoutDashboard },
  { to: "/clientes", label: "Clientes", icon: Users },
  { to: "/agentes", label: "Central de Agentes", icon: Bot },
  { to: "/custos-ia", label: "Custos de IA", icon: DollarSign },
  { to: "/whatsapp", label: "WhatsApp", icon: MessageCircle },
  { to: "/planejador", label: "Planejador", icon: CalendarClock },
  { to: "/nova-campanha", label: "Nova campanha", icon: Plus },
  { to: "/historico", label: "Histórico", icon: Clock3 },
  { to: "/empresa", label: "Empresa e equipe", icon: Building2 }
];

export function AppShell() {
  const { user, logout, switchOrganization } = useAuth();
  const navigate = useNavigate();

  async function signOut() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="min-h-screen bg-mist">
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-slate-200 bg-white px-5 py-6 lg:flex">
        <div>
          <img
            src="/brand/logo-dark.png"
            alt="e-Criativo"
            className="h-12 w-auto max-w-[190px] object-contain"
          />
          <p className="mt-2 text-xs text-slate-500">Memória criativa por cliente</p>
        </div>

        <nav className="mt-8 flex-1 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium ${
                  isActive ? "bg-brand text-white" : "text-slate-700 hover:bg-slate-100"
                }`
              }
            >
              <item.icon size={18} />
              {item.label}
            </NavLink>
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
            onChange={(event) => void switchOrganization(Number(event.target.value)).then(() => navigate("/", { replace: true }))}
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
              className="h-9 w-auto max-w-[160px] object-contain"
            />
            <button
              aria-label="Sair"
              className="rounded-md p-2 text-slate-600 hover:bg-slate-100"
              onClick={() => void signOut()}
              type="button"
            >
              <LogOut size={18} />
            </button>
          </div>
          <nav className="flex gap-2 overflow-x-auto">
            {navItems.map((item) => (
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
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
