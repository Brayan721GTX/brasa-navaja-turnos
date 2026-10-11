import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Scissors, Trash2 } from 'lucide-react';
import { api } from '../../lib/api';
import { duration, money } from '../../lib/format';
import type { AdminProfessional, AdminService } from '../../lib/types';
import { Empty, ErrorBox, Modal, Skeleton, Spinner, errText, useToast } from '../../components/ui';
import { ConfirmModal } from '../../components/Confirm';

type Draft = Omit<AdminService, 'id'> & { id?: string };
const blank = (pros: AdminProfessional[]): Draft => ({ name: '', description: '', durationMin: 30, price: 10000, category: '', active: true, position: 0, professionalIds: pros.map((p) => p.id) });

export default function Services() {
  const qc = useQueryClient();
  const toast = useToast();
  const services = useQuery({ queryKey: ['admin', 'services'], queryFn: () => api.admin.get<AdminService[]>('/services') });
  const pros = useQuery({ queryKey: ['admin', 'professionals'], queryFn: () => api.admin.get<AdminProfessional[]>('/professionals') });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [del, setDel] = useState<AdminService | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['admin', 'services'] });
    void qc.invalidateQueries({ queryKey: ['services'] });
  };

  const save = useMutation({
    mutationFn: (d: Draft) => {
      const body = { ...d, description: d.description || null, category: d.category || null };
      return d.id ? api.admin.put(`/services/${d.id}`, body) : api.admin.post('/services', body);
    },
    onSuccess: () => {
      toast('Servicio guardado');
      refresh();
      setDraft(null);
    },
    onError: (e) => setError(errText(e)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.admin.del<{ deleted: boolean; deactivated: boolean }>(`/services/${id}`),
    onSuccess: (r) => {
      toast(r.deactivated ? 'Tenía turnos: se desactivó para conservar el historial' : 'Servicio eliminado');
      refresh();
      setDel(null);
    },
    onError: (e) => toast(errText(e), true),
  });

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">Catálogo</div>
          <h1 className="display">Servicios</h1>
        </div>
        <button className="btn primary" onClick={() => { setError(null); setDraft(blank(pros.data ?? [])); }}>
          <Plus size={17} /> Nuevo servicio
        </button>
      </div>

      {services.isError && <ErrorBox error={services.error} onRetry={() => services.refetch()} />}
      {services.isLoading && <Skeleton h={300} r={18} />}
      {services.data && services.data.length === 0 && (
        <div className="card">
          <Empty icon={<Scissors size={30} />} title="Todavía no hay servicios" action={<button className="btn primary" onClick={() => setDraft(blank(pros.data ?? []))}>Crear el primero</button>}>
            Cargá lo que ofrecés, con su duración y precio. Es lo que verán tus clientes al reservar.
          </Empty>
        </div>
      )}
      {services.data && services.data.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Servicio</th>
                <th>Duración</th>
                <th>Precio</th>
                <th>Equipo</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {services.data.map((s) => (
                <tr key={s.id}>
                  <td>
                    <div style={{ fontWeight: 700 }}>{s.name}</div>
                    <div className="muted tiny">{s.category}</div>
                  </td>
                  <td>{duration(s.durationMin)}</td>
                  <td className="display accent" style={{ fontSize: 17 }}>{money(s.price)}</td>
                  <td>
                    <div className="row" style={{ gap: 4 }}>
                      {(pros.data ?? []).filter((p) => s.professionalIds.includes(p.id)).map((p) => (
                        <span key={p.id} className="dot" style={{ background: p.color }} title={p.name} />
                      ))}
                    </div>
                  </td>
                  <td>{s.active ? <span className="badge ok">Activo</span> : <span className="badge">Inactivo</span>}</td>
                  <td>
                    <div className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
                      <button className="btn icon sm" onClick={() => { setError(null); setDraft({ ...s }); }} aria-label={`Editar ${s.name}`}>
                        <Pencil size={15} />
                      </button>
                      <button className="btn icon sm danger" onClick={() => setDel(s)} aria-label={`Eliminar ${s.name}`}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {draft && (
        <Modal
          title={draft.id ? 'Editar servicio' : 'Nuevo servicio'}
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
            <div className="field">
              <label htmlFor="sn">Nombre</label>
              <input id="sn" className="input" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </div>
            <div className="field">
              <label htmlFor="sd">Descripción</label>
              <input id="sd" className="input" value={draft.description ?? ''} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
            </div>
            <div className="form-grid three">
              <div className="field">
                <label htmlFor="sdu">Duración (min)</label>
                <input id="sdu" type="number" min={5} step={5} className="input" value={draft.durationMin} onChange={(e) => setDraft({ ...draft, durationMin: Number(e.target.value) })} />
              </div>
              <div className="field">
                <label htmlFor="sp">Precio ($)</label>
                <input id="sp" type="number" min={0} step={500} className="input" value={draft.price} onChange={(e) => setDraft({ ...draft, price: Number(e.target.value) })} />
              </div>
              <div className="field">
                <label htmlFor="sc">Categoría</label>
                <input id="sc" className="input" value={draft.category ?? ''} onChange={(e) => setDraft({ ...draft, category: e.target.value })} />
              </div>
            </div>
            <div className="field">
              <label>Quién lo realiza</label>
              <div className="row wrap">
                {(pros.data ?? []).map((p) => (
                  <label key={p.id} className="check">
                    <input
                      type="checkbox"
                      checked={draft.professionalIds.includes(p.id)}
                      onChange={(e) => setDraft({ ...draft, professionalIds: e.target.checked ? [...draft.professionalIds, p.id] : draft.professionalIds.filter((x) => x !== p.id) })}
                    />
                    {p.name}
                  </label>
                ))}
              </div>
            </div>
            <label className="check">
              <input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />
              Visible para reservar
            </label>
            {error && <div className="alert" role="alert">{error}</div>}
          </div>
        </Modal>
      )}

      {del && (
        <ConfirmModal title="¿Eliminar servicio?" danger confirmLabel="Eliminar" busy={remove.isPending} onConfirm={() => remove.mutate(del.id)} onClose={() => setDel(null)}>
          Vas a eliminar <b>{del.name}</b>. Si ya tiene turnos, se desactiva para no perder el historial ni las estadísticas.
        </ConfirmModal>
      )}
    </div>
  );
}
