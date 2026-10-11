import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, Pencil, Plus, Trash2, UserSquare2, X } from 'lucide-react';
import { api } from '../../lib/api';
import { hhmm, parseHhmm, WEEKDAYS } from '../../lib/format';
import type { AdminProfessional, AdminService, HoursRange } from '../../lib/types';
import { Avatar, Empty, ErrorBox, Modal, Skeleton, Spinner, errText, useToast } from '../../components/ui';
import { ConfirmModal } from '../../components/Confirm';
import { useBusiness } from '../../lib/business';

const COLORS = ['#C8895A', '#8FA3B8', '#A8B98A', '#C98BB0', '#D9B45A', '#7FB6B0', '#B58BD9', '#D9826B'];
const ORDER = [1, 2, 3, 4, 5, 6, 0]; // lunes a domingo

type Draft = {
  id?: string;
  name: string;
  bio: string;
  color: string;
  active: boolean;
  serviceIds: string[];
  hours: HoursRange[];
  account: { email: string; password: string } | null;
  hasAccount?: boolean;
};

export default function Professionals() {
  const qc = useQueryClient();
  const toast = useToast();
  const { business } = useBusiness();
  const label = business?.professionalLabel ?? 'Profesional';
  const pros = useQuery({ queryKey: ['admin', 'professionals'], queryFn: () => api.admin.get<AdminProfessional[]>('/professionals') });
  const services = useQuery({ queryKey: ['admin', 'services'], queryFn: () => api.admin.get<AdminService[]>('/services') });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [del, setDel] = useState<AdminProfessional | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['admin'] });
    void qc.invalidateQueries({ queryKey: ['professionals'] });
  };

  const newDraft = (): Draft => ({
    name: '',
    bio: '',
    color: COLORS[(pros.data?.length ?? 0) % COLORS.length],
    active: true,
    serviceIds: (services.data ?? []).filter((s) => s.active).map((s) => s.id),
    hours: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, startMinute: 9 * 60, endMinute: 18 * 60 })),
    account: null,
  });

  const save = useMutation({
    mutationFn: async (d: Draft) => {
      const body = { name: d.name, bio: d.bio || null, color: d.color, active: d.active, serviceIds: d.serviceIds, position: pros.data?.length ?? 0 };
      let id = d.id;
      if (id) await api.admin.put(`/professionals/${id}`, body);
      else {
        const created = await api.admin.post<AdminProfessional>('/professionals', { ...body, ...(d.account?.email ? { account: d.account } : {}) });
        id = created.id;
      }
      await api.admin.put(`/professionals/${id}/hours`, { hours: d.hours });
    },
    onSuccess: () => {
      toast(`${label} guardado`);
      refresh();
      setDraft(null);
    },
    onError: (e) => setError(errText(e)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.admin.del<{ deleted: boolean; deactivated: boolean }>(`/professionals/${id}`),
    onSuccess: (r) => {
      toast(r.deactivated ? 'Tenía turnos: se desactivó para conservar el historial' : 'Eliminado');
      refresh();
      setDel(null);
    },
    onError: (e) => {
      toast(errText(e), true);
      setDel(null);
    },
  });

  const edit = (p: AdminProfessional) => {
    setError(null);
    setDraft({ id: p.id, name: p.name, bio: p.bio ?? '', color: p.color, active: p.active, serviceIds: p.serviceIds, hours: p.hours, account: null, hasAccount: !!p.account });
  };

  const weekSummary = (p: AdminProfessional) => {
    const days = ORDER.filter((d) => p.hours.some((h) => h.weekday === d));
    return days.length ? days.map((d) => WEEKDAYS[d].slice(0, 3)).join(' · ') : 'Sin horarios cargados';
  };

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">Equipo</div>
          <h1 className="display">{business?.professionalPlural ?? 'Profesionales'} y horarios</h1>
        </div>
        <button className="btn primary" onClick={() => { setError(null); setDraft(newDraft()); }}>
          <Plus size={17} /> Agregar {label.toLowerCase()}
        </button>
      </div>

      {pros.isError && <ErrorBox error={pros.error} onRetry={() => pros.refetch()} />}
      {pros.isLoading && <Skeleton h={220} r={18} />}
      {pros.data && pros.data.length === 0 && (
        <div className="card">
          <Empty icon={<UserSquare2 size={30} />} title="Todavía no cargaste a nadie">
            Cada profesional tiene su propia agenda, servicios y horarios.
          </Empty>
        </div>
      )}
      <div className="team" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
        {pros.data?.map((p) => (
          <div key={p.id} className="card stack" style={{ opacity: p.active ? 1 : 0.55 }}>
            <div className="row">
              <Avatar name={p.name} color={p.color} photoUrl={p.photoUrl} size="lg" />
              <div className="grow">
                <div style={{ fontWeight: 800, fontSize: 18 }}>{p.name}</div>
                <div className="muted small">{p.bio}</div>
              </div>
            </div>
            <div className="small row" style={{ gap: 8 }}>
              <Clock size={15} className="muted" /> {weekSummary(p)}
            </div>
            <div className="row wrap" style={{ gap: 6 }}>
              <span className="badge">{p.serviceIds.length} servicios</span>
              {p.account ? <span className="badge info">Con usuario{p.account.isDemo ? ' (demo)' : ''}</span> : <span className="badge">Sin usuario</span>}
              {!p.active && <span className="badge warn">Inactivo</span>}
            </div>
            <div className="row">
              <button className="btn sm grow" onClick={() => edit(p)}>
                <Pencil size={14} /> Editar
              </button>
              <button className="btn sm danger icon" onClick={() => setDel(p)} aria-label={`Eliminar ${p.name}`}>
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {draft && (
        <Modal
          wide
          title={draft.id ? `Editar ${label.toLowerCase()}` : `Nuevo ${label.toLowerCase()}`}
          onClose={() => setDraft(null)}
          footer={
            <>
              <button className="btn ghost" onClick={() => setDraft(null)}>Cancelar</button>
              <button className="btn primary" disabled={save.isPending || draft.name.trim().length < 2} onClick={() => { setError(null); save.mutate(draft); }}>
                {save.isPending && <Spinner />} Guardar
              </button>
            </>
          }
        >
          <div className="form-grid">
            <div className="form-grid two">
              <div className="field">
                <label htmlFor="pn">Nombre</label>
                <input id="pn" className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              </div>
              <div className="field">
                <label>Color en la agenda</label>
                <div className="swatches">
                  {COLORS.map((c) => (
                    <button key={c} type="button" className={`swatch ${draft.color === c ? 'on' : ''}`} style={{ background: c }} onClick={() => setDraft({ ...draft, color: c })} aria-label={`Color ${c}`} />
                  ))}
                </div>
              </div>
            </div>
            <div className="field">
              <label htmlFor="pb">Presentación</label>
              <input id="pb" className="input" value={draft.bio} onChange={(e) => setDraft({ ...draft, bio: e.target.value })} />
            </div>

            <div className="field">
              <label>Servicios que realiza</label>
              <div className="row wrap">
                {(services.data ?? []).map((s) => (
                  <label key={s.id} className="check">
                    <input type="checkbox" checked={draft.serviceIds.includes(s.id)} onChange={(e) => setDraft({ ...draft, serviceIds: e.target.checked ? [...draft.serviceIds, s.id] : draft.serviceIds.filter((x) => x !== s.id) })} />
                    {s.name}
                  </label>
                ))}
              </div>
            </div>

            <div className="field">
              <label>Horarios de trabajo</label>
              <HoursEditor hours={draft.hours} onChange={(hours) => setDraft({ ...draft, hours })} />
            </div>

            {!draft.id && (
              <div className="card flat stack-sm">
                <div className="eyebrow">Acceso al panel (opcional)</div>
                <p className="muted small">Si le creás un usuario, podrá ver y gestionar solo su propia agenda.</p>
                <div className="form-grid two">
                  <input className="input" type="email" placeholder="Email" value={draft.account?.email ?? ''} onChange={(e) => setDraft({ ...draft, account: { email: e.target.value, password: draft.account?.password ?? '' } })} />
                  <input className="input" type="password" placeholder="Contraseña (mín. 8)" value={draft.account?.password ?? ''} onChange={(e) => setDraft({ ...draft, account: { email: draft.account?.email ?? '', password: e.target.value } })} />
                </div>
              </div>
            )}
            <label className="check">
              <input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />
              Activo (aparece para reservar)
            </label>
            {error && <div className="alert" role="alert">{error}</div>}
          </div>
        </Modal>
      )}

      {del && (
        <ConfirmModal title={`¿Eliminar a ${del.name}?`} danger confirmLabel="Eliminar" busy={remove.isPending} onConfirm={() => remove.mutate(del.id)} onClose={() => setDel(null)}>
          Si tiene turnos en el historial, se desactiva (no se pierden datos). Las cuentas de demo no se pueden eliminar.
        </ConfirmModal>
      )}
    </div>
  );
}

function HoursEditor({ hours, onChange }: { hours: HoursRange[]; onChange: (h: HoursRange[]) => void }) {
  const add = (weekday: number) => {
    const last = hours.filter((h) => h.weekday === weekday).sort((a, b) => b.endMinute - a.endMinute)[0];
    const start = last ? Math.min(last.endMinute + 60, 22 * 60) : 9 * 60;
    onChange([...hours, { weekday, startMinute: start, endMinute: Math.min(start + 180, 23 * 60) }]);
  };
  const update = (target: HoursRange, patch: Partial<HoursRange>) => onChange(hours.map((h) => (h === target ? { ...h, ...patch } : h)));
  return (
    <div className="hours-editor">
      {ORDER.map((wd) => {
        const ranges = hours.filter((h) => h.weekday === wd).sort((a, b) => a.startMinute - b.startMinute);
        return (
          <div key={wd} className="hours-day">
            <div style={{ fontWeight: 700, paddingTop: 8 }}>{WEEKDAYS[wd]}</div>
            <div className="hours-ranges">
              {ranges.length === 0 && (
                <div className="row" style={{ minHeight: 38 }}>
                  <span className="muted small">No trabaja</span>
                  <button type="button" className="btn sm ghost" onClick={() => add(wd)}>
                    <Plus size={14} /> Agregar franja
                  </button>
                </div>
              )}
              {ranges.map((r, i) => (
                <div key={i} className="range-row">
                  <input type="time" step={900} className="input" value={hhmm(r.startMinute)} onChange={(e) => update(r, { startMinute: parseHhmm(e.target.value) })} aria-label="Desde" />
                  <span className="muted">a</span>
                  <input type="time" step={900} className="input" value={hhmm(r.endMinute === 1440 ? 1439 : r.endMinute)} onChange={(e) => update(r, { endMinute: parseHhmm(e.target.value) })} aria-label="Hasta" />
                  <button type="button" className="btn icon sm ghost" onClick={() => onChange(hours.filter((h) => h !== r))} aria-label="Quitar franja">
                    <X size={15} />
                  </button>
                  {i === ranges.length - 1 && (
                    <button type="button" className="btn icon sm ghost" onClick={() => add(wd)} aria-label="Agregar otra franja (turno cortado)" title="Agregar otra franja">
                      <Plus size={15} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
