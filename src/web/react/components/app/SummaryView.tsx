import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FieldValue, LangCode, WebFormDefinition, WebFormSubmission } from '../../../types';
import { tSystem } from '../../../systemStrings';
import { LineItemState } from '../../types';
import { buildDraftPayload } from '../../app/submission';
import { renderSummaryHtmlTemplateApi } from '../../api';
import { HtmlPreview } from './HtmlPreview';
import { ReportLivePreview } from './ReportLivePreview';

export type SubmissionMeta = {
  id?: string;
  createdAt?: string;
  updatedAt?: string;
  status?: string | null;
};

export const SummaryView: React.FC<{
  definition: WebFormDefinition;
  formKey: string;
  language: LangCode;
  values: Record<string, FieldValue>;
  lineItems: LineItemState;
  lastSubmissionMeta: SubmissionMeta | null;
  recordLoadError: string | null;
  selectedRecordId: string;
  recordLoadingId: string | null;
  currentRecord: WebFormSubmission | null;
  onOpenFiles?: (fieldId: string) => void;
  onDiagnostic?: (event: string, payload?: Record<string, unknown>) => void;
}> = ({
  definition,
  formKey,
  language,
  values,
  lineItems,
  lastSubmissionMeta,
  recordLoadError,
  selectedRecordId,
  recordLoadingId,
  currentRecord,
  onOpenFiles,
  onDiagnostic
}) => {
  // Ensure we start at the top when switching from a scrolled form view (common on mobile).
  useEffect(() => {
    if (typeof globalThis.scrollTo !== 'function') return;
    // Use the simplest signature to avoid cross-browser option parsing quirks.
    globalThis.scrollTo(0, 0);
  }, []);

  const existingRecordId = useMemo(
    () => lastSubmissionMeta?.id || currentRecord?.id || selectedRecordId || undefined,
    [currentRecord?.id, lastSubmissionMeta?.id, selectedRecordId]
  );

  const useSummaryHtml = Boolean(definition.summaryHtmlTemplateId);
  const [summaryHtml, setSummaryHtml] = useState<{ phase: 'idle' | 'rendering' | 'ready' | 'error'; html?: string; message?: string }>(
    () => ({ phase: 'idle' })
  );
  const seqRef = useRef(0);

  useEffect(() => {
    if (!useSummaryHtml) return;
    if (recordLoadingId) return;
    const seq = ++seqRef.current;
    setSummaryHtml({ phase: 'rendering' });
    const draft = buildDraftPayload({
      definition,
      formKey,
      language,
      values,
      lineItems,
      existingRecordId
    });
    onDiagnostic?.('summary.htmlTemplate.render.start', { recordId: existingRecordId || null });
    renderSummaryHtmlTemplateApi(draft)
      .then(res => {
        if (seq !== seqRef.current) return;
        if (!res?.success || !res?.html) {
          const msg = (res?.message || 'Failed to render summary.').toString();
          setSummaryHtml({ phase: 'error', message: msg });
          onDiagnostic?.('summary.htmlTemplate.render.error', { message: msg });
          return;
        }
        setSummaryHtml({ phase: 'ready', html: res.html });
        onDiagnostic?.('summary.htmlTemplate.render.ok', { htmlLength: (res.html || '').toString().length });
      })
      .catch(err => {
        if (seq !== seqRef.current) return;
        const msg = (err as any)?.message?.toString?.() || (err as any)?.toString?.() || 'Failed to render summary.';
        setSummaryHtml({ phase: 'error', message: msg });
        onDiagnostic?.('summary.htmlTemplate.render.exception', { message: msg });
      });
  }, [definition, existingRecordId, formKey, language, lineItems, onDiagnostic, recordLoadingId, useSummaryHtml, values]);

  return (
    <div
      className="ck-summary-view"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        flex: 1,
        minHeight: 0
      }}
    >
      {(recordLoadError || recordLoadingId) && (
        <div className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {recordLoadError && <div className="error">{recordLoadError}</div>}
          {recordLoadingId && <div className="status">{tSystem('summary.loadingRecord', language, 'Loading record…')}</div>}
        </div>
      )}

      <div className="card" style={{ padding: 16 }}>
        {useSummaryHtml ? (
          <>
            {summaryHtml.phase === 'rendering' ? (
              <div className="status" style={{ marginBottom: 12 }}>
                {tSystem('report.renderingHtml', language, 'Rendering…')}
              </div>
            ) : null}
            {summaryHtml.phase === 'error' ? (
              <div className="error" style={{ marginBottom: 12 }}>
                {summaryHtml.message || tSystem('report.failedHtml', language, 'Failed to render preview.')}
              </div>
            ) : null}
            {summaryHtml.phase === 'ready' && summaryHtml.html ? (
              <HtmlPreview html={summaryHtml.html} onOpenFiles={onOpenFiles} onDiagnostic={onDiagnostic} />
            ) : summaryHtml.phase === 'error' ? (
              // Fallback: show default Summary view if template rendering fails.
              <ReportLivePreview
                definition={definition}
                language={language}
                values={values}
                lineItems={lineItems}
                recordMeta={{
                  id: existingRecordId,
                  status: currentRecord?.status || lastSubmissionMeta?.status || null,
                  createdAt: currentRecord?.createdAt || lastSubmissionMeta?.createdAt,
                  updatedAt: currentRecord?.updatedAt || lastSubmissionMeta?.updatedAt,
                  pdfUrl: currentRecord?.pdfUrl || undefined
                }}
              />
            ) : null}
          </>
        ) : (
          <ReportLivePreview
            definition={definition}
            language={language}
            values={values}
            lineItems={lineItems}
            recordMeta={{
              id: existingRecordId,
              status: currentRecord?.status || lastSubmissionMeta?.status || null,
              createdAt: currentRecord?.createdAt || lastSubmissionMeta?.createdAt,
              updatedAt: currentRecord?.updatedAt || lastSubmissionMeta?.updatedAt,
              pdfUrl: currentRecord?.pdfUrl || undefined
            }}
          />
        )}
      </div>
    </div>
  );
};


