import React, { useMemo } from 'react';
import { buttonStyles } from '../form/ui';
import { FullPageOverlay } from '../form/overlays/FullPageOverlay';
import type { LangCode } from '../../../types';
import { tSystem } from '../../../systemStrings';

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
  language: LangCode;
  state: ReportOverlayState;
  onClose: () => void;
}> = ({ state, language, onClose }) => {
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
          {tSystem('common.open', language, 'Open')}
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
          {tSystem('common.download', language, 'Download')}
        </a>
      );
    }
    return actions;
  }, [language, pdfFileName, pdfObjectUrl]);

  return (
    <FullPageOverlay
      open={open}
      zIndex={10030}
      title={title || tSystem('report.title', language, 'Report')}
      subtitle={subtitle}
      leftAction={
        headerActions.length ? (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>{headerActions}</div>
        ) : undefined
      }
      rightAction={
        <button type="button" onClick={onClose} style={buttonStyles.secondary}>
          {tSystem('common.close', language, 'Close')}
        </button>
      }
    >
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {pdfPhase === 'rendering' ? (
          <div style={{ padding: 16 }} className="status">
            {tSystem('report.generatingPdf', language, 'Generating PDF…')}
          </div>
        ) : null}
        {pdfPhase === 'error' ? (
          <div style={{ padding: 16 }} className="error">
            {pdfMessage || tSystem('report.failedPdf', language, 'Failed to generate PDF.')}
          </div>
        ) : null}

        {pdfPhase === 'ready' && pdfObjectUrl ? (
          <div style={{ padding: 16 }} className="status">
            {tSystem('report.pdfReady', language, 'PDF ready. Use Open (or Download) above.')}
          </div>
        ) : null}
      </div>
    </FullPageOverlay>
  );
};


