import React, { useEffect, useMemo } from 'react';
import { FieldValue, LangCode, WebFormDefinition, WebFormSubmission } from '../../../types';
import { LineItemState } from '../../types';
import { ReportLivePreview } from './ReportLivePreview';

export type SubmissionMeta = {
  id?: string;
  createdAt?: string;
  updatedAt?: string;
  status?: string | null;
};

export const SummaryView: React.FC<{
  definition: WebFormDefinition;
  language: LangCode;
  values: Record<string, FieldValue>;
  lineItems: LineItemState;
  lastSubmissionMeta: SubmissionMeta | null;
  recordLoadError: string | null;
  selectedRecordId: string;
  recordLoadingId: string | null;
  currentRecord: WebFormSubmission | null;
}> = ({
  definition,
  language,
  values,
  lineItems,
  lastSubmissionMeta,
  recordLoadError,
  selectedRecordId,
  recordLoadingId,
  currentRecord
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
          {recordLoadingId && <div className="status">Loading record…</div>}
        </div>
      )}

      <div className="card" style={{ padding: 16 }}>
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
      </div>
    </div>
  );
};


