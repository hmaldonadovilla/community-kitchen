import { useCallback } from 'react';

import { SYSTEM_FONT_STACK } from '../../../../constants/typography';
import { tSystem } from '../../../systemStrings';
import type { FieldValue, LangCode, WebFormDefinition } from '../../../types';
import {
  fetchDataSourceApi,
  peekHtmlTemplateCache,
  peekMarkdownTemplateCache,
  renderDocTemplatePdfPreviewApi,
  renderStoredPdfPreviewApi,
  renderHtmlTemplateApi,
  renderMarkdownTemplateApi
} from '../../api';
import type { TemplateRenderCacheOptions } from '../../api';
import { isBundledHtmlTemplateId, renderBundledHtmlTemplateClient } from '../../app/bundledHtmlClientRenderer';
import { openPdfObjectUrl } from '../../app/pdfObjectUrlOpen';
import { buildDraftPayload, resolveExistingRecordId } from '../../app/submission';
import { resolveTemplateIdForRecord } from '../../app/templateId';
import type { LineItemState } from '../../types';
import { resolveLabel } from '../../utils/labels';
import type { ReportOverlayState } from './ReportOverlay';

const resolveTemplateIdForClient = (template: any, language: string): string | undefined => {
  if (!template) return undefined;
  const pick = (value: any) => (value !== undefined && value !== null ? value.toString().trim() : '');
  if (typeof template === 'string') {
    const trimmed = template.trim();
    return trimmed || undefined;
  }
  const langKey = (language || 'EN').toUpperCase();
  const direct = pick((template as any)[langKey]);
  if (direct) return direct;
  const lower = (language || 'en').toLowerCase();
  const lowerPick = pick((template as any)[lower]);
  if (lowerPick) return lowerPick;
  const enPick = pick((template as any).EN);
  if (enPick) return enPick;
  const firstKey = Object.keys(template || {})[0];
  const firstPick = firstKey ? pick((template as any)[firstKey]) : '';
  return firstPick || undefined;
};

const buildButtonRenderCacheOptions = (cfg: any, resolvedTemplateId?: string | null): TemplateRenderCacheOptions => ({
  cacheScope: cfg?.cacheScope ?? cfg?.renderCacheScope ?? cfg?.templateCacheScope ?? 'record',
  templateId: resolvedTemplateId || null
});

const base64ToPdfObjectUrl = (pdfBase64: string, mimeType: string) => {
  const raw = (pdfBase64 || '').toString();
  const binary = globalThis.atob ? globalThis.atob(raw) : atob(raw);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: mimeType || 'application/pdf' });
  return URL.createObjectURL(blob);
};

const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const writePopupPlainMessage = (popup: Window | null | undefined, message: string) => {
  try {
    if (!popup || popup.closed) return;
    popup.document.open();
    popup.document.write(`<pre style="white-space:pre-wrap;font-family:${SYSTEM_FONT_STACK};padding:18px;">${escapeHtml(message)}</pre>`);
    popup.document.close();
  } catch {
    // best effort
  }
};

