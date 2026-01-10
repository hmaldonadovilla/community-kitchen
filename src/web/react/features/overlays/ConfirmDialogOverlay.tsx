import React from 'react';

/**
 * ConfirmDialogOverlay
 * --------------------
 * A reusable confirm/cancel modal dialog (clicking the backdrop cancels).
 *
 * Owner: WebForm UI (React)
 */
export const ConfirmDialogOverlay: React.FC<{
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  zIndex?: number;
  onCancel: () => void;
  onConfirm: () => void;
}> = ({ open, title, message, confirmLabel, cancelLabel, zIndex = 12020, onCancel, onConfirm }) => {
  if (!open) return null;

  return (
    <div
      role="presentation"
      onClick={onCancel}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex,
        background: 'rgba(15,23,42,0.46)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(560px, 100%)',
          background: '#ffffff',
          borderRadius: 18,
          border: '1px solid rgba(15,23,42,0.14)',
          boxShadow: '0 30px 90px rgba(15,23,42,0.22)',
          padding: 18
        }}
      >
        <div style={{ fontWeight: 900, fontSize: 48, letterSpacing: -0.2, color: '#0f172a' }}>{title}</div>
        <div className="muted" style={{ marginTop: 10, fontSize: 32, fontWeight: 700, lineHeight: 1.35 }}>
          {message}
        </div>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 18, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={onCancel}
            style={{
              padding: '10px 14px',
              borderRadius: 12,
              border: '1px solid rgba(15, 23, 42, 0.18)',
              background: 'rgba(15,23,42,0.06)',
              color: '#0f172a',
              fontWeight: 900,
              minWidth: 110
            }}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            style={{
              padding: '10px 14px',
              borderRadius: 12,
              border: '1px solid rgba(59,130,246,0.35)',
              background: '#2563eb',
              color: '#ffffff',
              fontWeight: 900
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

