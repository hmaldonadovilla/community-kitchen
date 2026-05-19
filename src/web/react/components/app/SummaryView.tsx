import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FieldValue, LangCode, WebFormDefinition, WebFormSubmission } from '../../../types';
import { tSystem } from '../../../systemStrings';
import { LineItemState } from '../../types';
import { buildDraftPayload } from '../../app/submission';
import { peekSummaryHtmlTemplateCache, renderSummaryHtmlTemplateApi } from '../../api';
import {
  clearBundledHtmlClientCaches,
  isBundledHtmlTemplateId,
  renderBundledHtmlTemplateClient
} from '../../app/bundledHtmlClientRenderer';
import {
  DATA_SOURCE_CACHE_CLEARED_EVENT,
  DATA_SOURCE_CACHE_UPDATED_EVENT
} from '../../../data/dataSources';
import { shouldShowSummaryLoadingCard } from '../../app/recordOpenState';
import { resolveTemplateIdForRecord } from '../../app/templateId';
import { HtmlPreview } from './HtmlPreview';
import type { HtmlPreviewActionContext } from './htmlPreviewActionContext';
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
  prefetchedSummaryHtml?: string | null;
  onOpenFiles?: (fieldId: string) => void;
  onAction?: (actionId: string, context?: HtmlPreviewActionContext) => void;
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
  prefetchedSummaryHtml,
  onOpenFiles,
  onAction,
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
  const [summaryHtml, setSummaryHtml] = useState<{
    phase: 'idle' | 'rendering' | 'ready' | 'error';
    html?: string;
    message?: string;
    allowScripts?: boolean;
  }>(
    () => ({ phase: 'idle' })
  );
  const seqRef = useRef(0);
  const [dataSourceCacheVersion, setDataSourceCacheVersion] = useState(0);

  const draft = useMemo(() => {
    if (!useSummaryHtml || recordLoadingId) return null;
    const next = buildDraftPayload({
      definition,
      formKey,
      language,
      values,
      lineItems,
      existingRecordId
    });
    const statusMeta = {
      status: currentRecord?.status || lastSubmissionMeta?.status || null,
      createdAt: currentRecord?.createdAt || lastSubmissionMeta?.createdAt,
      updatedAt: currentRecord?.updatedAt || lastSubmissionMeta?.updatedAt,
      pdfUrl: currentRecord?.pdfUrl || undefined
    };
    if (statusMeta.status !== undefined && statusMeta.status !== null) {
      (next as any).status = statusMeta.status;
    }
    if (statusMeta.createdAt !== undefined && statusMeta.createdAt !== null) {
      (next as any).createdAt = statusMeta.createdAt;
    }
    if (statusMeta.updatedAt !== undefined && statusMeta.updatedAt !== null) {
      (next as any).updatedAt = statusMeta.updatedAt;
    }
    if (statusMeta.pdfUrl !== undefined && statusMeta.pdfUrl !== null) {
      (next as any).pdfUrl = statusMeta.pdfUrl;
    }
    return next;
  }, [
    currentRecord?.createdAt,
    currentRecord?.pdfUrl,
    currentRecord?.status,
    currentRecord?.updatedAt,
    definition,
    existingRecordId,
    formKey,
    language,
    lastSubmissionMeta?.createdAt,
    lastSubmissionMeta?.status,
    lastSubmissionMeta?.updatedAt,
    lineItems,
    recordLoadingId,
    useSummaryHtml,
    values
  ]);

  const resolvedTemplateId = useMemo(
    () => resolveTemplateIdForRecord(definition.summaryHtmlTemplateId as any, draft?.values || {}, draft?.language || language),
    [definition.summaryHtmlTemplateId, draft, language]
  );
  const isBundled = useMemo(() => isBundledHtmlTemplateId(resolvedTemplateId || ''), [resolvedTemplateId]);
  const cachedSummary = useMemo(
    () => {
      // Recheck the server-rendered cache when datasource invalidation asks summary rendering to refresh.
      void dataSourceCacheVersion;
      return draft && !isBundled ? peekSummaryHtmlTemplateCache(draft) : null;
    },
    [dataSourceCacheVersion, draft, isBundled]
  );

  useEffect(() => {
    if (!useSummaryHtml || !isBundled) return;
    const handleCacheChange = (event: Event) => {
      clearBundledHtmlClientCaches();
      setDataSourceCacheVersion(version => version + 1);
      onDiagnostic?.('summary.htmlTemplate.bundle.cacheInvalidated', {
        dataSourceId: (((event as CustomEvent)?.detail || {}) as any)?.id || null
      });
    };
    try {
      if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
      window.addEventListener(DATA_SOURCE_CACHE_UPDATED_EVENT, handleCacheChange as EventListener);
      window.addEventListener(DATA_SOURCE_CACHE_CLEARED_EVENT, handleCacheChange as EventListener);
      return () => {
        window.removeEventListener(DATA_SOURCE_CACHE_UPDATED_EVENT, handleCacheChange as EventListener);
        window.removeEventListener(DATA_SOURCE_CACHE_CLEARED_EVENT, handleCacheChange as EventListener);
      };
    } catch {
      return;
    }
  }, [isBundled, onDiagnostic, useSummaryHtml]);

  useEffect(() => {
    if (!useSummaryHtml) return;
    if (recordLoadingId) {
      setSummaryHtml({ phase: 'idle' });
      return;
    }
    if (!draft) return;
    const seq = ++seqRef.current;
    if (prefetchedSummaryHtml) {
      setSummaryHtml({ phase: 'ready', html: prefetchedSummaryHtml, allowScripts: isBundled });
      onDiagnostic?.('summary.htmlTemplate.prefetched', {
        recordId: existingRecordId || null,
        htmlLength: prefetchedSummaryHtml.toString().length
      });
      return;
    }
    if (cachedSummary?.success && cachedSummary?.html) {
      setSummaryHtml({ phase: 'ready', html: cachedSummary.html, allowScripts: isBundled });
      onDiagnostic?.('summary.htmlTemplate.cacheHit', {
        recordId: existingRecordId || null,
        htmlLength: (cachedSummary.html || '').toString().length
      });
      return;
    }
    setSummaryHtml({ phase: 'rendering', allowScripts: isBundled });
    onDiagnostic?.(isBundled ? 'summary.htmlTemplate.bundle.render.start' : 'summary.htmlTemplate.render.start', {
      recordId: existingRecordId || null
    });
    const renderPromise = isBundled
      ? renderBundledHtmlTemplateClient({
          definition,
          payload: draft,
          templateIdMap: definition.summaryHtmlTemplateId,
          fetchDataSource: undefined,
          onDiagnostic
        })
      : renderSummaryHtmlTemplateApi(draft);
    renderPromise
      .then(res => {
        if (seq !== seqRef.current) return;
        if (!res?.success || !res?.html) {
          const msg = (res?.message || 'Failed to render summary.').toString();
          setSummaryHtml({ phase: 'error', message: msg, allowScripts: isBundled });
          onDiagnostic?.(isBundled ? 'summary.htmlTemplate.bundle.render.error' : 'summary.htmlTemplate.render.error', {
            message: msg
          });
          return;
        }
        setSummaryHtml({ phase: 'ready', html: res.html, allowScripts: isBundled });
        onDiagnostic?.(isBundled ? 'summary.htmlTemplate.bundle.render.ok' : 'summary.htmlTemplate.render.ok', {
          htmlLength: (res.html || '').toString().length
        });
      })
      .catch(err => {
        if (seq !== seqRef.current) return;
        const msg = (err as any)?.message?.toString?.() || (err as any)?.toString?.() || 'Failed to render summary.';
        setSummaryHtml({ phase: 'error', message: msg, allowScripts: isBundled });
        onDiagnostic?.(isBundled ? 'summary.htmlTemplate.bundle.render.exception' : 'summary.htmlTemplate.render.exception', {
          message: msg
        });
      });
  }, [
    cachedSummary,
    dataSourceCacheVersion,
    definition,
    draft,
    existingRecordId,
    isBundled,
    onDiagnostic,
    prefetchedSummaryHtml,
    recordLoadingId,
    useSummaryHtml,
  ]);

  const resolvedHtml = summaryHtml.phase === 'ready' && summaryHtml.html ? summaryHtml.html : cachedSummary?.html || undefined;
  const resolvedAllowScripts = summaryHtml.allowScripts ?? isBundled;

  const showLoadingCard = shouldShowSummaryLoadingCard({
    recordLoading: Boolean(recordLoadingId),
    recordLoadError: Boolean(recordLoadError),
    useSummaryHtml,
    summaryPhase: summaryHtml.phase,
    hasSummaryHtml: Boolean(resolvedHtml)
  });
  const showSummaryContentCard = !recordLoadingId && (!useSummaryHtml || Boolean(resolvedHtml) || summaryHtml.phase === 'error');

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
      {(recordLoadError || showLoadingCard) && (
        <div className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {recordLoadError && <div className="error">{recordLoadError}</div>}
          {!recordLoadError && showLoadingCard ? (
            <div className="status">{tSystem('summary.loadingRecord', language, 'Loading record…')}</div>
          ) : null}
        </div>
      )}

      {showSummaryContentCard ? (
        <div className="card" style={{ padding: 12 }}>
          {useSummaryHtml ? (
            <>
              {summaryHtml.phase === 'error' ? (
                <div className="error" style={{ marginBottom: 12 }}>
                  {summaryHtml.message || tSystem('report.failedHtml', language, 'Failed to render preview.')}
                </div>
              ) : null}
              {resolvedHtml ? (
                <HtmlPreview
                  html={resolvedHtml}
                  allowScripts={resolvedAllowScripts}
                  onOpenFiles={onOpenFiles}
                  onAction={onAction}
                  onDiagnostic={onDiagnostic}
                />
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
      ) : null}
    </div>
  );
};
