import { useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CalendarPlus, CalendarX, Download, Mail, RefreshCcw } from 'lucide-react';
import { api, apiBase } from '../lib/api';
import { useBusiness } from '../lib/business';
import { fmtDayLong, fmtTime, money, waLink } from '../lib/format';
import type { EmailPreview, PublicAppointment } from '../lib/types';
import { ErrorBox, Modal, Skeleton, StatusBadge, WhatsAppIcon } from '../components/ui';

export function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 26 }).map((_, i) => ({
        left: Math.random() * 100,
        dx: (Math.random() - 0.5) * 120,
        delay: 0.6 + Math.random() * 0.9,
        size: 4 + Math.random() * 6,
        opacity: i % 3 === 0 ? 1 : 0.7,
        hi: i % 2 === 0,
      })),
    [],
  );
  return (
    <div className="confetti" aria-hidden="true">
      {pieces.map((p, i) => (
        <i
          key={i}
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size,
            background: p.hi ? 'var(--accent-hi)' : 'var(--accent)',
            animationDelay: `${p.delay}s`,
            ['--dx' as string]: `${p.dx}px`,
          }}
        />
      ))}
    </div>
  );
}

export function AppointmentTicket({ a, tz }: { a: PublicAppointment; tz: string }) {
  const { business } = useBusiness();
  return (
    <div className="ticket">
      <div className="summary">
        <div className="r">
          <span>Servicio</span>
          <b>{a.service.name}</b>
        </div>
        <div className="r">
          <span>{business?.professionalLabel ?? 'Profesional'}</span>
          <b>{a.professional.name}</b>
        </div>
      </div>
      <div className="perf" />
      <div className="summary">
        <div className="r">
          <span>Día</span>
          <b>{fmtDayLong(a.startsAt, tz)}</b>
        </div>
        <div className="r">
          <span>Hora</span>
          <b>{fmtTime(a.startsAt, tz)} hs</b>
        </div>
        <div className="r total">
          <span>Total a abonar en el local</span>
          <b>{money(a.price)}</b>
        </div>
      </div>
    </div>
  );
}

export default function Confirmation() {
  const { token = '' } = useParams();
  const { state } = useLocation() as { state?: { fresh?: boolean } };
  const { business } = useBusiness();
  const tz = business?.timezone ?? 'America/Argentina/Buenos_Aires';
  const [showMail, setShowMail] = useState(false);

  const q = useQuery({ queryKey: ['appointment', token], queryFn: () => api.get<PublicAppointment>(`/public/appointments/${token}`) });
  const a = q.data;

  const email = useMemo<EmailPreview | null>(() => {
    try {
      return JSON.parse(sessionStorage.getItem(`email.${token}`) ?? 'null');
    } catch {
      return null;
    }
  }, [token]);

  const wa = a && waLink(business?.whatsappNumber ?? null, `Hola! Tengo un turno de ${a.service.name} el ${fmtDayLong(a.startsAt, tz)} a las ${fmtTime(a.startsAt, tz)} y quería consultar algo.`);

  return (
    <main className="confirm">
      {state?.fresh && <Confetti />}
      <div className="container narrow" style={{ maxWidth: 520 }}>
        {q.isLoading && (
          <div className="stack">
            <Skeleton h={96} w={96} r={48} />
            <Skeleton h={220} r={22} />
          </div>
        )}
        {q.isError && <ErrorBox error={q.error} onRetry={() => q.refetch()} />}
        {a && (
          <div className="stack">
            <div className="center">
              <svg className="check-anim" viewBox="0 0 96 96" aria-hidden="true">
                <circle cx="48" cy="48" r="40" />
                <path d="M30 49l13 13 24-28" />
              </svg>
              <h1 className="display" style={{ fontSize: 'clamp(30px, 7vw, 42px)' }}>
                {a.status === 'CANCELLED' ? 'Turno cancelado' : `¡Listo, ${a.customer.name.split(' ')[0]}!`}
              </h1>
              <p className="muted" style={{ marginTop: 8 }}>
                {a.status === 'CANCELLED' ? 'Este turno ya no está activo.' : business?.demoMode ? 'Tu turno quedó confirmado (de mentira: es una demo).' : 'Tu turno está confirmado. Te esperamos.'}
              </p>
              {a.status !== 'CONFIRMED' && (
                <div style={{ marginTop: 10 }}>
                  <StatusBadge status={a.status} />
                </div>
              )}
            </div>

            <AppointmentTicket a={a} tz={tz} />

            {a.status === 'CONFIRMED' && (
              <div className="action-grid" style={{ animation: 'pop-in .6s var(--ease) .9s backwards' }}>
                <a className="btn primary full" href={a.calendarUrl} target="_blank" rel="noreferrer">
                  <CalendarPlus size={18} /> Agregar a Google Calendar
                </a>
                <a className="btn" href={`${apiBase}/public/appointments/${token}/calendar.ics`}>
                  <Download size={16} /> Archivo .ics
                </a>
                {wa && (
                  <a className="btn" href={wa} target="_blank" rel="noreferrer">
                    <WhatsAppIcon size={16} /> WhatsApp
                  </a>
                )}
                <Link className="btn" to={`/turno/${token}`}>
                  <RefreshCcw size={16} /> Reprogramar
                </Link>
                <Link className="btn danger" to={`/turno/${token}`}>
                  <CalendarX size={16} /> Cancelar
                </Link>
                {email && (
                  <button className="btn ghost full" onClick={() => setShowMail(true)}>
                    <Mail size={16} /> Ver el email de confirmación (demo)
                  </button>
                )}
              </div>
            )}
            <p className="muted small center">{a.cancellationPolicy}</p>
            <Link to="/" className="btn ghost block">
              Volver al inicio
            </Link>
          </div>
        )}
      </div>
      {showMail && email && (
        <Modal title="Email de confirmación" onClose={() => setShowMail(false)} wide>
          <p className="muted small" style={{ marginBottom: 10 }}>
            En la demo los emails no se envían a nadie: se muestran acá. Para: <b>{email.to}</b>
          </p>
          <div className="small" style={{ marginBottom: 10 }}>
            <b>Asunto:</b> {email.subject}
          </div>
          <iframe className="email-frame" title="Email" sandbox="" srcDoc={email.html} />
        </Modal>
      )}
    </main>
  );
}
