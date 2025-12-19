import React from 'react';
import { createPortal } from 'react-dom';

export type FullPageOverlayProps = {
  open: boolean;
  title: string;
  subtitle?: string;
  zIndex?: number;
  leftAction?: React.ReactNode;
  rightAction?: React.ReactNode;
  children: React.ReactNode;
};

export const FullPageOverlay: React.FC<FullPageOverlayProps> = ({
  open,
  title,
  subtitle,
  zIndex = 10000,
  leftAction,
  rightAction,
  children
}) => {
  if (!open) return null;
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="webform-overlay"
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        background: '#ffffff',
        zIndex,
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      <div
        style={{
          padding: 16,
          borderBottom: '1px solid #e5e7eb',
          background: '#ffffff',
          boxShadow: '0 10px 30px rgba(15,23,42,0.08)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1, width: '100%' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)',
                alignItems: 'center',
                gap: 12
              }}
            >
              <div style={{ justifySelf: 'start' }}>{leftAction}</div>
              <div style={{ textAlign: 'center' }}>
            <div style={{ fontWeight: 900, fontSize: 40, color: '#0f172a', letterSpacing: -0.4 }}>{title}</div>
            {subtitle ? (
              <div className="muted" style={{ fontWeight: 700, marginTop: 8, fontSize: 24 }}>
                {subtitle}
              </div>
            ) : null}
              </div>
              <div style={{ justifySelf: 'end' }}>{rightAction}</div>
            </div>
          </div>
        </div>
      </div>
      {children}
    </div>,
    document.body
  );
};


