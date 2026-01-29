import React from 'react';

/**
 * ConfirmDialogOverlay
 * --------------------
 * A reusable confirm/cancel modal dialog (backdrop can optionally dismiss).
 *
 * Owner: WebForm UI (React)
 */
export const ConfirmDialogOverlay: React.FC<{
  open: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  showCancel?: boolean;
  showConfirm?: boolean;
  dismissOnBackdrop?: boolean;
  showCloseButton?: boolean;
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
  dismissOnBackdrop = true,
  showCloseButton = true,
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
        onClick={dismissOnBackdrop ? onCancel : undefined}
        aria-disabled={!dismissOnBackdrop}
        style={{
          position: 'absolute',
          inset: 0,
          border: 0,
          padding: 0,
          margin: 0,
          background: 'rgba(15, 23, 42, 0.35)',
          cursor: dismissOnBackdrop ? 'pointer' : 'default'
        }}
      />
      <dialog
        open
        aria-label={title}
        aria-modal="true"
        style={{
          width: 'min(720px, 100%)',
          maxHeight: 'min(92vh, 980px)',
          margin: 0,
          background: '#ffffff',
          borderRadius: 12,
          border: '1px solid var(--border)',
          boxShadow: 'none',
          padding: 22,
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          fontFamily: 'var(--ck-font-family)',
          fontSize: 'var(--ck-font-base)',
          color: 'var(--text)'
        }}
      >
        {showCloseButton ? (
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
              top: 10,
              right: 10,
              width: 36,
              height: 36,
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: '#ffffff',
              color: 'var(--text)',
              fontWeight: 500,
              fontSize: 18,
              lineHeight: '1',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            ×
          </button>
        ) : null}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 'var(--ck-font-group-title)', fontWeight: 600, lineHeight: 1.2 }}>{title}</div>
          <div style={{ fontSize: 'var(--ck-font-control)', lineHeight: 1.4 }}>{message}</div>
        </div>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 4, flexWrap: 'wrap' }}>
          {showCancel ? (
            <button
              type="button"
              onClick={onCancel}
              style={{
                marginRight: 'auto',
                padding: '14px 18px',
                minHeight: 'var(--control-height)',
                borderRadius: 'var(--radius-control)',
                border: '1px solid var(--border)',
                background: '#ffffff',
                color: 'var(--text)',
                fontWeight: 500,
                fontSize: 'var(--ck-font-control)',
                lineHeight: 1.1,
                minWidth: 140
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
                padding: '14px 18px',
                minHeight: 'var(--control-height)',
                borderRadius: 'var(--radius-control)',
                border: '1px solid var(--accent)',
                background: 'var(--accent)',
                color: '#ffffff',
                fontWeight: 500,
                fontSize: 'var(--ck-font-control)',
                lineHeight: 1.1,
                minWidth: 140
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
