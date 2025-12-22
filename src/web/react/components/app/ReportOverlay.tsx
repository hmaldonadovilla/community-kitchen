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
      leftAction={
        headerActions.length ? (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>{headerActions}</div>
        ) : undefined
      }
      rightAction={
        <button type="button" onClick={onClose} style={buttonStyles.secondary}>
          Close
        </button>
      }
    >
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {pdfPhase === 'rendering' ? (
          <div style={{ padding: 16 }} className="status">
            Generating PDF…
          </div>
        ) : null}
        {pdfPhase === 'error' ? (
          <div style={{ padding: 16 }} className="error">
            {pdfMessage || 'Failed to generate PDF.'}
          </div>
        ) : null}

        {pdfPhase === 'ready' && pdfObjectUrl ? (
          <div style={{ padding: 16 }} className="status">
            PDF ready. Use <strong>Open</strong> (or <strong>Download</strong>) above.
          </div>
        ) : null}
      </div>
    </FullPageOverlay>
  );
};


