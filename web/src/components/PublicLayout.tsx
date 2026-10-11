import { Link, Outlet, useLocation } from 'react-router-dom';
import { LogIn } from 'lucide-react';
import { useBusiness } from '../lib/business';
import { waLink } from '../lib/format';
import { DemoBanner, Logo, ThemeToggle, WhatsAppIcon } from './ui';

export function WhatsAppFab({ text }: { text?: string }) {
  const { business } = useBusiness();
  const href = waLink(business?.whatsappNumber ?? null, text ?? `Hola ${business?.name ?? ''}! Quería hacer una consulta.`);
  if (!href) return null;
  return (
    <a className="fab-wa" href={href} target="_blank" rel="noreferrer" aria-label="Consultar por WhatsApp">
      <WhatsAppIcon size={26} />
    </a>
  );
}

export function PublicLayout() {
  const { business } = useBusiness();
  const { pathname } = useLocation();
  return (
    <>
      <DemoBanner />
      <header className="topbar">
        <div className="container">
          <Link to="/" aria-label="Inicio">
            <Logo />
          </Link>
          <div className="row">
            <Link to="/admin" className="btn sm ghost">
              <LogIn size={15} /> Panel
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </header>
      <Outlet />
      {!['/reservar', '/confirmado'].some((p) => pathname.startsWith(p)) && <WhatsAppFab />}
      <footer className="footer">
        <div className="container stack-sm">
          <div className="display" style={{ color: 'var(--text)', fontSize: 20 }}>
            {business?.name}
          </div>
          <div>{[business?.address, business?.phone].filter(Boolean).join(' · ')}</div>
          <div className="small">{business?.cancellationPolicy}</div>
          <div className="tiny" style={{ marginTop: 10 }}>
            Sistema de turnos online · <a href="/api/docs" target="_blank" rel="noreferrer">API documentada (Swagger)</a>
          </div>
        </div>
      </footer>
    </>
  );
}