export const useAppReportPreviewActions = (args: {
  definition: WebFormDefinition;
  formKey: string;
  languageRef: React.MutableRefObject<LangCode>;
  valuesRef: React.MutableRefObject<Record<string, FieldValue>>;
  lineItemsRef: React.MutableRefObject<LineItemState>;
  selectedRecordIdRef: React.MutableRefObject<string>;
  selectedRecordSnapshotRef: React.MutableRefObject<any>;
  lastSubmissionMetaRef: React.MutableRefObject<any>;
  reportPdfSeqRef: React.MutableRefObject<number>;
  setReportOverlay: React.Dispatch<React.SetStateAction<ReportOverlayState>>;
  parseButtonRef: (ref: string) => { id: string; qIdx?: number };
  logEvent: (event: string, payload?: Record<string, unknown>) => void;
  resolveUiErrorMessage: (err: any, fallback: string) => string | null;
  resolveLogMessage: (err: any, fallback: string) => string;
}) => {
  const {
    definition,
    formKey,
    languageRef,
    valuesRef,
    lineItemsRef,
    selectedRecordIdRef,
    selectedRecordSnapshotRef,
    lastSubmissionMetaRef,
    reportPdfSeqRef,
    setReportOverlay,
    parseButtonRef,
    logEvent,
    resolveUiErrorMessage,
    resolveLogMessage
  } = args;

  const openPdfPreviewWindow = useCallback(
    (windowArgs: { title: string; subtitle?: string; language: LangCode; loadingLabel?: string }) => {
      try {
        const popup = globalThis.window?.open('', '_blank');
        if (!popup) return null;
        try {
          const title = (windowArgs.title || '').toString();
          const subtitle = (windowArgs.subtitle || '').toString();
          const loading = (windowArgs.loadingLabel || tSystem('report.generatingPdf', windowArgs.language, 'Generating PDF…')).toString();
          const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</title>
    <style>
      :root { --ck-font-label: 16px; --ck-font-group-title: 20px; --ck-font-helper: 14px; }
      body { margin: 0; padding: 24px; font-family: ${SYSTEM_FONT_STACK}; color: CanvasText; background: Canvas; font-size: var(--ck-font-label); }
      .sub { margin-top: 8px; font-weight: 400; color: GrayText; font-size: var(--ck-font-helper); }
      .box { margin-top: 22px; padding: 18px 18px; border: 1px solid GrayText; border-radius: 16px; background: transparent; font-weight: 600; font-size: var(--ck-font-label); }
    </style>
  </head>
  <body>
    <div style="font-weight: 600; font-size: var(--ck-font-group-title);">${title.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
    ${subtitle ? `<div class="sub">${subtitle.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>` : ``}
    <div class="box">${loading.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
  </body>
</html>`;
          popup.document.open();
          popup.document.write(html);
          popup.document.close();
        } catch {
          // best effort
        }
        return popup;
      } catch {
        return null;
      }
    },
    []
  );

  const generateReportPdfPreview = useCallback(
    async (previewArgs: { buttonId: string; popup?: Window | null }) => {
      const buttonId = previewArgs.buttonId;
      const popup = previewArgs.popup || null;
      const seq = ++reportPdfSeqRef.current;
      const parsedRef = parseButtonRef(buttonId || '');
      const baseId = parsedRef.id;
      const qIdx = parsedRef.qIdx;
      const indexed = qIdx !== undefined ? definition.questions[qIdx] : undefined;
      const btn =
        indexed && indexed.type === 'BUTTON' && indexed.id === baseId
          ? indexed
          : definition.questions.find(q => q.type === 'BUTTON' && q.id === baseId);
      const title = btn ? resolveLabel(btn, languageRef.current) : (baseId || 'Report');

      setReportOverlay(prev => ({
        ...(prev || { title: '' }),
        open: false,
        kind: 'pdf',
        buttonId,
        title,
        subtitle: definition.title,
        pdfPhase: 'rendering',
        pdfObjectUrl: undefined,
        pdfFileName: undefined,
        pdfMessage: undefined,
        markdown: undefined,
        html: undefined
      }));
      const templateIdResolved = btn ? resolveTemplateIdForClient((btn as any)?.button?.templateId, languageRef.current) : undefined;
      const templateIdShort =
        templateIdResolved && templateIdResolved.length > 12
          ? `${templateIdResolved.slice(0, 5)}…${templateIdResolved.slice(-5)}`
          : templateIdResolved;
      logEvent('report.pdfPreview.start', { buttonId: baseId, qIdx: qIdx ?? null, templateId: templateIdShort || null });

      try {
        const existingRecordId = resolveExistingRecordId({
          selectedRecordId: selectedRecordIdRef.current,
          selectedRecordSnapshot: selectedRecordSnapshotRef.current,
          lastSubmissionMetaId: lastSubmissionMetaRef.current?.id || null
        });
        const draft = buildDraftPayload({
          definition,
          formKey,
          language: languageRef.current,
          values: valuesRef.current,
          lineItems: lineItemsRef.current,
          existingRecordId
        });
        const res = await renderDocTemplatePdfPreviewApi(draft, buttonId);
        if (seq !== reportPdfSeqRef.current) return;
        if (!res?.success || !res?.pdfBase64) {
          const msg = (res?.message || 'Failed to generate PDF preview.').toString();
          setReportOverlay(prev => (prev?.buttonId !== buttonId ? prev : { ...(prev || { open: false, title: '' }), open: false, pdfPhase: 'error', pdfMessage: msg }));
          try {
            if (popup && !popup.closed) {
              popup.document.open();
              popup.document.write(`<pre style="white-space:pre-wrap;font-family:${SYSTEM_FONT_STACK};padding:18px;">${msg}</pre>`);
              popup.document.close();
            }
          } catch {
            // ignore
          }
          logEvent('report.pdfPreview.error', { buttonId, message: msg });
          return;
        }
        const mimeType = (res.mimeType || 'application/pdf').toString();
        const objectUrl = base64ToPdfObjectUrl(res.pdfBase64, mimeType);

        let opened = false;
        try {
          if (popup && !popup.closed) {
            popup.location.href = objectUrl;
            opened = true;
          }
        } catch {
          opened = false;
        }
        if (!opened) {
          try {
            globalThis.location?.assign?.(objectUrl);
            opened = true;
          } catch {
            // ignore
          }
        }

        setReportOverlay(prev => (prev?.buttonId !== buttonId ? prev : { ...(prev || { open: false, title: '' }), open: false, pdfPhase: 'idle', pdfMessage: undefined }));
        logEvent('report.pdfPreview.ok', { buttonId, opened });
      } catch (err: any) {
        if (seq !== reportPdfSeqRef.current) return;
        const uiMessage = resolveUiErrorMessage(err, 'Failed to generate PDF preview.');
        const logMessage = resolveLogMessage(err, 'Failed to generate PDF preview.');
        if (uiMessage) {
          setReportOverlay(prev =>
            prev?.buttonId !== buttonId
              ? prev
              : { ...(prev || { open: false, title: '' }), open: false, pdfPhase: 'error', pdfMessage: uiMessage }
          );
          try {
            if (popup && !popup.closed) {
              popup.document.open();
              popup.document.write(`<pre style="white-space:pre-wrap;font-family:${SYSTEM_FONT_STACK};padding:18px;">${uiMessage}</pre>`);
              popup.document.close();
            }
          } catch {
            // ignore
          }
        } else {
          setReportOverlay(prev =>
            prev?.buttonId !== buttonId
              ? prev
              : { ...(prev || { open: false, title: '' }), open: false, pdfPhase: 'idle', pdfMessage: undefined }
          );
        }
        logEvent('report.pdfPreview.exception', { buttonId, message: logMessage });
      }
    },
    [
      definition,
      formKey,
      languageRef,
      lineItemsRef,
      logEvent,
      parseButtonRef,
      reportPdfSeqRef,
      resolveLogMessage,
      resolveUiErrorMessage,
      selectedRecordIdRef,
      selectedRecordSnapshotRef,
      lastSubmissionMetaRef,
      setReportOverlay,
      valuesRef
    ]
  );

  const openReport = useCallback(
    (openArgs: { buttonId: string; popup?: Window | null }) => {
      void generateReportPdfPreview({ buttonId: openArgs.buttonId, popup: openArgs.popup });
    },
    [generateReportPdfPreview]
  );

  const generateStoredPdfPreview = useCallback(
    async (previewArgs: { buttonId: string; fieldId?: string | null; popup?: Window | null }) => {
      const buttonId = previewArgs.buttonId;
      const fieldId = (previewArgs.fieldId || 'pdfUrl').toString().trim() || 'pdfUrl';
      const popup = previewArgs.popup || null;
      const hasPopup = !!popup && popup.closed !== true;
      const seq = ++reportPdfSeqRef.current;
      const parsedRef = parseButtonRef(buttonId || '');
      const baseId = parsedRef.id;
      const qIdx = parsedRef.qIdx;
      const indexed = qIdx !== undefined ? definition.questions[qIdx] : undefined;
      const btn =
        indexed && indexed.type === 'BUTTON' && indexed.id === baseId
          ? indexed
          : definition.questions.find(q => q.type === 'BUTTON' && q.id === baseId);
      const title = btn ? resolveLabel(btn, languageRef.current) : (baseId || 'Report');

      setReportOverlay(prev => ({
        ...(prev || { title: '' }),
        open: !hasPopup,
        kind: 'pdf',
        buttonId,
        title,
        subtitle: definition.title,
        pdfPhase: 'rendering',
        pdfObjectUrl: undefined,
        pdfFileName: undefined,
        pdfMessage: tSystem('report.loadingPdf', languageRef.current, 'Loading PDF…'),
        markdown: undefined,
        html: undefined
      }));

      const recordId =
        resolveExistingRecordId({
          selectedRecordId: selectedRecordIdRef.current,
          selectedRecordSnapshot: selectedRecordSnapshotRef.current,
          lastSubmissionMetaId: lastSubmissionMetaRef.current?.id || null
        }) || '';
      if (!recordId) {
        const msg = 'No saved record was found for this report.';
        writePopupPlainMessage(popup, msg);
        setReportOverlay(prev => (prev?.buttonId !== buttonId ? prev : { ...prev, pdfPhase: 'error', pdfMessage: msg }));
        logEvent('report.storedPdfPreview.missingRecord', { buttonId: baseId, qIdx: qIdx ?? null, fieldId });
        return;
      }

      logEvent('report.storedPdfPreview.start', { buttonId: baseId, qIdx: qIdx ?? null, fieldId, recordId });
      try {
        const res = await renderStoredPdfPreviewApi(formKey, recordId, fieldId);
        if (seq !== reportPdfSeqRef.current) return;
        if (!res?.success || !res?.pdfBase64) {
          const msg = (res?.message || 'Failed to load PDF preview.').toString();
          writePopupPlainMessage(popup, msg);
          setReportOverlay(prev => (prev?.buttonId !== buttonId ? prev : { ...prev, pdfPhase: 'error', pdfMessage: msg }));
          logEvent('report.storedPdfPreview.error', { buttonId: baseId, qIdx: qIdx ?? null, fieldId, message: msg });
          return;
        }

        const objectUrl = base64ToPdfObjectUrl(res.pdfBase64, res.mimeType || 'application/pdf');
        const openResult = openPdfObjectUrl({
          objectUrl,
          popup,
          assignLocation: href => globalThis.location?.assign?.(href)
        });
        if (openResult.opened) {
          setReportOverlay(prev =>
            prev?.buttonId !== buttonId
              ? prev
              : { ...(prev || { open: false, title: '' }), open: false, pdfPhase: 'idle', pdfMessage: undefined }
          );
          logEvent('report.storedPdfPreview.ok', {
            buttonId: baseId,
            qIdx: qIdx ?? null,
            fieldId,
            fileName: res.fileName || null,
            openMethod: openResult.method
          });
          return;
        }

        setReportOverlay(prev => {
          if (prev?.buttonId !== buttonId) return prev;
          return {
            ...prev,
            open: true,
            kind: 'pdf',
            pdfPhase: 'ready',
            pdfObjectUrl: objectUrl,
            pdfFileName: res.fileName,
            pdfMessage: undefined,
            markdown: undefined,
            html: undefined
          };
        });
        logEvent('report.storedPdfPreview.ok', {
          buttonId: baseId,
          qIdx: qIdx ?? null,
          fieldId,
          fileName: res.fileName || null,
          openMethod: openResult.method
        });
      } catch (err: any) {
        if (seq !== reportPdfSeqRef.current) return;
        const uiMessage = resolveUiErrorMessage(err, 'Failed to load PDF preview.');
        const logMessage = resolveLogMessage(err, 'Failed to load PDF preview.');
        writePopupPlainMessage(popup, uiMessage || logMessage);
        setReportOverlay(prev => (prev?.buttonId !== buttonId ? prev : { ...prev, pdfPhase: 'error', pdfMessage: uiMessage || logMessage }));
        logEvent('report.storedPdfPreview.exception', { buttonId: baseId, qIdx: qIdx ?? null, fieldId, message: logMessage });
      }
    },
    [
      definition,
      formKey,
      languageRef,
      logEvent,
      parseButtonRef,
      reportPdfSeqRef,
      resolveLogMessage,
      resolveUiErrorMessage,
      selectedRecordIdRef,
      selectedRecordSnapshotRef,
      lastSubmissionMetaRef,
      setReportOverlay
    ]
  );

  const openStoredPdfPreview = useCallback(
    (openArgs: { buttonId: string; fieldId?: string | null; popup?: Window | null }) => {
      void generateStoredPdfPreview(openArgs);
    },
    [generateStoredPdfPreview]
  );

  const generateReportMarkdownPreview = useCallback(
    async (buttonId: string) => {
      const seq = ++reportPdfSeqRef.current;
      const parsedRef = parseButtonRef(buttonId || '');
      const baseId = parsedRef.id;
      const qIdx = parsedRef.qIdx;
      const indexed = qIdx !== undefined ? definition.questions[qIdx] : undefined;
      const btn =
        indexed && indexed.type === 'BUTTON' && indexed.id === baseId
          ? indexed
          : definition.questions.find(q => q.type === 'BUTTON' && q.id === baseId);
      const cfg: any = btn ? (btn as any).button : null;
      const title = btn ? resolveLabel(btn, languageRef.current) : (baseId || 'Preview');

      setReportOverlay(prev => ({
        ...(prev || { title: '' }),
        open: true,
        kind: 'markdown',
        buttonId,
        title,
        subtitle: definition.title,
        pdfPhase: 'rendering',
        pdfObjectUrl: undefined,
        pdfFileName: undefined,
        pdfMessage: undefined,
        markdown: undefined,
        html: undefined
      }));

      const templateIdResolved = btn ? resolveTemplateIdForClient((btn as any)?.button?.templateId, languageRef.current) : undefined;
      const templateIdShort =
        templateIdResolved && templateIdResolved.length > 12
          ? `${templateIdResolved.slice(0, 5)}…${templateIdResolved.slice(-5)}`
          : templateIdResolved;
      logEvent('report.markdownPreview.start', { buttonId: baseId, qIdx: qIdx ?? null, templateId: templateIdShort || null });

      try {
        const existingRecordId = resolveExistingRecordId({
          selectedRecordId: selectedRecordIdRef.current,
          selectedRecordSnapshot: selectedRecordSnapshotRef.current,
          lastSubmissionMetaId: lastSubmissionMetaRef.current?.id || null
        });
        const draft = buildDraftPayload({
          definition,
          formKey,
          language: languageRef.current,
          values: valuesRef.current,
          lineItems: lineItemsRef.current,
          existingRecordId
        });

        const templateIdMap = btn ? (btn as any)?.button?.templateId : undefined;
        const resolvedTemplateId = resolveTemplateIdForRecord(templateIdMap, draft.values || {}, draft.language) || templateIdResolved;
        const cacheOptions = buildButtonRenderCacheOptions(cfg, resolvedTemplateId);
        const cached = peekMarkdownTemplateCache(draft, buttonId, cacheOptions);
        if (cached?.success && cached?.markdown) {
          logEvent('report.markdownPreview.cacheHit', {
            buttonId: baseId,
            qIdx: qIdx ?? null,
            cacheScope: cacheOptions.cacheScope || 'record',
            markdownLength: (cached.markdown || '').toString().length
          });
        }
        const res = await renderMarkdownTemplateApi(draft, buttonId, cacheOptions);
        if (seq !== reportPdfSeqRef.current) return;
        if (!res?.success || !res?.markdown) {
          const msg = (res?.message || 'Failed to render preview.').toString();
          setReportOverlay(prev => {
            if (!prev?.open || prev.buttonId !== buttonId) return prev;
            return { ...prev, pdfPhase: 'error', pdfMessage: msg };
          });
          logEvent('report.markdownPreview.error', { buttonId, message: msg });
          return;
        }

        setReportOverlay(prev => {
          if (prev?.buttonId !== buttonId) return prev;
          return {
            ...prev,
            open: true,
            kind: 'markdown',
            pdfPhase: 'ready',
            markdown: res.markdown,
            html: undefined,
            pdfMessage: undefined
          };
        });
        logEvent('report.markdownPreview.ok', { buttonId, markdownLength: (res.markdown || '').toString().length });
      } catch (err: any) {
        if (seq !== reportPdfSeqRef.current) return;
        const uiMessage = resolveUiErrorMessage(err, 'Failed to render preview.');
        const logMessage = resolveLogMessage(err, 'Failed to render preview.');
        if (uiMessage) {
          setReportOverlay(prev => {
            if (prev?.buttonId !== buttonId) return prev;
            return { ...prev, open: true, pdfPhase: 'error', pdfMessage: uiMessage };
          });
        } else {
          setReportOverlay(prev => {
            if (prev?.buttonId !== buttonId) return prev;
            return { ...prev, open: false, pdfPhase: 'idle', pdfMessage: undefined };
          });
        }
        logEvent('report.markdownPreview.exception', { buttonId, message: logMessage });
      }
    },
    [
      definition,
      formKey,
      languageRef,
      lineItemsRef,
      logEvent,
      parseButtonRef,
      reportPdfSeqRef,
      resolveLogMessage,
      resolveUiErrorMessage,
      selectedRecordIdRef,
      selectedRecordSnapshotRef,
      lastSubmissionMetaRef,
      setReportOverlay,
      valuesRef
    ]
  );

  const openMarkdown = useCallback(
    (buttonId: string) => {
      void generateReportMarkdownPreview(buttonId);
    },
    [generateReportMarkdownPreview]
  );

  const generateReportHtmlPreview = useCallback(
    async (buttonId: string) => {
      const seq = ++reportPdfSeqRef.current;
      const parsedRef = parseButtonRef(buttonId || '');
      const baseId = parsedRef.id;
      const qIdx = parsedRef.qIdx;
      const indexed = qIdx !== undefined ? definition.questions[qIdx] : undefined;
      const btn =
        indexed && indexed.type === 'BUTTON' && indexed.id === baseId
          ? indexed
          : definition.questions.find(q => q.type === 'BUTTON' && q.id === baseId);
      const cfg: any = btn ? (btn as any).button : null;
      const title = btn ? resolveLabel(btn, languageRef.current) : (baseId || 'Preview');

      setReportOverlay(prev => ({
        ...(prev || { title: '' }),
        open: true,
        kind: 'html',
        buttonId,
        title,
        subtitle: definition.title,
        pdfPhase: 'rendering',
        pdfObjectUrl: undefined,
        pdfFileName: undefined,
        pdfMessage: undefined,
        markdown: undefined,
        html: undefined,
        htmlAllowScripts: false
      }));

      const templateIdResolved = btn ? resolveTemplateIdForClient((btn as any)?.button?.templateId, languageRef.current) : undefined;
      const templateIdShort =
        templateIdResolved && templateIdResolved.length > 12
          ? `${templateIdResolved.slice(0, 5)}…${templateIdResolved.slice(-5)}`
          : templateIdResolved;
      logEvent('report.htmlPreview.start', { buttonId: baseId, qIdx: qIdx ?? null, templateId: templateIdShort || null });

      try {
        const existingRecordId = resolveExistingRecordId({
          selectedRecordId: selectedRecordIdRef.current,
          selectedRecordSnapshot: selectedRecordSnapshotRef.current,
          lastSubmissionMetaId: lastSubmissionMetaRef.current?.id || null
        });
        const draft = buildDraftPayload({
          definition,
          formKey,
          language: languageRef.current,
          values: valuesRef.current,
          lineItems: lineItemsRef.current,
          existingRecordId
        });
        const metaSource: any = selectedRecordSnapshotRef.current || lastSubmissionMetaRef.current || null;
        if (metaSource?.status !== undefined && metaSource?.status !== null) {
          (draft as any).status = metaSource.status;
        }
        if (metaSource?.createdAt !== undefined && metaSource?.createdAt !== null) {
          (draft as any).createdAt = metaSource.createdAt;
        }
        if (metaSource?.updatedAt !== undefined && metaSource?.updatedAt !== null) {
          (draft as any).updatedAt = metaSource.updatedAt;
        }
        if (metaSource?.pdfUrl !== undefined && metaSource?.pdfUrl !== null) {
          (draft as any).pdfUrl = metaSource.pdfUrl;
        }

        const templateIdMap = btn ? (btn as any)?.button?.templateId : undefined;
        const resolved = resolveTemplateIdForRecord(templateIdMap, draft.values || {}, draft.language);
        const cacheOptions = buildButtonRenderCacheOptions(cfg, resolved || templateIdResolved);
        const useBundled = isBundledHtmlTemplateId(resolved || '');
        if (useBundled) {
          logEvent('report.htmlPreview.bundle.start', { buttonId: baseId, qIdx: qIdx ?? null });
        }
        const cached = useBundled ? null : peekHtmlTemplateCache(draft, buttonId, cacheOptions);
        if (cached?.success && cached?.html) {
          logEvent('report.htmlPreview.cacheHit', {
            buttonId: baseId,
            qIdx: qIdx ?? null,
            cacheScope: cacheOptions.cacheScope || 'record',
            htmlLength: (cached.html || '').toString().length
          });
        }
        const res = useBundled
          ? await renderBundledHtmlTemplateClient({
              definition,
              payload: draft,
              templateIdMap,
              buttonId,
              fetchDataSource: fetchDataSourceApi,
              onDiagnostic: logEvent
            })
          : await renderHtmlTemplateApi(draft, buttonId, cacheOptions);
        if (seq !== reportPdfSeqRef.current) return;
        if (!res?.success || !res?.html) {
          const msg = (res?.message || 'Failed to render preview.').toString();
          setReportOverlay(prev => {
            if (!prev?.open || prev.buttonId !== buttonId) return prev;
            return { ...prev, pdfPhase: 'error', pdfMessage: msg };
          });
          logEvent(useBundled ? 'report.htmlPreview.bundle.error' : 'report.htmlPreview.error', { buttonId, message: msg });
          return;
        }

        setReportOverlay(prev => {
          if (prev?.buttonId !== buttonId) return prev;
          return {
            ...prev,
            open: true,
            kind: 'html',
            pdfPhase: 'ready',
            html: res.html,
            markdown: undefined,
            pdfMessage: undefined,
            htmlAllowScripts: useBundled
          };
        });
        logEvent(useBundled ? 'report.htmlPreview.bundle.ok' : 'report.htmlPreview.ok', {
          buttonId,
          htmlLength: (res.html || '').toString().length
        });
      } catch (err: any) {
        if (seq !== reportPdfSeqRef.current) return;
        const uiMessage = resolveUiErrorMessage(err, 'Failed to render preview.');
        const logMessage = resolveLogMessage(err, 'Failed to render preview.');
        if (uiMessage) {
          setReportOverlay(prev => {
            if (prev?.buttonId !== buttonId) return prev;
            return { ...prev, open: true, pdfPhase: 'error', pdfMessage: uiMessage };
          });
        } else {
          setReportOverlay(prev => {
            if (prev?.buttonId !== buttonId) return prev;
            return { ...prev, open: false, pdfPhase: 'idle', pdfMessage: undefined };
          });
        }
        logEvent('report.htmlPreview.exception', { buttonId, message: logMessage });
      }
    },
    [
      definition,
      formKey,
      languageRef,
      lineItemsRef,
      logEvent,
      parseButtonRef,
      reportPdfSeqRef,
      resolveLogMessage,
      resolveUiErrorMessage,
      selectedRecordIdRef,
      selectedRecordSnapshotRef,
      lastSubmissionMetaRef,
      setReportOverlay,
      valuesRef
    ]
  );

  const openHtml = useCallback(
    (buttonId: string) => {
      void generateReportHtmlPreview(buttonId);
    },
    [generateReportHtmlPreview]
  );

  return {
    openPdfPreviewWindow,
    openReport,
    openStoredPdfPreview,
    openMarkdown,
    openHtml
  };
};
