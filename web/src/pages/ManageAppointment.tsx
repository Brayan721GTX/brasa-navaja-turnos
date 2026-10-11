import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarX, Info, RefreshCcw } from 'lucide-react';
import { api } from '../lib/api';
import { useBusiness } from '../lib/business';
import { fmtDayLong, fmtTime, waLink } from '../lib/format';
import type { BookingResult, PublicAppointment, Slot } from '../lib/types';
import { ErrorBox, Modal, Skeleton, Spinner, StatusBadge, WhatsAppIcon, errText, useToast } from '../components/ui';
import { SlotPicker } from '../components/SlotPicker';
import { AppointmentTicket } from './Confirmation';

export default function ManageAppointment() {
  const { token = '' } = useParams();
  const { business } = useBusiness();
  const toast = useToast();
  const qc = useQueryClient();
  const tz = business?.timezone ?? 'America/Argentina/Buenos_Aires';
  const [mode, setMode] = useState<'cancel' | 'reschedule' | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [error, setError] = useState<string | null>(null);

  const q = useQuery({ queryKey: ['appointment', token], queryFn: () => api.get<PublicAppointment>(`/public/appointments/${token}`) });
  const a = q.data;

  const done = (res: BookingResult, msg: string) => {
    qc.setQueryData(['appointment', token], res.appointment);
    try {
      if (res.emailPreview) sessionStorage.setItem(`email.${token}`, JSON.stringify(res.emailPreview));
    } catch {
      /* sin storage */
    }
    setMode(null);
    setSlot(null);
    setError(null);
    toast(msg);
  };

  const cancel = useMutation({
    mutationFn: () => api.post<BookingResult>(`/public/appointments/${token}/cancel`),
    onSuccess: (r) => done(r, 'Turno cancelado'),
    onError: (e) => setError(errText(e)),
  });
  const reschedule = useMutation({
    mutationFn: () => api.post<BookingResult>(`/public/appointments/${token}/reschedule`, { startsAt: slot!.startsAt, professionalId: a!.professional.id }),
    onSuccess: (r) => done(r, '¡Turno reprogramado!'),
    onError: (e) => setError(errText(e)),
  });

  const wa = a && waLink(business?.whatsappNumber ?? null, `Hola! Quería consultar por mi turno de ${a.service.name} del ${fmtDayLong(a.startsAt, tz)} a las ${fmtTime(a.startsAt, tz)}.`);

  return (
    <main className="confirm" style={{ paddingTop: 28 }}>
      <div className="container narrow" style={{ maxWidth: 520 }}>
        {q.isLoading && <Skeleton h={300} r={22} />}
        {q.isError && <ErrorBox error={q.error} onRetry={() => q.refetch()} />}
        {a && (
          <div className="stack">
            <div className="row between">
              <h1 className="display" style={{ fontSize: 'clamp(28px, 6vw, 38px)' }}>
                Tu turno
              </h1>
              <StatusBadge status={a.status} />
            </div>
            <AppointmentTicket a={a} tz={tz} />

            {a.status === 'CONFIRMED' && a.canManage && (
              <div className="action-grid">
                <button className="btn primary" onClick={() => setMode('reschedule')}>
                  <RefreshCcw size={16} /> Reprogramar
                </button>
                <button className="btn danger" onClick={() => setMode('cancel')}>
                  <CalendarX size={16} /> Cancelar
                </button>
              </div>
            )}
            {a.status === 'CONFIRMED' && !a.canManage && (
              <div className="alert info">
                <Info size={18} style={{ flex: 'none', marginTop: 2 }} />
                <div>
                  {a.manageReason}
                  {wa && (
                    <div style={{ marginTop: 10 }}>
                      <a className="btn sm" href={wa} target="_blank" rel="noreferrer">
                        <WhatsAppIcon size={15} /> Escribir por WhatsApp
                      </a>
                    </div>
                  )}
                </div>
              </div>
            )}
            {a.status === 'CANCELLED' && (
              <Link to="/reservar" className="btn primary block">
                Reservar un nuevo turno
              </Link>
            )}
            <p className="muted small center">{a.cancellationPolicy}</p>
          </div>
        )}
      </div>

      {mode === 'cancel' && a && (
        <Modal
          title="¿Cancelar el turno?"
          onClose={() => setMode(null)}
          footer={
            <>
              <button className="btn ghost" onClick={() => setMode(null)}>
                No, mantenerlo
              </button>
              <button className="btn danger" disabled={cancel.isPending} onClick={() => cancel.mutate()}>
                {cancel.isPending && <Spinner />} Sí, cancelar turno
              </button>
            </>
          }
        >
          <p>
            Vas a cancelar <b>{a.service.name}</b> del {fmtDayLong(a.startsAt, tz)} a las {fmtTime(a.startsAt, tz)} hs. El horario quedará libre para otra persona.
          </p>
          {error && <div className="alert" style={{ marginTop: 12 }}>{error}</div>}
        </Modal>
      )}

      {mode === 'reschedule' && a && (
        <Modal
          title="Elegí un nuevo horario"
          wide
          onClose={() => setMode(null)}
          footer={
            <>
              <button className="btn ghost" onClick={() => setMode(null)}>
                Volver
              </button>
              <button className="btn primary" disabled={!slot || reschedule.isPending} onClick={() => reschedule.mutate()}>
                {reschedule.isPending && <Spinner />} Confirmar nuevo horario
              </button>
            </>
          }
        >
          <SlotPicker serviceId={a.service.id} professionalId={a.professional.id} tz={tz} maxDaysAhead={business?.maxDaysAhead ?? 30} value={slot} onChange={(s) => setSlot(s)} />
          {error && <div className="alert" style={{ marginTop: 12 }}>{error}</div>}
        </Modal>
      )}
    </main>
  );
}
