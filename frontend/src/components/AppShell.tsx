import { Bot, CalendarClock, Clock3, DollarSign, LayoutDashboard, MessageCircle, Plus, Users } from "lucide-react";
import { NavLink, Outlet } from "react-router-dom";

const navItems = [
  { to: "/", label: "Campanhas", icon: LayoutDashboard },
  { to: "/clientes", label: "Clientes", icon: Users },
  { to: "/agentes", label: "Central de Agentes", icon: Bot },
  { to: "/custos-ia", label: "Custos de IA", icon: DollarSign },
  { to: "/whatsapp", label: "WhatsApp", icon: MessageCircle },
  { to: "/planejador", label: "Planejador", icon: CalendarClock },
  { to: "/nova-campanha", label: "Nova campanha", icon: Plus },
  { to: "/historico", label: "Historico", icon: Clock3 }
];

export function AppShell() {
  return (
    <div className="min-h-screen bg-mist">
      <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-slate-200 bg-white px-5 py-6 lg:block">
        <div>
          <img
            src="/brand/logo-dark.png"
            alt="e-Criativo"
            className="h-12 w-auto max-w-[190px] object-contain"
          />
          <p className="mt-2 text-xs text-slate-500">Memoria criativa por cliente</p>
        </div>

        <nav className="mt-8 space-y-1">
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
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur lg:hidden">
          <div className="mb-3 flex items-center">
            <img
              src="/brand/logo-dark.png"
              alt="e-Criativo"
              className="h-9 w-auto max-w-[160px] object-contain"
            />
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
