import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import {
  BarChart3,
  ChevronDown,
  FilePlus2,
  FileSignature,
  LogOut,
  Moon,
  Settings,
  Sun
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { FortaTechMark } from './FortaTechMark';
import { BitrixFrameSync } from './BitrixFrameSync';
import { useTheme } from '../hooks/useTheme';

const primaryItems = [
  { to: '/', label: 'Dashboard', icon: BarChart3 },
  { to: '/send-requests', label: 'Novo termo', icon: FilePlus2 },
  { to: '/terms', label: 'Termos', icon: FileSignature }
];

export function PageShell() {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!profileOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (!profileRef.current?.contains(event.target as Node)) setProfileOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setProfileOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [profileOpen]);

  const role = user?.role === 'ADMIN' ? 'Administrador' : user?.role;
  const visiblePrimaryItems = user?.canOperate
    ? primaryItems
    : primaryItems.filter((item) => item.to !== '/send-requests');

  return (
    <div className="fortadocs-shell min-h-screen overflow-x-hidden bg-b24-bg">
      <BitrixFrameSync />
      <header className="sticky top-0 z-30 border-t-[3px] border-t-mint bg-surface/95 shadow-[0_2px_14px_rgba(23,34,45,0.08)] backdrop-blur-md">
        <div className="mx-auto max-w-[1600px] px-3 sm:px-5 lg:px-7">
          <div className="relative flex min-h-[58px] items-center gap-3 lg:gap-5">
            <Link to="/" className="focus-ring flex shrink-0 items-center gap-2.5 rounded-lg" aria-label="FortaDocs - Dashboard">
              <FortaTechMark className="h-9 w-9 shrink-0 shadow-sm" />
              <span className="text-xl font-extrabold leading-none tracking-[-0.04em] sm:text-[22px]">
                <span className="text-[#ed1c24]">Forta</span><span className="text-ink">Docs</span>
              </span>
            </Link>

            {import.meta.env.VITE_LOCAL_DEVELOPMENT_MODE === 'true' && (
              <span className="hidden rounded-full bg-sky-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-b24-blue-dark xl:inline">Local</span>
            )}

            <nav className="hidden min-w-0 items-center gap-1 md:flex" aria-label="Navegação principal">
              {visiblePrimaryItems.map((item) => (
                <PrimaryLink key={item.to} {...item} />
              ))}
            </nav>

            <div ref={profileRef} className="fixed right-3 top-[13px] z-40 flex shrink-0 items-center md:relative md:right-auto md:top-auto md:z-auto md:ml-auto">
              <button
                type="button"
                onClick={toggleTheme}
                className="focus-ring mr-1 hidden h-9 w-9 place-items-center rounded-full border border-transparent bg-b24-bg/60 text-steel transition hover:bg-b24-bg hover:text-b24-blue-dark sm:inline-grid"
                aria-label={theme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro'}
                title={theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
              >
                {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
              </button>
              <button
                type="button"
                onClick={() => setProfileOpen((open) => !open)}
                aria-expanded={profileOpen}
                aria-haspopup="menu"
                className={`focus-ring flex h-9 w-9 items-center justify-center rounded-xl border transition sm:h-auto sm:w-auto sm:max-w-none sm:gap-3 sm:px-3 sm:py-1.5 ${
                  profileOpen
                    ? 'border-sky-200 bg-sky-50 shadow-sm'
                    : 'border-transparent bg-b24-bg/60 hover:border-b24-border hover:bg-surface hover:shadow-sm'
                }`}
              >
                <span className="hidden text-right sm:block sm:w-auto sm:max-w-[220px]">
                  <span className="block truncate text-sm font-semibold leading-tight text-ink">{user?.name}</span>
                </span>
                <ChevronDown size={15} className={`text-steel transition-transform ${profileOpen ? 'rotate-180' : ''}`} />
              </button>

              {profileOpen && (
                <div role="menu" className="absolute right-0 top-[calc(100%+10px)] w-[290px] overflow-hidden rounded-xl border border-b24-border bg-surface shadow-[0_18px_45px_rgba(82,92,105,0.22)]">
                  <div className="border-b border-b24-border bg-gradient-to-br from-sky-50 to-surface px-4 py-3.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink">{user?.name}</p>
                      <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-b24-blue-dark">{role}</p>
                    </div>
                  </div>

                  {user?.role === 'ADMIN' && (
                    <div className="p-2">
                      <p className="px-2 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-400">Administração</p>
                      <Link
                        to="/settings"
                        role="menuitem"
                        onClick={() => setProfileOpen(false)}
                        className="focus-ring flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-steel transition hover:bg-sky-50 hover:text-b24-blue-dark"
                      >
                        <Settings size={17} />
                        <span>Configurações</span>
                      </Link>
                    </div>
                  )}

                  <div className="border-t border-b24-border p-2">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => { setProfileOpen(false); logout(); }}
                      className="focus-ring flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium text-coral transition hover:bg-red-50"
                    >
                      <LogOut size={17} /> Sair
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          <nav className="flex gap-1 overflow-x-auto border-t border-b24-border py-1.5 md:hidden" aria-label="Navegação principal">
            {visiblePrimaryItems.map((item) => (
              <PrimaryLink key={item.to} {...item} />
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto min-w-0 max-w-[1600px] px-3 py-3 sm:px-5 sm:py-4 lg:px-6">
        <Outlet />
      </main>
    </div>
  );
}

function PrimaryLink({ to, label, icon: Icon }: (typeof primaryItems)[number]) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        `focus-ring flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
          isActive
            ? 'bg-sky-50 text-b24-blue-dark shadow-[inset_0_-2px_0_#2fc6f6]'
            : 'text-steel hover:bg-b24-bg hover:text-ink'
        }`
      }
    >
      <Icon size={17} />
      <span>{label}</span>
    </NavLink>
  );
}
