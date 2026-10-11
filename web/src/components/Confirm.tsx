import { Modal, Spinner } from './ui';

export function ConfirmModal({ title, children, confirmLabel = 'Confirmar', danger, busy, onConfirm, onClose }: { title: string; children: React.ReactNode; confirmLabel?: string; danger?: boolean; busy?: boolean; onConfirm: () => void; onClose: () => void }) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className={`btn ${danger ? 'danger' : 'primary'}`} disabled={busy} onClick={onConfirm}>
            {busy && <Spinner />} {confirmLabel}
          </button>
        </>
      }
    >
      <p>{children}</p>
    </Modal>
  );
}
