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
  showCancel?: boolean;
  showConfirm?: boolean;
  zIndex?: number;
  onCancel: () => void;
  onConfirm: () => void;
}> = ({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  showCancel = true,
  showConfirm = true,
  zIndex = 12020,
  onCancel,
  onConfirm
}) => {
  if (!open) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex,
        background: 'transparent',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        boxSizing: 'border-box'
      }}
    >
      <button
        type="button"
        aria-label="Close dialog"
        title="Close"
        onClick={onCancel}
        style={{
          position: 'absolute',
          inset: 0,
          border: 0,
          padding: 0,
          margin: 0,
          background: 'rgba(15,23,42,0.46)',
          cursor: 'pointer'
        }}
      />
      <dialog
        open
        aria-label={title}
        aria-modal="true"
        style={{
          width: 'min(760px, 100%)',
          minHeight: 'min(360px, 92vh)',
          maxHeight: 'min(92vh, 980px)',
          margin: 0,
          background: '#ffffff',
          borderRadius: 18,
          border: '1px solid rgba(15,23,42,0.14)',
          boxShadow: '0 30px 90px rgba(15,23,42,0.22)',
          padding: 26,
          position: 'relative',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        <button
          type="button"
          aria-label="Close dialog"
          title="Close"
          onClick={e => {
            e.stopPropagation();
            onCancel();
          }}
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            width: 44,
            height: 44,
            borderRadius: 999,
            border: '1px solid rgba(220,38,38,0.40)',
            background: 'rgba(220,38,38,0.10)',
            color: '#dc2626',
            fontWeight: 900,
            fontSize: 26,
            lineHeight: '1',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          ×
        </button>

        <div style={{ fontWeight: 900, fontSize: 48, letterSpacing: -0.2, color: '#0f172a', paddingRight: 56 }}>
          {title}
        </div>
        <div
          className="muted"
          style={{
            marginTop: 18,
            fontSize: 32,
            fontWeight: 700,
            lineHeight: 1.35,
            flex: '1 1 auto',
            minHeight: 0,
            overflowY: 'auto',
            paddingRight: 6
          }}
        >
          {message}
        </div>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 26, flexWrap: 'wrap' }}>
          {showCancel ? (
            <button
              type="button"
              onClick={onCancel}
              style={{
                marginRight: 'auto',
                padding: '10px 14px',
                borderRadius: 12,
                border: '1px solid rgba(15, 23, 42, 0.18)',
                background: 'rgba(15,23,42,0.06)',
                color: '#0f172a',
                fontWeight: 600,
                minWidth: 110
              }}
            >
              {cancelLabel}
            </button>
          ) : null}
          {showConfirm ? (
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
          ) : null}
        </div>
      </dialog>
    </div>
  );
};
