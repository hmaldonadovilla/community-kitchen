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
  zIndex?: number;
}> = ({ open, title, message, zIndex = 12030 }) => {
  if (!open) return null;

  return (
    <div
      role="presentation"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex,
        background: 'rgba(15,23,42,0.46)',
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
        aria-busy={true}
        aria-label={title}
        style={{
          width: 'min(560px, 100%)',
          background: '#ffffff',
          borderRadius: 18,
          border: '1px solid rgba(15,23,42,0.14)',
          boxShadow: '0 30px 90px rgba(15,23,42,0.22)',
          padding: 18
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            aria-hidden="true"
            style={{
              width: 44,
              height: 44,
              borderRadius: 999,
              border: '5px solid rgba(15,23,42,0.14)',
              borderTopColor: '#2563eb',
              animation: 'ck-spin 0.9s linear infinite'
            }}
          />
          <div style={{ fontWeight: 900, fontSize: 44, letterSpacing: -0.2, color: '#0f172a' }}>{title}</div>
        </div>
        <div className="muted" style={{ marginTop: 10, fontSize: 30, fontWeight: 700, lineHeight: 1.35 }}>
          {(message || '').toString()}
        </div>
      </div>
    </div>
  );
};

