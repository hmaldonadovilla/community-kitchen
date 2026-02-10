import React from 'react';

/**
 * BlockingOverlay
 * ---------------
 * A full-screen, non-dismissible overlay that communicates "please wait"
 * and prevents user interaction while a critical action is running.
 *
 * Owner: WebForm UI (React)
 */
export const BlockingOverlay: React.FC<{
  open: boolean;
  title: string;
  message?: string;
  mode?: 'loading' | 'success' | 'error';
  zIndex?: number;
}> = ({ open, title, message, mode = 'loading', zIndex = 12030 }) => {
  if (!open) return null;
  const isLoading = mode === 'loading';
  const iconGlyph = mode === 'success' ? '✓' : mode === 'error' ? '!' : '';

  return (
    <div
      role="presentation"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex,
        background: 'rgba(0,0,0,0.2)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        cursor: 'wait'
      }}
    >
      <style>{`@keyframes ck-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      <div
        role="dialog"
        aria-modal="true"
        aria-busy={isLoading}
        aria-label={title}
        style={{
          width: 'min(560px, 100%)',
          background: 'var(--card)',
          borderRadius: 18,
          border: '1px solid var(--border)',
          boxShadow: 'none',
          padding: 18
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {isLoading ? (
            <div
              aria-hidden="true"
              style={{
                width: 44,
                height: 44,
                borderRadius: 999,
                border: '5px solid var(--border)',
                borderTopColor: 'var(--text)',
                animation: 'ck-spin 0.9s linear infinite'
              }}
            />
          ) : (
            <div
              aria-hidden="true"
              style={{
                width: 44,
                height: 44,
                borderRadius: 999,
                border: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 'var(--ck-font-group-title)',
                fontWeight: 600,
                lineHeight: 1
              }}
            >
              {iconGlyph}
            </div>
          )}
          <div style={{ fontWeight: 600, fontSize: 'var(--ck-font-group-title)', letterSpacing: 0, color: 'var(--text)' }}>{title}</div>
        </div>
        <div className="muted" style={{ marginTop: 10, fontSize: 'var(--ck-font-label)', fontWeight: 400, lineHeight: 1.35 }}>
          {(message || '').toString()}
        </div>
      </div>
    </div>
  );
};
