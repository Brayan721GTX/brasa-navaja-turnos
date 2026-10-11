import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ArrowLeft, Eye, EyeOff, ShieldCheck, UserRound } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useBusiness } from '../lib/business';
import { DemoBanner, LogoMark, Spinner, ThemeToggle, errText } from '../components/ui';

const DEMO_PASSWORD = 'Demo1234!';
const DEMO_USERS = [
  { email: 'admin@brasaynavaja.demo', label: 'Administrador', desc: 'Ve todo: agenda de los 3 barberos, dashboard y configuración', icon: ShieldCheck },
  { email: 'teo@brasaynavaja.demo', label: 'Profesional · Teo Ledesma', desc: 'Ve solo su propia agenda y clientes', icon: UserRound },
  { email: 'lucas@brasaynavaja.demo', label: 'Profesional · Lucas Ferrero', desc: 'Agenda con turno cortado y bloqueos', icon: UserRound },
];

export default function Login() {
  const { user, login } = useAuth();
  const { business } = useBusiness();
  const nav = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/admin" replace />;

  const submit = async (e?: string, p?: string) => {
    setBusy(true);
    setError(null);
    try {
      await login(e ?? email, p ?? password);
      nav('/admin', { replace: true });
    } catch (err) {
      setError(errText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <DemoBanner />
      <div className="login-wrap">
        <div className="login-card stack" style={{ gap: 20 }}>
          <div className="row between">
            <Link to="/" className="btn sm ghost">
              <ArrowLeft size={16} /> Volver al sitio
            </Link>
            <ThemeToggle />
          </div>
          <div className="center stack-sm">
            <div style={{ display: 'grid', placeItems: 'center' }}>
              <LogoMark size={56} />
            </div>
            <h1 className="display" style={{ fontSize: 34 }}>
              Panel de {business?.name ?? 'gestión'}
            </h1>
            <p className="muted small">Ingresá con tu usuario de administrador o de profesional.</p>
          </div>

          <form
            className="card stack"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" type="email" className="input" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="field">
              <label htmlFor="pw">Contraseña</label>
              <div style={{ position: 'relative' }}>
                <input id="pw" type={show ? 'text' : 'password'} className="input" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required style={{ paddingRight: 48 }} />
                <button type="button" className="btn icon sm ghost" onClick={() => setShow(!show)} aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'} style={{ position: 'absolute', right: 4, top: 5, border: 0 }}>
                  {show ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            {error && (
              <div className="alert" role="alert">
                {error}
              </div>
            )}
            <button className="btn primary block" disabled={busy}>
              {busy && <Spinner />} Ingresar
            </button>
          </form>

          {business?.demoMode && (
            <div className="stack-sm">
              <div className="eyebrow center">Usuarios de prueba · tocá uno para entrar</div>
              <div className="demo-users">
                {DEMO_USERS.map((u) => (
                  <button key={u.email} className="demo-user" disabled={busy} onClick={() => void submit(u.email, DEMO_PASSWORD)}>
                    <u.icon size={20} className="accent" />
                    <span className="grow">
                      <b style={{ display: 'block', fontSize: 14 }}>{u.label}</b>
                      <span className="muted tiny">{u.desc}</span>
                      <span className="tiny" style={{ display: 'block', opacity: 0.8 }}>
                        {u.email} · {DEMO_PASSWORD}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
