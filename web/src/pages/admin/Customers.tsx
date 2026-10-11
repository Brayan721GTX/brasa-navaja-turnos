import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, Users } from 'lucide-react';
import { api } from '../../lib/api';
import { useBusiness } from '../../lib/business';
import { fmtDateTime, money, waLink } from '../../lib/format';
import type { CustomerDetail, CustomerRow } from '../../lib/types';
import { Empty, ErrorBox, Modal, Skeleton, Spinner, StatusBadge, useToast } from '../../components/ui';

export default function Customers() {
  const { business } = useBusiness();
  const tz = business?.timezone;
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  const list = useQuery({ queryKey: ['admin', 'customers', debounced], queryFn: () => api.admin.get<CustomerRow[]>(`/customers${debounced ? `?q=${encodeURIComponent(debounced)}` : ''}`) });

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">Fichas</div>
          <h1 className="display">Clientes</h1>
        </div>
        <div style={{ position: 'relative', width: 'min(320px, 100%)' }}>
          <Search size={16} className="muted" style={{ position: 'absolute', left: 14, top: 15 }} />
          <input className="input" style={{ paddingLeft: 38 }} placeholder="Buscar por nombre, teléfono o email" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar clientes" />
        </div>
      </div>

      {list.isError && <ErrorBox error={list.error} onRetry={() => list.refetch()} />}
      {list.isLoading && <Skeleton h={320} r={18} />}
      {list.data && list.data.length === 0 && (
        <div className="card">
          <Empty icon={<Users size={30} />} title={debounced ? 'No encontramos a nadie' : 'Todavía no hay clientes'}>
            {debounced ? 'Probá con otro nombre o parte del teléfono.' : 'Se crean solos cuando alguien reserva un turno.'}
          </Empty>
        </div>
      )}
      {list.data && list.data.length > 0 && (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Contacto</th>
                <th>Turnos</th>
                <th>Gastado</th>
                <th>Última visita</th>
              </tr>
            </thead>
            <tbody>
              {list.data.map((c) => (
                <tr key={c.id} className="click" onClick={() => setOpenId(c.id)}>
                  <td style={{ fontWeight: 700 }}>{c.name}</td>
                  <td>
                    <div>{c.phone}</div>
                    <div className="muted tiny">{c.email}</div>
                  </td>
                  <td>
                    {c.totalAppointments}
                    {c.cancelled > 0 && <span className="badge danger" style={{ marginLeft: 8 }}>{c.cancelled} canc.</span>}
                  </td>
                  <td>{money(c.totalSpent)}</td>
                  <td className="muted">{c.lastVisit ? fmtDateTime(c.lastVisit, tz) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {openId && <CustomerModal id={openId} tz={tz} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function CustomerModal({ id, tz, onClose }: { id: string; tz?: string; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { business } = useBusiness();
  const q = useQuery({ queryKey: ['admin', 'customer', id], queryFn: () => api.admin.get<CustomerDetail>(`/customers/${id}`) });
  const [notes, setNotes] = useState<string | null>(null);
  const c = q.data;
  const value = notes ?? c?.notes ?? '';

  const save = useMutation({
    mutationFn: () => api.admin.patch(`/customers/${id}`, { notes: value || null }),
    onSuccess: () => {
      toast('Notas guardadas');
      void qc.invalidateQueries({ queryKey: ['admin', 'customers'] });
      void qc.invalidateQueries({ queryKey: ['admin', 'customer', id] });
      setNotes(null);
    },
  });

  const wa = c && waLink('549' + c.phone.replace(/\D/g, '').replace(/^549?/, ''), `Hola ${c.name.split(' ')[0]}! Te escribimos de ${business?.name ?? ''}.`);

  return (
    <Modal title={c?.name ?? 'Cliente'} wide onClose={onClose}>
      {q.isLoading && <Skeleton h={220} r={14} />}
      {q.isError && <ErrorBox error={q.error} />}
      {c && (
        <div className="stack">
          <div className="row between wrap">
            <div className="muted small">
              {c.phone}
              {c.email ? ` · ${c.email}` : ''}
            </div>
            {wa && (
              <a className="btn sm" href={wa} target="_blank" rel="noreferrer">
                WhatsApp
              </a>
            )}
          </div>
          <div className="field">
            <label htmlFor="cn">Notas (preferencias, alergias, estilo habitual)</label>
            <textarea id="cn" className="textarea" value={value} maxLength={500} onChange={(e) => setNotes(e.target.value)} />
            {notes !== null && notes !== (c.notes ?? '') && (
              <div>
                <button className="btn sm primary" disabled={save.isPending} onClick={() => save.mutate()}>
                  {save.isPending && <Spinner />} Guardar notas
                </button>
              </div>
            )}
          </div>
          <div className="eyebrow">Historial · {c.history.length} turnos</div>
          <div style={{ maxHeight: 300, overflow: 'auto' }}>
            {c.history.map((h) => (
              <div key={h.id} className="list-row">
                <div className="grow">
                  <div style={{ fontWeight: 700 }}>{h.service}</div>
                  <div className="muted small">
                    {fmtDateTime(h.startsAt, tz)} · {h.professional}
                  </div>
                </div>
                <span className="small">{money(h.price)}</span>
                <StatusBadge status={h.status} />
              </div>
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}
