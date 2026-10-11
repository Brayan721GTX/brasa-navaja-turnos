import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarOff, Plus, Trash2 } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useBusiness } from '../../lib/business';
import { addDaysStr, fmtDateTime, fmtDayLong, parseHhmm, toUtcIso, todayStr } from '../../lib/format';
import type { AdminProfessional, Holiday, TimeBlock } from '../../lib/types';
import { Empty, ErrorBox, Modal, Skeleton, Spinner, errText, useToast } from '../../components/ui';

export default function CalendarSettings() {
  const { user } = useAuth();
  const { business } = useBusiness();
  const tz = business?.timezone ?? 'America/Argentina/Buenos_Aires';
  const isAdmin = user?.role === 'ADMIN';
  const qc = useQueryClient();
  const toast = useToast();

  const holidays = useQuery({ queryKey: ['admin', 'holidays'], queryFn: () => api.admin.get<Holiday[]>('/holidays') });
  const blocks = useQuery({ queryKey: ['admin', 'blocks'], queryFn: () => api.admin.get<TimeBlock[]>('/blocks') });
  const pros = useQuery({ queryKey: ['admin', 'professionals'], queryFn: () => api.admin.get<AdminProfessional[]>('/professionals') });

  const [hol, setHol] = useState<{ date: string; name: string } | null>(null);
  const [blk, setBlk] = useState<{ professionalId: string; from: string; to: string; allDay: boolean; start: string; end: string; reason: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => void qc.invalidateQueries({ queryKey: ['admin'] });

  const addHoliday = useMutation({
    mutationFn: (h: { date: string; name: string }) => api.admin.post('/holidays', h),
    onSuccess: () => { toast('Feriado agregado'); refresh(); setHol(null); },
    onError: (e) => setError(errText(e)),
  });
  const delHoliday = useMutation({
    mutationFn: (id: string) => api.admin.del(`/holidays/${id}`),
    onSuccess: () => { toast('Feriado quitado'); refresh(); },
    onError: (e) => toast(errText(e), true),
  });
  const addBlock = useMutation({
    mutationFn: (b: NonNullable<typeof blk>) =>
      api.admin.post('/blocks', {
        professionalId: b.professionalId || null,
        startsAt: toUtcIso(b.from, b.allDay ? 0 : parseHhmm(b.start), tz),
        endsAt: b.allDay ? toUtcIso(addDaysStr(b.to, 1), 0, tz) : toUtcIso(b.to, parseHhmm(b.end), tz),
        reason: b.reason || null,
      }),
    onSuccess: () => { toast('Bloqueo creado'); refresh(); setBlk(null); },
    onError: (e) => setError(errText(e)),
  });
  const delBlock = useMutation({
    mutationFn: (id: string) => api.admin.del(`/blocks/${id}`),
    onSuccess: () => { toast('Bloqueo quitado'); refresh(); },
    onError: (e) => toast(errText(e), true),
  });

  const today = todayStr(tz);
  const upcomingHolidays = (holidays.data ?? []).filter((h) => h.date >= today);

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div>
          <div className="eyebrow">Disponibilidad</div>
          <h1 className="display">Feriados y bloqueos</h1>
          <p className="muted small" style={{ marginTop: 6 }}>En estos momentos los clientes no pueden reservar.</p>
        </div>
      </div>

      <section className="stack">
        <div className="row between">
          <h2 className="display" style={{ fontSize: 24 }}>Bloqueos <span className="muted small">vacaciones, almuerzo, trámites</span></h2>
          <button className="btn primary" onClick={() => { setError(null); setBlk({ professionalId: isAdmin ? '' : (user?.professionalId ?? ''), from: today, to: today, allDay: false, start: '13:00', end: '14:00', reason: '' }); }}>
            <Plus size={17} /> Nuevo bloqueo
          </button>
        </div>
        {blocks.isError && <ErrorBox error={blocks.error} onRetry={() => blocks.refetch()} />}
        {blocks.isLoading && <Skeleton h={120} r={18} />}
        {blocks.data && blocks.data.length === 0 && (
          <div className="card">
            <Empty icon={<CalendarOff size={28} />} title="No hay bloqueos programados">Cargá vacaciones, pausas o cualquier momento en que alguien no atienda.</Empty>
          </div>
        )}
        {blocks.data && blocks.data.length > 0 && (
          <div className="card" style={{ padding: '4px 20px' }}>
            {blocks.data.map((b) => (
              <div key={b.id} className="list-row">
                <span className="dot" style={{ background: b.professional?.color ?? 'var(--muted)' }} />
                <div className="grow">
                  <div style={{ fontWeight: 700 }}>{b.reason ?? 'Bloqueado'}</div>
                  <div className="muted small">{b.professional?.name ?? 'Todo el negocio'} · {fmtDateTime(b.startsAt, tz)} → {fmtDateTime(b.endsAt, tz)}</div>
                </div>
                {(isAdmin || b.professionalId === user?.professionalId) && (
                  <button className="btn icon sm danger" onClick={() => delBlock.mutate(b.id)} aria-label="Quitar bloqueo"><Trash2 size={15} /></button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="stack">
        <div className="row between">
          <h2 className="display" style={{ fontSize: 24 }}>Feriados</h2>
          {isAdmin && (
            <button className="btn" onClick={() => { setError(null); setHol({ date: today, name: '' }); }}>
              <Plus size={17} /> Agregar feriado
            </button>
          )}
        </div>
        {holidays.isLoading && <Skeleton h={120} r={18} />}
        {holidays.data && upcomingHolidays.length === 0 && (
          <div className="card"><Empty icon={<CalendarOff size={28} />} title="Sin feriados próximos">Los días feriados que cargues se marcan como cerrados en la agenda y en la reserva.</Empty></div>
        )}
        {upcomingHolidays.length > 0 && (
          <div className="card" style={{ padding: '4px 20px' }}>
            {upcomingHolidays.map((h) => (
              <div key={h.id} className="list-row">
                <span className="badge warn">Cerrado</span>
                <div className="grow">
                  <div style={{ fontWeight: 700 }}>{h.name}</div>
                  <div className="muted small">{fmtDayLong(h.date + 'T12:00:00', tz)}</div>
                </div>
                {isAdmin && <button className="btn icon sm danger" onClick={() => delHoliday.mutate(h.id)} aria-label="Quitar feriado"><Trash2 size={15} /></button>}
              </div>
            ))}
          </div>
        )}
      </section>

      {hol && (
        <Modal title="Agregar feriado" onClose={() => setHol(null)} footer={<><button className="btn ghost" onClick={() => setHol(null)}>Cancelar</button><button className="btn primary" disabled={addHoliday.isPending || hol.name.trim().length < 2} onClick={() => addHoliday.mutate(hol)}>{addHoliday.isPending && <Spinner />} Guardar</button></>}>
          <div className="form-grid">
            <div className="field"><label htmlFor="hd">Fecha</label><input id="hd" type="date" className="input" value={hol.date} onChange={(e) => setHol({ ...hol, date: e.target.value })} /></div>
            <div className="field"><label htmlFor="hn">Nombre</label><input id="hn" className="input" value={hol.name} onChange={(e) => setHol({ ...hol, name: e.target.value })} placeholder="Ej. Día de la Bandera" /></div>
            {error && <div className="alert">{error}</div>}
          </div>
        </Modal>
      )}

      {blk && (
        <Modal title="Nuevo bloqueo" onClose={() => setBlk(null)} footer={<><button className="btn ghost" onClick={() => setBlk(null)}>Cancelar</button><button className="btn primary" disabled={addBlock.isPending} onClick={() => { setError(null); addBlock.mutate(blk); }}>{addBlock.isPending && <Spinner />} Guardar</button></>}>
          <div className="form-grid">
            {isAdmin && (
              <div className="field">
                <label htmlFor="bp">Quién</label>
                <select id="bp" className="select" value={blk.professionalId} onChange={(e) => setBlk({ ...blk, professionalId: e.target.value })}>
                  <option value="">Todo el negocio</option>
                  {(pros.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
            )}
            <label className="check"><input type="checkbox" checked={blk.allDay} onChange={(e) => setBlk({ ...blk, allDay: e.target.checked })} /> Días completos (vacaciones)</label>
            <div className="form-grid two">
              <div className="field"><label htmlFor="bf">{blk.allDay ? 'Desde el' : 'Día de inicio'}</label><input id="bf" type="date" className="input" value={blk.from} onChange={(e) => setBlk({ ...blk, from: e.target.value, to: blk.to < e.target.value ? e.target.value : blk.to })} /></div>
              <div className="field"><label htmlFor="bt">{blk.allDay ? 'Hasta el (inclusive)' : 'Día de fin'}</label><input id="bt" type="date" className="input" value={blk.to} min={blk.from} onChange={(e) => setBlk({ ...blk, to: e.target.value })} /></div>
            </div>
            {!blk.allDay && (
              <div className="form-grid two">
                <div className="field"><label htmlFor="bs">Hora de inicio</label><input id="bs" type="time" step={900} className="input" value={blk.start} onChange={(e) => setBlk({ ...blk, start: e.target.value })} /></div>
                <div className="field"><label htmlFor="be">Hora de fin</label><input id="be" type="time" step={900} className="input" value={blk.end} onChange={(e) => setBlk({ ...blk, end: e.target.value })} /></div>
              </div>
            )}
            <div className="field"><label htmlFor="br">Motivo</label><input id="br" className="input" placeholder="Ej. Vacaciones, Almuerzo, Trámite" value={blk.reason} onChange={(e) => setBlk({ ...blk, reason: e.target.value })} /></div>
            {error && <div className="alert" role="alert">{error}</div>}
          </div>
        </Modal>
      )}
    </div>
  );
}

