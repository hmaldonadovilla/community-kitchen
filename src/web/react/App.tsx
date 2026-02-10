import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  loadOptionsFromDataSource,
  optionKey,
  normalizeLanguage,
  toOptionSet,
  buildLocalizedOptions
} from '../core';
import {
  FieldValue,
  FieldChangeDialogConfig,
  LangCode,
  LocalizedString,
  SelectionEffect,
  WebQuestionDefinition,
  WebFormSubmission
} from '../types';
import {
  BootstrapContext,
  submit,
  checkDedupConflictApi,
  triggerFollowupBatch,
  uploadFilesApi,
  prefetchTemplatesApi,
  renderDocTemplatePdfPreviewApi,
  renderMarkdownTemplateApi,
  renderHtmlTemplateApi,
  renderSummaryHtmlTemplateApi,
  clearHtmlRenderClientCache,
  fetchHomeBootstrapApi,
  fetchSortedBatch,
  ListSort,
  ListResponse,
  ListItem,
  fetchRecordById,
  fetchRecordByRowNumber,
  getRecordVersionApi,
  resolveUserFacingErrorMessage
} from './api';
import FormView from './components/FormView';
import ListView from './components/ListView';
import { ListViewIcon } from './components/ListViewIcon';
import { AppHeader } from './components/app/AppHeader';
import { ActionBar } from './components/app/ActionBar';
import { ValidationHeaderNotice } from './components/app/ValidationHeaderNotice';
import { ReportOverlay, ReportOverlayState } from './components/app/ReportOverlay';
import { SummaryView } from './components/app/SummaryView';
import { InlineMarkdown } from './components/app/InlineMarkdown';
import { FORM_VIEW_STYLES } from './components/form/styles';
import { FileOverlay } from './components/form/overlays/FileOverlay';
import { FormErrors, LineItemState, OptionState, View } from './types';
import { BlockingOverlay } from './features/overlays/BlockingOverlay';
import { ConfirmDialogOverlay } from './features/overlays/ConfirmDialogOverlay';
import { useBlockingOverlay } from './features/overlays/useBlockingOverlay';
import { useConfirmDialog } from './features/overlays/useConfirmDialog';
import { FieldChangeDialogOverlay } from './features/fieldChangeDialog/FieldChangeDialogOverlay';
import { FieldChangeDialogInputState, useFieldChangeDialog } from './features/fieldChangeDialog/useFieldChangeDialog';
import { runUpdateRecordAction } from './features/customActions/updateRecord/runUpdateRecordAction';
import {
  buildDraftPayload,
  buildSubmissionPayload,
  collectValidationWarnings,
  computeUrlOnlyUploadUpdates,
  resolveExistingRecordId,
  validateForm
} from './app/submission';
import { clearBundledHtmlClientCaches, isBundledHtmlTemplateId, renderBundledHtmlTemplateClient } from './app/bundledHtmlClientRenderer';
import { resolveTemplateIdForRecord } from './app/templateId';
import { runSelectionEffects as runSelectionEffectsHelper } from './app/selectionEffects';
import { detectDebug } from './app/utils';
import { collectListViewRuleColumnDependencies } from './app/listViewRuleColumns';
import { hasIncompleteRejectDedupKeys } from './app/dedupKeyUtils';
import {
  resolveDedupIncompleteHomeDialogConfig,
  resolveDedupIncompleteHomeDialogCopy
} from './app/dedupIncompleteHomeDialog';
import {
  applyFieldChangeDialogTargets,
  evaluateFieldChangeDialogWhen,
  evaluateFieldChangeDialogWhenWithFallback,
  finalizeInitialDateChangeDialogEntry,
  resolveFieldChangeDialogCancelAction,
  resolveFieldChangeDialogSource,
  resolveTargetFieldConfig,
  shouldSuppressInitialDateChangeDialog,
  type FieldChangeDialogTargetUpdate
} from './app/fieldChangeDialog';
import {
  buildInitialLineItems,
  buildSubgroupKey,
  clearAutoIncrementFields,
  parseSubgroupKey,
  parseRowNonMatchOptions,
  resolveSubgroupKey,
  ROW_NON_MATCH_OPTIONS_KEY
} from './app/lineItems';
import { normalizeRecordValues } from './app/records';
import { applyValueMapsToForm, coerceDefaultValue } from './app/valueMaps';
import { buildFilePayload } from './app/filePayload';
import { buildListViewLegendItems } from './app/listViewLegend';
import { removeListCacheRowPure, upsertListCacheRowPure } from './app/listCache';
import { resolveDedupDialogCopy } from './app/dedupDialog';
import { buildSystemActionGateContext, evaluateSystemActionGate } from './app/actionGates';
import { applyCopyCurrentRecordProfile } from './app/copyProfile';
import { resolveCopyCurrentRecordDialog } from './app/copyCurrentRecordDialog';
import { resolveReadyForProductionUnlockStatus, resolveUnlockRecordId } from './app/readyForProductionLock';
import packageJson from '../../../package.json';
import githubMarkdownCss from 'github-markdown-css/github-markdown-light.css';
import { resolveFieldLabel, resolveLabel } from './utils/labels';
import { EMPTY_DISPLAY, formatDisplayText } from './utils/valueDisplay';
import { SYSTEM_FONT_STACK } from '../../constants/typography';
import { tSystem } from '../systemStrings';
import { resolveLocalizedString } from '../i18n';
import { toUploadItems } from './components/form/utils';
import { isEmptyValue } from './utils/values';
import { clearFetchDataSourceCache, prefetchDataSources } from '../data/dataSources';
import { collectDataSourceConfigsForPrefetch } from '../data/dataSourcePrefetch';
import { shouldHideField } from '../rules/visibility';
import { getSystemFieldValue } from '../rules/systemFields';
import { computeGuidedStepsStatus } from './features/steps/domain/computeStepStatus';
import { resolveVirtualStepField } from './features/steps/domain/resolveVirtualStepField';
import {
  hasStatusTransitionValue,
  matchesStatusTransition,
  resolveStatusTransitionValue
} from '../../domain/statusTransitions';

type SubmissionMeta = {
  id?: string;
  createdAt?: string;
  updatedAt?: string;
  dataVersion?: number;
  status?: string | null;
};

type DraftSavePhase = 'idle' | 'dirty' | 'saving' | 'saved' | 'error' | 'paused';

type FieldChangePending = {
  fieldPath: string;
  scope: 'top' | 'line';
  fieldId: string;
  groupId?: string;
  rowId?: string;
  dialog: FieldChangeDialogConfig;
  effectQuestion?: WebQuestionDefinition;
  selectionEffects?: SelectionEffect[];
  prevSnapshot: { values: Record<string, FieldValue>; lineItems: LineItemState };
  nextValue: FieldValue;
  autoSaveSnapshot: {
    dirty: boolean;
    queued: boolean;
    lastSeen: { values: Record<string, FieldValue>; lineItems: LineItemState } | null;
  };
};

const computeDedupSignatureFromValues = (rulesRaw: any, values: Record<string, any>): string => {
  const rules: any[] = Array.isArray(rulesRaw) ? rulesRaw : [];
  if (!rules.length) return '';
  const normalizeKeyValue = (raw: any): string => {
    if (raw === undefined || raw === null) return '';
    if (Array.isArray(raw)) return raw.map(v => (v === undefined || v === null ? '' : v.toString())).join('|');
    return raw.toString();
  };
  const parts: string[] = [];
  rules.forEach(rule => {
    if (!rule) return;
    const keys: any[] = Array.isArray(rule.keys) ? rule.keys : [];
    if (!keys.length) return;
    const onConflict = (rule.onConflict || 'reject').toString().trim().toLowerCase();
    if (onConflict !== 'reject') return;
    const vals: string[] = keys.map((k: any) => normalizeKeyValue((values as any)[(k || '').toString()]));
    if (vals.some(v => !v || !v.trim())) return;
    parts.push(`${(rule.id || '').toString()}:${vals.map(v => v.trim()).join('||')}`);
  });
  return parts.sort().join('|');
};

const collectDedupKeyFieldIds = (rulesRaw: any): string[] => {
  const rules: any[] = Array.isArray(rulesRaw) ? rulesRaw : [];
  const seen = new Set<string>();
  const out: string[] = [];
  rules.forEach(rule => {
    if (!rule) return;
    const keys = Array.isArray(rule.keys) ? rule.keys : [];
    if (!keys.length) return;
    const onConflict = (rule.onConflict || 'reject').toString().trim().toLowerCase();
    if (onConflict !== 'reject') return;
    keys.forEach((k: any) => {
      const id = (k || '').toString().trim();
      const lower = id.toLowerCase();
      if (!id || seen.has(lower)) return;
      seen.add(lower);
      out.push(id);
    });
  });
  return out;
};

const computeDedupKeyFieldIdMap = (rulesRaw: any): Record<string, true> => {
  const map: Record<string, true> = {};
  collectDedupKeyFieldIds(rulesRaw).forEach(id => {
    if (!id) return;
    map[id] = true;
    map[id.toLowerCase()] = true;
  });
  return map;
};

const computeDedupKeyFingerprint = (rulesRaw: any, values: Record<string, any>): string => {
  const ids = collectDedupKeyFieldIds(rulesRaw);
  if (!ids.length) return '';
  const normalize = (raw: any): string => {
    if (raw === undefined || raw === null) return '';
    if (Array.isArray(raw)) return raw.map(v => (v === undefined || v === null ? '' : v.toString())).join('|');
    return raw.toString();
  };
  return ids.map(id => `${id}=${normalize((values as any)?.[id])}`).join('|');
};

const whenContainsFieldId = (when: any, targetFieldId: string): boolean => {
  if (!when || !targetFieldId) return false;
  if (Array.isArray(when)) return when.some(entry => whenContainsFieldId(entry, targetFieldId));
  if (typeof when !== 'object') return false;
  const allList = (when as any).all ?? (when as any).and;
  if (Array.isArray(allList)) return allList.some(entry => whenContainsFieldId(entry, targetFieldId));
  const anyList = (when as any).any ?? (when as any).or;
  if (Array.isArray(anyList)) return anyList.some(entry => whenContainsFieldId(entry, targetFieldId));
  if ((when as any).not) return whenContainsFieldId((when as any).not, targetFieldId);
  const fid = (when as any).fieldId;
  if (fid === undefined || fid === null) return false;
  return fid.toString().trim() === targetFieldId.toString().trim();
};

const resolveNonMatchWarningFieldIds = (fields: any[]): string[] => {
  const ids: string[] = [];
  (fields || []).forEach(field => {
    const fid = (field?.id ?? '').toString();
    if (!fid) return;
    const rules = Array.isArray(field?.validationRules) ? field.validationRules : [];
    const hasRule = rules.some((rule: any) => {
      const level = (rule?.level ?? '').toString().trim().toLowerCase();
      if (level && level !== 'warning' && level !== 'warn') return false;
      const when = (rule as any)?.when;
      return whenContainsFieldId(when, ROW_NON_MATCH_OPTIONS_KEY);
    });
    if (hasRule) ids.push(fid);
  });
  return ids;
};

const isWrapScanHiddenElement = (el: HTMLElement): boolean => {
  const tag = el.tagName.toLowerCase();
  if (tag === 'svg' || tag === 'path' || tag === 'img' || tag === 'script' || tag === 'style') return true;
  if ((el.getAttribute('aria-hidden') || '').toString().trim().toLowerCase() === 'true') return true;
  const className = typeof el.className === 'string' ? el.className : '';
  if (/\bsr-only\b|\bvisually-hidden\b/i.test(className)) return true;
  const style = globalThis.getComputedStyle?.(el);
  if (!style) return false;
  if (style.display === 'none' || style.visibility === 'hidden') return true;
  const clip = (style.clip || '').toString().toLowerCase();
  const clipPath = (style.clipPath || '').toString().toLowerCase();
  const width = Number.parseFloat((style.width || '').toString());
  const height = Number.parseFloat((style.height || '').toString());
  const tiny = Number.isFinite(width) && Number.isFinite(height) && width <= 1 && height <= 1;
  if (tiny && style.overflow === 'hidden') return true;
  if (style.overflow === 'hidden' && (clip.includes('rect(0') || clipPath.includes('inset(50%'))) return true;
  return false;
};

const collectButtonTextNodes = (root: Node): Text[] => {
  const out: Text[] = [];
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = (node.textContent || '').replace(/\s+/g, ' ').trim();
      if (text) out.push(node as Text);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    if (isWrapScanHiddenElement(el)) return;
    for (let i = 0; i < node.childNodes.length; i += 1) {
      walk(node.childNodes[i]);
    }
  };
  walk(root);
  return out;
};

const ensureButtonTextSpans = (button: HTMLButtonElement) => {
  const directNodes = Array.from(button.childNodes);
  directNodes.forEach(node => {
    if (node.nodeType !== Node.TEXT_NODE) return;
    const raw = (node.textContent || '').toString();
    if (!raw.replace(/\s+/g, ' ').trim()) return;
    const span = document.createElement('span');
    span.className = 'ck-button-text';
    span.textContent = raw;
    button.replaceChild(span, node);
  });
};

const buttonHasWrappedText = (button: HTMLButtonElement): boolean => {
  if (!button.isConnected) return false;
  const style = globalThis.getComputedStyle?.(button);
  if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
  const textNodes = collectButtonTextNodes(button);
  if (!textNodes.length) return false;

  const range = document.createRange();
  const lines = new Set<number>();
  try {
    textNodes.forEach(node => {
      range.selectNodeContents(node);
      const rects = Array.from(range.getClientRects());
      rects.forEach(rect => {
        if (rect.width <= 0 || rect.height <= 0) return;
        lines.add(Math.round(rect.top));
      });
    });
  } finally {
    range.detach?.();
  }
  return lines.size > 1;
};

// Build marker to verify deployed bundle version in UI
const BUILD_MARKER = `v${(packageJson as any).version || 'dev'}`;

// GitHub-flavored markdown styles (base from github-markdown-css, with CK sizing overrides).
const MARKDOWN_PREVIEW_STYLES = `
  .ck-markdown-scroll {
    padding: 16px;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }
  .ck-markdown-body.markdown-body {
    /* Scale up GitHub defaults to match CK typography tokens */
    font-size: var(--ck-font-control);
    line-height: 1.5;
    color: var(--text);
    background: transparent;
  }
  .ck-markdown-body.markdown-body h1 {
    font-size: var(--ck-font-group-title);
    font-weight: 600;
  }
  .ck-markdown-body.markdown-body h2 {
    font-size: var(--ck-font-control);
    font-weight: 600;
  }
  .ck-markdown-body.markdown-body h3 {
    font-size: var(--ck-font-label);
    font-weight: 600;
  }
  .ck-markdown-body.markdown-body table {
    width: 100%;
    display: block;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
`;

const HTML_PREVIEW_STYLES = `
  .ck-html-preview {
    padding: 16px;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }
  .ck-html-preview__content {
    color: var(--text);
  }
  .ck-file-icon {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    padding: 12px 14px;
    border-radius: 16px;
    border: 1px solid var(--border);
    background: transparent;
    color: var(--text);
    font-weight: 600;
    font-size: var(--ck-font-control);
    cursor: pointer;
    box-shadow: none;
  }
  .ck-file-icon__badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 30px;
    height: 30px;
    padding: 0 9px;
    border-radius: 999px;
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text);
    font-weight: 600;
    font-size: calc(var(--ck-font-label) * 0.85);
    line-height: 1;
  }
`;

const HOME_LIST_LOCAL_CACHE_PREFIX = 'ck.homeList.v1';
const HOME_LIST_LOCAL_CACHE_MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6h

type HomeListLocalCachePayload = {
  savedAtMs: number;
  response: ListResponse;
  homeRev?: number;
};

type HomeListLocalCacheEntry = {
  response: ListResponse;
  homeRev?: number;
};

const resolveLocalStorageSafely = (): Storage | null => {
  try {
    const storage = (globalThis as any)?.localStorage;
    if (!storage) return null;
    if (typeof storage.getItem !== 'function' || typeof storage.setItem !== 'function' || typeof storage.removeItem !== 'function') {
      return null;
    }
    return storage as Storage;
  } catch (_) {
    return null;
  }
};

const hashText32 = (value: string): string => {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
};

const resolveGlobalCacheVersion = (): string => {
  try {
    return (((globalThis as any)?.__CK_CACHE_VERSION__ ?? '') || '').toString().trim();
  } catch (_) {
    return '';
  }
};

const buildHomeListLocalCacheKey = (formKey: string, listView: any, cacheVersion: string): string => {
  const key = (formKey || '').toString().trim();
  const viewSig = hashText32(JSON.stringify(listView || {}));
  const version = (cacheVersion || '').toString().trim() || 'noversion';
  if (!key) return '';
  return `${HOME_LIST_LOCAL_CACHE_PREFIX}::${version}::${key}::${viewSig}`;
};

const readHomeListLocalCache = (key: string): HomeListLocalCacheEntry | null => {
  if (!key) return null;
  const storage = resolveLocalStorageSafely();
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as HomeListLocalCachePayload;
    const response = (parsed as any)?.response as ListResponse | undefined;
    if (!response || !Array.isArray((response as any).items)) return null;
    const savedAtMs = Number((parsed as any)?.savedAtMs || 0);
    if (!Number.isFinite(savedAtMs) || savedAtMs <= 0) return null;
    if (Date.now() - savedAtMs > HOME_LIST_LOCAL_CACHE_MAX_AGE_MS) {
      storage.removeItem(key);
      return null;
    }
    const homeRevRaw = Number((parsed as any)?.homeRev);
    const homeRev = Number.isFinite(homeRevRaw) && homeRevRaw >= 0 ? homeRevRaw : undefined;
    return { response, homeRev };
  } catch (_) {
    try {
      storage.removeItem(key);
    } catch (_) {
      // ignore
    }
    return null;
  }
};

const writeHomeListLocalCache = (key: string, response: ListResponse, homeRev?: number | null): void => {
  if (!key) return;
  const storage = resolveLocalStorageSafely();
  if (!storage) return;
  try {
    const payload: HomeListLocalCachePayload = {
      savedAtMs: Date.now(),
      response: {
        ...response,
        notModified: undefined
      },
      homeRev: Number.isFinite(Number(homeRev)) ? Number(homeRev) : undefined
    };
    storage.setItem(key, JSON.stringify(payload));
  } catch (_) {
    // ignore storage errors (quota/private mode)
  }
};

const App: React.FC<BootstrapContext> = ({ definition, formKey, record, envTag }) => {
  const availableLanguages = (definition.languages && definition.languages.length ? definition.languages : ['EN']) as Array<
    'EN' | 'FR' | 'NL'
  >;
  const defaultLanguage = normalizeLanguage(definition.defaultLanguage || availableLanguages[0] || record?.language);
  const allowLanguageSelection = definition.languageSelectorEnabled !== false && availableLanguages.length > 1;
  const initialLanguage = allowLanguageSelection ? normalizeLanguage(record?.language || defaultLanguage) : defaultLanguage;
  const [language, setLanguage] = useState<LangCode>(initialLanguage);
  const [values, setValues] = useState<Record<string, FieldValue>>(() => {
    const normalized = normalizeRecordValues(definition, record?.values);
    const initialLineItems = buildInitialLineItems(definition, record?.values);
    const mapped = applyValueMapsToForm(definition, normalized, initialLineItems, { mode: 'init' });
    return mapped.values;
  });
  const [lineItems, setLineItems] = useState<LineItemState>(() => {
    const normalized = normalizeRecordValues(definition, record?.values);
    const initialLineItems = buildInitialLineItems(definition, record?.values);
    const mapped = applyValueMapsToForm(definition, normalized, initialLineItems, { mode: 'init' });
    return mapped.lineItems;
  });
  const [view, setView] = useState<View>('list');
  const [submitting, setSubmitting] = useState(false);
  const [reportOverlay, setReportOverlay] = useState<ReportOverlayState>({
    open: false,
    title: '',
    pdfPhase: 'idle'
  });
  const [readOnlyFilesOverlay, setReadOnlyFilesOverlay] = useState<{
    open: boolean;
    fieldId?: string;
    title?: string;
    items: Array<string | File>;
    uploadConfig?: any;
  }>({ open: false, items: [] });
  const reportPdfSeqRef = useRef<number>(0);
  const templatePrefetchFormKeyRef = useRef<string | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const formNavigateToFieldRef = useRef<((fieldKey: string) => void) | null>(null);
  const [validationAttempted, setValidationAttempted] = useState(false);
  const [validationNoticeHidden, setValidationNoticeHidden] = useState(false);
  const [validationWarnings, setValidationWarnings] = useState<{
    top: Array<{ message: string; fieldPath: string }>;
    byField: Record<string, string[]>;
  }>({
    top: [],
    byField: {}
  });
  const warningTouchedRef = useRef<Set<string>>(new Set());
  const nonMatchWarningPathsRef = useRef<Set<string>>(new Set());
  const [status, setStatus] = useState<string | null>(null);
  const [statusLevel, setStatusLevel] = useState<'info' | 'success' | 'error' | null>(null);
  type DedupConflictInfo = { ruleId: string; message: string; existingRecordId?: string; existingRowNumber?: number };
  const [dedupChecking, setDedupChecking] = useState<boolean>(false);
  const [dedupConflict, setDedupConflict] = useState<DedupConflictInfo | null>(null);
  const [dedupNotice, setDedupNotice] = useState<DedupConflictInfo | null>(null);
  type ListDedupPromptState = {
    conflict: DedupConflictInfo;
    source: string;
    buttonId: string;
    qIdx?: number | null;
    values: Record<string, FieldValue>;
  };
  const [listDedupPrompt, setListDedupPrompt] = useState<ListDedupPromptState | null>(null);
  const [precreateDedupChecking, setPrecreateDedupChecking] = useState<boolean>(false);
  const dedupCheckingRef = useRef<boolean>(false);
  const dedupConflictRef = useRef<DedupConflictInfo | null>(null);
  const dedupSignatureRef = useRef<string>('');
  const dedupCheckSeqRef = useRef<number>(0);
  const dedupCheckTimerRef = useRef<number | null>(null);
  const lastDedupCheckedSignatureRef = useRef<string>('');
  type RecordStaleInfo = {
    recordId: string;
    message: string;
    cachedVersion?: number;
    serverVersion?: number;
    serverRow?: number;
  };
  const [recordStale, setRecordStale] = useState<RecordStaleInfo | null>(null);
  const recordStaleRef = useRef<RecordStaleInfo | null>(null);
  const submitPrecheckInFlightRef = useRef<boolean>(false);
  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false);
  const submitConfirmedRef = useRef(false);
  const submitPipelineInFlightRef = useRef(false);
  const updateRecordActionInFlightRef = useRef(false);
  const [selectedRecordId, setSelectedRecordId] = useState<string>(record?.id || '');
  const [selectedRecordSnapshot, setSelectedRecordSnapshot] = useState<WebFormSubmission | null>(record || null);
  const [recordLoadingId, setRecordLoadingId] = useState<string | null>(null);
  const [recordLoadError, setRecordLoadError] = useState<string | null>(null);
  const [optionState, setOptionState] = useState<OptionState>({});
  const [tooltipState, setTooltipState] = useState<Record<string, Record<string, string>>>({});
  const preloadPromisesRef = useRef<Record<string, Promise<void> | undefined>>({});
  const optionStateRef = useRef<OptionState>({});
  const tooltipStateRef = useRef<Record<string, Record<string, string>>>({});
  const recordFetchSeqRef = useRef(0);
  const [externalScrollAnchor, setExternalScrollAnchor] = useState<string | null>(null);
  const [lastSubmissionMeta, setLastSubmissionMeta] = useState<SubmissionMeta | null>(() =>
    record
      ? {
          id: record.id,
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
          status: record.status || null
        }
      : null
  );
  const [isMobile, setIsMobile] = useState<boolean>(false);
  const [isCompact, setIsCompact] = useState<boolean>(false);
  const [isLandscape, setIsLandscape] = useState<boolean>(false);
  const [debugEnabled] = useState<boolean>(() => detectDebug());
  const [autoSaveNoticeOpen, setAutoSaveNoticeOpen] = useState<boolean>(false);
  const autoSaveNoticeSeenRef = useRef<boolean>(false);
  const homeLoadStartedAtRef = useRef<number>(Date.now());
  const homeTimeToDataMeasuredRef = useRef(false);
  const openRecordPerfRef = useRef<{ recordId: string; startedAt: number; startMark: string } | null>(null);
  const backToHomePerfRef = useRef<{ trigger: string; startedAt: number; startMark: string } | null>(null);
  const logEvent = useCallback(
    (event: string, payload?: Record<string, unknown>) => {
      // Default diagnostics are gated behind detectDebug() to avoid noisy consoles.
      // Guided steps diagnostics are always enabled because they are essential for troubleshooting user flows.
      const alwaysLog =
        event.startsWith('steps.') ||
        event.startsWith('validation.navigate.') ||
        event.startsWith('optionFilter.') ||
        event.startsWith('paragraphDisclaimer.') ||
        event.startsWith('selectionEffects.');
      if ((!debugEnabled && !alwaysLog) || typeof console === 'undefined' || typeof console.info !== 'function') return;
      try {
        console.info('[ReactForm]', event, payload || {});
      } catch (_) {
        // ignore logging failures
      }
    },
    [debugEnabled]
  );
  const resolveUiErrorMessage = useCallback(
    (err: any, fallback: string) => resolveUserFacingErrorMessage(err, fallback),
    []
  );
  const resolveLogMessage = useCallback(
    (err: any, fallback: string) => (err?.message || err?.toString?.() || fallback).toString(),
    []
  );
  const perfEnabled = useMemo(() => {
    const tag = (envTag || '').toString().trim().toLowerCase();
    return tag.includes('staging');
  }, [envTag]);
  const perfMark = useCallback(
    (name: string) => {
      if (!perfEnabled) return;
      try {
        if (typeof performance !== 'undefined' && typeof performance.mark === 'function') {
          performance.mark(name);
        }
      } catch (_) {
        // ignore mark failures
      }
    },
    [perfEnabled]
  );
  const perfMeasure = useCallback(
    (name: string, startMark: string, endMark: string, payload?: Record<string, unknown>) => {
      if (!perfEnabled) return;
      let durationMs: number | null = null;
      try {
        if (typeof performance !== 'undefined' && typeof performance.measure === 'function') {
          performance.measure(name, startMark, endMark);
          const entries = performance.getEntriesByName(name, 'measure');
          const duration = entries.length ? entries[entries.length - 1].duration : null;
          durationMs = typeof duration === 'number' ? Math.round(duration) : null;
          if (typeof performance.clearMarks === 'function') {
            performance.clearMarks(startMark);
            performance.clearMarks(endMark);
          }
          if (typeof performance.clearMeasures === 'function') {
            performance.clearMeasures(name);
          }
        }
      } catch (_) {
        // ignore measure failures
      }
      if (typeof console !== 'undefined' && typeof console.info === 'function') {
        try {
          console.info('[ReactForm][perf]', name, { durationMs, ...(payload || {}) });
        } catch (_) {
          // ignore perf log failures
        }
      }
    },
    [perfEnabled]
  );

  const statusTransitions = definition.followup?.statusTransitions;
  const closedStatusLabel = useMemo(
    () => resolveStatusTransitionValue(statusTransitions, 'onClose', language, { includeDefaultOnClose: true }) || 'Closed',
    [language, statusTransitions]
  );
  const hasProgressStatus = useMemo(
    () =>
      hasStatusTransitionValue(statusTransitions, 'inProgress') ||
      hasStatusTransitionValue(statusTransitions, 'reOpened'),
    [statusTransitions]
  );
  const matchesClosedStatus = useCallback(
    (rawStatus: any) => matchesStatusTransition(rawStatus, statusTransitions, 'onClose', { includeDefaultOnClose: true }),
    [statusTransitions]
  );
  const resolveStatusAutoView = useCallback(
    (
      rawStatus: any,
      summaryEnabled: boolean
    ): { view: 'form' | 'summary'; statusKey: 'onClose' | 'inProgress' | 'reOpened' | 'other' | 'fallback' } => {
      if (matchesClosedStatus(rawStatus)) {
        return { view: summaryEnabled ? 'summary' : 'form', statusKey: 'onClose' };
      }
      if (matchesStatusTransition(rawStatus, statusTransitions, 'inProgress')) {
        return { view: 'form', statusKey: 'inProgress' };
      }
      if (matchesStatusTransition(rawStatus, statusTransitions, 'reOpened')) {
        return { view: 'form', statusKey: 'reOpened' };
      }
      if (!hasProgressStatus) {
        return { view: 'form', statusKey: 'fallback' };
      }
      return { view: summaryEnabled ? 'summary' : 'form', statusKey: 'other' };
    },
    [hasProgressStatus, matchesClosedStatus, statusTransitions]
  );
  const readyForProductionUnlockResolution = useMemo(() => {
    const globalAny = globalThis as any;
    const locationSearch = (() => {
      try {
        return globalAny?.location?.search || '';
      } catch (_) {
        return '';
      }
    })();
    const locationHash = (() => {
      try {
        return globalAny?.location?.hash || '';
      } catch (_) {
        return '';
      }
    })();
    const locationHref = (() => {
      try {
        return globalAny?.location?.href || '';
      } catch (_) {
        return '';
      }
    })();
    return resolveUnlockRecordId({
      requestParams: globalAny?.__WEB_FORM_REQUEST_PARAMS__,
      bootstrap: globalAny?.__WEB_FORM_BOOTSTRAP__,
      search: locationSearch,
      hash: locationHash,
      href: locationHref
    });
  }, []);
  const readyForProductionUnlockStatus = useMemo(
    () => resolveReadyForProductionUnlockStatus((definition as any)?.fieldDisableRules),
    [definition.fieldDisableRules]
  );

  // Feature overlays (kept out of App.tsx as much as possible; App only wires them).
  const customConfirm = useConfirmDialog({ closeOnKey: view, eventPrefix: 'ui.customConfirm', onDiagnostic: logEvent });
  const fieldChangeDialog = useFieldChangeDialog({ closeOnKey: view, eventPrefix: 'ui.fieldChangeDialog', onDiagnostic: logEvent });
  const updateRecordBusy = useBlockingOverlay({ eventPrefix: 'button.updateRecord.busy', onDiagnostic: logEvent });
  const navigateHomeBusy = useBlockingOverlay({ eventPrefix: 'navigate.home.busy', onDiagnostic: logEvent });
  const destructiveChangeBusy = useBlockingOverlay({ eventPrefix: 'fieldChange.destructive.busy', onDiagnostic: logEvent });
  const updateRecordBusyOpen = updateRecordBusy.state.open;

  useEffect(() => {
    if (typeof document === 'undefined' || !document.body) return;
    let rafId: number | null = null;
    const scan = () => {
      rafId = null;
      const buttons = Array.from(document.querySelectorAll('button')) as HTMLButtonElement[];
      buttons.forEach(button => {
        ensureButtonTextSpans(button);
        const wrapped = buttonHasWrappedText(button);
        button.classList.toggle('ck-button-wrap-left', wrapped);
      });
    };
    const schedule = () => {
      if (rafId !== null) return;
      rafId = globalThis.requestAnimationFrame(scan);
    };

    schedule();
    const observer = new MutationObserver(() => schedule());
    observer.observe(document.body, { subtree: true, childList: true, characterData: true });
    globalThis.addEventListener?.('resize', schedule as any);
    return () => {
      observer.disconnect();
      globalThis.removeEventListener?.('resize', schedule as any);
      if (rafId !== null) globalThis.cancelAnimationFrame(rafId);
    };
  }, [view, language]);

  const [systemActionGateDialog, setSystemActionGateDialog] = useState<{
    open: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    cancelLabel: string;
    showCancel: boolean;
    dismissOnBackdrop: boolean;
    showCloseButton: boolean;
    actionId: string | null;
    ruleId: string | null;
    trigger: string | null;
  }>({
    open: false,
    title: '',
    message: '',
    confirmLabel: '',
    cancelLabel: '',
    showCancel: false,
    dismissOnBackdrop: true,
    showCloseButton: true,
    actionId: null,
    ruleId: null,
    trigger: null
  });

  const [copyCurrentRecordDialog, setCopyCurrentRecordDialog] = useState<{
    open: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    cancelLabel: string;
    showCancel: boolean;
    dismissOnBackdrop: boolean;
    showCloseButton: boolean;
  }>({
    open: false,
    title: '',
    message: '',
    confirmLabel: '',
    cancelLabel: '',
    showCancel: false,
    dismissOnBackdrop: false,
    showCloseButton: false
  });

  const closeSystemActionGateDialog = useCallback(() => {
    setSystemActionGateDialog(prev => (prev.open ? { ...prev, open: false } : prev));
  }, []);

  const closeCopyCurrentRecordDialog = useCallback(() => {
    setCopyCurrentRecordDialog(prev => (prev.open ? { ...prev, open: false } : prev));
  }, []);

  const openSystemActionGateDialog = useCallback(
    (args: {
      actionId: string;
      ruleId?: string;
      trigger: 'onAttempt' | 'onEnable';
      title?: LocalizedString | string;
      message: LocalizedString | string;
      confirmLabel?: LocalizedString | string;
      cancelLabel?: LocalizedString | string;
      showCancel?: boolean;
      showCloseButton?: boolean;
      dismissOnBackdrop?: boolean;
    }) => {
      const title = resolveLocalizedString(
        args.title,
        language,
        tSystem('common.notice', language, 'Notice')
      ).toString();
      const message = resolveLocalizedString(args.message, language, '').toString();
      const confirmLabel = resolveLocalizedString(
        args.confirmLabel,
        language,
        tSystem('common.ok', language, 'OK')
      ).toString();
      const cancelLabel = resolveLocalizedString(
        args.cancelLabel,
        language,
        tSystem('common.cancel', language, 'Cancel')
      ).toString();
      const showCancel = args.showCancel !== false;
      const showCloseButton = args.showCloseButton !== false;
      const dismissOnBackdrop = args.dismissOnBackdrop !== false;

      setSystemActionGateDialog({
        open: true,
        title,
        message,
        confirmLabel,
        cancelLabel,
        showCancel,
        dismissOnBackdrop,
        showCloseButton,
        actionId: args.actionId,
        ruleId: args.ruleId || null,
        trigger: args.trigger
      });
      logEvent('ui.systemActionGate.dialog.open', {
        actionId: args.actionId,
        ruleId: args.ruleId || null,
        trigger: args.trigger
      });
    },
    [language, logEvent]
  );
  const autoSaveNoticeStorageKey = useMemo(() => {
    const key = (formKey || '').toString().trim() || 'default';
    return `ck.autosaveNotice.${key}`;
  }, [formKey]);

  const fieldChangePendingRef = useRef<Record<string, FieldChangePending>>({});
  const fieldChangeActiveRef = useRef<FieldChangePending | null>(null);
  const fieldChangeDateInitialEntryInProgressRef = useRef<Record<string, boolean>>({});
  const fieldChangeDateInitialEntryCompletedRef = useRef<Record<string, boolean>>({});
  const pendingDeletedRecordIdsRef = useRef<string[]>([]);
  const readyForProductionUnlockTransitionAttemptedRef = useRef<Set<string>>(new Set());
  const [pendingDeletedRecordApplyTick, setPendingDeletedRecordApplyTick] = useState(0);

  const resolveOptionGroupKey = (args: {
    targetScope: 'top' | 'row' | 'parent' | 'effect';
    contextGroupId?: string;
    effectGroupId?: string;
  }): string | undefined => {
    const contextGroupId = (args.contextGroupId || '').toString().trim();
    if (args.targetScope === 'top') return undefined;
    if (args.targetScope === 'effect' && args.effectGroupId) {
      const effectGroupId = args.effectGroupId.toString().trim();
      if (effectGroupId.includes('::')) return effectGroupId;
      if (!contextGroupId) return effectGroupId || undefined;
      const parsed = parseSubgroupKey(contextGroupId);
      if (parsed) return `${parsed.parentGroupId}::${effectGroupId}`;
      return effectGroupId || undefined;
    }
    if (!contextGroupId) return undefined;
    const parsed = parseSubgroupKey(contextGroupId);
    if (!parsed) return contextGroupId;
    if (args.targetScope === 'parent') return parsed.parentGroupId;
    return `${parsed.parentGroupId}::${parsed.subGroupId}`;
  };

  const buildFieldChangeDialogInputs = useCallback(
    (pending: FieldChangePending): { inputs: FieldChangeDialogInputState[]; values: Record<string, FieldValue> } => {
      const inputs: FieldChangeDialogInputState[] = [];
      const values: Record<string, FieldValue> = {};
      const dialogInputs = pending.dialog?.inputs || [];
      const selectionEffects = (pending.selectionEffects || []).filter(
        (effect): effect is SelectionEffect & { groupId: string } => !!effect?.groupId
      );
      const context = { scope: pending.scope, groupId: pending.groupId };

      const resolveTargetValue = (target: any): FieldValue | undefined => {
        if (!target) return undefined;
        if (target.scope === 'top') return valuesRef.current[target.fieldId];
        if (target.scope === 'row') {
          const rows = pending.groupId ? lineItemsRef.current[pending.groupId] || [] : [];
          const row = rows.find(r => r.id === pending.rowId);
          return row?.values?.[target.fieldId] as FieldValue;
        }
        if (target.scope === 'parent') {
          const parsed = pending.groupId ? parseSubgroupKey(pending.groupId) : null;
          if (parsed) {
            const parentRows = lineItemsRef.current[parsed.parentGroupId] || [];
            const parentRow = parentRows.find(r => r.id === parsed.parentRowId);
            return parentRow?.values?.[target.fieldId] as FieldValue;
          }
          return valuesRef.current[target.fieldId];
        }
        return undefined;
      };

      dialogInputs.forEach(inputCfg => {
        const inputId = (inputCfg?.id || '').toString().trim();
        if (!inputId || !inputCfg?.target) return;
        const target = inputCfg.target as any;
        const effect =
          target.scope === 'effect'
            ? selectionEffects.find(effectEntry => (effectEntry?.id || '').toString().trim() === (target.effectId || '').toString().trim())
            : undefined;
        const { question, field } = resolveTargetFieldConfig({
          definition,
          target,
          context,
          selectionEffects
        });
        const typeRaw = (
          (inputCfg as any).type ||
          (question as any)?.type ||
          (field as any)?.type ||
          'TEXT'
        )
          .toString()
          .trim()
          .toUpperCase();
        const type =
          typeRaw === 'PARAGRAPH'
            ? 'paragraph'
            : typeRaw === 'NUMBER'
              ? 'number'
              : typeRaw === 'CHOICE'
                ? 'choice'
                : typeRaw === 'CHECKBOX'
                  ? 'checkbox'
                  : typeRaw === 'DATE'
                    ? 'date'
                    : 'text';
        const fallbackLabel = question
          ? resolveLabel(question, languageRef.current)
          : resolveFieldLabel(field, languageRef.current, inputId);
        const label = resolveLocalizedString((inputCfg as any).label, languageRef.current, fallbackLabel || inputId).toString();
        const placeholder = resolveLocalizedString((inputCfg as any).placeholder, languageRef.current, '').toString().trim() || undefined;

        let options: FieldChangeDialogInputState['options'] = undefined;
        if (type === 'choice' || type === 'checkbox') {
          const optionGroupKey = resolveOptionGroupKey({
            targetScope: target.scope,
            contextGroupId: pending.groupId,
            effectGroupId: effect?.groupId
          });
          const optionSet =
            question
              ? optionState[optionKey(question.id)] || toOptionSet(question as any)
              : field
                ? optionState[optionKey(field.id, optionGroupKey)] || toOptionSet(field as any)
                : undefined;
          if (optionSet && optionSet.en) {
            const items = buildLocalizedOptions(optionSet as any, optionSet.en as any, languageRef.current);
            options = items.map(item => ({ value: item.value, label: item.label }));
          }
        }

        inputs.push({
          id: inputId,
          label,
          placeholder,
          type,
          required: (inputCfg as any).required === true,
          options
        });
        const initial = resolveTargetValue(target);
        if (initial !== undefined) {
          values[inputId] = initial;
        }
      });

      return { inputs, values };
    },
    [definition, optionState, resolveOptionGroupKey]
  );

  const revertFieldChangePending = useCallback(
    (pending: FieldChangePending, reason: string, extra?: Record<string, unknown>) => {
      setValues(pending.prevSnapshot.values);
      setLineItems(pending.prevSnapshot.lineItems);
      valuesRef.current = pending.prevSnapshot.values;
      lineItemsRef.current = pending.prevSnapshot.lineItems;
      dedupHoldRef.current = false;
      autoSaveDirtyRef.current = pending.autoSaveSnapshot.dirty;
      autoSaveQueuedRef.current = pending.autoSaveSnapshot.queued;
      setDraftSave({ phase: autoSaveDirtyRef.current ? 'dirty' : 'idle' });
      fieldChangeActiveRef.current = null;
      delete fieldChangePendingRef.current[pending.fieldPath];
      logEvent('fieldChangeDialog.reverted', {
        reason,
        fieldPath: pending.fieldPath,
        fieldId: pending.fieldId,
        groupId: pending.groupId || null,
        rowId: pending.rowId || null,
        ...extra
      });
    },
    [logEvent, setLineItems, setValues]
  );

  const triggerDedupDeleteOnKeyChange = useCallback(
    async (source: string, extra?: Record<string, unknown>): Promise<boolean> => {
      const dedupDeleteOnKeyChangeEnabledLocal =
        (definition as any)?.dedupDeleteOnKeyChange === true || (definition as any)?.dedupRecreateOnKeyChange === true;
      if (!dedupDeleteOnKeyChangeEnabledLocal) return false;
      if (submittingRef.current) return false;
      if (dedupDeleteOnKeyChangeInFlightRef.current) return false;
      const extraMeta = extra ? { ...extra } : {};
      const forceDelete = (extraMeta as any).force === true;
      if ((extraMeta as any).force !== undefined) delete (extraMeta as any).force;

      const existingRecordId = resolveExistingRecordId({
        selectedRecordId: selectedRecordIdRef.current,
        selectedRecordSnapshot: selectedRecordSnapshotRef.current,
        lastSubmissionMetaId: lastSubmissionMetaRef.current?.id || null
      });
      if (!existingRecordId) return false;

      const currentFingerprint = computeDedupKeyFingerprint((definition as any)?.dedupRules, valuesRef.current as any);
      const baselineFingerprint = (dedupKeyFingerprintBaselineRef.current || '').toString();
      if (!forceDelete && (!baselineFingerprint || baselineFingerprint === currentFingerprint)) return false;

      const previousDedupHold = dedupHoldRef.current;
      dedupDeleteOnKeyChangeInFlightRef.current = true;
      dedupHoldRef.current = true;
      autoSaveDirtyRef.current = false;
      autoSaveQueuedRef.current = false;
      if (autoSaveTimerRef.current) {
        globalThis.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      logEvent('dedupDeleteOnKeyChange.delete.start', {
        source,
        recordId: existingRecordId,
        forceDelete,
        ...extraMeta
      });
      try {
        const waitStartedAt = Date.now();
        if (autoSaveInFlightRef.current || uploadQueueRef.current.size > 0) {
          logEvent('dedupDeleteOnKeyChange.delete.waitBackground.start', {
            source,
            recordId: existingRecordId,
            autosaveInFlight: autoSaveInFlightRef.current,
            uploadsInFlight: uploadQueueRef.current.size,
            forceDelete,
            ...extraMeta
          });
        }
        while (autoSaveInFlightRef.current || uploadQueueRef.current.size > 0) {
          if (Date.now() - waitStartedAt > 12_000) {
            logEvent('dedupDeleteOnKeyChange.delete.waitBackground.timeout', {
              source,
              recordId: existingRecordId,
              durationMs: Date.now() - waitStartedAt,
              autosaveInFlight: autoSaveInFlightRef.current,
              uploadsInFlight: uploadQueueRef.current.size,
              forceDelete,
              ...extraMeta
            });
            return false;
          }
          await new Promise<void>(resolve => globalThis.setTimeout(resolve, 80));
        }
        if (Date.now() - waitStartedAt > 0) {
          logEvent('dedupDeleteOnKeyChange.delete.waitBackground.done', {
            source,
            recordId: existingRecordId,
            durationMs: Date.now() - waitStartedAt,
            forceDelete,
            ...extraMeta
          });
        }

        const payload = buildDraftPayload({
          definition,
          formKey,
          language: languageRef.current,
          values: valuesRef.current,
          lineItems: lineItemsRef.current,
          existingRecordId
        }) as any;
        payload.__ckSaveMode = 'draft';
        payload.__ckDeleteRecordId = existingRecordId;
        const baseVersion = recordDataVersionRef.current;
        if (Number.isFinite(Number(baseVersion)) && Number(baseVersion) > 0) {
          payload.__ckClientDataVersion = Number(baseVersion);
        }

        const res = await submit(payload);
        if (!res?.success) {
          logEvent('dedupDeleteOnKeyChange.delete.failed', {
            source,
            recordId: existingRecordId,
            message: (res?.message || 'Failed to delete previous record.').toString(),
            forceDelete,
            ...extraMeta
          });
          return false;
        }

        setSelectedRecordId('');
        selectedRecordIdRef.current = '';
        setSelectedRecordSnapshot(null);
        selectedRecordSnapshotRef.current = null;
        setLastSubmissionMeta(null);
        lastSubmissionMetaRef.current = null;
        recordDataVersionRef.current = null;
        recordRowNumberRef.current = null;
        recordStaleRef.current = null;
        setRecordStale(null);
        recordSessionRef.current += 1;
        createFlowRef.current = true;
        createFlowUserEditedRef.current = false;
        autoSaveUserEditedRef.current = false;
        dedupHoldRef.current = false;
        dedupBaselineSignatureRef.current = '';
        dedupKeyFingerprintBaselineRef.current = '';
        autoSaveDirtyRef.current = false;
        autoSaveQueuedRef.current = false;
        if (autoSaveTimerRef.current) {
          globalThis.clearTimeout(autoSaveTimerRef.current);
          autoSaveTimerRef.current = null;
        }
        setDraftSave({ phase: 'idle' });
        pendingDeletedRecordIdsRef.current.push(existingRecordId);
        setPendingDeletedRecordApplyTick(tick => tick + 1);

        logEvent('dedupDeleteOnKeyChange.delete.success', {
          source,
          deletedRecordId: existingRecordId,
          forceDelete,
          ...extraMeta
        });
        return true;
      } catch (err: any) {
        logEvent('dedupDeleteOnKeyChange.delete.exception', {
          source,
          recordId: existingRecordId,
          message: resolveLogMessage(err, 'Failed to delete previous record.'),
          forceDelete,
          ...extraMeta
        });
        return false;
      } finally {
        if (dedupHoldRef.current) {
          dedupHoldRef.current = previousDedupHold;
        }
        dedupDeleteOnKeyChangeInFlightRef.current = false;
      }
    },
    [definition, formKey, logEvent, setSelectedRecordId, submit]
  );

  const handleFieldChangeDialogConfirm = useCallback(
    async (inputValues: Record<string, FieldValue>) => {
      const pending = fieldChangeActiveRef.current;
      if (!pending) return;
      const lockSeq = destructiveChangeBusy.lock({
        title: tSystem('common.loading', languageRef.current, 'Loading…'),
        message: tSystem('navigation.waitSaving', languageRef.current, 'Please wait while we save your changes...'),
        kind: 'fieldChangeDialog',
        diagnosticMeta: { fieldPath: pending.fieldPath, fieldId: pending.fieldId }
      });
      try {
      const dialogCfg = pending.dialog;
      const baseTargetScope: 'top' | 'row' = pending.scope === 'top' ? 'top' : 'row';
      const updates: FieldChangeDialogTargetUpdate[] = [
        {
          target: { scope: baseTargetScope, fieldId: pending.fieldId },
          value: pending.nextValue
        }
      ];
      (dialogCfg.inputs || []).forEach(inputCfg => {
        const inputId = (inputCfg?.id || '').toString().trim();
        if (!inputId) return;
        if (!inputCfg?.target) return;
        const value = inputValues[inputId];
        if (value === undefined) return;
        updates.push({ target: inputCfg.target, value });
      });

      const applied = applyFieldChangeDialogTargets({
        values: valuesRef.current,
        lineItems: lineItemsRef.current,
        updates,
        context: { scope: pending.scope, groupId: pending.groupId, rowId: pending.rowId }
      });
      const mapped = applyValueMapsToForm(definition, applied.values, applied.lineItems, { mode: 'change' });
      const dedupDeleteEnabled =
        (definition as any)?.dedupDeleteOnKeyChange === true || (definition as any)?.dedupRecreateOnKeyChange === true;
      const topFieldId = pending.scope === 'top' ? (pending.fieldId || '').toString() : '';
      const isTopDedupKeyChange = Boolean(
        topFieldId &&
          (dedupKeyFieldIdsRef.current[topFieldId] || dedupKeyFieldIdsRef.current[topFieldId.toLowerCase()]) &&
          dedupDeleteEnabled
      );

      const dedupMode = (dialogCfg.dedupMode || 'auto') as 'auto' | 'always' | 'never';
      const hasDedupKeyUpdate = updates.some(update => {
        if (update.target.scope !== 'top') return false;
        const fid = (update.target.fieldId || '').toString();
        if (!fid) return false;
        return Boolean(dedupKeyFieldIdsRef.current[fid] || dedupKeyFieldIdsRef.current[fid.toLowerCase()]);
      });
      const shouldRunFieldDedup = dedupMode === 'always' || (dedupMode === 'auto' && hasDedupKeyUpdate);

      if (shouldRunFieldDedup) {
        const signature = computeDedupSignatureFromValues((definition as any)?.dedupRules, mapped.values as any);
        if (signature) {
          const startedAt = Date.now();
          setDedupChecking(true);
          logEvent('dedup.fieldChange.check.start', {
            source: 'fieldChangeDialog',
            fieldId: pending.fieldId,
            signatureLen: signature.length
          });
          try {
            const payload = buildDraftPayload({
              definition,
              formKey,
              language: languageRef.current,
              values: mapped.values,
              lineItems: mapped.lineItems
            }) as any;
            const res = await checkDedupConflictApi(payload);
            if (res?.success) {
              const conflict: any = (res as any)?.conflict || null;
              if (conflict?.existingRecordId) {
                const info: DedupConflictInfo = {
                  ruleId: conflict.ruleId,
                  message: conflict.message,
                  existingRecordId: conflict.existingRecordId,
                  existingRowNumber: conflict.existingRowNumber
                };
                setDedupNotice(info);
                setDedupConflict(info);
                setDedupChecking(false);
                logEvent('dedup.fieldChange.rejected', {
                  fieldPath: pending.fieldPath,
                  fieldId: pending.fieldId,
                  ruleId: info.ruleId || null,
                  existingRecordId: info.existingRecordId || null
                });
                revertFieldChangePending(pending, 'dedupConflict', { ruleId: info.ruleId || null });
                return;
              }
            }
            logEvent('dedup.fieldChange.check.ok', { source: 'fieldChangeDialog', fieldId: pending.fieldId });
          } catch (err: any) {
            const msg = (err?.message || err?.toString?.() || 'Failed').toString();
            logEvent('dedup.fieldChange.check.exception', {
              source: 'fieldChangeDialog',
              fieldId: pending.fieldId,
              message: msg
            });
          } finally {
            setDedupChecking(false);
            logEvent('dedup.fieldChange.check.end', {
              source: 'fieldChangeDialog',
              durationMs: Date.now() - startedAt
            });
          }
        }
      }

      setValues(mapped.values);
      setLineItems(mapped.lineItems);
      valuesRef.current = mapped.values;
      lineItemsRef.current = mapped.lineItems;
      dedupHoldRef.current = isTopDedupKeyChange;
      if (isTopDedupKeyChange) {
        autoSaveDirtyRef.current = false;
        autoSaveQueuedRef.current = false;
        setDraftSave({ phase: 'paused' });
      } else {
        autoSaveDirtyRef.current = true;
        setDraftSave({ phase: 'dirty' });
      }

      const selectionEffects = pending.selectionEffects || [];
      if (selectionEffects.length && pending.effectQuestion) {
        const lineItemContext =
          pending.scope === 'line' && pending.groupId && pending.rowId
            ? {
                groupId: pending.groupId,
                rowId: pending.rowId,
                rowValues:
                  (mapped.lineItems[pending.groupId] || []).find(r => r.id === pending.rowId)?.values ||
                  (lineItemsRef.current[pending.groupId] || []).find(r => r.id === pending.rowId)?.values ||
                  {}
              }
            : undefined;
        runSelectionEffectsHelper({
          definition,
          question: pending.effectQuestion,
          value: pending.nextValue,
          language,
          values: mapped.values,
          lineItems: mapped.lineItems,
          setValues,
          setLineItems,
          logEvent,
          opts: lineItemContext ? { lineItem: lineItemContext } : undefined,
          effectOverrides: applied.effectOverrides,
          onRowAppended: ({ anchor, targetKey, rowId, source }) => {
            setExternalScrollAnchor(anchor);
            logEvent('ui.selectionEffect.rowAppended', { anchor, targetKey, rowId, source: source || null });
          }
        });
      }

      if (isTopDedupKeyChange) {
        await triggerDedupDeleteOnKeyChange('fieldChangeDialog.confirm', {
          fieldId: topFieldId,
          fieldPath: pending.fieldPath
        });
      }

      fieldChangeActiveRef.current = null;
      delete fieldChangePendingRef.current[pending.fieldPath];
      logEvent('fieldChangeDialog.applied', {
        fieldPath: pending.fieldPath,
        fieldId: pending.fieldId,
        groupId: pending.groupId || null,
        rowId: pending.rowId || null
      });
      } finally {
        destructiveChangeBusy.unlock(lockSeq, { source: 'fieldChangeDialog' });
      }
    },
    [
      definition,
      destructiveChangeBusy,
      formKey,
      language,
      logEvent,
      revertFieldChangePending,
      setExternalScrollAnchor,
      setLineItems,
      setValues,
      triggerDedupDeleteOnKeyChange
    ]
  );

  const handleFieldChangeDialogCancel = useCallback(() => {
    const pending = fieldChangeActiveRef.current;
    if (!pending) return;
    const cancelAction = resolveFieldChangeDialogCancelAction(pending.dialog);
    revertFieldChangePending(
      pending,
      cancelAction === 'discardDraftAndGoHome' ? 'cancel.discardDraftAndGoHome' : 'cancel',
      { cancelAction }
    );
    if (cancelAction !== 'discardDraftAndGoHome') return;
    if (autoSaveTimerRef.current) {
      globalThis.clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    dedupHoldRef.current = false;
    autoSaveDirtyRef.current = false;
    autoSaveQueuedRef.current = false;
    setDraftSave({ phase: 'idle' });
    setView('list');
    setStatus(null);
    setStatusLevel(null);
    logEvent('fieldChangeDialog.cancelAction.discardDraftAndGoHome', {
      fieldPath: pending.fieldPath,
      fieldId: pending.fieldId,
      groupId: pending.groupId || null,
      rowId: pending.rowId || null
    });
  }, [logEvent, revertFieldChangePending]);

  const openFieldChangeDialog = useCallback(
    (pending: FieldChangePending) => {
      if (!pending || fieldChangeDialog.state.open) return;
      fieldChangeActiveRef.current = pending;
      const dialogCfg = pending.dialog;
      const title = resolveLocalizedString(
        dialogCfg.title,
        languageRef.current,
        tSystem('fieldChangeDialog.title', languageRef.current, 'Confirm change')
      );
      const message = resolveLocalizedString(
        dialogCfg.message,
        languageRef.current,
        tSystem('fieldChangeDialog.message', languageRef.current, 'Review this change before continuing.')
      );
      const confirmLabel = resolveLocalizedString(
        dialogCfg.confirmLabel,
        languageRef.current,
        tSystem('common.confirm', languageRef.current, 'Confirm')
      );
      const cancelLabel = resolveLocalizedString(
        dialogCfg.cancelLabel,
        languageRef.current,
        tSystem('common.cancel', languageRef.current, 'Cancel')
      );

      if (autoSaveTimerRef.current) {
        globalThis.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      dedupHoldRef.current = true;
      setDraftSave({ phase: 'paused' });

      const resolvedInputs = buildFieldChangeDialogInputs(pending);
      fieldChangeDialog.open({
        title,
        message,
        confirmLabel,
        cancelLabel,
        inputs: resolvedInputs.inputs,
        values: resolvedInputs.values,
        kind: 'fieldChange',
        refId: pending.fieldPath,
        onConfirm: handleFieldChangeDialogConfirm,
        onCancel: handleFieldChangeDialogCancel
      });
    },
    [buildFieldChangeDialogInputs, fieldChangeDialog, handleFieldChangeDialogCancel, handleFieldChangeDialogConfirm]
  );

  const handleUserEdit = useCallback(
    (args: {
      scope: 'top' | 'line';
      fieldPath: string;
      fieldId?: string;
      groupId?: string;
      rowId?: string;
      event?: 'change' | 'blur';
      tag?: string;
      inputType?: string;
      nextValue?: FieldValue;
    }) => {
      try {
        const fieldPath = (args?.fieldPath || '').toString();
        const fieldId = (args?.fieldId || '').toString();
        const fieldKey = fieldPath || fieldId;
        const autoSaveDirtyBefore = autoSaveDirtyRef.current;
        const autoSaveQueuedBefore = autoSaveQueuedRef.current;
        // Clear stale dedup notice on any new user edit.
        if (dedupNotice) setDedupNotice(null);

        // Arm autosave on first user edit during create-flow (segmented controls won't emit native input events).
        if (createFlowRef.current && !createFlowUserEditedRef.current) {
          createFlowUserEditedRef.current = true;
          logEvent('autosave.armed.userEdit', { fieldPath: fieldPath || fieldId || null });
        }
        if (!autoSaveUserEditedRef.current) {
          autoSaveUserEditedRef.current = true;
        }
        lastUserInteractionRef.current = Date.now();

        // Mark dirty immediately on user edits so navigation handlers can flush autosave
        // even if the debounced autosave effect hasn't run yet.
        autoSaveDirtyRef.current = true;

        // For top-level dedup keys (reject rules): hold autosave; run dedup check on blur only.
        const isDedupKey =
          (fieldId && dedupKeyFieldIdsRef.current[fieldId]) || (fieldPath && dedupKeyFieldIdsRef.current[fieldPath]);

        // Field-level guarded change dialog (ck-47)
        if (args?.event === 'change' && fieldKey && args.nextValue !== undefined) {
          const source = resolveFieldChangeDialogSource({
            definition,
            scope: args.scope,
            fieldId,
            groupId: args.groupId
          });
          const changeType = (source?.question?.type || source?.field?.type || '').toString().toUpperCase();
          const prevValue =
            args.scope === 'line' && args.groupId && args.rowId
              ? (lineItemsRef.current[args.groupId] || []).find(row => row.id === args.rowId)?.values?.[fieldId]
              : valuesRef.current[fieldId];
          const suppressInitialDateDialog = shouldSuppressInitialDateChangeDialog({
            scope: args.scope,
            fieldType: changeType,
            fieldPath: fieldKey,
            fieldId,
            prevValue: prevValue as FieldValue,
            nextValue: args.nextValue as FieldValue,
            baselineValues: lastAutoSaveSeenRef.current?.values || null,
            initialEntryInProgressByFieldPath: fieldChangeDateInitialEntryInProgressRef.current,
            initialEntryCompletedByFieldPath: fieldChangeDateInitialEntryCompletedRef.current
          });
          const hasNonEmptyChange =
            !isEmptyValue(prevValue as FieldValue) &&
            !isEmptyValue(args.nextValue as FieldValue) &&
            prevValue !== args.nextValue;
          const dialogCfg = source?.dialog;
          if (dialogCfg?.when && hasNonEmptyChange && !suppressInitialDateDialog) {
            const shouldTrigger = evaluateFieldChangeDialogWhen({
              when: dialogCfg.when,
              scope: args.scope,
              fieldId,
              groupId: args.groupId,
              rowId: args.rowId,
              nextValue: args.nextValue,
              values: valuesRef.current,
              lineItems: lineItemsRef.current
            });
            if (shouldTrigger) {
              const existing = fieldChangePendingRef.current[fieldKey];
              const prevSnapshot = existing?.prevSnapshot || {
                values: valuesRef.current,
                lineItems: lineItemsRef.current
              };
              const pending: FieldChangePending = {
                fieldPath: fieldKey,
                scope: args.scope,
                fieldId,
                groupId: args.groupId,
                rowId: args.rowId,
                dialog: dialogCfg,
                effectQuestion: source?.question || (source?.field as any) || undefined,
                selectionEffects: (source?.question || source?.field)?.selectionEffects || [],
                prevSnapshot,
                nextValue: args.nextValue,
                autoSaveSnapshot: {
                  dirty: autoSaveDirtyBefore,
                  queued: autoSaveQueuedBefore,
                  lastSeen: lastAutoSaveSeenRef.current
                }
              };
              fieldChangePendingRef.current[fieldKey] = pending;
              logEvent('fieldChangeDialog.pending', {
                fieldPath: fieldKey,
                fieldId,
                groupId: args.groupId || null,
                rowId: args.rowId || null
              });
              const openOnChange =
                changeType === 'CHOICE' || changeType === 'CHECKBOX' || changeType === 'FILE_UPLOAD';
              if (openOnChange) {
                openFieldChangeDialog(pending);
              }
            } else if (fieldChangePendingRef.current[fieldKey]) {
              delete fieldChangePendingRef.current[fieldKey];
              logEvent('fieldChangeDialog.pending.cleared', { fieldPath: fieldKey, fieldId });
            }
          } else if (fieldChangePendingRef.current[fieldKey]) {
            delete fieldChangePendingRef.current[fieldKey];
          }
        }

        if (args?.event === 'blur' && fieldKey) {
          const finalizedInitialDateEntry = finalizeInitialDateChangeDialogEntry({
            fieldPath: fieldKey,
            initialEntryInProgressByFieldPath: fieldChangeDateInitialEntryInProgressRef.current,
            initialEntryCompletedByFieldPath: fieldChangeDateInitialEntryCompletedRef.current
          });
          if (finalizedInitialDateEntry && fieldChangePendingRef.current[fieldKey]) {
            delete fieldChangePendingRef.current[fieldKey];
            logEvent('fieldChangeDialog.pending.cleared', {
              fieldPath: fieldKey,
              fieldId,
              reason: 'initialDateEntry.completed'
            });
            return;
          }
          const pending = fieldChangePendingRef.current[fieldKey];
          if (pending) {
            const validity = evaluateFieldChangeDialogWhenWithFallback({
              when: pending.dialog?.when,
              scope: pending.scope,
              fieldId: pending.fieldId,
              groupId: pending.groupId,
              rowId: pending.rowId,
              nextValue: pending.nextValue,
              values: valuesRef.current,
              lineItems: lineItemsRef.current,
              fallbackValues: pending.prevSnapshot.values,
              fallbackLineItems: pending.prevSnapshot.lineItems
            });
            if (!validity.matches) {
              delete fieldChangePendingRef.current[fieldKey];
              logEvent('fieldChangeDialog.pending.cleared', { fieldPath: fieldKey, fieldId });
              return;
            }
            if (validity.matchedOn === 'fallback') {
              logEvent('fieldChangeDialog.pending.revalidatedFromSnapshot', {
                fieldPath: fieldKey,
                fieldId: pending.fieldId,
                groupId: pending.groupId || null,
                rowId: pending.rowId || null
              });
            }
            openFieldChangeDialog(pending);
            return;
          }
        }

        if (fieldKey && fieldChangePendingRef.current[fieldKey]) {
          // Skip standard dedup blur logic while a guarded change is pending.
          return;
        }

        if (args?.scope === 'top' && isDedupKey) {
          if (dedupConflictRef.current) {
            dedupConflictRef.current = null;
            setDedupConflict(null);
          }
          if (!dedupHoldRef.current) {
            // Hold autosave while dedup-key edits settle; precheck runs once keys are complete.
            dedupHoldRef.current = true;
            autoSaveDirtyRef.current = true;
            if (autoSaveTimerRef.current) {
              globalThis.clearTimeout(autoSaveTimerRef.current);
              autoSaveTimerRef.current = null;
            }
            setDraftSave({ phase: 'idle' });
            logEvent('autosave.hold.dedupKeyChange', {
              fieldId: fieldId || fieldPath || null,
              fieldPath: fieldPath || fieldId || null,
              event: args?.event || null
            });
          }
          if (args?.event === 'blur') {
            void triggerDedupDeleteOnKeyChange('dedupKey.blur', {
              fieldId: fieldId || null,
              fieldPath: fieldPath || null
            });
          }
        }

        // Warnings UX: recompute and show inline warnings for the field that just blurred.
        if (args?.event === 'blur' && fieldPath) {
          warningTouchedRef.current.add(fieldPath);
          try {
            const warnings = collectValidationWarnings({
              definition,
              language: languageRef.current,
              values: valuesRef.current,
              lineItems: lineItemsRef.current,
              phase: 'submit',
              uiView: 'edit'
            });
            const touched = warningTouchedRef.current;
            const byField: Record<string, string[]> = {};
            Object.keys(warnings.byField || {}).forEach(k => {
              if (touched.has(k)) byField[k] = (warnings.byField as any)[k];
            });
            setValidationWarnings({ top: warnings.top || [], byField });
            logEvent('validation.warnings.blur', {
              fieldPath,
              tag: args?.tag || null,
              inputType: args?.inputType || null,
              touchedCount: touched.size,
              visibleFieldCount: Object.keys(byField).length,
              totalTopCount: (warnings.top || []).length
            });
          } catch (err: any) {
            // Never block editing because of warning computation bugs.
            logEvent('validation.warnings.blur.failed', { message: err?.message || err || 'unknown' });
          }
        }
      } catch (_) {
        // ignore
      }
    },
    [dedupNotice, definition, logEvent, openFieldChangeDialog, triggerDedupDeleteOnKeyChange]
  );

  useEffect(() => {
    dedupCheckingRef.current = dedupChecking;
  }, [dedupChecking]);

  useEffect(() => {
    dedupConflictRef.current = dedupConflict;
  }, [dedupConflict]);

  useEffect(() => {
    recordStaleRef.current = recordStale;
  }, [recordStale]);

  const portraitOnlyEnabled = definition.portraitOnly === true;
  const blockLandscape = portraitOnlyEnabled && isMobile && isLandscape;

  useEffect(() => {
    if (!portraitOnlyEnabled) return;
    logEvent('ui.portraitOnly.enabled', { enabled: true });

    // Best-effort orientation lock (works in some browsers, usually requires full-screen / user gesture).
    try {
      const screenAny = (globalThis as any).screen;
      const orientation = screenAny?.orientation;
      if (orientation && typeof orientation.lock === 'function') {
        Promise.resolve()
          .then(() => orientation.lock('portrait'))
          .then(() => logEvent('ui.orientation.lock.ok', { mode: 'portrait' }))
          .catch((err: any) =>
            logEvent('ui.orientation.lock.failed', {
              mode: 'portrait',
              message: (err?.message || err?.toString?.() || 'lock failed').toString()
            })
          );
      } else {
        logEvent('ui.orientation.lock.unavailable', { mode: 'portrait' });
      }
    } catch (err: any) {
      logEvent('ui.orientation.lock.failed', {
        mode: 'portrait',
        message: (err?.message || err?.toString?.() || 'lock failed').toString()
      });
    }
  }, [logEvent, portraitOnlyEnabled]);

  useEffect(() => {
    if (!portraitOnlyEnabled) return;
    if (!isMobile) return;
    logEvent(blockLandscape ? 'ui.orientation.blocked' : 'ui.orientation.allowed', {
      landscape: isLandscape,
      blocked: blockLandscape
    });
  }, [blockLandscape, isLandscape, isMobile, logEvent, portraitOnlyEnabled]);

  // Prefetch Drive/HTML templates in the background so report/summary rendering can skip
  // "first read" latency, but never block the initial list view.
  useEffect(() => {
    // Only relevant once the user is in a form/summary context.
    if (view !== 'form' && view !== 'summary') return;
    const key = (formKey || '').toString().trim();
    if (!key) return;
    if (templatePrefetchFormKeyRef.current === key) return;
    templatePrefetchFormKeyRef.current = key;

    const run = () => {
      logEvent('templates.prefetch.start', { formKey: key, view });
      prefetchTemplatesApi(key)
        .then(res => {
          logEvent('templates.prefetch.ok', {
            success: Boolean(res?.success),
            message: (res as any)?.message || null,
            counts: (res as any)?.counts || null
          });
        })
        .catch(err => {
          const msg = (err as any)?.message?.toString?.() || (err as any)?.toString?.() || 'Failed to prefetch templates.';
          logEvent('templates.prefetch.failed', { formKey: key, message: msg });
        });
    };

    try {
      if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
        (window as any).requestIdleCallback(run, { timeout: 3000 });
      } else {
        // Defer slightly to avoid competing with the first paint.
        setTimeout(run, 1500);
      }
    } catch (_) {
      run();
    }
  }, [formKey, view, logEvent]);

  useEffect(() => {
    // Enforce language config changes from the definition.
    if (!allowLanguageSelection) {
      if (language !== defaultLanguage) {
        setLanguage(defaultLanguage);
        logEvent('i18n.language.forcedDefault', { defaultLanguage, reason: 'languageSelectorDisabled' });
      }
      return;
    }
    const normalized = normalizeLanguage(language as any);
    if (!availableLanguages.includes(normalized as any)) {
      setLanguage(defaultLanguage);
      logEvent('i18n.language.reset', { prev: language, defaultLanguage, availableLanguages });
    }
  }, [allowLanguageSelection, availableLanguages, defaultLanguage, language, logEvent]);

  const formSubmitActionRef = useRef<(() => void) | null>(null);
  const formBackActionRef = useRef<(() => void) | null>(null);
  const orderedEntryEnabled = definition.submitValidation?.enforceFieldOrder === true;
  const [guidedUiState, setGuidedUiState] = useState<{
    activeStepId: string | null;
    activeStepIndex: number;
    stepCount: number;
    isFirst: boolean;
    isFinal: boolean;
    forwardGateSatisfied: boolean;
    backAllowed: boolean;
    backVisible: boolean;
    backLabel: string;
    stepSubmitLabel?: string | LocalizedString;
  } | null>(null);
  const [formIsValid, setFormIsValid] = useState<boolean>(() => (orderedEntryEnabled ? false : true));
  const vvBottomRef = useRef<number>(-1);
  const bottomBarHeightRef = useRef<number>(-1);
  const [draftSave, setDraftSave] = useState<{ phase: DraftSavePhase; message?: string; updatedAt?: string }>(() => ({
    phase: 'idle'
  }));

  useEffect(() => {
    if (!orderedEntryEnabled) {
      setFormIsValid(true);
    }
  }, [orderedEntryEnabled]);

  const autoSaveTimerRef = useRef<number | null>(null);
  const autoSaveDirtyRef = useRef<boolean>(false);
  const autoSaveInFlightRef = useRef<boolean>(false);
  const autoSaveQueuedRef = useRef<boolean>(false);
  const autoSaveUserEditedRef = useRef<boolean>(false);
  const [autoSaveHold, setAutoSaveHold] = useState<{ hold: boolean; reason?: string }>(() => ({ hold: false }));
  const autoSaveHoldRef = useRef<{ hold: boolean; reason?: string }>({ hold: false });
  const prevAutoSaveHoldRef = useRef<boolean>(false);
  const lastUserInteractionRef = useRef<number>(0);
  const lastAutoSaveSeenRef = useRef<{ values: Record<string, FieldValue>; lineItems: LineItemState } | null>(null);
  /**
   * Monotonic session counter used to ignore late async results (autosave, uploads, etc)
   * after the user switches to a different record/create flow.
   */
  const recordSessionRef = useRef<number>(0);
  const uploadQueueRef = useRef<Map<string, Promise<{ success: boolean; message?: string }>>>(new Map());
  const [uploadQueueSize, setUploadQueueSize] = useState<number>(() => uploadQueueRef.current.size);
  const listOpenViewSubmitTimerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);
  const summarySubmitIntentRef = useRef<boolean>(false);
  const navigateHomeInFlightRef = useRef<boolean>(false);
  const syncUploadQueueSize = useCallback(() => {
    setUploadQueueSize(uploadQueueRef.current.size);
  }, []);

  useEffect(() => {
    autoSaveHoldRef.current = autoSaveHold;
  }, [autoSaveHold]);

  const setAutoSaveHoldFromUi = useCallback(
    (hold: boolean, meta?: { reason?: string }) => {
      const nextHold = !!hold;
      const nextReason = (meta?.reason || '').toString().trim();
      setAutoSaveHold(prev => {
        if (prev.hold === nextHold && (prev.reason || '') === nextReason) return prev;
        return { hold: nextHold, reason: nextReason || undefined };
      });
      if (nextHold) {
        if (autoSaveTimerRef.current) {
          globalThis.clearTimeout(autoSaveTimerRef.current);
          autoSaveTimerRef.current = null;
        }
        logEvent('autosave.hold.enabled', { reason: nextReason || null });
        return;
      }
      logEvent('autosave.hold.disabled', { reason: nextReason || null });
    },
    [logEvent]
  );

  // Keep latest values in refs so autosave can run without stale closures.
  const viewRef = useRef<View>(view);
  const submittingRef = useRef<boolean>(submitting);
  const valuesRef = useRef<Record<string, FieldValue>>(values);
  const lineItemsRef = useRef<LineItemState>(lineItems);
  const languageRef = useRef<LangCode>(language);
  const selectedRecordIdRef = useRef<string>(selectedRecordId);
  const selectedRecordSnapshotRef = useRef<WebFormSubmission | null>(selectedRecordSnapshot);
  const lastSubmissionMetaRef = useRef<SubmissionMeta | null>(lastSubmissionMeta);
  // Tracks the last known server-owned dataVersion for the currently open record (used for optimistic locking).
  const recordDataVersionRef = useRef<number | null>(
    record && Number.isFinite(Number((record as any).dataVersion)) ? Number((record as any).dataVersion) : null
  );
  // Tracks the last known rowNumber for the currently open record (used for fast O(1) version checks via the index sheet).
  const recordRowNumberRef = useRef<number | null>(
    record && Number.isFinite(Number((record as any).__rowNumber)) ? Number((record as any).__rowNumber) : null
  );
  /**
   * Tracks whether the current form session represents a "create new record" flow (blank/new preset/copy),
   * even after autosave generates a record id. Used to enforce dedup rules on drafts without breaking edits
   * of existing records loaded from the list.
   */
  const createFlowRef = useRef<boolean>(false);
  /**
   * In create-flow, autosave must NOT create drafts until the user actually changes a field value.
   * Defaults/derived values/preset values alone should not trigger autosave.
   */
  const createFlowUserEditedRef = useRef<boolean>(false);
  const dedupHoldRef = useRef<boolean>(false);
  // Initialize immediately so the very first user interaction can be dedup-held (before effects run).
  const dedupKeyFieldIdsRef = useRef<Record<string, true>>(computeDedupKeyFieldIdMap((definition as any)?.dedupRules));
  // Baseline dedup identity of the currently loaded record (used by optional delete-on-key-change flow).
  const dedupBaselineSignatureRef = useRef<string>('');
  const dedupKeyFingerprintBaselineRef = useRef<string>('');
  const dedupDeleteOnKeyChangeInFlightRef = useRef<boolean>(false);
  const dedupDeleteOnKeyChangeEnabled =
    (definition as any)?.dedupDeleteOnKeyChange === true || (definition as any)?.dedupRecreateOnKeyChange === true;

  useEffect(() => {
    viewRef.current = view;
  }, [view]);
  useEffect(() => {
    submittingRef.current = submitting;
  }, [submitting]);
  useEffect(() => {
    valuesRef.current = values;
  }, [values]);
  useEffect(() => {
    lineItemsRef.current = lineItems;
  }, [lineItems]);
  useEffect(() => {
    if (view !== 'form') return;
    const nextPaths = new Set<string>();
    (definition.questions || []).forEach(q => {
      if (q.type !== 'LINE_ITEM_GROUP') return;
      const targetFieldIds = resolveNonMatchWarningFieldIds(q.lineItemConfig?.fields || []);
      const rows = lineItems[q.id] || [];
      if (targetFieldIds.length) {
        rows.forEach(row => {
          const nonMatch = parseRowNonMatchOptions((row as any)?.values?.[ROW_NON_MATCH_OPTIONS_KEY]);
          if (!nonMatch.length) return;
          targetFieldIds.forEach(fid => nextPaths.add(`${q.id}__${fid}__${row.id}`));
        });
      }
      const subGroups = q.lineItemConfig?.subGroups || [];
      if (!subGroups.length) return;
      rows.forEach(row => {
        subGroups.forEach(sub => {
          const subId = resolveSubgroupKey(sub as any);
          if (!subId) return;
          const subTargetFieldIds = resolveNonMatchWarningFieldIds((sub as any)?.fields || []);
          if (!subTargetFieldIds.length) return;
          const subKey = buildSubgroupKey(q.id, row.id, subId);
          const subRows = lineItems[subKey] || [];
          subRows.forEach(subRow => {
            const nonMatch = parseRowNonMatchOptions((subRow as any)?.values?.[ROW_NON_MATCH_OPTIONS_KEY]);
            if (!nonMatch.length) return;
            subTargetFieldIds.forEach(fid => nextPaths.add(`${subKey}__${fid}__${subRow.id}`));
          });
        });
      });
    });

    const prevPaths = nonMatchWarningPathsRef.current;
    let changed = prevPaths.size !== nextPaths.size;
    if (!changed) {
      for (const key of nextPaths) {
        if (!prevPaths.has(key)) {
          changed = true;
          break;
        }
      }
    }
    nonMatchWarningPathsRef.current = nextPaths;

    let touchedAdded = false;
    nextPaths.forEach(path => {
      if (!warningTouchedRef.current.has(path)) {
        warningTouchedRef.current.add(path);
        touchedAdded = true;
      }
    });

    if (!changed && !touchedAdded) return;
    if (!warningTouchedRef.current.size) return;
    try {
      const warnings = collectValidationWarnings({
        definition,
        language,
        values,
        lineItems,
        phase: 'submit',
        uiView: 'edit'
      });
      const touched = warningTouchedRef.current;
      const byField: Record<string, string[]> = {};
      Object.keys(warnings.byField || {}).forEach(k => {
        if (touched.has(k)) byField[k] = (warnings.byField as any)[k];
      });
      setValidationWarnings({ top: warnings.top || [], byField });
      logEvent('optionFilter.nonMatch.warning.auto', {
        nonMatchCount: nextPaths.size,
        touchedAdded,
        touchedCount: touched.size
      });
    } catch (err: any) {
      logEvent('optionFilter.nonMatch.warning.auto.failed', { message: err?.message || err || 'unknown' });
    }
  }, [definition, lineItems, values, view, language, logEvent]);
  useEffect(() => {
    languageRef.current = language;
  }, [language]);
  useEffect(() => {
    selectedRecordIdRef.current = selectedRecordId;
  }, [selectedRecordId]);
  useEffect(() => {
    selectedRecordSnapshotRef.current = selectedRecordSnapshot;
  }, [selectedRecordSnapshot]);
  useEffect(() => {
    lastSubmissionMetaRef.current = lastSubmissionMeta;
  }, [lastSubmissionMeta]);

  const bumpRecordSession = useCallback(
    (args: { reason: string; nextRecordId?: string | null }) => {
      recordSessionRef.current += 1;
      // Cancel any pending autosave timers/queues from the previous record session.
      autoSaveQueuedRef.current = false;
      if (autoSaveTimerRef.current) {
        globalThis.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      logEvent('record.session.bump', {
        reason: (args?.reason || '').toString() || null,
        nextRecordId: args?.nextRecordId ? args.nextRecordId.toString() : null,
        session: recordSessionRef.current
      });
    },
    [logEvent, syncUploadQueueSize]
  );

  // Arm autosave for create-flow ONLY after the user actually changes a field value.
  // (We intentionally do NOT arm autosave when values are populated by defaultValue/derivedValue/createRecordPreset.)
  useEffect(() => {
    const isFormTarget = (target: HTMLElement | null): boolean => {
      if (!target) return false;
      if (target.closest('[data-field-path]')) return true;
      const root = target.closest('.ck-form-sections') || target.closest('.webform-overlay') || target.closest('.form-card');
      return Boolean(root);
    };

    const onFieldChange = (e: Event) => {
      try {
        if (viewRef.current !== 'form') return;
        const target = e.target as HTMLElement | null;
        if (!target) return;
        const tag = ((target as any).tagName || '').toString().toLowerCase();
        if (tag !== 'input' && tag !== 'select' && tag !== 'textarea') return;
        const fieldPath = (target.closest('[data-field-path]') as HTMLElement | null)?.dataset?.fieldPath;
        if (!fieldPath) return;
        lastUserInteractionRef.current = Date.now();
        if (!createFlowRef.current) return;
        if (!createFlowUserEditedRef.current) {
          createFlowUserEditedRef.current = true;
          logEvent('autosave.armed.userEdit', { fieldPath });
        }
        if (!autoSaveUserEditedRef.current) {
          autoSaveUserEditedRef.current = true;
        }

        // Dedup checks run once dedup keys are complete; no extra handling here.
      } catch (_) {
        // ignore
      }
    };

    const onFieldInteract = (e: Event) => {
      try {
        if (viewRef.current !== 'form') return;
        const target = e.target as HTMLElement | null;
        if (!isFormTarget(target)) return;
        lastUserInteractionRef.current = Date.now();
      } catch (_) {
        // ignore
      }
    };

    document.addEventListener('input', onFieldChange, true);
    document.addEventListener('change', onFieldChange, true);
    document.addEventListener('pointerdown', onFieldInteract, true);
    document.addEventListener('keydown', onFieldInteract, true);
    return () => {
      document.removeEventListener('input', onFieldChange, true);
      document.removeEventListener('change', onFieldChange, true);
      document.removeEventListener('pointerdown', onFieldInteract, true);
      document.removeEventListener('keydown', onFieldInteract, true);
    };
  }, [logEvent]);

  const homeListCacheVersion = useMemo(() => resolveGlobalCacheVersion(), []);
  const homeListLocalCacheKey = useMemo(
    () => buildHomeListLocalCacheKey(formKey, definition.listView, homeListCacheVersion),
    [definition.listView, formKey, homeListCacheVersion]
  );
  const initialHomeListCache = useMemo(() => readHomeListLocalCache(homeListLocalCacheKey), [homeListLocalCacheKey]);
  const initialHomeListResponse = initialHomeListCache?.response || null;
  const initialHomeListSource = useMemo<'bootstrap' | 'localStorage' | 'none'>(() => {
    const globalAny = globalThis as any;
    const bootstrap = globalAny.__WEB_FORM_BOOTSTRAP__ || null;
    if (bootstrap?.listResponse) return 'bootstrap';
    if (initialHomeListCache?.response) return 'localStorage';
    return 'none';
  }, [initialHomeListCache]);

  const [homeRev, setHomeRev] = useState<number | null>(() => {
    const globalAny = globalThis as any;
    const bootstrap = globalAny.__WEB_FORM_BOOTSTRAP__ || null;
    const bootstrapRev = Number((bootstrap as any)?.homeRev);
    if (Number.isFinite(bootstrapRev) && bootstrapRev >= 0) return bootstrapRev;
    const cachedRev = Number((initialHomeListCache as any)?.homeRev);
    return Number.isFinite(cachedRev) && cachedRev >= 0 ? cachedRev : null;
  });
  const homeRevRef = useRef<number | null>(homeRev);
  useEffect(() => {
    homeRevRef.current = homeRev;
  }, [homeRev]);

  const [listCache, setListCache] = useState<{ response: ListResponse | null; records: Record<string, WebFormSubmission> }>(() => {
    const globalAny = globalThis as any;
    const bootstrap = globalAny.__WEB_FORM_BOOTSTRAP__ || null;
    const response = bootstrap?.listResponse || initialHomeListResponse || null;
    const records = bootstrap?.records || {};
    return { response, records };
  });
  const [listRefreshToken, setListRefreshToken] = useState(0);
  const requestListRefresh = useCallback((opts?: { clearResponse?: boolean }) => {
    // Keep any already-hydrated record snapshots (from bootstrap and/or recent selections) so navigating
    // back to the list does not reintroduce slow record fetches.
    setListCache(prev => ({ response: opts?.clearResponse ? null : prev.response, records: prev.records }));
    setListRefreshToken(token => token + 1);
  }, []);

  const [listFetch, setListFetch] = useState<{
    phase: 'idle' | 'loading' | 'prefetching' | 'error';
    message?: string;
    loaded?: number;
    total?: number;
    pages?: number;
  }>(() => ({ phase: 'idle' }));
  const [listFetchNotice, setListFetchNotice] = useState<string | null>(null);
  const listFetchSeqRef = useRef(0);
  const listPrefetchKeyRef = useRef<string>('');
  const listRecordsRef = useRef<Record<string, WebFormSubmission>>({});
  const dataSourcePrefetchKeyRef = useRef<string>('');

  useEffect(() => {
    if (initialHomeListSource !== 'localStorage') return;
    logEvent('list.cache.hydrate.localStorage', {
      formKey,
      key: homeListLocalCacheKey || null,
      itemCount: initialHomeListResponse?.items?.length || 0,
      totalCount: initialHomeListResponse?.totalCount || 0,
      hasEtag: Boolean((initialHomeListResponse?.etag || '').toString().trim()),
      homeRev: homeRevRef.current
    });
  }, [formKey, homeListLocalCacheKey, initialHomeListResponse, initialHomeListSource, logEvent]);

  useEffect(() => {
    homeLoadStartedAtRef.current = Date.now();
    homeTimeToDataMeasuredRef.current = false;
    perfMark(`ck.home.timeToData.start.${formKey}.${language}`);
  }, [formKey, language, perfMark]);

  useEffect(() => {
    listRecordsRef.current = listCache.records || {};
  }, [listCache.records]);

  useEffect(() => {
    const response = listCache.response;
    if (!homeListLocalCacheKey || !response || !Array.isArray(response.items)) return;
    if (!response.items.length) return;
    if (response.nextPageToken) return;
    writeHomeListLocalCache(homeListLocalCacheKey, response, homeRevRef.current);
  }, [homeListLocalCacheKey, listCache.response]);

  useEffect(() => {
    if (homeTimeToDataMeasuredRef.current) return;
    const firstCount = listCache.response?.items?.length || 0;
    if (firstCount <= 0) return;
    homeTimeToDataMeasuredRef.current = true;
    const startMark = `ck.home.timeToData.start.${formKey}.${language}`;
    const endMark = `ck.home.timeToData.end.${formKey}.${language}`;
    perfMark(endMark);
    perfMeasure('ck.home.timeToData', startMark, endMark, {
      formKey,
      language,
      elapsedMs: Date.now() - homeLoadStartedAtRef.current,
      firstItemCount: firstCount
    });
  }, [formKey, language, listCache.response?.items?.length, perfMark, perfMeasure]);

  useEffect(() => {
    if (pendingDeletedRecordApplyTick <= 0) return;
    const ids = Array.from(new Set((pendingDeletedRecordIdsRef.current || []).map(id => (id || '').toString().trim()).filter(Boolean)));
    pendingDeletedRecordIdsRef.current = [];
    if (!ids.length) return;
    setListCache(prev =>
      ids.reduce(
        (state, recordId) =>
          removeListCacheRowPure({
            prev: state,
            remove: { recordId }
          }),
        prev
      )
    );
    logEvent('list.cache.remove.deletedRecord', { recordIds: ids, count: ids.length });
  }, [logEvent, pendingDeletedRecordApplyTick]);

  useEffect(() => {
    const firstListItemCount = listCache.response?.items?.length || 0;
    if (firstListItemCount <= 0) return;
    const key = `${formKey}::${language}`;
    if (dataSourcePrefetchKeyRef.current === key) return;
    dataSourcePrefetchKeyRef.current = key;
    const configs = collectDataSourceConfigsForPrefetch(definition);
    if (!configs.length) return;
    const startedAt = Date.now();
    const timer = globalThis.setTimeout(() => {
      logEvent('dataSource.prefetch.start', {
        formKey,
        language,
        dataSources: configs.length
      });
      void prefetchDataSources(configs, language, { forceRefresh: false })
        .then(res => {
          logEvent('dataSource.prefetch.done', {
            formKey,
            language,
            requested: res.requested,
            succeeded: res.succeeded,
            failed: res.failed,
            durationMs: Date.now() - startedAt
          });
        })
        .catch((err: any) => {
          logEvent('dataSource.prefetch.error', {
            formKey,
            language,
            message: err?.message || err?.toString?.() || 'unknown',
            durationMs: Date.now() - startedAt
          });
        });
    }, 250);
    return () => {
      globalThis.clearTimeout(timer);
    };
  }, [definition, formKey, language, listCache.response?.items?.length, logEvent]);

  const listViewProjection = useMemo(() => {
    const cols = (definition.listView?.columns || []) as any[];
    if (!cols.length) return [] as string[];
    const meta = new Set(['id', 'createdAt', 'updatedAt', 'status', 'pdfUrl']);
    const ids = new Set<string>();
    const add = (fid: string) => {
      const id = (fid || '').toString().trim();
      if (!id || meta.has(id)) return;
      ids.add(id);
    };
    cols.forEach(col => {
      const fid = (col as any)?.fieldId;
      if (!fid) return;
      if ((col as any)?.type === 'rule') {
        collectListViewRuleColumnDependencies(col as any).forEach(add);
        return;
      }
      add(fid);
    });
    const listSearchMode = (definition.listView?.search?.mode || 'text') as 'text' | 'date' | 'advanced';
    const dateSearchFieldId = ((definition.listView?.search as any)?.dateFieldId || '').toString().trim();
    if (listSearchMode === 'date' && dateSearchFieldId) {
      add(dateSearchFieldId);
    }
    if (listSearchMode === 'advanced') {
      const fieldsRaw = (definition.listView?.search as any)?.fields;
      const fields: string[] = (() => {
        if (fieldsRaw === undefined || fieldsRaw === null) return [];
        if (Array.isArray(fieldsRaw)) return fieldsRaw.map(v => (v === undefined || v === null ? '' : `${v}`.trim())).filter(Boolean);
        const str = `${fieldsRaw}`.trim();
        if (!str) return [];
        return str
          .split(',')
          .map(s => s.trim())
          .filter(Boolean);
      })();
      fields.forEach(add);
    }
    return Array.from(ids);
  }, [definition.listView]);

  useEffect(() => {
    if (!definition.listView) return;
    const key = `${formKey}::${listRefreshToken}`;
    if (listPrefetchKeyRef.current === key) return;
    listPrefetchKeyRef.current = key;
    const seq = ++listFetchSeqRef.current;
    const startedAt = Date.now();

    const pageSize = Math.max(1, Math.min(definition.listView?.pageSize || 10, 50));
    const sort: ListSort | null = definition.listView?.defaultSort?.fieldId
      ? {
          fieldId: definition.listView.defaultSort.fieldId,
          direction: (definition.listView.defaultSort.direction || 'desc') as any
        }
      : null;

    const projection = listViewProjection.length ? listViewProjection : undefined;
    const hasExisting = Boolean(listCache.response?.items?.length);
    const existingEtag = (listCache.response?.etag || '').toString().trim();
    const canReuseFirstPage = hasExisting && listRefreshToken === 0;
    const skipInitialServerCheck = canReuseFirstPage && initialHomeListSource === 'bootstrap';
    const canUseConditionalFirstPage = canReuseFirstPage && !!existingEtag && !skipInitialServerCheck;

    setListFetchNotice(null);
    setListFetch({
      phase: hasExisting ? 'prefetching' : 'loading',
      loaded: hasExisting ? (listCache.response?.items?.length || 0) : 0,
      total: listCache.response?.totalCount || undefined,
      pages: 0
    });
    logEvent('list.sorted.prefetch.start', {
      formKey,
      pageSize,
      projectionCount: projection ? projection.length : 0,
      sortField: sort?.fieldId || null,
      sortDirection: sort?.direction || null,
      keepExisting: hasExisting,
      reuseFirstPage: canReuseFirstPage,
      skipInitialServerCheck,
      conditionalEtagCheck: canUseConditionalFirstPage,
      homeRev: homeRevRef.current,
      includePageRecords: false
    });

    void (async () => {
      try {
        const encodePageTokenClient = (offset: number): string => {
          const n = Math.max(0, Math.floor(Number(offset) || 0));
          const text = n.toString();
          try {
            if (typeof globalThis !== 'undefined' && typeof (globalThis as any).btoa === 'function') {
              return (globalThis as any).btoa(text);
            }
          } catch (_) {
            // ignore
          }
          return text;
        };

        const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
        const fetchPage = async (args: {
          token?: string;
          pageIndex: number;
          allowConditional?: boolean;
        }): Promise<{ list: ListResponse; batch: any; token?: string; pageIndex: number; notModified: boolean }> => {
          let batch: any = null;
          if (args.allowConditional && !args.token && args.pageIndex === 0) {
            const homeBootstrapStartMark = `ck.home.bootstrap.rpc.start.${seq}.${args.pageIndex}`;
            const homeBootstrapEndMark = `ck.home.bootstrap.rpc.end.${seq}.${args.pageIndex}`;
            perfMark(homeBootstrapStartMark);
            try {
              const bootstrapRes = await fetchHomeBootstrapApi(formKey, homeRevRef.current);
              perfMark(homeBootstrapEndMark);
              perfMeasure('ck.home.bootstrap.rpc', homeBootstrapStartMark, homeBootstrapEndMark, {
                formKey,
                pageIndex: args.pageIndex,
                rev: (bootstrapRes as any)?.rev ?? null,
                notModified: Boolean((bootstrapRes as any)?.notModified),
                cache: (bootstrapRes as any)?.cache || null
              });
              if (seq !== listFetchSeqRef.current) {
                return { list: { items: [] } as any, batch: null, token: args.token, pageIndex: args.pageIndex, notModified: false };
              }
              const revRaw = Number((bootstrapRes as any)?.rev);
              if (Number.isFinite(revRaw) && revRaw >= 0) {
                setHomeRev(prev => (prev === revRaw ? prev : revRaw));
              }
              if ((bootstrapRes as any)?.notModified) {
                const notModifiedList: ListResponse = {
                  items: [],
                  totalCount: Number((listCache.response as any)?.totalCount || 0),
                  etag: existingEtag,
                  notModified: true
                };
                return { list: notModifiedList, batch: null, token: args.token, pageIndex: args.pageIndex, notModified: true };
              }
              const homeList = (() => {
                const maybeList = (bootstrapRes as any)?.listResponse;
                return maybeList && Array.isArray((maybeList as any).items) ? (maybeList as ListResponse) : null;
              })();
              if (homeList) {
                const homeBatch = {
                  list: homeList,
                  records: ((bootstrapRes as any)?.records || {}) as Record<string, WebFormSubmission>
                };
                return {
                  list: homeList,
                  batch: homeBatch,
                  token: args.token,
                  pageIndex: args.pageIndex,
                  notModified: false
                };
              }
            } catch (err: any) {
              perfMark(homeBootstrapEndMark);
              perfMeasure('ck.home.bootstrap.rpc', homeBootstrapStartMark, homeBootstrapEndMark, {
                formKey,
                pageIndex: args.pageIndex,
                failed: true
              });
              logEvent('list.homeBootstrap.error', {
                message: err?.message || err?.toString?.() || 'unknown'
              });
            }
          }
          for (let attempt = 0; attempt < 3; attempt += 1) {
            const startMark = `ck.list.fetch.rpc.start.${seq}.${args.pageIndex}.${attempt}`;
            const endMark = `ck.list.fetch.rpc.end.${seq}.${args.pageIndex}.${attempt}`;
            perfMark(startMark);
            const requestSort: ListSort | null =
              args.allowConditional && !args.token && args.pageIndex === 0 && canUseConditionalFirstPage
                ? ({
                    ...(sort || {}),
                    __ifNoneMatch: true,
                    __clientEtag: existingEtag
                  } as ListSort)
                : sort;
            batch = await fetchSortedBatch(formKey, projection, pageSize, args.token, false, undefined, requestSort);
            perfMark(endMark);
            perfMeasure('ck.list.fetch.rpc', startMark, endMark, {
              formKey,
              pageIndex: args.pageIndex,
              attempt: attempt + 1,
              pageSize,
              token: args.token || null,
              conditional: Boolean(args.allowConditional && !args.token && args.pageIndex === 0 && canUseConditionalFirstPage)
            });
            if (seq !== listFetchSeqRef.current) {
              return { list: { items: [] } as any, batch: null, token: args.token, pageIndex: args.pageIndex, notModified: false };
            }
            if (batch && typeof batch === 'object') break;
            logEvent('list.sorted.prefetch.retry', {
              attempt: attempt + 1,
              token: args.token || null,
              pageIndex: args.pageIndex,
              resType: batch === null ? 'null' : typeof batch
            });
            await sleep(250 * (attempt + 1));
          }
          if (seq !== listFetchSeqRef.current) {
            return { list: { items: [] } as any, batch: null, token: args.token, pageIndex: args.pageIndex, notModified: false };
          }
          const list = (() => {
            if (batch && typeof batch === 'object') {
              const maybeList = (batch as any).list;
              if (maybeList && Array.isArray((maybeList as any).items)) return maybeList as ListResponse;
              if (Array.isArray((batch as any).items)) return batch as any as ListResponse;
            }
            return null;
          })();
          if (!list || !Array.isArray((list as any).items)) {
            const resType = batch === null ? 'null' : typeof batch;
            const keys = batch && typeof batch === 'object' ? Object.keys(batch as any).slice(0, 15) : [];
            logEvent('list.sorted.prefetch.invalidResponse', { resType, keys, token: args.token || null, pageIndex: args.pageIndex });
            const err: any = new Error(
              'Recent activity is temporarily unavailable. Your data is safe. Please refresh the page or try again in a moment'
            );
            err.__ckUiTone = 'info';
            err.__ckUiKind = 'list_prefetch_unavailable';
            throw err;
          }
          return {
            list,
            batch,
            token: args.token,
            pageIndex: args.pageIndex,
            notModified: Boolean((list as any).notModified)
          };
        };

        const first = (() => {
          if (!skipInitialServerCheck || !listCache.response || !Array.isArray((listCache.response as any).items)) return null;
          const bootstrapList = {
            ...(listCache.response as ListResponse),
            notModified: undefined
          } as ListResponse;
          const bootstrapBatch = {
            list: bootstrapList,
            records: (listCache.records || {}) as Record<string, WebFormSubmission>
          };
          logEvent('list.sorted.prefetch.bootstrapReuse', {
            formKey,
            etag: existingEtag || null,
            itemCount: (bootstrapList.items || []).length,
            totalCount: (bootstrapList as any)?.totalCount || 0
          });
          return {
            list: bootstrapList,
            batch: bootstrapBatch,
            token: undefined,
            pageIndex: 0,
            notModified: false
          };
        })() || (await fetchPage({ token: undefined, pageIndex: 0, allowConditional: canUseConditionalFirstPage }));
        if (seq !== listFetchSeqRef.current) return;
        if (canReuseFirstPage && first.notModified) {
          const existingCount = listCache.response?.items?.length || 0;
          const existingTotalRaw = Number((listCache.response as any)?.totalCount || existingCount);
          const existingTotal =
            Number.isFinite(existingTotalRaw) && existingTotalRaw > 0 ? Math.min(existingTotalRaw, 200) : existingCount;
          setListFetch({
            phase: 'idle',
            loaded: existingCount,
            total: existingTotal || existingCount,
            pages: Math.max(1, Math.ceil(Math.max(existingTotal, existingCount) / pageSize))
          });
          logEvent('list.sorted.prefetch.notModified', {
            formKey,
            etag: existingEtag,
            existingCount,
            total: existingTotal || existingCount,
            durationMs: Date.now() - startedAt
          });
          return;
        }
        const firstList = first.list;
        const totalCountRaw = Number((firstList as any).totalCount || 0);
        const hasNextToken = Boolean((firstList as any).nextPageToken);
        const cappedTotalCount =
          Number.isFinite(totalCountRaw) && totalCountRaw > 0
            ? Math.min(totalCountRaw, 200)
            : hasNextToken
              ? 200
              : Math.min((firstList.items || []).length, 200);
        const totalPages = Math.max(1, Math.ceil(cappedTotalCount / pageSize));

        const itemsByPage = new Map<number, ListItem[]>();
        const recordsAccum: Record<string, WebFormSubmission> = {
          ...((listCache.records || {}) as Record<string, WebFormSubmission>),
          ...((((first as any).batch as any)?.records as Record<string, WebFormSubmission>) || {})
        };
        itemsByPage.set(0, (firstList.items || []) as ListItem[]);

        const buildAggregated = (): ListItem[] => {
          const aggregated: ListItem[] = [];
          for (let page = 0; page < totalPages; page += 1) {
            if (!itemsByPage.has(page)) break;
            aggregated.push(...(itemsByPage.get(page) || []));
          }
          return aggregated;
        };

        const applyProgress = (loadedPages: number) => {
          const aggregated = buildAggregated();
          const hasMore = loadedPages < totalPages;
          setListCache(prev => ({
            response: {
              ...firstList,
              notModified: undefined,
              items: aggregated,
              nextPageToken: hasMore ? ((firstList as any).nextPageToken || '__prefetching__') : undefined
            },
            records: { ...(prev.records || {}), ...recordsAccum }
          }));
          setListFetch({
            phase: hasMore ? 'prefetching' : 'idle',
            loaded: aggregated.length,
            total: cappedTotalCount || aggregated.length,
            pages: loadedPages
          });
          return aggregated.length;
        };

        let loadedPages = 1;
        applyProgress(loadedPages);
        logEvent('list.sorted.prefetch.page', {
          page: 1,
          pageItems: (itemsByPage.get(0) || []).length,
          aggregated: (itemsByPage.get(0) || []).length,
          totalCount: cappedTotalCount,
          hasNext: totalPages > 1,
          durationMs: Date.now() - startedAt
        });

        if (totalPages <= 1) {
          if (seq !== listFetchSeqRef.current) return;
          logEvent('list.sorted.prefetch.done', {
            pages: 1,
            items: (itemsByPage.get(0) || []).length,
            durationMs: Date.now() - startedAt
          });
          return;
        }

        const pagePromises = Array.from({ length: totalPages - 1 }, (_, idx) => idx + 1).map(pageIndex => {
          const offset = pageIndex * pageSize;
          const token = encodePageTokenClient(offset);
          const pageStartedAt = Date.now();
          return fetchPage({ token, pageIndex, allowConditional: false })
            .then(res => {
              if (seq !== listFetchSeqRef.current) return;
              const items = (res.list.items || []) as ListItem[];
              itemsByPage.set(pageIndex, items);
              const newRecords = (((res.batch as any)?.records as Record<string, WebFormSubmission>) || {}) as Record<string, WebFormSubmission>;
              Object.keys(newRecords).forEach(id => {
                recordsAccum[id] = newRecords[id];
              });
              loadedPages += 1;
              const aggregatedCount = applyProgress(loadedPages);
              logEvent('list.sorted.prefetch.page', {
                page: pageIndex + 1,
                pageItems: items.length,
                aggregated: aggregatedCount,
                totalCount: cappedTotalCount,
                hasNext: loadedPages < totalPages,
                durationMs: Date.now() - startedAt,
                pageDurationMs: Date.now() - pageStartedAt
              });
            });
        });

        await Promise.all(pagePromises);
        if (seq !== listFetchSeqRef.current) return;
        const finalAggregatedCount = applyProgress(totalPages);
        logEvent('list.sorted.prefetch.done', {
          pages: totalPages,
          items: finalAggregatedCount,
          durationMs: Date.now() - startedAt
        });
      } catch (err: any) {
        if (seq !== listFetchSeqRef.current) return;
        const uiMessage = resolveUiErrorMessage(err, 'Failed to load list.');
        const logMessage = resolveLogMessage(err, 'Failed to load list.');
        if ((err as any)?.__ckUiTone === 'info') {
          setListFetchNotice(uiMessage || null);
          setListFetch(prev => ({ ...prev, phase: 'idle', message: undefined }));
          logEvent('list.sorted.prefetch.notice', {
            kind: (err as any)?.__ckUiKind || null,
            message: logMessage
          });
          return;
        }
        if (uiMessage) {
          setListFetch(prev => ({ ...prev, phase: 'error', message: uiMessage }));
        } else {
          setListFetch(prev => ({ ...prev, phase: 'idle', message: undefined }));
        }
        logEvent('list.sorted.prefetch.error', { message: logMessage });
      }
    })();
    // Do NOT cancel on view changes; this prefetch should continue in the background.
  }, [
    definition.listView,
    formKey,
    initialHomeListSource,
    listCache.records,
    listCache.response,
    listRefreshToken,
    listViewProjection,
    logEvent,
    perfMark,
    perfMeasure
  ]);

  /**
   * Merge a locally-known record update into the cached list rows so navigating back to the list
   * does NOT require a server refetch. Other users' changes still require an explicit Refresh.
   */
  const upsertListCacheRow = useCallback(
    (args: {
      recordId: string;
      values?: Record<string, any>;
      createdAt?: string;
      updatedAt?: string;
      status?: string | null;
      pdfUrl?: string;
      dataVersion?: number | null;
      rowNumber?: number | null;
    }) => {
      const recordId = (args.recordId || '').toString();
      if (!recordId) return;
      setListCache(prev =>
        upsertListCacheRowPure({
          prev,
          update: args,
          definition,
          formKey,
          language
        })
      );
    },
    [definition, formKey, language]
  );

  useEffect(() => {
    const unlockRecordId = (readyForProductionUnlockResolution.unlockRecordId || '').toString().trim();
    const targetStatus = (readyForProductionUnlockStatus || '').toString().trim();
    if (!unlockRecordId || !targetStatus) return;
    if (view !== 'form') return;
    if (submitting || updateRecordBusyOpen || Boolean(recordLoadingId) || precreateDedupChecking) return;

    const recordId =
      resolveExistingRecordId({
        selectedRecordId,
        selectedRecordSnapshot,
        lastSubmissionMetaId: lastSubmissionMeta?.id || null
      }) || '';
    if (!recordId || recordId !== unlockRecordId) return;

    const currentStatusRaw = ((lastSubmissionMeta?.status || selectedRecordSnapshot?.status || '') as any).toString().trim();
    if (currentStatusRaw && currentStatusRaw.toLowerCase() === targetStatus.toLowerCase()) return;

    const attemptKey = `${recordId}::${targetStatus.toLowerCase()}`;
    if (readyForProductionUnlockTransitionAttemptedRef.current.has(attemptKey)) return;
    readyForProductionUnlockTransitionAttemptedRef.current.add(attemptKey);

    logEvent('readyForProduction.unlock.statusTransition.start', {
      recordId,
      source: readyForProductionUnlockResolution.source,
      fromStatus: currentStatusRaw || null,
      toStatus: targetStatus
    });

    void runUpdateRecordAction(
      {
        definition,
        formKey,
        submit,
        tSystem,
        logEvent,
        refs: {
          languageRef,
          valuesRef,
          lineItemsRef,
          selectedRecordIdRef,
          selectedRecordSnapshotRef,
          lastSubmissionMetaRef,
          recordDataVersionRef,
          recordRowNumberRef,
          recordSessionRef,
          uploadQueueRef,
          autoSaveInFlightRef,
          recordStaleRef
        },
        setDraftSave,
        setStatus,
        setStatusLevel,
        setLastSubmissionMeta,
        setSelectedRecordSnapshot,
        setValues,
        setView,
        upsertListCacheRow,
        busy: updateRecordBusy
      } as any,
      {
        buttonId: 'ready-for-production-unlock',
        buttonRef: 'ready-for-production-unlock',
        navigateTo: 'form',
        set: { status: targetStatus }
      }
    ).then(() => {
      const nextStatusRaw = ((lastSubmissionMetaRef.current?.status || selectedRecordSnapshotRef.current?.status || '') as any)
        .toString()
        .trim();
      logEvent('readyForProduction.unlock.statusTransition.done', {
        recordId,
        targetStatus,
        nextStatus: nextStatusRaw || null
      });
    });
  }, [
    definition,
    formKey,
    lastSubmissionMeta,
    logEvent,
    precreateDedupChecking,
    readyForProductionUnlockResolution.source,
    readyForProductionUnlockResolution.unlockRecordId,
    readyForProductionUnlockStatus,
    recordLoadingId,
    selectedRecordId,
    selectedRecordSnapshot,
    submitting,
    updateRecordBusy,
    updateRecordBusyOpen,
    upsertListCacheRow,
    view
  ]);

  const applyRecordSnapshot = useCallback(
    (snapshot: WebFormSubmission) => {
      const id = snapshot?.id;
      if (!snapshot || !id) return;
      // Switching records: cancel any in-flight dedup check so stale responses can't affect the new record.
      if (dedupCheckTimerRef.current) {
        globalThis.clearTimeout(dedupCheckTimerRef.current);
        dedupCheckTimerRef.current = null;
      }
      dedupCheckSeqRef.current += 1;
      dedupCheckingRef.current = false;
      dedupConflictRef.current = null;
      setDedupChecking(false);
      setDedupConflict(null);
      setDedupNotice(null);
      // Applying a fresh snapshot clears any "stale record" banner and updates our base dataVersion.
      recordStaleRef.current = null;
      setRecordStale(null);
      recordDataVersionRef.current =
        snapshot && Number.isFinite(Number((snapshot as any).dataVersion)) ? Number((snapshot as any).dataVersion) : null;
      // Best-effort: capture rowNumber when present on the snapshot.
      if (snapshot && Number.isFinite(Number((snapshot as any).__rowNumber))) {
        recordRowNumberRef.current = Number((snapshot as any).__rowNumber);
      }
      const currentId =
        resolveExistingRecordId({
          selectedRecordId: selectedRecordIdRef.current,
          selectedRecordSnapshot: selectedRecordSnapshotRef.current,
          lastSubmissionMetaId: lastSubmissionMetaRef.current?.id || null
        }) || '';
      // Loading a snapshot from the server/list is an "edit existing record" flow,
      // except when we are reloading the CURRENT draft record during create-flow.
      const isReloadingCurrentCreateFlow = createFlowRef.current && currentId && currentId === id;
      if (!isReloadingCurrentCreateFlow) {
        createFlowRef.current = false;
      }
      createFlowUserEditedRef.current = true;
      if (!isReloadingCurrentCreateFlow) {
        autoSaveUserEditedRef.current = false;
      }
      dedupHoldRef.current = false;
      const normalized = normalizeRecordValues(definition, snapshot.values || {});
      const initialLineItems = buildInitialLineItems(definition, normalized);
      const mapped = applyValueMapsToForm(definition, normalized, initialLineItems, { mode: 'init' });
      // Treat the loaded snapshot's dedup signature as "already checked" so we don't spam dedup checks
      // on every record navigation. Subsequent edits of dedup-key fields will force a re-check.
      try {
        const baseline = computeDedupSignatureFromValues((definition as any)?.dedupRules, mapped.values as any);
        lastDedupCheckedSignatureRef.current = (baseline || '').toString();
        dedupSignatureRef.current = lastDedupCheckedSignatureRef.current;
        dedupBaselineSignatureRef.current = lastDedupCheckedSignatureRef.current;
        dedupKeyFingerprintBaselineRef.current = computeDedupKeyFingerprint(
          (definition as any)?.dedupRules,
          mapped.values as any
        );
      } catch (_) {
        lastDedupCheckedSignatureRef.current = '';
        dedupBaselineSignatureRef.current = '';
        dedupKeyFingerprintBaselineRef.current = '';
        dedupDeleteOnKeyChangeInFlightRef.current = false;
      }
      // Avoid autosaving immediately due to state hydration from a server snapshot.
      autoSaveDirtyRef.current = false;
      if (autoSaveTimerRef.current) {
        globalThis.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      setDraftSave({ phase: 'idle' });
      lastAutoSaveSeenRef.current = { values: mapped.values, lineItems: mapped.lineItems };
      // Keep refs in sync immediately so any follow-up actions (e.g. list-triggered button previews) can use
      // the freshly loaded record values without waiting for a re-render.
      valuesRef.current = mapped.values;
      lineItemsRef.current = mapped.lineItems;
      selectedRecordIdRef.current = id;
      selectedRecordSnapshotRef.current = snapshot;
      setValues(mapped.values);
      setLineItems(mapped.lineItems);
      setErrors({});
      setValidationWarnings({ top: [], byField: {} });
      setValidationAttempted(false);
      setValidationNoticeHidden(false);
      setSelectedRecordId(id);
      setSelectedRecordSnapshot(snapshot);
      setLastSubmissionMeta({
        id,
        createdAt: snapshot.createdAt,
        updatedAt: snapshot.updatedAt,
        dataVersion: (snapshot as any).dataVersion,
        status: snapshot.status || null
      });
      lastSubmissionMetaRef.current = {
        id,
        createdAt: snapshot.createdAt,
        updatedAt: snapshot.updatedAt,
        dataVersion: (snapshot as any).dataVersion,
        status: snapshot.status || null
      };
      setRecordLoadingId(null);
      setRecordLoadError(null);
      setListCache(prev => ({
        response: prev.response,
        records: { ...prev.records, [id]: snapshot }
      }));
      // Also update any cached list row so navigating back to the list reflects this snapshot without refetching.
      try {
        upsertListCacheRow({
          recordId: id,
          values: (snapshot.values as any) || {},
          createdAt: snapshot.createdAt,
          updatedAt: snapshot.updatedAt,
          status: (snapshot.status as any) || null,
          pdfUrl: (snapshot as any).pdfUrl,
          dataVersion: Number.isFinite(Number((snapshot as any).dataVersion)) ? Number((snapshot as any).dataVersion) : undefined,
          rowNumber: Number.isFinite(Number((snapshot as any).__rowNumber)) ? Number((snapshot as any).__rowNumber) : undefined
        });
      } catch (_) {
        // ignore
      }

      // Prefetch Summary HTML template (client-side cached) so Summary view is instant when users tap it.
      // Do NOT await: this should run in parallel with any other async work.
      if ((definition as any)?.summaryHtmlTemplateId && definition.summaryViewEnabled !== false) {
        try {
          const payload = buildDraftPayload({
            definition,
            formKey,
            language: languageRef.current,
            values: mapped.values,
            lineItems: mapped.lineItems,
            existingRecordId: id
          });
          if (snapshot?.status !== undefined && snapshot?.status !== null) {
            (payload as any).status = snapshot.status;
          }
          if (snapshot?.createdAt !== undefined && snapshot?.createdAt !== null) {
            (payload as any).createdAt = snapshot.createdAt;
          }
          if (snapshot?.updatedAt !== undefined && snapshot?.updatedAt !== null) {
            (payload as any).updatedAt = snapshot.updatedAt;
          }
          if ((snapshot as any)?.pdfUrl !== undefined && (snapshot as any)?.pdfUrl !== null) {
            (payload as any).pdfUrl = (snapshot as any).pdfUrl;
          }
          const resolved = resolveTemplateIdForRecord((definition as any).summaryHtmlTemplateId, payload.values || {}, payload.language);
          if (isBundledHtmlTemplateId(resolved || '')) {
            logEvent('summary.htmlTemplate.bundle.prefetch.start', { recordId: id });
            void renderBundledHtmlTemplateClient({
              definition,
              payload: payload as any,
              templateIdMap: (definition as any).summaryHtmlTemplateId
            })
              .then(res => {
                if (res?.success && res?.html) {
                  logEvent('summary.htmlTemplate.bundle.prefetch.ok', { recordId: id, htmlLength: (res.html || '').toString().length });
                } else {
                  logEvent('summary.htmlTemplate.bundle.prefetch.skip', { recordId: id, success: !!res?.success });
                }
              })
              .catch(err => {
                const msg = (err as any)?.message?.toString?.() || (err as any)?.toString?.() || 'Failed';
                logEvent('summary.htmlTemplate.bundle.prefetch.error', { recordId: id, message: msg });
              });
          } else {
            logEvent('summary.htmlTemplate.prefetch.start', { recordId: id });
            void renderSummaryHtmlTemplateApi(payload)
              .then(res => {
                if (res?.success && res?.html) {
                  logEvent('summary.htmlTemplate.prefetch.ok', { recordId: id, htmlLength: (res.html || '').toString().length });
                } else {
                  logEvent('summary.htmlTemplate.prefetch.skip', { recordId: id, success: !!res?.success });
                }
              })
              .catch(err => {
                const msg = (err as any)?.message?.toString?.() || (err as any)?.toString?.() || 'Failed';
                logEvent('summary.htmlTemplate.prefetch.error', { recordId: id, message: msg });
              });
          }
        } catch (err: any) {
          logEvent('summary.htmlTemplate.prefetch.exception', { recordId: id, message: err?.message || err });
        }
      }
    },
    [definition, formKey, logEvent, upsertListCacheRow]
  );

  const markRecordStale = useCallback(
    (args: {
      reason: string;
      recordId: string;
      cachedVersion?: number | null;
      serverVersion?: number | null;
      serverRow?: number | null;
    }) => {
      const currentId = (selectedRecordIdRef.current || '').toString().trim();
      const targetId = (args.recordId || '').toString().trim();
      if (currentId && targetId && currentId !== targetId) return;
      const id = currentId || targetId;
      if (!id) return;

      const toNum = (v: any): number | undefined => {
        const n = v === undefined || v === null ? Number.NaN : Number(v);
        return Number.isFinite(n) ? n : undefined;
      };
      const cachedVersion = args.cachedVersion !== undefined ? toNum(args.cachedVersion) : undefined;
      const serverVersion = args.serverVersion !== undefined ? toNum(args.serverVersion) : undefined;
      const serverRow = args.serverRow !== undefined ? toNum(args.serverRow) : undefined;

      const message = tSystem(
        'record.stale',
        languageRef.current,
        'This record was updated by another user or automatically by the system, tap Refresh to continue.'
      );
      const next: RecordStaleInfo = { recordId: id, message, cachedVersion, serverVersion, serverRow };
      recordStaleRef.current = next;
      setRecordStale(next);

      // Cancel draft autosave so we don't overwrite remote changes.
      autoSaveDirtyRef.current = false;
      if (autoSaveTimerRef.current) {
        globalThis.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      setDraftSave({ phase: 'idle' });

      logEvent('record.stale.detected', {
        reason: args.reason,
        recordId: id,
        cachedVersion: cachedVersion ?? null,
        serverVersion: serverVersion ?? null,
        serverRow: serverRow ?? null
      });
    },
    [logEvent]
  );

  const loadRecordSnapshot = useCallback(
    async (recordId: string, rowNumberHint?: number): Promise<boolean> => {
      const candidateRow = rowNumberHint && Number.isFinite(rowNumberHint) && rowNumberHint >= 2 ? rowNumberHint : undefined;
      if (!recordId && !candidateRow) return false;
      if (candidateRow) {
        recordRowNumberRef.current = candidateRow;
      }
      const seq = ++recordFetchSeqRef.current;
      const startedAt = Date.now();
      setRecordLoadingId(recordId || (candidateRow ? `row:${candidateRow}` : null));
      setRecordLoadError(null);
      logEvent('record.fetch.start', { recordId: recordId || null, rowNumberHint: candidateRow || null });
      try {
        let snapshot: WebFormSubmission | null = null;

        // Prefer row-number fetch when available (avoids expensive ID scans and works even if legacy endpoints exist).
        if (candidateRow) {
          snapshot = await fetchRecordByRowNumber(formKey, candidateRow);
          if (seq !== recordFetchSeqRef.current) return false;
          if (recordId && snapshot && snapshot.id && snapshot.id !== recordId) {
            // Row hint might be stale; fall back to ID to avoid loading the wrong record.
            logEvent('record.fetch.rowNumberMismatch', {
              recordId,
              rowNumberHint: candidateRow,
              resolvedId: snapshot.id
            });
            snapshot = null;
          }
        }

        if (!snapshot && recordId) {
          snapshot = await fetchRecordById(formKey, recordId);
        }
        if (seq !== recordFetchSeqRef.current) return false;
        if (!snapshot) throw new Error('Record not found.');
        applyRecordSnapshot(snapshot);
        logEvent('record.fetch.done', { recordId: snapshot.id || recordId, durationMs: Date.now() - startedAt });
        return true;
      } catch (err: any) {
        if (seq !== recordFetchSeqRef.current) return false;
        const uiMessage = resolveUiErrorMessage(err, 'Failed to load record.');
        const logMessage = resolveLogMessage(err, 'Failed to load record.');
        setRecordLoadError(uiMessage);
        setRecordLoadingId(null);
        logEvent('record.fetch.error', { recordId, message: logMessage, rowNumberHint, durationMs: Date.now() - startedAt });
        return false;
      }
    },
    [applyRecordSnapshot, formKey, logEvent]
  );

  const handleGlobalRefresh = useCallback(async () => {
    // Clear client caches (data sources + rendered HTML) to avoid stale derived content without requiring a full reload.
    try {
      clearFetchDataSourceCache();
      clearBundledHtmlClientCaches();
      clearHtmlRenderClientCache();
      logEvent('cache.client.clear', { scope: 'refresh' });
    } catch (err: any) {
      logEvent('cache.client.clear.error', { message: err?.message || err?.toString?.() || 'unknown' });
    }
    // Trigger a list refresh, but keep the current list visible until new data arrives.
    requestListRefresh({ clearResponse: false });
    if (!selectedRecordId) return;
    await loadRecordSnapshot(selectedRecordId);
  }, [loadRecordSnapshot, requestListRefresh, selectedRecordId]);

  const loadOptionsForField = useCallback(
    (field: any, groupId?: string) => {
      if (!field?.dataSource) return Promise.resolve();
      const key = optionKey(field.id, groupId);
      const existing = optionStateRef.current[key];
      const needsTooltips = !!(existing as any)?.tooltips;
      const existingTooltips = tooltipStateRef.current[key];
      if (existing && (!needsTooltips || existingTooltips)) return Promise.resolve();
      if (preloadPromisesRef.current[key]) return preloadPromisesRef.current[key];
      const promise = loadOptionsFromDataSource(field.dataSource, language)
        .then(res => {
          if (res) {
            setOptionState(prev => (prev[key] ? prev : { ...prev, [key]: res }));
            if (res.tooltips) {
              setTooltipState(prev => (prev[key] ? prev : { ...prev, [key]: res.tooltips || {} }));
            }
          }
        })
        .finally(() => {
          // Allow retries if loading fails; also avoid holding onto resolved promises.
          delete preloadPromisesRef.current[key];
        });
      preloadPromisesRef.current[key] = promise;
      return promise;
    },
    [language]
  );

  const openCopyCurrentRecordDialogIfConfigured = useCallback(() => {
    const resolved = resolveCopyCurrentRecordDialog(definition as any, languageRef.current);
    if (!resolved) return;
    logEvent('ui.copyCurrent.dialog.open', {
      showCancel: resolved.showCancel,
      dismissOnBackdrop: resolved.dismissOnBackdrop,
      showCloseButton: resolved.showCloseButton
    });
    setCopyCurrentRecordDialog({
      open: true,
      title: resolved.title || tSystem('common.notice', languageRef.current, 'Notice'),
      message: resolved.message || '',
      confirmLabel: resolved.confirmLabel || tSystem('common.ok', languageRef.current, 'OK'),
      cancelLabel: resolved.cancelLabel || tSystem('common.cancel', languageRef.current, 'Cancel'),
      showCancel: resolved.showCancel,
      dismissOnBackdrop: resolved.dismissOnBackdrop,
      showCloseButton: resolved.showCloseButton
    });
  }, [definition, logEvent]);

  useEffect(() => {
    optionStateRef.current = optionState;
  }, [optionState]);
  useEffect(() => {
    tooltipStateRef.current = tooltipState;
  }, [tooltipState]);

  const ensureLineOptions = useCallback(
    (groupId: string, field: any) => {
      void loadOptionsForField(field, groupId);
    },
    [loadOptionsForField]
  );

  const preloadSummaryTooltips = useCallback(() => {
    const tasks: Promise<void>[] = [];
    definition.questions.forEach(q => {
      if (q.dataSource) tasks.push(loadOptionsForField(q) as Promise<void>);
      if (q.type === 'LINE_ITEM_GROUP') {
        (q.lineItemConfig?.fields || []).forEach(field => {
          if (field?.dataSource) tasks.push(loadOptionsForField(field, q.id) as Promise<void>);
        });
        (q.lineItemConfig?.subGroups || []).forEach(sub => {
          const subKey = resolveSubgroupKey(sub);
          (sub.fields || []).forEach(field => {
            if (field?.dataSource) tasks.push(loadOptionsForField(field, `${q.id}::${subKey}`) as Promise<void>);
          });
        });
      }
    });
    return Promise.all(tasks).then(() => undefined);
  }, [definition.questions, loadOptionsForField]);
  const clearStatus = useCallback(() => {
    setStatus(null);
    setStatusLevel(null);
    logEvent('status.cleared');
  }, [logEvent]);

  const navigateToFieldFromHeaderNotice = useCallback(
    (fieldPath: string) => {
      const key = (fieldPath || '').toString();
      if (!key) return;
      const nav = formNavigateToFieldRef.current;
      if (nav) {
        nav(key);
        logEvent('validation.notice.navigate', { fieldPath: key });
        return;
      }
      // Best-effort fallback (should be rare): still try to surface the top of the form.
      try {
        globalThis.scrollTo?.({ top: 0, left: 0, behavior: 'smooth' } as any);
      } catch (_) {
        try {
          globalThis.scrollTo?.(0, 0);
        } catch (_) {
          // ignore
        }
      }
      logEvent('validation.notice.navigateFallback', { fieldPath: key });
    },
    [logEvent]
  );

  const dismissValidationNotice = useCallback(() => {
    setValidationNoticeHidden(true);
    logEvent('validation.notice.dismiss');
  }, [logEvent]);

  // Warnings are surfaced as transient "submission messages" in Form view.
  // Summary/PDF compute warnings from record values, so clear when leaving the Form view.
  useEffect(() => {
    if (view === 'form') return;
    setValidationWarnings({ top: [], byField: {} });
    warningTouchedRef.current.clear();
    setValidationAttempted(false);
    setValidationNoticeHidden(false);
  }, [view]);

  // Close the submit confirmation dialog when navigating away.
  useEffect(() => {
    if (view === 'form' || view === 'summary') return;
    if (!submitConfirmOpen) return;
    setSubmitConfirmOpen(false);
    submitConfirmedRef.current = false;
  }, [submitConfirmOpen, view]);

  // Escape closes the submit confirmation dialog.
  useEffect(() => {
    if (!submitConfirmOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSubmitConfirmOpen(false);
    };
    globalThis.addEventListener?.('keydown', onKeyDown as any);
    return () => globalThis.removeEventListener?.('keydown', onKeyDown as any);
  }, [submitConfirmOpen]);

  useEffect(() => {
    const updateMobile = () => {
      if (typeof window === 'undefined') return;
      const widthBased = window.innerWidth <= 900;
      const shortBased = window.innerHeight <= 520;
      // Use media query for orientation so the on-screen keyboard (which shrinks innerHeight)
      // doesn't accidentally flip us into "landscape/compact" mode while typing in portrait.
      const landscapeBased =
        typeof window.matchMedia === 'function'
          ? window.matchMedia('(orientation: landscape)').matches
          : window.innerWidth > window.innerHeight;
      const uaBased = typeof navigator !== 'undefined' && /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      const mobile = widthBased || uaBased;
      setIsMobile(mobile);
      setIsLandscape(landscapeBased);
      setIsCompact(mobile && shortBased && landscapeBased);
    };
    updateMobile();
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', updateMobile);
      window.addEventListener('orientationchange', updateMobile);
      return () => {
        window.removeEventListener('resize', updateMobile);
        window.removeEventListener('orientationchange', updateMobile);
      };
    }
    return undefined;
  }, []);

  // Measure sticky header height so the Top action bar can stick just below it.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (typeof window === 'undefined') return;
    const root = document.documentElement;
    if (!root) return;

    let raf = 0;
    const update = () => {
      raf = 0;
      const header = document.querySelector<HTMLElement>('.ck-app-header');
      if (!header) return;
      const h = header.offsetHeight || 0;
      root.style.setProperty('--ck-header-height', `${h}px`);
    };
    const schedule = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(update);
    };
    schedule();
    window.addEventListener('resize', schedule);
    window.addEventListener('orientationchange', schedule);
    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('orientationchange', schedule);
    };
  }, [language, isCompact, isMobile]);

  // iOS Safari / in-app browsers can "clip" fixed bottom bars due to dynamic toolbars.
  // Use visualViewport to compute a bottom inset and expose it as a CSS variable.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (typeof document === 'undefined') return;

    const root = document.documentElement;
    const vv = window.visualViewport;
    if (!root) return;

    if (!vv) {
      root.style.setProperty('--vv-bottom', '0px');
      return;
    }

    let raf = 0;
    const update = () => {
      raf = 0;
      const bottom = Math.max(0, window.innerHeight - (vv.height + vv.offsetTop));
      root.style.setProperty('--vv-bottom', `${bottom}px`);
      if (vvBottomRef.current !== bottom) {
        vvBottomRef.current = bottom;
        logEvent('ui.viewport.vvBottom', {
          bottomPx: bottom,
          innerHeight: window.innerHeight,
          vvHeight: vv.height,
          vvOffsetTop: vv.offsetTop
        });
      }
    };
    const schedule = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(update);
    };

    schedule();
    vv.addEventListener('resize', schedule);
    vv.addEventListener('scroll', schedule);
    window.addEventListener('resize', schedule);
    window.addEventListener('orientationchange', schedule);

    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      vv.removeEventListener('resize', schedule);
      vv.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('orientationchange', schedule);
    };
  }, [logEvent]);

  // Measure bottom action bar height so content isn't covered when buttons wrap onto multiple rows.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (typeof document === 'undefined') return;
    const root = document.documentElement;
    if (!root) return;

    const cssVar = '--ck-bottom-bar-height';
    let raf = 0;
    let ro: ResizeObserver | null = null;
    let observed: HTMLElement | null = null;

    const update = () => {
      raf = 0;
      const bar = document.querySelector<HTMLElement>('.ck-bottom-bar');

      if (bar !== observed) {
        ro?.disconnect();
        observed = bar;
        if (ro && bar) ro.observe(bar);
      }

      if (!bar) {
        root.style.removeProperty(cssVar);
        if (bottomBarHeightRef.current !== -1) {
          bottomBarHeightRef.current = -1;
          logEvent('ui.actionBars.bottomBarHeight', { heightPx: null });
        }
        return;
      }

      const h = Math.max(0, Math.round(bar.getBoundingClientRect().height));
      root.style.setProperty(cssVar, `${h}px`);
      if (bottomBarHeightRef.current !== h) {
        bottomBarHeightRef.current = h;
        logEvent('ui.actionBars.bottomBarHeight', { heightPx: h });
      }
    };

    const schedule = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(update);
    };

    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => schedule());
    }

    schedule();
    window.addEventListener('resize', schedule);
    window.addEventListener('orientationchange', schedule);
    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('orientationchange', schedule);
      ro?.disconnect();
    };
  }, [logEvent]);

  useEffect(() => {
    // iOS Safari/WebViews can still auto-zoom/re-scale on focus in some contexts.
    // Re-apply the viewport constraints on focus so typing doesn't change the page scale.
    if (typeof document === 'undefined') return;
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    const isiOS = /iPad|iPhone|iPod/i.test(ua);
    if (!isiOS) return;

    const desired =
      'width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';
    const relaxed = 'width=device-width, initial-scale=1, viewport-fit=cover';

    const setViewport = (content: string) => {
      const metas = Array.from(document.querySelectorAll<HTMLMetaElement>('meta[name="viewport"]'));
      if (!metas.length) {
        const created = document.createElement('meta');
        created.setAttribute('name', 'viewport');
        created.setAttribute('content', content);
        document.head?.appendChild(created);
        return;
      }
      metas.forEach(m => {
        if (m.getAttribute('content') !== content) m.setAttribute('content', content);
      });
    };

    const applyDesired = () => setViewport(desired);
    const applyRelaxed = () => setViewport(relaxed);

    const getViewportContents = (): string[] =>
      Array.from(document.querySelectorAll<HTMLMetaElement>('meta[name="viewport"]')).map(m => m.getAttribute('content') || '');

    const debugLog = (event: string, payload?: Record<string, unknown>) => {
      if (!debugEnabled || typeof console === 'undefined' || typeof console.info !== 'function') return;
      try {
        console.info('[ReactForm][iOSZoom]', event, payload || {});
      } catch (_) {
        // ignore logging failures
      }
    };

    const getElFontSizePx = (el: HTMLElement | null): number | null => {
      if (!el || typeof globalThis.getComputedStyle !== 'function') return null;
      const v = globalThis.getComputedStyle(el).fontSize || '';
      const n = parseFloat(v);
      return Number.isFinite(n) ? n : null;
    };

    const snapshotViewport = (label: string, el?: HTMLElement | null) => {
      const vv = globalThis.visualViewport || null;
      const scr = typeof globalThis.screen !== 'undefined' ? globalThis.screen : null;
      debugLog(label, {
        tag: el?.tagName,
        type: (el as HTMLInputElement | null)?.getAttribute?.('type') || undefined,
        fontSizePx: getElFontSizePx(el || null),
        vvScale: vv ? vv.scale : undefined,
        vvW: vv ? vv.width : undefined,
        vvH: vv ? vv.height : undefined,
        screenW: scr ? scr.width : undefined,
        screenH: scr ? scr.height : undefined,
        innerW: typeof globalThis.innerWidth === 'number' ? globalThis.innerWidth : undefined,
        innerH: typeof globalThis.innerHeight === 'number' ? globalThis.innerHeight : undefined,
        dpr: typeof globalThis.devicePixelRatio === 'number' ? globalThis.devicePixelRatio : undefined,
        viewportMeta: getViewportContents()
      });
    };

    applyDesired();

    const BASESCALE_CLASS = 'ck-ios-basescale';
    const computeBaseScaleMode = (): boolean => {
      const v = globalThis.visualViewport;
      const scrW = globalThis.screen?.width;
      if (!v || typeof v.width !== 'number' || typeof scrW !== 'number' || scrW <= 0) return false;
      return v.width > scrW * 1.3;
    };
    const updateBaseScaleClass = (label: string): boolean => {
      const mode = computeBaseScaleMode();
      const root = document.documentElement;
      const had = root.classList.contains(BASESCALE_CLASS);
      if (mode && !had) root.classList.add(BASESCALE_CLASS);
      if (!mode && had) root.classList.remove(BASESCALE_CLASS);
      if (mode !== had) snapshotViewport(`basescale.${mode ? 'on' : 'off'}.${label}`, null);
      return mode;
    };
    // Ensure the class is applied even if the early inline script didn't run (or measurements changed).
    updateBaseScaleClass('init');

    const isFormControl = (target: EventTarget | null): boolean => {
      const el = target as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    };

    const reapplySoon = () => {
      // Some WebViews mutate the viewport meta during/after focus; schedule a few re-applies to win the race.
      globalThis.setTimeout(applyDesired, 0);
      globalThis.setTimeout(applyDesired, 60);
      globalThis.setTimeout(applyDesired, 150);
      // Keyboard animation can take longer; keep one later re-apply.
      globalThis.setTimeout(applyDesired, 450);
    };

    const onPreFocus = (e: Event) => {
      if (!isFormControl(e.target)) return;
      applyDesired();
      updateBaseScaleClass('prefocus');
      reapplySoon();
    };

    const onFocusIn = (e: Event) => {
      if (!isFormControl(e.target)) return;
      applyDesired();
      updateBaseScaleClass('focusin');
      const el = e.target as HTMLElement;
      snapshotViewport('focusin', el);
      // iOS sometimes applies its zoom/viewport changes slightly after focus (keyboard animation).
      globalThis.setTimeout(() => snapshotViewport('focusin.after250', el), 250);
      globalThis.setTimeout(() => snapshotViewport('focusin.after800', el), 800);
      reapplySoon();
    };

    let lastResetAt = 0;
    const forceReset = (reason: string, el?: HTMLElement | null) => {
      const now = Date.now();
      if (now - lastResetAt < 700) return;
      lastResetAt = now;
      // Try to snap back to scale=1 by toggling viewport meta content.
      snapshotViewport(`reset.start.${reason}`, el || null);
      applyRelaxed();
      globalThis.setTimeout(applyDesired, 0);
      globalThis.setTimeout(applyDesired, 60);
      globalThis.setTimeout(applyDesired, 150);
      globalThis.setTimeout(() => snapshotViewport(`reset.end.${reason}`, el || null), 250);
    };

    const onFocusOut = (e: Event) => {
      if (!isFormControl(e.target)) return;
      const el = e.target as HTMLElement;
      snapshotViewport('focusout', el);
      globalThis.setTimeout(() => snapshotViewport('focusout.after250', el), 250);
      globalThis.setTimeout(() => snapshotViewport('focusout.after800', el), 800);
      const baseScaleMode = updateBaseScaleClass('focusout');
      // If we're in the "980px base viewport" mode, meta viewport toggling doesn't reliably change it.
      // Instead we compensate via CSS sizing (ck-ios-basescale). Don't spam viewport resets on every blur.
      if (baseScaleMode) {
        applyDesired();
        return;
      }
      // If iOS zoomed the page, try to reset after blur.
      const vv = globalThis.visualViewport || null;
      const looksZoomedByScale = !!(vv && typeof vv.scale === 'number' && vv.scale > 1.01);
      if (looksZoomedByScale) {
        forceReset('blurZoomed', e.target as HTMLElement);
      } else {
        applyDesired();
        reapplySoon();
      }
    };

    const vv = globalThis.visualViewport || null;
    const onVvResize = () => {
      // Keyboard open/close triggers visualViewport resize; if scale drifted, try to reset.
      const v = globalThis.visualViewport;
      if (!v) return;
      const looksZoomedByScale = typeof v.scale === 'number' && v.scale > 1.01;
      const baseScaleMode = updateBaseScaleClass('vvresize');
      // Avoid noisy logs/resets in base-scale mode; compensation is CSS-driven there.
      if (baseScaleMode) {
        if (!looksZoomedByScale) applyDesired();
        return;
      }
      if (looksZoomedByScale) {
        forceReset('vvResizeZoomed');
      } else {
        applyDesired();
      }
    };

    const maybeFixInitialBaseScale = (label: string) => {
      // Just re-check class application (measurements can stabilize after load).
      updateBaseScaleClass(`init.${label}`);
    };

    // Apply before focus happens (best-effort) and again on focus.
    const preFocusOpts: AddEventListenerOptions = { capture: true, passive: true };
    document.addEventListener('pointerdown', onPreFocus, preFocusOpts);
    document.addEventListener('touchstart', onPreFocus, preFocusOpts);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    vv?.addEventListener?.('resize', onVvResize);

    // Also try to normalize the base scale shortly after mount. This prevents the
    // "everything is small until first focus, then it zooms and stays" behavior.
    globalThis.setTimeout(() => maybeFixInitialBaseScale('t0'), 0);
    globalThis.setTimeout(() => maybeFixInitialBaseScale('t250'), 250);
    globalThis.setTimeout(() => maybeFixInitialBaseScale('t900'), 900);

    return () => {
      document.removeEventListener('pointerdown', onPreFocus, preFocusOpts);
      document.removeEventListener('touchstart', onPreFocus, preFocusOpts);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      vv?.removeEventListener?.('resize', onVvResize);
    };
  }, [debugEnabled]);

  const openExistingRecordFromDedup = useCallback(
    async (args: { recordId: string; rowNumber?: number | null; source: string; view?: 'auto' | 'form' | 'summary' }): Promise<boolean> => {
      const id = (args.recordId || '').toString().trim();
      if (!id) return false;
      bumpRecordSession({ reason: 'dedup.openExisting', nextRecordId: id });
      const rowNumberRaw = args.rowNumber;
      const rowNumber =
        rowNumberRaw === undefined || rowNumberRaw === null || !Number.isFinite(Number(rowNumberRaw))
          ? undefined
          : Number(rowNumberRaw);
      const requestedView = (args.view || 'auto').toString().trim().toLowerCase() as 'auto' | 'form' | 'summary';

      // Clear transient status before navigation.
      setStatus(null);
      setStatusLevel(null);
      setRecordLoadError(null);

      // Prefer cached record (instant).
      const cached = listCache.records[id];
      if (cached) {
        applyRecordSnapshot(cached);
        const statusRaw = ((cached.status || '') as any)?.toString?.() || '';
        const summaryEnabled = definition.summaryViewEnabled !== false;
        const resolved = resolveStatusAutoView(statusRaw, summaryEnabled);
        const targetView =
          requestedView === 'form' ? 'form' : requestedView === 'summary' ? (summaryEnabled ? 'summary' : 'form') : resolved.view;
        setView(targetView);
        logEvent('dedup.precreate.openExisting.viewByStatus', {
          source: args.source,
          recordId: id,
          status: statusRaw || null,
          statusKey: resolved.statusKey,
          nextView: targetView,
          requestedView
        });
        logEvent('dedup.precreate.openExisting.cached', { source: args.source, recordId: id });
        return true;
      }

      const ok = await loadRecordSnapshot(id, rowNumber);
      if (!ok) {
        logEvent('dedup.precreate.openExisting.notFound', { source: args.source, recordId: id, rowNumber: rowNumber ?? null });
        return false;
      }
      const statusRaw = ((selectedRecordSnapshotRef.current?.status || '') as any)?.toString?.() || '';
      const summaryEnabled = definition.summaryViewEnabled !== false;
      const resolved = resolveStatusAutoView(statusRaw, summaryEnabled);
      const targetView =
        requestedView === 'form' ? 'form' : requestedView === 'summary' ? (summaryEnabled ? 'summary' : 'form') : resolved.view;
      setView(targetView);
      logEvent('dedup.precreate.openExisting.viewByStatus', {
        source: args.source,
        recordId: id,
        status: statusRaw || null,
        statusKey: resolved.statusKey,
        nextView: targetView,
        requestedView
      });
      logEvent('dedup.precreate.openExisting.ok', { source: args.source, recordId: id, rowNumber: rowNumber ?? null });
      return true;
    },
    [
      applyRecordSnapshot,
      bumpRecordSession,
      definition.summaryViewEnabled,
      listCache.records,
      loadRecordSnapshot,
      logEvent,
      resolveStatusAutoView
    ]
  );

  const precheckCreateDedupAndMaybeNavigate = useCallback(
    async (args: {
      values: Record<string, FieldValue>;
      lineItems: LineItemState;
      source: string;
      onDuplicate?: (conflict: DedupConflictInfo) => Promise<boolean | void> | boolean | void;
    }): Promise<boolean> => {
      const signature = computeDedupSignatureFromValues((definition as any)?.dedupRules, args.values as any);
      if (!signature) return false;
      const startedAt = Date.now();
      setPrecreateDedupChecking(true);
      logEvent('dedup.precreate.check.start', { source: args.source, signatureLen: signature.length });
      try {
        const payload = buildDraftPayload({
          definition,
          formKey,
          language: languageRef.current,
          values: args.values,
          lineItems: args.lineItems
        }) as any;
        const res = await checkDedupConflictApi(payload);
        if (!res?.success) {
          const msg = (res?.message || 'Failed').toString();
          logEvent('dedup.precreate.check.failed', { source: args.source, message: msg });
          return false;
        }
        const conflict: any = (res as any)?.conflict || null;
        const existingRecordId = (conflict?.existingRecordId || '').toString().trim();
        const existingRowNumber = Number.isFinite(Number(conflict?.existingRowNumber)) ? Number(conflict?.existingRowNumber) : undefined;
        if (!existingRecordId) {
          logEvent('dedup.precreate.check.ok', { source: args.source });
          return false;
        }
        const conflictInfo: DedupConflictInfo = {
          ruleId: (conflict?.ruleId || 'dedup').toString(),
          message: (conflict?.message || '').toString(),
          existingRecordId,
          existingRowNumber
        };
        logEvent('dedup.precreate.conflict', {
          source: args.source,
          existingRecordId,
          existingRowNumber: existingRowNumber ?? null
        });
        if (args.onDuplicate) {
          const handled = await args.onDuplicate(conflictInfo);
          if (handled) return true;
        }
        await openExistingRecordFromDedup({
          recordId: existingRecordId,
          rowNumber: existingRowNumber,
          source: args.source
        });
        return true;
      } catch (err: any) {
        const msg = (err?.message || err?.toString?.() || 'Failed').toString();
        logEvent('dedup.precreate.check.exception', { source: args.source, message: msg });
        return false;
      } finally {
        setPrecreateDedupChecking(false);
        logEvent('dedup.precreate.check.end', { source: args.source, durationMs: Date.now() - startedAt });
      }
    },
    [definition, formKey, logEvent, openExistingRecordFromDedup]
  );

  const handleSubmitAnother = useCallback(() => {
    void (async () => {
      // Compute candidate defaults first; if they match a dedup rule, open the existing record instead of creating a duplicate.
      const normalized = normalizeRecordValues(definition);
      const initialLineItems = buildInitialLineItems(definition);
      const mapped = applyValueMapsToForm(definition, normalized, initialLineItems, { mode: 'init' });
      const handled = await precheckCreateDedupAndMaybeNavigate({
        values: mapped.values,
        lineItems: mapped.lineItems,
        source: 'createNew'
      });
      if (handled) return;

      bumpRecordSession({ reason: 'createNew', nextRecordId: null });
      createFlowRef.current = true;
      createFlowUserEditedRef.current = false;
      autoSaveUserEditedRef.current = false;
      dedupHoldRef.current = false;
      autoSaveDirtyRef.current = false;
      if (autoSaveTimerRef.current) {
        globalThis.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      setDraftSave({ phase: 'idle' });
      setDedupChecking(false);
      setDedupConflict(null);
      setDedupNotice(null);
      dedupCheckingRef.current = false;
      dedupConflictRef.current = null;
      lastDedupCheckedSignatureRef.current = '';
      dedupBaselineSignatureRef.current = '';
      dedupKeyFingerprintBaselineRef.current = '';
      dedupDeleteOnKeyChangeInFlightRef.current = false;
      recordStaleRef.current = null;
      setRecordStale(null);
      recordDataVersionRef.current = null;
      recordRowNumberRef.current = null;
      lastAutoSaveSeenRef.current = { values: mapped.values, lineItems: mapped.lineItems };
      setValues(mapped.values);
      setLineItems(mapped.lineItems);
      setErrors({});
      setValidationWarnings({ top: [], byField: {} });
      setValidationAttempted(false);
      setValidationNoticeHidden(false);
      setStatus(null);
      setStatusLevel(null);
      setSelectedRecordId('');
      setSelectedRecordSnapshot(null);
      setLastSubmissionMeta(null);
      setView('form');
      logEvent('form.reset', { reason: 'submitAnother' });
    })();
  }, [bumpRecordSession, definition, logEvent, precheckCreateDedupAndMaybeNavigate]);

  const handleDuplicateCurrent = useCallback(() => {
    bumpRecordSession({ reason: 'duplicateCurrent', nextRecordId: null });
    createFlowRef.current = true;
    createFlowUserEditedRef.current = false;
    autoSaveUserEditedRef.current = false;
    dedupHoldRef.current = false;
    // Preserve current values/line items but clear record context so the next submit creates a new record.
    autoSaveDirtyRef.current = false;
    if (autoSaveTimerRef.current) {
      globalThis.clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    setDraftSave({ phase: 'idle' });
    setDedupChecking(false);
    setDedupConflict(null);
    setDedupNotice(null);
    dedupCheckingRef.current = false;
    dedupConflictRef.current = null;
    lastDedupCheckedSignatureRef.current = '';
    dedupBaselineSignatureRef.current = '';
    dedupKeyFingerprintBaselineRef.current = '';
    dedupDeleteOnKeyChangeInFlightRef.current = false;
    recordStaleRef.current = null;
    setRecordStale(null);
    recordDataVersionRef.current = null;
    recordRowNumberRef.current = null;
    const profiled = applyCopyCurrentRecordProfile({
      definition: definition as any,
      values: valuesRef.current,
      lineItems: lineItemsRef.current
    });
    if (profiled) {
      logEvent('ui.copyCurrent.profile.applied', {
        keepValueCount: Object.keys(profiled.values || {}).length,
        groupCount: Object.keys(profiled.lineItems || {}).length
      });
    }
    const base = profiled || { values: valuesRef.current, lineItems: lineItemsRef.current };
    const cleared = clearAutoIncrementFields(definition, base.values, base.lineItems);
    const dropFieldsRaw = Array.isArray(definition.copyCurrentRecordDropFields) ? definition.copyCurrentRecordDropFields : [];
    const dropFields = dropFieldsRaw
      .map(v => (v === undefined || v === null ? '' : v.toString()).trim())
      .filter(Boolean);
    if (dropFields.length) {
      const nextValues: Record<string, any> = { ...(cleared.values as any) };
      let nextLineItems: any = cleared.lineItems;
      let lineItemsChanged = false;
      const droppedValues: string[] = [];
      dropFields.forEach(fieldId => {
        if (!fieldId) return;
        if (Object.prototype.hasOwnProperty.call(nextValues, fieldId)) droppedValues.push(fieldId);
        delete (nextValues as any)[fieldId];

        // Best-effort: allow dropping entire line item groups (and their subgroups) by id.
        if (nextLineItems && typeof nextLineItems === 'object') {
          Object.keys(nextLineItems).forEach(k => {
            if (k === fieldId || k.startsWith(`${fieldId}__`)) {
              if (!lineItemsChanged) {
                nextLineItems = { ...(nextLineItems as any) };
                lineItemsChanged = true;
              }
              (nextLineItems as any)[k] = [];
            }
          });
        }
      });
      logEvent('ui.copyCurrent.dropFields', {
        count: dropFields.length,
        droppedValuesCount: droppedValues.length,
        droppedValues,
        lineItemsCleared: lineItemsChanged
      });
      // Keep refs in sync immediately so downstream actions (autosave/submit) can use the new draft values without waiting for a re-render.
      valuesRef.current = nextValues as any;
      lineItemsRef.current = nextLineItems;
      lastAutoSaveSeenRef.current = { values: nextValues as any, lineItems: nextLineItems };
      setValues(nextValues as any);
      setLineItems(nextLineItems);
    } else {
      // Keep refs in sync immediately so downstream actions (autosave/submit) can use the new draft values without waiting for a re-render.
      valuesRef.current = cleared.values as any;
      lineItemsRef.current = cleared.lineItems;
      lastAutoSaveSeenRef.current = { values: cleared.values, lineItems: cleared.lineItems };
      setValues(cleared.values);
      setLineItems(cleared.lineItems);
    }
    setSelectedRecordId('');
    // Keep refs in sync immediately so autosave/submit flows do not treat the copied draft
    // as an update of the currently selected (potentially Closed) record.
    selectedRecordIdRef.current = '';
    setSelectedRecordSnapshot(null);
    selectedRecordSnapshotRef.current = null;
    setLastSubmissionMeta(null);
    lastSubmissionMetaRef.current = null;
    setErrors({});
    setValidationWarnings({ top: [], byField: {} });
    setValidationAttempted(false);
    setValidationNoticeHidden(false);
    setStatus(null);
    setStatusLevel(null);
    setView('form');
    openCopyCurrentRecordDialogIfConfigured();
  }, [bumpRecordSession, definition, logEvent, openCopyCurrentRecordDialogIfConfigured]);

  const CK_BUTTON_IDX_TOKEN = '__ckQIdx=';
  const parseButtonRef = useCallback((ref: string): { id: string; qIdx?: number } => {
    const raw = (ref || '').toString();
    const pos = raw.lastIndexOf(CK_BUTTON_IDX_TOKEN);
    if (pos < 0) return { id: raw };
    const id = raw.slice(0, pos);
    const idxRaw = raw.slice(pos + CK_BUTTON_IDX_TOKEN.length);
    const qIdx = Number.parseInt(idxRaw, 10);
    if (!Number.isFinite(qIdx)) return { id: raw };
    return { id, qIdx };
  }, []);

  const encodeButtonRef = useCallback(
    (id: string, qIdx?: number) => {
      const base = (id || '').toString();
      if (qIdx === undefined || qIdx === null || !Number.isFinite(qIdx)) return base;
      return `${base}${CK_BUTTON_IDX_TOKEN}${qIdx}`;
    },
    []
  );

  const resolveTemplateIdForClient = useCallback((template: any, language: string): string | undefined => {
    if (!template) return undefined;
    const pick = (v: any) => (v !== undefined && v !== null ? v.toString().trim() : '');
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
  }, []);

  const customButtons = useMemo(() => {
    const createPresetEnabled = definition.createRecordPresetButtonsEnabled !== false;
    const applyVisibility = view !== 'list';
    const guidedStepsCfg = applyVisibility && (definition as any)?.steps?.mode === 'guided' ? ((definition as any).steps as any) : null;
    const guidedPrefix = (guidedStepsCfg?.stateFields?.prefix || '__ckStep').toString();
    const guidedStepIds: string[] = guidedStepsCfg?.items
      ? (guidedStepsCfg.items as any[])
          .map(s => (s?.id !== undefined && s?.id !== null ? s.id.toString().trim() : ''))
          .filter(Boolean)
      : [];
    const guidedStatus = guidedStepsCfg ? computeGuidedStepsStatus({ definition: definition as any, language: language as any, values: values as any, lineItems: lineItems as any }) : null;
    const guidedDefaultForwardGate = ((guidedStepsCfg as any)?.defaultForwardGate || 'whenValid') as 'free' | 'whenComplete' | 'whenValid';
    const guidedMaxReachableIndex = (() => {
      if (!guidedStepsCfg) return -1;
      if (!guidedStepIds.length) return -1;
      if (guidedDefaultForwardGate === 'free') return guidedStepIds.length - 1;
      if (guidedDefaultForwardGate === 'whenComplete') {
        return Math.min(guidedStepIds.length - 1, Math.max(0, (guidedStatus?.maxCompleteIndex ?? -1) + 1));
      }
      return Math.min(guidedStepIds.length - 1, Math.max(0, (guidedStatus?.maxValidIndex ?? -1) + 1));
    })();
    const guidedActiveStepIndex = guidedMaxReachableIndex >= 0 ? guidedMaxReachableIndex : 0;
    const guidedActiveStepId = guidedStepIds[guidedActiveStepIndex] || guidedStepIds[0] || '';
    const guidedVirtualState = guidedStepsCfg
      ? ({
          prefix: guidedPrefix,
          activeStepId: guidedActiveStepId,
          activeStepIndex: guidedActiveStepIndex,
          maxValidIndex: guidedStatus?.maxValidIndex ?? -1,
          maxCompleteIndex: guidedStatus?.maxCompleteIndex ?? -1,
          steps: guidedStatus?.steps || []
        } as any)
      : null;
    const resolveButtonVisibilityValue = (fieldId: string): FieldValue | undefined => {
      if (guidedVirtualState) {
        const virtual = resolveVirtualStepField(fieldId, guidedVirtualState);
        if (virtual !== undefined) return virtual as FieldValue;
      }
      const direct = values[fieldId];
      if (direct !== undefined && direct !== null && direct !== '') return direct as FieldValue;
      // System/meta fields (not part of `values`): allow referencing STATUS/status/pdfUrl/etc in visibility rules.
      const meta: any = {
        id: selectedRecordId || selectedRecordSnapshot?.id || lastSubmissionMeta?.id,
        createdAt: selectedRecordSnapshot?.createdAt || lastSubmissionMeta?.createdAt,
        updatedAt: selectedRecordSnapshot?.updatedAt || lastSubmissionMeta?.updatedAt,
        status: selectedRecordSnapshot?.status || lastSubmissionMeta?.status || null,
        pdfUrl: selectedRecordSnapshot?.pdfUrl || undefined
      };
      const sys = getSystemFieldValue(fieldId, meta);
      if (sys !== undefined) return sys as FieldValue;
      // Best-effort: scan current line item rows for the first non-empty occurrence.
      for (const rows of Object.values(lineItems)) {
        if (!Array.isArray(rows)) continue;
        for (const row of rows as any[]) {
          const v = (row as any)?.values?.[fieldId];
          if (v !== undefined && v !== null && v !== '') return v as FieldValue;
        }
      }
      return undefined;
    };
    const visibilityCtx = {
      getValue: (fieldId: string) => resolveButtonVisibilityValue(fieldId),
      getLineItems: (groupId: string) => lineItems[groupId] || [],
      getLineItemKeys: () => Object.keys(lineItems)
    } as any;
    return definition.questions
      .map((q, idx) => ({ q, idx }))
      .filter(({ q }) => q.type === 'BUTTON')
      .map(({ q, idx }) => {
        if (applyVisibility && shouldHideField((q as any)?.visibility, visibilityCtx)) {
          return null;
        }
        const cfg: any = (q as any)?.button;
        if (!cfg || typeof cfg !== 'object') return null;
        const action = (cfg.action || '').toString().trim();
        if (action === 'renderDocTemplate' || action === 'renderMarkdownTemplate' || action === 'renderHtmlTemplate') {
          if (!cfg.templateId) return null;
        } else if (action === 'createRecordPreset') {
          if (!createPresetEnabled) return null;
          if (!cfg.presetValues || typeof cfg.presetValues !== 'object') return null;
        } else if (action === 'updateRecord') {
          const setObj = cfg.set || cfg.patch || cfg.update || null;
          if (!setObj || typeof setObj !== 'object') return null;
          const hasStatus = (setObj as any).status !== undefined;
          const valuesObj = (setObj as any).values;
          const hasValues = valuesObj && typeof valuesObj === 'object';
          if (!hasStatus && !hasValues) return null;
        } else if (action === 'openUrlField') {
          if (!cfg.fieldId) return null;
        } else {
          return null;
        }

        const placementsRaw = cfg.placements;
        const placements = Array.isArray(placementsRaw) && placementsRaw.length ? placementsRaw : (['form'] as const);
        // Use a stable "button reference" that includes the question index.
        // This avoids ambiguity if multiple BUTTON fields accidentally share the same id.
        const id = encodeButtonRef(q.id, idx);
        return { id, label: resolveLabel(q, language), placements: placements as any, action: action as any };
      })
      .filter((b): b is { id: string; label: string; placements: any[]; action: any } => !!b);
  }, [
    definition.createRecordPresetButtonsEnabled,
    definition.questions,
    encodeButtonRef,
    language,
    lastSubmissionMeta,
    lineItems,
    selectedRecordId,
    selectedRecordSnapshot,
    values,
    view
  ]);

  const base64ToPdfObjectUrl = useCallback((pdfBase64: string, mimeType: string) => {
    const raw = (pdfBase64 || '').toString();
    const binary = globalThis.atob ? globalThis.atob(raw) : atob(raw);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: mimeType || 'application/pdf' });
    return URL.createObjectURL(blob);
  }, []);

  const openPdfPreviewWindow = useCallback(
    (args: { title: string; subtitle?: string; language: LangCode; loadingLabel?: string }) => {
      try {
        const w = globalThis.window?.open('', '_blank');
        if (!w) return null;
        try {
          const title = (args.title || '').toString();
          const subtitle = (args.subtitle || '').toString();
          const loading = (args.loadingLabel || tSystem('report.generatingPdf', args.language, 'Generating PDF…')).toString();
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
          w.document.open();
          w.document.write(html);
          w.document.close();
        } catch (_) {
          // best effort
        }
        return w;
      } catch (_) {
        return null;
      }
    },
    []
  );

  const generateReportPdfPreview = useCallback(
    async (args: { buttonId: string; popup?: Window | null }) => {
      const buttonId = args.buttonId;
      const popup = args.popup || null;
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
        // Track busy state for inline buttons, but do not open an in-app overlay for PDFs.
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
        // Ignore stale responses (e.g., user clicked another report or closed the overlay).
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
          } catch (_) {
            // ignore
          }
          logEvent('report.pdfPreview.error', { buttonId, message: msg });
          return;
        }
        const mimeType = (res.mimeType || 'application/pdf').toString();
        const objectUrl = base64ToPdfObjectUrl(res.pdfBase64, mimeType);

        // Open the blob URL (prefer the pre-opened popup window to avoid async popup blocking).
        let opened = false;
        try {
          if (popup && !popup.closed) {
            popup.location.href = objectUrl;
            opened = true;
          }
        } catch (_) {
          opened = false;
        }
        if (!opened) {
          // Fallback: navigate this tab (guaranteed allowed). User can use Back to return.
          try {
            globalThis.location?.assign?.(objectUrl);
            opened = true;
            } catch (_) {
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
          // Always surface errors in-app as well.
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
          } catch (_) {
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
    [base64ToPdfObjectUrl, definition, formKey, logEvent]
  );

  const openReport = useCallback(
    (args: { buttonId: string; popup?: Window | null }) => {
      void generateReportPdfPreview({ buttonId: args.buttonId, popup: args.popup });
    },
    [generateReportPdfPreview]
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

        const res = await renderMarkdownTemplateApi(draft, buttonId);
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
    [definition, formKey, logEvent, parseButtonRef, resolveTemplateIdForClient]
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
        const useBundled = isBundledHtmlTemplateId(resolved || '');
        if (useBundled) {
          logEvent('report.htmlPreview.bundle.start', { buttonId: baseId, qIdx: qIdx ?? null });
        }
        const res = useBundled
          ? await renderBundledHtmlTemplateClient({
              definition,
              payload: draft as any,
              templateIdMap,
              buttonId
            })
          : await renderHtmlTemplateApi(draft, buttonId);
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
    [definition, formKey, logEvent, parseButtonRef, resolveTemplateIdForClient]
  );

  const openHtml = useCallback(
    (buttonId: string) => {
      void generateReportHtmlPreview(buttonId);
    },
    [generateReportHtmlPreview]
  );

  const createRecordFromPreset = useCallback(
    async (args: { buttonId: string; presetValues: Record<string, any> }) => {
      const { buttonId, presetValues } = args;

      const parsedRef = parseButtonRef(buttonId || '');
      const baseId = parsedRef.id;
      const qIdx = parsedRef.qIdx;

      const baseValues = normalizeRecordValues(definition);
      const valuesWithPreset: Record<string, FieldValue> = { ...(baseValues as any) };
      const unknownFields: string[] = [];
      const appliedFields: string[] = [];

      Object.keys(presetValues || {}).forEach(fieldIdRaw => {
        const fieldId = (fieldIdRaw || '').toString().trim();
        if (!fieldId) return;
        const q = definition.questions.find(qq => qq.id === fieldId);
        if (!q || q.type === 'LINE_ITEM_GROUP' || q.type === 'BUTTON' || q.type === 'FILE_UPLOAD') {
          unknownFields.push(fieldId);
          return;
        }
        const opts = (q as any).options;
        const hasAnyOption = !!(opts?.en?.length || opts?.fr?.length || opts?.nl?.length);
        const coerced = coerceDefaultValue({
          type: (q as any).type || '',
          raw: (presetValues as any)[fieldIdRaw],
          hasAnyOption,
          hasDataSource: !!(q as any).dataSource
        });
        if (coerced !== undefined) {
          valuesWithPreset[fieldId] = coerced;
          appliedFields.push(fieldId);
        }
      });

      const initialLineItems = buildInitialLineItems(definition);
      const mapped = applyValueMapsToForm(definition, valuesWithPreset, initialLineItems, { mode: 'init' });

      // Precheck dedup BEFORE navigating to the new record (avoid duplicate creation when presets/defaults populate dedup keys).
      const listViewDuplicateHandler =
        view === 'list'
          ? (conflict: DedupConflictInfo) => {
              const prompt: ListDedupPromptState = {
                conflict,
                source: 'createRecordPreset',
                buttonId: baseId,
                qIdx: qIdx ?? null,
                values: mapped.values
              };
              setListDedupPrompt(prompt);
              logEvent('dedup.precreate.listDialog.open', {
                source: prompt.source,
                buttonId: prompt.buttonId,
                qIdx: prompt.qIdx ?? null,
                existingRecordId: conflict.existingRecordId || null,
                existingRowNumber: conflict.existingRowNumber ?? null
              });
              return true;
            }
          : undefined;
      const handled = await precheckCreateDedupAndMaybeNavigate({
        values: mapped.values,
        lineItems: mapped.lineItems,
        source: 'createRecordPreset',
        onDuplicate: listViewDuplicateHandler
      });
      if (handled) return;

      createFlowRef.current = true;
      createFlowUserEditedRef.current = false;
      dedupHoldRef.current = false;
      // Creating a preset record is a "new record" flow: clear draft autosave and record context.
      autoSaveDirtyRef.current = false;
      if (autoSaveTimerRef.current) {
        globalThis.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      setDraftSave({ phase: 'idle' });
      setDedupChecking(false);
      setDedupConflict(null);
      setDedupNotice(null);
      dedupCheckingRef.current = false;
      dedupConflictRef.current = null;
      lastDedupCheckedSignatureRef.current = '';
      dedupBaselineSignatureRef.current = '';
      dedupKeyFingerprintBaselineRef.current = '';
      dedupDeleteOnKeyChangeInFlightRef.current = false;
      recordStaleRef.current = null;
      setRecordStale(null);
      recordDataVersionRef.current = null;
      recordRowNumberRef.current = null;

      lastAutoSaveSeenRef.current = { values: mapped.values, lineItems: mapped.lineItems };
      setValues(mapped.values);
      setLineItems(mapped.lineItems);
      setErrors({});
      setStatus(null);
      setStatusLevel(null);
      setSelectedRecordId('');
      setSelectedRecordSnapshot(null);
      setLastSubmissionMeta(null);
      setView('form');

      logEvent('button.createRecordPreset.apply', {
        buttonId: baseId,
        qIdx: qIdx ?? null,
        appliedFieldCount: appliedFields.length,
        unknownFieldCount: unknownFields.length,
        unknownFields: unknownFields.length ? unknownFields.slice(0, 20) : []
      });
    },
    [definition, logEvent, parseButtonRef, precheckCreateDedupAndMaybeNavigate, view]
  );

  const handleCustomButton = useCallback(
    (buttonId: string) => {
      const parsedRef = parseButtonRef(buttonId || '');
      const baseId = parsedRef.id;
      const qIdx = parsedRef.qIdx;
      const indexed = qIdx !== undefined ? definition.questions[qIdx] : undefined;
      const btn =
        indexed && indexed.type === 'BUTTON' && indexed.id === baseId
          ? indexed
          : definition.questions.find(q => q.type === 'BUTTON' && q.id === baseId);
      const cfg: any = btn ? (btn as any).button : null;
      const action = (cfg?.action || '').toString().trim();
      logEvent('ui.customButton.click', { buttonId: baseId, qIdx: qIdx ?? null, action: action || null });

      if (action === 'renderDocTemplate') {
        const title = btn ? resolveLabel(btn, languageRef.current) : (baseId || 'Report');
        const loadingLabelResolved = resolveLocalizedString((cfg as any)?.loadingLabel, languageRef.current, '').toString().trim();
        const popup = openPdfPreviewWindow({
          title,
          subtitle: definition.title,
          language: languageRef.current,
          loadingLabel: loadingLabelResolved || undefined
        });
        if (!popup) {
          logEvent('report.pdfPreview.popupBlocked', { buttonId: baseId, qIdx: qIdx ?? null });
        } else {
          logEvent('report.pdfPreview.popupOpened', { buttonId: baseId, qIdx: qIdx ?? null });
        }
        openReport({ buttonId, popup });
        return;
      }
      if (action === 'openUrlField') {
        const fieldId = (cfg?.fieldId || '').toString().trim();
        if (!fieldId) return;

        const splitUrlList = (raw: string): string[] => {
          const trimmed = (raw || '').toString().trim();
          if (!trimmed) return [];
          const commaParts = trimmed
            .split(',')
            .map(p => p.trim())
            .filter(Boolean);
          if (commaParts.length > 1) return commaParts;
          const matches = trimmed.match(/https?:\/\/[^\s,]+/gi);
          if (matches && matches.length > 1) return matches.map(m => m.trim()).filter(Boolean);
          return [trimmed];
        };

        const recordId =
          resolveExistingRecordId({
            selectedRecordId: selectedRecordIdRef.current,
            selectedRecordSnapshot: selectedRecordSnapshotRef.current,
            lastSubmissionMetaId: lastSubmissionMetaRef.current?.id || null
          }) || '';
        const current = selectedRecordSnapshotRef.current || null;
        const raw = (() => {
          // Support meta url fields like pdfUrl.
          if (fieldId === 'pdfUrl') return (current as any)?.pdfUrl || '';
          if (fieldId === 'id') return recordId;
          const v = (valuesRef.current as any)?.[fieldId];
          if (v === undefined || v === null) return '';
          if (typeof v === 'string') return v;
          if (Array.isArray(v)) return v.join(' ');
          if (typeof v === 'object' && typeof (v as any).url === 'string') return (v as any).url;
          try {
            return v.toString();
          } catch (_) {
            return '';
          }
        })();

        const href = (() => {
          const urls = splitUrlList(raw).filter(u => /^https?:\/\//i.test(u));
          return urls[0] || '';
        })();
        if (!href) {
          setStatus(tSystem('actions.missingLink', languageRef.current, 'No link found.'));
          setStatusLevel('error');
          logEvent('button.openUrl.missing', { buttonId: baseId, qIdx: qIdx ?? null, fieldId, recordId: recordId || null });
          return;
        }

        // Prefer opening in a new tab (user gesture: should be allowed).
        let opened = false;
        try {
          const w = globalThis.window?.open?.(href, '_blank');
          opened = Boolean(w);
        } catch (_) {
          opened = false;
        }
        if (!opened) {
          // Fallback: navigate this tab.
          try {
            globalThis.location?.assign?.(href);
            opened = true;
          } catch (_) {
            opened = false;
          }
        }
        logEvent('button.openUrl.open', { buttonId: baseId, qIdx: qIdx ?? null, fieldId, opened });
        return;
      }
      if (action === 'renderMarkdownTemplate') {
        openMarkdown(buttonId);
        return;
      }
      if (action === 'renderHtmlTemplate') {
        openHtml(buttonId);
        return;
      }
      if (action === 'createRecordPreset') {
        void createRecordFromPreset({ buttonId, presetValues: (cfg?.presetValues || {}) as any });
        return;
      }
      if (action === 'updateRecord') {
        const setObj = (cfg?.set || cfg?.patch || cfg?.update || {}) as any;
        const navigateToRaw = (cfg?.navigateTo || cfg?.targetView || cfg?.openView || 'auto').toString().trim().toLowerCase();
        const navigateTo =
          navigateToRaw === 'form' || navigateToRaw === 'summary' || navigateToRaw === 'list' || navigateToRaw === 'auto'
            ? (navigateToRaw as 'auto' | 'form' | 'summary' | 'list')
            : 'auto';
        const confirmCfg = (cfg?.confirm || cfg?.confirmation || null) as any;
        const confirmMessage = confirmCfg ? resolveLocalizedString(confirmCfg?.message, languageRef.current, '').toString().trim() : '';
        const confirmTitle = confirmCfg ? resolveLocalizedString(confirmCfg?.title, languageRef.current, '').toString().trim() : '';
        const confirmLabel = confirmCfg
          ? resolveLocalizedString(confirmCfg?.confirmLabel, languageRef.current, '').toString().trim()
          : '';
        const cancelLabel = confirmCfg
          ? resolveLocalizedString(confirmCfg?.cancelLabel, languageRef.current, '').toString().trim()
          : '';

        const run = () => {
          if (updateRecordActionInFlightRef.current) {
            logEvent('button.updateRecord.blocked.inFlightGuard', { buttonId: baseId, qIdx: qIdx ?? null });
            return;
          }
          const busyTitle = btn ? resolveLabel(btn, languageRef.current) : (baseId || '');
          updateRecordActionInFlightRef.current = true;
          const pipelineStartMark = `ck.updateRecord.pipeline.start.${Date.now()}`;
          perfMark(pipelineStartMark);
          void runUpdateRecordAction(
            {
              definition,
              formKey,
              submit,
              tSystem,
              logEvent,
              refs: {
                languageRef,
                valuesRef,
                lineItemsRef,
                selectedRecordIdRef,
                selectedRecordSnapshotRef,
                lastSubmissionMetaRef,
                recordDataVersionRef,
                recordRowNumberRef,
                recordSessionRef,
                uploadQueueRef,
                autoSaveInFlightRef,
                recordStaleRef
              },
              setDraftSave,
              setStatus,
              setStatusLevel,
              setLastSubmissionMeta,
              setSelectedRecordSnapshot,
              setValues,
              setView,
              upsertListCacheRow,
              busy: updateRecordBusy
            } as any,
            {
              buttonId: baseId,
              buttonRef: buttonId,
              qIdx: qIdx,
              navigateTo,
              set: setObj as any,
              busyTitle
            }
          )
            .catch(() => {
              // runUpdateRecordAction reports failures through UI/logs; guard reset happens in finally below.
            })
            .finally(() => {
              updateRecordActionInFlightRef.current = false;
              const pipelineEndMark = `ck.updateRecord.pipeline.end.${Date.now()}`;
              perfMark(pipelineEndMark);
              perfMeasure('ck.updateRecord.pipeline', pipelineStartMark, pipelineEndMark, {
                buttonId: baseId,
                qIdx: qIdx ?? null
              });
            });
        };

        if (confirmMessage) {
          const title = confirmTitle || tSystem('common.confirm', languageRef.current, 'Confirm');
          const okLabel = confirmLabel || tSystem('common.confirm', languageRef.current, 'Confirm');
          const cancel = cancelLabel || tSystem('common.cancel', languageRef.current, 'Cancel');
          customConfirm.openConfirm({
            title,
            message: confirmMessage,
            confirmLabel: okLabel,
            cancelLabel: cancel,
            kind: 'updateRecord',
            refId: buttonId,
            onConfirm: run
          });
          logEvent('button.updateRecord.confirm.open', { buttonId: baseId, qIdx: qIdx ?? null, navigateTo });
          return;
        }

        run();
        return;
      }

      logEvent('ui.customButton.unsupported', { buttonId: baseId, qIdx: qIdx ?? null, action: action || null });
    },
    [
      createRecordFromPreset,
      definition,
      formKey,
      definition.title,
      definition.questions,
      logEvent,
      openHtml,
      openMarkdown,
      openPdfPreviewWindow,
      openReport,
      parseButtonRef,
      perfMark,
      perfMeasure,
      resolveLabel,
      upsertListCacheRow
    ]
  );

  const closeReportOverlay = useCallback(() => {
    // Cancel any in-flight report request so late responses can't re-open/overwrite the overlay.
    reportPdfSeqRef.current += 1;
    setReportOverlay(prev => ({
      ...(prev || { title: '' }),
      open: false,
      kind: 'pdf',
      pdfPhase: 'idle',
      pdfObjectUrl: undefined,
      pdfFileName: undefined,
      pdfMessage: undefined,
      markdown: undefined,
      html: undefined,
      buttonId: undefined
    }));
  }, []);

  const closeReadOnlyFilesOverlay = useCallback(() => {
    setReadOnlyFilesOverlay(prev => ({ ...prev, open: false }));
    logEvent('filesOverlay.readOnly.close');
  }, [logEvent]);

  const openReadOnlyFilesOverlay = useCallback(
    (fieldIdRaw: string) => {
      const fieldId = (fieldIdRaw || '').toString().trim();
      if (!fieldId) return;

      if (fieldId.startsWith('urls:')) {
        const payload = fieldId.slice(5);
        const items = (() => {
          if (!payload) return [];
          try {
            const decoded = decodeURIComponent(payload);
            const parsed = JSON.parse(decoded);
            if (Array.isArray(parsed)) {
              return parsed.map(item => (item == null ? '' : item.toString())).filter(Boolean);
            }
          } catch (_) {
            // fall back to pipe-separated payloads
            try {
              const decoded = decodeURIComponent(payload);
              return decoded
                .split('|')
                .map(part => (part || '').toString().trim())
                .filter(Boolean);
            } catch (_) {
              return [];
            }
          }
          return [];
        })();
        if (!items.length) return;
        const title = tSystem('files.title', languageRef.current, 'Photos');
        setReadOnlyFilesOverlay({ open: true, fieldId, title, items, uploadConfig: undefined });
        logEvent('filesOverlay.readOnly.open.inline', { fieldId: 'urls', count: items.length });
        return;
      }

      const q = definition.questions.find(qq => qq && qq.type === 'FILE_UPLOAD' && qq.id === fieldId) as any;
      if (!q) {
        logEvent('filesOverlay.readOnly.unknownField', { fieldId });
        return;
      }
      const items = toUploadItems(valuesRef.current[fieldId] as any);
      const title = resolveLabel(q, languageRef.current) || tSystem('files.title', languageRef.current, 'Photos');
      const uploadConfig = (q as any)?.uploadConfig || undefined;
      setReadOnlyFilesOverlay({ open: true, fieldId, title, items, uploadConfig });
      logEvent('filesOverlay.readOnly.open', { fieldId, count: items.length });
    },
    [definition.questions, logEvent]
  );

  const autoSaveEnabled = Boolean(definition.autoSave?.enabled);
  const summaryViewEnabled = definition.summaryViewEnabled !== false;
  const copyCurrentRecordEnabled = definition.copyCurrentRecordEnabled !== false;
  const autoSaveNoticeTitle = tSystem('autosaveNotice.title', language, 'Autosave is on');
  const autoSaveNoticeMessage = tSystem(
    'autosaveNotice.message',
    language,
    'This form saves your changes automatically in the background. Look for the status indicators in the top right corner of the form.'
  );
  const autoSaveNoticeConfirmLabel = tSystem('autosaveNotice.confirm', language, 'Got it');
  const autoSaveNoticeCancelLabel = tSystem('autosaveNotice.cancel', language, tSystem('common.close', language, 'Close'));
  const submitButtonLabelResolved = useMemo(
    () =>
      resolveLocalizedString(
        definition.submitButtonLabel,
        language,
        tSystem('submit.confirm', language, tSystem('actions.submit', language, 'Submit'))
      ),
    [definition.submitButtonLabel, language]
  );
  const submitConfirmConfirmLabelResolved = useMemo(
    () => resolveLocalizedString(definition.submissionConfirmationConfirmLabel, language, submitButtonLabelResolved),
    [definition.submissionConfirmationConfirmLabel, language, submitButtonLabelResolved]
  );
  const submitConfirmCancelLabelResolved = useMemo(
    () =>
      resolveLocalizedString(
        definition.submissionConfirmationCancelLabel,
        language,
        tSystem('submit.cancel', language, tSystem('common.cancel', language, 'Cancel'))
      ),
    [definition.submissionConfirmationCancelLabel, language]
  );
  const submitConfirmTitle = useMemo(
    () =>
      resolveLocalizedString(
        definition.submissionConfirmationTitle,
        language,
        tSystem('submit.confirmTitle', language, 'Confirm submission')
      ),
    [definition.submissionConfirmationTitle, language]
  );
  const submitConfirmMessage = useMemo(
    () => {
      const base = resolveLocalizedString(
        definition.submissionConfirmationMessage,
        language,
        tSystem('submit.confirmMessage', language, 'Are you ready to submit this record?')
      );
      if (!base) return base;
      // Fast path: no placeholders to expand.
      if (base.indexOf('{') < 0) return base;

      const vars: Record<string, string> = {};

      // Include meta fields (best-effort) in case you want to reference them in the dialog.
      if (selectedRecordId) vars.id = selectedRecordId;
      if (lastSubmissionMeta?.createdAt) vars.createdAt = lastSubmissionMeta.createdAt;
      if (lastSubmissionMeta?.updatedAt) vars.updatedAt = lastSubmissionMeta.updatedAt;
      if (lastSubmissionMeta?.status) vars.status = lastSubmissionMeta.status;

      (definition.questions || []).forEach(q => {
        if (!q || !q.id) return;
        const fieldId = q.id.toString();
        if (!fieldId) return;
        const raw = values[fieldId];
        if (raw === undefined || raw === null || raw === '') return;

        // Prefer dataSource-hydrated options (if loaded) for localized display.
        const dsKey = q.dataSource ? optionKey(fieldId) : '';
        const optionSet =
          (dsKey && optionState[dsKey]) ? (optionState[dsKey] as any) : ((q as any).options as any | undefined);

        const display = formatDisplayText(raw as any, { language, optionSet, fieldType: q.type });
        const resolved = display === EMPTY_DISPLAY ? '' : display;
        if (!resolved) return;
        vars[fieldId] = resolved;
        vars[fieldId.toUpperCase()] = resolved;
      });

      // Supports {FIELD_ID} and {{FIELD_ID}} (spaces tolerated).
      return base.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}|\{\s*([a-zA-Z0-9_.]+)\s*\}/g, (match, a, b) => {
        const key = ((a || b || '') as string).toString().trim();
        if (!key) return match;
        const value = vars[key] ?? vars[key.toUpperCase()];
        return value === undefined || value === null ? match : value;
      });
    },
    [
      definition.questions,
      definition.submissionConfirmationMessage,
      language,
      lastSubmissionMeta?.createdAt,
      lastSubmissionMeta?.status,
      lastSubmissionMeta?.updatedAt,
      optionState,
      selectedRecordId,
      values
    ]
  );

  useEffect(() => {
    autoSaveNoticeSeenRef.current = false;
    setAutoSaveNoticeOpen(false);
  }, [autoSaveNoticeStorageKey]);

  useEffect(() => {
    if (!autoSaveEnabled || view !== 'form') return;
    if (autoSaveNoticeSeenRef.current) return;
    let seen = false;
    try {
      seen = globalThis.localStorage?.getItem(autoSaveNoticeStorageKey) === '1';
    } catch (err: any) {
      logEvent('autosave.notice.readFailed', { message: err?.message || err || 'unknown' });
    }
    if (seen) {
      autoSaveNoticeSeenRef.current = true;
      return;
    }
    autoSaveNoticeSeenRef.current = true;
    setAutoSaveNoticeOpen(true);
    logEvent('autosave.notice.open', {
      formKey: formKey || null,
      mode: createFlowRef.current ? 'create' : 'edit'
    });
  }, [autoSaveEnabled, autoSaveNoticeStorageKey, formKey, logEvent, view]);

  const dismissAutoSaveNotice = useCallback(
    (reason: 'confirm' | 'cancel') => {
      setAutoSaveNoticeOpen(false);
      autoSaveNoticeSeenRef.current = true;
      try {
        globalThis.localStorage?.setItem(autoSaveNoticeStorageKey, '1');
      } catch (err: any) {
        logEvent('autosave.notice.persistFailed', { message: err?.message || err || 'unknown' });
      }
      logEvent('autosave.notice.dismiss', {
        formKey: formKey || null,
        mode: createFlowRef.current ? 'create' : 'edit',
        reason
      });
    },
    [autoSaveNoticeStorageKey, formKey, logEvent]
  );

  const requestSubmit = useCallback(() => {
    if (submitting) return;
    if (recordLoadingId) return;
    if (updateRecordBusyOpen) return;
    if (view !== 'form') return;
    submitConfirmedRef.current = false;
    logEvent('ui.submit.tap', { submitLabelOverridden: Boolean(definition.submitButtonLabel) });
    formSubmitActionRef.current?.();
  }, [definition.submitButtonLabel, logEvent, recordLoadingId, submitting, updateRecordBusyOpen, view]);

  const cancelSubmitConfirm = useCallback(() => {
    setSubmitConfirmOpen(false);
    submitConfirmedRef.current = false;
    summarySubmitIntentRef.current = false;
    logEvent('ui.submitConfirm.cancel');
  }, [logEvent]);

  const confirmSubmit = useCallback(() => {
    setSubmitConfirmOpen(false);
    submitConfirmedRef.current = true;
    logEvent('ui.submitConfirm.confirm');
    if (viewRef.current === 'summary') {
      void handleSubmit();
      return;
    }
    formSubmitActionRef.current?.();
  }, [handleSubmit, logEvent]);

  const autoSaveDebounceMs = (() => {
    const raw = definition.autoSave?.debounceMs;
    const n = raw === undefined || raw === null ? NaN : Number(raw);
    if (!Number.isFinite(n)) return 2000;
    return Math.max(300, Math.min(60000, Math.floor(n)));
  })();
  const autoSaveDefaultStatus = (() => {
    const fromTransitions = resolveStatusTransitionValue(statusTransitions, 'inProgress', language);
    if (fromTransitions !== undefined && fromTransitions !== null && fromTransitions.toString().trim()) {
      return fromTransitions.toString().trim();
    }
    const explicit = definition.autoSave?.status;
    if (explicit !== undefined && explicit !== null && explicit.toString().trim()) {
      return explicit.toString().trim();
    }
    return 'In progress';
  })();
  const resolveAutoSaveStatus = useCallback(
    (rawStatus: any): string => {
      const trimmed = rawStatus === undefined || rawStatus === null ? '' : rawStatus.toString().trim();
      return trimmed || autoSaveDefaultStatus;
    },
    [autoSaveDefaultStatus]
  );

  const isClosedRecord = (() => {
    const raw = (lastSubmissionMeta?.status || selectedRecordSnapshot?.status || '').toString();
    return matchesStatusTransition(raw, statusTransitions, 'onClose', { includeDefaultOnClose: true });
  })();

  const dedupSignature = useMemo(() => {
    const startMark = `ck.selector.dedupSignature.start.${Date.now()}`;
    const endMark = `ck.selector.dedupSignature.end.${Date.now()}`;
    perfMark(startMark);
    const signature = computeDedupSignatureFromValues((definition as any)?.dedupRules, values as any);
    perfMark(endMark);
    perfMeasure('ck.selector.dedupSignature', startMark, endMark, {
      valueCount: Object.keys(values || {}).length,
      signatureLength: (signature || '').toString().length
    });
    return signature;
  }, [definition, perfMark, perfMeasure, values]);

  const dedupKeyFieldIdMap = useMemo(
    () => computeDedupKeyFieldIdMap((definition as any)?.dedupRules),
    [definition]
  );

  useEffect(() => {
    dedupKeyFieldIdsRef.current = dedupKeyFieldIdMap;
  }, [dedupKeyFieldIdMap]);

  useEffect(() => {
    dedupSignatureRef.current = dedupSignature;
  }, [dedupSignature]);

  const dedupSignatureValue = (dedupSignature || '').toString();
  const dedupNavigationBlocked =
    view === 'form' &&
    (dedupChecking ||
      !!dedupConflict ||
      Boolean(dedupSignatureValue && lastDedupCheckedSignatureRef.current !== dedupSignatureValue));

  // Dedup precheck (server-side) so we can block duplicate creation early (before autosave/submit).
  useEffect(() => {
    // Only relevant while editing.
    if (view !== 'form') return;

    const signature = (dedupSignature || '').toString();
    const existingRecordId = resolveExistingRecordId({
      selectedRecordId,
      selectedRecordSnapshot,
      lastSubmissionMetaId: lastSubmissionMeta?.id || null
    });
    const candidateId = existingRecordId ? existingRecordId.toString() : '';
    // Only de-duplicate by signature; the candidate id can change after draft creation and should not force a re-check.
    const checkKey = signature;

    // Clear pending timer (signature might be changing).
    if (dedupCheckTimerRef.current) {
      globalThis.clearTimeout(dedupCheckTimerRef.current);
      dedupCheckTimerRef.current = null;
    }

    if (!signature) {
      lastDedupCheckedSignatureRef.current = '';
      dedupCheckSeqRef.current += 1;
      dedupCheckingRef.current = false;
      dedupConflictRef.current = null;
      setDedupChecking(false);
      setDedupConflict(null);
      return;
    }

    if (checkKey === lastDedupCheckedSignatureRef.current) return;
    lastDedupCheckedSignatureRef.current = checkKey;
    // Update refs synchronously so autosave gating cannot race on state updates.
    dedupCheckingRef.current = true;
    dedupConflictRef.current = null;
    setDedupChecking(true);
    setDedupConflict(null);
    const seq = ++dedupCheckSeqRef.current;
    logEvent('dedup.check.start', { recordId: candidateId || null, signatureLen: signature.length });

    // Debounce to avoid spamming Apps Script while the user is still selecting values.
    dedupCheckTimerRef.current = globalThis.setTimeout(() => {
      const payload = buildDraftPayload({
        definition,
        formKey,
        language: languageRef.current,
        values: valuesRef.current,
        lineItems: lineItemsRef.current,
        existingRecordId: candidateId || undefined
      }) as any;

      checkDedupConflictApi(payload)
        .then(res => {
          if (seq !== dedupCheckSeqRef.current) return;
          dedupCheckingRef.current = false;
          setDedupChecking(false);

          if (!res?.success) {
            const msg = (res?.message || 'Failed to check duplicates.').toString();
            logEvent('dedup.check.failed', { recordId: candidateId || null, message: msg });
            // Fail closed only for new record creation (so we don't create duplicates on autosave).
            if (!candidateId) {
              const conflictObj = { ruleId: 'dedupCheckFailed', message: msg };
              dedupConflictRef.current = conflictObj;
              setDedupConflict({ ruleId: 'dedupCheckFailed', message: msg });
            }
            return;
          }

          const conflict = (res as any)?.conflict || null;
          if (conflict && conflict.message) {
            const message = (conflict.message || '').toString();
            const conflictObj = {
              ruleId: (conflict.ruleId || 'dedup').toString(),
              message,
              existingRecordId: conflict.existingRecordId ? conflict.existingRecordId.toString() : undefined,
              existingRowNumber: Number.isFinite(Number(conflict.existingRowNumber)) ? Number(conflict.existingRowNumber) : undefined
            };
            dedupConflictRef.current = conflictObj;
            setDedupNotice(conflictObj);
            // Cancel any pending autosave for the now-invalid (duplicate) values.
            autoSaveDirtyRef.current = false;
            if (autoSaveTimerRef.current) {
              globalThis.clearTimeout(autoSaveTimerRef.current);
              autoSaveTimerRef.current = null;
            }
            // Hide stale "Draft saved" banner while dedup is blocking.
            setDraftSave({ phase: 'idle' });
            setDedupConflict(conflictObj);
            logEvent('dedup.conflict', {
              recordId: candidateId || null,
              ruleId: (conflict.ruleId || '').toString(),
              existingRecordId: conflict.existingRecordId ? conflict.existingRecordId.toString() : null
            });
            return;
          }

          dedupConflictRef.current = null;
          setDedupConflict(null);
          logEvent('dedup.ok', { recordId: candidateId || null });
        })
        .catch(err => {
          if (seq !== dedupCheckSeqRef.current) return;
          dedupCheckingRef.current = false;
          setDedupChecking(false);
          const uiMessage = resolveUiErrorMessage(err, 'Failed to check duplicates.');
          const logMessage = resolveLogMessage(err, 'Failed to check duplicates.');
          logEvent('dedup.check.exception', { recordId: candidateId || null, message: logMessage });
          if (!candidateId) {
            if (uiMessage) {
              const conflictObj = { ruleId: 'dedupCheckFailed', message: uiMessage };
              dedupConflictRef.current = conflictObj;
              setDedupConflict({ ruleId: 'dedupCheckFailed', message: uiMessage });
            }
          }
        });
    }, 350) as any;

    return () => {
      if (dedupCheckTimerRef.current) {
        globalThis.clearTimeout(dedupCheckTimerRef.current);
        dedupCheckTimerRef.current = null;
      }
    };
  }, [
    dedupSignature,
    definition,
    formKey,
    loadRecordSnapshot,
    logEvent,
    selectedRecordId,
    selectedRecordSnapshot,
    lastSubmissionMeta?.id,
    view
  ]);

  const performAutoSave: (reason: string) => Promise<void> = useCallback(
    async (reason: string): Promise<void> => {
      if (!autoSaveEnabled) return;
      if (submittingRef.current) return;
      // Avoid racing uploads: file upload flow already persists changes (and uses optimistic locking).
      // Running autosave concurrently can create spurious "stale" banners and duplicate saves.
      if (uploadQueueRef.current.size > 0) {
        autoSaveQueuedRef.current = true;
        autoSaveDirtyRef.current = true;
        logEvent('autosave.blocked.uploadInFlight', { reason, inFlight: uploadQueueRef.current.size });
        return;
      }

      const statusRaw =
        ((lastSubmissionMetaRef.current?.status || selectedRecordSnapshotRef.current?.status || '') as any)?.toString?.() ||
        '';
      if (matchesClosedStatus(statusRaw)) {
        setDraftSave(prev => (prev.phase === 'paused' ? prev : { phase: 'paused', message: tSystem('app.closedReadOnly', language, 'Closed (read-only)') }));
        return;
      }
      const statusForSave = resolveAutoSaveStatus(statusRaw);

      // If the record is stale (modified elsewhere), do not autosave; user must refresh first.
      if (recordStaleRef.current) {
        autoSaveDirtyRef.current = false;
        if (autoSaveTimerRef.current) {
          globalThis.clearTimeout(autoSaveTimerRef.current);
          autoSaveTimerRef.current = null;
        }
        setDraftSave({ phase: 'idle' });
        logEvent('autosave.blocked.recordStale', { reason, recordId: (recordStaleRef.current.recordId || '').toString() });
        return;
      }

      if (autoSaveHoldRef.current?.hold) {
        autoSaveQueuedRef.current = true;
        autoSaveDirtyRef.current = true;
        logEvent('autosave.blocked.hold', { reason, holdReason: autoSaveHoldRef.current.reason || null });
        return;
      }

      // In create-flow, do not autosave until the user actually changes a field value.
      if (createFlowRef.current && !createFlowUserEditedRef.current) return;

      // If a dedup-key change is being validated (or dedup precheck is running), hold autosave until resolved.
      if (dedupHoldRef.current || dedupCheckingRef.current) return;

      if (!autoSaveDirtyRef.current) return;

      const existingRecordId = resolveExistingRecordId({
        selectedRecordId: selectedRecordIdRef.current,
        selectedRecordSnapshot: selectedRecordSnapshotRef.current,
        lastSubmissionMetaId: lastSubmissionMetaRef.current?.id || null
      });

      const isCreateFlow = createFlowRef.current || !existingRecordId;
      const sessionAtStart = recordSessionRef.current;
      const valuesSnapshot = valuesRef.current;
      const lineItemsSnapshot = lineItemsRef.current;
      const languageSnapshot = languageRef.current;

      const createFlowDedupKeysIncomplete =
        isCreateFlow && hasIncompleteRejectDedupKeys((definition as any)?.dedupRules, valuesSnapshot as any);
      if (createFlowDedupKeysIncomplete) {
        autoSaveDirtyRef.current = true;
        logEvent('autosave.blocked.dedup.keysIncomplete', { reason, isCreateFlow: true });
        return;
      }

      // If this is a CREATE flow and dedup keys are populated, avoid saving drafts until the precheck completes.
      const currentDedupSignature = computeDedupSignatureFromValues((definition as any)?.dedupRules, valuesSnapshot as any);
      const currentDedupFingerprint = dedupDeleteOnKeyChangeEnabled
        ? computeDedupKeyFingerprint((definition as any)?.dedupRules, valuesSnapshot as any)
        : '';

      const requiresDedupPrecheck = currentDedupSignature && isCreateFlow;
      if (requiresDedupPrecheck) {
        if (dedupCheckingRef.current) {
          // Keep dirty so we retry once the check completes.
          autoSaveDirtyRef.current = true;
          // Re-attempt autosave shortly; avoids getting stuck in a "dirty" state once the check completes.
          try {
            if (autoSaveTimerRef.current) {
              globalThis.clearTimeout(autoSaveTimerRef.current);
              autoSaveTimerRef.current = null;
            }
            autoSaveTimerRef.current = globalThis.setTimeout(() => {
              void performAutoSave('dedupPrecheck.wait');
            }, 600) as any;
          } catch (_) {
            // ignore
          }
          logEvent('autosave.blocked.dedup.checking', { signatureLen: currentDedupSignature.length });
          return;
        }
        const conflict = dedupConflictRef.current;
        if (conflict && conflict.message) {
          const msg = conflict.message.toString();
          // Hide draft banner while blocked by dedup; the sticky dedup notice is the single source of truth.
          setDraftSave({ phase: 'idle' });
          // Do not keep retrying autosave until the user changes values.
          autoSaveDirtyRef.current = false;
          logEvent('autosave.blocked.dedup.conflict', { ruleId: conflict.ruleId, message: msg });
          return;
        }
      }
      if (autoSaveInFlightRef.current) {
        autoSaveQueuedRef.current = true;
        return;
      }

      autoSaveInFlightRef.current = true;
      autoSaveQueuedRef.current = false;
      // Clear the dirty flag for this attempt; it will be re-set by the change effect if edits continue.
      autoSaveDirtyRef.current = false;

      setDraftSave({ phase: 'saving' });
      logEvent('autosave.begin', { reason, debounceMs: autoSaveDebounceMs });

      try {
        const payload = buildDraftPayload({
          definition,
          formKey,
          language: languageSnapshot,
          values: valuesSnapshot,
          lineItems: lineItemsSnapshot,
          existingRecordId
        }) as any;
        payload.__ckSaveMode = 'draft';
        payload.__ckStatus = statusForSave;
        payload.__ckCreateFlow = createFlowRef.current ? '1' : '';
        const baseVersion = recordDataVersionRef.current;
        if (existingRecordId && Number.isFinite(Number(baseVersion)) && Number(baseVersion) > 0) {
          payload.__ckClientDataVersion = Number(baseVersion);
        }

        const res = await submit(payload);
        const ok = !!res?.success;
        const msg = (res?.message || '').toString();
        if (!ok) {
          const errText = msg || 'Autosave failed.';
          const sessionNow = recordSessionRef.current;
          if (sessionNow !== sessionAtStart) {
            logEvent('autosave.ignored.sessionChanged', {
              reason,
              recordId: (existingRecordId || '').toString() || null,
              sessionAtStart,
              sessionNow,
              message: errText
            });
            return;
          }
          const lower = errText.toLowerCase();
          const isStale = lower.includes('modified by another user') || lower.includes('please refresh');
          if (isStale) {
            const serverVersionRaw = Number((res as any)?.meta?.dataVersion);
            markRecordStale({
              reason: 'autosave.rejected.stale',
              recordId: (existingRecordId || '').toString(),
              cachedVersion: Number.isFinite(Number(baseVersion)) ? Number(baseVersion) : null,
              serverVersion: Number.isFinite(serverVersionRaw) ? serverVersionRaw : null,
              serverRow: null
            });
            return;
          }
          // If autosave failed while dedup keys are populated, perform a server-side dedup check
          // so we can show the dedup banner (instead of a generic autosave error).
          if (currentDedupSignature) {
            try {
              const chk = await checkDedupConflictApi(payload as any);
              const conflict = (chk as any)?.conflict || null;
              if ((chk as any)?.success && conflict && conflict.message) {
                const conflictObj = {
                  ruleId: (conflict.ruleId || 'dedup').toString(),
                  message: (conflict.message || '').toString() || tSystem('dedup.duplicate', languageRef.current, 'Duplicate record.'),
                  existingRecordId: conflict.existingRecordId ? conflict.existingRecordId.toString() : undefined,
                  existingRowNumber: Number.isFinite(Number(conflict.existingRowNumber)) ? Number(conflict.existingRowNumber) : undefined
                };
                dedupConflictRef.current = conflictObj;
                dedupHoldRef.current = true; // block any further autosave retries until user resolves the conflict
                setDedupNotice(conflictObj);
                setDedupConflict(conflictObj);
                // Hide draft error banner; the dedup notice is the single source of truth.
                setDraftSave({ phase: 'idle' });
                autoSaveDirtyRef.current = false;
                if (autoSaveTimerRef.current) {
                  globalThis.clearTimeout(autoSaveTimerRef.current);
                  autoSaveTimerRef.current = null;
                }
                logEvent('autosave.dedupDetected.afterFailure', {
                  reason,
                  recordId: existingRecordId || null,
                  ruleId: conflictObj.ruleId,
                  existingRecordId: conflictObj.existingRecordId || null,
                  isCreateFlow
                });
                return;
              }
            } catch (err: any) {
              logEvent('autosave.dedupCheckAfterFailure.exception', {
                reason,
                message: (err?.message || err?.toString?.() || 'failed').toString()
              });
            }
          }
          // If the server rejects because the record is closed, lock the UI.
          const currentStatus =
            (lastSubmissionMetaRef.current?.status || selectedRecordSnapshotRef.current?.status || '').toString();
          const closedMatch = matchesClosedStatus(currentStatus);
          const closedLabel = closedStatusLabel || 'Closed';
          const closedMessageMatch = closedLabel && errText.toLowerCase().includes(closedLabel.toLowerCase());
          if (closedMatch || closedMessageMatch) {
            setLastSubmissionMeta(prev => ({ ...(prev || {}), status: closedLabel }));
            setDraftSave({ phase: 'paused', message: tSystem('app.closedReadOnly', language, 'Closed (read-only)') });
            return;
          }
          autoSaveDirtyRef.current = true;
          setDraftSave({ phase: 'error', message: errText });
          logEvent('autosave.error', { reason, message: errText });
          return;
        }

        const newId = (res?.meta?.id || existingRecordId || '').toString();
        const updatedAt = (res?.meta?.updatedAt || '').toString();
        const dv = Number((res as any)?.meta?.dataVersion);
        const nextDataVersion = Number.isFinite(dv) && dv > 0 ? dv : undefined;
        const rn = Number((res as any)?.meta?.rowNumber);
        const nextRowNumber = Number.isFinite(rn) && rn >= 2 ? rn : undefined;
        // Keep list view up-to-date without triggering a refetch (even if the user navigated away mid-save).
        upsertListCacheRow({
          recordId: newId,
          // Only patch keys that already exist in list rows (upsertListCacheRow does this safely).
          // IMPORTANT: use the fully serialized draft payload values so list cache retains line item groups/subgroups.
          // (Top-level `values` state does NOT include line item JSON; it's derived from `lineItems`.)
          values: (payload as any).values as any,
          createdAt: (res?.meta?.createdAt || '').toString() || undefined,
          updatedAt: updatedAt || undefined,
          status: statusForSave,
          dataVersion: nextDataVersion,
          rowNumber: nextRowNumber
        });
        const sessionNow = recordSessionRef.current;
        if (sessionNow !== sessionAtStart) {
          logEvent('autosave.success.ignored.sessionChanged', { reason, recordId: newId || null, sessionAtStart, sessionNow });
          return;
        }
        if (newId) {
          setSelectedRecordId(newId);
          // Keep ref in sync immediately so other async flows (submit/upload) can safely resolve the current record id.
          selectedRecordIdRef.current = newId;
        }
        // Successful save => record is now at least as fresh as the server; clear stale banner + bump local version.
        recordStaleRef.current = null;
        setRecordStale(null);
        if (nextDataVersion) {
          recordDataVersionRef.current = nextDataVersion;
        }
        if (nextRowNumber) {
          recordRowNumberRef.current = nextRowNumber;
        }
        setLastSubmissionMeta(prev => ({
          ...(prev || {}),
          id: newId || prev?.id,
          createdAt: res?.meta?.createdAt || prev?.createdAt,
          updatedAt: updatedAt || prev?.updatedAt,
          dataVersion: Number.isFinite(Number((res as any)?.meta?.dataVersion)) ? Number((res as any).meta.dataVersion) : prev?.dataVersion,
          status: statusForSave
        }));
        dedupBaselineSignatureRef.current = (currentDedupSignature || '').toString();
        dedupKeyFingerprintBaselineRef.current = currentDedupFingerprint;
        setDraftSave({ phase: 'saved', updatedAt: updatedAt || undefined });
        logEvent('autosave.success', {
          reason,
          recordId: newId || null,
          updatedAt: updatedAt || null,
          dataVersion: nextDataVersion || null
        });
      } catch (err: any) {
        const sessionNow = recordSessionRef.current;
        if (sessionNow !== sessionAtStart) {
          logEvent('autosave.exception.ignored.sessionChanged', {
            reason,
            sessionAtStart,
            sessionNow,
            message: resolveLogMessage(err, 'failed')
          });
          return;
        }
        const uiMessage = resolveUiErrorMessage(err, 'Autosave failed.');
        const logMessage = resolveLogMessage(err, 'Autosave failed.');
        autoSaveDirtyRef.current = true;
        if (uiMessage) {
          setDraftSave({ phase: 'error', message: uiMessage });
        } else {
          setDraftSave({ phase: 'idle' });
        }
        logEvent('autosave.exception', { reason, message: logMessage });
      } finally {
        autoSaveInFlightRef.current = false;
        if (autoSaveQueuedRef.current && !submittingRef.current) {
          autoSaveQueuedRef.current = false;
          if (autoSaveTimerRef.current) {
            globalThis.clearTimeout(autoSaveTimerRef.current);
            autoSaveTimerRef.current = null;
          }
          autoSaveTimerRef.current = globalThis.setTimeout(() => {
            void performAutoSave('queued');
          }, autoSaveDebounceMs) as any;
        }
      }
    },
    [
      autoSaveDebounceMs,
      autoSaveEnabled,
      resolveAutoSaveStatus,
      closedStatusLabel,
      definition,
      dedupDeleteOnKeyChangeEnabled,
      formKey,
      language,
      loadRecordSnapshot,
      logEvent,
      matchesClosedStatus,
      upsertListCacheRow
    ]
  );

  const flushAutoSaveBeforeNavigate: (reason: string) => Promise<boolean> = useCallback(
    async (reason: string): Promise<boolean> => {
      try {
        if (!autoSaveEnabled) return false;
        if (viewRef.current !== 'form' && viewRef.current !== 'summary') return false;
        if (submittingRef.current) return false;
        if (isClosedRecord) return false;
        if (recordStaleRef.current) return false;
        if (dedupHoldRef.current || dedupCheckingRef.current) return false;
        if (!autoSaveDirtyRef.current) return false;

        // Cancel any pending debounce; we want to flush now.
        if (autoSaveTimerRef.current) {
          globalThis.clearTimeout(autoSaveTimerRef.current);
          autoSaveTimerRef.current = null;
        }
        logEvent('autosave.flush.request', { reason });

        const sleep = (ms: number) => new Promise<void>(r => globalThis.setTimeout(r, ms));

        // If an autosave is already running, wait briefly for it to finish so we don't lose queued changes.
        if (autoSaveInFlightRef.current) {
          autoSaveQueuedRef.current = true;
          const startedAt = Date.now();
          while (autoSaveInFlightRef.current) {
            if (Date.now() - startedAt > 10_000) break;
            await sleep(80);
          }
        }

        if (!autoSaveDirtyRef.current) return true;
        if (autoSaveInFlightRef.current) return true;
        await performAutoSave(reason);
        return true;
      } catch (err: any) {
        logEvent('autosave.flush.exception', { reason, message: err?.message || err?.toString?.() || 'failed' });
        return false;
      }
    },
    [autoSaveEnabled, isClosedRecord, logEvent, performAutoSave]
  );

  const requestNavigateToList = useCallback(
    async (trigger: string) => {
      if (viewRef.current === 'list') return;
      if (navigateHomeInFlightRef.current) return;
      const startedAt = Date.now();
      const startMark = `ck.nav.back.start.${startedAt}`;
      backToHomePerfRef.current = { trigger, startedAt, startMark };
      perfMark(startMark);
      const needsWait =
        uploadQueueRef.current.size > 0 || autoSaveInFlightRef.current || autoSaveDirtyRef.current;
      if (!needsWait) {
        setView('list');
        setStatus(null);
        setStatusLevel(null);
        return;
      }

      navigateHomeInFlightRef.current = true;
      const seq = navigateHomeBusy.lock({
        title: tSystem('draft.savingShort', languageRef.current, 'Saving…'),
        message: tSystem('navigation.waitSaving', languageRef.current, 'Please wait while we save your changes...'),
        kind: 'navigateHome',
        diagnosticMeta: { trigger }
      });
      logEvent('navigate.list.wait.start', {
        trigger,
        uploadsInFlight: uploadQueueRef.current.size,
        autoSaveInFlight: autoSaveInFlightRef.current,
        dirty: autoSaveDirtyRef.current
      });
      try {
        const sleep = (ms: number) => new Promise<void>(r => globalThis.setTimeout(r, ms));
        while (uploadQueueRef.current.size > 0 || autoSaveInFlightRef.current) {
          await sleep(80);
        }
        await flushAutoSaveBeforeNavigate(trigger);
        logEvent('navigate.list.wait.done', { trigger, durationMs: Date.now() - startedAt });
        setView('list');
        setStatus(null);
        setStatusLevel(null);
      } finally {
        navigateHomeBusy.unlock(seq, { durationMs: Date.now() - startedAt });
        navigateHomeInFlightRef.current = false;
      }
    },
    [flushAutoSaveBeforeNavigate, logEvent, navigateHomeBusy, perfMark]
  );

  const handleGoHome = useCallback(() => {
    const incompleteDedupKeys =
      viewRef.current === 'form' && hasIncompleteRejectDedupKeys((definition as any)?.dedupRules, valuesRef.current as any);
    const homeDedupDialog = resolveDedupIncompleteHomeDialogConfig(definition.actionBars);
    const homeDedupDialogEnabled = homeDedupDialog && homeDedupDialog.enabled !== false;
    if (incompleteDedupKeys && homeDedupDialogEnabled) {
      const copy = resolveDedupIncompleteHomeDialogCopy(homeDedupDialog, languageRef.current);
      customConfirm.openConfirm({
        title: copy.title,
        message: copy.message,
        confirmLabel: copy.confirmLabel,
        cancelLabel: copy.cancelLabel,
        primaryAction: copy.primaryAction,
        showCancel: copy.showCancel,
        showCloseButton: copy.showCloseButton,
        dismissOnBackdrop: copy.dismissOnBackdrop,
        kind: 'dedupIncompleteHome',
        onCancel: () => {
          logEvent('navigate.home.dedupIncomplete.cancel');
        },
        onConfirm: async () => {
          const existingRecordId =
            resolveExistingRecordId({
              selectedRecordId: selectedRecordIdRef.current,
              selectedRecordSnapshot: selectedRecordSnapshotRef.current,
              lastSubmissionMetaId: lastSubmissionMetaRef.current?.id || null
            }) || '';
          const shouldDeleteCurrentRecord = homeDedupDialog.deleteRecordOnConfirm !== false;
          if (shouldDeleteCurrentRecord && existingRecordId) {
            const deleted = await triggerDedupDeleteOnKeyChange('navigate.home.dedupIncomplete.confirm', {
              force: true,
              recordId: existingRecordId
            });
            if (!deleted) {
              setStatus(copy.deleteFailedMessage);
              setStatusLevel('error');
              logEvent('navigate.home.dedupIncomplete.delete.failed', { recordId: existingRecordId });
              return;
            }
          } else {
            dedupHoldRef.current = false;
            autoSaveDirtyRef.current = false;
            autoSaveQueuedRef.current = false;
            if (autoSaveTimerRef.current) {
              globalThis.clearTimeout(autoSaveTimerRef.current);
              autoSaveTimerRef.current = null;
            }
            setDraftSave({ phase: 'idle' });
          }
          logEvent('navigate.home.dedupIncomplete.confirm', {
            recordId: existingRecordId || null,
            deletedRecord: shouldDeleteCurrentRecord && !!existingRecordId
          });
          await requestNavigateToList('navigate.home.dedupIncomplete.confirm');
        }
      });
      logEvent('navigate.home.dedupIncomplete.dialog.open');
      return;
    }
    void requestNavigateToList('navigate.home');
  }, [customConfirm, definition, logEvent, requestNavigateToList, setDraftSave, triggerDedupDeleteOnKeyChange]);

  const handleGoSummary = useCallback(() => {
    if (!summaryViewEnabled) return;
    // Kick autosave in the background (do not block navigation).
    void flushAutoSaveBeforeNavigate('navigate.summary');
    try {
      globalThis.scrollTo?.({ top: 0, left: 0, behavior: 'auto' });
    } catch (_) {
      try {
        globalThis.scrollTo?.(0, 0);
      } catch (_) {
        // ignore
      }
    }
    setView('summary');
  }, [flushAutoSaveBeforeNavigate, summaryViewEnabled]);

  // When a UI flow temporarily holds autosave (e.g., leftovers overlay), persist any queued changes
  // immediately once the hold is released (user returns to the main steps UI).
  useEffect(() => {
    const prev = prevAutoSaveHoldRef.current;
    const next = !!autoSaveHold.hold;
    if (prev === next) return;
    prevAutoSaveHoldRef.current = next;
    if (!prev || next) return; // only act on true -> false

    if (!autoSaveEnabled) return;
    if (viewRef.current !== 'form') return;
    if (submittingRef.current) return;
    if (recordStaleRef.current) return;
    if (!autoSaveDirtyRef.current && !autoSaveQueuedRef.current) return;
    if (autoSaveTimerRef.current) {
      globalThis.clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    logEvent('autosave.hold.release.flush', {
      holdReason: autoSaveHold.reason || null,
      dirty: autoSaveDirtyRef.current,
      queued: autoSaveQueuedRef.current
    });
    void performAutoSave('autosaveHold.release');
  }, [autoSaveEnabled, autoSaveHold.hold, autoSaveHold.reason, logEvent, performAutoSave]);

  // Release autosave hold after dedup evaluation completes (or keys become incomplete),
  // and persist any pending changes once it's safe.
  useEffect(() => {
    if (!autoSaveEnabled) return;
    if (view !== 'form') {
      dedupHoldRef.current = false;
      return;
    }
    if (fieldChangeDialog.state.open || fieldChangeActiveRef.current) return;
    if (!dedupHoldRef.current) return;

    const signature = (dedupSignature || '').toString();
    // If keys are incomplete, there's no dedup evaluation to wait for.
    if (!signature) {
      dedupHoldRef.current = false;
    } else {
      // Do NOT release hold until we've at least started a dedup check for this signature.
      // This prevents a race where autosave resumes before the precheck effect schedules the server call.
      if (lastDedupCheckedSignatureRef.current !== signature) return;
      if (dedupCheckingRef.current) return;
      if (dedupConflictRef.current) return;
      // Keys are complete, check finished, and no conflict -> release hold.
      dedupHoldRef.current = false;
    }

    // In create-flow, autosave must still wait for the first real user edit.
    if (createFlowRef.current && !createFlowUserEditedRef.current) return;
    if (createFlowRef.current && hasIncompleteRejectDedupKeys((definition as any)?.dedupRules, valuesRef.current as any)) return;
    if (!autoSaveUserEditedRef.current) return;
    // If the record is stale, do not resume autosave; user must refresh first.
    if (recordStaleRef.current) return;
    if (!autoSaveDirtyRef.current) return;
    if (submittingRef.current) return;
    // Queue a debounced autosave now that we are unblocked.
    if (autoSaveTimerRef.current) {
      globalThis.clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    setDraftSave(prev => {
      if (prev.phase === 'saving') return prev;
      if (prev.phase === 'dirty') return prev;
      return { phase: 'dirty' };
    });
    autoSaveTimerRef.current = globalThis.setTimeout(() => {
      void performAutoSave('dedupHold.release');
    }, autoSaveDebounceMs) as any;
  }, [
    autoSaveDebounceMs,
    autoSaveEnabled,
    definition,
    dedupChecking,
    dedupConflict,
    dedupSignature,
    fieldChangeDialog.state.open,
    performAutoSave,
    view
  ]);

  // Debounced autosave trigger on edits.
  useEffect(() => {
    if (!autoSaveEnabled) return;
    // Only trigger autosave when the actual form data changes.
    const prevSeen = lastAutoSaveSeenRef.current;
    const changed = !prevSeen || prevSeen.values !== values || prevSeen.lineItems !== lineItems;
    lastAutoSaveSeenRef.current = { values, lineItems };
    if (!changed) return;

    if (view !== 'form') return;
    if (submitting) return;
    if (isClosedRecord) {
      setDraftSave(prev => (prev.phase === 'paused' ? prev : { phase: 'paused', message: tSystem('app.closedReadOnly', language, 'Closed (read-only)') }));
      return;
    }
    if (!autoSaveUserEditedRef.current) {
      const now = Date.now();
      const ageMs = now - (lastUserInteractionRef.current || 0);
      if (lastUserInteractionRef.current > 0 && ageMs <= 3000) {
        autoSaveUserEditedRef.current = true;
        if (createFlowRef.current && !createFlowUserEditedRef.current) {
          createFlowUserEditedRef.current = true;
          logEvent('autosave.armed.interactionFallback', { ageMs });
        }
      }
    }
    // In create-flow, do not autosave until the user actually changes a field value.
    if (createFlowRef.current && !createFlowUserEditedRef.current) return;
    if (createFlowRef.current && hasIncompleteRejectDedupKeys((definition as any)?.dedupRules, values as any)) {
      autoSaveDirtyRef.current = true;
      return;
    }
    if (!autoSaveUserEditedRef.current) return;
    // If the record is stale (modified elsewhere), do not schedule autosave.
    if (recordStaleRef.current) {
      autoSaveDirtyRef.current = false;
      if (autoSaveTimerRef.current) {
        globalThis.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      setDraftSave({ phase: 'idle' });
      logEvent('autosave.blocked.recordStale', { reason: 'debouncedTrigger' });
      return;
    }

    if (autoSaveHoldRef.current?.hold) {
      autoSaveQueuedRef.current = true;
      autoSaveDirtyRef.current = true;
      if (autoSaveTimerRef.current) {
        globalThis.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      logEvent('autosave.blocked.hold', { reason: 'debouncedTrigger', holdReason: autoSaveHoldRef.current.reason || null });
      return;
    }

    autoSaveDirtyRef.current = true;
    if (uploadQueueRef.current.size > 0) {
      // Don't schedule autosave while uploads are persisting (avoid stale self-races).
      autoSaveQueuedRef.current = true;
      if (autoSaveTimerRef.current) {
        globalThis.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      logEvent('autosave.blocked.uploadInFlight', { reason: 'debouncedTrigger', inFlight: uploadQueueRef.current.size });
      return;
    }
    if (dedupHoldRef.current || dedupCheckingRef.current) {
      dedupHoldRef.current = true;
      if (autoSaveTimerRef.current) {
        globalThis.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      return;
    }
    setDraftSave(prev => {
      if (prev.phase === 'saving') return prev;
      if (prev.phase === 'dirty') return prev;
      return { phase: 'dirty' };
    });

    if (autoSaveTimerRef.current) {
      globalThis.clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    autoSaveTimerRef.current = globalThis.setTimeout(() => {
      void performAutoSave('debounced');
    }, autoSaveDebounceMs) as any;
    return () => {
      if (autoSaveTimerRef.current) {
        globalThis.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
    };
  }, [autoSaveDebounceMs, autoSaveEnabled, definition, isClosedRecord, performAutoSave, submitting, view, values, lineItems]);

  const uploadFieldUrls = useCallback(
    async (args: {
      scope: 'top' | 'line';
      fieldPath: string;
      questionId?: string;
      groupId?: string;
      rowId?: string;
      fieldId?: string;
      items: Array<string | File>;
      uploadConfig?: any;
    }): Promise<{ success: boolean; message?: string }> => {
      if (viewRef.current !== 'form') return { success: false, message: 'Not in form view.' };
      if (submittingRef.current) return { success: false, message: 'Submitting.' };
      if (isClosedRecord) return { success: false, message: tSystem('app.closedReadOnly', language, 'Closed (read-only)') };
      if (recordStaleRef.current) {
        // Block uploads (they require draft saves) until the user refreshes the record.
        return {
          success: false,
          message:
            recordStaleRef.current.message ||
            tSystem(
              'record.stale',
              languageRef.current,
              'This record was updated by another user or automatically by the system, tap Refresh to continue.'
            )
        };
      }

      const sessionAtStart = recordSessionRef.current;
      const queueKey = `record:${sessionAtStart}`;
      const run = async (): Promise<{ success: boolean; message?: string }> => {
        // Ensure we don't have a pending debounced draft save that might race with this sequence.
        if (autoSaveTimerRef.current) {
          globalThis.clearTimeout(autoSaveTimerRef.current);
          autoSaveTimerRef.current = null;
        }

        const ensureSession = (phase: string): boolean => {
          const sessionNow = recordSessionRef.current;
          if (sessionNow === sessionAtStart) return true;
          logEvent('upload.detached.sessionChanged', {
            fieldPath: args.fieldPath,
            phase,
            sessionAtStart,
            sessionNow
          });
          return false;
        };
        const allowUiUpdates = ensureSession('start');

        const isFile = (v: any): v is File => {
          try {
            return typeof File !== 'undefined' && v instanceof File;
          } catch (_) {
            return false;
          }
        };

        const splitUrlList = (raw: string): string[] => {
          const trimmed = (raw || '').toString().trim();
          if (!trimmed) return [];
          const commaParts = trimmed
            .split(',')
            .map(p => p.trim())
            .filter(Boolean);
          if (commaParts.length > 1) return commaParts;
          const matches = trimmed.match(/https?:\/\/[^\s,]+/gi);
          if (matches && matches.length > 1) return matches.map(m => m.trim()).filter(Boolean);
          return [trimmed];
        };

        // Step 1: ensure we have a record id saved to the destination tab before uploading (prevents orphan uploads).
        let recordId =
          resolveExistingRecordId({
            selectedRecordId: selectedRecordIdRef.current,
            selectedRecordSnapshot: selectedRecordSnapshotRef.current,
            lastSubmissionMetaId: lastSubmissionMetaRef.current?.id || null
          }) || '';

        if (!recordId) {
          const signature = (dedupSignatureRef.current || '').toString();
          if (signature) {
            if (dedupCheckingRef.current) {
              const msg = 'Checking duplicates…';
              logEvent('upload.ensureRecord.blocked.dedup.checking', { fieldPath: args.fieldPath });
              return { success: false, message: msg };
            }
            const conflict = dedupConflictRef.current;
            if (conflict && conflict.message) {
              const msg = conflict.message.toString();
              logEvent('upload.ensureRecord.blocked.dedup.conflict', { fieldPath: args.fieldPath, ruleId: conflict.ruleId });
              return { success: false, message: msg };
            }
          }
          try {
            setDraftSave({ phase: 'saving' });
            const statusRaw =
              ((lastSubmissionMetaRef.current?.status || selectedRecordSnapshotRef.current?.status || '') as any)?.toString?.() ||
              '';
            const draftStatus = resolveAutoSaveStatus(statusRaw);
            const draft = buildDraftPayload({
              definition,
              formKey,
              language: languageRef.current,
              values: valuesRef.current,
              lineItems: lineItemsRef.current
            }) as any;
            draft.__ckSaveMode = 'draft';
            draft.__ckStatus = draftStatus;
            draft.__ckCreateFlow = createFlowRef.current ? '1' : '';
            const res = await submit(draft);
            if (!res?.success) {
              const msg = (res?.message || 'Failed to create draft record.').toString();
              setDraftSave({ phase: 'error', message: msg });
              return { success: false, message: msg };
            }
            recordId = (res?.meta?.id || '').toString();
            if (!recordId) {
              const msg = 'Failed to create draft record id.';
              setDraftSave({ phase: 'error', message: msg });
              return { success: false, message: msg };
            }
            setSelectedRecordId(recordId);
            // Keep ref in sync immediately so subsequent async flows (submit/upload queues) can resolve the current record id safely.
            selectedRecordIdRef.current = recordId;
            setLastSubmissionMeta(prev => ({
              ...(prev || {}),
              id: recordId,
              createdAt: res?.meta?.createdAt || prev?.createdAt,
              updatedAt: res?.meta?.updatedAt || prev?.updatedAt,
              dataVersion: Number.isFinite(Number((res as any)?.meta?.dataVersion))
                ? Number((res as any).meta.dataVersion)
                : prev?.dataVersion,
              status: draftStatus
            }));
            recordStaleRef.current = null;
            setRecordStale(null);
            const dv = Number((res as any)?.meta?.dataVersion);
            if (Number.isFinite(dv) && dv > 0) {
              recordDataVersionRef.current = dv;
            }
            const rn = Number((res as any)?.meta?.rowNumber);
            if (Number.isFinite(rn) && rn >= 2) {
              recordRowNumberRef.current = rn;
            }
            setDraftSave({ phase: 'saved', updatedAt: (res?.meta?.updatedAt || '').toString() || undefined });
            // Keep list view up-to-date without triggering a refetch.
            upsertListCacheRow({
              recordId,
              // IMPORTANT: use the fully serialized draft payload values so list cache retains line item groups/subgroups
              // and does not keep File objects in memory (draft payload is URL-only for uploads).
              values: (draft as any).values as any,
              createdAt: (res?.meta?.createdAt || '').toString() || undefined,
              updatedAt: (res?.meta?.updatedAt || '').toString() || undefined,
              status: draftStatus,
              dataVersion: Number.isFinite(Number((res as any)?.meta?.dataVersion))
                ? Number((res as any).meta.dataVersion)
                : undefined,
              rowNumber: Number.isFinite(Number((res as any)?.meta?.rowNumber))
                ? Number((res as any).meta.rowNumber)
                : undefined
            });
            logEvent('upload.ensureRecord.saved', { recordId, fieldPath: args.fieldPath });
          } catch (err: any) {
            const uiMessage = resolveUiErrorMessage(err, 'Failed to create draft record.');
            const logMessage = resolveLogMessage(err, 'Failed to create draft record.');
            if (uiMessage) {
              setDraftSave({ phase: 'error', message: uiMessage });
            } else {
              setDraftSave({ phase: 'idle' });
            }
            logEvent('upload.ensureRecord.error', { fieldPath: args.fieldPath, message: logMessage });
            return { success: false, message: uiMessage || '' };
          }
        }

          ensureSession('afterEnsureRecord');

        // Step 2: upload file payloads to Drive and get final URL list.
        const readStateItems = (): Array<string | File> => {
          try {
            if (args.scope === 'top' && args.questionId) {
              const raw = (valuesRef.current as any)?.[args.questionId];
              if (Array.isArray(raw)) return raw.filter((it: any) => typeof it === 'string' || isFile(it));
              if (typeof raw === 'string' || isFile(raw)) return [raw];
              return [];
            }
            if (args.scope === 'line' && args.groupId && args.rowId && args.fieldId) {
              const rows = (lineItemsRef.current as any)?.[args.groupId] || [];
              const row = Array.isArray(rows) ? rows.find((r: any) => (r?.id || '').toString() === args.rowId) : null;
              const raw = row?.values ? (row.values as any)[args.fieldId] : undefined;
              if (Array.isArray(raw)) return raw.filter((it: any) => typeof it === 'string' || isFile(it));
              if (typeof raw === 'string' || isFile(raw)) return [raw];
              return [];
            }
          } catch (_) {
            // ignore
          }
          return [];
        };

        const normalizeExistingUrls = (items: Array<string | File>): string[] => {
          const urls: string[] = [];
          (items || []).forEach(it => {
            if (typeof it !== 'string') return;
            splitUrlList(it).forEach(u => urls.push(u));
          });
          const seen = new Set<string>();
          return urls
            .map(u => (u || '').toString().trim())
            .filter(u => {
              if (!u) return false;
              if (seen.has(u)) return false;
              seen.add(u);
              return true;
            });
        };

        const stateItems = readStateItems();
        const fileItemsFromState = stateItems.filter(isFile);
        const fileItemsFromArgs = (args.items || []).filter(isFile);
        const fileItems = fileItemsFromState.length ? fileItemsFromState : fileItemsFromArgs;
        const existingUrls = normalizeExistingUrls(stateItems.length ? stateItems : (args.items || []));
        if (!fileItems.length) {
          // Nothing new to upload (e.g., only URLs).
          return { success: true };
        }

        try {
          const payloads = await buildFilePayload(fileItems, undefined, args.uploadConfig);
          const uploadRes = await uploadFilesApi([...existingUrls, ...payloads], args.uploadConfig);
          if (!uploadRes?.success) {
            const msg = (uploadRes?.message || tSystem('files.error.uploadFailed', languageRef.current, 'Could not add photos.')).toString();
            logEvent('upload.files.error', { fieldPath: args.fieldPath, message: msg });
            return { success: false, message: msg };
          }
          const urls = splitUrlList(uploadRes?.urls || '');
          if (!urls.length) {
            const msg = 'Upload returned no URLs.';
            logEvent('upload.files.empty', { fieldPath: args.fieldPath });
            return { success: false, message: msg };
          }

          const allowUiAfterUpload = ensureSession('afterUpload') && allowUiUpdates;

          const uploadedUrls = urls.slice(existingUrls.length);
          if (uploadedUrls.length < fileItems.length) {
            logEvent('upload.files.partial', {
              fieldPath: args.fieldPath,
              expected: fileItems.length,
              received: uploadedUrls.length,
              existingUrls: existingUrls.length
            });
          }
          const fileSig = (f: File): string => `${f.name}|${f.size}|${f.lastModified}`;
          const urlBySig = new Map<string, string>();
          fileItems.forEach((f, idx) => {
            const u = uploadedUrls[idx];
            if (u) urlBySig.set(fileSig(f), u);
          });

          const completionItems = readStateItems();
          const mergeBase: Array<string | File> = completionItems.length ? completionItems : args.items;
          const mergedItems: Array<string | File> = (mergeBase || []).map(it => {
            if (!isFile(it)) return it;
            const sig = fileSig(it);
            return urlBySig.get(sig) || it;
          });

          // Step 3: update local state with URL(s) (replace uploaded File objects), then save draft again to persist URL(s) to the sheet.
          const nextValues =
            args.scope === 'top' && args.questionId
              ? { ...valuesRef.current, [args.questionId]: mergedItems }
              : valuesRef.current;

          const nextLineItems =
            args.scope === 'line' && args.groupId && args.rowId && args.fieldId
              ? (() => {
                  const current = lineItemsRef.current;
                  const rows = current[args.groupId!] || [];
                  const nextRows = rows.map(r => {
                    if (r.id !== args.rowId) return r;
                    return { ...r, values: { ...(r.values || {}), [args.fieldId!]: mergedItems } };
                  });
                  return { ...current, [args.groupId!]: nextRows };
                })()
              : lineItemsRef.current;

          if (allowUiAfterUpload) {
            if (args.scope === 'top' && args.questionId) {
              setValues(nextValues);
            }
            if (args.scope === 'line' && args.groupId) {
              setLineItems(nextLineItems);
            }
          } else {
            // Keep refs in sync for background save even if UI is detached.
            valuesRef.current = nextValues;
            lineItemsRef.current = nextLineItems;
          }

          ensureSession('beforeSaveUrls');

          // Avoid optimistic-lock races with an autosave that started right before this upload.
          // (Autosave is blocked while uploads are in-flight, but an autosave already in-flight can still finish and bump the server version.)
          try {
            if (autoSaveInFlightRef.current) {
              const startedAt = Date.now();
              logEvent('upload.saveUrls.waitAutosave', {
                fieldPath: args.fieldPath,
                recordId,
                cachedVersion: Number.isFinite(Number(recordDataVersionRef.current)) ? Number(recordDataVersionRef.current) : null
              });
              const sleep = (ms: number) => new Promise<void>(r => globalThis.setTimeout(r, ms));
              while (autoSaveInFlightRef.current) {
                if (Date.now() - startedAt > 10_000) break;
                await sleep(80);
              }
              logEvent('upload.saveUrls.waitAutosave.done', {
                fieldPath: args.fieldPath,
                recordId,
                durationMs: Date.now() - startedAt,
                stillInFlight: autoSaveInFlightRef.current
              });
              ensureSession('afterWaitAutosave');
            }
          } catch (_) {
            // ignore
          }

          const statusRaw2 =
            ((lastSubmissionMetaRef.current?.status || selectedRecordSnapshotRef.current?.status || '') as any)?.toString?.() ||
            '';
          const draftStatus2 = resolveAutoSaveStatus(statusRaw2);
          const draft2 = buildDraftPayload({
            definition,
            formKey,
            language: languageRef.current,
            values: nextValues,
            lineItems: nextLineItems,
            existingRecordId: recordId
          }) as any;
          draft2.__ckSaveMode = 'draft';
          draft2.__ckStatus = draftStatus2;
          draft2.__ckCreateFlow = createFlowRef.current ? '1' : '';
          const baseVersion = recordDataVersionRef.current;
          if (recordId && Number.isFinite(Number(baseVersion)) && Number(baseVersion) > 0) {
            draft2.__ckClientDataVersion = Number(baseVersion);
          }

          const res2 = await submit(draft2);
          if (!res2?.success) {
            const msg = (res2?.message || 'Failed to save uploaded file URLs.').toString();
            const lower = msg.toLowerCase();
            const isStale = lower.includes('modified by another user') || lower.includes('please refresh');
            if (isStale) {
              const serverVersionRaw = Number((res2 as any)?.meta?.dataVersion);
              markRecordStale({
                reason: 'upload.saveUrls.rejected.stale',
                recordId,
                cachedVersion: Number.isFinite(Number(baseVersion)) ? Number(baseVersion) : null,
                serverVersion: Number.isFinite(serverVersionRaw) ? serverVersionRaw : null,
                serverRow: null
              });
              return { success: false, message: msg };
            }
            logEvent('upload.saveUrls.error', { fieldPath: args.fieldPath, recordId, message: msg });
            setDraftSave({ phase: 'error', message: msg });
            return { success: false, message: msg };
          }

          const allowUiAfterSave = ensureSession('afterSaveUrls') && allowUiUpdates;

          recordStaleRef.current = null;
          setRecordStale(null);
          const dv2 = Number((res2 as any)?.meta?.dataVersion);
          if (Number.isFinite(dv2) && dv2 > 0) {
            recordDataVersionRef.current = dv2;
          }
          const rn2 = Number((res2 as any)?.meta?.rowNumber);
          if (Number.isFinite(rn2) && rn2 >= 2) {
            recordRowNumberRef.current = rn2;
          }
          if (allowUiAfterSave) {
            setLastSubmissionMeta(prev => ({
              ...(prev || {}),
              id: recordId,
              updatedAt: (res2?.meta?.updatedAt || prev?.updatedAt) as any,
              dataVersion: Number.isFinite(Number((res2 as any)?.meta?.dataVersion)) ? Number((res2 as any).meta.dataVersion) : prev?.dataVersion,
              status: draftStatus2
            }));
            setDraftSave({ phase: 'saved', updatedAt: (res2?.meta?.updatedAt || '').toString() || undefined });
          }
          // Keep list view up-to-date without triggering a refetch.
          upsertListCacheRow({
            recordId,
            // IMPORTANT: use the fully serialized draft payload values so list cache retains line item groups/subgroups.
            values: (draft2 as any).values as any,
            updatedAt: (res2?.meta?.updatedAt || '').toString() || undefined,
            status: draftStatus2,
            dataVersion: Number.isFinite(Number((res2 as any)?.meta?.dataVersion)) ? Number((res2 as any).meta.dataVersion) : undefined,
            rowNumber: Number.isFinite(Number((res2 as any)?.meta?.rowNumber)) ? Number((res2 as any).meta.rowNumber) : undefined
          });
          logEvent('upload.saveUrls.success', { fieldPath: args.fieldPath, recordId, urls: mergedItems.length });
          return { success: true };
        } catch (err: any) {
          const uiMessage = resolveUiErrorMessage(
            err,
            tSystem('files.error.uploadFailed', languageRef.current, 'Could not add photos.')
          );
          const logMessage = resolveLogMessage(
            err,
            tSystem('files.error.uploadFailed', languageRef.current, 'Could not add photos.')
          );
          logEvent('upload.files.exception', { fieldPath: args.fieldPath, message: logMessage });
          return { success: false, message: uiMessage || '' };
        }
      };

      const prev = uploadQueueRef.current.get(queueKey) || Promise.resolve({ success: true } as any);
      const next = prev
        .catch(() => ({ success: false } as any))
        .then(() => run());
      uploadQueueRef.current.set(queueKey, next);
      syncUploadQueueSize();
      void next.finally(() => {
        try {
          if (uploadQueueRef.current.get(queueKey) === next) uploadQueueRef.current.delete(queueKey);
          syncUploadQueueSize();
          // If uploads drained and autosave was queued during the upload, schedule a background autosave now.
          if (uploadQueueRef.current.size === 0 && autoSaveQueuedRef.current && autoSaveDirtyRef.current && !submittingRef.current) {
            autoSaveQueuedRef.current = false;
            if (autoSaveTimerRef.current) {
              globalThis.clearTimeout(autoSaveTimerRef.current);
              autoSaveTimerRef.current = null;
            }
            autoSaveTimerRef.current = globalThis.setTimeout(() => {
              void performAutoSave('upload.queue.drained');
            }, autoSaveDebounceMs) as any;
            logEvent('autosave.queued.uploadDrained', { debounceMs: autoSaveDebounceMs });
          }
        } catch (_) {
          // ignore
        }
      });
      return next;
    },
    [autoSaveDebounceMs, definition, formKey, isClosedRecord, logEvent, performAutoSave, resolveAutoSaveStatus, syncUploadQueueSize, upsertListCacheRow]
  );

  useEffect(() => {
    // Avoid autosaving due to initial bootstrap hydration.
    autoSaveDirtyRef.current = false;
    fieldChangeDateInitialEntryInProgressRef.current = {};
    fieldChangeDateInitialEntryCompletedRef.current = {};
    if (autoSaveTimerRef.current) {
      globalThis.clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    setDraftSave({ phase: 'idle' });
    if (record?.values) {
      const normalizedValues = normalizeRecordValues(definition, record.values);
      const initialLineItems = buildInitialLineItems(definition, normalizedValues);
      const { values: mappedValues, lineItems: mappedLineItems } = applyValueMapsToForm(
        definition,
        normalizedValues,
        initialLineItems
      );
      lastAutoSaveSeenRef.current = { values: mappedValues, lineItems: mappedLineItems };
      dedupBaselineSignatureRef.current = computeDedupSignatureFromValues((definition as any)?.dedupRules, mappedValues as any);
      dedupKeyFingerprintBaselineRef.current = computeDedupKeyFingerprint((definition as any)?.dedupRules, mappedValues as any);
      setValues(mappedValues);
      setLineItems(mappedLineItems);
    } else {
      dedupBaselineSignatureRef.current = '';
      dedupKeyFingerprintBaselineRef.current = '';
      dedupDeleteOnKeyChangeInFlightRef.current = false;
    }
    if (record?.id) {
      setSelectedRecordId(record.id);
    }
    if (record) {
      setLastSubmissionMeta({
        id: record.id,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        dataVersion: (record as any).dataVersion,
        status: record.status || null
      });
      setSelectedRecordSnapshot(record);
    }
  }, [record, definition]);

  useEffect(() => {
    if (view !== 'summary') return;
    preloadSummaryTooltips();
  }, [view, preloadSummaryTooltips]);

  useEffect(() => {
    if (!selectedRecordId || selectedRecordSnapshot) return;
    const cached = listCache.records[selectedRecordId];
    if (cached) {
      setSelectedRecordSnapshot(cached);
    }
  }, [selectedRecordId, selectedRecordSnapshot, listCache.records]);

  const ensureOptions = (q: WebQuestionDefinition) => {
    if (!q.dataSource) return;
    const key = optionKey(q.id);
    if (optionState[key]) return;
    loadOptionsFromDataSource(q.dataSource, language).then(res => {
      if (res) {
        setOptionState(prev => ({ ...prev, [key]: res }));
        if (res.tooltips) {
          setTooltipState(prev => ({ ...prev, [key]: res.tooltips || {} }));
        }
        logEvent('options.loaded', { questionId: q.id, source: 'question', count: res.en?.length || 0 });
      }
    });
  };

  function runSelectionEffects(
    question: WebQuestionDefinition,
    value: FieldValue,
    opts?: {
      lineItem?: { groupId: string; rowId: string; rowValues: any };
      contextId?: string;
      forceContextReset?: boolean;
    },
    effectOverrides?: Record<string, Record<string, FieldValue>>,
    ignorePending?: boolean
  ) {
    const fieldPath = opts?.lineItem
      ? `${opts.lineItem.groupId}__${question.id}__${opts.lineItem.rowId}`
      : question.id;
    const pending = fieldChangePendingRef.current[fieldPath];
    if (pending && !ignorePending) {
      logEvent('fieldChangeDialog.selectionEffect.deferred', {
        fieldPath,
        fieldId: question.id,
        groupId: opts?.lineItem?.groupId || null,
        rowId: opts?.lineItem?.rowId || null
      });
      return;
    }
    runSelectionEffectsHelper({
      definition,
      question,
      value,
      language,
      values: valuesRef.current,
      lineItems: lineItemsRef.current,
      setValues,
      setLineItems,
      logEvent,
      opts,
      effectOverrides,
      onRowAppended: ({ anchor, targetKey, rowId, source }) => {
        setExternalScrollAnchor(anchor);
        logEvent('ui.selectionEffect.rowAppended', { anchor, targetKey, rowId, source: source || null });
      }
    });
  }

  async function handleSubmit(submitUi?: { collapsedRows: Record<string, boolean>; collapsedSubgroups: Record<string, boolean> }) {
    if (submitPipelineInFlightRef.current) {
      logEvent('submit.blocked.inFlightGuard');
      return;
    }
    let submitPipelineStartMark: string | null = null;
    const submitRequestedFromSummary = summarySubmitIntentRef.current === true;
    if (isClosedRecord) {
      setStatus(tSystem('app.closedReadOnly', language, 'Closed (read-only)'));
      setStatusLevel('info');
      logEvent('submit.blocked.closed');
      return;
    }
    // If we already know the record is stale, block immediately (no validations).
    if (recordStaleRef.current) {
      logEvent('submit.blocked.recordStale', { recordId: recordStaleRef.current.recordId });
      return;
    }
    clearStatus();
    setValidationAttempted(true);
    setValidationNoticeHidden(false);
    logEvent('submit.validate.begin', { language, lineItemGroups: Object.keys(lineItems).length });

    // Kick off a server version precheck in parallel (best-effort), even if local validations fail.
    // This avoids wasting time fixing validation errors on a record that must be refreshed anyway.
    if (!submitConfirmedRef.current) {
      const precheckRecordId =
        resolveExistingRecordId({
          selectedRecordId,
          selectedRecordSnapshot,
          lastSubmissionMetaId: lastSubmissionMeta?.id || null
        }) || '';
      const baseVersion = recordDataVersionRef.current;
      const rowNumberHint = recordRowNumberRef.current;
      const canCheck = precheckRecordId && Number.isFinite(Number(baseVersion)) && Number(baseVersion) > 0;
      if (canCheck && !submitPrecheckInFlightRef.current) {
        if (autoSaveInFlightRef.current || uploadQueueRef.current.size > 0) {
          logEvent('submit.versionPrecheck.skipped', {
            recordId: precheckRecordId,
            reason: autoSaveInFlightRef.current ? 'autosaveInFlight' : 'uploadInFlight'
          });
        } else {
          submitPrecheckInFlightRef.current = true;
          const startedAt = Date.now();
          logEvent('submit.versionPrecheck.start', {
            recordId: precheckRecordId,
            cachedVersion: Number(baseVersion),
            rowNumberHint: rowNumberHint || null
          });
          void getRecordVersionApi(formKey, precheckRecordId, rowNumberHint)
            .then(v => {
              try {
                if (autoSaveInFlightRef.current || uploadQueueRef.current.size > 0) {
                  logEvent('submit.versionPrecheck.ignored', {
                    recordId: precheckRecordId,
                    reason: autoSaveInFlightRef.current ? 'autosaveInFlight.afterFetch' : 'uploadInFlight.afterFetch'
                  });
                  return;
                }
                if (!v?.success) {
                  logEvent('submit.versionPrecheck.error', { recordId: precheckRecordId, message: v?.message || 'failed' });
                  return;
                }
                const serverVersion = Number(v.dataVersion);
                const serverRow = Number.isFinite(Number(v.rowNumber)) ? Number(v.rowNumber) : null;
                if (serverRow && serverRow >= 2) recordRowNumberRef.current = serverRow;
                const localVersionNow = Number(recordDataVersionRef.current);
                const baselineVersion =
                  Number.isFinite(localVersionNow) && localVersionNow > 0 ? localVersionNow : Number(baseVersion);
                if (Number.isFinite(serverVersion) && serverVersion > 0 && serverVersion !== baselineVersion) {
                  markRecordStale({
                    reason: 'submit.precheck.stale',
                    recordId: precheckRecordId,
                    cachedVersion: baselineVersion,
                    serverVersion,
                    serverRow
                  });
                  return;
                }
                logEvent('submit.versionPrecheck.ok', {
                  recordId: precheckRecordId,
                  serverVersion: Number.isFinite(serverVersion) ? serverVersion : null
                });
              } catch (err: any) {
                logEvent('submit.versionPrecheck.handlerException', { recordId: precheckRecordId, message: err?.message || err });
              }
            })
            .catch(err => {
              const msg = (err as any)?.message?.toString?.() || (err as any)?.toString?.() || 'failed';
              logEvent('submit.versionPrecheck.exception', { recordId: precheckRecordId, message: msg });
            })
            .finally(() => {
              submitPrecheckInFlightRef.current = false;
              logEvent('submit.versionPrecheck.end', { recordId: precheckRecordId, durationMs: Date.now() - startedAt });
            });
        }
      }
    }

    try {
      setValidationWarnings(
        collectValidationWarnings({
          definition,
          language,
          values,
          lineItems,
          phase: 'submit',
          uiView: 'edit'
        })
      );
    } catch (err: any) {
      // Never block submission because of warning computation bugs.
      setValidationWarnings({ top: [], byField: {} });
      logEvent('submit.warnings.failed', { message: err?.message || err || 'unknown' });
    }
    const nextErrors = validateForm({
      definition,
      language,
      values,
      lineItems,
      collapsedRows: submitUi?.collapsedRows,
      collapsedSubgroups: submitUi?.collapsedSubgroups
    });
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      submitConfirmedRef.current = false;
      logEvent('submit.validate.failed');
      if (submitRequestedFromSummary && viewRef.current === 'summary') {
        summarySubmitIntentRef.current = false;
        setView('form');
        logEvent('summary.submit.validationFailedNavigateForm', {
          errorCount: Object.keys(nextErrors).length
        });
      }
      return;
    }

    // Dedup precheck: block submit early once all dedup keys are populated.
    if (dedupSignature) {
      if (dedupChecking) {
        submitConfirmedRef.current = false;
        logEvent('submit.blocked.dedup.checking');
        return;
      }
      const conflict = dedupConflict;
      if (conflict && conflict.message) {
        const msg = conflict.message.toString();
        setStatus(msg);
        setStatusLevel('error');
        submitConfirmedRef.current = false;
        logEvent('submit.blocked.dedup.conflict', {
          ruleId: conflict.ruleId,
          existingRecordId: conflict.existingRecordId || null
        });
        return;
      }
    }

    // Only show the submit confirmation overlay once the form is already valid.
    if (!submitConfirmedRef.current) {
      setSubmitConfirmOpen(true);
      logEvent('ui.submitConfirm.openAfterValidation', {
        configuredMessage: Boolean(definition.submissionConfirmationMessage),
        submitLabelOverridden: Boolean(definition.submitButtonLabel),
        confirmLabelOverridden: Boolean(definition.submissionConfirmationConfirmLabel),
        cancelLabelOverridden: Boolean(definition.submissionConfirmationCancelLabel)
      });
      return;
    }
    submitConfirmedRef.current = false;
    summarySubmitIntentRef.current = false;
    if (submitPipelineInFlightRef.current) {
      logEvent('submit.blocked.inFlightGuard');
      return;
    }
    submitPipelineInFlightRef.current = true;
    submitPipelineStartMark = `ck.submit.pipeline.start.${Date.now()}`;
    perfMark(submitPipelineStartMark);

    setSubmitting(true);
    // Keep ref in sync immediately so background work (autosave/uploads) can't start in the same tick.
    submittingRef.current = true;
    setStatus(tSystem('actions.submitting', language, 'Submitting…'));
    setStatusLevel('info');
    logEvent('submit.begin', { language, lineItemGroups: Object.keys(lineItems).length });
    // Ensure submission messages are immediately visible, even if the user is scrolled deep in the form.
    try {
      if (typeof globalThis.scrollTo === 'function') {
        globalThis.scrollTo(0, 0);
        logEvent('submit.scrollTopOnStart');
      }
    } catch (_) {
      // ignore
    }
    try {
      const waitForBackgroundSaves = async (reason: string): Promise<{ ok: boolean; message?: string }> => {
        const sessionAtStart = recordSessionRef.current;
        const startedAt = Date.now();
        const startAutosave = !!autoSaveInFlightRef.current;
        const startUploads = uploadQueueRef.current.size;
        if (startAutosave || startUploads > 0) {
          logEvent('submit.queue.wait.start', {
            reason,
            autosaveInFlight: startAutosave,
            uploadsInFlight: startUploads
          });
        }

        // 1) Wait for in-flight uploads (they also persist URL updates via draft saves).
        if (uploadQueueRef.current.size > 0) {
          const snapshots = Array.from(uploadQueueRef.current.values());
          const settled = await Promise.allSettled(snapshots);
          const failures: string[] = [];
          settled.forEach(s => {
            if (s.status !== 'fulfilled') {
              failures.push('Upload failed.');
              return;
            }
            const ok = !!(s.value as any)?.success;
            const msg = ((s.value as any)?.message || '').toString();
            if (!ok) failures.push(msg || 'Upload failed.');
          });
          if (failures.length) {
            const msg = failures[0] || tSystem('files.error.uploadFailed', languageRef.current, 'Could not add photos.');
            logEvent('submit.queue.wait.uploads.failed', { reason, message: msg });
            return { ok: false, message: msg };
          }
        }

        // 2) Wait for in-flight autosave (avoid optimistic-lock and "create-flow id" races).
        if (autoSaveInFlightRef.current) {
          const sleep = (ms: number) => new Promise<void>(r => globalThis.setTimeout(r, ms));
          while (autoSaveInFlightRef.current) {
            if (recordSessionRef.current !== sessionAtStart) {
              logEvent('submit.queue.wait.detached.sessionChanged', { reason, sessionAtStart, sessionNow: recordSessionRef.current });
              return { ok: false, message: 'Record session changed.' };
            }
            await sleep(60);
          }
        }

        // If autosave/upload detected a stale record, block submit now.
        if (recordStaleRef.current) {
          logEvent('submit.queue.wait.blocked.recordStale', { reason, recordId: recordStaleRef.current.recordId });
          return { ok: false, message: recordStaleRef.current.message || 'Record is stale. Please refresh.' };
        }

        if (startAutosave || startUploads > 0) {
          logEvent('submit.queue.wait.done', { reason, durationMs: Date.now() - startedAt });
        }
        return { ok: true };
      };

      const waitRes = await waitForBackgroundSaves('submit');
      if (!waitRes.ok) {
        const msg = (waitRes.message || tSystem('actions.submitFailed', language, 'Submit failed')).toString();
        setStatus(msg);
        setStatusLevel('error');
        logEvent('submit.blocked.backgroundQueue', { message: msg });
        return;
      }

      let existingRecordId = resolveExistingRecordId({
        selectedRecordId: selectedRecordIdRef.current,
        selectedRecordSnapshot: selectedRecordSnapshotRef.current,
        lastSubmissionMetaId: lastSubmissionMetaRef.current?.id || null
      });
      const submitDedupSignature = computeDedupSignatureFromValues((definition as any)?.dedupRules, valuesRef.current as any);
      const submitDedupFingerprint = dedupDeleteOnKeyChangeEnabled
        ? computeDedupKeyFingerprint((definition as any)?.dedupRules, valuesRef.current as any)
        : '';
      const submitDedupBaselineFingerprint = (dedupKeyFingerprintBaselineRef.current || '').toString();
      const dedupKeysChangedForExistingRecord =
        dedupDeleteOnKeyChangeEnabled &&
        !createFlowRef.current &&
        !!existingRecordId &&
        !!submitDedupBaselineFingerprint &&
        submitDedupBaselineFingerprint !== submitDedupFingerprint &&
        !!submitDedupSignature;
      if (dedupKeysChangedForExistingRecord) {
        const deleted = await triggerDedupDeleteOnKeyChange('submit.detectKeyChange', {
          recordId: existingRecordId || null
        });
        if (!deleted) {
          const msg = tSystem('actions.submitFailed', languageRef.current, 'Submit failed');
          setStatus(msg);
          setStatusLevel('error');
          logEvent('submit.blocked.dedupDeleteOnKeyChange.deleteFailed', { recordId: existingRecordId || null });
          return;
        }
        existingRecordId = resolveExistingRecordId({
          selectedRecordId: selectedRecordIdRef.current,
          selectedRecordSnapshot: selectedRecordSnapshotRef.current,
          lastSubmissionMetaId: lastSubmissionMetaRef.current?.id || null
        });
      }
      const payload = await buildSubmissionPayload({
        definition,
        formKey,
        language: languageRef.current,
        values: valuesRef.current,
        lineItems: lineItemsRef.current,
        existingRecordId,
        collapsedRows: submitUi?.collapsedRows,
        collapsedSubgroups: submitUi?.collapsedSubgroups
      });
      const submitBaseVersion = recordDataVersionRef.current;
      if (existingRecordId && Number.isFinite(Number(submitBaseVersion)) && Number(submitBaseVersion) > 0) {
        (payload as any).__ckClientDataVersion = Number(submitBaseVersion);
      }
      const payloadValues = (payload as any).values as Record<string, any> | undefined;
      if (payloadValues) {
        const fileUpdates = computeUrlOnlyUploadUpdates(definition, payloadValues);
        if (Object.keys(fileUpdates).length) {
          setValues(prev => ({ ...prev, ...fileUpdates }));
          setSelectedRecordSnapshot(prev =>
            prev ? { ...prev, values: { ...(prev.values || {}), ...fileUpdates } } : prev
          );
        }
      }
      const submitRpcStartMark = `ck.submit.rpc.start.${Date.now()}`;
      const submitRpcEndMark = `ck.submit.rpc.end.${Date.now()}`;
      perfMark(submitRpcStartMark);
      const res = await submit(payload);
      perfMark(submitRpcEndMark);
      perfMeasure('ck.submit.rpc', submitRpcStartMark, submitRpcEndMark, {
        formKey,
        recordId: existingRecordId || null
      });
      if (!res) {
        logEvent('submit.emptyResponse', { formKey, existingRecordId: existingRecordId || null });
      }
      const ok = Boolean(res?.success);
      const message = (res?.message || (ok ? 'Submitted' : 'Submit failed')).toString();
      setStatus(message);
      setStatusLevel(ok ? 'success' : 'error');
      if (!ok) {
        const lower = message.toLowerCase();
        const isStale = lower.includes('modified by another user') || lower.includes('please refresh');
        if (isStale) {
          const serverVersionRaw = Number((res as any)?.meta?.dataVersion);
          markRecordStale({
            reason: 'submit.rejected.stale',
            recordId: existingRecordId || selectedRecordId || '',
            cachedVersion: Number.isFinite(Number(submitBaseVersion)) ? Number(submitBaseVersion) : null,
            serverVersion: Number.isFinite(serverVersionRaw) ? serverVersionRaw : null,
            serverRow: null
          });
        }
        logEvent('submit.error', { message, meta: (res as any)?.meta || null });
        return;
      }
      logEvent('submit.success', { recordId: (res as any)?.meta?.id });

      const recordId = (((res as any)?.meta?.id) || existingRecordId || selectedRecordId || '').toString();
      if (recordId) setSelectedRecordId(recordId);
      dedupBaselineSignatureRef.current = (submitDedupSignature || '').toString();
      dedupKeyFingerprintBaselineRef.current = submitDedupFingerprint;

      setLastSubmissionMeta(prev => ({
        id: recordId || prev?.id || selectedRecordId,
        createdAt: (res as any)?.meta?.createdAt || prev?.createdAt,
        updatedAt: (res as any)?.meta?.updatedAt || prev?.updatedAt,
        dataVersion: Number.isFinite(Number(((res as any)?.meta as any)?.dataVersion)) ? Number(((res as any).meta as any).dataVersion) : prev?.dataVersion,
        status: ((res as any)?.meta as any)?.status || prev?.status || null
      }));
      recordStaleRef.current = null;
      setRecordStale(null);
      const dv = Number(((res as any)?.meta as any)?.dataVersion);
      if (Number.isFinite(dv) && dv > 0) {
        recordDataVersionRef.current = dv;
      }
      const rn = Number(((res as any)?.meta as any)?.rowNumber);
      if (Number.isFinite(rn) && rn >= 2) {
        recordRowNumberRef.current = rn;
      }

      // Run follow-up actions automatically (and close the record) now that the Follow-up view is removed.
      const followupCfg = (definition as any)?.followup || null;
      if (recordId) {
        const actions: string[] = [];
        if (followupCfg?.pdfTemplateId) actions.push('CREATE_PDF');
        if (followupCfg?.emailTemplateId && followupCfg?.emailRecipients) actions.push('SEND_EMAIL');
        // Always close on submit (per UX requirement).
        actions.push('CLOSE_RECORD');

        const followupErrors: string[] = [];
        try {
          setStatus('Running follow-up…');
          setStatusLevel('info');
          logEvent('followup.auto.batch.begin', { recordId, actions });
          const followupRpcStartMark = `ck.submit.followup.rpc.start.${Date.now()}`;
          const followupRpcEndMark = `ck.submit.followup.rpc.end.${Date.now()}`;
          perfMark(followupRpcStartMark);
          const batch = await triggerFollowupBatch(formKey, recordId, actions);
          perfMark(followupRpcEndMark);
          perfMeasure('ck.submit.followup.rpc', followupRpcStartMark, followupRpcEndMark, {
            formKey,
            recordId,
            actionsCount: actions.length
          });
          const entries = Array.isArray(batch?.results) ? batch.results : [];
          const byAction = new Map<string, any>();
          entries.forEach(entry => {
            const key = (entry?.action || '').toString().trim().toUpperCase();
            if (key) byAction.set(key, entry?.result || null);
          });

          for (const action of actions) {
            const result = byAction.get(action) || null;
            if (!result?.success) {
              const msg = (result?.message || result?.status || 'Failed').toString();
              followupErrors.push(`${action}: ${msg}`);
              logEvent('followup.auto.error', { action, recordId, message: msg });
              continue;
            }
            upsertListCacheRow({
              recordId,
              updatedAt: (result.updatedAt || '').toString() || undefined,
              status: (result.status || null) as any,
              pdfUrl: (result.pdfUrl || '').toString() || undefined
            });
            logEvent('followup.auto.success', { action, recordId, status: result.status || null });
            setLastSubmissionMeta(prev => ({
              ...(prev || { id: recordId }),
              updatedAt: result.updatedAt || prev?.updatedAt,
              status: result.status || prev?.status || null
            }));
            setSelectedRecordSnapshot(prev =>
              prev
                ? {
                    ...prev,
                    updatedAt: result.updatedAt || prev.updatedAt,
                    status: result.status || prev.status,
                    pdfUrl: result.pdfUrl || prev.pdfUrl
                  }
                : prev
            );
          }
          logEvent('followup.auto.batch.done', {
            recordId,
            actionsCount: actions.length,
            errorCount: followupErrors.length
          });
        } catch (err: any) {
          const uiMessage = resolveUiErrorMessage(err, 'Failed');
          const logMessage = resolveLogMessage(err, 'Failed');
          followupErrors.push(`BATCH: ${uiMessage || 'Failed'}`);
          logEvent('followup.auto.batch.exception', { recordId, message: logMessage });
        }

        if (followupErrors.length) {
          setStatus(`Submitted, but follow-up had issues: ${followupErrors.join(' · ')}`);
          setStatusLevel('error');
        } else {
          setStatus(tSystem('actions.submittedClosed', language, 'Submitted and closed.'));
          setStatusLevel('success');
        }
      }

      // Refresh from saved record to surface server-side autoIncrement + follow-up changes immediately.
      if (recordId) {
        try {
          await loadRecordSnapshot(recordId);
        } catch (err: any) {
          logEvent('submit.fetchRecord.error', { message: err?.message || err, recordId });
        }
      }
      setView(summaryViewEnabled ? 'summary' : 'form');
    } catch (err: any) {
      const uiMessage = resolveUiErrorMessage(err, 'Submit failed');
      const logMessage = resolveLogMessage(err, 'Submit failed');
      if (uiMessage) {
        setStatus(uiMessage);
        setStatusLevel('error');
      } else {
        setStatusLevel(null);
      }
      logEvent('submit.exception', { message: logMessage });
    } finally {
      setSubmitting(false);
      submittingRef.current = false;
      submitPipelineInFlightRef.current = false;
      if (submitPipelineStartMark) {
        const submitPipelineEndMark = `ck.submit.pipeline.end.${Date.now()}`;
        perfMark(submitPipelineEndMark);
        perfMeasure('ck.submit.pipeline', submitPipelineStartMark, submitPipelineEndMark, {
          formKey
        });
      }
    }
  }

  const handleSummarySubmit = useCallback(() => {
    if (submitting) return;
    if (recordLoadingId) return;
    if (updateRecordBusyOpen) return;
    submitConfirmedRef.current = false;
    summarySubmitIntentRef.current = true;
    logEvent('ui.submit.tap', {
      submitLabelOverridden: Boolean(definition.submitButtonLabel),
      view: 'summary'
    });
    logEvent('summary.submit.fire', { sourceView: viewRef.current });
    void handleSubmit();
  }, [definition.submitButtonLabel, handleSubmit, logEvent, recordLoadingId, submitting, updateRecordBusyOpen]);

  const handleRecordSelect = (
    row: ListItem,
    fullRecord?: WebFormSubmission,
    opts?: { openView?: 'auto' | 'form' | 'summary' | 'button' | 'copy' | 'submit'; openButtonId?: string }
  ) => {
    const requested = (opts?.openView || 'auto') as 'auto' | 'form' | 'summary' | 'button' | 'copy' | 'submit';
    const openButtonId = (opts?.openButtonId || '').toString().trim();
    const shouldTriggerButton = requested === 'button' && !!openButtonId;
    const shouldCopy = requested === 'copy';
    const shouldSubmit = requested === 'submit';
    const openStartedAt = Date.now();
    const openStartMark = `ck.nav.openRecord.start.${openStartedAt}`;
    openRecordPerfRef.current = { recordId: row.id, startedAt: openStartedAt, startMark: openStartMark };
    perfMark(openStartMark);

    const scheduleListOpenSubmit = (args: { recordId: string; source: string }) => {
      const recordId = (args.recordId || '').toString().trim();
      if (!recordId) return;
      // Cancel any previous scheduled submit.
      if (listOpenViewSubmitTimerRef.current) {
        globalThis.clearTimeout(listOpenViewSubmitTimerRef.current);
        listOpenViewSubmitTimerRef.current = null;
      }
      const startedAt = Date.now();
      let attempt = 0;
      const maxAttempts = 40;
      const delayMs = 80;
      const tick = () => {
        attempt += 1;
        const currentSelectedId = (selectedRecordIdRef.current || '').toString().trim();
        const snapshotId = (selectedRecordSnapshotRef.current?.id || '').toString().trim();
        const inForm = viewRef.current === 'form';
        const submitAction = formSubmitActionRef.current;
        const hasAction = typeof submitAction === 'function';
        if (currentSelectedId !== recordId || (snapshotId && snapshotId !== recordId)) {
          logEvent('list.openView.submit.cancelled', {
            recordId,
            source: args.source,
            reason: 'recordChanged',
            currentSelectedId: currentSelectedId || null,
            snapshotId: snapshotId || null
          });
          return;
        }
        if (!inForm || !hasAction || snapshotId !== recordId) {
          if (attempt >= maxAttempts) {
            logEvent('list.openView.submit.timeout', {
              recordId,
              source: args.source,
              attempt,
              inForm,
              hasAction,
              snapshotId: snapshotId || null
            });
            return;
          }
          listOpenViewSubmitTimerRef.current = globalThis.setTimeout(tick, delayMs);
          return;
        }
        listOpenViewSubmitTimerRef.current = null;
        submitConfirmedRef.current = false;
        logEvent('list.openView.submit.fire', {
          recordId,
          source: args.source,
          attempt,
          waitMs: Date.now() - startedAt
        });
        submitAction?.();
      };
      tick();
    };

    // If the user is resuming the SAME record they were just editing, keep the in-memory working copy.
    // (Don't overwrite with a cached snapshot that may not include the latest local edits yet.)
    const currentId = (selectedRecordIdRef.current || '').toString().trim();
    const hasLocalEdits = Boolean(
      autoSaveDirtyRef.current || autoSaveInFlightRef.current || autoSaveQueuedRef.current || uploadQueueRef.current.size > 0
    );
    if (currentId && row.id === currentId && hasLocalEdits) {
      logEvent('list.recordSelect.resumeLocalEdits', {
        recordId: row.id,
        dirty: !!autoSaveDirtyRef.current,
        inFlight: !!autoSaveInFlightRef.current,
        queued: !!autoSaveQueuedRef.current,
        requested,
        openButtonId: shouldTriggerButton ? openButtonId : null
      });
      // For list-triggered button actions, keep the list view and run the action immediately from the in-memory values.
      if (shouldTriggerButton) {
        handleCustomButton(openButtonId);
        return;
      }
      if (shouldCopy) {
        logEvent('list.openView.copy', { recordId: row.id, source: 'resumeLocalEdits' });
        handleDuplicateCurrent();
        return;
      }
      if (shouldSubmit) {
        logEvent('list.openView.submit', { recordId: row.id, source: 'resumeLocalEdits' });
        setView('form');
        scheduleListOpenSubmit({ recordId: row.id, source: 'resumeLocalEdits' });
        return;
      }

      const statusRaw =
        ((lastSubmissionMetaRef.current?.status || selectedRecordSnapshotRef.current?.status || row.status || '') as any)?.toString?.() ||
        '';
      if (requested === 'form') {
        setView('form');
      } else if (requested === 'summary') {
        setView(summaryViewEnabled ? 'summary' : 'form');
      } else {
        const resolved = resolveStatusAutoView(statusRaw, summaryViewEnabled);
        setView(resolved.view);
        logEvent('list.openView.autoByStatus', {
          recordId: row.id,
          source: 'resumeLocalEdits',
          status: statusRaw || null,
          statusKey: resolved.statusKey,
          nextView: resolved.view
        });
      }
      return;
    }

    bumpRecordSession({ reason: 'list.recordSelect', nextRecordId: row.id });
    const sourceRecord = fullRecord || listCache.records[row.id] || null;
    setStatus(null);
    setStatusLevel(null);
    setRecordLoadError(null);
    setSelectedRecordId(row.id);
    selectedRecordIdRef.current = row.id;
    // Clear any previous snapshot immediately; we will re-apply a fresh snapshot below.
    setSelectedRecordSnapshot(null);
    const isAllowedListTriggeredAction = (buttonRef: string): boolean => {
      const parsed = parseButtonRef(buttonRef || '');
      const baseId = parsed.id;
      const qIdx = parsed.qIdx;
      const indexed = qIdx !== undefined ? definition.questions[qIdx] : undefined;
      const btn =
        indexed && indexed.type === 'BUTTON' && indexed.id === baseId
          ? indexed
          : definition.questions.find(q => q.type === 'BUTTON' && q.id === baseId);
      const cfg: any = btn ? (btn as any).button : null;
      const action = (cfg?.action || '').toString().trim();
      return (
        action === 'renderDocTemplate' ||
        action === 'renderMarkdownTemplate' ||
        action === 'renderHtmlTemplate' ||
        action === 'openUrlField' ||
        action === 'updateRecord'
      );
    };

    const rowNumberHint = Number((row as any).__rowNumber);
    const hintedRow = Number.isFinite(rowNumberHint) ? rowNumberHint : undefined;
    recordRowNumberRef.current = hintedRow || null;

    const triggerOpenButtonIfNeeded = () => {
      if (!shouldTriggerButton) return;
      if (!isAllowedListTriggeredAction(openButtonId)) {
        logEvent('list.openButton.ignored', { openButtonId, reason: 'unsupportedAction' });
        return;
      }
      logEvent('list.openButton.trigger', { openButtonId });
      handleCustomButton(openButtonId);
    };

    const cachedVersion =
      sourceRecord && Number.isFinite(Number((sourceRecord as any).dataVersion)) ? Number((sourceRecord as any).dataVersion) : null;

    // Fast path: show cached record immediately when available.
    // Re-check the server version in the background when we have a cached version; refetch if stale.
    if (sourceRecord) {
      applyRecordSnapshot(sourceRecord);
      // If the list requested a button action, don't wait on version checks; render immediately from the cached snapshot.
      // (If the cached snapshot is stale, the user can always refresh; we avoid blocking the UX on a second roundtrip.)
      if (shouldTriggerButton) {
        triggerOpenButtonIfNeeded();
      }
      if (shouldCopy) {
        logEvent('list.openView.copy', { recordId: row.id, source: 'cached' });
        handleDuplicateCurrent();
        return;
      }
      if (shouldSubmit) {
        logEvent('list.openView.submit', { recordId: row.id, source: 'cached' });
        setView('form');
        scheduleListOpenSubmit({ recordId: row.id, source: 'cached' });
        return;
      }
      // Version check is async; do not block navigation.
      if (cachedVersion !== null) {
        if (autoSaveInFlightRef.current || uploadQueueRef.current.size > 0) {
          logEvent('record.versionCheck.skipped', {
            recordId: row.id,
            reason: autoSaveInFlightRef.current ? 'autosaveInFlight' : 'uploadInFlight'
          });
        } else {
          void (async () => {
            const recordId = row.id;
            logEvent('record.versionCheck.start', { recordId, cachedVersion, rowNumberHint: hintedRow || null });
            try {
              const v = await getRecordVersionApi(formKey, recordId, hintedRow || null);
              if (selectedRecordIdRef.current !== recordId) return;
              if (autoSaveInFlightRef.current || uploadQueueRef.current.size > 0) {
                // Avoid racing our own autosave writes. We'll rely on the next check (or explicit refresh).
                logEvent('record.versionCheck.ignored', {
                  recordId,
                  reason: autoSaveInFlightRef.current ? 'autosaveInFlight.afterFetch' : 'uploadInFlight.afterFetch'
                });
                return;
              }
              if (!v?.success) {
                logEvent('record.versionCheck.error', { recordId, message: v?.message || 'failed' });
                return;
              }
              const serverVersion = Number(v.dataVersion);
              const serverRow = Number.isFinite(Number(v.rowNumber)) ? Number(v.rowNumber) : undefined;
              if (serverRow && serverRow >= 2) recordRowNumberRef.current = serverRow;
              const localVersionNow = Number(recordDataVersionRef.current);
              const baselineVersion =
                Number.isFinite(localVersionNow) && localVersionNow > 0 ? localVersionNow : cachedVersion;
              if (Number.isFinite(serverVersion) && serverVersion > 0 && serverVersion === baselineVersion) {
                logEvent('record.versionCheck.match', { recordId, serverVersion, baselineVersion });
                return;
              }
              logEvent('record.versionCheck.stale', {
                recordId,
                cachedVersion: baselineVersion,
                serverVersion: Number.isFinite(serverVersion) ? serverVersion : null,
                serverRow: serverRow || null
              });
              // Do NOT auto-refresh: show a banner so the user can explicitly refresh (avoids losing local changes).
              if (Number.isFinite(serverVersion) && serverVersion > 0 && serverVersion !== baselineVersion) {
                markRecordStale({
                  reason: 'versionCheck.stale',
                  recordId,
                  cachedVersion: baselineVersion,
                  serverVersion,
                  serverRow: serverRow || hintedRow || null
                });
              }
            } catch (err: any) {
              const msg = (err?.message || err?.toString?.() || 'failed').toString();
              logEvent('record.versionCheck.exception', { recordId: row.id, message: msg });
            }
          })();
        }
      }
    } else {
      // No cached record (or no cached version): fetch the full snapshot.
      setLastSubmissionMeta({
        id: row.id,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        status: row.status ? row.status.toString() : null
      });
      loadRecordSnapshot(row.id, hintedRow).then(ok => {
        if (!ok) return;
        if (selectedRecordIdRef.current !== row.id) return;
        if (shouldCopy) {
          logEvent('list.openView.copy', { recordId: row.id, source: 'fetched' });
          handleDuplicateCurrent();
          return;
        }
        if (shouldSubmit) {
          logEvent('list.openView.submit', { recordId: row.id, source: 'fetched' });
          setView('form');
          scheduleListOpenSubmit({ recordId: row.id, source: 'fetched' });
          return;
        }
        triggerOpenButtonIfNeeded();
      });
    }

    const statusRaw = ((sourceRecord?.status || row.status || '') as any)?.toString?.() || '';
    // When Summary view is disabled, always open the Form view (closed records are read-only).
    if (shouldTriggerButton) {
      // Stay on the list view; the button action will open a preview overlay when the record snapshot is ready.
      return;
    }
    if (shouldCopy || shouldSubmit) {
      // Navigation is handled by the copy/submit flows above.
      return;
    }

    if (requested === 'form') {
      setView('form');
    } else if (requested === 'summary') {
      setView(summaryViewEnabled ? 'summary' : 'form');
    } else {
      const resolved = resolveStatusAutoView(statusRaw, summaryViewEnabled);
      setView(resolved.view);
      logEvent('list.openView.autoByStatus', {
        recordId: row.id,
        source: sourceRecord ? 'cached' : 'fetched',
        status: statusRaw || null,
        statusKey: resolved.statusKey,
        nextView: resolved.view
      });
    }
  };

  const openRecordByIdForPerf = useCallback(
    (recordId: string, openViewRaw?: string): boolean => {
      if (!perfEnabled) return false;
      const id = (recordId || '').toString().trim();
      if (!id) return false;
      const items = (listCache.response?.items || []) as ListItem[];
      if (!items.length) return false;
      const row = items.find(r => ((r as any)?.id || '').toString() === id);
      if (!row) return false;
      const lowered = (openViewRaw || 'auto').toString().trim().toLowerCase();
      const openView: 'auto' | 'form' | 'summary' | 'submit' =
        lowered === 'form' ? 'form' : lowered === 'summary' ? 'summary' : lowered === 'submit' ? 'submit' : 'auto';
      logEvent('perf.openRecordById.attempt', { recordId: id, openView });
      handleRecordSelect(row, listCache.records[id], { openView });
      return true;
    },
    [handleRecordSelect, listCache.records, listCache.response?.items, logEvent, perfEnabled]
  );

  useEffect(() => {
    if (!perfEnabled) return;
    const globalAny = globalThis as any;
    const hook = (recordId: any, openView?: any) => openRecordByIdForPerf((recordId || '').toString(), (openView || '').toString());
    globalAny.__CK_PERF_OPEN_RECORD_BY_ID__ = hook;
    return () => {
      try {
        if (globalAny.__CK_PERF_OPEN_RECORD_BY_ID__ === hook) {
          delete globalAny.__CK_PERF_OPEN_RECORD_BY_ID__;
        }
      } catch (_) {
        // ignore cleanup failures
      }
    };
  }, [openRecordByIdForPerf, perfEnabled]);

  useEffect(() => {
    const pending = openRecordPerfRef.current;
    if (!pending) return;
    if (selectedRecordId !== pending.recordId) return;
    if (view !== 'form' && view !== 'summary') return;
    const endMark = `ck.nav.openRecord.end.${pending.startedAt}`;
    perfMark(endMark);
    perfMeasure('ck.nav.openRecord', pending.startMark, endMark, {
      recordId: pending.recordId,
      view
    });
    openRecordPerfRef.current = null;
  }, [perfMark, perfMeasure, selectedRecordId, view]);

  useEffect(() => {
    const pending = backToHomePerfRef.current;
    if (!pending) return;
    if (view !== 'list') return;
    const firstListItemCount = listCache.response?.items?.length || 0;
    if (firstListItemCount <= 0) return;
    const endMark = `ck.nav.back.end.${pending.startedAt}`;
    perfMark(endMark);
    perfMeasure('ck.nav.backToHome', pending.startMark, endMark, {
      trigger: pending.trigger,
      firstItemCount: firstListItemCount
    });
    backToHomePerfRef.current = null;
  }, [listCache.response?.items?.length, perfMark, perfMeasure, view]);

  const currentRecord = selectedRecordSnapshot || (selectedRecordId ? listCache.records[selectedRecordId] : null);
  const headerSaveIndicator = useMemo(() => {
    // Show in the Form view, and also while a background save is in-flight after navigation.
    const showForView = view === 'form' || (autoSaveEnabled && draftSave.phase === 'saving');
    if (!showForView) return null;

    if (isClosedRecord) {
      return (
        <output aria-live="polite" data-tone="paused">
          {tSystem('app.closedReadOnly', language, 'Closed (read-only)')}
        </output>
      );
    }

    if (!autoSaveEnabled) return null;
    if (draftSave.phase === 'idle') return null;

    const byPhase: Partial<Record<DraftSavePhase, { key: string; fallback: string; tone: string }>> = {
      saving: { key: 'draft.savingShort', fallback: 'Saving…', tone: 'saving' },
      saved: { key: 'draft.savedShort', fallback: 'Saved', tone: 'saved' },
      dirty: { key: 'draft.dirtyShort', fallback: 'Unsaved changes', tone: 'muted' },
      paused: { key: 'draft.pausedShort', fallback: 'Autosave paused', tone: 'paused' },
      error: { key: 'draft.saveFailedShort', fallback: 'Save failed', tone: 'error' }
    };
    const def = byPhase[draftSave.phase];
    if (!def) return null;

    const text =
      draftSave.phase === 'paused' ? (draftSave.message || tSystem(def.key, language, def.fallback)) : tSystem(def.key, language, def.fallback);
    return (
      <output aria-live="polite" data-tone={def.tone}>
        {text}
      </output>
    );
  }, [autoSaveEnabled, draftSave.message, draftSave.phase, isClosedRecord, language, view]);

  const headerEnvTag = useMemo(() => {
    const trimmed = (envTag || '').toString().trim();
    if (!trimmed) return null;
    return (
      <span className="ck-env-tag" role="status" aria-label={`Environment: ${trimmed}`}>
        {trimmed}
      </span>
    );
  }, [envTag]);

  const headerRight = useMemo(() => {
    if (!headerEnvTag && !headerSaveIndicator) return null;
    return (
      <>
        {headerEnvTag}
        {headerSaveIndicator}
      </>
    );
  }, [headerEnvTag, headerSaveIndicator]);

  const dedupDialogConflict = useMemo(() => {
    const conflict = (dedupConflict || dedupNotice) as any;
    if (!conflict || !conflict.existingRecordId) return null;
    return conflict as DedupConflictInfo;
  }, [dedupConflict, dedupNotice]);

  type DedupDialogItem = { fieldId: string; label: string; value: string; fieldType?: string };
  const buildDedupDialogDetails = useCallback(
    (args: { ruleId?: string; values: Record<string, FieldValue> }) => {
      const rules = Array.isArray((definition as any)?.dedupRules) ? ((definition as any).dedupRules as any[]) : [];
      const ruleId = (args.ruleId || '').toString().trim();
      const rule = rules.find(entry => (entry?.id || '').toString().trim() === ruleId);
      const ruleKeys = Array.isArray(rule?.keys)
        ? rule.keys.map((key: any) => (key ?? '').toString().trim()).filter(Boolean)
        : [];
      const fallbackKeys = (() => {
        const keys = Object.keys(dedupKeyFieldIdMap || {});
        const list: string[] = [];
        const seen = new Set<string>();
        keys.forEach(key => {
          const trimmed = (key || '').toString().trim();
          if (!trimmed) return;
          const lower = trimmed.toLowerCase();
          if (seen.has(lower)) return;
          seen.add(lower);
          list.push(trimmed);
        });
        return list;
      })();
      const keys = ruleKeys.length ? ruleKeys : fallbackKeys;
      const questions = Array.isArray(definition?.questions) ? definition.questions : [];
      const rawItems: DedupDialogItem[] = keys.map((key: string) => {
        const keyLower = key.toLowerCase();
        const question = questions.find(entry => {
          const id = (entry?.id || '').toString();
          return id === key || id.toLowerCase() === keyLower;
        });
        const fieldId = (question?.id || key).toString();
        const label = question ? resolveLabel(question, language) : key;
        const optionSet = question ? optionState[optionKey(question.id)] || toOptionSet(question as any) : undefined;
        const fieldType = question?.type;
        const rawValue = (args.values as any)[fieldId];
        const value = formatDisplayText(rawValue, { language, optionSet, fieldType });
        return { fieldId, label: label.toString(), value, fieldType };
      });
      const seen = new Set<string>();
      const items = rawItems.filter((item: DedupDialogItem) => {
        const lower = item.fieldId.toLowerCase();
        if (seen.has(lower)) return false;
        seen.add(lower);
        return true;
      });
      const priority = (item: DedupDialogItem) => {
        if ((item.fieldType || '').toString().toUpperCase() === 'DATE') return 2;
        const labelLower = item.label.toLowerCase();
        if (labelLower.includes('customer')) return 0;
        if (labelLower.includes('service')) return 1;
        if (labelLower.includes('date')) return 2;
        return 3;
      };
      const ordered = [...items].sort((a, b) => {
        const pa = priority(a);
        const pb = priority(b);
        if (pa !== pb) return pa - pb;
        return 0;
      });
      return { keys: ordered.map(item => item.fieldId), items: ordered };
    },
    [dedupKeyFieldIdMap, definition, language, optionState]
  );

  const dedupDialogDetails = useMemo(() => {
    if (!dedupDialogConflict) return null;
    return buildDedupDialogDetails({ ruleId: dedupDialogConflict.ruleId, values });
  }, [buildDedupDialogDetails, dedupDialogConflict, values]);

  const dedupDialogCopy = useMemo(
    () => resolveDedupDialogCopy(definition.dedupDialog, language),
    [definition.dedupDialog, language]
  );

  const renderDedupDialogMessage = useCallback(
    (items: DedupDialogItem[]) => {
      const intro = dedupDialogCopy.intro.trim();
      const outro = dedupDialogCopy.outro.trim();
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {intro ? <div>{intro}</div> : null}
          {items.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {items.map(item => (
                <div key={item.fieldId}>
                  {item.label}: {item.value}
                </div>
              ))}
            </div>
          ) : null}
          {outro ? <div>{outro}</div> : null}
        </div>
      );
    },
    [dedupDialogCopy.intro, dedupDialogCopy.outro]
  );

  const dedupDialogMessage = useMemo(() => {
    if (!dedupDialogConflict) return '';
    const items = dedupDialogDetails?.items || [];
    return renderDedupDialogMessage(items);
  }, [dedupDialogConflict, dedupDialogDetails, renderDedupDialogMessage]);

  const listDedupDialogDetails = useMemo(() => {
    if (!listDedupPrompt) return null;
    return buildDedupDialogDetails({ ruleId: listDedupPrompt.conflict.ruleId, values: listDedupPrompt.values });
  }, [buildDedupDialogDetails, listDedupPrompt]);

  const listDedupDialogMessage = useMemo(() => {
    if (!listDedupPrompt) return '';
    const items = listDedupDialogDetails?.items || [];
    return renderDedupDialogMessage(items);
  }, [listDedupDialogDetails, listDedupPrompt, renderDedupDialogMessage]);

  const resetDedupState = useCallback(
    (reason: string) => {
      if (dedupCheckTimerRef.current) {
        globalThis.clearTimeout(dedupCheckTimerRef.current);
        dedupCheckTimerRef.current = null;
      }
      dedupCheckSeqRef.current += 1;
      lastDedupCheckedSignatureRef.current = '';
      dedupHoldRef.current = false;
      dedupCheckingRef.current = false;
      dedupConflictRef.current = null;
      setDedupChecking(false);
      setDedupConflict(null);
      setDedupNotice(null);
      autoSaveDirtyRef.current = false;
      if (autoSaveTimerRef.current) {
        globalThis.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      setDraftSave({ phase: 'idle' });
      logEvent('dedup.state.reset', { reason });
    },
    [logEvent]
  );

  const handleDedupChangeFields = useCallback(() => {
    const conflict = dedupDialogConflict;
    if (!conflict) return;
    const fallbackKeys = dedupDialogDetails?.keys || [];
    const keys = fallbackKeys.length
      ? fallbackKeys
      : (() => {
          const list: string[] = [];
          const seen = new Set<string>();
          Object.keys(dedupKeyFieldIdMap || {}).forEach(key => {
            const trimmed = (key || '').toString().trim();
            if (!trimmed) return;
            const lower = trimmed.toLowerCase();
            if (seen.has(lower)) return;
            seen.add(lower);
            list.push(trimmed);
          });
          return list;
        })();
    resetDedupState('dedup.dialog.changeFields');
    if (keys.length) {
      const baseValues = { ...(valuesRef.current || {}) };
      keys.forEach(key => {
        if (!key) return;
        baseValues[key] = '';
      });
      const mapped = applyValueMapsToForm(definition, baseValues, lineItemsRef.current, {
        mode: 'change',
        lockedTopFields: keys
      });
      setValues(mapped.values);
      setLineItems(mapped.lineItems);
      valuesRef.current = mapped.values;
      lineItemsRef.current = mapped.lineItems;
      setErrors(prev => {
        const next = { ...(prev || {}) };
        keys.forEach(key => {
          if (key && key in next) delete next[key];
        });
        return next;
      });
      autoSaveDirtyRef.current = true;
      setDraftSave({ phase: 'dirty' });
    }
    setView('form');
    logEvent('dedup.dialog.changeFields', {
      ruleId: conflict.ruleId || null,
      existingRecordId: conflict.existingRecordId || null,
      clearedFields: keys
    });
  }, [
    dedupDialogConflict,
    dedupDialogDetails,
    dedupKeyFieldIdMap,
    definition,
    logEvent,
    resetDedupState,
    setErrors,
    setLineItems,
    setValues,
    setView
  ]);

  const handleDedupOpenExisting = useCallback(() => {
    const conflict = dedupDialogConflict as any;
    const id = (conflict?.existingRecordId || '').toString().trim();
    if (!id) return;
    const rowNumberRaw = conflict?.existingRowNumber;
    const rowNumber =
      rowNumberRaw === undefined || rowNumberRaw === null || !Number.isFinite(Number(rowNumberRaw))
        ? undefined
        : Number(rowNumberRaw);
    resetDedupState('dedup.dialog.openExisting');
    logEvent('dedup.openExisting.click', { existingRecordId: id, source: 'dedupDialog' });
    void openExistingRecordFromDedup({ recordId: id, rowNumber, source: 'dedupDialog', view: 'form' });
  }, [dedupDialogConflict, logEvent, openExistingRecordFromDedup, resetDedupState]);

  const handleListDedupDialogConfirm = useCallback(() => {
    const prompt = listDedupPrompt;
    if (!prompt) return;
    setListDedupPrompt(null);
    const id = (prompt.conflict.existingRecordId || '').toString().trim();
    if (!id) return;
    const rowNumberRaw = prompt.conflict.existingRowNumber;
    const rowNumber =
      rowNumberRaw === undefined || rowNumberRaw === null || !Number.isFinite(Number(rowNumberRaw))
        ? undefined
        : Number(rowNumberRaw);
    logEvent('dedup.precreate.openExistingFromList', {
      source: prompt.source,
      buttonId: prompt.buttonId,
      qIdx: prompt.qIdx ?? null,
      existingRecordId: id,
      existingRowNumber: rowNumber ?? null
    });
    void openExistingRecordFromDedup({ recordId: id, rowNumber, source: prompt.source });
  }, [listDedupPrompt, logEvent, openExistingRecordFromDedup]);

  const handleListDedupDialogCancel = useCallback(() => {
    const prompt = listDedupPrompt;
    if (!prompt) return;
    setListDedupPrompt(null);
    logEvent('dedup.precreate.listDialog.cancel', {
      source: prompt.source,
      buttonId: prompt.buttonId,
      qIdx: prompt.qIdx ?? null,
      existingRecordId: prompt.conflict.existingRecordId || null,
      existingRowNumber: prompt.conflict.existingRowNumber ?? null
    });
  }, [listDedupPrompt, logEvent]);

  useEffect(() => {
    if (!dedupDialogConflict) return;
    const dialogCfg = definition.dedupDialog;
    logEvent('dedup.dialog.open', {
      ruleId: dedupDialogConflict.ruleId || null,
      existingRecordId: dedupDialogConflict.existingRecordId || null,
      existingRowNumber: dedupDialogConflict.existingRowNumber ?? null,
      copyOverrides: {
        title: Boolean(dialogCfg?.title),
        intro: Boolean(dialogCfg?.intro),
        outro: Boolean(dialogCfg?.outro),
        changeLabel: Boolean(dialogCfg?.changeLabel),
        cancelLabel: Boolean(dialogCfg?.cancelLabel),
        openLabel: Boolean(dialogCfg?.openLabel)
      }
    });
  }, [dedupDialogConflict, definition.dedupDialog, logEvent]);

  const dedupTopNotice =
    view === 'form' && (!!dedupConflict || !!dedupNotice) && !dedupDialogConflict ? (
      <div
        role="status"
        aria-live="polite"
        style={{
          padding: '12px 14px',
          borderRadius: 14,
          border: '1px solid var(--border)',
          background: 'transparent',
          color: 'var(--text)',
          fontWeight: 600,
          display: 'flex',
          flexDirection: 'column',
          gap: 10
        }}
      >
        <div>
          {(dedupConflict || dedupNotice)?.message || tSystem('dedup.duplicate', language, 'Duplicate record.')}
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {(dedupConflict || dedupNotice)?.existingRecordId ? (
            <button
              type="button"
              onClick={() => {
                const conflictAny = (dedupConflict || dedupNotice) as any;
                const id = (conflictAny?.existingRecordId || '').toString().trim();
                const rowNumberRaw = conflictAny?.existingRowNumber;
                const rowNumber =
                  rowNumberRaw === undefined || rowNumberRaw === null || !Number.isFinite(Number(rowNumberRaw))
                    ? undefined
                    : Number(rowNumberRaw);
                if (!id) return;
                // Clear transient dedup state before navigating.
                if (dedupCheckTimerRef.current) {
                  globalThis.clearTimeout(dedupCheckTimerRef.current);
                  dedupCheckTimerRef.current = null;
                }
                dedupCheckSeqRef.current += 1;
                lastDedupCheckedSignatureRef.current = '';
                dedupHoldRef.current = false;
                dedupCheckingRef.current = false;
                dedupConflictRef.current = null;
                setDedupChecking(false);
                setDedupConflict(null);
                setDedupNotice(null);
                // Cancel any pending autosave from the now-invalid draft values.
                autoSaveDirtyRef.current = false;
                if (autoSaveTimerRef.current) {
                  globalThis.clearTimeout(autoSaveTimerRef.current);
                  autoSaveTimerRef.current = null;
                }
                setDraftSave({ phase: 'idle' });
                logEvent('dedup.openExisting.click', { existingRecordId: id });
                // Prefer row-number fetch when available to avoid fragile ID lookups.
                const loadPromise = rowNumber && rowNumber >= 2
                  ? loadRecordSnapshot('', rowNumber)
                  : loadRecordSnapshot(id);
                void loadPromise.then(ok => {
                  if (!ok) return;
                  // Prefer summary when enabled (closed records are read-only).
                  setView(summaryViewEnabled ? 'summary' : 'form');
                });
              }}
              style={{
                padding: '10px 12px',
                borderRadius: 12,
                border: '1px solid var(--border)',
                background: 'transparent',
                color: 'var(--text)',
                fontWeight: 600
              }}
            >
              {tSystem('dedup.openExisting', language, 'Open existing')}
            </button>
          ) : null}
        </div>
      </div>
    ) : null;

  const dedupCheckingNotice =
    precreateDedupChecking || dedupChecking ? (
      <div
        role="status"
        aria-live="polite"
        style={{
          padding: '12px 14px',
          borderRadius: 14,
          border: '1px solid var(--border)',
          background: 'transparent',
          color: 'var(--text)',
          fontWeight: 600
        }}
      >
        {tSystem('dedup.checking', language, 'Checking duplicates…')}
      </div>
    ) : null;

  const refreshStaleRecord = useCallback(async () => {
    const stale = recordStaleRef.current || recordStale;
    const id = (stale?.recordId || selectedRecordIdRef.current || '').toString().trim();
    if (!id) return;
    const row = stale?.serverRow;
    // Cancel any pending autosave while we refresh.
    autoSaveDirtyRef.current = false;
    if (autoSaveTimerRef.current) {
      globalThis.clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    setDraftSave({ phase: 'idle' });
    logEvent('record.stale.refresh.click', { recordId: id, rowNumberHint: row || null, source: 'dialog' });
    await loadRecordSnapshot(id, row || undefined);
  }, [loadRecordSnapshot, logEvent, recordStale]);

  const submitTopErrorMessage = resolveLocalizedString(
    definition.submitValidation?.submitTopErrorMessage,
    language,
    ''
  )
    .toString()
    .trim();
  const validationTopNotice =
    view === 'form' &&
    validationAttempted &&
    !validationNoticeHidden &&
    (Object.keys(errors || {}).length > 0 || (validationWarnings.top || []).length > 0) ? (
      <ValidationHeaderNotice
        language={language}
        errors={errors}
        warnings={validationWarnings.top}
        errorMessageOverride={submitTopErrorMessage || undefined}
        onDismiss={dismissValidationNotice}
        onNavigateToField={navigateToFieldFromHeaderNotice}
      />
    ) : null;

  const guidedStepsTopSlot =
    view === 'form' && (definition as any)?.steps?.mode === 'guided' ? <div id="ck-guided-stepsbar-slot" /> : null;

  const topBarNotice =
    guidedStepsTopSlot || dedupCheckingNotice || dedupTopNotice || validationTopNotice ? (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {guidedStepsTopSlot}
        {dedupCheckingNotice}
        {dedupTopNotice}
        {validationTopNotice}
      </div>
    ) : null;

  const listLegendItems = useMemo(() => {
    const cols = ((definition.listView?.columns as any) || []) as any[];
    return buildListViewLegendItems(cols as any, definition.listView?.legend, language);
  }, [definition.listView?.columns, definition.listView?.legend, language]);
  const listLegendColumns = useMemo(() => {
    const raw = Number((definition.listView as any)?.legendColumns);
    if (!Number.isFinite(raw) || raw <= 1) return 1;
    return Math.max(1, Math.min(2, Math.round(raw)));
  }, [definition.listView]);

  useEffect(() => {
    if (view !== 'list') return;
    if (!listLegendItems.length) return;
    logEvent('list.legend.enabled', {
      count: listLegendItems.length,
      icons: listLegendItems.map(i => i.icon).filter(Boolean)
    });
  }, [logEvent, listLegendItems, view]);

  const bottomBarNotice =
    view === 'list' && (listLegendItems.length || precreateDedupChecking) ? (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {precreateDedupChecking ? dedupCheckingNotice : null}
        {listLegendItems.length ? (
          <div className="ck-list-legend ck-list-legend--bottomBar" role="note" aria-label={tSystem('list.legend.title', language, 'Legend')}>
            <span className="ck-list-legend-title">{tSystem('list.legend.title', language, 'Legend')}:</span>
            <ul className="ck-list-legend-list" data-columns={listLegendColumns > 1 ? '2' : '1'}>
              {listLegendItems.map((item, idx) => (
                <li key={`legend-bottom-${item.icon || 'text'}-${idx}`} className="ck-list-legend-item">
                  {item.icon ? <ListViewIcon name={item.icon} /> : null}
                  {item.pill ? (
                    <span className="ck-list-legend-pill" data-tone={item.pill.tone || 'default'}>
                      {item.pill.text}
                    </span>
                  ) : null}
                  <InlineMarkdown className="ck-list-legend-text" markdown={item.text} />
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    ) : null;

  const guidedSubmitLabel =
    view === 'form' && guidedUiState && !guidedUiState.isFinal
      ? guidedUiState.stepSubmitLabel || definition.submitButtonLabel || tSystem('steps.next', language, 'Next')
      : definition.submitButtonLabel;
  const showGuidedBack = view === 'form' && !!guidedUiState?.backVisible;
  const guidedBackLabel = guidedUiState?.backLabel || tSystem('actions.back', language, 'Back');
  const guidedBackDisabled = guidedUiState ? !guidedUiState.backAllowed : false;
  const orderedSubmitDisabled = orderedEntryEnabled
    ? guidedUiState && !guidedUiState.isFinal
      ? !guidedUiState.forwardGateSatisfied
      : !formIsValid
    : false;
  const submitDisabledTooltip =
    view === 'form' && orderedEntryEnabled && orderedSubmitDisabled && !dedupNavigationBlocked
      ? tSystem('actions.submitDisabledTooltip', language, 'Complete all required fields to activate.')
      : '';

  const systemActionGates = definition.actionBars?.system?.gates;
  const systemActionGateState = useMemo(() => {
    const recordMeta = {
      id: (selectedRecordId || selectedRecordSnapshot?.id || lastSubmissionMeta?.id || undefined) as any,
      createdAt: (selectedRecordSnapshot?.createdAt || lastSubmissionMeta?.createdAt || undefined) as any,
      updatedAt: (selectedRecordSnapshot?.updatedAt || lastSubmissionMeta?.updatedAt || undefined) as any,
      status: (selectedRecordSnapshot?.status || lastSubmissionMeta?.status || null) as any,
      pdfUrl: (selectedRecordSnapshot as any)?.pdfUrl || undefined
    };

    const guidedPrefix = (((definition as any)?.steps as any)?.stateFields?.prefix || '__ckStep').toString();
    const guidedVirtualState =
      guidedUiState && guidedUiState.activeStepId
        ? ({
            prefix: guidedPrefix,
            activeStepId: guidedUiState.activeStepId,
            activeStepIndex: guidedUiState.activeStepIndex || 0,
            maxValidIndex: -1,
            maxCompleteIndex: -1,
            steps: []
          } as any)
        : null;

    const evalFor = (actionId: any) => {
      const ctx = buildSystemActionGateContext({
        actionId,
        view,
        values,
        lineItems,
        recordMeta,
        guidedVirtualState
      });
      return evaluateSystemActionGate({ gates: systemActionGates, actionId, ctx });
    };

    return {
      submit: evalFor('submit'),
      summary: evalFor('summary'),
      edit: evalFor('edit'),
      copyCurrentRecord: evalFor('copyCurrentRecord'),
      create: evalFor('create'),
      home: evalFor('home')
    } as const;
  }, [
    definition,
    guidedUiState,
    lastSubmissionMeta?.createdAt,
    lastSubmissionMeta?.id,
    lastSubmissionMeta?.status,
    lastSubmissionMeta?.updatedAt,
    lineItems,
    selectedRecordId,
    selectedRecordSnapshot?.createdAt,
    selectedRecordSnapshot?.id,
    selectedRecordSnapshot?.status,
    selectedRecordSnapshot?.updatedAt,
    systemActionGates,
    values,
    view
  ]);

  const guidedNextWouldEnable =
    view === 'form' && guidedUiState && !guidedUiState.isFinal ? !!guidedUiState.forwardGateSatisfied && !dedupNavigationBlocked : false;
  const submitDisabledByGate = view === 'form' && guidedNextWouldEnable && systemActionGateState.submit.disabled;
  const submitHiddenByGate = systemActionGateState.submit.hidden;

  const hideEditResolved = (view === 'summary' && isClosedRecord) || systemActionGateState.edit.hidden;
  const summaryEnabledResolved = summaryViewEnabled && !systemActionGateState.summary.hidden;
  const copyEnabledResolved = copyCurrentRecordEnabled && !systemActionGateState.copyCurrentRecord.hidden;
  const canCopyResolved =
    copyEnabledResolved &&
    !systemActionGateState.copyCurrentRecord.disabled &&
    (view === 'form' ? true : Boolean(selectedRecordId || lastSubmissionMeta?.id));

  const actionGateEnableDialogKeyRef = useRef<string>('');
  const prevGuidedNextWouldEnableRef = useRef<boolean>(false);
  useEffect(() => {
    const prev = prevGuidedNextWouldEnableRef.current;
    prevGuidedNextWouldEnableRef.current = guidedNextWouldEnable;
    if (!guidedNextWouldEnable) {
      actionGateEnableDialogKeyRef.current = '';
      return;
    }
    if (prev) return;
    if (!submitDisabledByGate) return;
    const matched = systemActionGateState.submit.matchedRule;
    if (!matched?.dialog) return;
    const trigger = (matched.dialogTrigger || 'onAttempt').toString();
    if (trigger !== 'onEnable') return;
    const key = `submit::${systemActionGateState.submit.matchedRuleId || 'rule'}::${guidedUiState?.activeStepId || ''}`;
    if (actionGateEnableDialogKeyRef.current === key) return;
    actionGateEnableDialogKeyRef.current = key;
    openSystemActionGateDialog({
      actionId: 'submit',
      ruleId: systemActionGateState.submit.matchedRuleId || undefined,
      trigger: 'onEnable',
      title: matched.dialog.title,
      message: matched.dialog.message,
      confirmLabel: matched.dialog.confirmLabel,
      cancelLabel: matched.dialog.cancelLabel,
      showCancel: matched.dialog.showCancel,
      showCloseButton: matched.dialog.showCloseButton,
      dismissOnBackdrop: matched.dialog.dismissOnBackdrop
    });
  }, [
    guidedNextWouldEnable,
    guidedUiState?.activeStepId,
    openSystemActionGateDialog,
    submitDisabledByGate,
    systemActionGateState.submit.matchedRule,
    systemActionGateState.submit.matchedRuleId
  ]);

  return (
    <div
      className={`page${view === 'form' ? ' ck-page-form' : ''}`}
      style={
        isMobile
          ? {
              fontSize: isCompact ? 28 : 36,
              lineHeight: isCompact ? 1.35 : 1.42
            }
          : undefined
      }
    >
      <style>{FORM_VIEW_STYLES}</style>
      <style>{githubMarkdownCss}</style>
      <style>{MARKDOWN_PREVIEW_STYLES}</style>
      <style>{HTML_PREVIEW_STYLES}</style>
      <AppHeader
        title={definition.title || 'Form'}
        titleRight={headerRight}
        logoUrl={definition.appHeader?.logoUrl}
        buildMarker={BUILD_MARKER}
        isMobile={isMobile}
        languages={availableLanguages}
        language={language}
        onLanguageChange={raw => {
          const next = normalizeLanguage(raw);
          if (!allowLanguageSelection) {
            logEvent('i18n.language.changeIgnored', { raw, next, reason: 'languageSelectorDisabled' });
            setLanguage(defaultLanguage);
            return;
          }
          if (!availableLanguages.includes(next as any)) {
            logEvent('i18n.language.changeRejected', { raw, next, availableLanguages });
            setLanguage(defaultLanguage);
            return;
          }
          setLanguage(next);
        }}
        onRefresh={handleGlobalRefresh}
        onDiagnostic={logEvent}
      />

      {blockLandscape ? (
        <div
          className="ck-orientation-blocker"
          role="dialog"
          aria-modal="true"
          aria-label={tSystem('app.rotatePortraitTitle', language, 'Rotate your device')}
        >
          <div className="ck-orientation-blocker__card">
            <div className="ck-orientation-blocker__title">
              {tSystem('app.rotatePortraitTitle', language, 'Rotate your device')}
            </div>
            <div className="ck-orientation-blocker__body">
              {tSystem('app.rotatePortraitBody', language, 'This form works best in portrait mode. Please rotate back.')}
            </div>
          </div>
        </div>
      ) : null}

      <ActionBar
        position="top"
        language={language}
        view={view}
        disabled={submitting || updateRecordBusyOpen || Boolean(recordLoadingId) || Boolean(recordStale) || precreateDedupChecking}
        submitDisabled={view === 'form' && (dedupNavigationBlocked || orderedSubmitDisabled || submitDisabledByGate)}
        submitDisabledTooltip={submitDisabledTooltip || undefined}
        submitting={submitting}
        readOnly={view === 'form' && isClosedRecord}
        hideSubmit={submitHiddenByGate}
        hideEdit={hideEditResolved}
        createNewEnabled={definition.createNewRecordEnabled !== false}
        createButtonLabel={definition.createButtonLabel}
        copyCurrentRecordLabel={definition.copyCurrentRecordLabel}
        submitLabel={guidedSubmitLabel}
        summaryLabel={definition.summaryButtonLabel}
        summaryEnabled={summaryEnabledResolved}
        copyEnabled={copyEnabledResolved}
        canCopy={canCopyResolved}
        customButtons={customButtons as any}
        actionBars={definition.actionBars}
        notice={topBarNotice}
        onHome={handleGoHome}
        onCreateNew={handleSubmitAnother}
        onCreateCopy={handleDuplicateCurrent}
        onEdit={() => setView('form')}
        onSummary={handleGoSummary}
        onSubmit={view === 'summary' ? handleSummarySubmit : requestSubmit}
        onCustomButton={handleCustomButton}
        onDiagnostic={logEvent}
      />

      {view === 'form' ? (
        <FormView
          definition={definition}
          dedupKeyFieldIdMap={dedupKeyFieldIdMap}
          language={language}
          values={values}
          setValues={setValues}
          lineItems={lineItems}
          setLineItems={setLineItems}
          onSubmit={handleSubmit}
          submitActionRef={formSubmitActionRef}
          guidedBackActionRef={formBackActionRef}
          navigateToFieldRef={formNavigateToFieldRef}
          submitting={submitting || updateRecordBusyOpen || isClosedRecord || Boolean(recordLoadingId) || Boolean(recordStale)}
          errors={errors}
          setErrors={setErrors}
          status={status}
          statusTone={statusLevel}
          recordMeta={{
            id: (currentRecord?.id || lastSubmissionMeta?.id || selectedRecordId || undefined) as any,
            createdAt: (currentRecord?.createdAt || lastSubmissionMeta?.createdAt || undefined) as any,
            updatedAt: (currentRecord?.updatedAt || lastSubmissionMeta?.updatedAt || undefined) as any,
            status: (currentRecord?.status || lastSubmissionMeta?.status || null) as any,
            pdfUrl: (currentRecord?.pdfUrl || undefined) as any
          }}
          warningTop={validationWarnings.top}
          warningByField={validationWarnings.byField}
          showWarningsBanner={false}
          onStatusClear={clearStatus}
          optionState={optionState}
          setOptionState={setOptionState}
          ensureOptions={ensureOptions}
          ensureLineOptions={ensureLineOptions}
          externalScrollAnchor={externalScrollAnchor}
          onExternalScrollConsumed={() => setExternalScrollAnchor(null)}
          onSelectionEffect={runSelectionEffects}
          onUploadFiles={uploadFieldUrls}
          onReportButton={handleCustomButton}
          reportBusy={reportOverlay.pdfPhase === 'rendering'}
          reportBusyId={reportOverlay.buttonId || null}
          onUserEdit={handleUserEdit}
          onDiagnostic={logEvent}
          onFormValidityChange={setFormIsValid}
          onGuidedUiChange={setGuidedUiState}
          dedupNavigationBlocked={dedupNavigationBlocked}
          guidedForwardNavigationBlocked={submitDisabledByGate}
          openConfirmDialog={customConfirm.openConfirm}
          setAutoSaveHold={setAutoSaveHoldFromUi}
          summarySubmitIntentRef={summarySubmitIntentRef}
        />
      ) : null}

      {view === 'summary' && (
        <SummaryView
          definition={definition}
          formKey={formKey}
          language={language}
          values={values}
          lineItems={lineItems}
          lastSubmissionMeta={lastSubmissionMeta}
          recordLoadError={recordLoadError}
          selectedRecordId={selectedRecordId}
          recordLoadingId={recordLoadingId}
          currentRecord={currentRecord}
          onOpenFiles={openReadOnlyFilesOverlay}
          onAction={handleCustomButton}
          onDiagnostic={logEvent}
        />
      )}
      {view === 'list' && (
        <ListView
          formKey={formKey}
          definition={definition}
          language={language}
          disabled={precreateDedupChecking}
          cachedResponse={listCache.response}
          cachedRecords={listCache.records}
          refreshToken={listRefreshToken}
          onDiagnostic={logEvent}
          autoFetch={false}
          loading={listFetch.phase === 'loading'}
          prefetching={listFetch.phase === 'prefetching'}
          notice={listFetchNotice}
          error={listFetch.phase === 'error' ? (listFetch.message || 'Failed to load list.') : null}
          onSelect={handleRecordSelect}
        />
      )}

      <ConfirmDialogOverlay
        open={(view === 'form' || view === 'summary') && Boolean(recordStale)}
        title={tSystem('record.stale.title', language, 'Refresh to continue')}
        message={
          (recordStale?.message ||
            tSystem(
              'record.stale',
              language,
              'This record was updated by another user or automatically by the system, tap Refresh to continue.'
            )) as any
        }
        confirmLabel={tSystem('record.refresh.short', language, 'Refresh')}
        cancelLabel={tSystem('common.cancel', language, 'Cancel')}
        showCancel={false}
        dismissOnBackdrop={false}
        showCloseButton={false}
        zIndex={12060}
        onCancel={() => undefined}
        onConfirm={refreshStaleRecord}
      />

      <ConfirmDialogOverlay
        open={autoSaveNoticeOpen && view === 'form'}
        title={autoSaveNoticeTitle}
        message={autoSaveNoticeMessage}
        confirmLabel={autoSaveNoticeConfirmLabel}
        cancelLabel={autoSaveNoticeCancelLabel}
        showCancel={false}
        zIndex={12010}
        onCancel={() => dismissAutoSaveNotice('cancel')}
        onConfirm={() => dismissAutoSaveNotice('confirm')}
      />

      <FieldChangeDialogOverlay
        open={fieldChangeDialog.state.open}
        busy={fieldChangeDialog.state.busy}
        title={fieldChangeDialog.state.title || tSystem('common.confirm', language, 'Confirm')}
        message={fieldChangeDialog.state.message || ''}
        confirmLabel={fieldChangeDialog.state.confirmLabel || tSystem('common.confirm', language, 'Confirm')}
        cancelLabel={fieldChangeDialog.state.cancelLabel || tSystem('common.cancel', language, 'Cancel')}
        primaryAction={fieldChangeActiveRef.current?.dialog?.primaryAction === 'cancel' ? 'cancel' : 'confirm'}
        inputs={fieldChangeDialog.state.inputs}
        values={fieldChangeDialog.state.values}
        onValueChange={fieldChangeDialog.setInputValue}
        onCancel={fieldChangeDialog.cancel}
        onConfirm={fieldChangeDialog.confirm}
        zIndex={12015}
      />

      <ConfirmDialogOverlay
        open={view === 'form' && !!dedupDialogConflict}
        title={dedupDialogCopy.title}
        message={dedupDialogMessage}
        confirmLabel={dedupDialogCopy.openLabel}
        cancelLabel={dedupDialogCopy.changeLabel}
        dismissOnBackdrop={false}
        showCloseButton={false}
        zIndex={12018}
        onCancel={handleDedupChangeFields}
        onConfirm={handleDedupOpenExisting}
      />

      <ConfirmDialogOverlay
        open={view === 'list' && !!listDedupPrompt}
        title={dedupDialogCopy.title}
        message={listDedupDialogMessage}
        confirmLabel={dedupDialogCopy.openLabel}
        cancelLabel={dedupDialogCopy.cancelLabel}
        dismissOnBackdrop={false}
        showCloseButton={false}
        zIndex={12020}
        onCancel={handleListDedupDialogCancel}
        onConfirm={handleListDedupDialogConfirm}
      />

      <ConfirmDialogOverlay
        open={submitConfirmOpen && (view === 'form' || view === 'summary')}
        title={submitConfirmTitle}
        message={submitConfirmMessage}
        confirmLabel={submitConfirmConfirmLabelResolved}
        cancelLabel={submitConfirmCancelLabelResolved}
        zIndex={12000}
        onCancel={cancelSubmitConfirm}
        onConfirm={confirmSubmit}
      />

      <ConfirmDialogOverlay
        open={systemActionGateDialog.open}
        title={systemActionGateDialog.title || tSystem('common.notice', language, 'Notice')}
        message={systemActionGateDialog.message || ''}
        confirmLabel={systemActionGateDialog.confirmLabel || tSystem('common.ok', language, 'OK')}
        cancelLabel={systemActionGateDialog.cancelLabel || tSystem('common.cancel', language, 'Cancel')}
        showCancel={systemActionGateDialog.showCancel}
        dismissOnBackdrop={systemActionGateDialog.dismissOnBackdrop}
        showCloseButton={systemActionGateDialog.showCloseButton}
        zIndex={12012}
        onCancel={() => {
          logEvent('ui.systemActionGate.dialog.cancel', {
            actionId: systemActionGateDialog.actionId,
            ruleId: systemActionGateDialog.ruleId,
            trigger: systemActionGateDialog.trigger
          });
          closeSystemActionGateDialog();
        }}
        onConfirm={() => {
          logEvent('ui.systemActionGate.dialog.confirm', {
            actionId: systemActionGateDialog.actionId,
            ruleId: systemActionGateDialog.ruleId,
            trigger: systemActionGateDialog.trigger
          });
          closeSystemActionGateDialog();
        }}
      />

      <ConfirmDialogOverlay
        open={copyCurrentRecordDialog.open}
        title={copyCurrentRecordDialog.title || tSystem('common.notice', language, 'Notice')}
        message={copyCurrentRecordDialog.message || ''}
        confirmLabel={copyCurrentRecordDialog.confirmLabel || tSystem('common.ok', language, 'OK')}
        cancelLabel={copyCurrentRecordDialog.cancelLabel || tSystem('common.cancel', language, 'Cancel')}
        showCancel={copyCurrentRecordDialog.showCancel}
        dismissOnBackdrop={copyCurrentRecordDialog.dismissOnBackdrop}
        showCloseButton={copyCurrentRecordDialog.showCloseButton}
        zIndex={12013}
        onCancel={() => {
          logEvent('ui.copyCurrent.dialog.cancel');
          closeCopyCurrentRecordDialog();
        }}
        onConfirm={() => {
          logEvent('ui.copyCurrent.dialog.confirm');
          closeCopyCurrentRecordDialog();
        }}
      />

      <BlockingOverlay
        open={submitting}
        title={tSystem('actions.submitting', language, 'Submitting…')}
        message={(status || '').toString() || tSystem('actions.submitting', language, 'Submitting…')}
        zIndex={12040}
      />

      <BlockingOverlay
        open={destructiveChangeBusy.state.open}
        title={destructiveChangeBusy.state.title || tSystem('common.loading', language, 'Loading…')}
        message={destructiveChangeBusy.state.message || tSystem('navigation.waitSaving', language, 'Please wait while we save your changes...')}
        zIndex={12045}
      />

      <ConfirmDialogOverlay
        open={customConfirm.state.open}
        title={customConfirm.state.title}
        message={customConfirm.state.message || ''}
        confirmLabel={customConfirm.state.confirmLabel || tSystem('common.confirm', language, 'Confirm')}
        cancelLabel={customConfirm.state.cancelLabel || tSystem('common.cancel', language, 'Cancel')}
        primaryAction={customConfirm.state.primaryAction}
        showCancel={customConfirm.state.showCancel}
        showConfirm={customConfirm.state.showConfirm}
        dismissOnBackdrop={customConfirm.state.dismissOnBackdrop}
        showCloseButton={customConfirm.state.showCloseButton}
        onCancel={customConfirm.cancel}
        onConfirm={customConfirm.confirm}
      />

      <BlockingOverlay
        open={updateRecordBusy.state.open}
        title={updateRecordBusy.state.title || tSystem('common.loading', language, 'Loading…')}
        message={updateRecordBusy.state.message || tSystem('draft.savingShort', language, 'Saving…')}
      />

      <BlockingOverlay
        open={navigateHomeBusy.state.open}
        title={navigateHomeBusy.state.title || tSystem('draft.savingShort', language, 'Saving…')}
        message={navigateHomeBusy.state.message || tSystem('navigation.waitSaving', language, 'Please wait while we save your changes...')}
        zIndex={12050}
      />

      <ReportOverlay
        language={language}
        state={reportOverlay}
        onClose={closeReportOverlay}
        onOpenFiles={openReadOnlyFilesOverlay}
        onDiagnostic={logEvent}
      />

      <FileOverlay
        open={readOnlyFilesOverlay.open}
        language={language}
        title={readOnlyFilesOverlay.title || tSystem('files.title', language, 'Photos')}
        zIndex={10040}
        submitting={submitting}
        readOnly={true}
        items={readOnlyFilesOverlay.items}
        uploadConfig={readOnlyFilesOverlay.uploadConfig}
        onAdd={() => undefined}
        onClearAll={() => undefined}
        onRemoveAt={() => undefined}
        onClose={closeReadOnlyFilesOverlay}
      />

      <ActionBar
        position="bottom"
        language={language}
        view={view}
        disabled={submitting || updateRecordBusyOpen || Boolean(recordLoadingId) || Boolean(recordStale) || precreateDedupChecking}
        submitDisabled={view === 'form' && (dedupNavigationBlocked || orderedSubmitDisabled || submitDisabledByGate)}
        submitDisabledTooltip={submitDisabledTooltip || undefined}
        submitting={submitting}
        readOnly={view === 'form' && isClosedRecord}
        hideSubmit={submitHiddenByGate}
        hideEdit={hideEditResolved}
        createNewEnabled={definition.createNewRecordEnabled !== false}
        createButtonLabel={definition.createButtonLabel}
        copyCurrentRecordLabel={definition.copyCurrentRecordLabel}
        submitLabel={guidedSubmitLabel}
        summaryLabel={definition.summaryButtonLabel}
        summaryEnabled={summaryEnabledResolved}
        copyEnabled={copyEnabledResolved}
        canCopy={canCopyResolved}
        customButtons={customButtons as any}
        actionBars={definition.actionBars}
        notice={bottomBarNotice}
        showBackButton={showGuidedBack}
        backLabel={guidedBackLabel}
        backDisabled={guidedBackDisabled}
        onBack={() => formBackActionRef.current?.()}
        onHome={handleGoHome}
        onCreateNew={handleSubmitAnother}
        onCreateCopy={handleDuplicateCurrent}
        onEdit={() => setView('form')}
        onSummary={handleGoSummary}
        onSubmit={view === 'summary' ? handleSummarySubmit : requestSubmit}
        onCustomButton={handleCustomButton}
        onDiagnostic={logEvent}
      />
    </div>
  );
};

export default App;
