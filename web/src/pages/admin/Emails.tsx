import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Inbox } from 'lucide-react';
import { api } from '../../lib/api';
import { useBusiness } from '../../lib/business';
import { fmtDateTime } from '../../lib/format';
import type { EmailLogRow } from '../../lib/types';
import { Empty, ErrorBox, Modal, Skeleton } from '../../components/ui';

export default function Emails() {
  const { business } = useBusiness();
  const q = useQuery({ queryKey: ['admin', 'emails'], queryFn: () => api.admin.get<EmailLogRow[]>('/emails'), refetchInterval: 20_000 });
  const [open, setOpen] = useState<EmailLogRow | null>(null);

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">Notificaciones</div>
          <h1 className="display">Bandeja de emails</h1>
          <p className="muted small" style={{ marginTop: 6 }}>
            {business?.demoMode ? 'En la demo los emails no se envían a nadie: se guardan y se muestran acá.' : 'Registro de los últimos emails generados por el sistema.'}
          </p>
        </div>
      </div>
      {q.isError && <ErrorBox error={q.error} onRetry={() => q.refetch()} />}
      {q.isLoading && <Skeleton h={240} r={18} />}
      {q.data && q.data.length === 0 && (
        <div className="card">
          <Empty icon={<Inbox size={30} />} title="Todavía no se generó ningún email">
            Hacé una reserva de prueba desde el sitio público y vas a ver la confirmación acá.
          </Empty>
        </div>
      )}
      {q.data && q.data.length > 0 && (
        <div className="card" style={{ padding: '4px 20px' }}>
          {q.data.map((e) => (
            <button key={e.id} className="list-row" style={{ width: '100%', background: 'none', border: 0, borderBottom: '1px solid var(--line)', textAlign: 'left', color: 'inherit' }} onClick={() => setOpen(e)}>
              <div className="grow">
                <div style={{ fontWeight: 700 }}>{e.subject}</div>
                <div className="muted small">Para {e.to}</div>
              </div>
              <span className="badge">{e.sent ? 'Enviado' : 'Solo guardado'}</span>
              <span className="muted small nowrap">{fmtDateTime(e.createdAt, business?.timezone)}</span>
            </button>
          ))}
        </div>
      )}
      {open && (
        <Modal title={open.subject} wide onClose={() => setOpen(null)}>
          <p className="muted small" style={{ marginBottom: 10 }}>
            Para: <b>{open.to}</b>
          </p>
          <iframe className="email-frame" title="Email" sandbox="" srcDoc={open.html} />
        </Modal>
      )}
    </div>
  );
}
