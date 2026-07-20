import { NavLink, Outlet } from 'react-router-dom';
import { BarChart3, FileSignature, FileText, History, LogOut, Send, Settings, Users } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const items = [
  { to: '/', label: 'Dashboard', icon: BarChart3 },
  { to: '/employees', label: 'Colaboradores', icon: Users },
  { to: '/send-requests', label: 'Envios', icon: Send },
  { to: '/signatures', label: 'Assinaturas', icon: FileSignature },
  { to: '/templates', label: 'Templates', icon: FileText },
  { to: '/logs', label: 'Logs', icon: History },
  { to: '/settings', label: 'Configurações', icon: Settings }
];

export function PageShell() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[260px_1fr]">
      <aside className="border-r border-zinc-200 bg-white px-4 py-5">
        <div className="mb-8">
          <div className="text-lg font-bold text-ink">Fortatech Termos</div>
          <div className="text-sm text-steel">{user?.email}</div>
        </div>
        <nav className="grid gap-1">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded px-3 py-2 text-sm font-medium focus-ring ${
                  isActive ? 'bg-mint text-white' : 'text-steel hover:bg-zinc-100 hover:text-ink'
                }`
              }
            >
              <item.icon size={18} />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <button onClick={logout} className="mt-8 flex w-full items-center gap-3 rounded px-3 py-2 text-sm font-medium text-coral hover:bg-coral/10 focus-ring">
          <LogOut size={18} />
          Sair
        </button>
      </aside>
      <main className="min-w-0 px-4 py-6 sm:px-6 lg:px-8">
        <Outlet />
      </main>
    </div>
  );
}
