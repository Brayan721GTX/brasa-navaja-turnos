import { useState } from 'react';
import { NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { CalendarClock, CalendarDays, ExternalLink, Inbox, LayoutDashboard, LogOut, Menu, Scissors, Settings as SettingsIcon, Users, UserSquare2, X } from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { useBusiness } from '../../lib/business';
import { DemoBanner, Logo, ThemeToggle } from '../../components/ui';

const ITEMS = [
  { to: '/admin', end: true, label: 'Resumen', icon: LayoutDashboard, roles: ['ADMIN', 'PROFESSIONAL'] },
  { to: '/admin/agenda', label: 'Agenda', icon: CalendarDays, roles: ['ADMIN', 'PROFESSIONAL'] },
  { to: '/admin/clientes', label: 'Clientes', icon: Users, roles: ['ADMIN', 'PROFESSIONAL'] },
  { to: '/admin/servicios', label: 'Servicios', icon: Scissors, roles: ['ADMIN'] },
  { to: '/admin/profesionales', label: 'Equipo y horarios', icon: UserSquare2, roles: ['ADMIN'] },
  { to: '/admin/calendario', label: 'Feriados y bloqueos', icon: CalendarClock, roles: ['ADMIN', 'PROFESSIONAL'] },
  { to: '/admin/configuracion', label: 'Configuración', icon: SettingsIcon, roles: ['ADMIN'] },
  { to: '/admin/emails', label: 'Bandeja de emails', icon: Inbox, roles: ['ADMIN'] },
];

export default function AdminLayout() {
  const { user, logout } = useAuth();
  const { business } = useBusiness();
  const nav = useNavigate();
  const loc = useLocation();
  const [open, setOpen] = useState(false);

  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  const items = ITEMS.filter((i) => i.roles.includes(user.role));

  const links = (onClick?: () => void) =>
    items.map((i) => (
      <NavLink key={i.to} to={i.to} end={i.end} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={onClick}>
        <i.icon size={19} /> {i.label}
      </NavLink>
    ));

  const out = async () => {
    await logout();
    nav('/login', { replace: true });
  };

  return (
    <>
      <DemoBanner />
      <div className="shell">
        <aside className="sidebar">
          <div className="logo" style={{ padding: '4px 8px 18px' }}>
            <Logo />
          </div>
          {links()}
          <div className="bottom">
            <a className="nav-item" href="/" target="_blank" rel="noreferrer">
              <ExternalLink size={18} /> Ver sitio público
            </a>
            <div className="row between" style={{ padding: '0 4px' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 14 }} className="nowrap">
                  {user.name}
                </div>
                <div className="muted tiny">{user.role === 'ADMIN' ? 'Administrador' : business?.professionalLabel ?? 'Profesional'}</div>
              </div>
              <div className="row" style={{ gap: 6 }}>
                <ThemeToggle />
                <button className="btn icon sm ghost" onClick={out} aria-label="Cerrar sesión" title="Cerrar sesión">
                  <LogOut size={16} />
                </button>
              </div>
            </div>
          </div>
        </aside>

        <div style={{ minWidth: 0 }}>
          <div className="mobile-bar">
            <Logo />
            <div className="row" style={{ gap: 6 }}>
              <ThemeToggle />
              <button className="btn icon ghost" onClick={() => setOpen(true)} aria-label="Abrir menú">
                <Menu size={20} />
              </button>
            </div>
          </div>
          <main className="main">
            <Outlet />
          </main>
        </div>
      </div>

      {open && (
        <div className="mobile-nav">
          <div className="row between" style={{ marginBottom: 10 }}>
            <Logo />
            <button className="btn icon ghost" onClick={() => setOpen(false)} aria-label="Cerrar menú">
              <X size={20} />
            </button>
          </div>
          {links(() => setOpen(false))}
          <a className="nav-item" href="/" target="_blank" rel="noreferrer">
            <ExternalLink size={18} /> Ver sitio público
          </a>
          <button className="nav-item" style={{ background: 'none', border: 0, textAlign: 'left' }} onClick={out}>
            <LogOut size={18} /> Cerrar sesión ({user.name})
          </button>
        </div>
      )}
    </>
  );
}
