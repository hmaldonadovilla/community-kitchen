import React from 'react';

/**
 * ConfirmDialogOverlay
 * --------------------
 * A reusable confirm/cancel modal dialog.
 *
 * Owner: WebForm UI (React)
 */
export const ConfirmDialogOverlay: React.FC<{
  open: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  primaryAction?: 'confirm' | 'cancel';
  showCancel?: boolean;
  showConfirm?: boolean;
  dismissOnBackdrop?: boolean;
  showCloseButton?: boolean;
  zIndex?: number;
  onCancel: () => void | Promise<void>;
  onConfirm: () => void | Promise<void>;
}> = ({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  primaryAction: primaryActionProp,
  showCancel = true,
  showConfirm = true,
  dismissOnBackdrop = false,
  showCloseButton = false,
  zIndex = 12020,
  onCancel,
  onConfirm
}) => {
  const busyRef = React.useRef(false);
  const [busy, setBusy] = React.useState(false);
  const primaryAction = primaryActionProp === 'cancel' ? 'cancel' : 'confirm';
  const actionButtonTextStyle: React.CSSProperties = {
    whiteSpace: 'normal',
    overflowWrap: 'anywhere',
    wordBreak: 'break-word',
    textOverflow: 'clip',
    textAlign: 'left',
    maxWidth: '100%',
    minWidth: 0,
    flex: '1 1 220px'
  };

  const primaryButtonStyle: React.CSSProperties = {
    padding: '14px 18px',
    minHeight: 'var(--control-height)',
    borderRadius: 'var(--radius-control)',
    border: '1px solid var(--accent)',
    background: 'var(--accent)',
    color: 'var(--accentText)',
    fontWeight: 500,
    fontSize: 'var(--ck-font-control)',
    lineHeight: 1.1,
    minWidth: 140,
    ...actionButtonTextStyle
  };

  const secondaryButtonStyle: React.CSSProperties = {
    padding: '14px 18px',
    minHeight: 'var(--control-height)',
    borderRadius: 'var(--radius-control)',
    border: '1px solid var(--border)',
    background: 'var(--card)',
    color: 'var(--text)',
    fontWeight: 500,
    fontSize: 'var(--ck-font-control)',
    lineHeight: 1.1,
    minWidth: 140,
    ...actionButtonTextStyle
  };

  React.useEffect(() => {
    if (open) return;
    busyRef.current = false;
    setBusy(false);
  }, [open]);

  const runGuarded = React.useCallback(async (action: () => void | Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await action();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, []);

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
      {dismissOnBackdrop ? (
        <button
          type="button"
          aria-label="Close dialog"
          title="Close"
          onClick={!busy ? () => void runGuarded(onCancel) : undefined}
          disabled={busy}
          aria-disabled={busy}
          style={{
            position: 'absolute',
            inset: 0,
            border: 0,
            padding: 0,
            margin: 0,
            background: 'transparent',
            cursor: busy ? 'default' : 'pointer'
          }}
        />
      ) : (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0
          }}
        />
      )}
      <dialog
        open
        aria-label={title || 'Confirmation dialog'}
        aria-modal="true"
        onCancel={e => {
          // Prevent the native <dialog> element from closing itself on Escape.
          // When dismiss is allowed, route Escape to the provided onCancel handler instead.
          e.preventDefault();
          if (dismissOnBackdrop && !busy) void runGuarded(onCancel);
        }}
        style={{
          width: 'min(720px, 100%)',
          maxHeight: 'min(92vh, 980px)',
          margin: 0,
          background: 'var(--card)',
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
              if (busy) return;
              void runGuarded(onCancel);
            }}
            disabled={busy}
            style={{
              position: 'absolute',
              top: 10,
              right: 10,
              width: 36,
              height: 36,
              borderRadius: 8,
              border: '1px solid var(--border)',
              background: 'var(--card)',
              color: 'var(--text)',
              fontWeight: 500,
              fontSize: 'var(--ck-font-label)',
              lineHeight: '1',
              cursor: busy ? 'not-allowed' : 'pointer',
              opacity: busy ? 0.6 : 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            ×
          </button>
        ) : null}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {title ? <div style={{ fontSize: 'var(--ck-font-group-title)', fontWeight: 600, lineHeight: 1.2 }}>{title}</div> : null}
          <div style={{ fontSize: 'var(--ck-font-control)', lineHeight: 1.4 }}>{message}</div>
        </div>
        <div className="ck-dialog-actions" style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 4, flexWrap: 'wrap' }}>
          {showCancel ? (
            <button
              type="button"
              onClick={() => void runGuarded(onCancel)}
              disabled={busy}
              className="ck-dialog-action-button"
              style={{
                marginRight: 'auto',
                ...(primaryAction === 'cancel' ? primaryButtonStyle : secondaryButtonStyle),
                cursor: busy ? 'not-allowed' : 'pointer',
                opacity: busy ? 0.6 : 1
              }}
              autoFocus={primaryAction === 'cancel'}
            >
              {cancelLabel}
            </button>
          ) : null}
          {showConfirm ? (
            <button
              type="button"
              onClick={() => void runGuarded(onConfirm)}
              disabled={busy}
              className="ck-dialog-action-button"
              style={{
                ...(primaryAction === 'confirm' ? primaryButtonStyle : secondaryButtonStyle),
                cursor: busy ? 'not-allowed' : 'pointer',
                opacity: busy ? 0.6 : 1
              }}
              autoFocus={primaryAction === 'confirm'}
            >
              {confirmLabel}
            </button>
          ) : null}
        </div>
      </dialog>
    </div>
  );
};
