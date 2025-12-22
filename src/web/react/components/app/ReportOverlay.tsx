import React, { useMemo } from 'react';
import { buttonStyles } from '../form/ui';
import { FullPageOverlay } from '../form/overlays/FullPageOverlay';

export type ReportOverlayState = {
  open: boolean;
  buttonId?: string;
  title: string;
  subtitle?: string;
  pdfPhase?: 'idle' | 'rendering' | 'ready' | 'error';
  pdfObjectUrl?: string;
  pdfFileName?: string;
  pdfMessage?: string;
};

export const ReportOverlay: React.FC<{
  state: ReportOverlayState;
  onClose: () => void;
}> = ({ state, onClose }) => {
  const {
    open,
    title,
    subtitle,
    pdfPhase,
    pdfMessage,
    pdfObjectUrl,
    pdfFileName
  } = state;
  if (!open) return null;

  const headerActions = useMemo(() => {
    const actions: React.ReactNode[] = [];
    if (pdfObjectUrl) {
      actions.push(
        <a
          key="open"
          href={pdfObjectUrl}
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
          Open
        </a>
      );
      actions.push(
        <a
          key="download"
          href={pdfObjectUrl}
          download={pdfFileName || 'report.pdf'}
          style={{
            ...buttonStyles.secondary,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            textDecoration: 'none'
          }}
        >
          Download
        </a>
      );
    }
    return actions;
  }, [pdfFileName, pdfObjectUrl]);

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
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>{headerActions}</div>

        {pdfPhase === 'rendering' && <div className="status">Generating PDF…</div>}
        {pdfPhase === 'error' && <div className="error">{pdfMessage || 'Failed to generate PDF.'}</div>}

        {pdfPhase === 'ready' && pdfObjectUrl ? (
          <div style={{ flex: 1, minHeight: 0 }}>
            <iframe
              title={title || 'PDF preview'}
              src={pdfObjectUrl}
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
      </div>
    </FullPageOverlay>
  );
};


