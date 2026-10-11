import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarPlus, ChevronLeft, ChevronRight, Phone } from 'lucide-react';
import { DateTime } from 'luxon';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useBusiness } from '../../lib/business';
import {
  addDaysStr,
  cap,
  fmtDayLong,
  fmtTime,
  hhmm,
  localDate,
  minutesOfDay,
  money,
  parseHhmm,
  toUtcIso,
  todayStr,
  waLink,
  weekStartOf,
} from '../../lib/format';
import type { AdminAppointment, AdminProfessional, AdminService, AppointmentStatus, Holiday, TimeBlock } from '../../lib/types';
import { Avatar, ErrorBox, Modal, Skeleton, Spinner, StatusBadge, errText, useToast } from '../../components/ui';

const START = 8 * 60;
const END = 22 * 60;
const HOUR_H = 64;
const PX = HOUR_H / 60;
const SNAP = 15;

interface Col {
  key: string;
  date: string;
  pro: AdminProfessional | null;
  head: React.ReactNode;
  today: boolean;
}

export default function Agenda() {
  const { user } = useAuth();
  const { business } = useBusiness();
  const tz = business?.timezone ?? 'America/Argentina/Buenos_Aires';
  const toast = useToast();
  const qc = useQueryClient();
  const isAdmin = user?.role === 'ADMIN';

  const [view, setView] = useState<'day' | 'week'>(() => (window.innerWidth < 760 ? 'day' : 'day'));
  const [date, setDate] = useState(() => todayStr(tz));
  const [proFilter, setProFilter] = useState<string>('all');
  const [selected, setSelected] = useState<AdminAppointment | null>(null);
  const [creating, setCreating] = useState<{ date: string; minute: number; professionalId: string } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ colKey: string; minute: number } | null>(null);
  const dragOffset = useRef(0);

  const prosQ = useQuery({ queryKey: ['admin', 'professionals'], queryFn: () => api.admin.get<AdminProfessional[]>('/professionals') });
  const holidaysQ = useQuery({ queryKey: ['admin', 'holidays'], queryFn: () => api.admin.get<Holiday[]>('/holidays') });
  const blocksQ = useQuery({ queryKey: ['admin', 'blocks'], queryFn: () => api.admin.get<TimeBlock[]>('/blocks') });

  const pros = useMemo(() => (prosQ.data ?? []).filter((p) => p.active), [prosQ.data]);
  const weekPro = useMemo(() => {
    if (!isAdmin) return pros[0] ?? null;
    return pros.find((p) => p.id === proFilter) ?? pros[0] ?? null;
  }, [isAdmin, pros, proFilter]);

  const rangeFrom = view === 'day' ? date : weekStartOf(date);
  const rangeTo = view === 'day' ? date : addDaysStr(rangeFrom, 6);

  const apptsQ = useQuery({
    queryKey: ['admin', 'appointments', rangeFrom, rangeTo, tz],
    queryFn: () => api.admin.get<AdminAppointment[]>(`/appointments?from=${encodeURIComponent(toUtcIso(rangeFrom, 0, tz))}&to=${encodeURIComponent(toUtcIso(addDaysStr(rangeTo, 1), 0, tz))}`),
    refetchInterval: 60_000,
  });

  const cols = useMemo<Col[]>(() => {
    const today = todayStr(tz);
    if (view === 'day') {
      const list = isAdmin && proFilter !== 'all' ? pros.filter((p) => p.id === proFilter) : pros;
      return list.map((p) => ({
        key: p.id,
        date,
        pro: p,
        today: date === today,
        head: (
          <>
            <Avatar name={p.name} color={p.color} size="sm" photoUrl={p.photoUrl} /> {p.name}
          </>
        ),
      }));
    }
    return Array.from({ length: 7 }).map((_, i) => {
      const d = addDaysStr(rangeFrom, i);
      const dt = DateTime.fromISO(d).setLocale('es-AR');
      return { key: d, date: d, pro: weekPro, today: d === today, head: <span>{cap(dt.toFormat('ccc d'))}</span> };
    });
  }, [view, pros, proFilter, isAdmin, date, rangeFrom, weekPro, tz]);

  const holidays = useMemo(() => new Map((holidaysQ.data ?? []).map((h) => [h.date, h.name])), [holidaysQ.data]);

  const move = useMutation({
    mutationFn: (v: { id: string; startsAt: string; professionalId?: string }) => api.admin.patch<AdminAppointment>(`/appointments/${v.id}`, { startsAt: v.startsAt, professionalId: v.professionalId }),
    onSuccess: (a) => {
      toast(`Turno movido: ${fmtDayLong(a.startsAt, tz)} ${fmtTime(a.startsAt, tz)} hs`);
      void qc.invalidateQueries({ queryKey: ['admin', 'appointments'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'dashboard'] });
    },
    onError: (e) => toast(errText(e), true),
  });

  const colAppts = (c: Col) =>
    (apptsQ.data ?? []).filter((a) => (view === 'day' ? a.professional.id === c.pro?.id : a.professional.id === c.pro?.id && localDate(a.startsAt, tz) === c.date));

  const colBlocks = (c: Col) =>
    (blocksQ.data ?? []).filter((b) => (b.professionalId === null || b.professionalId === c.pro?.id) && localDate(b.startsAt, tz) <= c.date && localDate(b.endsAt, tz) >= c.date);

  const offRanges = (c: Col): [number, number][] => {
    if (!c.pro) return [];
    if (holidays.has(c.date)) return [[START, END]];
    const wd = DateTime.fromISO(c.date).weekday % 7;
    const work = c.pro.hours.filter((h) => h.weekday === wd).sort((a, b) => a.startMinute - b.startMinute);
    const off: [number, number][] = [];
    let cursor = START;
    for (const w of work) {
      if (w.startMinute > cursor) off.push([cursor, Math.min(w.startMinute, END)]);
      cursor = Math.max(cursor, w.endMinute);
    }
    if (cursor < END) off.push([cursor, END]);
    return off;
  };

  const minuteFromY = (clientY: number, el: HTMLElement, offset = 0) => {
    const rect = el.getBoundingClientRect();
    const raw = START + (clientY - rect.top - offset) / PX;
    return Math.max(START, Math.min(END - SNAP, Math.round(raw / SNAP) * SNAP));
  };

  const dragged = dragId ? apptsQ.data?.find((a) => a.id === dragId) : undefined;
  const dragDur = dragged ? (new Date(dragged.endsAt).getTime() - new Date(dragged.startsAt).getTime()) / 60_000 : 0;

  const onDrop = (c: Col, minute: number) => {
    if (!dragged) return;
    const startsAt = toUtcIso(c.date, minute, tz);
    const proId = c.pro?.id;
    setDragId(null);
    setDrop(null);
    if (startsAt === new Date(dragged.startsAt).toISOString() && proId === dragged.professional.id) return;
    move.mutate({ id: dragged.id, startsAt, professionalId: isAdmin && proId && proId !== dragged.professional.id ? proId : undefined });
  };

  const shift = (n: number) => setDate(addDaysStr(date, view === 'day' ? n : n * 7));

  // Scroll inicial: cerca de las 9 o de la hora actual
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = Math.max(0, (9 * 60 - START) * PX - 20);
  }, [view]);

  const nowMin = minutesOfDay(new Date().toISOString(), tz);
  const showNow = (c: Col) => c.today && nowMin >= START && nowMin <= END;

  const title = view === 'day' ? cap(DateTime.fromISO(date).setLocale('es-AR').toFormat("cccc d 'de' LLLL")) : `${cap(DateTime.fromISO(rangeFrom).setLocale('es-AR').toFormat("d LLL"))} – ${DateTime.fromISO(rangeTo).setLocale('es-AR').toFormat("d LLL")}`;
  const loading = prosQ.isLoading || apptsQ.isLoading;
  const gridCols = `56px repeat(${Math.max(cols.length, 1)}, minmax(${view === 'day' ? 170 : 128}px, 1fr))`;

  return (
    <div>
      <div className="page-head" style={{ marginBottom: 14 }}>
        <div>
          <div className="eyebrow">Agenda · arrastrá los turnos para moverlos</div>
          <h1 className="display">{title}</h1>
        </div>
        <button className="btn primary" onClick={() => setCreating({ date: view === 'day' ? date : todayStr(tz), minute: 10 * 60, professionalId: weekPro?.id ?? pros[0]?.id ?? '' })}>
          <CalendarPlus size={17} /> Nuevo turno
        </button>
      </div>

      <div className="agenda-bar">
        <div className="row" style={{ gap: 6 }}>
          <button className="btn icon sm" onClick={() => shift(-1)} aria-label="Anterior">
            <ChevronLeft size={17} />
          </button>
          <button className="btn sm" onClick={() => setDate(todayStr(tz))}>
            Hoy
          </button>
          <button className="btn icon sm" onClick={() => shift(1)} aria-label="Siguiente">
            <ChevronRight size={17} />
          </button>
        </div>
        <input type="date" className="input" style={{ width: 160, minHeight: 36, padding: '4px 10px', fontSize: 14 }} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
        <div className="tabs">
          <button className={view === 'day' ? 'on' : ''} onClick={() => setView('day')}>
            Día
          </button>
          <button className={view === 'week' ? 'on' : ''} onClick={() => setView('week')}>
            Semana
          </button>
        </div>
        {isAdmin && (
          <select className="select" style={{ width: 'auto', minHeight: 36, padding: '4px 12px', fontSize: 14 }} value={proFilter} onChange={(e) => setProFilter(e.target.value)} aria-label="Profesional">
            {view === 'day' && <option value="all">Todo el equipo</option>}
            {pros.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
        {view === 'week' && !isAdmin && weekPro && <span className="muted small">Tu agenda</span>}
      </div>

      {(apptsQ.isError || prosQ.isError) && <ErrorBox error={apptsQ.error ?? prosQ.error} onRetry={() => void apptsQ.refetch()} />}

      <div className="agenda" ref={scroller}>
        {loading ? (
          <div style={{ padding: 18 }} className="stack">
            <Skeleton h={40} />
            <Skeleton h={300} r={14} />
          </div>
        ) : (
          <div className="agenda-grid" style={{ gridTemplateColumns: gridCols, minWidth: 56 + cols.length * (view === 'day' ? 170 : 128) }}>
            <div className="ag-corner" />
            {cols.map((c) => (
              <div key={`h${c.key}`} className={`ag-head ${c.today ? 'today' : ''}`}>
                {c.head}
                {holidays.has(c.date) && view === 'week' && <span className="badge warn">Feriado</span>}
              </div>
            ))}
            <div className="ag-times" style={{ height: (END - START) * PX }}>
              {Array.from({ length: (END - START) / 60 + 1 }).map((_, i) => (
                <span key={i} className="ag-time" style={{ top: i * HOUR_H }}>
                  {hhmm(START + i * 60)}
                </span>
              ))}
            </div>
            {cols.map((c) => (
              <div
                key={c.key}
                className="ag-col"
                style={{ height: (END - START) * PX }}
                onClick={(e) => {
                  if (e.target !== e.currentTarget && !(e.target as HTMLElement).classList.contains('ag-line') && !(e.target as HTMLElement).classList.contains('ag-off')) return;
                  if (!c.pro) return;
                  setCreating({ date: c.date, minute: minuteFromY(e.clientY, e.currentTarget), professionalId: c.pro.id });
                }}
                onDragOver={(e) => {
                  if (!dragId) return;
                  e.preventDefault();
                  const minute = minuteFromY(e.clientY, e.currentTarget, dragOffset.current);
                  if (drop?.colKey !== c.key || drop.minute !== minute) setDrop({ colKey: c.key, minute });
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  onDrop(c, minuteFromY(e.clientY, e.currentTarget, dragOffset.current));
                }}
              >
                {Array.from({ length: (END - START) / 30 }).map((_, i) => (
                  <div key={i} className={`ag-line ${i % 2 ? 'half' : ''}`} style={{ top: i * 30 * PX }} />
                ))}
                {holidays.has(c.date) && view === 'day' && (
                  <div className="ag-off" style={{ top: 0, height: (END - START) * PX, display: 'grid', placeItems: 'center' }}>
                    <span className="badge warn">Feriado · {holidays.get(c.date)}</span>
                  </div>
                )}
                {!holidays.has(c.date) && offRanges(c).map(([a, b], i) => <div key={i} className="ag-off" style={{ top: (a - START) * PX, height: (b - a) * PX }} />)}
                {colBlocks(c).map((b) => {
                  const s = Math.max(START, localDate(b.startsAt, tz) < c.date ? START : minutesOfDay(b.startsAt, tz));
                  const e = Math.min(END, localDate(b.endsAt, tz) > c.date ? END : minutesOfDay(b.endsAt, tz));
                  if (e <= s) return null;
                  return (
                    <div key={b.id} className="ag-block" style={{ top: (s - START) * PX, height: (e - s) * PX }}>
                      {b.reason ?? 'Bloqueado'}
                    </div>
                  );
                })}
                {colAppts(c).map((a) => {
                  const s = minutesOfDay(a.startsAt, tz);
                  const dur = (new Date(a.endsAt).getTime() - new Date(a.startsAt).getTime()) / 60_000;
                  const cls = a.status === 'COMPLETED' ? 'done' : a.status === 'NO_SHOW' ? 'noshow' : a.status === 'CANCELLED' ? 'cancelled' : '';
                  return (
                    <button
                      key={a.id}
                      draggable
                      className={`ag-appt ${cls} ${dragId === a.id ? 'dragging' : ''}`}
                      style={{ top: (s - START) * PX + 1, height: dur * PX - 3, background: a.professional.color }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelected(a);
                      }}
                      onDragStart={(e) => {
                        const rect = e.currentTarget.getBoundingClientRect();
                        dragOffset.current = e.clientY - rect.top;
                        e.dataTransfer.effectAllowed = 'move';
                        e.dataTransfer.setData('text/plain', a.id);
                        setDragId(a.id);
                      }}
                      onDragEnd={() => {
                        setDragId(null);
                        setDrop(null);
                      }}
                      title={`${a.customer.name} · ${a.service.name}`}
                    >
                      <b>{a.customer.name}</b>
                      <span>
                        {fmtTime(a.startsAt, tz)} · {a.service.name}
                      </span>
                    </button>
                  );
                })}
                {dragged && drop?.colKey === c.key && <div className="ag-drop" style={{ top: (drop.minute - START) * PX, height: dragDur * PX }} />}
                {showNow(c) && <div className="ag-now" style={{ top: (nowMin - START) * PX }} />}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="legend" style={{ marginTop: 12 }}>
        <span>
          <i className="dot" style={{ background: 'var(--muted)', opacity: 0.5 }} /> Fuera de horario / feriado
        </span>
        <span>Tocá un hueco para cargar un turno a mano</span>
        {pros.map((p) => (
          <span key={p.id}>
            <i className="dot" style={{ background: p.color }} /> {p.name}
          </span>
        ))}
      </div>

      {selected && <AppointmentModal appt={selected} pros={pros} tz={tz} isAdmin={isAdmin} onClose={() => setSelected(null)} />}
      {creating && <NewAppointmentModal init={creating} pros={pros} tz={tz} isAdmin={isAdmin} onClose={() => setCreating(null)} />}
    </div>
  );
}

/* ───────────────────────── Detalle del turno ───────────────────────── */

function AppointmentModal({ appt, pros, tz, isAdmin, onClose }: { appt: AdminAppointment; pros: AdminProfessional[]; tz: string; isAdmin: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { business } = useBusiness();
  const [day, setDay] = useState(localDate(appt.startsAt, tz));
  const [time, setTime] = useState(hhmm(minutesOfDay(appt.startsAt, tz)));
  const [proId, setProId] = useState(appt.professional.id);
  const [notes, setNotes] = useState(appt.notes ?? '');
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.admin.patch<AdminAppointment>(`/appointments/${appt.id}`, body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin'] });
      onClose();
    },
    onError: (e) => setError(errText(e)),
  });

  const moved = day !== localDate(appt.startsAt, tz) || time !== hhmm(minutesOfDay(appt.startsAt, tz)) || proId !== appt.professional.id;
  const wa = waLink(appt.customer.phone ? '549' + appt.customer.phone.replace(/\D/g, '').replace(/^549?/, '') : null, `Hola ${appt.customer.name.split(' ')[0]}! Te escribimos de ${business?.name} por tu turno del ${fmtDayLong(appt.startsAt, tz)} a las ${fmtTime(appt.startsAt, tz)}.`);
  const setStatus = (status: AppointmentStatus) => {
    save.mutate({ status });
    toast(status === 'CANCELLED' ? 'Turno cancelado' : 'Estado actualizado');
  };

  return (
    <Modal
      title="Turno"
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cerrar
          </button>
          <button
            className="btn primary"
            disabled={save.isPending || (!moved && notes === (appt.notes ?? ''))}
            onClick={() =>
              save.mutate({
                ...(moved ? { startsAt: toUtcIso(day, parseHhmm(time), tz), professionalId: proId } : {}),
                ...(notes !== (appt.notes ?? '') ? { notes: notes || null } : {}),
              })
            }
          >
            {save.isPending && <Spinner />} Guardar cambios
          </button>
        </>
      }
    >
      <div className="stack">
        <div className="row between">
          <div>
            <div style={{ fontWeight: 800, fontSize: 18 }}>{appt.customer.name}</div>
            <div className="muted small row" style={{ gap: 6 }}>
              <Phone size={13} /> {appt.customer.phone}
              {appt.customer.email ? ` · ${appt.customer.email}` : ''}
            </div>
          </div>
          <StatusBadge status={appt.status} />
        </div>
        <div className="card flat summary" style={{ padding: '4px 16px' }}>
          <div className="r">
            <span>Servicio</span>
            <b>
              {appt.service.name} · {appt.service.durationMin} min
            </b>
          </div>
          <div className="r">
            <span>Precio</span>
            <b>{money(appt.price)}</b>
          </div>
          <div className="r">
            <span>Origen</span>
            <b>{appt.source === 'ONLINE' ? 'Reserva online' : 'Cargado a mano'}</b>
          </div>
        </div>

        <div className="eyebrow">Mover a otro horario</div>
        <div className="form-grid three">
          <div className="field">
            <label htmlFor="d">Día</label>
            <input id="d" type="date" className="input" value={day} onChange={(e) => setDay(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="t">Hora</label>
            <input id="t" type="time" step={900} className="input" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
          {isAdmin && (
            <div className="field">
              <label htmlFor="p">Profesional</label>
              <select id="p" className="select" value={proId} onChange={(e) => setProId(e.target.value)}>
                {pros.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        <div className="field">
          <label htmlFor="n">Notas internas</label>
          <textarea id="n" className="textarea" value={notes} maxLength={300} onChange={(e) => setNotes(e.target.value)} />
        </div>
        {error && (
          <div className="alert" role="alert">
            {error}
          </div>
        )}
        <div className="row wrap">
          {appt.status !== 'COMPLETED' && (
            <button className="btn sm" onClick={() => setStatus('COMPLETED')}>
              ✓ Completado
            </button>
          )}
          {appt.status !== 'NO_SHOW' && (
            <button className="btn sm" onClick={() => setStatus('NO_SHOW')}>
              No vino
            </button>
          )}
          {appt.status !== 'CONFIRMED' && (
            <button className="btn sm" onClick={() => setStatus('CONFIRMED')}>
              Reactivar
            </button>
          )}
          {appt.status !== 'CANCELLED' && (
            <button className="btn sm danger" onClick={() => setStatus('CANCELLED')}>
              Cancelar turno
            </button>
          )}
          {wa && (
            <a className="btn sm" href={wa} target="_blank" rel="noreferrer">
              WhatsApp
            </a>
          )}
        </div>
      </div>
    </Modal>
  );
}

/* ───────────────────────── Carga manual (turnos por teléfono) ───────────────────────── */

function NewAppointmentModal({ init, pros, tz, isAdmin, onClose }: { init: { date: string; minute: number; professionalId: string }; pros: AdminProfessional[]; tz: string; isAdmin: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const services = useQuery({ queryKey: ['admin', 'services'], queryFn: () => api.admin.get<AdminService[]>('/services') });
  const [serviceId, setServiceId] = useState('');
  const [proId, setProId] = useState(init.professionalId);
  const [day, setDay] = useState(init.date);
  const [time, setTime] = useState(hhmm(init.minute));
  const [form, setForm] = useState({ name: '', phone: '', email: '', notes: '' });
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);

  const active = (services.data ?? []).filter((s) => s.active && (!proId || s.professionalIds.includes(proId)));
  const effectiveService = serviceId || active[0]?.id || '';
  const valid = form.name.trim().length >= 2 && form.phone.replace(/\D/g, '').length >= 6 && !!effectiveService && !!proId;

  const create = useMutation({
    mutationFn: () =>
      api.admin.post('/appointments', {
        serviceId: effectiveService,
        professionalId: proId,
        startsAt: toUtcIso(day, parseHhmm(time), tz),
        customer: { name: form.name.trim(), phone: form.phone.trim(), email: form.email.trim() || null },
        notes: form.notes.trim() || null,
      }),
    onSuccess: () => {
      toast('Turno cargado');
      void qc.invalidateQueries({ queryKey: ['admin'] });
      onClose();
    },
    onError: (e) => setError(errText(e)),
  });

  return (
    <Modal
      title="Nuevo turno"
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancelar
          </button>
          <button
            className="btn primary"
            disabled={create.isPending}
            onClick={() => {
              setTouched(true);
              setError(null);
              if (valid) create.mutate();
            }}
          >
            {create.isPending && <Spinner />} Guardar turno
          </button>
        </>
      }
    >
      <div className="form-grid">
        <div className="form-grid two">
          {isAdmin && (
            <div className="field">
              <label htmlFor="np">Profesional</label>
              <select id="np" className="select" value={proId} onChange={(e) => setProId(e.target.value)}>
                {pros.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="field">
            <label htmlFor="ns">Servicio</label>
            <select id="ns" className="select" value={effectiveService} onChange={(e) => setServiceId(e.target.value)}>
              {active.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.durationMin} min · {money(s.price)}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="form-grid two">
          <div className="field">
            <label htmlFor="nd">Día</label>
            <input id="nd" type="date" className="input" value={day} onChange={(e) => setDay(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="nt">Hora</label>
            <input id="nt" type="time" step={900} className="input" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="nn">Cliente</label>
          <input id="nn" className={`input ${touched && form.name.trim().length < 2 ? 'invalid' : ''}`} placeholder="Nombre y apellido" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </div>
        <div className="form-grid two">
          <div className="field">
            <label htmlFor="nph">Teléfono</label>
            <input id="nph" type="tel" className={`input ${touched && form.phone.replace(/\D/g, '').length < 6 ? 'invalid' : ''}`} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="ne">Email (opcional)</label>
            <input id="ne" type="email" className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
        </div>
        <div className="field">
          <label htmlFor="nno">Notas</label>
          <input id="nno" className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </div>
        {error && (
          <div className="alert" role="alert">
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}
