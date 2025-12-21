import React from 'react';
import { buttonStyles } from '../form/ui';
import { FullPageOverlay } from '../form/overlays/FullPageOverlay';

export type ReportOverlayState = {
  open: boolean;
  buttonId?: string;
  title: string;
  subtitle?: string;
  phase: 'idle' | 'rendering' | 'ready' | 'error';
  pdfUrl?: string;
  fileId?: string;
  message?: string;
};

export const ReportOverlay: React.FC<{
  state: ReportOverlayState;
  onClose: () => void;
}> = ({ state, onClose }) => {
  const { open, title, subtitle, phase, pdfUrl, fileId, message } = state;
  if (!open) return null;

  const previewUrl = fileId ? `https://drive.google.com/file/d/${fileId}/preview` : '';

  return (
    <FullPageOverlay
      open={open}
      zIndex={10030}
      title={title || 'Report'}
      subtitle={subtitle}
      rightAction={
        <button type="button" onClick={onClose} style={buttonStyles.secondary}>
          Close
        </button>
      }
    >
      <div style={{ padding: 16, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {phase === 'rendering' && <div className="status">Rendering…</div>}
        {phase === 'error' && <div className="error">{message || 'Failed to render report.'}</div>}

        {phase === 'ready' && (pdfUrl || fileId) && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {pdfUrl ? (
              <a
                href={pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  ...buttonStyles.secondary,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textDecoration: 'none'
                }}
              >
                Open PDF
              </a>
            ) : null}
            {fileId ? (
              <a
                href={previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  ...buttonStyles.secondary,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  textDecoration: 'none'
                }}
              >
                Open preview
              </a>
            ) : null}
          </div>
        )}

        {phase === 'ready' && fileId ? (
          <div style={{ flex: 1, minHeight: 0 }}>
            <iframe
              title={title || 'Report preview'}
              src={previewUrl}
              style={{
                width: '100%',
                height: '100%',
                border: '1px solid rgba(148,163,184,0.45)',
                borderRadius: 16,
                background: '#ffffff'
              }}
            />
          </div>
        ) : null}

        {phase === 'ready' && !fileId && pdfUrl ? (
          <div className="muted">Preview not available. Use “Open PDF”.</div>
        ) : null}
      </div>
    </FullPageOverlay>
  );
};


