import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { AlertCircle, Flame, MessageCircle, Moon, Sun, X } from 'lucide-react';
import { getWake, subscribeWake, ApiError } from '../lib/api';
import { useBusiness } from '../lib/business';
import type { AppointmentStatus } from '../lib/types';

/* ───────── Logo ───────── */
export function LogoMark({ size = 34 }: { size?: number }) {
  const { business } = useBusiness();
  if (business?.logoUrl) return <img src={business.logoUrl} alt="" width={size} height={size} style={{ width: size, height: size }} />;
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true">
      <rect width="48" height="48" rx="14" fill="var(--accent)" />
      <path d="M24 8c1 6 8 9 8 18a8 8 0 0 1-16 0c0-4 2-6 4-8 .2 3 1.6 4 3 4.4C23.400 19 22 13 24 8z" fill="var(--accent-ink)" />
      <path d="M12 36L38 10" stroke="var(--accent)" strokeWidth="4.5" strokeLinecap="round" />
    </svg>
  );
}

export function Logo() {
  const { business } = useBusiness();
  return (
    <span className="logo">
      <LogoMark />
      <span>{business?.name ?? ' '}</span>
    </span>
  );
}

export function ThemeToggle() {
  const { mode, toggleMode } = useBusiness();
  return (
    <button className="theme-toggle" onClick={toggleMode} aria-label={mode === 'dark' ? 'Pasar a modo claro' : 'Pasar a modo oscuro'}>
      {mode === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}

/* ───────── Banners ───────── */
export function DemoBanner() {
  const { business } = useBusiness();
  if (!business?.demoMode) return null;
  return <div className="demo-banner">Demo de portfolio: los turnos no son reales</div>;
}

/** Aviso amable mientras el servidor gratis (Render) se despierta: puede tardar cerca de un minuto. */
export function WakeBanner() {
  const [waking, setWaking] = useState(getWake().waking);
  useEffect(() => subscribeWake((s) => setWaking(s.waking)), []);
  if (!waking) return null;
  return (
    <div className="wake" role="status" aria-live="polite">
      <div className="ember">
        <Flame size={20} />
      </div>
      <div>
        <b>Encendiendo las brasas…</b>
        <div className="small muted">
          Esta demo corre en un servidor gratuito que se duerme cuando no se usa. Despierta en unos 30–60 segundos, ¡gracias por la paciencia!
        </div>
      </div>
    </div>
  );
}

/* ───────── Bloques básicos ───────── */
export const Spinner = () => <span className="spinner" aria-hidden="true" />;

export const Skeleton = ({ h = 16, w, r }: { h?: number; w?: number | string; r?: number }) => (
  <div className="skeleton" style={{ height: h, width: w ?? '100%', borderRadius: r }} />
);

export function Empty({ icon, title, children, action }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="art">{icon}</div>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const msg = error instanceof ApiError ? error.message : 'No pudimos cargar esto. Revisá tu conexión e intentá de nuevo.';
  return (
    <div className="alert" role="alert">
      <AlertCircle size={18} style={{ flex: 'none', marginTop: 2 }} />
      <div className="grow">
        {msg}
        {onRetry && (
          <div className="mt" style={{ marginTop: 8 }}>
            <button className="btn sm" onClick={onRetry}>
              Reintentar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function Avatar({ name, color, photoUrl, size }: { name: string; color: string; photoUrl?: string | null; size?: 'sm' | 'lg' | 'xl' }) {
  return (
    <span className={`avatar ${size ?? ''}`} style={{ background: color }}>
      {photoUrl ? <img src={photoUrl} alt="" /> : name.trim().charAt(0).toUpperCase()}
    </span>
  );
}

const STATUS: Record<AppointmentStatus, { label: string; cls: string }> = {
  CONFIRMED: { label: 'Confirmado', cls: 'info' },
  COMPLETED: { label: 'Completado', cls: 'ok' },
  CANCELLED: { label: 'Cancelado', cls: 'danger' },
  NO_SHOW: { label: 'No vino', cls: 'warn' },
};
export const StatusBadge = ({ status }: { status: AppointmentStatus }) => <span className={`badge ${STATUS[status].cls}`}>{STATUS[status].label}</span>;

/* ───────── Modal ───────── */
export function Modal({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="btn icon sm ghost" onClick={onClose} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>
        {children}
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

/* ───────── Toasts ───────── */
interface Toast {
  id: number;
  text: string;
  error?: boolean;
}
const ToastContext = createContext<(text: string, error?: boolean) => void>(() => undefined);
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<Toast[]>([]);
  const push = useCallback((text: string, error?: boolean) => {
    const id = Date.now() + Math.random();
    setList((l) => [...l, { id, text, error }]);
    setTimeout(() => setList((l) => l.filter((t) => t.id !== id)), 4200);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite">
        {list.map((t) => (
          <div key={t.id} className={`toast ${t.error ? 'error' : ''}`}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const errText = (e: unknown) => (e instanceof ApiError ? e.message : 'Algo salió mal. Probá de nuevo.');

export const WhatsAppIcon = ({ size = 24 }: { size?: number }) => <MessageCircle size={size} />;
