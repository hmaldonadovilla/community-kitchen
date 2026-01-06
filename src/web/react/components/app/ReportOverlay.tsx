import React from 'react';
import { buttonStyles } from '../form/ui';
import { FullPageOverlay } from '../form/overlays/FullPageOverlay';
import { MarkdownPreview } from './MarkdownPreview';
import { HtmlPreview } from './HtmlPreview';
import type { LangCode } from '../../../types';
import { tSystem } from '../../../systemStrings';

export type ReportOverlayState = {
  open: boolean;
  buttonId?: string;
  title: string;
  subtitle?: string;
  kind?: 'pdf' | 'markdown' | 'html';
  pdfPhase?: 'idle' | 'rendering' | 'ready' | 'error';
  pdfObjectUrl?: string;
  pdfFileName?: string;
  pdfMessage?: string;
  markdown?: string;
  html?: string;
};

export const ReportOverlay: React.FC<{
  language: LangCode;
  state: ReportOverlayState;
  onClose: () => void;
  onOpenFiles?: (fieldId: string) => void;
  onDiagnostic?: (event: string, payload?: Record<string, unknown>) => void;
}> = ({ state, language, onClose, onOpenFiles, onDiagnostic }) => {
  const {
    open,
    title,
    subtitle,
    pdfPhase,
    pdfMessage,
    pdfObjectUrl,
  } = state;
  if (!open) return null;

  const kind: 'pdf' | 'markdown' | 'html' =
    state.kind === 'markdown' ? 'markdown' : state.kind === 'html' ? 'html' : 'pdf';

  return (
    <FullPageOverlay
      open={open}
      zIndex={10030}
      title={title || tSystem('report.title', language, 'Report')}
      subtitle={subtitle}
      rightAction={
        <button type="button" onClick={onClose} style={buttonStyles.secondary}>
          {tSystem('common.close', language, 'Close')}
        </button>
      }
    >
      <div style={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex', flexDirection: 'column' }}>
        {pdfPhase === 'rendering' ? (
          <div style={{ padding: 16 }} className="status">
            {kind === 'pdf'
              ? tSystem('report.generatingPdf', language, 'Generating PDF…')
              : kind === 'markdown'
                ? tSystem('report.renderingMarkdown', language, 'Rendering…')
                : tSystem('report.renderingHtml', language, 'Rendering…')}
          </div>
        ) : null}
        {pdfPhase === 'error' ? (
          <div style={{ padding: 16 }} className="error">
            {pdfMessage ||
              (kind === 'pdf'
                ? tSystem('report.failedPdf', language, 'Failed to generate PDF.')
                : kind === 'markdown'
                  ? tSystem('report.failedMarkdown', language, 'Failed to render preview.')
                  : tSystem('report.failedHtml', language, 'Failed to render preview.'))}
          </div>
        ) : null}

        {kind === 'pdf' && pdfPhase === 'ready' && pdfObjectUrl ? (
          <div style={{ padding: 16, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ flex: 1, minHeight: 0 }}>
              <iframe
                title={title || tSystem('report.title', language, 'Report')}
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
            <div className="muted" style={{ fontSize: 14, fontWeight: 700 }}>
              <a href={pdfObjectUrl} target="_blank" rel="noopener noreferrer">
                {tSystem('summary.openPdf', language, tSystem('common.open', language, 'Open'))}
              </a>
            </div>
          </div>
        ) : null}

        {kind === 'markdown' && pdfPhase === 'ready' && state.markdown ? (
          <MarkdownPreview markdown={state.markdown} />
        ) : null}

        {kind === 'html' && pdfPhase === 'ready' && state.html ? (
          <HtmlPreview html={state.html} onOpenFiles={onOpenFiles} onDiagnostic={onDiagnostic} />
        ) : null}
      </div>
    </FullPageOverlay>
  );
};


