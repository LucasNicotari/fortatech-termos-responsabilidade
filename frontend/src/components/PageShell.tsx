import { NavLink, Outlet } from 'react-router-dom';
import { BarChart3, FilePlus2, FileSignature, LogOut, Settings } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { FortaTechMark } from './FortaTechMark';
import { UserAvatar } from './UserAvatar';

const items = [
  { to: '/', label: 'Dashboard', icon: BarChart3 },
  { to: '/send-requests', label: 'Novo termo', icon: FilePlus2 },
  { to: '/terms', label: 'Termos', icon: FileSignature },
  { to: '/settings', label: 'Configurações', icon: Settings, adminOnly: true }
];

export function PageShell() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-b24-bg lg:grid lg:grid-cols-[228px_1fr]">
      <aside className="border-b border-b24-border bg-white px-3 py-3 lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r lg:px-3 lg:py-4">
        <div className="mb-3 flex items-center gap-3 px-2 lg:mb-6">
          <FortaTechMark className="h-11 w-11 shrink-0" />
          <div className="truncate text-2xl font-extrabold leading-none tracking-[-0.035em]">
            <span className="text-[#ed1c24]">Forta</span><span className="text-ink">Docs</span>
          </div>
          {import.meta.env.VITE_LOCAL_DEVELOPMENT_MODE === 'true' && <span className="ml-auto rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold text-sky-700 lg:hidden">LOCAL</span>}
        </div>
        {import.meta.env.VITE_LOCAL_DEVELOPMENT_MODE === 'true' && <div className="mx-2 mb-3 hidden rounded bg-sky-50 px-2 py-1 text-center text-[11px] font-semibold text-sky-700 lg:block">AMBIENTE LOCAL</div>}
        <nav className="flex gap-1 overflow-x-auto pb-1 lg:grid lg:overflow-visible lg:pb-0">
          {items.filter((item) => !item.adminOnly || user?.role === 'ADMIN').map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex shrink-0 items-center gap-2 rounded px-3 py-2 text-sm font-medium focus-ring lg:gap-3 ${
                  isActive ? 'bg-sky-50 text-b24-blue-dark' : 'text-steel hover:bg-b24-bg hover:text-ink'
                }`
              }
            >
              <item.icon size={18} />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <button onClick={logout} className="mt-4 hidden w-full items-center gap-3 rounded px-3 py-2 text-sm font-medium text-steel hover:bg-b24-bg hover:text-ink focus-ring lg:flex">
          <LogOut size={18} />
          Sair
        </button>
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-20 flex min-h-14 items-center justify-end border-b border-b24-border bg-white/95 px-3 py-2 backdrop-blur sm:px-5 lg:px-7">
          <div className="flex min-w-0 items-center gap-2.5" aria-label="Usuário conectado">
            <div className="min-w-0 text-right">
              <p className="max-w-[240px] truncate text-sm font-semibold text-ink">{user?.name}</p>
              <p className="text-[11px] uppercase tracking-wide text-steel">{user?.role === 'ADMIN' ? 'Administrador' : user?.role}</p>
            </div>
            <UserAvatar name={user?.name || 'Usuário'} size="sm" />
          </div>
        </header>
        <main className="min-w-0 px-3 py-4 sm:px-5 sm:py-5 lg:px-7">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
