import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getOptionStateValue,
  loadOptionsFromDataSource,
  mergeOptionStateValue,
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
  StepMilestoneActionConfig,
  SystemActionGateDialogConfig,
  WebFormDefinition,
  WebQuestionDefinition,
  WebFormSubmission
} from '../types';
import type {
  InventoryAvailabilitySnapshot,
  InventoryReservationPlanRequest,
  InventoryReservationPlanScope
} from '../../types';
import {
  BootstrapContext,
  applyInventoryReservationPlanApi,
  submit,
  previewUpdateRecordDependenciesApi,
  applyUpdateRecordWithDependenciesApi,
  checkDedupConflictApi,
  triggerFollowupBatch,
  uploadFilesApi,
  prefetchTemplatesApi,
  renderDocTemplatePdfPreviewApi,
  renderMarkdownTemplateApi,
  renderHtmlTemplateApi,
  clearHtmlRenderClientCache,
  invalidateClientSharedDataCaches,
  consumePrefetchedHomeBootstrapApi,
  fetchBootstrapContextApi,
  fetchHomeBootstrapApi,
  fetchSummaryRecordApi,
  fetchSortedBatch,
  FollowupBatchResponse,
  ListSort,
  ListResponse,
  ListItem,
  fetchRecordById,
  fetchRecordByRowNumber,
  fetchRecordsByRowNumbers,
  getRecordVersionApi,
  seedSummaryHtmlTemplateCache,
  resolveUserFacingErrorMessage
} from './api';
import FormView from './components/FormView';
import ListView from './components/ListView';
import { AppHeader } from './components/app/AppHeader';
import { ActionBar } from './components/app/ActionBar';
import { ValidationHeaderNotice } from './components/app/ValidationHeaderNotice';
import { ReportOverlay, ReportOverlayState } from './components/app/ReportOverlay';
import { SummaryView } from './components/app/SummaryView';
import { ListViewLegend } from './components/app/ListViewLegend';
import { AnalyticsOverlay } from './components/app/AnalyticsOverlay';
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
  chainSerializedSubmissionRequest,
  collectValidationWarnings,
  computeUrlOnlyUploadUpdates,
  isSubmissionStaleMessage,
  prepareClientDataVersionDispatch,
  resolveFollowupActionResultMeta,
  resolveReservationPlanSourceMetaAdoption,
  resolveExistingRecordId,
  resolveCurrentClientDataVersion,
  settleClientDataVersionAfterDispatch,
  shouldAdoptIncomingRecordSnapshotMetaOnly,
  shouldApplyIncomingRecordSnapshot,
  validateForm
} from './app/submission';
import { buildValidationContext } from './app/validation';
import { clearBundledHtmlClientCaches, isBundledHtmlTemplateId } from './app/bundledHtmlClientRenderer';
import { shouldShowRecordLoadingPlaceholder } from './app/recordOpenState';
import { resolveUiRecordStatus } from './app/recordMeta';
import {
  resolveDeferredRecordFreshnessResumeAction,
  resolveRecordFreshnessConfig,
  resolveRecordFreshnessSyncBlockers,
  resolveRecordFreshnessTimerDelay
} from './app/recordFreshness';
import {
  buildDataSourceFreshnessSnapshotSignature,
  resolveActiveDataSourceFreshnessWatches,
  resolveDataSourceFreshnessSignatureFieldIds,
  resolveDataSourceFreshnessTimerDelay,
  resolveDataSourceFreshnessWatches
} from './app/dataSourceFreshness';
import {
  shouldArmAutoSaveHoldForReportAction,
  shouldHoldAutoSaveForReportOverlay
} from './app/reportPreviewAutosave';
import { resolveTemplateIdForRecord } from './app/templateId';
import { runSelectionEffects as runSelectionEffectsHelper } from './app/selectionEffects';
import { runSelectionEffectsForAncestors } from './app/runSelectionEffectsForAncestors';
import { detectDebug } from './app/utils';
import { isPerfInstrumentationEnv } from './perfInstrumentation';
import { collectListViewRuleColumnDependencies } from './app/listViewRuleColumns';
import { collectListViewMetricDependencies } from './app/listViewMetric';
import { hasIncompleteRejectDedupKeys } from './app/dedupKeyUtils';
import {
  resolveDedupIncompleteHomeDialogConfig,
  resolveDedupIncompleteHomeDialogCopy
} from './app/dedupIncompleteHomeDialog';
import {
  applyFieldChangeDialogTargets,
  resolveFieldChangeDialogConfirmUpdates,
  evaluateFieldChangeDialogWhen,
  evaluateFieldChangeDialogWhenWithFallback,
  finalizeInitialDateChangeDialogEntry,
  resolveFieldChangeDialogCancelAction,
  resolveFieldChangeDialogSource,
  resolveTargetFieldConfig,
  shouldDeferFieldChangeMutation,
  shouldSuppressInitialDateChangeDialog,
  type FieldChangeDialogTargetUpdate
} from './app/fieldChangeDialog';
import {
  buildInitialLineItems,
  buildSubgroupKey,
  cascadeRemoveLineItemRows,
  clearAutoIncrementFields,
  parseSubgroupKey,
  parseRowNonMatchOptions,
  resolveSubgroupKey,
  ROW_ID_KEY,
  ROW_NON_MATCH_OPTIONS_KEY
} from './app/lineItems';
import { normalizeRecordValues } from './app/records';
import { applyValueMapsToForm, coerceDefaultValue } from './app/valueMaps';
import { applyClearOnChange, isClearOnChangeEnabled } from './app/clearOnChange';
import { reconcileAutoAddModeGroups } from './app/autoAddModeOverlay';
import { buildFilePayload } from './app/filePayload';
import { buildListViewLegendItems } from './app/listViewLegend';
import { buildDraftSaveFingerprint, buildDraftStateFingerprint } from './app/draftSaveFingerprint';
import { shouldSkipGuidedStepBackgroundSync } from './app/guidedStepBackgroundSync';
import { aggregateContiguousPrefetchedPageItems, aggregatePrefetchedPageItems } from './app/listPrefetch';
import { removeListCacheRowPure, upsertListCacheRowPure } from './app/listCache';
import { resolveDedupDialogCopy } from './app/dedupDialog';
import { buildSystemActionGateContext, evaluateSystemActionGate } from './app/actionGates';
import { type GuidedStepsVirtualState } from './features/steps/domain/resolveVirtualStepField';
import {
  filterGeneratedRecordsForDialog,
  getGeneratedRecordsFromFollowupResult,
  renderGeneratedRecordLine,
  selectConditionalDialog,
  selectMilestoneConfirmationDialog
} from './features/steps/domain/milestoneDialogs';
import { runWithConcurrencyLimit } from './utils/runWithConcurrencyLimit';
import { applyCopyCurrentRecordDropFields, applyCopyCurrentRecordProfile } from './app/copyProfile';
import { resolveCopyCurrentRecordDialog } from './app/copyCurrentRecordDialog';
import { buildLandingUrl, navigateToTopLevel, resolveAdminEnabled, resolveServiceUrl } from './app/headerNavigation';
import { buildReservationReconciliationFeedback } from './app/reservationReconciliationFeedback';
import {
  buildInventoryReservationPlanFingerprint,
  buildStepInventoryReservationPlan
} from './features/reservations/stepReservationPlan';
import {
  GUIDED_STEP_RESERVATION_AVAILABILITY_EVENT,
  type GuidedStepReservationAvailabilityEventDetail
} from './features/reservations/liveSyncEvents';
import { applyInventoryAvailabilitySnapshotsToCachedDataSources } from './features/reservations/availabilityCache';
import {
  buildFieldIdMap,
  filterDedupRulesForPrecheck,
  hasEnteredLineItemValues,
  hasEnteredTopLevelValues,
  hasIncompleteConfiguredFields,
  normalizeFieldIdList,
  resolveDebouncedAutoSaveDelay,
  resolveDedupCheckDialogCopy,
  shouldSuppressAutomatedAutoSave,
  shouldRetainPendingDebouncedAutoSave,
  shouldForceAutoSaveOnConfiguredBlur
} from './app/autoSaveDedup';
import { resolveReadyForProductionUnlockStatus, resolveUnlockRecordId } from './app/readyForProductionLock';
import {
  applyIngredientActivationSystemFields,
  getIngredientNameValidationMessage,
  isIngredientCreateAutoSaveReady,
  isIngredientNameFieldId,
  isIngredientsManagementForm
} from './app/ingredientsCreateRules';
import packageJson from '../../../package.json';
import githubMarkdownCss from 'github-markdown-css/github-markdown-light.css';
import { resolveFieldLabel, resolveLabel } from './utils/labels';
import { EMPTY_DISPLAY, formatDisplayText } from './utils/valueDisplay';
import { SYSTEM_FONT_STACK } from '../../constants/typography';
import { tSystem } from '../systemStrings';
import { resolveLocalizedString } from '../i18n';
import { toUploadItems } from './components/form/utils';
import { buildReservationFailureMessage } from './components/form/reservationSyncPolicy';
import { isEmptyValue } from './utils/values';
import {
  clearFetchDataSourceCache,
  DATA_SOURCE_CACHE_CLEARED_EVENT,
  DATA_SOURCE_CACHE_UPDATED_EVENT,
  fetchDataSource,
  getCachedDataSourceItemCount,
  peekCachedDataSource,
  prefetchDataSources
} from '../data/dataSources';
import { collectDataSourceConfigsForPrefetch, isHomePrefetchEligibleDataSource } from '../data/dataSourcePrefetch';
import { shouldHideField } from '../rules/visibility';
import { getSystemFieldValue } from '../rules/systemFields';
import { computeGuidedStepsStatus } from './features/steps/domain/computeStepStatus';
import { resolveVirtualStepField } from './features/steps/domain/resolveVirtualStepField';
import { filterVisibleGuidedSteps } from './features/steps/domain/stepVisibility';
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

const DATA_SOURCE_COUNT_FIELD_PREFIX = '__ckDataSourceCount.';

const normalizeDataSourceVisibilityKey = (value: string): string =>
  (value || '').toString().trim().toLowerCase().replace(/[^a-z0-9]+/g, '');

const getPerfNow = (): number => {
  try {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
      return performance.now();
    }
  } catch (_) {
    // ignore
  }
  return Date.now();
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
// Remaining list pages are purely background enrichment for the home list.
// Delay them so they do not compete with more valuable boot work such as
// analytics, data source warmup, and first-record snapshot hydration.
const HOME_LIST_BACKGROUND_PREFETCH_DELAY_MS = 9000;
const HOME_DATA_SOURCE_PREFETCH_DELAY_MS = 2200;
const HOME_RECORD_PREFETCH_DELAY_MS = 2400;
const HOME_ANALYTICS_PREFETCH_DELAY_MS = 1400;
const RETRYABLE_AUTOSAVE_DELAYS_MS = [1500, 3000, 5000];

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

const pruneHomeListLocalCacheFamily = (storage: Storage, key: string): void => {
  if (!key || !key.startsWith(`${HOME_LIST_LOCAL_CACHE_PREFIX}::`)) return;
  const separatorIndex = key.indexOf('::', HOME_LIST_LOCAL_CACHE_PREFIX.length + 2);
  if (separatorIndex < 0) return;
  const familySuffix = key.slice(separatorIndex);
  const keysToRemove: string[] = [];
  for (let i = 0; i < storage.length; i += 1) {
    const candidate = storage.key(i);
    if (!candidate || candidate === key) continue;
    if (!candidate.startsWith(`${HOME_LIST_LOCAL_CACHE_PREFIX}::`)) continue;
    if (!candidate.endsWith(familySuffix)) continue;
    keysToRemove.push(candidate);
  }
  keysToRemove.forEach(candidate => {
    try {
      storage.removeItem(candidate);
    } catch {
      // ignore
    }
  });
};

const readHomeListLocalCache = (key: string): HomeListLocalCacheEntry | null => {
  if (!key) return null;
  const storage = resolveLocalStorageSafely();
  if (!storage) return null;
  try {
    pruneHomeListLocalCacheFamily(storage, key);
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
  } catch {
    try {
      storage.removeItem(key);
    } catch {
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
    pruneHomeListLocalCacheFamily(storage, key);
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

const clearHomeListLocalCache = (key: string): void => {
  if (!key) return;
  const storage = resolveLocalStorageSafely();
  if (!storage) return;
  try {
    pruneHomeListLocalCacheFamily(storage, key);
    storage.removeItem(key);
  } catch (_) {
    // ignore storage errors
  }
};

const App: React.FC<BootstrapContext> = ({ definition, formKey, record, analytics, analyticsRev, envTag }) => {
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
  const ingredientsFormActive = isIngredientsManagementForm(formKey);
  const ingredientCreateAutoSaveReady = ingredientsFormActive ? isIngredientCreateAutoSaveReady(values as any) : true;
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
  const templatePrefetchDoneFormKeyRef = useRef<string | null>(null);
  const templatePrefetchInFlightFormKeyRef = useRef<string | null>(null);
  const templatePrefetchRetryCountRef = useRef<Record<string, number>>({});
  const [homeFirstDataReadyAtMs, setHomeFirstDataReadyAtMs] = useState<number>(0);
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
  type DedupProgressState = {
    open: boolean;
    phase: 'checking' | 'available' | 'duplicate';
    title: string;
    message: string;
  };
  const [dedupChecking, setDedupChecking] = useState<boolean>(false);
  const [dedupConflict, setDedupConflict] = useState<DedupConflictInfo | null>(null);
  const [dedupNotice, setDedupNotice] = useState<DedupConflictInfo | null>(null);
  const [dedupProgress, setDedupProgress] = useState<DedupProgressState>({
    open: false,
    phase: 'checking',
    title: '',
    message: ''
  });
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
  const dedupProgressTimerRef = useRef<number | null>(null);
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
  type SynchronizeStaleRecordFn = (args: {
    reason: string;
    recordId: string;
    cachedVersion?: number | null;
    serverVersion?: number | null;
    serverRow?: number | null;
  }) => Promise<boolean>;
  type RecordSyncNoticeState = {
    open: boolean;
    title: string;
    message: string;
  };
  type RecordSnapshotApplyMode = 'ignored' | 'metaOnly' | 'applied';
  const [recordStale, setRecordStale] = useState<RecordStaleInfo | null>(null);
  const [recordSyncNotice, setRecordSyncNotice] = useState<RecordSyncNoticeState>({ open: false, title: '', message: '' });
  const recordStaleRef = useRef<RecordStaleInfo | null>(null);
  const submitPrecheckInFlightRef = useRef<boolean>(false);
  const [submitConfirmOpen, setSubmitConfirmOpen] = useState(false);
  const submitConfirmedRef = useRef(false);
  const submitPipelineInFlightRef = useRef(false);
  const updateRecordActionInFlightRef = useRef(false);
  const ensureDraftRecordIdActionRef = useRef<
    ((args?: { reason?: string; fieldPath?: string }) => Promise<{ success: boolean; recordId?: string; message?: string }>) | null
  >(null);
  const flushPendingDraftSaveActionRef = useRef<((reason: string) => Promise<{ ok: boolean; message?: string }>) | null>(null);
  const [selectedRecordId, setSelectedRecordId] = useState<string>(record?.id || '');
  const [selectedRecordSnapshot, setSelectedRecordSnapshot] = useState<WebFormSubmission | null>(record || null);
  const [prefetchedSummaryHtml, setPrefetchedSummaryHtml] = useState<{ recordId: string; html: string } | null>(null);
  const [recordLoadingId, setRecordLoadingId] = useState<string | null>(null);
  const [recordLoadError, setRecordLoadError] = useState<string | null>(null);
  const [optionState, setOptionState] = useState<OptionState>({});
  const [tooltipState, setTooltipState] = useState<Record<string, Record<string, string>>>({});
  const preloadPromisesRef = useRef<Record<string, Promise<void> | undefined>>({});
  const optionStateRef = useRef<OptionState>({});
  const tooltipStateRef = useRef<Record<string, Record<string, string>>>({});
  const recordFetchSeqRef = useRef(0);
  const lastRecordSnapshotApplyModeRef = useRef<{
    mode: RecordSnapshotApplyMode;
    recordId: string | null;
    dataVersion: number | null;
  }>({
    mode: 'ignored',
    recordId: null,
    dataVersion: null
  });
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
  const [ingredientNameBlurredForAutoSave, setIngredientNameBlurredForAutoSave] = useState<boolean>(false);
  const autoSaveNoticeSeenRef = useRef<boolean>(false);
  const homeLoadStartedAtRef = useRef<number>(getPerfNow());
  const homeTimeToDataMeasuredRef = useRef(false);
  const homePerfInitialisedRef = useRef(false);
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
  const isRetryableRecordBusyMessage = useCallback((value: any): boolean => {
    const message = (value || '').toString().trim().toLowerCase();
    if (!message) return false;
    return (
      message.includes('record save lock') ||
      message.includes('record mutation queue') ||
      message.includes('follow-up queue') ||
      message.includes('another follow-up batch is still running') ||
      message.includes('another record mutation is still running') ||
      message.includes('could not queue follow-up actions') ||
      message.includes('could not queue record mutation') ||
      (message.includes('please retry') && (message.includes('follow-up') || message.includes('record')))
    );
  }, []);
  const perfEnabled = useMemo(() => {
    return isPerfInstrumentationEnv(envTag);
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
        } catch {
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
      } catch {
        return '';
      }
    })();
    const locationHash = (() => {
      try {
        return globalAny?.location?.hash || '';
      } catch {
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
  const autoSaveEnabled = Boolean(definition.autoSave?.enabled);
  const autoSaveEnableFieldIds = useMemo(
    () => normalizeFieldIdList((definition.autoSave as any)?.enableWhenFields ?? (definition.autoSave as any)?.enableFields),
    [definition.autoSave]
  );
  const dedupTriggerFieldIds = useMemo(
    () => normalizeFieldIdList((definition.autoSave as any)?.dedupTriggerFields ?? (definition.autoSave as any)?.dedupFields),
    [definition.autoSave]
  );
  const dedupPrecheckRules = useMemo(
    () => filterDedupRulesForPrecheck((definition as any)?.dedupRules, dedupTriggerFieldIds),
    [definition, dedupTriggerFieldIds]
  );
  const dedupTriggerFieldIdMap = useMemo(
    () =>
      dedupTriggerFieldIds.length ? buildFieldIdMap(dedupTriggerFieldIds) : computeDedupKeyFieldIdMap((definition as any)?.dedupRules),
    [dedupTriggerFieldIds, definition]
  );
  const dedupIdentityFieldIdMap = useMemo(
    () => computeDedupKeyFieldIdMap((definition as any)?.dedupRules),
    [definition]
  );
  const dedupCheckDialogCopy = useMemo(
    () =>
      resolveDedupCheckDialogCopy((definition.autoSave as any)?.dedupCheckDialog, language, {
        checkingTitle: 'Checking duplicates',
        checkingMessage: 'Please wait while the system checks whether this record already exists.',
        availableTitle: 'Value available',
        availableMessage: 'You can continue entering details.',
        duplicateTitle: 'Duplicate found',
        duplicateMessage: tSystem('dedup.duplicate', language, 'Duplicate record.')
      }),
    [definition.autoSave, language]
  );
  const dedupCheckDialogEnabled = dedupTriggerFieldIds.length > 0 && dedupCheckDialogCopy.enabled;

  // Feature overlays (kept out of App.tsx as much as possible; App only wires them).
  const customConfirm = useConfirmDialog({ closeOnKey: view, eventPrefix: 'ui.customConfirm', onDiagnostic: logEvent });
  const fieldChangeDialog = useFieldChangeDialog({ closeOnKey: view, eventPrefix: 'ui.fieldChangeDialog', onDiagnostic: logEvent });
  const updateRecordBusy = useBlockingOverlay({ eventPrefix: 'button.updateRecord.busy', onDiagnostic: logEvent });
  const navigateHomeBusy = useBlockingOverlay({ eventPrefix: 'navigate.home.busy', onDiagnostic: logEvent });
  const copyRecordBusy = useBlockingOverlay({ eventPrefix: 'record.copy.busy', onDiagnostic: logEvent });
  const recordSyncBusy = useBlockingOverlay({ eventPrefix: 'record.sync.busy', onDiagnostic: logEvent });
  const destructiveChangeBusy = useBlockingOverlay({ eventPrefix: 'fieldChange.destructive.busy', onDiagnostic: logEvent });
  const guidedMilestoneBusy = useBlockingOverlay({ eventPrefix: 'guidedStep.milestone.busy', onDiagnostic: logEvent });
  const guidedStepAdvanceBusy = useBlockingOverlay({ eventPrefix: 'guidedStep.advance.busy', onDiagnostic: logEvent });
  const updateRecordBusyOpen = updateRecordBusy.state.open;
  const recordSyncBusyOpen = recordSyncBusy.state.open;

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
    dismissOnBackdrop: false,
    showCloseButton: false,
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
      const showCloseButton = args.showCloseButton === true;
      const dismissOnBackdrop = args.dismissOnBackdrop === true;

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
  const ensureLineOptionsRef = useRef<(groupId: string, field: any) => void>(() => {});
  const fieldChangeDateInitialEntryInProgressRef = useRef<Record<string, boolean>>({});
  const fieldChangeDateInitialEntryCompletedRef = useRef<Record<string, boolean>>({});
  const resetFieldChangeTransientState = useCallback(() => {
    fieldChangePendingRef.current = {};
    fieldChangeActiveRef.current = null;
    fieldChangeDateInitialEntryInProgressRef.current = {};
    fieldChangeDateInitialEntryCompletedRef.current = {};
  }, []);
  const pendingDeletedRecordIdsRef = useRef<string[]>([]);
  const readyForProductionUnlockTransitionAttemptedRef = useRef<Set<string>>(new Set());
  const [pendingDeletedRecordApplyTick, setPendingDeletedRecordApplyTick] = useState(0);

  const resolveOptionGroupKey = useCallback(
    (args: {
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
    },
    []
  );

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

        const res = await submitCurrentRecordMutation('dedupDeleteOnKeyChange.delete', payload);
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
        optimisticClientDataVersionRef.current = null;
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
        const normalizedValues = normalizeRecordValues(definition, valuesRef.current as any);
        const rebuiltLineItems = buildInitialLineItems(definition, normalizedValues);
        const remappedState = applyValueMapsToForm(definition, normalizedValues, rebuiltLineItems, { mode: 'init' });
        const reconciledState = reconcileAutoAddModeGroups({
          definition,
          values: remappedState.values,
          lineItems: remappedState.lineItems,
          optionState: optionStateRef.current,
          language: languageRef.current,
          ensureLineOptions
        });
        const nextRecreatedValues = reconciledState.changed ? reconciledState.values : remappedState.values;
        const nextRecreatedLineItems = reconciledState.changed ? reconciledState.lineItems : remappedState.lineItems;
        valuesRef.current = nextRecreatedValues;
        lineItemsRef.current = nextRecreatedLineItems;
        rememberAutoSaveSeenState(nextRecreatedValues, nextRecreatedLineItems);
        setValues(nextRecreatedValues);
        setLineItems(nextRecreatedLineItems);
        setErrors({});
        setValidationWarnings({ top: [], byField: {} });
        setValidationAttempted(false);
        setValidationNoticeHidden(false);
        try {
          invalidateClientSharedDataCaches({
            includePersistedDataSources: true,
            includeHtmlRenderCache: true
          });
          clearHomeListLocalCache(homeListLocalCacheKey);
          setOptionState({});
          setTooltipState({});
          optionStateRef.current = {};
          tooltipStateRef.current = {};
          preloadPromisesRef.current = {};
          logEvent('cache.client.clear', {
            scope: 'dedupDeleteOnKeyChange',
            recordId: existingRecordId,
            optionsCleared: true
          });
        } catch (cacheErr: any) {
          logEvent('cache.client.clear.error', {
            scope: 'dedupDeleteOnKeyChange',
            recordId: existingRecordId,
            message: cacheErr?.message || cacheErr?.toString?.() || 'unknown'
          });
        }

        logEvent('dedupDeleteOnKeyChange.delete.success', {
          source,
          deletedRecordId: existingRecordId,
          autoAddGroupRebuilds: reconciledState.changedCount,
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
        const confirmUpdates = resolveFieldChangeDialogConfirmUpdates({
          dialog: dialogCfg,
          definition,
          context: { scope: pending.scope, groupId: pending.groupId },
          selectionEffects: (pending.selectionEffects || []).filter(
            (effect): effect is SelectionEffect & { groupId: string } => !!effect?.groupId
          )
        });
        if (confirmUpdates.length) {
          updates.push(...confirmUpdates);
          logEvent('fieldChangeDialog.confirmUpdates.applied', {
            fieldPath: pending.fieldPath,
            fieldId: pending.fieldId,
            updateCount: confirmUpdates.length,
            targets: confirmUpdates.map(update => ({
              scope: update.target.scope,
              fieldId: update.target.fieldId,
              effectId: update.target.effectId || null
            }))
          });
        }

        const sourceQuestion =
          pending.scope === 'top'
            ? definition.questions.find(question => `${question?.id || ''}`.trim() === `${pending.fieldId || ''}`.trim()) || null
            : null;
        const shouldApplyClearOnChange =
          pending.scope === 'top' &&
          isClearOnChangeEnabled((sourceQuestion as any)?.clearOnChange) &&
          !isEmptyValue((valuesRef.current as any)?.[pending.fieldId]) &&
          !isEmptyValue(pending.nextValue) &&
          (valuesRef.current as any)?.[pending.fieldId] !== pending.nextValue;

        let nextBaseValues = valuesRef.current;
        let nextBaseLineItems = lineItemsRef.current;
        let remainingUpdates = updates;

        if (shouldApplyClearOnChange) {
          const cleared = applyClearOnChange({
            definition,
            values: valuesRef.current,
            lineItems: lineItemsRef.current,
            fieldId: pending.fieldId,
            nextValue: pending.nextValue,
            orderedFieldIds: (definition.questions || [])
              .map(question => `${question?.id || ''}`.trim())
              .filter(Boolean)
          });
          const reconciledState = reconcileAutoAddModeGroups({
            definition,
            values: cleared.values,
            lineItems: cleared.lineItems,
            optionState: optionStateRef.current,
            language: languageRef.current,
            ensureLineOptions: ensureLineOptionsRef.current
          });
          nextBaseValues = reconciledState.changed ? reconciledState.values : cleared.values;
          nextBaseLineItems = reconciledState.changed ? reconciledState.lineItems : cleared.lineItems;
          remainingUpdates = updates.slice(1);
          logEvent('fieldChangeDialog.clearOnChange.applied', {
            fieldPath: pending.fieldPath,
            fieldId: pending.fieldId,
            clearedFieldCount: cleared.clearedFieldIds.length,
            clearedGroupCount: cleared.clearedGroupKeys.length,
            autoAddGroupRebuilds: reconciledState.changedCount
          });
        }

        const applied = applyFieldChangeDialogTargets({
          values: nextBaseValues,
          lineItems: nextBaseLineItems,
          updates: remainingUpdates,
          context: { scope: pending.scope, groupId: pending.groupId, rowId: pending.rowId }
        });
        const mapped = applyValueMapsToForm(definition, applied.values, applied.lineItems, { mode: 'change' });
        const dedupDeleteEnabled =
          (definition as any)?.dedupDeleteOnKeyChange === true || (definition as any)?.dedupRecreateOnKeyChange === true;
        const topFieldId = pending.scope === 'top' ? (pending.fieldId || '').toString() : '';
        const isTopDedupKeyChange = Boolean(
          topFieldId &&
            (dedupIdentityFieldIdsRef.current[topFieldId] || dedupIdentityFieldIdsRef.current[topFieldId.toLowerCase()]) &&
            dedupDeleteEnabled
        );

        const dedupMode = (dialogCfg.dedupMode || 'auto') as 'auto' | 'always' | 'never';
        const hasDedupKeyUpdate = updates.some(update => {
          if (update.target.scope !== 'top') return false;
          const fid = (update.target.fieldId || '').toString();
          if (!fid) return false;
          return Boolean(dedupTriggerFieldIdsRef.current[fid] || dedupTriggerFieldIdsRef.current[fid.toLowerCase()]);
        });
        const shouldRunFieldDedup =
          !isTopDedupKeyChange && (dedupMode === 'always' || (dedupMode === 'auto' && hasDedupKeyUpdate));

        if (shouldRunFieldDedup) {
          const signature = computeDedupSignatureFromValues(dedupPrecheckRules, mapped.values as any);
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
        } else if (isTopDedupKeyChange && hasDedupKeyUpdate) {
          logEvent('dedup.fieldChange.check.skipped', {
            source: 'fieldChangeDialog',
            fieldId: pending.fieldId,
            reason: 'dedupDeleteOnKeyChange'
          });
        }

        setValues(mapped.values);
        setLineItems(mapped.lineItems);
        valuesRef.current = mapped.values;
        lineItemsRef.current = mapped.lineItems;
        const updatedTopFieldIds = Array.from(
          new Set(
            updates
              .filter(update => update.target.scope === 'top')
              .map(update => (update.target.fieldId || '').toString().trim())
              .filter(Boolean)
          )
        );

        if (shouldApplyClearOnChange) {
          setErrors({});
        } else {
          setErrors(prev => {
            const next = { ...(prev || {}) };
            delete next[pending.fieldPath];
            delete next[pending.fieldId];
            updatedTopFieldIds.forEach(fieldId => {
              delete next[fieldId];
            });
            return next;
          });
        }
        dedupHoldRef.current = isTopDedupKeyChange;
        if (isTopDedupKeyChange) {
          autoSaveDirtyRef.current = false;
          autoSaveQueuedRef.current = false;
          setDraftSave({ phase: 'paused' });
        } else {
          autoSaveDirtyRef.current = true;
          if (pending.fieldPath) uploadedFieldValueOverridesRef.current.delete(pending.fieldPath);
          updatedTopFieldIds.forEach(fieldId => {
            uploadedFieldValueOverridesRef.current.delete(fieldId);
          });
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
          rowId: pending.rowId || null,
          confirmUpdateCount: confirmUpdates.length
        });
      } finally {
        destructiveChangeBusy.unlock(lockSeq, { source: 'fieldChangeDialog' });
      }
    },
    [
      dedupPrecheckRules,
      definition,
      destructiveChangeBusy,
      formKey,
      language,
      logEvent,
      revertFieldChangePending,
      setExternalScrollAnchor,
      setLineItems,
      setValues,
      triggerDedupDeleteOnKeyChange,
      setErrors
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
    }): { deferMutation?: boolean } | void => {
      try {
        pendingAutomatedAutoSaveSourceRef.current = '';
        const fieldPath = (args?.fieldPath || '').toString();
        const fieldId = (args?.fieldId || '').toString();
        const fieldKey = fieldPath || fieldId;
        const autoSaveDirtyBefore = autoSaveDirtyRef.current;
        const autoSaveQueuedBefore = autoSaveQueuedRef.current;
        if (prefetchedSummaryHtml) {
          setPrefetchedSummaryHtml(null);
        }
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
        const editAt = Date.now();
        lastUserInteractionRef.current = editAt;
        lastLocalRecordMutationAtRef.current = editAt;

        // Mark dirty immediately on user edits so navigation handlers can flush autosave
        // even if the debounced autosave effect hasn't run yet.
        autoSaveDirtyRef.current = true;

        // For top-level dedup trigger fields: hold autosave while dedup precheck settles.
        const isDedupTriggerKey =
          (fieldId && dedupTriggerFieldIdsRef.current[fieldId]) || (fieldPath && dedupTriggerFieldIdsRef.current[fieldPath]);
        const isDedupIdentityKey =
          (fieldId && dedupIdentityFieldIdsRef.current[fieldId]) || (fieldPath && dedupIdentityFieldIdsRef.current[fieldPath]);

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
              if (
                shouldDeferFieldChangeMutation({
                  dialog: dialogCfg,
                  fieldType: changeType,
                  shouldTrigger,
                  prevValue: prevValue as FieldValue,
                  nextValue: args.nextValue as FieldValue,
                  suppressInitialDateDialog
                })
              ) {
                logEvent('fieldChangeDialog.mutation.deferred', {
                  fieldPath: fieldKey,
                  fieldId,
                  groupId: args.groupId || null,
                  rowId: args.rowId || null,
                  fieldType: changeType
                });
                openFieldChangeDialog(pending);
                return { deferMutation: true };
              }
            } else if (fieldChangePendingRef.current[fieldKey]) {
              delete fieldChangePendingRef.current[fieldKey];
              logEvent('fieldChangeDialog.pending.cleared', { fieldPath: fieldKey, fieldId });
            }
          } else if (fieldChangePendingRef.current[fieldKey]) {
            delete fieldChangePendingRef.current[fieldKey];
          }
        }

        const isTopIngredientNameField =
          ingredientsFormActive && args?.scope === 'top' && isIngredientNameFieldId(fieldId || fieldKey);

        if (isTopIngredientNameField && args?.event === 'change') {
          setIngredientNameBlurredForAutoSave(false);
        }

        if (args?.event === 'blur' && fieldKey) {
          if (isTopIngredientNameField) {
            setIngredientNameBlurredForAutoSave(true);
            const nextMessage = getIngredientNameValidationMessage((valuesRef.current as any)?.INGREDIENT_NAME);
            setErrors(prev => {
              const current = (prev || {})[fieldKey];
              if (!nextMessage && !current) return prev;
              if (nextMessage === current) return prev;
              const next = { ...(prev || {}) };
              if (nextMessage) next[fieldKey] = nextMessage;
              else delete next[fieldKey];
              return next;
            });
            if (nextMessage) {
              logEvent('validation.ingredients.name.invalid', { message: nextMessage });
            }
          }

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

        if (args?.scope === 'top' && (isDedupTriggerKey || isDedupIdentityKey)) {
          if (isDedupTriggerKey) {
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
          }
          if (args?.event === 'blur' && isDedupIdentityKey) {
            void triggerDedupDeleteOnKeyChange('dedupKey.blur', {
              fieldId: fieldId || null,
              fieldPath: fieldPath || null
            });
          }
        }

        if (args?.scope === 'top' && args?.event === 'blur') {
          const shouldForceAutoSave = shouldForceAutoSaveOnConfiguredBlur({
            autoSaveEnabled,
            isCreateFlow: createFlowRef.current,
            scope: args.scope,
            event: args.event,
            fieldPath,
            fieldId,
            enableWhenFieldIds: autoSaveEnableFieldIds,
            values: valuesRef.current as any,
            dedupSignature: (dedupSignatureRef.current || '').toString(),
            lastDedupCheckedSignature: (lastDedupCheckedSignatureRef.current || '').toString(),
            dedupChecking: dedupCheckingRef.current,
            dedupConflict: Boolean(dedupConflictRef.current),
            dedupHold: dedupHoldRef.current
          });

          if (shouldForceAutoSave) {
            // Release stale dedup hold before forcing immediate save.
            dedupHoldRef.current = false;
            if (autoSaveTimerRef.current) {
              globalThis.clearTimeout(autoSaveTimerRef.current);
              autoSaveTimerRef.current = null;
            }
            autoSaveDirtyRef.current = true;
            setDraftSave(prev => (prev.phase === 'saving' || prev.phase === 'dirty' ? prev : { phase: 'dirty' }));
            logEvent('autosave.trigger.configuredBlur', {
              fieldId: fieldId || null,
              fieldPath: fieldPath || null
            });
            void performAutoSaveRef.current('configuredFields.blurReady');
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
      } catch {
        // ignore
      }
    },
    [
      dedupNotice,
      definition,
      autoSaveEnabled,
      autoSaveEnableFieldIds,
      ingredientsFormActive,
      logEvent,
      openFieldChangeDialog,
      prefetchedSummaryHtml,
      setErrors,
      triggerDedupDeleteOnKeyChange
    ]
  );

  const handleAutomatedMutation = useCallback(
    (args: {
      scope: 'line';
      fieldPath: string;
      fieldId?: string;
      groupId?: string;
      rowId?: string;
      source: 'selectionEffectInit';
      nextValue?: FieldValue;
    }) => {
      pendingAutomatedAutoSaveSourceRef.current = (args.source || '').toString();
      logEvent('autosave.automatedMutation', {
        source: args.source,
        fieldPath: args.fieldPath || null,
        fieldId: args.fieldId || null,
        groupId: args.groupId || null,
        rowId: args.rowId || null
      });
    },
    [logEvent]
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

  const hasTemplateRenderTargets = useMemo(() => {
    if (definition.summaryViewEnabled !== false && !!definition.summaryHtmlTemplateId) return true;
    return (definition.questions || []).some(q => {
      if (!q || q.type !== 'BUTTON') return false;
      const action = ((((q as any)?.button || {}) as any).action || '').toString().trim();
      return action === 'renderDocTemplate' || action === 'renderMarkdownTemplate' || action === 'renderHtmlTemplate';
    });
  }, [definition.questions, definition.summaryHtmlTemplateId, definition.summaryViewEnabled]);

  // Prefetch Drive/HTML templates in the background as early as possible (including Home/list),
  // so report + summary renders can reuse warmed templates when users open records/actions.
  useEffect(() => {
    const key = (formKey || '').toString().trim();
    if (!key) return;
    if (!hasTemplateRenderTargets) return;
    const shouldWaitForHomeData = view === 'list';
    if (shouldWaitForHomeData && homeFirstDataReadyAtMs <= 0) return;
    if (templatePrefetchDoneFormKeyRef.current === key) return;
    if (templatePrefetchInFlightFormKeyRef.current === key) return;

    let cancelled = false;
    let retryTimer: ReturnType<typeof globalThis.setTimeout> | null = null;
    let idleHandle: number | null = null;

    const run = () => {
      if (cancelled) return;
      if (templatePrefetchDoneFormKeyRef.current === key) return;
      if (templatePrefetchInFlightFormKeyRef.current === key) return;
      templatePrefetchInFlightFormKeyRef.current = key;
      const startedAt = Date.now();
      logEvent('templates.prefetch.start', {
        formKey: key,
        view,
        homeFirstDataReadyAtMs: homeFirstDataReadyAtMs || null,
        startedAfterHomeDataMs:
          homeFirstDataReadyAtMs > 0 ? Math.max(0, Date.now() - homeFirstDataReadyAtMs) : null
      });
      prefetchTemplatesApi(key)
        .then(res => {
          if (cancelled) return;
          if (templatePrefetchInFlightFormKeyRef.current === key) {
            templatePrefetchInFlightFormKeyRef.current = null;
          }
          templatePrefetchDoneFormKeyRef.current = key;
          delete templatePrefetchRetryCountRef.current[key];
          logEvent('templates.prefetch.ok', {
            formKey: key,
            success: Boolean(res?.success),
            message: (res as any)?.message || null,
            counts: (res as any)?.counts || null,
            durationMs: Date.now() - startedAt
          });
        })
        .catch(err => {
          if (templatePrefetchInFlightFormKeyRef.current === key) {
            templatePrefetchInFlightFormKeyRef.current = null;
          }
          const retries = (templatePrefetchRetryCountRef.current[key] || 0) + 1;
          templatePrefetchRetryCountRef.current[key] = retries;
          const msg = (err as any)?.message?.toString?.() || (err as any)?.toString?.() || 'Failed to prefetch templates.';
          logEvent('templates.prefetch.failed', {
            formKey: key,
            message: msg,
            retries,
            durationMs: Date.now() - startedAt
          });
          if (cancelled || retries >= 5) return;
          const delayMs = Math.min(5000, 800 + retries * 600);
          retryTimer = globalThis.setTimeout(() => {
            retryTimer = null;
            run();
          }, delayMs);
        });
    };

    try {
      if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
        idleHandle = (window as any).requestIdleCallback(run, { timeout: 2000 }) as number;
      } else {
        // Defer a bit to avoid clashing with immediate post-render input work.
        retryTimer = globalThis.setTimeout(() => {
          retryTimer = null;
          run();
        }, 600);
      }
    } catch (_) {
      run();
    }
    return () => {
      cancelled = true;
      if (retryTimer !== null) globalThis.clearTimeout(retryTimer);
      if (idleHandle !== null && typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
        (window as any).cancelIdleCallback(idleHandle);
      }
    };
  }, [formKey, hasTemplateRenderTargets, homeFirstDataReadyAtMs, view, logEvent]);

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
  const handleSubmitRef = useRef<() => void>(() => {});
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
  const [requestedGuidedStepId, setRequestedGuidedStepId] = useState<string | null>(null);
  const [guidedExternalSyncToken, setGuidedExternalSyncToken] = useState<number>(0);
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
  const draftSaveRequestInFlightRef = useRef<boolean>(false);
  const draftSaveRequestPromiseRef = useRef<Promise<any> | null>(null);
  const submissionRequestPromiseRef = useRef<Promise<any> | null>(null);
  const optimisticClientDataVersionRef = useRef<number | null>(
    record && Number.isFinite(Number((record as any).dataVersion)) ? Number((record as any).dataVersion) : null
  );
  const recordSyncPromiseRef = useRef<Promise<boolean> | null>(null);
  const synchronizeStaleRecordRef = useRef<SynchronizeStaleRecordFn>(async () => false);
  const draftSaveRequestFingerprintRef = useRef<{ recordId: string; fingerprint: string } | null>(null);
  const lastCompletedDraftSaveFingerprintRef = useRef<{ recordId: string; fingerprint: string } | null>(null);
  const lastDraftSaveFailureRef = useRef<{ message: string; recordId?: string | null } | null>(null);
  const performAutoSaveRef = useRef<(reason: string) => Promise<void>>(async () => undefined);
  const autoSaveUserEditedRef = useRef<boolean>(false);
  const retryableAutoSaveFailureCountRef = useRef<number>(0);
  const [autoSaveHold, setAutoSaveHold] = useState<{ hold: boolean; reason?: string }>(() => ({ hold: false }));
  const autoSaveHoldRef = useRef<{ hold: boolean; reason?: string }>({ hold: false });
  const prevAutoSaveHoldRef = useRef<boolean>(false);
  const lastUserInteractionRef = useRef<number>(0);
  const lastLocalRecordMutationAtRef = useRef<number>(0);
  const lastExternalRecordSyncAtRef = useRef<number>(0);
  const lastRecordServerActivityAtRef = useRef<number>(record && (record as any).id ? Date.now() : 0);
  const recordFreshnessTimerRef = useRef<number | null>(null);
  const recordFreshnessCheckPromiseRef = useRef<Promise<void> | null>(null);
  const performRecordFreshnessCheckRef = useRef<(reason: string) => Promise<void>>(async () => undefined);
  const pendingDeferredRecordFreshnessSyncRef = useRef<Parameters<SynchronizeStaleRecordFn>[0] | null>(null);
  const resumeDeferredRecordFreshnessSyncRef = useRef<(reason: string) => boolean>(() => false);
  const dataSourceFreshnessTimerRef = useRef<number | null>(null);
  const dataSourceFreshnessCheckPromiseRef = useRef<Promise<void> | null>(null);
  const performDataSourceFreshnessCheckRef = useRef<(reason: string) => Promise<void>>(async () => undefined);
  const lastDataSourceFreshnessServerActivityAtByWatchKeyRef = useRef<Record<string, number>>({});
  const lastAutoSaveSeenRef = useRef<{ values: Record<string, FieldValue>; lineItems: LineItemState } | null>(null);
  const lastAutoSaveStateFingerprintRef = useRef<string>('');
  const pendingAutomatedAutoSaveSourceRef = useRef<string>('');
  const latestRenderedAutoSaveStateFingerprintRef = useRef<string>('');
  const reservationSyncPromiseRef = useRef<
    Promise<{ success: boolean; message?: string; recordId: string; stepId: string; sessionId: number }> | null
  >(null);
  const pendingFollowupBatchPromisesRef = useRef<
    Map<
      string,
      Promise<{
        success: boolean;
        message?: string;
        recordId: string;
        stepId?: string;
        sessionId: number;
        reason: string;
      }>
    >
  >(new Map());
  const reservationSyncMetaRef = useRef<{
    recordId: string;
    stepId: string;
    sessionId: number;
    status: 'running' | 'failed' | 'succeeded';
    fingerprint?: string;
    message?: string;
  } | null>(null);
  const reservationManagedScopesRef = useRef<{ recordId: string; scopes: InventoryReservationPlanScope[] } | null>(null);
  const guidedStepBackgroundSyncPromiseRef = useRef<Promise<void> | null>(null);
  const guidedStepBackgroundSyncPendingRef = useRef<{
    stepId: string;
    nextStepId?: string;
    trigger: 'next' | 'auto';
    sessionId: number;
    fingerprint: string;
  } | null>(null);
  const guidedStepBackgroundSyncActiveFingerprintRef = useRef<string>('');
  const guidedStepBackgroundSyncPendingFingerprintRef = useRef<string>('');
  const guidedStepImmediateSyncPromiseRef = useRef<Promise<void> | null>(null);
  const guidedStepImmediateSyncPendingRef = useRef<{
    stepId: string;
    reason: string;
    sessionId: number;
    fingerprint: string;
    persistSnapshot: boolean;
    snapshotLineItems?: LineItemState;
  } | null>(null);
  const guidedStepImmediateSyncActiveFingerprintRef = useRef<string>('');
  const guidedStepImmediateSyncPendingFingerprintRef = useRef<string>('');
  const recordFreshnessConfigRef = useRef(resolveRecordFreshnessConfig((definition as any)?.recordFreshness));
  const dataSourceFreshnessWatchesRef = useRef(resolveDataSourceFreshnessWatches((definition as any)?.recordFreshness));
  const activeGuidedStepIdRef = useRef<string>((guidedUiState?.activeStepId || '').toString().trim());
  const recordLoadingIdRef = useRef<string | null>(recordLoadingId);
  /**
   * Monotonic session counter used to ignore late async results (autosave, uploads, etc)
   * after the user switches to a different record/create flow.
   */
  const recordSessionRef = useRef<number>(0);
  const uploadQueueRef = useRef<Map<string, Promise<{ success: boolean; message?: string }>>>(new Map());
  const uploadedFieldValueOverridesRef = useRef<
    Map<
      string,
      {
        scope: 'top' | 'line';
        questionId?: string;
        groupId?: string;
        rowId?: string;
        fieldId?: string;
        items: Array<string | File>;
      }
    >
  >(new Map());
  const [, setUploadQueueSize] = useState<number>(() => uploadQueueRef.current.size);
  const listOpenViewSubmitTimerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null);
  const summarySubmitIntentRef = useRef<boolean>(false);
  const navigateHomeInFlightRef = useRef<boolean>(false);
  const syncUploadQueueSize = useCallback(() => {
    setUploadQueueSize(uploadQueueRef.current.size);
  }, []);

  const scheduleLatestAutoSave = useCallback(
    (reason: string, delayMs: number): number | null => {
      const nextDelay = Number.isFinite(delayMs) && delayMs > 0 ? delayMs : 0;
      autoSaveQueuedRef.current = true;
      if (autoSaveTimerRef.current) {
        globalThis.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      const timerId = globalThis.setTimeout(() => {
        autoSaveTimerRef.current = null;
        autoSaveQueuedRef.current = false;
        logEvent('autosave.timer.fire', {
          reason,
          dirty: autoSaveDirtyRef.current,
          queued: autoSaveQueuedRef.current
        });
        void performAutoSaveRef.current(reason);
      }, nextDelay) as any;
      autoSaveTimerRef.current = timerId as any;
      logEvent('autosave.queue.latest', { reason, delayMs: nextDelay });
      return timerId as any;
    },
    [logEvent]
  );

  const rememberAutoSaveSeenState = useCallback(
    (nextValues: Record<string, FieldValue>, nextLineItems: LineItemState) => {
      lastAutoSaveSeenRef.current = { values: nextValues, lineItems: nextLineItems };
      lastAutoSaveStateFingerprintRef.current = buildDraftStateFingerprint({
        formKey,
        language: languageRef.current,
        values: nextValues,
        lineItems: nextLineItems
      });
    },
    [formKey]
  );

  const scheduleRetryableAutoSaveRecovery = useCallback(
    (reason: string, message: string) => {
      const attempt = Math.min(retryableAutoSaveFailureCountRef.current + 1, RETRYABLE_AUTOSAVE_DELAYS_MS.length);
      retryableAutoSaveFailureCountRef.current = attempt;
      const delayMs =
        RETRYABLE_AUTOSAVE_DELAYS_MS[Math.max(0, attempt - 1)] ||
        RETRYABLE_AUTOSAVE_DELAYS_MS[RETRYABLE_AUTOSAVE_DELAYS_MS.length - 1] ||
        1500;
      autoSaveDirtyRef.current = true;
      setDraftSave({ phase: 'saving' });
      scheduleLatestAutoSave(`${reason}.retryableBusy`, delayMs);
      logEvent('autosave.retryableBusy.retryScheduled', {
        reason,
        attempt,
        delayMs,
        message
      });
    },
    [logEvent, scheduleLatestAutoSave]
  );

  const waitForDraftSaveRequest = useCallback(
    async (reason: string, timeoutMs = 10000): Promise<void> => {
      if (!draftSaveRequestInFlightRef.current || !draftSaveRequestPromiseRef.current) return;
      const startedAt = Date.now();
      logEvent('draftSave.wait.begin', { reason });
      while (draftSaveRequestInFlightRef.current && draftSaveRequestPromiseRef.current) {
        const inFlight = draftSaveRequestPromiseRef.current;
        try {
          await inFlight;
        } catch {
          // ignore and re-check state below
        }
        if (!draftSaveRequestInFlightRef.current) break;
        if (Date.now() - startedAt > timeoutMs) break;
        await new Promise<void>(resolve => globalThis.setTimeout(resolve, 80));
      }
      logEvent('draftSave.wait.done', {
        reason,
        durationMs: Date.now() - startedAt,
        stillInFlight: draftSaveRequestInFlightRef.current
      });
    },
    [logEvent]
  );

  const runDraftSaveRequest = useCallback(
    async <T,>(reason: string, runner: () => Promise<T>): Promise<T> => {
      const previousPromise = draftSaveRequestPromiseRef.current;
      const promise = chainSerializedSubmissionRequest(previousPromise, async () => runner());
      draftSaveRequestPromiseRef.current = promise as Promise<any>;
      draftSaveRequestInFlightRef.current = true;
      if (previousPromise) {
        logEvent('draftSave.serialized', { reason });
      }
      void promise.finally(() => {
        if (draftSaveRequestPromiseRef.current === promise) {
          draftSaveRequestPromiseRef.current = null;
          draftSaveRequestInFlightRef.current = false;
        }
      });
      return promise;
    },
    [logEvent]
  );

  const runSerializedSubmissionRequest = useCallback(
    async <T,>(reason: string, runner: () => Promise<T>): Promise<T> => {
      const previousPromise = submissionRequestPromiseRef.current;
      const promise = chainSerializedSubmissionRequest(previousPromise, async () => runner());
      submissionRequestPromiseRef.current = promise as Promise<any>;
      if (previousPromise) {
        logEvent('submit.serialized', { reason });
      }
      void promise.finally(() => {
        if (submissionRequestPromiseRef.current === promise) {
          submissionRequestPromiseRef.current = null;
        }
      });
      return promise;
    },
    [logEvent]
  );

  const runSerializedFollowupBatchRequest = useCallback(
    async (args: { recordId: string; actions: string[]; reason: string }): Promise<FollowupBatchResponse> => {
      return runSerializedSubmissionRequest(`followup:${args.reason}`, async () => {
        return triggerFollowupBatch(formKey, args.recordId, args.actions);
      });
    },
    [formKey, runSerializedSubmissionRequest]
  );

  const getCurrentKnownClientDataVersion = useCallback(
    () =>
      resolveCurrentClientDataVersion(
        recordDataVersionRef.current,
        optimisticClientDataVersionRef.current,
        lastSubmissionMetaRef.current?.dataVersion,
        (selectedRecordSnapshotRef.current as any)?.dataVersion
      ),
    []
  );

  const buildCurrentDraftSaveResponse = useCallback(
    (recordId: string) => ({
      success: true,
      meta: {
        id: recordId,
        updatedAt: lastSubmissionMetaRef.current?.updatedAt || selectedRecordSnapshotRef.current?.updatedAt || '',
        dataVersion: getCurrentKnownClientDataVersion() || undefined,
        rowNumber: recordRowNumberRef.current || undefined,
        status: lastSubmissionMetaRef.current?.status || selectedRecordSnapshotRef.current?.status || null
      }
    }),
    [getCurrentKnownClientDataVersion]
  );

  const runCoalescedDraftSaveRequest = useCallback(
    async <T extends { success?: boolean; meta?: any },>(
      reason: string,
      payload: any,
      runner: (nextPayload: any) => Promise<T>
    ): Promise<T> => {
      const fingerprint = buildDraftSaveFingerprint(payload);
      if (
        fingerprint &&
        draftSaveRequestInFlightRef.current &&
        draftSaveRequestPromiseRef.current &&
        draftSaveRequestFingerprintRef.current?.recordId === fingerprint.recordId &&
        draftSaveRequestFingerprintRef.current?.fingerprint === fingerprint.fingerprint
      ) {
        logEvent('draftSave.coalesced.inFlight', {
          reason,
          recordId: fingerprint.recordId
        });
        return draftSaveRequestPromiseRef.current as Promise<T>;
      }

      if (
        fingerprint &&
        lastCompletedDraftSaveFingerprintRef.current?.recordId === fingerprint.recordId &&
        lastCompletedDraftSaveFingerprintRef.current?.fingerprint === fingerprint.fingerprint
      ) {
        logEvent('draftSave.coalesced.cached', {
          reason,
          recordId: fingerprint.recordId
        });
        lastDraftSaveFailureRef.current = null;
        return buildCurrentDraftSaveResponse(fingerprint.recordId) as T;
      }

      draftSaveRequestFingerprintRef.current = fingerprint;
      try {
        const result = await runDraftSaveRequest(reason, () => runner(payload));
        if (fingerprint && result?.success) {
          lastCompletedDraftSaveFingerprintRef.current = fingerprint;
        }
        if ((result as any)?.success === false) {
          lastDraftSaveFailureRef.current = {
            recordId: fingerprint?.recordId || ((result as any)?.meta?.id || payload?.id || '').toString().trim() || null,
            message: (((result as any)?.message || 'Failed to save the current record.') as any).toString()
          };
        } else {
          lastDraftSaveFailureRef.current = null;
        }
        return result;
      } catch (err: any) {
        lastDraftSaveFailureRef.current = {
          recordId: fingerprint?.recordId || ((payload?.id || '') as any).toString?.().trim?.() || null,
          message: resolveUiErrorMessage(err, 'Failed to save the current record.') || 'Failed to save the current record.'
        };
        throw err;
      } finally {
        if (
          draftSaveRequestFingerprintRef.current?.recordId === fingerprint?.recordId &&
          draftSaveRequestFingerprintRef.current?.fingerprint === fingerprint?.fingerprint
        ) {
          draftSaveRequestFingerprintRef.current = null;
        }
      }
    },
    [buildCurrentDraftSaveResponse, logEvent, resolveUiErrorMessage, runDraftSaveRequest]
  );

  const submitCurrentRecordMutation = useCallback(
    async (reason: string, payload: any, runner?: (nextPayload: any) => Promise<any>): Promise<any> => {
      return runSerializedSubmissionRequest(reason, async () => {
        const currentRecordId =
          resolveExistingRecordId({
            selectedRecordId: selectedRecordIdRef.current,
            selectedRecordSnapshot: selectedRecordSnapshotRef.current,
            lastSubmissionMetaId: lastSubmissionMetaRef.current?.id || null
          }) || '';
        const previousClientDataVersion = resolveCurrentClientDataVersion((payload as any)?.__ckClientDataVersion);
        const prepared = prepareClientDataVersionDispatch({
          payload,
          currentRecordId,
          currentDataVersion: getCurrentKnownClientDataVersion(),
          optimisticDataVersion: optimisticClientDataVersionRef.current
        });
        const nextPayload = prepared.payload;
        const nextClientDataVersion = resolveCurrentClientDataVersion((nextPayload as any)?.__ckClientDataVersion);
        if (previousClientDataVersion !== nextClientDataVersion) {
          logEvent('submit.clientDataVersion.sync', {
            reason,
            recordId:
              currentRecordId ||
              ((nextPayload?.id || nextPayload?.__ckDeleteRecordId || '') as any).toString?.().trim?.() ||
              null,
            previousClientDataVersion,
            nextClientDataVersion
          });
        }
        optimisticClientDataVersionRef.current = prepared.optimisticDataVersion;
        try {
          const response = runner ? await runner(nextPayload) : await submit(nextPayload);
          optimisticClientDataVersionRef.current = settleClientDataVersionAfterDispatch({
            success: Boolean(response?.success),
            confirmedDataVersion: getCurrentKnownClientDataVersion(),
            optimisticDataVersion: optimisticClientDataVersionRef.current,
            responseDataVersion: (response as any)?.meta?.dataVersion
          });
          return response;
        } catch (err) {
          optimisticClientDataVersionRef.current = settleClientDataVersionAfterDispatch({
            success: false,
            confirmedDataVersion: getCurrentKnownClientDataVersion(),
            optimisticDataVersion: optimisticClientDataVersionRef.current
          });
          throw err;
        }
      });
    },
    [getCurrentKnownClientDataVersion, logEvent, runSerializedSubmissionRequest]
  );

  const getCurrentOpenRecordId = useCallback(
    () =>
      resolveExistingRecordId({
        selectedRecordId: selectedRecordIdRef.current,
        selectedRecordSnapshot: selectedRecordSnapshotRef.current,
        lastSubmissionMetaId: lastSubmissionMetaRef.current?.id || null
      }) || '',
    []
  );

  const clearRecordFreshnessTimer = useCallback(() => {
    if (recordFreshnessTimerRef.current) {
      globalThis.clearTimeout(recordFreshnessTimerRef.current);
      recordFreshnessTimerRef.current = null;
    }
  }, []);

  const scheduleRecordFreshnessCheck = useCallback(
    (reason: string) => {
      clearRecordFreshnessTimer();
      const currentDataVersion = getCurrentKnownClientDataVersion();
      const delayMs = resolveRecordFreshnessTimerDelay({
        config: recordFreshnessConfigRef.current,
        view: viewRef.current,
        recordId: getCurrentOpenRecordId(),
        hasServerVersion: Number.isFinite(Number(currentDataVersion)) && Number(currentDataVersion) > 0,
        recordLoading: Boolean(recordLoadingIdRef.current),
        now: Date.now(),
        lastServerActivityAt: lastRecordServerActivityAtRef.current || null
      });
      if (delayMs === null) return;
      const nextDelayMs = Math.max(1000, Math.floor(delayMs));
      recordFreshnessTimerRef.current = globalThis.setTimeout(() => {
        recordFreshnessTimerRef.current = null;
        void performRecordFreshnessCheckRef.current('heartbeat');
      }, nextDelayMs) as unknown as number;
      logEvent('record.freshness.schedule', {
        reason,
        recordId: getCurrentOpenRecordId() || null,
        delayMs: nextDelayMs,
        quietWindowMs: recordFreshnessConfigRef.current.quietWindowMs
      });
    },
    [clearRecordFreshnessTimer, getCurrentKnownClientDataVersion, getCurrentOpenRecordId, logEvent]
  );

  const markRecordFreshnessServerTouch = useCallback(
    (args: { reason: string; recordId?: string | null }) => {
      const currentRecordId = getCurrentOpenRecordId();
      const targetRecordId = (args.recordId || currentRecordId || '').toString().trim();
      if (currentRecordId && targetRecordId && currentRecordId !== targetRecordId) return;
      lastRecordServerActivityAtRef.current = Date.now();
      logEvent('record.freshness.touch', {
        reason: args.reason,
        recordId: targetRecordId || currentRecordId || null,
        quietWindowMs: recordFreshnessConfigRef.current.quietWindowMs
      });
      scheduleRecordFreshnessCheck(args.reason);
    },
    [getCurrentOpenRecordId, logEvent, scheduleRecordFreshnessCheck]
  );

  const getRecordFreshnessSyncBlockers = useCallback(
    () =>
      resolveRecordFreshnessSyncBlockers({
        dirty: autoSaveDirtyRef.current,
        draftSavePhase: draftSave.phase,
        autoSaveQueued: autoSaveQueuedRef.current,
        autoSaveInFlight: autoSaveInFlightRef.current,
        draftSaveInFlight: draftSaveRequestInFlightRef.current,
        submissionInFlight: Boolean(submissionRequestPromiseRef.current) || submittingRef.current,
        uploadInFlight: uploadQueueRef.current.size > 0,
        recordSyncInFlight: Boolean(recordSyncPromiseRef.current) || Boolean(recordLoadingIdRef.current),
        guidedStepLiveSyncInFlight: Boolean(guidedStepImmediateSyncPromiseRef.current),
        guidedStepBackgroundSyncInFlight: Boolean(guidedStepBackgroundSyncPromiseRef.current),
        lastUserInteractionAt: lastUserInteractionRef.current || null,
        now: Date.now()
      }),
    [draftSave.phase]
  );

  const performRecordFreshnessCheck = useCallback(
    async (reason: string): Promise<void> => {
      const recordId = getCurrentOpenRecordId();
      const baselineVersionRaw = getCurrentKnownClientDataVersion();
      const baselineVersion =
        Number.isFinite(Number(baselineVersionRaw)) && Number(baselineVersionRaw) > 0 ? Number(baselineVersionRaw) : null;
      const delayMs = resolveRecordFreshnessTimerDelay({
        config: recordFreshnessConfigRef.current,
        view: viewRef.current,
        recordId,
        hasServerVersion: baselineVersion !== null,
        recordLoading: Boolean(recordLoadingIdRef.current),
        now: Date.now(),
        lastServerActivityAt: lastRecordServerActivityAtRef.current || null
      });
      if (delayMs === null || !recordId || baselineVersion === null) {
        clearRecordFreshnessTimer();
        return;
      }
      if (recordFreshnessCheckPromiseRef.current) {
        logEvent('record.freshness.check.skipped', { reason, recordId, skipReason: 'inFlight' });
        scheduleRecordFreshnessCheck(`${reason}.inFlight`);
        return;
      }
      if (
        autoSaveInFlightRef.current ||
        draftSaveRequestInFlightRef.current ||
        Boolean(submissionRequestPromiseRef.current) ||
        uploadQueueRef.current.size > 0 ||
        Boolean(recordSyncPromiseRef.current) ||
        Boolean(guidedStepImmediateSyncPromiseRef.current) ||
        Boolean(guidedStepBackgroundSyncPromiseRef.current) ||
        submittingRef.current
      ) {
        logEvent('record.freshness.check.skipped', {
          reason,
          recordId,
          skipReason: 'serverWorkInFlight',
          uploadsInFlight: uploadQueueRef.current.size,
          autoSaveInFlight: autoSaveInFlightRef.current,
          draftSaveInFlight: draftSaveRequestInFlightRef.current,
          submissionInFlight: Boolean(submissionRequestPromiseRef.current),
          recordSyncInFlight: Boolean(recordSyncPromiseRef.current),
          guidedStepLiveSyncInFlight: Boolean(guidedStepImmediateSyncPromiseRef.current),
          guidedStepBackgroundSyncInFlight: Boolean(guidedStepBackgroundSyncPromiseRef.current)
        });
        scheduleRecordFreshnessCheck(`${reason}.serverWorkInFlight`);
        return;
      }

      const startedAt = Date.now();
      lastRecordServerActivityAtRef.current = startedAt;
      logEvent('record.freshness.check.start', {
        reason,
        recordId,
        cachedVersion: baselineVersion,
        rowNumberHint: recordRowNumberRef.current || null
      });
      const promise = (async () => {
        try {
          const result = await getRecordVersionApi(formKey, recordId, recordRowNumberRef.current || null);
          if (selectedRecordIdRef.current !== recordId) return;
          if (!result?.success) {
            logEvent('record.freshness.check.error', {
              reason,
              recordId,
              message: result?.message || 'failed',
              durationMs: Date.now() - startedAt
            });
            scheduleRecordFreshnessCheck(`${reason}.error`);
            return;
          }

          const serverVersion = Number(result.dataVersion);
          const serverRow = Number.isFinite(Number(result.rowNumber)) ? Number(result.rowNumber) : null;
          if (serverRow && serverRow >= 2) {
            recordRowNumberRef.current = serverRow;
          }
          markRecordFreshnessServerTouch({ reason: `recordFreshness.${reason}`, recordId });
          const localVersionNow = Number(getCurrentKnownClientDataVersion());
          const effectiveBaseline =
            Number.isFinite(localVersionNow) && localVersionNow > 0 ? localVersionNow : baselineVersion;
          if (Number.isFinite(serverVersion) && serverVersion > 0 && serverVersion !== effectiveBaseline) {
            const syncBlockers = getRecordFreshnessSyncBlockers();
            const shouldDeferSync = syncBlockers.length > 0;
            logEvent('record.freshness.check.stale', {
              reason,
              recordId,
              cachedVersion: effectiveBaseline,
              serverVersion,
              serverRow,
              deferred: shouldDeferSync,
              dirty: autoSaveDirtyRef.current,
              draftSavePhase: draftSave.phase,
              autoSaveQueued: autoSaveQueuedRef.current,
              blockers: syncBlockers
            });
            if (shouldDeferSync) {
              pendingDeferredRecordFreshnessSyncRef.current = {
                reason: 'recordFreshness.stale',
                recordId,
                cachedVersion: effectiveBaseline,
                serverVersion,
                serverRow
              };
              logEvent('record.freshness.check.stale.deferred', {
                reason,
                recordId,
                cachedVersion: effectiveBaseline,
                serverVersion,
                serverRow,
                draftSavePhase: draftSave.phase,
                autoSaveQueued: autoSaveQueuedRef.current,
                blockers: syncBlockers
              });
              scheduleRecordFreshnessCheck(`${reason}.staleDeferred`);
              return;
            }
            pendingDeferredRecordFreshnessSyncRef.current = null;
            await synchronizeStaleRecordRef.current({
              reason: 'recordFreshness.stale',
              recordId,
              cachedVersion: effectiveBaseline,
              serverVersion,
              serverRow
            });
            return;
          }

          logEvent('record.freshness.check.match', {
            reason,
            recordId,
            serverVersion: Number.isFinite(serverVersion) ? serverVersion : null,
            durationMs: Date.now() - startedAt
          });
        } catch (err: any) {
          logEvent('record.freshness.check.exception', {
            reason,
            recordId,
            message: err?.message || err?.toString?.() || 'failed',
            durationMs: Date.now() - startedAt
          });
          scheduleRecordFreshnessCheck(`${reason}.exception`);
        } finally {
          recordFreshnessCheckPromiseRef.current = null;
        }
      })();
      recordFreshnessCheckPromiseRef.current = promise;
      return promise;
    },
    [
      clearRecordFreshnessTimer,
      draftSave.phase,
      formKey,
      getCurrentKnownClientDataVersion,
      getCurrentOpenRecordId,
      getRecordFreshnessSyncBlockers,
      logEvent,
      markRecordFreshnessServerTouch,
      scheduleRecordFreshnessCheck
    ]
  );
  performRecordFreshnessCheckRef.current = performRecordFreshnessCheck;

  const resolveWatchedDataSourceConfig = useCallback(
    (dataSourceId: string) => {
      const normalizedId = normalizeDataSourceVisibilityKey(dataSourceId);
      return (
        collectDataSourceConfigsForPrefetch(definition).find(cfg => {
          const id = `${cfg?.id || ''}`.trim();
          return id === dataSourceId || normalizeDataSourceVisibilityKey(id) === normalizedId;
        }) || null
      );
    },
    [definition]
  );

  const clearDataSourceFreshnessTimer = useCallback(() => {
    if (dataSourceFreshnessTimerRef.current) {
      globalThis.clearTimeout(dataSourceFreshnessTimerRef.current);
      dataSourceFreshnessTimerRef.current = null;
    }
  }, []);

  const scheduleDataSourceFreshnessCheck = useCallback(
    (reason: string) => {
      clearDataSourceFreshnessTimer();
      const activeWatches = resolveActiveDataSourceFreshnessWatches({
        watches: dataSourceFreshnessWatchesRef.current,
        stepId: activeGuidedStepIdRef.current
      });
      const delayMs = resolveDataSourceFreshnessTimerDelay({
        watches: activeWatches,
        view: viewRef.current,
        recordId: getCurrentOpenRecordId(),
        recordLoading: Boolean(recordLoadingIdRef.current),
        now: Date.now(),
        lastServerActivityAtByWatchKey: lastDataSourceFreshnessServerActivityAtByWatchKeyRef.current
      });
      if (delayMs === null) return;
      const nextDelayMs = Math.max(1000, Math.floor(delayMs));
      dataSourceFreshnessTimerRef.current = globalThis.setTimeout(() => {
        dataSourceFreshnessTimerRef.current = null;
        void performDataSourceFreshnessCheckRef.current('heartbeat');
      }, nextDelayMs) as unknown as number;
      logEvent('datasource.freshness.schedule', {
        reason,
        recordId: getCurrentOpenRecordId() || null,
        stepId: activeGuidedStepIdRef.current || null,
        delayMs: nextDelayMs,
        watchKeys: activeWatches.map(watch => watch.key),
        dataSourceIds: Array.from(new Set(activeWatches.flatMap(watch => watch.dataSourceIds)))
      });
    },
    [clearDataSourceFreshnessTimer, getCurrentOpenRecordId, logEvent]
  );

  const markDataSourceFreshnessServerTouch = useCallback(
    (args: { reason: string; stepId?: string | null; dataSourceIds?: string[] | null }) => {
      const activeWatches = resolveActiveDataSourceFreshnessWatches({
        watches: dataSourceFreshnessWatchesRef.current,
        stepId: (args.stepId || activeGuidedStepIdRef.current || '').toString().trim()
      });
      const normalizedRequestedIds = new Set(
        (Array.isArray(args.dataSourceIds) ? args.dataSourceIds : [])
          .map(id => normalizeDataSourceVisibilityKey(`${id || ''}`))
          .filter(Boolean)
      );
      const watches = activeWatches.filter(
        watch =>
          !normalizedRequestedIds.size ||
          watch.dataSourceIds.some(id => normalizedRequestedIds.has(normalizeDataSourceVisibilityKey(id)))
      );
      if (!watches.length) return;
      const touchedAt = Date.now();
      watches.forEach(watch => {
        lastDataSourceFreshnessServerActivityAtByWatchKeyRef.current[watch.key] = touchedAt;
      });
      logEvent('datasource.freshness.touch', {
        reason: args.reason,
        recordId: getCurrentOpenRecordId() || null,
        stepId: (args.stepId || activeGuidedStepIdRef.current || '').toString().trim() || null,
        watchKeys: watches.map(watch => watch.key),
        dataSourceIds: Array.from(new Set(watches.flatMap(watch => watch.dataSourceIds)))
      });
      scheduleDataSourceFreshnessCheck(args.reason);
    },
    [getCurrentOpenRecordId, logEvent, scheduleDataSourceFreshnessCheck]
  );

  const performDataSourceFreshnessCheck = useCallback(
    async (reason: string): Promise<void> => {
      const recordId = getCurrentOpenRecordId();
      const stepId = activeGuidedStepIdRef.current;
      const activeWatches = resolveActiveDataSourceFreshnessWatches({
        watches: dataSourceFreshnessWatchesRef.current,
        stepId
      });
      const delayMs = resolveDataSourceFreshnessTimerDelay({
        watches: activeWatches,
        view: viewRef.current,
        recordId,
        recordLoading: Boolean(recordLoadingIdRef.current),
        now: Date.now(),
        lastServerActivityAtByWatchKey: lastDataSourceFreshnessServerActivityAtByWatchKeyRef.current
      });
      if (delayMs === null) {
        clearDataSourceFreshnessTimer();
        return;
      }
      const dueWatches = activeWatches.filter(watch => {
        const watchDelayMs = resolveDataSourceFreshnessTimerDelay({
          watches: [watch],
          view: viewRef.current,
          recordId,
          recordLoading: Boolean(recordLoadingIdRef.current),
          now: Date.now(),
          lastServerActivityAtByWatchKey: lastDataSourceFreshnessServerActivityAtByWatchKeyRef.current
        });
        return watchDelayMs !== null && watchDelayMs <= 0;
      });
      if (!dueWatches.length) {
        scheduleDataSourceFreshnessCheck(`${reason}.waiting`);
        return;
      }
      if (dataSourceFreshnessCheckPromiseRef.current) {
        logEvent('datasource.freshness.check.skipped', {
          reason,
          recordId,
          stepId,
          skipReason: 'inFlight'
        });
        scheduleDataSourceFreshnessCheck(`${reason}.inFlight`);
        return;
      }
      if (
        autoSaveInFlightRef.current ||
        draftSaveRequestInFlightRef.current ||
        Boolean(submissionRequestPromiseRef.current) ||
        uploadQueueRef.current.size > 0 ||
        Boolean(recordSyncPromiseRef.current) ||
        Boolean(guidedStepImmediateSyncPromiseRef.current) ||
        Boolean(guidedStepBackgroundSyncPromiseRef.current) ||
        submittingRef.current ||
        Boolean(recordLoadingIdRef.current)
      ) {
        logEvent('datasource.freshness.check.skipped', {
          reason,
          recordId,
          stepId,
          skipReason: 'serverWorkInFlight',
          uploadsInFlight: uploadQueueRef.current.size,
          autoSaveInFlight: autoSaveInFlightRef.current,
          draftSaveInFlight: draftSaveRequestInFlightRef.current,
          submissionInFlight: Boolean(submissionRequestPromiseRef.current),
          recordSyncInFlight: Boolean(recordSyncPromiseRef.current),
          guidedStepLiveSyncInFlight: Boolean(guidedStepImmediateSyncPromiseRef.current),
          guidedStepBackgroundSyncInFlight: Boolean(guidedStepBackgroundSyncPromiseRef.current)
        });
        scheduleDataSourceFreshnessCheck(`${reason}.serverWorkInFlight`);
        return;
      }

      const startedAt = Date.now();
      dueWatches.forEach(watch => {
        lastDataSourceFreshnessServerActivityAtByWatchKeyRef.current[watch.key] = startedAt;
      });
      logEvent('datasource.freshness.check.start', {
        reason,
        recordId,
        stepId,
        watchKeys: dueWatches.map(watch => watch.key),
        dataSourceIds: Array.from(new Set(dueWatches.flatMap(watch => watch.dataSourceIds)))
      });
      const promise = (async () => {
        try {
          const changedWatches: typeof dueWatches = [];
          for (const watch of dueWatches) {
            let watchChanged = false;

            for (const dataSourceId of watch.dataSourceIds) {
              const config = resolveWatchedDataSourceConfig(dataSourceId);
              if (!config) {
                logEvent('datasource.freshness.check.skipped', {
                  reason,
                  recordId,
                  stepId,
                  watchKey: watch.key,
                  dataSourceId,
                  skipReason: 'missingConfig'
                });
                continue;
              }
              const signatureFieldIds = resolveDataSourceFreshnessSignatureFieldIds(config);
              const beforeSignature = buildDataSourceFreshnessSnapshotSignature(
                peekCachedDataSource(config, languageRef.current),
                { fieldIds: signatureFieldIds }
              );
              const refreshed = await fetchDataSource(config, languageRef.current, { forceRefresh: true }).catch(() => null);
              if (selectedRecordIdRef.current !== recordId) return;
              if (viewRef.current !== 'form') return;
              if (activeGuidedStepIdRef.current !== stepId) return;
              if (!refreshed) {
                logEvent('datasource.freshness.check.error', {
                  reason,
                  recordId,
                  stepId,
                  watchKey: watch.key,
                  dataSourceId,
                  message: 'failed',
                  durationMs: Date.now() - startedAt
                });
                continue;
              }
              const afterSignature = buildDataSourceFreshnessSnapshotSignature(refreshed, {
                fieldIds: signatureFieldIds
              });
              if (beforeSignature !== afterSignature) {
                watchChanged = true;
              }
            }

            lastDataSourceFreshnessServerActivityAtByWatchKeyRef.current[watch.key] = Date.now();
            if (watchChanged) {
              changedWatches.push(watch);
              logEvent('datasource.freshness.check.changed', {
                reason,
                recordId,
                stepId,
                watchKey: watch.key,
                dataSourceIds: watch.dataSourceIds,
                durationMs: Date.now() - startedAt
              });
            } else {
              logEvent('datasource.freshness.check.match', {
                reason,
                recordId,
                stepId,
                watchKey: watch.key,
                dataSourceIds: watch.dataSourceIds,
                durationMs: Date.now() - startedAt
              });
            }
          }

          if (selectedRecordIdRef.current !== recordId) return;
          if (viewRef.current !== 'form') return;
          if (activeGuidedStepIdRef.current !== stepId) return;

          const changedWatch = changedWatches[0];
          if (!changedWatch) return;
          const dialog = changedWatch.dialog;
          await new Promise<void>(resolve => {
            customConfirm.openConfirm({
              title: resolveLocalizedString(
                dialog?.title,
                languageRef.current,
                tSystem('common.notice', languageRef.current, 'Notice')
              ),
              message:
                resolveLocalizedString(
                  dialog?.message,
                  languageRef.current,
                  'The available source data changed while you were editing. We loaded the latest availability. Please review this step before continuing.'
                ) ||
                'The available source data changed while you were editing. We loaded the latest availability. Please review this step before continuing.',
              confirmLabel: resolveLocalizedString(
                dialog?.confirmLabel,
                languageRef.current,
                tSystem('common.ok', languageRef.current, 'OK')
              ),
              cancelLabel: resolveLocalizedString(
                dialog?.cancelLabel,
                languageRef.current,
                tSystem('common.cancel', languageRef.current, 'Cancel')
              ),
              primaryAction: dialog?.primaryAction,
              showCancel: dialog?.showCancel === true,
              showCloseButton: dialog?.showCloseButton === true,
              dismissOnBackdrop: dialog?.dismissOnBackdrop === true,
              kind: 'datasourceFreshness.changed',
              refId: changedWatch.stepId || 'datasource',
              onConfirm: () => resolve(),
              onCancel: () => resolve()
            });
          });
        } catch (err: any) {
          logEvent('datasource.freshness.check.exception', {
            reason,
            recordId,
            stepId,
            message: err?.message || err?.toString?.() || 'failed',
            durationMs: Date.now() - startedAt
          });
        } finally {
          dataSourceFreshnessCheckPromiseRef.current = null;
          scheduleDataSourceFreshnessCheck(`${reason}.complete`);
        }
      })();
      dataSourceFreshnessCheckPromiseRef.current = promise;
      return promise;
    },
    [
      clearDataSourceFreshnessTimer,
      customConfirm,
      getCurrentOpenRecordId,
      logEvent,
      resolveWatchedDataSourceConfig,
      scheduleDataSourceFreshnessCheck
    ]
  );
  performDataSourceFreshnessCheckRef.current = performDataSourceFreshnessCheck;

  const applyUploadedFieldOverrides = useCallback(
    (args: {
      values: Record<string, FieldValue>;
      lineItems: LineItemState;
    }): { values: Record<string, FieldValue>; lineItems: LineItemState } => {
      const overrides = uploadedFieldValueOverridesRef.current;
      if (!overrides.size) return args;
      let nextValues = args.values;
      let nextLineItems = args.lineItems;
      overrides.forEach(entry => {
        if (entry.scope === 'top' && entry.questionId) {
          nextValues = {
            ...nextValues,
            [entry.questionId]: entry.items as unknown as FieldValue
          };
          return;
        }
        if (entry.scope === 'line' && entry.groupId && entry.rowId && entry.fieldId) {
          const rows = nextLineItems[entry.groupId] || [];
          const nextRows = rows.map(row => {
            if (row.id !== entry.rowId) return row;
            return {
              ...row,
              values: {
                ...(row.values || {}),
                [entry.fieldId as string]: entry.items
              }
            };
          });
          nextLineItems = {
            ...nextLineItems,
            [entry.groupId]: nextRows
          };
        }
      });
      return { values: nextValues, lineItems: nextLineItems };
    },
    []
  );

  const applyUploadedFieldPayloadOverrides = useCallback((payload: any): any => {
    const overrides = uploadedFieldValueOverridesRef.current;
    if (!payload || !overrides.size) return payload;

    const toUrlOnlyString = (items: Array<string | File>): string => {
      const urls: string[] = [];
      const seen = new Set<string>();
      (items || []).forEach(item => {
        if (!item) return;
        if (typeof item === 'string') {
          item
            .split(',')
            .map(part => part.trim())
            .filter(Boolean)
            .forEach(url => {
              if (seen.has(url)) return;
              seen.add(url);
              urls.push(url);
            });
          return;
        }
        if (typeof item === 'object' && typeof (item as any).url === 'string') {
          const url = ((item as any).url as string).trim();
          if (!url || seen.has(url)) return;
          seen.add(url);
          urls.push(url);
        }
      });
      return urls.join(', ');
    };

    const nextPayload = {
      ...payload,
      values: {
        ...(((payload as any)?.values || {}) as Record<string, any>)
      }
    } as any;

    overrides.forEach(entry => {
      const nextValue = toUrlOnlyString(entry.items);
      if (entry.scope === 'top' && entry.questionId) {
        nextPayload.values[entry.questionId] = nextValue;
        nextPayload[entry.questionId] = nextValue;
        return;
      }
      if (entry.scope === 'line' && entry.groupId && entry.rowId && entry.fieldId) {
        const rawRows = Array.isArray(nextPayload.values[entry.groupId]) ? nextPayload.values[entry.groupId] : [];
        const nextRows = rawRows.map((row: any) => {
          const rowId = ((row?.[ROW_ID_KEY] || row?.id || '') as any).toString();
          if (rowId !== entry.rowId) return row;
          return {
            ...(row || {}),
            [entry.fieldId as string]: nextValue
          };
        });
        nextPayload.values[entry.groupId] = nextRows;
        nextPayload.values[`${entry.groupId}_json`] = JSON.stringify(nextRows);
        nextPayload[entry.groupId] = nextRows;
        nextPayload[`${entry.groupId}_json`] = JSON.stringify(nextRows);
      }
    });

    return nextPayload;
  }, []);

  useEffect(() => {
    autoSaveHoldRef.current = autoSaveHold;
  }, [autoSaveHold]);

  const setAutoSaveHoldFromUi = useCallback(
    (hold: boolean, meta?: { reason?: string }) => {
      const nextHold = !!hold;
      const nextReason = (meta?.reason || '').toString().trim();
      autoSaveHoldRef.current = { hold: nextHold, reason: nextReason || undefined };
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
  const dedupTriggerFieldIdsRef = useRef<Record<string, true>>(computeDedupKeyFieldIdMap((definition as any)?.dedupRules));
  const dedupIdentityFieldIdsRef = useRef<Record<string, true>>(computeDedupKeyFieldIdMap((definition as any)?.dedupRules));
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
  useEffect(() => {
    recordLoadingIdRef.current = recordLoadingId;
  }, [recordLoadingId]);
  useEffect(() => {
    activeGuidedStepIdRef.current = (guidedUiState?.activeStepId || '').toString().trim();
  }, [guidedUiState?.activeStepId]);

  const resolvedRecordFreshness = useMemo(
    () => resolveRecordFreshnessConfig((definition as any)?.recordFreshness),
    [definition]
  );
  const resolvedDataSourceFreshnessWatches = useMemo(
    () => resolveDataSourceFreshnessWatches((definition as any)?.recordFreshness),
    [definition]
  );

  useEffect(() => {
    recordFreshnessConfigRef.current = resolvedRecordFreshness;
  }, [resolvedRecordFreshness]);
  useEffect(() => {
    dataSourceFreshnessWatchesRef.current = resolvedDataSourceFreshnessWatches;
  }, [resolvedDataSourceFreshnessWatches]);
  useEffect(() => {
    scheduleDataSourceFreshnessCheck('stateChange');
  }, [guidedUiState?.activeStepId, recordLoadingId, resolvedDataSourceFreshnessWatches, scheduleDataSourceFreshnessCheck, selectedRecordId, view]);

  const bumpRecordSession = useCallback(
    (args: { reason: string; nextRecordId?: string | null }) => {
      recordSessionRef.current += 1;
      // Cancel any pending autosave timers/queues from the previous record session.
      autoSaveQueuedRef.current = false;
      if (autoSaveTimerRef.current) {
        globalThis.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      reservationSyncPromiseRef.current = null;
      reservationSyncMetaRef.current = null;
      reservationManagedScopesRef.current = null;
      guidedStepImmediateSyncPromiseRef.current = null;
      guidedStepImmediateSyncPendingRef.current = null;
      guidedStepImmediateSyncActiveFingerprintRef.current = '';
      guidedStepImmediateSyncPendingFingerprintRef.current = '';
      pendingDeferredRecordFreshnessSyncRef.current = null;
      dataSourceFreshnessCheckPromiseRef.current = null;
      lastDataSourceFreshnessServerActivityAtByWatchKeyRef.current = {};
      pendingFollowupBatchPromisesRef.current.clear();
      lastDraftSaveFailureRef.current = null;
      optimisticClientDataVersionRef.current = null;
      recordSyncPromiseRef.current = null;
      recordFreshnessCheckPromiseRef.current = null;
      lastLocalRecordMutationAtRef.current = 0;
      lastExternalRecordSyncAtRef.current = 0;
      lastRecordServerActivityAtRef.current = args?.nextRecordId ? Date.now() : 0;
      if (dataSourceFreshnessTimerRef.current) {
        globalThis.clearTimeout(dataSourceFreshnessTimerRef.current);
        dataSourceFreshnessTimerRef.current = null;
      }
      if (recordFreshnessTimerRef.current) {
        globalThis.clearTimeout(recordFreshnessTimerRef.current);
        recordFreshnessTimerRef.current = null;
      }
      recordSyncBusy.forceUnlock();
      setRecordSyncNotice({ open: false, title: '', message: '' });
      logEvent('record.session.bump', {
        reason: (args?.reason || '').toString() || null,
        nextRecordId: args?.nextRecordId ? args.nextRecordId.toString() : null,
        session: recordSessionRef.current
      });
    },
    [logEvent, recordSyncBusy]
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
      } catch {
        // ignore
      }
    };

    const onFieldInteract = (e: Event) => {
      try {
        if (viewRef.current !== 'form') return;
        const target = e.target as HTMLElement | null;
        if (!isFormTarget(target)) return;
        lastUserInteractionRef.current = Date.now();
      } catch {
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
  const [analyticsSnapshot, setAnalyticsSnapshot] = useState<any>(() => {
    const globalAny = globalThis as any;
    const bootstrap = globalAny.__WEB_FORM_BOOTSTRAP__ || null;
    return (bootstrap?.analytics || analytics || null) as any;
  });
  const [analyticsSnapshotRev, setAnalyticsSnapshotRev] = useState<number>(() => {
    const globalAny = globalThis as any;
    const bootstrap = globalAny.__WEB_FORM_BOOTSTRAP__ || null;
    const rev = Number((bootstrap as any)?.analyticsRev ?? analyticsRev ?? (analytics as any)?.revision ?? 0);
    return Number.isFinite(rev) && rev >= 0 ? rev : 0;
  });
  const hasListViewAnalyticsWidgets = useMemo(() => {
    const widgets = Array.isArray(definition.analytics?.widgets) ? definition.analytics.widgets : [];
    return widgets.some(widget => {
      const placements = Array.isArray(widget?.placements) ? widget.placements : ['analyticsPage'];
      return placements.some(token => (token || '').toString().trim() === 'listView');
    });
  }, [definition.analytics?.widgets]);
  const [analyticsOverlayOpen, setAnalyticsOverlayOpen] = useState(false);
  const [analyticsOverlayLoading, setAnalyticsOverlayLoading] = useState(false);
  const [analyticsOverlayError, setAnalyticsOverlayError] = useState<string | null>(null);
  const analyticsOverlayRequestRef = useRef(0);
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
  const listCacheRef = useRef(listCache);
  const listFetchSeqRef = useRef(0);
  const listPrefetchKeyRef = useRef<string>('');
  const listBackgroundPrefetchKeyRef = useRef<string>('');
  const listRecordsRef = useRef<Record<string, WebFormSubmission>>({});
  const dataSourcePrefetchKeyRef = useRef<string>('');
  const formDataSourceRefreshKeyRef = useRef<string>('');
  const listRecordSnapshotPrefetchKeyRef = useRef<string>('');
  const listRecordSnapshotPrefetchByRowRef = useRef<Map<number, Promise<Record<string, WebFormSubmission>>>>(new Map());
  const deferredAnalyticsPrefetchKeyRef = useRef<string>('');
  const guidedDataSourceRefreshTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [, setDataSourceVisibilityVersion] = useState(0);
  const guidedDataSourceConfigs = useMemo(() => collectDataSourceConfigsForPrefetch(definition), [definition]);
  const guidedDataSourceConfigMap = useMemo(() => {
    const byExact = new Map<string, any>();
    const byNormalized = new Map<string, any>();
    guidedDataSourceConfigs.forEach(cfg => {
      const id = (cfg?.id || '').toString().trim();
      if (!id) return;
      if (!byExact.has(id)) byExact.set(id, cfg);
      const normalized = normalizeDataSourceVisibilityKey(id);
      if (normalized && !byNormalized.has(normalized)) byNormalized.set(normalized, cfg);
    });
    return { byExact, byNormalized };
  }, [guidedDataSourceConfigs]);

  useEffect(() => {
    const bump = () => setDataSourceVisibilityVersion(version => version + 1);
    try {
      if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
      window.addEventListener(DATA_SOURCE_CACHE_UPDATED_EVENT, bump as EventListener);
      window.addEventListener(DATA_SOURCE_CACHE_CLEARED_EVENT, bump as EventListener);
      return () => {
        window.removeEventListener(DATA_SOURCE_CACHE_UPDATED_EVENT, bump as EventListener);
        window.removeEventListener(DATA_SOURCE_CACHE_CLEARED_EVENT, bump as EventListener);
      };
    } catch {
      return;
    }
  }, []);

  useEffect(() => {
    return () => {
      guidedDataSourceRefreshTimersRef.current.forEach(timer => clearTimeout(timer));
      guidedDataSourceRefreshTimersRef.current = [];
    };
  }, []);

  useEffect(() => {
    const globalAny = globalThis as any;
    const bootstrap = globalAny.__WEB_FORM_BOOTSTRAP__ || null;
    setAnalyticsSnapshot((bootstrap?.analytics || analytics || null) as any);
  }, [analytics, formKey]);

  useEffect(() => {
    const globalAny = globalThis as any;
    const bootstrap = globalAny.__WEB_FORM_BOOTSTRAP__ || null;
    const rev = Number((bootstrap as any)?.analyticsRev ?? analyticsRev ?? (analytics as any)?.revision ?? 0);
    setAnalyticsSnapshotRev(Number.isFinite(rev) && rev >= 0 ? rev : 0);
  }, [analytics, analyticsRev, formKey]);

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
    if (!homePerfInitialisedRef.current) {
      homePerfInitialisedRef.current = true;
      homeTimeToDataMeasuredRef.current = false;
      perfMark(`ck.home.timeToData.start.${formKey}.${language}`);
      return;
    }
    homeLoadStartedAtRef.current = getPerfNow();
    homeTimeToDataMeasuredRef.current = false;
    perfMark(`ck.home.timeToData.start.${formKey}.${language}`);
  }, [formKey, language, perfMark]);

  useEffect(() => {
    listRecordsRef.current = listCache.records || {};
  }, [listCache.records]);
  useEffect(() => {
    listCacheRef.current = listCache;
  }, [listCache]);

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
    const measuredAtMs = getPerfNow();
    setHomeFirstDataReadyAtMs(prev => (prev > 0 ? prev : Date.now()));
    const startMark = `ck.home.timeToData.start.${formKey}.${language}`;
    const endMark = `ck.home.timeToData.end.${formKey}.${language}`;
    perfMark(endMark);
    perfMeasure('ck.home.timeToData', startMark, endMark, {
      formKey,
      language,
      elapsedMs: measuredAtMs - homeLoadStartedAtRef.current,
      firstItemCount: firstCount
    });
  }, [formKey, language, listCache.response?.items?.length, perfMark, perfMeasure]);

  useEffect(() => {
    if (view !== 'list') return;
    if (homeFirstDataReadyAtMs <= 0) return;
    if (!hasListViewAnalyticsWidgets) return;
    if (analyticsSnapshot && Array.isArray((analyticsSnapshot as any)?.items) && (analyticsSnapshot as any).items.length > 0) return;
    const key = `${formKey}::${homeRevRef.current ?? 'novrev'}`;
    if (deferredAnalyticsPrefetchKeyRef.current === key) return;
    deferredAnalyticsPrefetchKeyRef.current = key;

    let cancelled = false;
    let timer: ReturnType<typeof globalThis.setTimeout> | null = null;
    let idleHandle: number | null = null;
    const run = () => {
      if (cancelled) return;
      const startedAt = Date.now();
      logEvent('analytics.listView.prefetch.start', {
        formKey,
        startedAfterHomeDataMs: Math.max(0, Date.now() - homeFirstDataReadyAtMs)
      });
      fetchBootstrapContextApi(formKey, { includeAnalytics: true })
        .then(res => {
          if (cancelled) return;
          const snapshot = ((res as any)?.analytics || null) as any;
          setAnalyticsSnapshot(snapshot);
          const nextRev = Number((res as any)?.analyticsRev ?? snapshot?.revision ?? 0);
          setAnalyticsSnapshotRev(Number.isFinite(nextRev) && nextRev >= 0 ? nextRev : 0);
          logEvent('analytics.listView.prefetch.ok', {
            formKey,
            itemCount: Array.isArray(snapshot?.items) ? snapshot.items.length : 0,
            durationMs: Date.now() - startedAt
          });
        })
        .catch((err: any) => {
          if (cancelled) return;
          logEvent('analytics.listView.prefetch.error', {
            formKey,
            message: err?.message || err?.toString?.() || 'unknown',
            durationMs: Date.now() - startedAt
          });
        });
    };

    try {
      if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
        idleHandle = (window as any).requestIdleCallback(run, { timeout: HOME_ANALYTICS_PREFETCH_DELAY_MS + 1200 }) as number;
      } else {
        timer = globalThis.setTimeout(run, HOME_ANALYTICS_PREFETCH_DELAY_MS);
      }
    } catch {
      timer = globalThis.setTimeout(run, HOME_ANALYTICS_PREFETCH_DELAY_MS);
    }

    return () => {
      cancelled = true;
      if (timer !== null) globalThis.clearTimeout(timer);
      if (idleHandle !== null && typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
        (window as any).cancelIdleCallback(idleHandle);
      }
    };
  }, [analyticsSnapshot, formKey, hasListViewAnalyticsWidgets, homeFirstDataReadyAtMs, logEvent, view]);

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
    if (homeFirstDataReadyAtMs <= 0) return;
    const key = `${formKey}::${language}`;
    if (dataSourcePrefetchKeyRef.current === key) return;
    dataSourcePrefetchKeyRef.current = key;
    const configs = collectDataSourceConfigsForPrefetch(definition).filter(isHomePrefetchEligibleDataSource);
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
    }, HOME_DATA_SOURCE_PREFETCH_DELAY_MS);
    return () => {
      globalThis.clearTimeout(timer);
    };
  }, [definition, formKey, homeFirstDataReadyAtMs, language, listCache.response?.items?.length, logEvent]);

  useEffect(() => {
    if (!hasTemplateRenderTargets) return;
    if (view !== 'list') return;
    if (homeFirstDataReadyAtMs <= 0) return;
    const items = (listCache.response?.items || []) as ListItem[];
    if (!items.length) return;

    const topCount = Math.min(8, items.length);
    const topRows = items.slice(0, topCount);
    const missingTopRows = topRows.filter(row => {
      const id = ((row as any)?.id || '').toString().trim();
      return !!id && !listRecordsRef.current[id];
    });

    const etag = (listCache.response?.etag || '').toString().trim();
    const key = `${formKey}::${etag || `rows:${items.length}`}::top:${topCount}`;
    if (listRecordSnapshotPrefetchKeyRef.current === key) return;
    listRecordSnapshotPrefetchKeyRef.current = key;

    if (!missingTopRows.length) {
      logEvent('list.records.prefetch.skip', {
        formKey,
        topCount,
        reason: 'alreadyCached',
        etag: etag || null
      });
      return;
    }

    const rowHints = Array.from(
      new Set(
        missingTopRows
          .map(row => Number((row as any)?.__rowNumber))
          .filter(v => Number.isFinite(v) && v >= 2)
          .map(v => Math.floor(v))
      )
    );
    if (!rowHints.length) {
      logEvent('list.records.prefetch.skip', {
        formKey,
        topCount,
        missingCount: missingTopRows.length,
        reason: 'missingRowHints',
        etag: etag || null
      });
      return;
    }

    const primeRowHints = rowHints.slice(0, 1);
    const restRowHints = rowHints.slice(1);

    let cancelled = false;
    let primeTimerHandle: ReturnType<typeof globalThis.setTimeout> | null = null;
    let restTimerHandle: ReturnType<typeof globalThis.setTimeout> | null = null;
    let restIdleHandle: number | null = null;

    const runPrefetch = async (
      phase: 'prime' | 'rest',
      hints: number[],
      metricName: string
    ) => {
      if (cancelled || !hints.length) return;
      const startedAt = Date.now();
      const startMark = `${metricName}.start.${startedAt}`;
      const endMark = `${metricName}.end.${startedAt}`;
      logEvent('list.records.prefetch.start', {
        formKey,
        phase,
        topCount,
        missingCount: missingTopRows.length,
        rowHintCount: hints.length,
        etag: etag || null
      });
      perfMark(startMark);
      try {
        // Fetch by row numbers so we avoid re-running expensive sorted list assembly.
        const requestPromise = fetchRecordsByRowNumbers(formKey, hints);
        hints.forEach(rowNumber => {
          listRecordSnapshotPrefetchByRowRef.current.set(rowNumber, requestPromise);
        });
        const prefetchedRecords = await requestPromise;
        if (cancelled) return;
        perfMark(endMark);
        const receivedIds = prefetchedRecords ? Object.keys(prefetchedRecords) : [];
        if (receivedIds.length) {
          setListCache(prev => ({
            response: prev.response,
            records: { ...(prev.records || {}), ...prefetchedRecords }
          }));
        }
        perfMeasure(metricName, startMark, endMark, {
          formKey,
          phase,
          requested: topCount,
          requestedRows: hints.length,
          missing: missingTopRows.length,
          received: receivedIds.length
        });
        logEvent('list.records.prefetch.ok', {
          formKey,
          phase,
          requested: topCount,
          requestedRows: hints.length,
          missing: missingTopRows.length,
          received: receivedIds.length,
          durationMs: Date.now() - startedAt
        });
      } catch (err: any) {
        perfMark(endMark);
        perfMeasure(metricName, startMark, endMark, {
          formKey,
          phase,
          requested: topCount,
          requestedRows: hints.length,
          missing: missingTopRows.length,
          failed: true
        });
        const msg = (err?.message || err?.toString?.() || 'failed').toString();
        logEvent('list.records.prefetch.error', {
          formKey,
          phase,
          requested: topCount,
          requestedRows: hints.length,
          missing: missingTopRows.length,
          message: msg,
          durationMs: Date.now() - startedAt
        });
      } finally {
        hints.forEach(rowNumber => {
          const inFlight = listRecordSnapshotPrefetchByRowRef.current.get(rowNumber);
          if (inFlight) {
            listRecordSnapshotPrefetchByRowRef.current.delete(rowNumber);
          }
        });
      }
    };

    const scheduleRestPrefetch = () => {
      if (cancelled || !restRowHints.length) return;
      try {
        if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
          restIdleHandle = (window as any).requestIdleCallback(
            () => {
              restIdleHandle = null;
              void runPrefetch('rest', restRowHints, 'ck.list.records.prefetch.rest.rpc');
            },
            { timeout: 2500 }
          ) as number;
          return;
        }
      } catch {
        // fall through to timeout path
      }
      restTimerHandle = globalThis.setTimeout(() => {
        restTimerHandle = null;
        void runPrefetch('rest', restRowHints, 'ck.list.records.prefetch.rest.rpc');
      }, HOME_RECORD_PREFETCH_DELAY_MS);
    };

    primeTimerHandle = globalThis.setTimeout(() => {
      primeTimerHandle = null;
      void runPrefetch('prime', primeRowHints, 'ck.list.records.prefetch.rpc').finally(() => {
        scheduleRestPrefetch();
      });
    }, HOME_RECORD_PREFETCH_DELAY_MS);

    return () => {
      cancelled = true;
      if (primeTimerHandle !== null) globalThis.clearTimeout(primeTimerHandle);
      if (restTimerHandle !== null) globalThis.clearTimeout(restTimerHandle);
      if (restIdleHandle !== null && typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
        (window as any).cancelIdleCallback(restIdleHandle);
      }
    };
  }, [
    formKey,
    hasTemplateRenderTargets,
    homeFirstDataReadyAtMs,
    listCache.response?.etag,
    listCache.response?.items,
    perfMark,
    perfMeasure,
    view,
    logEvent
  ]);

  const listViewProjection = useMemo(() => {
    const cols = (definition.listView?.columns || []) as any[];
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
    collectListViewMetricDependencies(definition.listView?.metric).forEach(add);
    return Array.from(ids);
  }, [definition.listView]);

  useEffect(() => {
    if (!definition.listView) return;
    if (view !== 'list') return;
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
    const existingListCache = listCacheRef.current;
    const hasExisting = Boolean(existingListCache.response?.items?.length);
    const existingEtag = (existingListCache.response?.etag || '').toString().trim();
    const canReuseFirstPage = hasExisting && listRefreshToken === 0;
    const skipInitialServerCheck = canReuseFirstPage && initialHomeListSource === 'bootstrap';
    const canUseConditionalFirstPage = canReuseFirstPage && !!existingEtag && !skipInitialServerCheck;

    setListFetchNotice(null);
    setListFetch({
      phase: hasExisting ? 'prefetching' : 'loading',
      loaded: hasExisting ? (existingListCache.response?.items?.length || 0) : 0,
      total: existingListCache.response?.totalCount || undefined,
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

    let backgroundCancelled = false;
    let backgroundTimerHandle: ReturnType<typeof globalThis.setTimeout> | null = null;
    let backgroundIdleHandle: number | null = null;

    void (async () => {
      try {
        const encodePageTokenClient = (offset: number): string => {
          const n = Math.max(0, Math.floor(Number(offset) || 0));
          const text = n.toString();
          try {
            if (typeof globalThis !== 'undefined' && typeof (globalThis as any).btoa === 'function') {
              return (globalThis as any).btoa(text);
            }
          } catch {
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
          if (!args.token && args.pageIndex === 0 && !skipInitialServerCheck) {
            const homeBootstrapStartMark = `ck.home.bootstrap.rpc.start.${seq}.${args.pageIndex}`;
            const homeBootstrapEndMark = `ck.home.bootstrap.rpc.end.${seq}.${args.pageIndex}`;
            perfMark(homeBootstrapStartMark);
            try {
              const prefetchedHomeBootstrap = consumePrefetchedHomeBootstrapApi(formKey);
              const bootstrapRes = prefetchedHomeBootstrap
                ? await prefetchedHomeBootstrap
                : await fetchHomeBootstrapApi(formKey, homeRevRef.current);
              perfMark(homeBootstrapEndMark);
              perfMeasure('ck.home.bootstrap.rpc', homeBootstrapStartMark, homeBootstrapEndMark, {
                formKey,
                pageIndex: args.pageIndex,
                rev: (bootstrapRes as any)?.rev ?? null,
                notModified: Boolean((bootstrapRes as any)?.notModified),
                cache: (bootstrapRes as any)?.cache || null,
                prefetched: Boolean(prefetchedHomeBootstrap)
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
                  totalCount: Number((existingListCache.response as any)?.totalCount || 0),
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
          const maxAttempts = 5;
          for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
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
              maxAttempts,
              token: args.token || null,
              pageIndex: args.pageIndex,
              resType: batch === null ? 'null' : typeof batch
            });
            if (attempt < maxAttempts - 1) {
              await sleep(Math.min(2000, 250 * Math.pow(2, attempt)));
            }
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
          if (!skipInitialServerCheck || !existingListCache.response || !Array.isArray((existingListCache.response as any).items)) {
            return null;
          }
          const bootstrapList = {
            ...(existingListCache.response as ListResponse),
            notModified: undefined
          } as ListResponse;
          const bootstrapBatch = {
            list: bootstrapList,
            records: (existingListCache.records || {}) as Record<string, WebFormSubmission>
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
        const existingResponseHasPrefetchMeta =
          typeof (existingListCache.response as any)?.contiguousItemCount === 'number' &&
          typeof (existingListCache.response as any)?.completeData === 'boolean';
        if (canReuseFirstPage && first.notModified && existingResponseHasPrefetchMeta) {
          const existingCount = existingListCache.response?.items?.length || 0;
          const existingTotalRaw = Number((existingListCache.response as any)?.totalCount || existingCount);
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
        if (canReuseFirstPage && first.notModified && existingListCache.response && !existingResponseHasPrefetchMeta) {
          logEvent('list.sorted.prefetch.cacheBackfill', {
            formKey,
            cachedItems: existingListCache.response.items?.length || 0,
            totalCount: (existingListCache.response as any)?.totalCount || 0
          });
        }
        const firstList =
          canReuseFirstPage && first.notModified && existingListCache.response
            ? ({
                ...(existingListCache.response as ListResponse),
                notModified: undefined
              } as ListResponse)
            : first.list;
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
        const failedPages = new Map<number, string>();
        const recordsAccum: Record<string, WebFormSubmission> = {
          ...((existingListCache.records || {}) as Record<string, WebFormSubmission>),
          ...((((first as any).batch as any)?.records as Record<string, WebFormSubmission>) || {})
        };
        itemsByPage.set(0, (firstList.items || []) as ListItem[]);

        const buildAggregated = (): ListItem[] => aggregatePrefetchedPageItems(itemsByPage, totalPages);
        const buildContiguous = (): ListItem[] => aggregateContiguousPrefetchedPageItems(itemsByPage, totalPages);

        const applyProgress = (phaseOverride?: 'idle' | 'prefetching') => {
          const aggregated = buildAggregated();
          const contiguous = buildContiguous();
          const resolvedPageCount = itemsByPage.size + failedPages.size;
          const hasMore = resolvedPageCount < totalPages;
          const completeData = !hasMore && failedPages.size === 0 && aggregated.length >= cappedTotalCount && cappedTotalCount < 200;
          setListCache(prev => ({
            response: {
              ...firstList,
              notModified: undefined,
              items: aggregated,
              nextPageToken: hasMore ? ((firstList as any).nextPageToken || '__prefetching__') : undefined,
              contiguousItemCount: contiguous.length,
              completeData
            },
            records: { ...(prev.records || {}), ...recordsAccum }
          }));
          setListFetch({
            phase: phaseOverride || (hasMore ? 'prefetching' : 'idle'),
            loaded: aggregated.length,
            total: cappedTotalCount || aggregated.length,
            pages: itemsByPage.size
          });
          return aggregated.length;
        };

        const firstAggregatedCount = applyProgress(totalPages > 1 ? 'idle' : undefined);
        logEvent('list.sorted.prefetch.page', {
          page: 1,
          pageItems: (itemsByPage.get(0) || []).length,
          aggregated: firstAggregatedCount,
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

        const backgroundPrefetchKey = `${formKey}::${existingEtag || (firstList as any).etag || 'noetag'}::${listRefreshToken}`;
        if (listBackgroundPrefetchKeyRef.current === backgroundPrefetchKey) {
          return;
        }
        listBackgroundPrefetchKeyRef.current = backgroundPrefetchKey;
        logEvent('list.sorted.prefetch.deferred', {
          formKey,
          pagesRemaining: Math.max(0, totalPages - 1),
          loaded: firstAggregatedCount,
          totalCount: cappedTotalCount,
          delayMs: HOME_LIST_BACKGROUND_PREFETCH_DELAY_MS
        });

        const runRemainingPages = async () => {
          if (backgroundCancelled || seq !== listFetchSeqRef.current) return;
          setListFetch(prev => ({
            phase: 'prefetching',
            loaded: prev.loaded,
            total: prev.total,
            pages: prev.pages
          }));
          const remainingPageIndexes = Array.from({ length: totalPages - 1 }, (_, idx) => idx + 1);
          await runWithConcurrencyLimit(remainingPageIndexes, 1, async pageIndex => {
            if (backgroundCancelled || seq !== listFetchSeqRef.current) return;
              const offset = pageIndex * pageSize;
              const token = encodePageTokenClient(offset);
              const pageStartedAt = Date.now();
            try {
              const res = await fetchPage({ token, pageIndex, allowConditional: false });
              if (backgroundCancelled || seq !== listFetchSeqRef.current) return;
              const items = (res.list.items || []) as ListItem[];
              itemsByPage.set(pageIndex, items);
              failedPages.delete(pageIndex);
              const newRecords = (((res.batch as any)?.records as Record<string, WebFormSubmission>) || {}) as Record<string, WebFormSubmission>;
              Object.keys(newRecords).forEach(id => {
                recordsAccum[id] = newRecords[id];
              });
              const aggregatedCount = applyProgress();
              const resolvedPageCount = itemsByPage.size + failedPages.size;
              logEvent('list.sorted.prefetch.page', {
                page: pageIndex + 1,
                pageItems: items.length,
                aggregated: aggregatedCount,
                totalCount: cappedTotalCount,
                hasNext: resolvedPageCount < totalPages,
                durationMs: Date.now() - startedAt,
                pageDurationMs: Date.now() - pageStartedAt,
                prefetchMode: 'sequential'
              });
            } catch (err: any) {
              if (backgroundCancelled || seq !== listFetchSeqRef.current) return;
              const message = resolveLogMessage(err, 'Failed to load list page.');
              failedPages.set(pageIndex, message);
              const aggregatedCount = applyProgress();
              logEvent('list.sorted.prefetch.page.error', {
                page: pageIndex + 1,
                totalCount: cappedTotalCount,
                loadedPages: itemsByPage.size,
                loadedItems: aggregatedCount,
                message,
                durationMs: Date.now() - startedAt,
                pageDurationMs: Date.now() - pageStartedAt,
                prefetchMode: 'sequential'
              });
            }
          });
          if (backgroundCancelled || seq !== listFetchSeqRef.current) return;
          if (failedPages.size) {
            const partialAggregatedCount = applyProgress('idle');
            logEvent('list.sorted.prefetch.partial', {
              pages: itemsByPage.size,
              items: partialAggregatedCount,
              failedPages: Array.from(failedPages.keys()).map(page => page + 1),
              failedCount: failedPages.size,
              durationMs: Date.now() - startedAt
            });
            return;
          }
          const finalAggregatedCount = applyProgress('idle');
          logEvent('list.sorted.prefetch.done', {
            pages: totalPages,
            items: finalAggregatedCount,
            durationMs: Date.now() - startedAt
          });
        };

        try {
          if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
            backgroundIdleHandle = (window as any).requestIdleCallback(
              () => {
                backgroundIdleHandle = null;
                void runRemainingPages();
              },
              { timeout: HOME_LIST_BACKGROUND_PREFETCH_DELAY_MS + 1200 }
            ) as number;
          } else {
            backgroundTimerHandle = globalThis.setTimeout(() => {
              backgroundTimerHandle = null;
              void runRemainingPages();
            }, HOME_LIST_BACKGROUND_PREFETCH_DELAY_MS);
          }
        } catch {
          backgroundTimerHandle = globalThis.setTimeout(() => {
            backgroundTimerHandle = null;
            void runRemainingPages();
          }, HOME_LIST_BACKGROUND_PREFETCH_DELAY_MS);
        }
      } catch (err: any) {
        if (seq !== listFetchSeqRef.current) return;
        const uiMessage = resolveUiErrorMessage(err, 'Failed to load list.');
        const logMessage = resolveLogMessage(err, 'Failed to load list.');
        if ((err as any)?.__ckUiTone === 'info') {
          setListFetch(prev => ({ ...prev, phase: 'idle', message: undefined }));
          logEvent('list.sorted.prefetch.noticeSuppressed', {
            kind: (err as any)?.__ckUiKind || null,
            message: logMessage,
            existingCount: (listCacheRef.current.response?.items || []).length
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
    return () => {
      backgroundCancelled = true;
      if (backgroundTimerHandle !== null) globalThis.clearTimeout(backgroundTimerHandle);
      if (backgroundIdleHandle !== null && typeof window !== 'undefined' && 'cancelIdleCallback' in window) {
        (window as any).cancelIdleCallback(backgroundIdleHandle);
      }
    };
    // Cancel when leaving the list view so opening a record does not keep issuing
    // background list page requests the user can no longer benefit from.
  }, [
    definition.listView,
    formKey,
    initialHomeListSource,
    listRefreshToken,
    listViewProjection,
    logEvent,
    perfMark,
    perfMeasure,
    resolveLogMessage,
    resolveUiErrorMessage,
    view
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
    if (submitting || updateRecordBusyOpen || recordSyncBusyOpen || Boolean(recordLoadingId) || precreateDedupChecking) return;

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
        submit: (payload: any) => submitCurrentRecordMutation('readyForProduction.unlock', payload),
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
        synchronizeStaleRecord: (args: Parameters<SynchronizeStaleRecordFn>[0]) => synchronizeStaleRecordRef.current(args),
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
    recordSyncBusyOpen,
    readyForProductionUnlockResolution.source,
    readyForProductionUnlockResolution.unlockRecordId,
    readyForProductionUnlockStatus,
    recordLoadingId,
    selectedRecordId,
    selectedRecordSnapshot,
    submitting,
    submitCurrentRecordMutation,
    updateRecordBusy,
    updateRecordBusyOpen,
    upsertListCacheRow,
    view
  ]);

  const applyRecordSnapshot = useCallback(
    (snapshot: WebFormSubmission): RecordSnapshotApplyMode => {
      const id = snapshot?.id;
      if (!snapshot || !id) {
        lastRecordSnapshotApplyModeRef.current = { mode: 'ignored', recordId: null, dataVersion: null };
        return 'ignored';
      }
      const currentRecordId =
        resolveExistingRecordId({
          selectedRecordId: selectedRecordIdRef.current,
          selectedRecordSnapshot: selectedRecordSnapshotRef.current,
          lastSubmissionMetaId: lastSubmissionMetaRef.current?.id || null
        }) || '';
      const incomingDataVersion = resolveCurrentClientDataVersion((snapshot as any)?.dataVersion);
      const currentDataVersion = resolveCurrentClientDataVersion(
        recordDataVersionRef.current,
        optimisticClientDataVersionRef.current,
        lastSubmissionMetaRef.current?.dataVersion,
        (selectedRecordSnapshotRef.current as any)?.dataVersion
      );
      if (
        !shouldApplyIncomingRecordSnapshot({
          incomingRecordId: id,
          currentRecordId,
          incomingDataVersion,
          currentDataVersion
        })
      ) {
        logEvent('record.snapshot.ignored.olderVersion', {
          recordId: id,
          incomingDataVersion,
          currentDataVersion
        });
        lastRecordSnapshotApplyModeRef.current = {
          mode: 'ignored',
          recordId: id,
          dataVersion: incomingDataVersion
        };
        return 'ignored';
      }
      const normalized = normalizeRecordValues(definition, snapshot.values || {});
      const initialLineItems = buildInitialLineItems(definition, normalized);
      const mapped = applyValueMapsToForm(definition, normalized, initialLineItems, { mode: 'init' });
      const reconciledState = reconcileAutoAddModeGroups({
        definition,
        values: mapped.values,
        lineItems: mapped.lineItems,
        optionState: optionStateRef.current,
        language: languageRef.current,
        ensureLineOptions: ensureLineOptionsRef.current
      });
      const nextMappedValues = reconciledState.changed ? reconciledState.values : mapped.values;
      const nextMappedLineItems = reconciledState.changed ? reconciledState.lineItems : mapped.lineItems;
      const currentStatusRaw =
        ((lastSubmissionMetaRef.current?.status || selectedRecordSnapshotRef.current?.status || '') as any)?.toString?.() || '';
      const incomingStatusRaw = ((snapshot.status || '') as any)?.toString?.() || '';
      const shouldAdoptMetaOnly = shouldAdoptIncomingRecordSnapshotMetaOnly({
        incomingRecordId: id,
        currentRecordId,
        incomingDataVersion,
        currentDataVersion,
        incomingStatus: incomingStatusRaw,
        currentStatus: currentStatusRaw,
        incomingValues: nextMappedValues,
        incomingLineItems: nextMappedLineItems,
        currentValues: valuesRef.current,
        currentLineItems: lineItemsRef.current,
        formKey,
        language: languageRef.current
      });
      if (shouldAdoptMetaOnly) {
        recordStaleRef.current = null;
        setRecordStale(null);
        pendingDeferredRecordFreshnessSyncRef.current = null;
        recordDataVersionRef.current =
          snapshot && Number.isFinite(Number((snapshot as any).dataVersion)) ? Number((snapshot as any).dataVersion) : null;
        optimisticClientDataVersionRef.current = recordDataVersionRef.current;
        if (snapshot && Number.isFinite(Number((snapshot as any).__rowNumber))) {
          recordRowNumberRef.current = Number((snapshot as any).__rowNumber);
        }
        autoSaveDirtyRef.current = false;
        if (autoSaveTimerRef.current) {
          globalThis.clearTimeout(autoSaveTimerRef.current);
          autoSaveTimerRef.current = null;
        }
        setDraftSave({ phase: 'idle' });
        rememberAutoSaveSeenState(valuesRef.current, lineItemsRef.current);
        setRecordLoadingId(null);
        setRecordLoadError(null);
        selectedRecordSnapshotRef.current = snapshot;
        setSelectedRecordSnapshot(snapshot);
        setLastSubmissionMeta(prev => ({
          ...(prev || {}),
          id,
          createdAt: snapshot.createdAt,
          updatedAt: snapshot.updatedAt,
          dataVersion: (snapshot as any).dataVersion,
          status: snapshot.status || null
        }));
        lastSubmissionMetaRef.current = {
          ...(lastSubmissionMetaRef.current || {}),
          id,
          createdAt: snapshot.createdAt,
          updatedAt: snapshot.updatedAt,
          dataVersion: (snapshot as any).dataVersion,
          status: snapshot.status || null
        };
        setListCache(prev => ({
          response: prev.response,
          records: { ...prev.records, [id]: snapshot }
        }));
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
        } catch {
          // ignore
        }
        lastRecordSnapshotApplyModeRef.current = {
          mode: 'metaOnly',
          recordId: id,
          dataVersion: incomingDataVersion
        };
        logEvent('record.snapshot.metaOnlyAdopted', {
          recordId: id,
          incomingDataVersion,
          currentDataVersion,
          autoAddGroupRebuilds: reconciledState.changedCount
        });
        return 'metaOnly';
      }
      setPrefetchedSummaryHtml(null);
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
      resetFieldChangeTransientState();
      // Applying a fresh snapshot clears any "stale record" banner and updates our base dataVersion.
      recordStaleRef.current = null;
      setRecordStale(null);
      pendingDeferredRecordFreshnessSyncRef.current = null;
      recordDataVersionRef.current =
        snapshot && Number.isFinite(Number((snapshot as any).dataVersion)) ? Number((snapshot as any).dataVersion) : null;
      optimisticClientDataVersionRef.current = recordDataVersionRef.current;
      // Best-effort: capture rowNumber when present on the snapshot.
      if (snapshot && Number.isFinite(Number((snapshot as any).__rowNumber))) {
        recordRowNumberRef.current = Number((snapshot as any).__rowNumber);
      }
      // Loading a snapshot from the server/list is an "edit existing record" flow,
      // except when we are reloading the CURRENT draft record during create-flow.
      const isReloadingCurrentCreateFlow = createFlowRef.current && currentRecordId && currentRecordId === id;
      if (!isReloadingCurrentCreateFlow) {
        createFlowRef.current = false;
      }
      createFlowUserEditedRef.current = true;
      if (!isReloadingCurrentCreateFlow) {
        autoSaveUserEditedRef.current = false;
      }
      dedupHoldRef.current = false;
      // Treat the loaded snapshot's dedup signature as "already checked" so we don't spam dedup checks
      // on every record navigation. Subsequent edits of dedup-key fields will force a re-check.
      try {
        const baseline = computeDedupSignatureFromValues(dedupPrecheckRules, nextMappedValues as any);
        lastDedupCheckedSignatureRef.current = (baseline || '').toString();
        dedupSignatureRef.current = lastDedupCheckedSignatureRef.current;
        dedupBaselineSignatureRef.current = lastDedupCheckedSignatureRef.current;
        dedupKeyFingerprintBaselineRef.current = computeDedupKeyFingerprint(
          (definition as any)?.dedupRules,
          nextMappedValues as any
        );
      } catch {
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
      rememberAutoSaveSeenState(nextMappedValues, nextMappedLineItems);
      // Keep refs in sync immediately so any follow-up actions (e.g. list-triggered button previews) can use
      // the freshly loaded record values without waiting for a re-render.
      valuesRef.current = nextMappedValues;
      lineItemsRef.current = nextMappedLineItems;
      selectedRecordIdRef.current = id;
      selectedRecordSnapshotRef.current = snapshot;
      setValues(nextMappedValues);
      setLineItems(nextMappedLineItems);
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
      } catch {
        // ignore
      }
      lastRecordSnapshotApplyModeRef.current = {
        mode: 'applied',
        recordId: id,
        dataVersion: incomingDataVersion
      };
      logEvent('record.snapshot.applied', {
        recordId: id,
        incomingDataVersion,
        currentDataVersion,
        autoAddGroupRebuilds: reconciledState.changedCount
      });
      return 'applied';
    },
    [
      dedupPrecheckRules,
      definition,
      formKey,
      logEvent,
      rememberAutoSaveSeenState,
      resetFieldChangeTransientState,
      upsertListCacheRow
    ]
  );

  const loadRecordSnapshot = useCallback(
    async (recordId: string, rowNumberHint?: number, options?: { background?: boolean }): Promise<boolean> => {
      const candidateRow = rowNumberHint && Number.isFinite(rowNumberHint) && rowNumberHint >= 2 ? rowNumberHint : undefined;
      const background = options?.background === true;
      if (!recordId && !candidateRow) return false;
      if (candidateRow) {
        recordRowNumberRef.current = candidateRow;
      }
      const seq = ++recordFetchSeqRef.current;
      const startedAt = Date.now();
      if (!background) {
        setRecordLoadingId(recordId || (candidateRow ? `row:${candidateRow}` : null));
        setRecordLoadError(null);
      }
      logEvent('record.fetch.start', { recordId: recordId || null, rowNumberHint: candidateRow || null, background });
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
        const applyMode = applyRecordSnapshot(snapshot);
        markRecordFreshnessServerTouch({ reason: 'record.load', recordId: snapshot.id || recordId });
        logEvent('record.fetch.done', {
          recordId: snapshot.id || recordId,
          durationMs: Date.now() - startedAt,
          background,
          applyMode
        });
        return true;
      } catch (err: any) {
        if (seq !== recordFetchSeqRef.current) return false;
        const uiMessage = resolveUiErrorMessage(err, 'Failed to load record.');
        const logMessage = resolveLogMessage(err, 'Failed to load record.');
        if (!background) {
          setRecordLoadError(uiMessage);
          setRecordLoadingId(null);
        }
        logEvent('record.fetch.error', {
          recordId,
          message: logMessage,
          rowNumberHint,
          durationMs: Date.now() - startedAt,
          background
        });
        return false;
      }
    },
    [applyRecordSnapshot, formKey, logEvent, markRecordFreshnessServerTouch, resolveLogMessage, resolveUiErrorMessage]
  );

  useEffect(() => {
    const currentDataVersion = getCurrentKnownClientDataVersion();
    const delayMs = resolveRecordFreshnessTimerDelay({
      config: resolvedRecordFreshness,
      view,
      recordId: getCurrentOpenRecordId(),
      hasServerVersion: Number.isFinite(Number(currentDataVersion)) && Number(currentDataVersion) > 0,
      recordLoading: Boolean(recordLoadingId),
      now: Date.now(),
      lastServerActivityAt: lastRecordServerActivityAtRef.current || null
    });
    if (delayMs === null) {
      clearRecordFreshnessTimer();
      return;
    }
    scheduleRecordFreshnessCheck('stateChange');
    return clearRecordFreshnessTimer;
  }, [
    clearRecordFreshnessTimer,
    getCurrentKnownClientDataVersion,
    getCurrentOpenRecordId,
    lastSubmissionMeta?.dataVersion,
    lastSubmissionMeta?.id,
    recordLoadingId,
    resolvedRecordFreshness,
    scheduleRecordFreshnessCheck,
    selectedRecordId,
    selectedRecordSnapshot?.id,
    selectedRecordSnapshot?.dataVersion,
    view
  ]);

  const handleGlobalRefresh = useCallback(async () => {
    // Clear client caches (data sources + rendered HTML) to avoid stale derived content without requiring a full reload.
    try {
      clearFetchDataSourceCache();
      clearBundledHtmlClientCaches();
      clearHtmlRenderClientCache();
      setOptionState({});
      setTooltipState({});
      optionStateRef.current = {};
      tooltipStateRef.current = {};
      preloadPromisesRef.current = {};
      logEvent('cache.client.clear', { scope: 'refresh', optionsCleared: true });
    } catch (err: any) {
      logEvent('cache.client.clear.error', { message: err?.message || err?.toString?.() || 'unknown' });
    }
    // Trigger a list refresh, but keep the current list visible until new data arrives.
    requestListRefresh({ clearResponse: false });
    if (!selectedRecordId) return;
    await loadRecordSnapshot(selectedRecordId);
  }, [loadRecordSnapshot, logEvent, requestListRefresh, selectedRecordId]);

  const synchronizeStaleRecord = useCallback<SynchronizeStaleRecordFn>(
    async args => {
      const recordId = (args.recordId || selectedRecordIdRef.current || '').toString().trim();
      if (!recordId) return false;
      if (recordSyncPromiseRef.current) {
        return recordSyncPromiseRef.current;
      }

      pendingDeferredRecordFreshnessSyncRef.current = null;
      autoSaveDirtyRef.current = false;
      autoSaveQueuedRef.current = false;
      if (autoSaveTimerRef.current) {
        globalThis.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      setDraftSave({ phase: 'idle' });
      recordStaleRef.current = null;
      setRecordStale(null);
      setStatus(null);
      setStatusLevel(null);

      const promise = (async () => {
        logEvent('record.sync.start', {
          reason: args.reason,
          recordId,
          cachedVersion: args.cachedVersion ?? null,
          serverVersion: args.serverVersion ?? null,
          serverRow: args.serverRow ?? null
        });
        const refreshed = await loadRecordSnapshot(recordId, args.serverRow || undefined, { background: true });
        if (refreshed) {
          const applyMode = lastRecordSnapshotApplyModeRef.current.mode;
          recordStaleRef.current = null;
          setRecordStale(null);
          if (applyMode === 'metaOnly') {
            setRecordSyncNotice({ open: false, title: '', message: '' });
            logEvent('record.sync.metaOnly', {
              reason: args.reason,
              recordId,
              cachedVersion: args.cachedVersion ?? null,
              serverVersion: args.serverVersion ?? null,
              serverRow: args.serverRow ?? null
            });
            return true;
          }
          lastExternalRecordSyncAtRef.current = Date.now();
          setGuidedExternalSyncToken(prev => prev + 1);
          setRecordSyncNotice({
            open: true,
            title: tSystem('record.syncedTitle', languageRef.current, 'Record synchronized'),
            message: tSystem(
              'record.synced',
              languageRef.current,
              'The source data changed while you were editing. We loaded the latest version. Please review and adapt your changes as needed.'
            )
          });
          logEvent('record.sync.success', {
            reason: args.reason,
            recordId,
            serverRow: args.serverRow ?? null,
            applyMode
          });
          return true;
        }

        const fallbackMessage = tSystem(
          'record.syncFailed',
          languageRef.current,
          'We could not synchronize the latest record automatically. Use Refresh in the header to continue.'
        );
        const staleInfo: RecordStaleInfo = {
          recordId,
          message: fallbackMessage,
          cachedVersion: args.cachedVersion ?? undefined,
          serverVersion: args.serverVersion ?? undefined,
          serverRow: args.serverRow ?? undefined
        };
        recordStaleRef.current = staleInfo;
        setRecordStale(staleInfo);
        setStatus(fallbackMessage);
        setStatusLevel('error');
        logEvent('record.sync.failed', {
          reason: args.reason,
          recordId,
          serverRow: args.serverRow ?? null
        });
        return false;
      })().finally(() => {
        recordSyncPromiseRef.current = null;
        resumeDeferredRecordFreshnessSyncRef.current('recordSync.release');
      });

      recordSyncPromiseRef.current = promise;
      return promise;
    },
    [loadRecordSnapshot, logEvent, setStatus, setStatusLevel]
  );
  synchronizeStaleRecordRef.current = synchronizeStaleRecord;

  const resumeDeferredRecordFreshnessSyncIfUnblocked = useCallback(
    (reason: string): boolean => {
      const pending = pendingDeferredRecordFreshnessSyncRef.current;
      const action = resolveDeferredRecordFreshnessResumeAction({
        pending,
        view: viewRef.current,
        currentRecordId: getCurrentOpenRecordId(),
        recordLoading: Boolean(recordLoadingIdRef.current),
        submitting: submittingRef.current,
        recordSyncInFlight: Boolean(recordSyncPromiseRef.current),
        blockers: getRecordFreshnessSyncBlockers()
      });
      if (action === 'none' || action === 'wait') return false;
      if (action === 'clear') {
        pendingDeferredRecordFreshnessSyncRef.current = null;
        return false;
      }
      if (!pending) return false;
      pendingDeferredRecordFreshnessSyncRef.current = null;
      logEvent('record.freshness.deferred.resume', {
        reason: pending.reason,
        resumeReason: reason,
        recordId: pending.recordId || null,
        cachedVersion: pending.cachedVersion ?? null,
        serverVersion: pending.serverVersion ?? null,
        serverRow: pending.serverRow ?? null
      });
      void synchronizeStaleRecordRef.current({
        ...pending,
        reason: `${pending.reason}.resume`
      });
      return true;
    },
    [getCurrentOpenRecordId, getRecordFreshnessSyncBlockers, logEvent]
  );
  resumeDeferredRecordFreshnessSyncRef.current = resumeDeferredRecordFreshnessSyncIfUnblocked;

  useEffect(() => {
    resumeDeferredRecordFreshnessSyncIfUnblocked('reactivity');
  }, [draftSave.phase, recordLoadingId, resumeDeferredRecordFreshnessSyncIfUnblocked, submitting, view]);

  const loadOptionsForField = useCallback(
    (field: any, groupId?: string) => {
      if (!field?.dataSource) return Promise.resolve();
      const key = optionKey(field.id, groupId);
      const existing = getOptionStateValue(optionStateRef.current, field.id, groupId);
      const needsTooltips = !!(existing as any)?.tooltips;
      const existingTooltips = getOptionStateValue(tooltipStateRef.current, field.id, groupId);
      if (existing && (!needsTooltips || existingTooltips)) return Promise.resolve();
      if (preloadPromisesRef.current[key]) return preloadPromisesRef.current[key];
      const promise = loadOptionsFromDataSource(field.dataSource, language)
        .then(res => {
          if (res) {
            setOptionState(prev => mergeOptionStateValue(prev, field.id, groupId, res));
            if (res.tooltips) {
              setTooltipState(prev => mergeOptionStateValue(prev, field.id, groupId, res.tooltips || {}));
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
  useEffect(() => {
    ensureLineOptionsRef.current = ensureLineOptions;
  }, [ensureLineOptions]);

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
      } catch {
        try {
          globalThis.scrollTo?.(0, 0);
        } catch {
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
      const signature = computeDedupSignatureFromValues(dedupPrecheckRules, args.values as any);
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
    [dedupPrecheckRules, definition, formKey, logEvent, openExistingRecordFromDedup]
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
      resetFieldChangeTransientState();
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
      optimisticClientDataVersionRef.current = null;
      recordRowNumberRef.current = null;
      rememberAutoSaveSeenState(mapped.values, mapped.lineItems);
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
  }, [
    bumpRecordSession,
    definition,
    logEvent,
    precheckCreateDedupAndMaybeNavigate,
    rememberAutoSaveSeenState,
    resetFieldChangeTransientState
  ]);

  const handleDuplicateCurrent = useCallback(() => {
    bumpRecordSession({ reason: 'duplicateCurrent', nextRecordId: null });
    createFlowRef.current = true;
    createFlowUserEditedRef.current = false;
    autoSaveUserEditedRef.current = false;
    dedupHoldRef.current = false;
    resetFieldChangeTransientState();
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
    optimisticClientDataVersionRef.current = null;
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
      const dropped = applyCopyCurrentRecordDropFields({
        definition: definition as any,
        values: cleared.values as any,
        lineItems: cleared.lineItems,
        dropFields
      });
      const nextValues: Record<string, any> = { ...(dropped.values as any) };
      const nextLineItems: any = dropped.lineItems;
      logEvent('ui.copyCurrent.dropFields', {
        count: dropFields.length,
        droppedValuesCount: dropped.droppedValues.length,
        droppedValues: dropped.droppedValues,
        lineItemsCleared: dropped.lineItemsCleared
      });
      // Keep refs in sync immediately so downstream actions (autosave/submit) can use the new draft values without waiting for a re-render.
      valuesRef.current = nextValues as any;
      lineItemsRef.current = nextLineItems;
      rememberAutoSaveSeenState(nextValues as any, nextLineItems);
      setValues(nextValues as any);
      setLineItems(nextLineItems);
    } else {
      // Keep refs in sync immediately so downstream actions (autosave/submit) can use the new draft values without waiting for a re-render.
      valuesRef.current = cleared.values as any;
      lineItemsRef.current = cleared.lineItems;
      rememberAutoSaveSeenState(cleared.values, cleared.lineItems);
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
  }, [
    bumpRecordSession,
    definition,
    logEvent,
    openCopyCurrentRecordDialogIfConfigured,
    rememberAutoSaveSeenState,
    resetFieldChangeTransientState
  ]);

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

  const handleReportButtonPointerDown = useCallback(
    (buttonId: string) => {
      const parsedRef = parseButtonRef(buttonId || '');
      const baseId = parsedRef.id;
      const qIdx = parsedRef.qIdx;
      const indexed = qIdx !== undefined ? definition.questions[qIdx] : undefined;
      const btn =
        indexed && indexed.type === 'BUTTON' && indexed.id === baseId
          ? indexed
          : definition.questions.find(q => q.type === 'BUTTON' && q.id === baseId);
      const action = (((btn as any)?.button?.action || '') as string).toString().trim();
      if (!shouldArmAutoSaveHoldForReportAction(action)) return;
      setAutoSaveHoldFromUi(true, { reason: 'reportPreview' });
    },
    [definition.questions, parseButtonRef, setAutoSaveHoldFromUi]
  );

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

  const resolveOpenUrlFieldHref = useCallback((fieldIdRaw: string): string => {
    const fieldId = (fieldIdRaw || '').toString().trim();
    if (!fieldId) return '';

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
      if (fieldId === 'pdfUrl') return (current as any)?.pdfUrl || '';
      if (fieldId === 'id') return recordId;
      const v = (valuesRef.current as any)?.[fieldId];
      if (v === undefined || v === null) return '';
      if (typeof v === 'string') return v;
      if (Array.isArray(v)) return v.join(' ');
      if (typeof v === 'object' && typeof (v as any).url === 'string') return (v as any).url;
      try {
        return v.toString();
      } catch {
        return '';
      }
    })();

    const urls = splitUrlList(raw).filter(u => /^https?:\/\//i.test(u));
    return urls[0] || '';
  }, []);

  const customButtons = useMemo(() => {
    const createPresetEnabled = definition.createRecordPresetButtonsEnabled !== false;
    const applyVisibility = view !== 'list';
    const guidedStepsCfg = applyVisibility && (definition as any)?.steps?.mode === 'guided' ? ((definition as any).steps as any) : null;
    const guidedPrefix = (guidedStepsCfg?.stateFields?.prefix || '__ckStep').toString();
    const resolveBaseVisibilityValue = (fieldId: string): FieldValue | undefined => {
      if (fieldId.startsWith(DATA_SOURCE_COUNT_FIELD_PREFIX)) {
        const key = fieldId.slice(DATA_SOURCE_COUNT_FIELD_PREFIX.length).trim();
        const config =
          guidedDataSourceConfigMap.byExact.get(key) ||
          guidedDataSourceConfigMap.byNormalized.get(normalizeDataSourceVisibilityKey(key));
        if (config) {
          const count = getCachedDataSourceItemCount(config, language);
          if (count !== null) return count as FieldValue;
        }
      }
      const direct = values[fieldId];
      if (direct !== undefined && direct !== null && direct !== '') return direct as FieldValue;
      const meta: any = {
        id: selectedRecordId || selectedRecordSnapshot?.id || lastSubmissionMeta?.id,
        createdAt: selectedRecordSnapshot?.createdAt || lastSubmissionMeta?.createdAt,
        updatedAt: selectedRecordSnapshot?.updatedAt || lastSubmissionMeta?.updatedAt,
        status: selectedRecordSnapshot?.status || lastSubmissionMeta?.status || null,
        pdfUrl: selectedRecordSnapshot?.pdfUrl || undefined
      };
      const sys = getSystemFieldValue(fieldId, meta);
      if (sys !== undefined) return sys as FieldValue;
      for (const rows of Object.values(lineItems)) {
        if (!Array.isArray(rows)) continue;
        for (const row of rows as any[]) {
          const v = (row as any)?.values?.[fieldId];
          if (v !== undefined && v !== null && v !== '') return v as FieldValue;
        }
      }
      return undefined;
    };
    const guidedVisibleSteps = guidedStepsCfg
      ? filterVisibleGuidedSteps(guidedStepsCfg.items as any[], {
          getValue: (fieldId: string) => resolveBaseVisibilityValue(fieldId)
        })
      : [];
    const guidedStepIds: string[] = guidedVisibleSteps
      .map(s => (s?.id !== undefined && s?.id !== null ? s.id.toString().trim() : ''))
      .filter(Boolean);
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
      return resolveBaseVisibilityValue(fieldId);
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
        const disabled =
          action === 'openUrlField' && cfg.disableWhenValueMissing === true ? !resolveOpenUrlFieldHref((cfg.fieldId || '').toString()) : false;
        return { id, label: resolveLabel(q, language), placements: placements as any, action: action as any, disabled };
      })
      .filter((b): b is { id: string; label: string; placements: any[]; action: any; disabled: boolean } => !!b);
  }, [definition, encodeButtonRef, guidedDataSourceConfigMap, language, lastSubmissionMeta, lineItems, resolveOpenUrlFieldHref, selectedRecordId, selectedRecordSnapshot, values, view]);

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
          } catch {
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
        } catch {
          opened = false;
        }
        if (!opened) {
          // Fallback: navigate this tab (guaranteed allowed). User can use Back to return.
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
    [base64ToPdfObjectUrl, definition, formKey, logEvent, parseButtonRef, resolveLogMessage, resolveTemplateIdForClient, resolveUiErrorMessage]
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
        const res = await renderHtmlTemplateApi(draft, buttonId);
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
      resetFieldChangeTransientState();
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
      optimisticClientDataVersionRef.current = null;
      recordRowNumberRef.current = null;

      rememberAutoSaveSeenState(mapped.values, mapped.lineItems);
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
    [
      definition,
      logEvent,
      parseButtonRef,
      precheckCreateDedupAndMaybeNavigate,
      rememberAutoSaveSeenState,
      resetFieldChangeTransientState,
      view
    ]
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

        const recordId =
          resolveExistingRecordId({
            selectedRecordId: selectedRecordIdRef.current,
            selectedRecordSnapshot: selectedRecordSnapshotRef.current,
            lastSubmissionMetaId: lastSubmissionMetaRef.current?.id || null
          }) || '';
        const href = resolveOpenUrlFieldHref(fieldId);
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
        } catch {
          opened = false;
        }
        if (!opened) {
          // Fallback: navigate this tab.
          try {
            globalThis.location?.assign?.(href);
            opened = true;
          } catch {
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
        const dependencyGuardCfg = (cfg?.dependencyGuard || null) as any;
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

        const run = (submitMode: 'default' | 'dependencyGuard' = 'default') => {
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
              submit: (payload: any) => submitCurrentRecordMutation('button.updateRecord', payload),
              submitWithDependencies: (payload: any) =>
                submitCurrentRecordMutation('button.updateRecord.dependencyGuard', payload, (nextPayload: any) =>
                  applyUpdateRecordWithDependenciesApi(nextPayload as any, buttonId)
                ),
              ensureRecordId: (args?: { reason?: string; fieldPath?: string }) =>
                ensureDraftRecordIdActionRef.current
                  ? ensureDraftRecordIdActionRef.current(args)
                  : Promise.resolve({
                      success: false,
                      message: tSystem('actions.noRecordSelected', languageRef.current, 'No record selected.')
                    }),
              flushPendingDraftSave: (reason: string) =>
                flushPendingDraftSaveActionRef.current
                  ? flushPendingDraftSaveActionRef.current(reason)
                  : Promise.resolve({ ok: true }),
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
              synchronizeStaleRecord,
              busy: updateRecordBusy
            } as any,
            {
              buttonId: baseId,
              buttonRef: buttonId,
              qIdx: qIdx,
              navigateTo,
              set: setObj as any,
              ensureRecordId: cfg?.ensureRecordId === true,
              busyTitle,
              submitMode
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

        const runDefaultFlow = () => {
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
              onConfirm: () => run('default')
            });
            logEvent('button.updateRecord.confirm.open', { buttonId: baseId, qIdx: qIdx ?? null, navigateTo });
            return;
          }

          run('default');
        };

        if (!dependencyGuardCfg) {
          runDefaultFlow();
          return;
        }

        const busyTitle = btn ? resolveLabel(btn, languageRef.current) : (baseId || '');
        const previewSeq = updateRecordBusy.lock({
          title: busyTitle || tSystem('common.loading', languageRef.current, 'Loading…'),
          message: tSystem('common.loading', languageRef.current, 'Loading…'),
          kind: 'updateRecord.dependencyPreview',
          diagnosticMeta: { buttonId: baseId, qIdx: qIdx ?? null }
        });
        logEvent('button.updateRecord.dependencyPreview.start', {
          buttonId: baseId,
          qIdx: qIdx ?? null,
          targetFormKey: dependencyGuardCfg?.targetFormKey || null
        });

        void (async () => {
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
            }) as any;
            const metaSource: any = selectedRecordSnapshotRef.current || lastSubmissionMetaRef.current || null;
            if (metaSource?.status !== undefined && metaSource?.status !== null) draft.status = metaSource.status;
            if (metaSource?.createdAt !== undefined && metaSource?.createdAt !== null) draft.createdAt = metaSource.createdAt;
            if (metaSource?.updatedAt !== undefined && metaSource?.updatedAt !== null) draft.updatedAt = metaSource.updatedAt;
            if (metaSource?.pdfUrl !== undefined && metaSource?.pdfUrl !== null) draft.pdfUrl = metaSource.pdfUrl;

            const preview = await previewUpdateRecordDependenciesApi(draft, buttonId);
            if (!preview?.success) {
              const msg = (preview?.message || 'Failed to check dependent records.').toString();
              setStatus(msg);
              setStatusLevel('error');
              logEvent('button.updateRecord.dependencyPreview.error', {
                buttonId: baseId,
                qIdx: qIdx ?? null,
                message: msg
              });
              return;
            }

            const impactedCount = Number(preview.impactedCount || 0);
            logEvent('button.updateRecord.dependencyPreview.ok', {
              buttonId: baseId,
              qIdx: qIdx ?? null,
              impactedCount,
              targetFormKey: preview.targetFormKey || null
            });

            if (impactedCount > 0) {
              const dialog = preview.dialog || { title: '', message: '', confirmLabel: '', cancelLabel: '' };
              customConfirm.openConfirm({
                title: dialog.title || tSystem('common.confirm', languageRef.current, 'Confirm'),
                message: dialog.message || '',
                confirmLabel: dialog.confirmLabel || tSystem('common.confirm', languageRef.current, 'Confirm'),
                cancelLabel: dialog.cancelLabel || tSystem('common.cancel', languageRef.current, 'Cancel'),
                kind: 'updateRecord.dependencyGuard',
                refId: buttonId,
                onConfirm: () => run('dependencyGuard')
              });
              logEvent('button.updateRecord.dependencyConfirm.open', {
                buttonId: baseId,
                qIdx: qIdx ?? null,
                impactedCount,
                targetFormKey: preview.targetFormKey || null
              });
              return;
            }

            runDefaultFlow();
          } catch (err: any) {
            const msg = resolveUserFacingErrorMessage(err, 'Failed to check dependent records.') || 'Failed to check dependent records.';
            setStatus(msg);
            setStatusLevel('error');
            logEvent('button.updateRecord.dependencyPreview.exception', {
              buttonId: baseId,
              qIdx: qIdx ?? null,
              message: (err?.message || err?.toString?.() || msg).toString()
            });
          } finally {
            updateRecordBusy.unlock(previewSeq, { buttonId: baseId, qIdx: qIdx ?? null });
          }
        })();
        return;
      }

      logEvent('ui.customButton.unsupported', { buttonId: baseId, qIdx: qIdx ?? null, action: action || null });
    },
    [
      createRecordFromPreset,
      customConfirm,
      definition,
      formKey,
      logEvent,
      openHtml,
      openMarkdown,
      openPdfPreviewWindow,
      openReport,
      parseButtonRef,
      perfMark,
      perfMeasure,
      resolveOpenUrlFieldHref,
      submitCurrentRecordMutation,
      synchronizeStaleRecord,
      upsertListCacheRow,
      updateRecordBusy
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

  useEffect(() => {
    const shouldHold = shouldHoldAutoSaveForReportOverlay(reportOverlay);
    const currentReason = (autoSaveHoldRef.current.reason || '').toString();
    if (shouldHold) {
      if (autoSaveHoldRef.current.hold && currentReason === 'reportPreview') return;
      setAutoSaveHoldFromUi(true, { reason: 'reportPreview' });
      return;
    }
    if (autoSaveHoldRef.current.hold && currentReason === 'reportPreview') {
      setAutoSaveHoldFromUi(false, { reason: 'reportPreview' });
    }
  }, [reportOverlay, setAutoSaveHoldFromUi]);

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
          } catch {
            // fall back to pipe-separated payloads
            try {
              const decoded = decodeURIComponent(payload);
              return decoded
                .split('|')
                .map(part => (part || '').toString().trim())
                .filter(Boolean);
            } catch {
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
  const finalSubmitButtonLabelConfig = definition.submitButtonLabel || definition.steps?.stepSubmitLabel;
  const submitButtonLabelResolved = useMemo(
    () =>
      resolveLocalizedString(
        finalSubmitButtonLabelConfig,
        language,
        tSystem('submit.confirm', language, tSystem('actions.submit', language, 'Submit'))
      ),
    [finalSubmitButtonLabelConfig, language]
  );
  const submitPreviousActionRetryMessage = useCallback(
    () =>
      tSystem(
        'submit.previousActionRetry',
        languageRef.current,
        'Something went wrong while finishing the previous action. Please click {action} again.',
        {
          action:
            (submitButtonLabelResolved || '').toString().trim() ||
            tSystem('actions.submit', languageRef.current, 'Submit')
        }
      ),
    [submitButtonLabelResolved]
  );
  const waitForPendingFollowupBatch = useCallback(
    async (args: {
      recordId: string;
      reason: string;
      timeoutMs?: number;
    }): Promise<{ ok: boolean; message?: string }> => {
      const recordId = (args.recordId || '').toString().trim();
      if (!recordId) return { ok: true };
      const pending = pendingFollowupBatchPromisesRef.current.get(recordId);
      if (!pending) return { ok: true };
      const timeoutMs = Number.isFinite(Number(args.timeoutMs)) && Number(args.timeoutMs) > 0 ? Number(args.timeoutMs) : 60_000;
      const fallbackMessage = submitPreviousActionRetryMessage();
      const startedAt = Date.now();
      logEvent('followup.pending.wait.begin', {
        reason: args.reason,
        recordId,
        timeoutMs
      });
      let timer: ReturnType<typeof globalThis.setTimeout> | null = null;
      try {
        const timeoutPromise = new Promise<{
          success: boolean;
          message?: string;
          recordId: string;
          sessionId: number;
          reason: string;
        }>(resolve => {
          timer = globalThis.setTimeout(
            () =>
              resolve({
                success: false,
                message: fallbackMessage,
                recordId,
                sessionId: recordSessionRef.current,
                reason: args.reason
              }),
            timeoutMs
          );
        });
        const outcome = await Promise.race([pending, timeoutPromise]);
        logEvent('followup.pending.wait.done', {
          reason: args.reason,
          recordId,
          durationMs: Date.now() - startedAt,
          success: Boolean(outcome?.success)
        });
        if (outcome?.success) return { ok: true };
        return {
          ok: false,
          message: fallbackMessage
        };
      } finally {
        if (timer) {
          globalThis.clearTimeout(timer);
        }
      }
    },
    [logEvent, submitPreviousActionRetryMessage]
  );
  const submitConfirmationDialogConfig = useMemo(() => {
    const afterSubmitConfig = definition.submissionAfterSubmit;
    if (
      afterSubmitConfig?.confirmationDialog ||
      (Array.isArray(afterSubmitConfig?.confirmationDialogCases) && afterSubmitConfig.confirmationDialogCases.length > 0)
    ) {
      const guidedStepPrefix = ((definition.steps?.stateFields?.prefix || '__ckStep') as string).toString();
      const submitVirtualState: GuidedStepsVirtualState | null =
        guidedUiState?.activeStepId
          ? {
              prefix: guidedStepPrefix,
              activeStepId: guidedUiState.activeStepId,
              activeStepIndex: guidedUiState.activeStepIndex || 0,
              maxValidIndex: -1,
              maxCompleteIndex: -1,
              steps: []
            }
          : null;
      return (
        selectConditionalDialog({
          cases: afterSubmitConfig.confirmationDialogCases,
          fallback: afterSubmitConfig.confirmationDialog,
          ctx: buildValidationContext(values as any, lineItems as any, submitVirtualState),
          now: new Date()
        }) || null
      );
    }
    return {
      title: definition.submissionConfirmationTitle,
      message: definition.submissionConfirmationMessage,
      confirmLabel: definition.submissionConfirmationConfirmLabel,
      cancelLabel: definition.submissionConfirmationCancelLabel
    };
  }, [
    definition.steps?.stateFields?.prefix,
    definition.submissionAfterSubmit,
    definition.submissionConfirmationCancelLabel,
    definition.submissionConfirmationConfirmLabel,
    definition.submissionConfirmationMessage,
    definition.submissionConfirmationTitle,
    guidedUiState?.activeStepId,
    guidedUiState?.activeStepIndex,
    lineItems,
    values
  ]);
  const submitConfirmConfirmLabelResolved = useMemo(
    () => resolveLocalizedString(submitConfirmationDialogConfig?.confirmLabel, language, submitButtonLabelResolved),
    [submitConfirmationDialogConfig?.confirmLabel, language, submitButtonLabelResolved]
  );
  const submitConfirmCancelLabelResolved = useMemo(
    () =>
      resolveLocalizedString(
        submitConfirmationDialogConfig?.cancelLabel,
        language,
        tSystem('submit.cancel', language, tSystem('common.cancel', language, 'Cancel'))
      ),
    [submitConfirmationDialogConfig?.cancelLabel, language]
  );
  const submitConfirmTitle = useMemo(
    () =>
      resolveLocalizedString(
        submitConfirmationDialogConfig?.title,
        language,
        tSystem('submit.confirmTitle', language, 'Confirm submission')
      ),
    [submitConfirmationDialogConfig?.title, language]
  );
  const resolveDialogTemplate = useCallback(
    (rawValue: LocalizedString | string | undefined, fallback: string): string => {
      const base = resolveLocalizedString(rawValue, language, fallback);
      if (!base) return base;
      if (base.indexOf('{') < 0) return base;
      const vars: Record<string, string> = {};

      // Include meta fields (best-effort) in case you want to reference them in the dialog.
      if (selectedRecordId) vars.id = selectedRecordId;
      if (lastSubmissionMeta?.createdAt) vars.createdAt = lastSubmissionMeta.createdAt;
      if (lastSubmissionMeta?.updatedAt) vars.updatedAt = lastSubmissionMeta.updatedAt;
      if (lastSubmissionMeta?.status) vars.status = lastSubmissionMeta.status;
      const locale = language.toLowerCase() === 'fr' ? 'fr-CA' : language.toLowerCase() === 'nl' ? 'nl-NL' : 'en-CA';
      const todayDate = (() => {
        try {
          return new Intl.DateTimeFormat(locale, {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          }).format(new Date());
        } catch {
          return new Date().toISOString().slice(0, 10);
        }
      })();
      vars.today = todayDate;
      vars.todayDate = todayDate;
      vars.TODAY = todayDate;
      vars.TODAY_DATE = todayDate;

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
      language,
      definition.questions,
      lastSubmissionMeta?.createdAt,
      lastSubmissionMeta?.status,
      lastSubmissionMeta?.updatedAt,
      optionState,
      selectedRecordId,
      values
    ]
  );
  const resolveGuidedUploadWaitDialog = useCallback(
    (rawDialog?: SystemActionGateDialogConfig | null) => ({
      title: resolveLocalizedString(
        rawDialog?.title,
        languageRef.current,
        tSystem('navigation.waitTitle', languageRef.current, 'Please wait')
      ),
      message: resolveDialogTemplate(
        rawDialog?.message,
        tSystem('navigation.waitPhotos', languageRef.current, 'Please wait while your photos finish uploading.')
      )
    }),
    [resolveDialogTemplate]
  );
  const submitConfirmMessage = useMemo(
    () =>
      resolveDialogTemplate(
        submitConfirmationDialogConfig?.message,
        tSystem('submit.confirmMessage', language, 'Are you ready to submit this record?')
      ),
    [submitConfirmationDialogConfig?.message, language, resolveDialogTemplate]
  );

  useEffect(() => {
    autoSaveNoticeSeenRef.current = false;
    setAutoSaveNoticeOpen(false);
    setIngredientNameBlurredForAutoSave(false);
  }, [autoSaveNoticeStorageKey]);

  useEffect(() => {
    if (!autoSaveEnabled || view !== 'form') return;
    if (ingredientsFormActive && createFlowRef.current) {
      if (!ingredientCreateAutoSaveReady) return;
      if (!ingredientNameBlurredForAutoSave) return;
    }
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
  }, [
    autoSaveEnabled,
    autoSaveNoticeStorageKey,
    formKey,
    ingredientCreateAutoSaveReady,
    ingredientNameBlurredForAutoSave,
    ingredientsFormActive,
    logEvent,
    view
  ]);

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
    logEvent('ui.submit.tap', { submitLabelOverridden: Boolean(finalSubmitButtonLabelConfig) });
    formSubmitActionRef.current?.();
  }, [finalSubmitButtonLabelConfig, logEvent, recordLoadingId, submitting, updateRecordBusyOpen, view]);

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
      void handleSubmitRef.current();
      return;
    }
    formSubmitActionRef.current?.();
  }, [logEvent]);

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
  const renderedAutoSaveStateFingerprint = useMemo(
    () =>
      buildDraftStateFingerprint({
        formKey,
        language,
        values,
        lineItems
      }),
    [formKey, language, lineItems, values]
  );
  latestRenderedAutoSaveStateFingerprintRef.current = renderedAutoSaveStateFingerprint;
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

  const formViewCurrentRecord =
    selectedRecordSnapshot || (selectedRecordId && !recordLoadingId ? listCache.records[selectedRecordId] : null);

  const formRecordMeta = useMemo(
    () => ({
      id: (formViewCurrentRecord?.id || lastSubmissionMeta?.id || selectedRecordId || undefined) as any,
      createdAt: (formViewCurrentRecord?.createdAt || lastSubmissionMeta?.createdAt || undefined) as any,
      updatedAt: (formViewCurrentRecord?.updatedAt || lastSubmissionMeta?.updatedAt || undefined) as any,
      status: resolveUiRecordStatus({
        persistedStatus: formViewCurrentRecord?.status || lastSubmissionMeta?.status || null,
        autoSaveDefaultStatus,
        guidedForwardGateSatisfied: guidedUiState?.forwardGateSatisfied === true
      }) as any,
      pdfUrl: (formViewCurrentRecord?.pdfUrl || undefined) as any
    }),
    [
      autoSaveDefaultStatus,
      formViewCurrentRecord?.createdAt,
      formViewCurrentRecord?.id,
      formViewCurrentRecord?.pdfUrl,
      formViewCurrentRecord?.status,
      formViewCurrentRecord?.updatedAt,
      guidedUiState?.forwardGateSatisfied,
      lastSubmissionMeta?.createdAt,
      lastSubmissionMeta?.id,
      lastSubmissionMeta?.status,
      lastSubmissionMeta?.updatedAt,
      selectedRecordId
    ]
  );

  const dedupSignature = useMemo(() => {
    const startMark = `ck.selector.dedupSignature.start.${Date.now()}`;
    const endMark = `ck.selector.dedupSignature.end.${Date.now()}`;
    perfMark(startMark);
    const signature = computeDedupSignatureFromValues(dedupPrecheckRules, values as any);
    perfMark(endMark);
    perfMeasure('ck.selector.dedupSignature', startMark, endMark, {
      valueCount: Object.keys(values || {}).length,
      signatureLength: (signature || '').toString().length
    });
    return signature;
  }, [dedupPrecheckRules, perfMark, perfMeasure, values]);

  useEffect(() => {
    dedupTriggerFieldIdsRef.current = dedupTriggerFieldIdMap;
  }, [dedupTriggerFieldIdMap]);

  useEffect(() => {
    dedupIdentityFieldIdsRef.current = dedupIdentityFieldIdMap;
  }, [dedupIdentityFieldIdMap]);

  useEffect(() => {
    dedupSignatureRef.current = dedupSignature;
  }, [dedupSignature]);

  const hideDedupProgressDialog = useCallback(() => {
    if (dedupProgressTimerRef.current) {
      globalThis.clearTimeout(dedupProgressTimerRef.current);
      dedupProgressTimerRef.current = null;
    }
    setDedupProgress(prev => (prev.open ? { ...prev, open: false } : prev));
  }, []);

  const showDedupProgressDialog = useCallback(
    (args: { phase: 'checking' | 'available' | 'duplicate'; title: string; message: string; autoCloseMs?: number }) => {
      if (dedupProgressTimerRef.current) {
        globalThis.clearTimeout(dedupProgressTimerRef.current);
        dedupProgressTimerRef.current = null;
      }
      setDedupProgress({
        open: true,
        phase: args.phase,
        title: args.title,
        message: args.message
      });
      if (args.autoCloseMs !== undefined && args.autoCloseMs >= 0) {
        dedupProgressTimerRef.current = globalThis.setTimeout(() => {
          setDedupProgress(prev => (prev.open ? { ...prev, open: false } : prev));
          dedupProgressTimerRef.current = null;
        }, args.autoCloseMs) as any;
      }
    },
    []
  );

  useEffect(
    () => () => {
      if (!dedupProgressTimerRef.current) return;
      globalThis.clearTimeout(dedupProgressTimerRef.current);
      dedupProgressTimerRef.current = null;
    },
    []
  );

  useEffect(() => {
    if (view === 'form' && dedupCheckDialogEnabled) return;
    hideDedupProgressDialog();
  }, [dedupCheckDialogEnabled, hideDedupProgressDialog, view]);

  useEffect(() => {
    if (!dedupProgress.open) return;
    if (dedupProgress.phase !== 'checking') return;
    if (dedupChecking) return;
    hideDedupProgressDialog();
  }, [dedupChecking, dedupProgress.open, dedupProgress.phase, hideDedupProgressDialog]);

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
    const showDedupProgress = dedupCheckDialogEnabled && createFlowRef.current;
    // Only de-duplicate by signature; the candidate id can change after draft creation and should not force a re-check.
    const checkKey = signature;

    // Clear pending timer (signature might be changing).
    if (dedupCheckTimerRef.current) {
      globalThis.clearTimeout(dedupCheckTimerRef.current);
      dedupCheckTimerRef.current = null;
    }

    if (!signature) {
      hideDedupProgressDialog();
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
    if (showDedupProgress) {
      showDedupProgressDialog({
        phase: 'checking',
        title: dedupCheckDialogCopy.checkingTitle,
        message: dedupCheckDialogCopy.checkingMessage
      });
    }
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
            if (showDedupProgress) {
              showDedupProgressDialog({
                phase: 'duplicate',
                title: dedupCheckDialogCopy.duplicateTitle,
                message: dedupCheckDialogCopy.duplicateMessage,
                autoCloseMs: dedupCheckDialogCopy.duplicateAutoCloseMs
              });
            }
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
            if (showDedupProgress) {
              showDedupProgressDialog({
                phase: 'duplicate',
                title: dedupCheckDialogCopy.duplicateTitle,
                message: dedupCheckDialogCopy.duplicateMessage,
                autoCloseMs: dedupCheckDialogCopy.duplicateAutoCloseMs
              });
            }
            return;
          }

          dedupConflictRef.current = null;
          setDedupConflict(null);
          logEvent('dedup.ok', { recordId: candidateId || null });
          if (showDedupProgress) {
            showDedupProgressDialog({
              phase: 'available',
              title: dedupCheckDialogCopy.availableTitle,
              message: dedupCheckDialogCopy.availableMessage,
              autoCloseMs: dedupCheckDialogCopy.availableAutoCloseMs
            });
          } else {
            hideDedupProgressDialog();
          }
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
          if (showDedupProgress) {
            showDedupProgressDialog({
              phase: 'duplicate',
              title: dedupCheckDialogCopy.duplicateTitle,
              message: dedupCheckDialogCopy.duplicateMessage,
              autoCloseMs: dedupCheckDialogCopy.duplicateAutoCloseMs
            });
          } else {
            hideDedupProgressDialog();
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
    dedupCheckDialogCopy.availableAutoCloseMs,
    dedupCheckDialogCopy.availableMessage,
    dedupCheckDialogCopy.availableTitle,
    dedupCheckDialogCopy.duplicateAutoCloseMs,
    dedupCheckDialogCopy.duplicateMessage,
    dedupCheckDialogCopy.duplicateTitle,
    dedupCheckDialogCopy.checkingMessage,
    dedupCheckDialogCopy.checkingTitle,
    dedupCheckDialogEnabled,
    dedupSignature,
    definition,
    formKey,
    hideDedupProgressDialog,
    loadRecordSnapshot,
    logEvent,
    resolveLogMessage,
    resolveUiErrorMessage,
    selectedRecordId,
    selectedRecordSnapshot,
    showDedupProgressDialog,
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

      if (recordSyncPromiseRef.current) {
        autoSaveQueuedRef.current = true;
        autoSaveDirtyRef.current = true;
        logEvent('autosave.blocked.recordSyncInFlight', { reason });
        return;
      }

      if (guidedStepImmediateSyncPromiseRef.current) {
        autoSaveQueuedRef.current = true;
        autoSaveDirtyRef.current = true;
        logEvent('autosave.blocked.guidedStepLiveSync', { reason });
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

      if (!autoSaveDirtyRef.current) {
        logEvent('autosave.skip.clean', { reason });
        return;
      }

      const existingRecordId = resolveExistingRecordId({
        selectedRecordId: selectedRecordIdRef.current,
        selectedRecordSnapshot: selectedRecordSnapshotRef.current,
        lastSubmissionMetaId: lastSubmissionMetaRef.current?.id || null
      });

      const isCreateFlow = createFlowRef.current || !existingRecordId;
      const sessionAtStart = recordSessionRef.current;
      const valuesSnapshot = valuesRef.current;
      const lineItemsSnapshot = lineItemsRef.current;
      const withUploadOverrides = applyUploadedFieldOverrides({
        values: valuesSnapshot,
        lineItems: lineItemsSnapshot
      });
      const languageSnapshot = languageRef.current;
      const hasConfiguredAutoSaveGate = autoSaveEnableFieldIds.length > 0;

      if (isCreateFlow && hasConfiguredAutoSaveGate && hasIncompleteConfiguredFields(autoSaveEnableFieldIds, valuesSnapshot as any)) {
        autoSaveDirtyRef.current = true;
        logEvent('autosave.blocked.configuredFieldsIncomplete', {
          reason,
          isCreateFlow: true,
          fields: autoSaveEnableFieldIds
        });
        return;
      }

      if (isCreateFlow && ingredientsFormActive && !hasConfiguredAutoSaveGate && !isIngredientCreateAutoSaveReady(valuesSnapshot as any)) {
        autoSaveDirtyRef.current = true;
        logEvent('autosave.blocked.ingredients.createRequirements', { reason, isCreateFlow: true });
        return;
      }

      const createFlowDedupKeysIncomplete =
        isCreateFlow && !hasConfiguredAutoSaveGate && hasIncompleteRejectDedupKeys((definition as any)?.dedupRules, valuesSnapshot as any);
      if (createFlowDedupKeysIncomplete) {
        autoSaveDirtyRef.current = true;
        logEvent('autosave.blocked.dedup.keysIncomplete', { reason, isCreateFlow: true });
        return;
      }

      // If this is a CREATE flow and dedup keys are populated, avoid saving drafts until the precheck completes.
      const currentDedupSignature = computeDedupSignatureFromValues(dedupPrecheckRules, valuesSnapshot as any);
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
            scheduleLatestAutoSave('dedupPrecheck.wait', 600);
          } catch {
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
      if (draftSaveRequestInFlightRef.current) {
        autoSaveQueuedRef.current = true;
        autoSaveDirtyRef.current = true;
        logEvent('autosave.blocked.draftSaveInFlight', { reason });
        return;
      }

      autoSaveInFlightRef.current = true;
      autoSaveQueuedRef.current = false;
      // Clear the dirty flag for this attempt; it will be re-set by the change effect if edits continue.
      autoSaveDirtyRef.current = false;
      let savedDraftFingerprint: ReturnType<typeof buildDraftSaveFingerprint> | null = null;
      let retryableRecoveryScheduled = false;

      setDraftSave({ phase: 'saving' });
      logEvent('autosave.begin', { reason, debounceMs: autoSaveDebounceMs });

      try {
        const payload = applyUploadedFieldPayloadOverrides(
          buildDraftPayload({
            definition,
            formKey,
            language: languageSnapshot,
            values: withUploadOverrides.values,
            lineItems: withUploadOverrides.lineItems,
            existingRecordId
          }) as any
        );
        payload.__ckSaveMode = 'draft';
        payload.__ckStatus = statusForSave;
        payload.__ckCreateFlow = createFlowRef.current ? '1' : '';
        const baseVersion = recordDataVersionRef.current;
        if (existingRecordId && Number.isFinite(Number(baseVersion)) && Number(baseVersion) > 0) {
          payload.__ckClientDataVersion = Number(baseVersion);
        }

        const res = await runCoalescedDraftSaveRequest('autosave', payload, (nextPayload: any) =>
          submitCurrentRecordMutation('autosave', nextPayload)
        );
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
          const isStale = isSubmissionStaleMessage(errText);
          if (isStale) {
            retryableAutoSaveFailureCountRef.current = 0;
            const serverVersionRaw = Number((res as any)?.meta?.dataVersion);
            await synchronizeStaleRecord({
              reason: 'autosave.rejected.stale',
              recordId: (existingRecordId || '').toString(),
              cachedVersion: Number.isFinite(Number(baseVersion)) ? Number(baseVersion) : null,
              serverVersion: Number.isFinite(serverVersionRaw) ? serverVersionRaw : null,
              serverRow: null
            });
            return;
          }
          if (isRetryableRecordBusyMessage(errText)) {
            retryableRecoveryScheduled = true;
            scheduleRetryableAutoSaveRecovery(reason, errText);
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
                retryableAutoSaveFailureCountRef.current = 0;
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
            retryableAutoSaveFailureCountRef.current = 0;
            setDraftSave({ phase: 'paused', message: tSystem('app.closedReadOnly', language, 'Closed (read-only)') });
            return;
          }
          retryableAutoSaveFailureCountRef.current = 0;
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
        if (newId) {
          savedDraftFingerprint = buildDraftSaveFingerprint({
            ...payload,
            id: newId
          });
        }
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
          if (!existingRecordId) {
            createFlowRef.current = false;
          }
        }
        // Successful save => record is now at least as fresh as the server; clear stale banner + bump local version.
        recordStaleRef.current = null;
        setRecordStale(null);
        if (nextDataVersion) {
          recordDataVersionRef.current = nextDataVersion;
          optimisticClientDataVersionRef.current = nextDataVersion;
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
        lastSubmissionMetaRef.current = {
          ...(lastSubmissionMetaRef.current || {}),
          id: newId || lastSubmissionMetaRef.current?.id || null,
          createdAt: (res?.meta?.createdAt || '').toString() || lastSubmissionMetaRef.current?.createdAt,
          updatedAt: updatedAt || lastSubmissionMetaRef.current?.updatedAt,
          dataVersion: nextDataVersion ?? lastSubmissionMetaRef.current?.dataVersion,
          status: statusForSave
        };
        dedupBaselineSignatureRef.current = (currentDedupSignature || '').toString();
        dedupKeyFingerprintBaselineRef.current = currentDedupFingerprint;
        retryableAutoSaveFailureCountRef.current = 0;
        setDraftSave({ phase: 'saved', updatedAt: updatedAt || undefined });
        uploadedFieldValueOverridesRef.current.clear();
        markRecordFreshnessServerTouch({ reason: 'record.autosave', recordId: newId || existingRecordId || null });
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
        if (isRetryableRecordBusyMessage(uiMessage || logMessage)) {
          retryableRecoveryScheduled = true;
          scheduleRetryableAutoSaveRecovery(reason, (uiMessage || logMessage || 'Autosave failed.').toString());
          return;
        }
        retryableAutoSaveFailureCountRef.current = 0;
        autoSaveDirtyRef.current = true;
        if (uiMessage) {
          setDraftSave({ phase: 'error', message: uiMessage });
        } else {
          setDraftSave({ phase: 'idle' });
        }
        logEvent('autosave.exception', { reason, message: logMessage });
      } finally {
        autoSaveInFlightRef.current = false;
        let shouldScheduleQueuedAutoSave = autoSaveQueuedRef.current && !submittingRef.current;
        if (retryableRecoveryScheduled) {
          shouldScheduleQueuedAutoSave = false;
        }
        if (shouldScheduleQueuedAutoSave && savedDraftFingerprint?.recordId) {
          const currentRecordId =
            resolveExistingRecordId({
              selectedRecordId: selectedRecordIdRef.current,
              selectedRecordSnapshot: selectedRecordSnapshotRef.current,
              lastSubmissionMetaId: lastSubmissionMetaRef.current?.id || null
            }) || savedDraftFingerprint.recordId;
          const currentStatusRaw =
            ((lastSubmissionMetaRef.current?.status || selectedRecordSnapshotRef.current?.status || '') as any)?.toString?.() ||
            '';
          const currentPayload = applyUploadedFieldPayloadOverrides(
            buildDraftPayload({
              definition,
              formKey,
              language: languageRef.current,
              values: valuesRef.current,
              lineItems: lineItemsRef.current,
              existingRecordId: currentRecordId
            }) as any
          );
          currentPayload.__ckSaveMode = 'draft';
          currentPayload.__ckStatus = resolveAutoSaveStatus(currentStatusRaw);
          currentPayload.__ckCreateFlow = createFlowRef.current ? '1' : '';
          const currentFingerprint = buildDraftSaveFingerprint(currentPayload);
          if (
            currentFingerprint &&
            currentFingerprint.recordId === savedDraftFingerprint.recordId &&
            currentFingerprint.fingerprint === savedDraftFingerprint.fingerprint
          ) {
            autoSaveQueuedRef.current = false;
            shouldScheduleQueuedAutoSave = false;
            logEvent('autosave.queued.cleared.noChanges', {
              reason,
              recordId: currentRecordId
            });
          }
        }
        if (shouldScheduleQueuedAutoSave) {
          scheduleLatestAutoSave('queued', autoSaveDebounceMs);
        }
      }
    },
    [
      applyUploadedFieldPayloadOverrides,
      applyUploadedFieldOverrides,
      autoSaveDebounceMs,
      autoSaveEnabled,
      autoSaveEnableFieldIds,
      dedupPrecheckRules,
      resolveAutoSaveStatus,
      closedStatusLabel,
      definition,
      dedupDeleteOnKeyChangeEnabled,
      formKey,
      ingredientsFormActive,
      language,
      logEvent,
      markRecordFreshnessServerTouch,
      matchesClosedStatus,
      isRetryableRecordBusyMessage,
      resolveLogMessage,
      resolveUiErrorMessage,
      runCoalescedDraftSaveRequest,
      scheduleRetryableAutoSaveRecovery,
      scheduleLatestAutoSave,
      submitCurrentRecordMutation,
      synchronizeStaleRecord,
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

  const flushPendingDraftSaveForAction = useCallback(
    async (reason: string): Promise<{ ok: boolean; message?: string }> => {
      const sleep = (ms: number) => new Promise<void>(resolve => globalThis.setTimeout(resolve, ms));

      const currentStaleInfo = recordStaleRef.current as RecordStaleInfo | null;
      if (currentStaleInfo) {
        return { ok: false, message: currentStaleInfo.message || 'Record is stale. Please refresh.' };
      }

      if (recordSyncPromiseRef.current) {
        await recordSyncPromiseRef.current;
        const syncedStaleInfo = recordStaleRef.current as RecordStaleInfo | null;
        if (syncedStaleInfo) {
          return { ok: false, message: syncedStaleInfo.message || 'Record is stale. Please refresh.' };
        }
      }

      if (dedupCheckingRef.current) {
        logEvent('action.flush.waitDedup.start', { reason });
        const startedAt = Date.now();
        while (dedupCheckingRef.current) {
          await sleep(60);
          if (Date.now() - startedAt > 15_000) {
            const message = tSystem('dedup.checking', languageRef.current, 'Checking duplicates…');
            logEvent('action.flush.waitDedup.timeout', { reason, waitMs: Date.now() - startedAt });
            return { ok: false, message };
          }
        }
        logEvent('action.flush.waitDedup.done', { reason, waitMs: Date.now() - startedAt });
      }

      const dedupConflict = dedupConflictRef.current;
      if (dedupConflict?.message) {
        return { ok: false, message: dedupConflict.message.toString() };
      }

      const flushed = await flushAutoSaveBeforeNavigate(reason);
      if (flushed && draftSaveRequestInFlightRef.current) {
        await waitForDraftSaveRequest(`action.flush:${reason}`);
      }

      if (autoSaveDirtyRef.current || autoSaveQueuedRef.current) {
        const message = lastDraftSaveFailureRef.current?.message || 'Could not save the latest changes.';
        logEvent('action.flush.pendingAutosave.failed', {
          reason,
          dirty: autoSaveDirtyRef.current,
          queued: autoSaveQueuedRef.current,
          hasDraftFailure: !!lastDraftSaveFailureRef.current
        });
        return { ok: false, message };
      }

      if (lastDraftSaveFailureRef.current) {
        return {
          ok: false,
          message: lastDraftSaveFailureRef.current.message || 'Could not save the latest changes.'
        };
      }
      const staleInfo = recordStaleRef.current as RecordStaleInfo | null;
      if (staleInfo) {
        return { ok: false, message: staleInfo.message || 'Record is stale. Please refresh.' };
      }
      autoSaveDirtyRef.current = false;
      autoSaveQueuedRef.current = false;
      if (autoSaveTimerRef.current) {
        globalThis.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      return { ok: true };
    },
    [flushAutoSaveBeforeNavigate, logEvent, waitForDraftSaveRequest]
  );
  flushPendingDraftSaveActionRef.current = flushPendingDraftSaveForAction;

  const waitForBackgroundSaves = useCallback(
    async (
      reason: string,
      waitForQueue: 'all' | 'uploadsOnly' | 'none' = 'all'
    ): Promise<{ ok: boolean; message?: string }> => {
      if (waitForQueue === 'none') {
        logEvent('backgroundQueue.wait.skipped', { reason, waitForQueue });
        return { ok: true };
      }
      const sessionAtStart = recordSessionRef.current;
      const startedAt = Date.now();
      const startAutosave = !!autoSaveInFlightRef.current;
      const startDraftSave = !!draftSaveRequestInFlightRef.current;
      const startUploads = uploadQueueRef.current.size;
      if (startAutosave || startDraftSave || startUploads > 0) {
        logEvent('backgroundQueue.wait.start', {
          reason,
          waitForQueue,
          autosaveInFlight: startAutosave,
          draftSaveInFlight: startDraftSave,
          uploadsInFlight: startUploads
        });
      }

      if (uploadQueueRef.current.size > 0) {
        const snapshots = Array.from(uploadQueueRef.current.values());
        const settled = await Promise.allSettled(snapshots);
        const failures: string[] = [];
        settled.forEach(result => {
          if (result.status !== 'fulfilled') {
            failures.push('Upload failed.');
            return;
          }
          const ok = !!(result.value as any)?.success;
          const msg = ((result.value as any)?.message || '').toString();
          if (!ok) failures.push(msg || 'Upload failed.');
        });
        if (failures.length) {
          const message = failures[0] || tSystem('files.error.uploadFailed', languageRef.current, 'Could not add photos.');
          logEvent('backgroundQueue.wait.uploads.failed', { reason, waitForQueue, message });
          return { ok: false, message };
        }
      }

      if (waitForQueue === 'all' && autoSaveInFlightRef.current) {
        const sleep = (ms: number) => new Promise<void>(resolve => globalThis.setTimeout(resolve, ms));
        while (autoSaveInFlightRef.current) {
          if (recordSessionRef.current !== sessionAtStart) {
            logEvent('backgroundQueue.wait.sessionChanged', {
              reason,
              waitForQueue,
              sessionAtStart,
              sessionNow: recordSessionRef.current
            });
            return { ok: false, message: 'Record session changed.' };
          }
          await sleep(60);
        }
      }

      if (waitForQueue === 'all' && draftSaveRequestInFlightRef.current) {
        await waitForDraftSaveRequest(`backgroundQueue:${reason}`);
      }

      if (waitForQueue === 'all' && lastDraftSaveFailureRef.current) {
        logEvent('backgroundQueue.wait.blocked.draftSaveFailed', {
          reason,
          waitForQueue,
          recordId: lastDraftSaveFailureRef.current.recordId || null
        });
        return {
          ok: false,
          message: lastDraftSaveFailureRef.current.message || 'Could not save the latest changes.'
        };
      }

      const currentStaleInfo = recordStaleRef.current as RecordStaleInfo | null;
      if (currentStaleInfo) {
        logEvent('backgroundQueue.wait.blocked.recordStale', {
          reason,
          waitForQueue,
          recordId: currentStaleInfo.recordId
        });
        return { ok: false, message: currentStaleInfo.message || 'Record is stale. Please refresh.' };
      }

      if (recordSyncPromiseRef.current) {
        await recordSyncPromiseRef.current;
        const syncedStaleInfo = recordStaleRef.current as RecordStaleInfo | null;
        if (syncedStaleInfo) {
          return { ok: false, message: syncedStaleInfo.message || 'Record is stale. Please refresh.' };
        }
      }

      if (startAutosave || startDraftSave || startUploads > 0) {
        logEvent('backgroundQueue.wait.done', { reason, waitForQueue, durationMs: Date.now() - startedAt });
      }
      return { ok: true };
    },
    [logEvent, waitForDraftSaveRequest]
  );

  const waitForGuidedStepAdvance = useCallback(
    async (args: {
      stepId: string;
      nextStepId?: string;
      trigger: 'next' | 'auto';
      waitDialog?: SystemActionGateDialogConfig | null;
    }): Promise<{ success: boolean; message?: string }> => {
      const uploadsInFlight = uploadQueueRef.current.size;
      if (uploadsInFlight <= 0) {
        return { success: true };
      }
      const copy = resolveGuidedUploadWaitDialog(args.waitDialog);
      const seq = guidedStepAdvanceBusy.lock({
        title: copy.title,
        message: copy.message,
        kind: 'guidedStepAdvance',
        diagnosticMeta: {
          stepId: args.stepId,
          nextStepId: args.nextStepId || null,
          trigger: args.trigger,
          uploadsInFlight
        }
      });
      try {
        const waitResult = await waitForBackgroundSaves(
          `guidedStepAdvance:${args.stepId || 'step'}:${args.trigger}`,
          'uploadsOnly'
        );
        if (!waitResult.ok) {
          const message = (
            waitResult.message ||
            tSystem('files.error.uploadFailed', languageRef.current, 'Could not add photos.')
          ).toString();
          setStatus(message);
          setStatusLevel('error');
          return { success: false, message };
        }
        return { success: true };
      } finally {
        guidedStepAdvanceBusy.unlock(seq, {
          stepId: args.stepId,
          nextStepId: args.nextStepId || null,
          trigger: args.trigger
        });
      }
    },
    [guidedStepAdvanceBusy, resolveGuidedUploadWaitDialog, waitForBackgroundSaves]
  );

  useEffect(() => {
    performAutoSaveRef.current = performAutoSave;
  }, [performAutoSave]);

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
    const inFormView = viewRef.current === 'form';
    const incompleteDedupKeys = inFormView && hasIncompleteRejectDedupKeys((definition as any)?.dedupRules, valuesRef.current as any);
    const homeLeaveDialog = resolveDedupIncompleteHomeDialogConfig(definition.actionBars);
    const homeLeaveDialogEnabled = homeLeaveDialog && homeLeaveDialog.enabled !== false;
    const homeLeaveCriteria = homeLeaveDialog?.criteria || 'dedupKeys';
    const incompleteConfiguredFields =
      inFormView &&
      hasIncompleteConfiguredFields(Array.isArray(homeLeaveDialog?.fieldIds) ? homeLeaveDialog.fieldIds : [], valuesRef.current as any);
    const hasEnteredData =
      hasEnteredTopLevelValues(definition.questions || [], valuesRef.current as any) ||
      hasEnteredLineItemValues(lineItemsRef.current || {});
    const allowLeaveUntouchedCreate = createFlowRef.current && !hasEnteredData;
    const shouldOpenHomeLeaveDialog =
      !allowLeaveUntouchedCreate &&
      inFormView &&
      homeLeaveDialogEnabled &&
      (homeLeaveCriteria === 'dedupKeys'
        ? incompleteDedupKeys
        : homeLeaveCriteria === 'fieldIds'
          ? incompleteConfiguredFields
          : incompleteDedupKeys || incompleteConfiguredFields);
    if (shouldOpenHomeLeaveDialog) {
      const activeHomeLeaveDialog = homeLeaveDialog || {};
      const copy = resolveDedupIncompleteHomeDialogCopy(activeHomeLeaveDialog, languageRef.current);
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
          const shouldDeleteCurrentRecord = activeHomeLeaveDialog.deleteRecordOnConfirm !== false;
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
            criteria: homeLeaveCriteria,
            incompleteDedupKeys,
            incompleteConfiguredFields,
            recordId: existingRecordId || null,
            deletedRecord: shouldDeleteCurrentRecord && !!existingRecordId
          });
          await requestNavigateToList('navigate.home.dedupIncomplete.confirm');
        }
      });
      logEvent('navigate.home.dedupIncomplete.dialog.open', {
        criteria: homeLeaveCriteria,
        incompleteDedupKeys,
        incompleteConfiguredFields
      });
      return;
    }
    void requestNavigateToList('navigate.home');
  }, [
    customConfirm,
    definition,
    logEvent,
    requestNavigateToList,
    triggerDedupDeleteOnKeyChange
  ]);

  const handleGoSummary = useCallback(() => {
    if (!summaryViewEnabled) return;
    // Kick autosave in the background (do not block navigation).
    void flushAutoSaveBeforeNavigate('navigate.summary');
    try {
      globalThis.scrollTo?.({ top: 0, left: 0, behavior: 'auto' });
    } catch {
      try {
        globalThis.scrollTo?.(0, 0);
      } catch {
        // ignore
      }
    }
    setView('summary');
  }, [flushAutoSaveBeforeNavigate, summaryViewEnabled]);

  // When a UI flow temporarily holds autosave (e.g., a subgroup overlay), persist any queued changes
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
    scheduleLatestAutoSave('dedupHold.release', autoSaveDebounceMs);
  }, [
    autoSaveDebounceMs,
    autoSaveEnabled,
    definition,
    dedupChecking,
    dedupConflict,
    dedupSignature,
    fieldChangeDialog.state.open,
    performAutoSave,
    scheduleLatestAutoSave,
    view
  ]);

  // Debounced autosave trigger on edits.
  useEffect(() => {
    if (!autoSaveEnabled) {
      if (autoSaveTimerRef.current) {
        globalThis.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      return;
    }
    // Only trigger autosave when the actual form data changes.
    const stateFingerprint = renderedAutoSaveStateFingerprint;
    const changed = lastAutoSaveStateFingerprintRef.current !== stateFingerprint;
    rememberAutoSaveSeenState(values, lineItems);
    if (!changed) return;
    const pendingAutomatedAutoSaveSource = pendingAutomatedAutoSaveSourceRef.current;
    pendingAutomatedAutoSaveSourceRef.current = '';
    if (
      shouldSuppressAutomatedAutoSave({
        pendingSource: pendingAutomatedAutoSaveSource,
        dirty: autoSaveDirtyRef.current,
        queued: autoSaveQueuedRef.current,
        inFlight: autoSaveInFlightRef.current
      })
    ) {
      logEvent('autosave.skip.automatedMutation', {
        source: pendingAutomatedAutoSaveSource,
        view
      });
      return;
    }

    if (view !== 'form') {
      if (autoSaveTimerRef.current) {
        globalThis.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      return;
    }
    if (submitting) {
      if (autoSaveTimerRef.current) {
        globalThis.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      return;
    }
    if (isClosedRecord) {
      if (autoSaveTimerRef.current) {
        globalThis.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
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
    const scheduledTimerId = scheduleLatestAutoSave(
      'debounced',
      resolveDebouncedAutoSaveDelay({
        debounceMs: autoSaveDebounceMs,
        lastUserInteractionAt: lastUserInteractionRef.current,
        now: Date.now()
      })
    );
    return () => {
      if (scheduledTimerId && autoSaveTimerRef.current === scheduledTimerId) {
        if (
          shouldRetainPendingDebouncedAutoSave({
            scheduledFingerprint: stateFingerprint,
            latestFingerprint: latestRenderedAutoSaveStateFingerprintRef.current
          })
        ) {
          return;
        }
        globalThis.clearTimeout(scheduledTimerId);
        autoSaveTimerRef.current = null;
      }
    };
  }, [
    autoSaveDebounceMs,
    autoSaveEnabled,
    definition,
    formKey,
    isClosedRecord,
    language,
    renderedAutoSaveStateFingerprint,
    rememberAutoSaveSeenState,
    scheduleLatestAutoSave,
    logEvent,
    submitting,
    view,
    values,
    lineItems
  ]);

  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) {
        globalThis.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
    };
  }, []);

  const ensureDraftRecordId = useCallback(
    async (args?: { reason?: string; fieldPath?: string }): Promise<{ success: boolean; recordId?: string; message?: string }> => {
      let recordId =
        resolveExistingRecordId({
          selectedRecordId: selectedRecordIdRef.current,
          selectedRecordSnapshot: selectedRecordSnapshotRef.current,
          lastSubmissionMetaId: lastSubmissionMetaRef.current?.id || null
        }) || '';
      if (recordId) return { success: true, recordId };

      const signature = (dedupSignatureRef.current || '').toString();
      if (signature) {
        if (dedupCheckingRef.current) {
          logEvent('record.ensure.waitDedup.start', {
            reason: args?.reason || null,
            fieldPath: args?.fieldPath || null
          });
          const startedAt = Date.now();
          const sleep = (ms: number) => new Promise<void>(resolve => globalThis.setTimeout(resolve, ms));
          while (dedupCheckingRef.current) {
            await sleep(60);
            if (Date.now() - startedAt > 15000) {
              const message = tSystem('dedup.checking', languageRef.current, 'Checking duplicates…');
              logEvent('record.ensure.waitDedup.timeout', {
                reason: args?.reason || null,
                fieldPath: args?.fieldPath || null,
                waitMs: Date.now() - startedAt
              });
              return { success: false, message };
            }
          }
          logEvent('record.ensure.waitDedup.done', {
            reason: args?.reason || null,
            fieldPath: args?.fieldPath || null,
            waitMs: Date.now() - startedAt
          });
        }
        const conflict = dedupConflictRef.current;
        if (conflict && conflict.message) {
          const message = conflict.message.toString();
          logEvent('record.ensure.blocked.dedup.conflict', {
            reason: args?.reason || null,
            fieldPath: args?.fieldPath || null,
            ruleId: conflict.ruleId
          });
          return { success: false, message };
        }
      }

      if (draftSaveRequestInFlightRef.current) {
        logEvent('record.ensure.waitDraftSave', {
          reason: args?.reason || null,
          fieldPath: args?.fieldPath || null
        });
        await waitForDraftSaveRequest('record.ensureDraftRecordId');
        recordId =
          resolveExistingRecordId({
            selectedRecordId: selectedRecordIdRef.current,
            selectedRecordSnapshot: selectedRecordSnapshotRef.current,
            lastSubmissionMetaId: lastSubmissionMetaRef.current?.id || null
          }) || '';
        if (recordId) {
          logEvent('record.ensure.reusedDraftSaveResult', {
            reason: args?.reason || null,
            fieldPath: args?.fieldPath || null,
            recordId
          });
          return { success: true, recordId };
        }
      }

      try {
        if (autoSaveTimerRef.current) {
          globalThis.clearTimeout(autoSaveTimerRef.current);
          autoSaveTimerRef.current = null;
        }
        setDraftSave({ phase: 'saving' });
        const statusRaw =
          ((lastSubmissionMetaRef.current?.status || selectedRecordSnapshotRef.current?.status || '') as any)?.toString?.() ||
          '';
        const draftStatus = resolveAutoSaveStatus(statusRaw);
        const draft = applyUploadedFieldPayloadOverrides(
          buildDraftPayload({
            definition,
            formKey,
            language: languageRef.current,
            values: valuesRef.current,
            lineItems: lineItemsRef.current
          }) as any
        );
        draft.__ckSaveMode = 'draft';
        draft.__ckStatus = draftStatus;
        draft.__ckCreateFlow = createFlowRef.current ? '1' : '';
        const res = await runCoalescedDraftSaveRequest('ensureDraftRecordId', draft, (nextPayload: any) =>
          submitCurrentRecordMutation('ensureDraftRecordId', nextPayload)
        );
        if (!res?.success) {
          const message = (res?.message || 'Failed to create draft record.').toString();
          setDraftSave({ phase: 'error', message });
          return { success: false, message };
        }
        recordId = (res?.meta?.id || '').toString();
        if (!recordId) {
          const message = 'Failed to create draft record id.';
          setDraftSave({ phase: 'error', message });
          return { success: false, message };
        }
        setSelectedRecordId(recordId);
        selectedRecordIdRef.current = recordId;
        createFlowRef.current = false;
        autoSaveDirtyRef.current = false;
        autoSaveQueuedRef.current = false;
        if (autoSaveTimerRef.current) {
          globalThis.clearTimeout(autoSaveTimerRef.current);
          autoSaveTimerRef.current = null;
        }
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
        lastSubmissionMetaRef.current = {
          ...(lastSubmissionMetaRef.current || {}),
          id: recordId,
          createdAt: (res?.meta?.createdAt || '').toString() || lastSubmissionMetaRef.current?.createdAt,
          updatedAt: (res?.meta?.updatedAt || '').toString() || lastSubmissionMetaRef.current?.updatedAt,
          dataVersion: Number.isFinite(Number((res as any)?.meta?.dataVersion))
            ? Number((res as any).meta.dataVersion)
            : lastSubmissionMetaRef.current?.dataVersion,
          status: draftStatus
        };
        recordStaleRef.current = null;
        setRecordStale(null);
        const dv = Number((res as any)?.meta?.dataVersion);
        if (Number.isFinite(dv) && dv > 0) {
          recordDataVersionRef.current = dv;
          optimisticClientDataVersionRef.current = dv;
        }
        const rn = Number((res as any)?.meta?.rowNumber);
        if (Number.isFinite(rn) && rn >= 2) {
          recordRowNumberRef.current = rn;
        }
        setDraftSave({ phase: 'saved', updatedAt: (res?.meta?.updatedAt || '').toString() || undefined });
        markRecordFreshnessServerTouch({ reason: 'record.ensureDraftId', recordId });
        upsertListCacheRow({
          recordId,
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
        logEvent('record.ensure.saved', {
          recordId,
          reason: args?.reason || null,
          fieldPath: args?.fieldPath || null
        });
        return { success: true, recordId };
      } catch (err: any) {
        const message = resolveUiErrorMessage(err, 'Failed to create draft record.');
        logEvent('record.ensure.error', {
          reason: args?.reason || null,
          fieldPath: args?.fieldPath || null,
          message: resolveLogMessage(err, 'Failed to create draft record.')
        });
        if (message) {
          setDraftSave({ phase: 'error', message });
        } else {
          setDraftSave({ phase: 'idle' });
        }
        return { success: false, message: message || '' };
      }
    },
    [
      applyUploadedFieldPayloadOverrides,
      definition,
      formKey,
      logEvent,
      markRecordFreshnessServerTouch,
      resolveAutoSaveStatus,
      resolveLogMessage,
      resolveUiErrorMessage,
      runCoalescedDraftSaveRequest,
      submitCurrentRecordMutation,
      upsertListCacheRow,
      waitForDraftSaveRequest
    ]
  );
  ensureDraftRecordIdActionRef.current = ensureDraftRecordId;

  const applyFollowupBatchResults = useCallback(
    (args: { recordId: string; actions: string[]; batch: FollowupBatchResponse; reason: string }) => {
      const followupErrors: string[] = [];
      const byAction = new Map<string, any>();
      const entries = Array.isArray(args.batch?.results) ? args.batch.results : [];
      entries.forEach(entry => {
        const key = (entry?.action || '').toString().trim().toUpperCase();
        if (key) byAction.set(key, entry?.result || null);
      });

      for (const action of args.actions) {
        const result = byAction.get(action) || null;
        if (!result?.success) {
          const msg = (result?.message || result?.status || 'Failed').toString();
          followupErrors.push(`${action}: ${msg}`);
          logEvent('followup.batch.error', { action, recordId: args.recordId, message: msg, reason: args.reason });
          continue;
        }
        const nextMeta = resolveFollowupActionResultMeta({
          result,
          currentDataVersion: recordDataVersionRef.current
        });
        upsertListCacheRow({
          recordId: args.recordId,
          updatedAt: nextMeta.updatedAt,
          status: nextMeta.status as any,
          pdfUrl: nextMeta.pdfUrl,
          dataVersion: nextMeta.dataVersion,
          rowNumber: nextMeta.rowNumber
        });
        markRecordFreshnessServerTouch({ reason: 'record.followupBatch', recordId: args.recordId });
        if (nextMeta.dataVersion !== undefined) {
          recordDataVersionRef.current = nextMeta.dataVersion;
          optimisticClientDataVersionRef.current = nextMeta.dataVersion;
        }
        if (nextMeta.rowNumber !== undefined) {
          recordRowNumberRef.current = nextMeta.rowNumber;
        }
        logEvent('followup.batch.success', {
          action,
          recordId: args.recordId,
          status: result.status || null,
          dataVersion: nextMeta.dataVersion ?? null,
          reason: args.reason
        });
        lastSubmissionMetaRef.current = {
          ...(lastSubmissionMetaRef.current || { id: args.recordId }),
          id: args.recordId,
          updatedAt: nextMeta.updatedAt || result.updatedAt || lastSubmissionMetaRef.current?.updatedAt,
          dataVersion: nextMeta.dataVersion ?? lastSubmissionMetaRef.current?.dataVersion,
          status:
            nextMeta.status !== undefined
              ? nextMeta.status || null
              : lastSubmissionMetaRef.current?.status || null
        };
        setLastSubmissionMeta(prev => ({
          ...(prev || { id: args.recordId }),
          updatedAt: nextMeta.updatedAt || result.updatedAt || prev?.updatedAt,
          dataVersion: nextMeta.dataVersion ?? prev?.dataVersion,
          status:
            nextMeta.status !== undefined
              ? nextMeta.status
              : prev?.status || null
        }));
        const nextSnapshotStatus =
          nextMeta.status !== undefined ? (nextMeta.status || undefined) : selectedRecordSnapshotRef.current?.status;
        selectedRecordSnapshotRef.current = selectedRecordSnapshotRef.current
          ? ({
              ...selectedRecordSnapshotRef.current,
              updatedAt: nextMeta.updatedAt || result.updatedAt || selectedRecordSnapshotRef.current.updatedAt,
              status: nextSnapshotStatus,
              pdfUrl: nextMeta.pdfUrl || result.pdfUrl || selectedRecordSnapshotRef.current.pdfUrl,
              dataVersion: nextMeta.dataVersion ?? (selectedRecordSnapshotRef.current as any).dataVersion,
              __rowNumber: nextMeta.rowNumber ?? (selectedRecordSnapshotRef.current as any).__rowNumber
            } as any)
          : selectedRecordSnapshotRef.current;
        setSelectedRecordSnapshot(prev =>
          prev
            ? ({
                ...prev,
                updatedAt: nextMeta.updatedAt || result.updatedAt || prev.updatedAt,
                status: nextMeta.status !== undefined ? (nextMeta.status || undefined) : prev.status,
                pdfUrl: nextMeta.pdfUrl || result.pdfUrl || prev.pdfUrl,
                dataVersion: nextMeta.dataVersion ?? (prev as any).dataVersion,
                __rowNumber: nextMeta.rowNumber ?? (prev as any).__rowNumber
              } as any)
            : prev
        );
      }

      return { followupErrors, byAction };
    },
    [logEvent, markRecordFreshnessServerTouch, upsertListCacheRow]
  );

  const refreshGuidedDataSourcesInBackground = useCallback(
    (args: { reason: string; forceRefresh?: boolean; retryDelaysMs?: number[] }) => {
      if (!guidedDataSourceConfigs.length) return;
      const retryDelays = Array.isArray(args.retryDelaysMs) && args.retryDelaysMs.length
        ? Array.from(new Set(args.retryDelaysMs.map(value => Number(value)).filter(value => Number.isFinite(value) && value >= 0)))
        : [0];
      logEvent('dataSource.prefetch.submitEffects.start', {
        formKey,
        language,
        dataSources: guidedDataSourceConfigs.length,
        reason: args.reason,
        forceRefresh: Boolean(args.forceRefresh),
        attempts: retryDelays.length
      });
      retryDelays.forEach((delayMs, attemptIndex) => {
        const run = () => {
          void prefetchDataSources(guidedDataSourceConfigs, language, {
            forceRefresh: Boolean(args.forceRefresh)
          })
            .then(res => {
              logEvent('dataSource.prefetch.submitEffects.done', {
                formKey,
                language,
                requested: res.requested,
                succeeded: res.succeeded,
                failed: res.failed,
                reason: args.reason,
                forceRefresh: Boolean(args.forceRefresh),
                attempt: attemptIndex + 1,
                attempts: retryDelays.length
              });
            })
            .catch((err: any) => {
              logEvent('dataSource.prefetch.submitEffects.error', {
                formKey,
                language,
                reason: args.reason,
                forceRefresh: Boolean(args.forceRefresh),
                message: err?.message || err?.toString?.() || 'unknown',
                attempt: attemptIndex + 1,
                attempts: retryDelays.length
              });
            });
        };
        if (delayMs <= 0) {
          run();
          return;
        }
        const timer = setTimeout(run, delayMs);
        guidedDataSourceRefreshTimersRef.current.push(timer);
      });
    },
    [formKey, guidedDataSourceConfigs, language, logEvent]
  );

  useEffect(() => {
    if (view !== 'form') return;
    if (!guidedDataSourceConfigs.length) return;
    if (recordLoadingId) return;
    const refreshKey = `${formKey}::${language}::${selectedRecordId || 'create'}::${view}`;
    if (formDataSourceRefreshKeyRef.current === refreshKey) return;
    formDataSourceRefreshKeyRef.current = refreshKey;
    refreshGuidedDataSourcesInBackground({
      reason: 'form.open',
      // Keep form-open fetches cache-aware so create/open does not immediately
      // refetch the same shared data sources that home prefetch just loaded.
      // Flows that truly require fresh shared data already invalidate caches first.
      forceRefresh: false,
      retryDelaysMs: [0]
    });
  }, [formKey, guidedDataSourceConfigs.length, language, recordLoadingId, refreshGuidedDataSourcesInBackground, selectedRecordId, view]);

  const refreshAfterFollowupBatch = useCallback(
    async (args: { recordId: string; reason: string; mode?: 'snapshot' | 'sharedDataOnly' }) => {
      invalidateClientSharedDataCaches({ includePersistedDataSources: true });
      logEvent('sharedData.cache.invalidated', {
        reason: args.reason,
        recordId: args.recordId,
        mode: args.mode || 'snapshot'
      });
      if (args.mode === 'sharedDataOnly') {
        refreshGuidedDataSourcesInBackground({
          reason: `${args.reason}.sharedDataOnly`,
          forceRefresh: true,
          retryDelaysMs: [0, 1200, 3500]
        });
        return;
      }
      try {
        await loadRecordSnapshot(args.recordId);
      } catch (err: any) {
        logEvent('followup.batch.refresh.error', {
          recordId: args.recordId,
          reason: args.reason,
          message: err?.message || err || 'unknown'
        });
      }
    },
    [loadRecordSnapshot, logEvent, refreshGuidedDataSourcesInBackground]
  );

  const applySuccessfulSubmissionState = useCallback(
    (args: {
      recordId: string;
      payload?: any;
      response?: any;
      statusFallback?: string | null;
    }) => {
      const recordId = (args.recordId || '').toString().trim();
      if (!recordId) return;
      const meta = (args.response?.meta || {}) as any;
      const nextStatus = (meta?.status || args.statusFallback || null) as string | null;
      const nextCreatedAt = (meta?.createdAt || '').toString() || undefined;
      const nextUpdatedAt = (meta?.updatedAt || '').toString() || undefined;
      const nextPdfUrl = (meta?.pdfUrl || '').toString() || undefined;
      const nextDataVersion = Number(meta?.dataVersion);
      const nextRowNumber = Number(meta?.rowNumber);
      const payloadValues = (((args.payload as any)?.values || {}) as Record<string, any>) || {};
      const nextMeta = {
        id: recordId,
        createdAt: nextCreatedAt,
        updatedAt: nextUpdatedAt,
        dataVersion: Number.isFinite(nextDataVersion) ? nextDataVersion : undefined,
        status: nextStatus
      };

      setSelectedRecordId(recordId);
      selectedRecordIdRef.current = recordId;
      setLastSubmissionMeta(prev => ({
        id: recordId || prev?.id || selectedRecordIdRef.current,
        createdAt: nextCreatedAt || prev?.createdAt,
        updatedAt: nextUpdatedAt || prev?.updatedAt,
        dataVersion: Number.isFinite(nextDataVersion) ? nextDataVersion : prev?.dataVersion,
        status: nextStatus || prev?.status || null
      }));
      lastSubmissionMetaRef.current = {
        ...(lastSubmissionMetaRef.current || {}),
        id: nextMeta.id,
        createdAt: nextMeta.createdAt || lastSubmissionMetaRef.current?.createdAt,
        updatedAt: nextMeta.updatedAt || lastSubmissionMetaRef.current?.updatedAt,
        dataVersion: nextMeta.dataVersion ?? lastSubmissionMetaRef.current?.dataVersion,
        status: nextMeta.status || lastSubmissionMetaRef.current?.status || null
      };
      recordStaleRef.current = null;
      setRecordStale(null);
      if (Number.isFinite(nextDataVersion) && nextDataVersion > 0) {
        recordDataVersionRef.current = nextDataVersion;
        optimisticClientDataVersionRef.current = nextDataVersion;
      }
      if (Number.isFinite(nextRowNumber) && nextRowNumber >= 2) {
        recordRowNumberRef.current = nextRowNumber;
      }

      setSelectedRecordSnapshot(prev => {
        if (prev && prev.id && prev.id !== recordId) return prev;
        if (!prev) return prev;
        const nextSnapshot = {
          ...prev,
          id: recordId,
          createdAt: nextCreatedAt || prev.createdAt,
          updatedAt: nextUpdatedAt || prev.updatedAt,
          status: nextStatus || prev.status,
          pdfUrl: nextPdfUrl || prev.pdfUrl,
          dataVersion: Number.isFinite(nextDataVersion) ? nextDataVersion : (prev as any).dataVersion,
          __rowNumber: Number.isFinite(nextRowNumber) ? nextRowNumber : (prev as any).__rowNumber,
          values: payloadValues && Object.keys(payloadValues).length
            ? { ...(prev.values || {}), ...payloadValues }
            : prev.values
        };
        selectedRecordSnapshotRef.current = nextSnapshot as WebFormSubmission;
        return nextSnapshot;
      });

      upsertListCacheRow({
        recordId,
        values: payloadValues,
        createdAt: nextCreatedAt,
        updatedAt: nextUpdatedAt,
        status: nextStatus,
        pdfUrl: nextPdfUrl,
        dataVersion: Number.isFinite(nextDataVersion) ? nextDataVersion : undefined,
        rowNumber: Number.isFinite(nextRowNumber) ? nextRowNumber : undefined
      });
      markRecordFreshnessServerTouch({ reason: 'record.persist', recordId });
    },
    [markRecordFreshnessServerTouch, upsertListCacheRow]
  );

  const applyLocalRecordStatus = useCallback(
    (args: { recordId: string; status: string | null | undefined }) => {
      const recordId = (args.recordId || '').toString().trim();
      if (!recordId) return;
      const nextStatus = (args.status || '').toString().trim() || null;
      setLastSubmissionMeta(prev => ({
        ...(prev || { id: recordId }),
        id: recordId,
        status: nextStatus
      }));
      setSelectedRecordSnapshot(prev =>
        prev
          ? {
              ...prev,
              id: prev.id || recordId,
              status: nextStatus || prev.status || undefined
            }
          : prev
      );
      upsertListCacheRow({
        recordId,
        status: nextStatus
      });
    },
    [upsertListCacheRow]
  );

  const persistCurrentSnapshot = useCallback(
    async (args: {
      reason: string;
      mode: 'draft' | 'submit';
      existingRecordId?: string;
      statusOverride?: string | null;
      collapsedRows?: Record<string, boolean>;
      collapsedSubgroups?: Record<string, boolean>;
      snapshotOverride?: {
        values: Record<string, FieldValue>;
        lineItems: LineItemState;
        language?: LangCode;
      };
    }): Promise<{ success: boolean; response?: any; payload?: any; recordId?: string; message?: string }> => {
      if (autoSaveTimerRef.current) {
        globalThis.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      autoSaveQueuedRef.current = false;
      if (draftSaveRequestInFlightRef.current) {
        logEvent('snapshot.save.waitDraftSave', {
          reason: args.reason,
          mode: args.mode,
          existingRecordId: args.existingRecordId || null
        });
        await waitForDraftSaveRequest(`snapshot:${args.reason}`);
      }
      if (
        args.mode === 'draft' &&
        args.existingRecordId &&
        !draftSaveRequestInFlightRef.current &&
        !autoSaveDirtyRef.current &&
        !autoSaveQueuedRef.current
      ) {
        logEvent('snapshot.save.skipped.cleanDraft', {
          reason: args.reason,
          recordId: args.existingRecordId
        });
        return {
          success: true,
          recordId: args.existingRecordId,
          response: {
            success: true,
            meta: {
              id: args.existingRecordId,
              updatedAt: lastSubmissionMetaRef.current?.updatedAt || selectedRecordSnapshotRef.current?.updatedAt || '',
              dataVersion: recordDataVersionRef.current || undefined,
              rowNumber: recordRowNumberRef.current || undefined,
              status: lastSubmissionMetaRef.current?.status || selectedRecordSnapshotRef.current?.status || null
            }
          }
        };
      }
      const snapshotValues = args.snapshotOverride?.values || valuesRef.current;
      const snapshotLineItems = args.snapshotOverride?.lineItems || lineItemsRef.current;
      const snapshotLanguage = args.snapshotOverride?.language || languageRef.current;
      const payloadSource = applyUploadedFieldOverrides({
        values: snapshotValues,
        lineItems: snapshotLineItems
      });
      const valuesForPayload = ingredientsFormActive
        ? applyIngredientActivationSystemFields(payloadSource.values as any)
        : payloadSource.values;
      const payload = applyUploadedFieldPayloadOverrides(
        args.mode === 'submit'
          ? await buildSubmissionPayload({
              definition,
              formKey,
              language: snapshotLanguage,
              values: valuesForPayload,
              lineItems: payloadSource.lineItems,
              existingRecordId: args.existingRecordId,
              collapsedRows: args.collapsedRows,
              collapsedSubgroups: args.collapsedSubgroups
            })
          : buildDraftPayload({
              definition,
              formKey,
              language: snapshotLanguage,
              values: valuesForPayload,
              lineItems: payloadSource.lineItems,
              existingRecordId: args.existingRecordId
            })
      );
      if (args.mode === 'draft') {
        (payload as any).__ckSaveMode = 'draft';
        (payload as any).__ckCreateFlow = createFlowRef.current ? '1' : '';
      }
      const nextStatus =
        (args.statusOverride || '').toString().trim() ||
        (args.mode === 'draft'
          ? resolveAutoSaveStatus(
              (((lastSubmissionMetaRef.current?.status || selectedRecordSnapshotRef.current?.status || '') as any)?.toString?.() ||
                '')
            )
          : '');
      if (nextStatus) {
        (payload as any).__ckStatus = nextStatus;
        (payload as any).values = {
          ...((((payload as any)?.values || {}) as Record<string, any>) || {}),
          status: nextStatus
        };
      }
      const baseVersion = recordDataVersionRef.current;
      if (args.existingRecordId && Number.isFinite(Number(baseVersion)) && Number(baseVersion) > 0) {
        (payload as any).__ckClientDataVersion = Number(baseVersion);
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
      const response =
        args.mode === 'draft'
          ? await runCoalescedDraftSaveRequest(`snapshot:${args.reason}`, payload, (nextPayload: any) =>
              submitCurrentRecordMutation(`snapshot:${args.reason}`, nextPayload)
            )
          : await submitCurrentRecordMutation(`submit:${args.reason}`, payload);
      const ok = Boolean(response?.success);
      const recordId = (((response as any)?.meta?.id) || args.existingRecordId || '').toString().trim();
      if (!ok) {
        return {
          success: false,
          response,
          payload,
          recordId,
          message: (response?.message || 'Failed to save the current record.').toString()
        };
      }
      if (recordId) {
        applySuccessfulSubmissionState({
          recordId,
          payload,
          response,
          statusFallback: nextStatus || null
        });
      }
      autoSaveDirtyRef.current = false;
      autoSaveQueuedRef.current = false;
      uploadedFieldValueOverridesRef.current.clear();
      setDraftSave({
        phase: 'saved',
        updatedAt: ((response?.meta?.updatedAt || '') as string).toString() || undefined
      });
      logEvent('snapshot.save.success', {
        reason: args.reason,
        mode: args.mode,
        recordId: recordId || null,
        status: nextStatus || null
      });
      return { success: true, response, payload, recordId };
    },
    [
      applySuccessfulSubmissionState,
      applyUploadedFieldPayloadOverrides,
      applyUploadedFieldOverrides,
      definition,
      formKey,
      ingredientsFormActive,
      logEvent,
      resolveAutoSaveStatus,
      runCoalescedDraftSaveRequest,
      submitCurrentRecordMutation,
      waitForDraftSaveRequest
    ]
  );

  const openConfiguredConfirmDialog = useCallback(
    (args: {
      dialog: any;
      kind: string;
      refId: string;
      defaultTitle?: string;
      defaultConfirmLabel?: string;
      defaultCancelLabel?: string;
    }): Promise<boolean> =>
      new Promise(resolve => {
        customConfirm.openConfirm({
          title: resolveLocalizedString(
            args.dialog?.title,
            languageRef.current,
            args.defaultTitle || tSystem('common.notice', languageRef.current, 'Notice')
          ),
          message: resolveDialogTemplate(args.dialog?.message, ''),
          confirmLabel: resolveLocalizedString(
            args.dialog?.confirmLabel,
            languageRef.current,
            args.defaultConfirmLabel || tSystem('common.confirm', languageRef.current, 'Confirm')
          ),
          cancelLabel: resolveLocalizedString(
            args.dialog?.cancelLabel,
            languageRef.current,
            args.defaultCancelLabel || tSystem('common.cancel', languageRef.current, 'Cancel')
          ),
          primaryAction: args.dialog?.primaryAction,
          showCancel: args.dialog?.showCancel,
          showCloseButton: args.dialog?.showCloseButton,
          dismissOnBackdrop: args.dialog?.dismissOnBackdrop,
          kind: args.kind,
          refId: args.refId,
          onConfirm: () => resolve(true),
          onCancel: () => resolve(false)
        });
      }),
    [customConfirm, resolveDialogTemplate]
  );

  const resolveGuidedStepReservationPlan = useCallback(
    (args: {
      stepId: string;
      recordId: string;
      mode?: 'step' | 'all';
      snapshotLineItems?: LineItemState;
    }) =>
      buildStepInventoryReservationPlan({
        definition,
        stepId: args.stepId,
        formKey,
        recordId: args.recordId,
        lineItems: args.snapshotLineItems || lineItemsRef.current,
        mode: args.mode || 'all',
        previousManagedScopes:
          reservationManagedScopesRef.current?.recordId === args.recordId
            ? reservationManagedScopesRef.current.scopes
            : []
      }),
    [definition, formKey]
  );

  const applyGuidedStepReservationPlan = useCallback(
    async (args: {
      stepId: string;
      recordId: string;
      logPrefix: string;
      dialogKind: string;
      plan?: InventoryReservationPlanRequest | null;
    }): Promise<{ success: boolean; message?: string; applied: boolean }> => {
      const reservationPlan = args.plan ?? resolveGuidedStepReservationPlan({
        stepId: args.stepId,
        recordId: args.recordId
      });
      if (!reservationPlan) {
        return { success: true, applied: false };
      }
      try {
        logEvent(`${args.logPrefix}.reservationPlan.begin`, {
          stepId: args.stepId,
          recordId: args.recordId,
          reservations: reservationPlan.reservations?.length || 0,
          managedScopes: reservationPlan.managedScopes?.length || 0
        });
        const reservationResult = await applyInventoryReservationPlanApi({
          ...reservationPlan,
          clientDataVersion: getCurrentKnownClientDataVersion() || undefined
        });
        if (!reservationResult.success) {
          const message = buildReservationFailureMessage(
            resolveUserFacingErrorMessage(
              reservationResult,
              reservationResult.message ||
                tSystem('inventory.reservationUpdateFailed', languageRef.current, 'Failed to update the reservation.')
            ) || '',
            tSystem('inventory.reservationUpdateFailed', languageRef.current, 'Failed to update the reservation.'),
            tSystem(
              'inventory.reservationUpdateFailedDetail',
              languageRef.current,
              "We couldn't update the reservation properly. Please try again."
            )
          );
          setStatus(message);
          setStatusLevel('error');
          logEvent(`${args.logPrefix}.reservationPlan.failed`, {
            stepId: args.stepId,
            recordId: args.recordId,
            message,
            conflict: reservationResult.conflict === true
          });
          await openConfiguredConfirmDialog({
            dialog: {
              title: tSystem('common.notice', languageRef.current, 'Notice'),
              message,
              confirmLabel: tSystem('common.ok', languageRef.current, 'OK'),
              showCancel: false,
              showCloseButton: true,
              dismissOnBackdrop: true
            },
            kind: `${args.dialogKind}.reservationPlan`,
            refId: args.stepId
          });
          return { success: false, message, applied: true };
        }
        logEvent(`${args.logPrefix}.reservationPlan.done`, {
          stepId: args.stepId,
          recordId: args.recordId,
          reservationsApplied: reservationResult.reservationsApplied || 0,
          reservationsReleased: reservationResult.reservationsReleased || 0
        });
        const adoptedSourceMeta = resolveReservationPlanSourceMetaAdoption({
          result: reservationResult,
          currentRecordId: args.recordId,
          currentDataVersion: getCurrentKnownClientDataVersion(),
          fallbackRecordId: args.recordId
        });
        if (adoptedSourceMeta) {
          applySuccessfulSubmissionState({
            recordId: args.recordId,
            response: { meta: adoptedSourceMeta }
          });
          logEvent(`${args.logPrefix}.reservationPlan.sourceMeta.sync`, {
            stepId: args.stepId,
            recordId: args.recordId,
            dataVersion: adoptedSourceMeta.dataVersion || null,
            rowNumber: adoptedSourceMeta.rowNumber || null
          });
        } else {
          logEvent(`${args.logPrefix}.reservationPlan.sourceMeta.skip`, {
            stepId: args.stepId,
            recordId: args.recordId,
            matched: reservationResult.sourceClientDataVersionMatched === true,
            sourceDataVersion: Number(reservationResult.sourceRecordMeta?.dataVersion) || null,
            currentDataVersion: getCurrentKnownClientDataVersion() || null
          });
        }
        markRecordFreshnessServerTouch({ reason: 'record.reservationPlan', recordId: args.recordId });
        markDataSourceFreshnessServerTouch({ reason: 'datasource.reservationPlan', stepId: args.stepId });
        const availability = Array.isArray(reservationResult.availability)
          ? (reservationResult.availability as InventoryAvailabilitySnapshot[]).filter(Boolean)
          : [];
        if (availability.length) {
          const cacheSync = applyInventoryAvailabilitySnapshotsToCachedDataSources({
            dataSourceConfigs: guidedDataSourceConfigs,
            language,
            availability
          });
          logEvent(`${args.logPrefix}.reservationPlan.cacheSync`, {
            stepId: args.stepId,
            recordId: args.recordId,
            updatedRows: cacheSync.updatedRows,
            updatedDataSourceIds: cacheSync.updatedDataSourceIds
          });
        }
        if (
          availability.length &&
          typeof window !== 'undefined' &&
          typeof window.dispatchEvent === 'function' &&
          typeof CustomEvent === 'function'
        ) {
          const detail: GuidedStepReservationAvailabilityEventDetail = {
            stepId: args.stepId,
            recordId: args.recordId,
            availability
          };
          window.dispatchEvent(
            new CustomEvent<GuidedStepReservationAvailabilityEventDetail>(
              GUIDED_STEP_RESERVATION_AVAILABILITY_EVENT,
              { detail }
            )
          );
        }
        return { success: true, applied: true };
      } catch (err: any) {
        const message = buildReservationFailureMessage(
          resolveUserFacingErrorMessage(
            err,
            tSystem('inventory.reservationUpdateFailed', languageRef.current, 'Failed to update the reservation.')
          ) || '',
          tSystem('inventory.reservationUpdateFailed', languageRef.current, 'Failed to update the reservation.'),
          tSystem(
            'inventory.reservationUpdateFailedDetail',
            languageRef.current,
            "We couldn't update the reservation properly. Please try again."
          )
        );
        setStatus(message);
        setStatusLevel('error');
        logEvent(`${args.logPrefix}.reservationPlan.exception`, {
          stepId: args.stepId,
          recordId: args.recordId,
          message: resolveLogMessage(err, message)
        });
        await openConfiguredConfirmDialog({
          dialog: {
            title: tSystem('common.notice', languageRef.current, 'Notice'),
            message,
            confirmLabel: tSystem('common.ok', languageRef.current, 'OK'),
            showCancel: false,
            showCloseButton: true,
            dismissOnBackdrop: true
          },
          kind: `${args.dialogKind}.reservationPlan`,
          refId: args.stepId
        });
        return { success: false, message, applied: true };
      }
    },
    [
      applySuccessfulSubmissionState,
      getCurrentKnownClientDataVersion,
      guidedDataSourceConfigs,
      language,
      logEvent,
      markDataSourceFreshnessServerTouch,
      markRecordFreshnessServerTouch,
      openConfiguredConfirmDialog,
      resolveGuidedStepReservationPlan,
      resolveLogMessage
    ]
  );

  const queueGuidedStepReservationPlan = useCallback(
    (args: {
      stepId: string;
      recordId: string;
      plan: InventoryReservationPlanRequest;
      logPrefix: string;
      dialogKind: string;
    }): Promise<{ success: boolean; message?: string; recordId: string; stepId: string; sessionId: number }> => {
      const sessionId = recordSessionRef.current;
      const fingerprint = buildInventoryReservationPlanFingerprint(args.plan);
      if (
        fingerprint &&
        reservationSyncMetaRef.current?.recordId === args.recordId &&
        reservationSyncMetaRef.current?.fingerprint === fingerprint
      ) {
        if (reservationSyncMetaRef.current.status === 'running' && reservationSyncPromiseRef.current) {
          return reservationSyncPromiseRef.current;
        }
        if (reservationSyncMetaRef.current.status === 'succeeded') {
          return Promise.resolve({
            success: true,
            recordId: args.recordId,
            stepId: args.stepId,
            sessionId
          });
        }
      }
      const run = async () => {
        reservationSyncMetaRef.current = {
          recordId: args.recordId,
          stepId: args.stepId,
          sessionId,
          status: 'running',
          fingerprint
        };
        const result = await applyGuidedStepReservationPlan({
          stepId: args.stepId,
          recordId: args.recordId,
          logPrefix: args.logPrefix,
          dialogKind: args.dialogKind,
          plan: args.plan
        });
        const outcome = {
          success: result.success,
          message: result.message,
          recordId: args.recordId,
          stepId: args.stepId,
          sessionId
        };
        reservationSyncMetaRef.current = {
          recordId: args.recordId,
          stepId: args.stepId,
          sessionId,
          status: result.success ? 'succeeded' : 'failed',
          fingerprint,
          message: result.message
        };
        if (result.success) {
          reservationManagedScopesRef.current = {
            recordId: args.recordId,
            scopes: Array.isArray(args.plan.managedScopes) ? args.plan.managedScopes.slice() : []
          };
        }
        if (!result.success) {
          const sameSession = recordSessionRef.current === sessionId;
          const sameRecord = (selectedRecordIdRef.current || '').toString().trim() === args.recordId;
          if (sameSession && sameRecord) {
            setRequestedGuidedStepId(args.stepId || null);
          }
        }
        return outcome;
      };

      const prior = reservationSyncPromiseRef.current;
      const next = (prior
        ? prior.catch(() => ({
            success: false,
            recordId: args.recordId,
            stepId: args.stepId,
            sessionId
          }))
        : Promise.resolve({
            success: true,
            recordId: args.recordId,
            stepId: args.stepId,
            sessionId
          })
      ).then(run);
      reservationSyncPromiseRef.current = next;
      return next;
    },
    [applyGuidedStepReservationPlan]
  );

  const queueGuidedStepReservationDraftSync = useCallback(
    (args: {
      stepId: string;
      reason: string;
      persistSnapshot?: boolean;
      snapshotLineItems?: LineItemState;
    }) => {
      const sessionId = recordSessionRef.current;
      const persistSnapshot = args.persistSnapshot !== false;
      const snapshotLineItems = args.snapshotLineItems || lineItemsRef.current;
      const queueFingerprint = [
        sessionId,
        args.stepId || '',
        persistSnapshot ? 'persist' : 'planOnly',
        buildDraftStateFingerprint({
          formKey,
          language: languageRef.current,
          values: valuesRef.current,
          lineItems: snapshotLineItems
        })
      ].join('::');
      if (
        guidedStepImmediateSyncActiveFingerprintRef.current === queueFingerprint ||
        guidedStepImmediateSyncPendingFingerprintRef.current === queueFingerprint
      ) {
        logEvent('guidedStep.liveSync.coalesced', {
          stepId: args.stepId,
          reason: args.reason
        });
        return;
      }

      guidedStepImmediateSyncPendingRef.current = {
        ...args,
        sessionId,
        fingerprint: queueFingerprint,
        persistSnapshot,
        snapshotLineItems
      };
      guidedStepImmediateSyncPendingFingerprintRef.current = queueFingerprint;

      if (guidedStepImmediateSyncPromiseRef.current) {
        logEvent('guidedStep.liveSync.queued', {
          stepId: args.stepId,
          reason: args.reason
        });
        return;
      }

      guidedStepImmediateSyncPromiseRef.current = (async () => {
        while (guidedStepImmediateSyncPendingRef.current) {
          const next = guidedStepImmediateSyncPendingRef.current;
          guidedStepImmediateSyncPendingRef.current = null;
          guidedStepImmediateSyncPendingFingerprintRef.current = '';
          guidedStepImmediateSyncActiveFingerprintRef.current = next.fingerprint;

          const recordId =
            resolveExistingRecordId({
              selectedRecordId: selectedRecordIdRef.current,
              selectedRecordSnapshot: selectedRecordSnapshotRef.current,
              lastSubmissionMetaId: lastSubmissionMetaRef.current?.id || null
            }) || '';
          if (!recordId) {
            logEvent('guidedStep.liveSync.skipped.noRecordId', {
              stepId: next.stepId,
              reason: next.reason
            });
            continue;
          }

          const reservationPlan = resolveGuidedStepReservationPlan({
            stepId: next.stepId,
            recordId,
            mode: 'step',
            snapshotLineItems: next.snapshotLineItems
          });
          if (!reservationPlan) continue;
          const snapshotOverride = {
            values: valuesRef.current,
            lineItems: next.snapshotLineItems || lineItemsRef.current,
            language: languageRef.current
          };

          logEvent('guidedStep.liveSync.begin', {
            stepId: next.stepId,
            reason: next.reason,
            recordId,
            reservations: reservationPlan.reservations?.length || 0,
            managedScopes: reservationPlan.managedScopes?.length || 0
          });

          const reservationOutcome = await queueGuidedStepReservationPlan({
            stepId: next.stepId,
            recordId,
            plan: reservationPlan,
            logPrefix: 'guidedStep.liveSync',
            dialogKind: 'guidedStepLiveSync'
          });
          if (recordSessionRef.current !== next.sessionId) continue;
          if (!reservationOutcome.success) {
            logEvent('guidedStep.liveSync.blocked.reservationFailed', {
              stepId: next.stepId,
              reason: next.reason,
              recordId,
              message: reservationOutcome.message || null
            });
            continue;
          }

          if (!next.persistSnapshot) {
            logEvent('guidedStep.liveSync.done', {
              stepId: next.stepId,
              reason: next.reason,
              recordId,
              persistedSnapshot: false
            });
            continue;
          }

          autoSaveDirtyRef.current = true;
          autoSaveQueuedRef.current = false;
          setDraftSave(prev => (prev.phase === 'saving' || prev.phase === 'dirty' ? prev : { phase: 'dirty' }));

          const snapshotResult = await persistCurrentSnapshot({
            reason: `${next.reason}.reservationConfirmed`,
            mode: 'draft',
            existingRecordId: recordId,
            snapshotOverride
          });
          if (recordSessionRef.current !== next.sessionId) continue;
          if (!snapshotResult.success) {
            const message = (snapshotResult.message || 'Could not save the latest changes.').toString();
            if (isSubmissionStaleMessage(message)) {
              logEvent('guidedStep.liveSync.snapshot.deferredToAutosave', {
                stepId: next.stepId,
                reason: next.reason,
                recordId,
                message
              });
              continue;
            }
            setStatus(message);
            setStatusLevel('error');
            setRequestedGuidedStepId(next.stepId || null);
            logEvent('guidedStep.liveSync.snapshot.failed', {
              stepId: next.stepId,
              reason: next.reason,
              recordId,
              message
            });
            continue;
          }

          logEvent('guidedStep.liveSync.done', {
            stepId: next.stepId,
            reason: next.reason,
            recordId: snapshotResult.recordId || recordId,
            persistedSnapshot: true
          });
        }
      })()
        .catch(err => {
          logEvent('guidedStep.liveSync.exception', {
            message: resolveLogMessage(err, 'Failed to synchronize the guided step.')
          });
        })
        .finally(() => {
          guidedStepImmediateSyncPromiseRef.current = null;
          guidedStepImmediateSyncActiveFingerprintRef.current = '';
          if (guidedStepImmediateSyncPendingRef.current) {
            queueGuidedStepReservationDraftSync({
              stepId: guidedStepImmediateSyncPendingRef.current.stepId,
              reason: guidedStepImmediateSyncPendingRef.current.reason,
              persistSnapshot: guidedStepImmediateSyncPendingRef.current.persistSnapshot,
              snapshotLineItems: guidedStepImmediateSyncPendingRef.current.snapshotLineItems
            });
          } else if (!submittingRef.current && (autoSaveDirtyRef.current || autoSaveQueuedRef.current)) {
            scheduleLatestAutoSave('guidedStepLiveSync.release', autoSaveDebounceMs);
          }
          resumeDeferredRecordFreshnessSyncRef.current('guidedStep.liveSync.release');
        });
    },
    [
      autoSaveDebounceMs,
      formKey,
      logEvent,
      persistCurrentSnapshot,
      queueGuidedStepReservationPlan,
      resolveGuidedStepReservationPlan,
      resolveLogMessage,
      scheduleLatestAutoSave
    ]
  );

  const queueGuidedStepBackgroundSync = useCallback(
    (args: { stepId: string; nextStepId?: string; trigger: 'next' | 'auto' }) => {
      const sessionId = recordSessionRef.current;
      if (
        shouldSkipGuidedStepBackgroundSync({
          autoSaveDirty: autoSaveDirtyRef.current,
          autoSaveQueued: autoSaveQueuedRef.current,
          lastExternalSyncAt: lastExternalRecordSyncAtRef.current,
          lastLocalRecordMutationAt: lastLocalRecordMutationAtRef.current
        })
      ) {
        logEvent('guidedStep.advance.backgroundSync.skipped.externalSyncBaseline', {
          stepId: args.stepId,
          nextStepId: args.nextStepId || null,
          trigger: args.trigger,
          lastExternalSyncAt: lastExternalRecordSyncAtRef.current || null,
          lastLocalRecordMutationAt: lastLocalRecordMutationAtRef.current || null
        });
        return;
      }
      const queueFingerprint = [
        sessionId,
        args.stepId || '',
        args.nextStepId || '',
        args.trigger,
        buildDraftStateFingerprint({
          formKey,
          language: languageRef.current,
          values: valuesRef.current,
          lineItems: lineItemsRef.current
        }),
        autoSaveDirtyRef.current ? 'dirty' : 'clean',
        autoSaveQueuedRef.current ? 'queued' : 'idle'
      ].join('::');
      if (
        guidedStepBackgroundSyncActiveFingerprintRef.current === queueFingerprint ||
        guidedStepBackgroundSyncPendingFingerprintRef.current === queueFingerprint
      ) {
        logEvent('guidedStep.advance.backgroundSync.coalesced', {
          stepId: args.stepId,
          nextStepId: args.nextStepId || null,
          trigger: args.trigger
        });
        return;
      }

      guidedStepBackgroundSyncPendingRef.current = {
        ...args,
        sessionId,
        fingerprint: queueFingerprint
      };
      guidedStepBackgroundSyncPendingFingerprintRef.current = queueFingerprint;

      if (guidedStepBackgroundSyncPromiseRef.current) {
        logEvent('guidedStep.advance.backgroundSync.queued', {
          stepId: args.stepId,
          nextStepId: args.nextStepId || null,
          trigger: args.trigger
        });
        return;
      }

      guidedStepBackgroundSyncPromiseRef.current = (async () => {
        while (guidedStepBackgroundSyncPendingRef.current) {
          const next = guidedStepBackgroundSyncPendingRef.current;
          guidedStepBackgroundSyncPendingRef.current = null;
          guidedStepBackgroundSyncPendingFingerprintRef.current = '';
          guidedStepBackgroundSyncActiveFingerprintRef.current = next.fingerprint;

          const reason = `guidedStepAdvance:${next.stepId || 'step'}:${next.trigger}`;
          let recordId =
            resolveExistingRecordId({
              selectedRecordId: selectedRecordIdRef.current,
              selectedRecordSnapshot: selectedRecordSnapshotRef.current,
              lastSubmissionMetaId: lastSubmissionMetaRef.current?.id || null
            }) || '';

          const hadDraftSaveInFlight = draftSaveRequestInFlightRef.current;
          if (hadDraftSaveInFlight) {
            await waitForDraftSaveRequest(`${reason}.queued`);
            if (recordSessionRef.current !== next.sessionId) continue;
            recordId =
              resolveExistingRecordId({
                selectedRecordId: selectedRecordIdRef.current,
                selectedRecordSnapshot: selectedRecordSnapshotRef.current,
                lastSubmissionMetaId: lastSubmissionMetaRef.current?.id || null
              }) || recordId;
          }

          const needsDraftSave = autoSaveDirtyRef.current || autoSaveQueuedRef.current;
          if (needsDraftSave) {
            const snapshotResult = await persistCurrentSnapshot({
              reason: `${reason}.background`,
              mode: 'draft',
              existingRecordId: recordId || undefined
            });
            if (recordSessionRef.current !== next.sessionId) continue;
            if (!snapshotResult.success) {
              const message = (snapshotResult.message || 'Could not save the latest changes.').toString();
              setStatus(message);
              setStatusLevel('error');
              logEvent('guidedStep.advance.backgroundSnapshot.failed', {
                stepId: next.stepId,
                nextStepId: next.nextStepId || null,
                recordId: recordId || null,
                message
              });
              continue;
            }
            recordId = snapshotResult.recordId || recordId;
          }

          if (!recordId) continue;
          const reservationPlan = resolveGuidedStepReservationPlan({
            stepId: next.stepId,
            recordId,
            mode: 'all'
          });
          if (!reservationPlan) continue;
          void queueGuidedStepReservationPlan({
            stepId: next.stepId,
            recordId,
            plan: reservationPlan,
            logPrefix: 'guidedStep.advance',
            dialogKind: 'guidedStepAdvance'
          });
        }
      })()
        .catch(err => {
          logEvent('guidedStep.advance.backgroundSync.exception', {
            message: resolveLogMessage(err, 'Failed to synchronize guided step changes.')
          });
        })
        .finally(() => {
          guidedStepBackgroundSyncPromiseRef.current = null;
          guidedStepBackgroundSyncActiveFingerprintRef.current = '';
          if (guidedStepBackgroundSyncPendingRef.current) {
            queueGuidedStepBackgroundSync({
              stepId: guidedStepBackgroundSyncPendingRef.current.stepId,
              nextStepId: guidedStepBackgroundSyncPendingRef.current.nextStepId,
              trigger: guidedStepBackgroundSyncPendingRef.current.trigger
            });
          }
          resumeDeferredRecordFreshnessSyncRef.current('guidedStep.backgroundSync.release');
        });
    },
    [
      formKey,
      logEvent,
      persistCurrentSnapshot,
      queueGuidedStepReservationPlan,
      resolveGuidedStepReservationPlan,
      resolveLogMessage,
      waitForDraftSaveRequest
    ]
  );

  const waitForPendingReservationSync = useCallback(
    async (args: {
      recordId: string;
      reason: string;
    }): Promise<{ ok: boolean; message?: string }> => {
      const recordId = (args.recordId || '').toString().trim();
      if (!recordId) return { ok: true };
      const meta = reservationSyncMetaRef.current;
      if (!meta || meta.recordId !== recordId) return { ok: true };
      if (meta.status === 'failed') {
        const message =
          meta.message ||
          tSystem(
            'inventory.reservationUpdateFailedDetail',
            languageRef.current,
            "We couldn't update the reservation properly. Please try again."
          );
        logEvent('reservationSync.wait.blocked.failed', {
          reason: args.reason,
          recordId,
          stepId: meta.stepId
        });
        setRequestedGuidedStepId(meta.stepId || null);
        return { ok: false, message };
      }
      if (meta.status !== 'running' || !reservationSyncPromiseRef.current) {
        return { ok: true };
      }
      logEvent('reservationSync.wait.start', {
        reason: args.reason,
        recordId,
        stepId: meta.stepId
      });
      const outcome = await reservationSyncPromiseRef.current.catch(() => ({
        success: false,
        message:
          meta.message ||
          tSystem(
            'inventory.reservationUpdateFailedDetail',
            languageRef.current,
            "We couldn't update the reservation properly. Please try again."
          ),
        recordId,
        stepId: meta.stepId,
        sessionId: meta.sessionId
      }));
      if (!outcome.success) {
        setRequestedGuidedStepId(outcome.stepId || null);
        return {
          ok: false,
          message:
            outcome.message ||
            tSystem(
              'inventory.reservationUpdateFailedDetail',
              languageRef.current,
              "We couldn't update the reservation properly. Please try again."
            )
        };
      }
      return { ok: true };
    },
    [logEvent]
  );

  const waitForGuidedStepReservationDraftSync = useCallback(
    async (args: {
      recordId: string;
      stepId?: string;
      reason: string;
    }): Promise<{ ok: boolean; message?: string }> => {
      const recordId = (args.recordId || '').toString().trim();
      if (!recordId) return { ok: true };
      if (guidedStepImmediateSyncPromiseRef.current) {
        logEvent('guidedStep.liveSync.wait.start', {
          reason: args.reason,
          recordId,
          stepId: args.stepId || null
        });
        await guidedStepImmediateSyncPromiseRef.current.catch(() => undefined);
        logEvent('guidedStep.liveSync.wait.done', {
          reason: args.reason,
          recordId,
          stepId: args.stepId || null
        });
      }
      return waitForPendingReservationSync({
        recordId,
        reason: args.reason
      });
    },
    [logEvent, waitForPendingReservationSync]
  );

  const handleBeforeGuidedStepAdvance = useCallback(
    async (args: {
      stepId: string;
      nextStepId?: string;
      trigger: 'next' | 'auto';
      waitDialog?: SystemActionGateDialogConfig | null;
    }): Promise<{ success: boolean; message?: string }> => {
      const waitResult = await waitForGuidedStepAdvance(args);
      if (!waitResult.success) return waitResult;
      queueGuidedStepBackgroundSync(args);
      return { success: true };
    },
    [
      queueGuidedStepBackgroundSync,
      waitForGuidedStepAdvance
    ]
  );

  const handleGuidedStepMilestone = useCallback(
    async (args: {
      stepId: string;
      action: StepMilestoneActionConfig;
      nextStepId?: string;
    }): Promise<{ success: boolean; advanceToNext?: boolean; message?: string }> => {
      if (!args.action || args.action.type !== 'followupBatch') {
        return { success: false, message: 'Unsupported step action.' };
      }
      const preActions = Array.isArray(args.action.preActions)
        ? args.action.preActions.map((entry: string) => (entry || '').toString().trim()).filter(Boolean)
        : [];
      const backgroundActions = Array.isArray(args.action.backgroundActions)
        ? args.action.backgroundActions.map((entry: string) => (entry || '').toString().trim()).filter(Boolean)
        : [];
      const legacyActions = Array.isArray(args.action.actions)
        ? args.action.actions.map((entry: string) => (entry || '').toString().trim()).filter(Boolean)
        : [];
      const effectiveBackgroundActions =
        backgroundActions.length > 0
          ? backgroundActions
          : (preActions.length === 0 ? legacyActions : []);
      const resolveOptimisticStatusForActions = (actions: string[]): string => {
        const normalized = actions.map(entry => (entry || '').toString().trim().toUpperCase()).filter(Boolean);
        if (!normalized.length) return '';
        if (normalized.includes('CLOSE_RECORD')) {
          return resolveStatusTransitionValue(statusTransitions, 'onClose', languageRef.current, {
            includeDefaultOnClose: true
          }) || 'Closed';
        }
        if (normalized.includes('SEND_EMAIL')) {
          return resolveStatusTransitionValue(statusTransitions, 'onEmail', languageRef.current, {
            includeDefaultOnClose: false
          });
        }
        if (normalized.includes('CREATE_PDF')) {
          return resolveStatusTransitionValue(statusTransitions, 'onPdf', languageRef.current, {
            includeDefaultOnClose: false
          });
        }
        return '';
      };
      if (!preActions.length && !effectiveBackgroundActions.length) {
        return { success: true, advanceToNext: args.action.advanceAfterStart !== false };
      }

      const reason = `guidedStepMilestone:${args.stepId || 'step'}`;
      const guidedStepPrefix = ((((definition as any)?.steps as any)?.stateFields?.prefix || '__ckStep') as string).toString();
      const milestoneVirtualState: GuidedStepsVirtualState | null =
        guidedUiState?.activeStepId
          ? {
              prefix: guidedStepPrefix,
              activeStepId: guidedUiState.activeStepId,
              activeStepIndex: guidedUiState.activeStepIndex || 0,
              maxValidIndex: -1,
              maxCompleteIndex: -1,
              steps: []
            }
          : null;
      const milestoneConfirmationDialog = selectMilestoneConfirmationDialog({
        action: args.action,
        ctx: buildValidationContext(valuesRef.current as any, lineItemsRef.current as any, milestoneVirtualState),
        now: new Date()
      });
      if (milestoneConfirmationDialog) {
        logEvent('guidedStep.milestone.confirm.prompt', {
          stepId: args.stepId,
          nextStepId: args.nextStepId || null,
          hasConditionalCases: Array.isArray(args.action.confirmationDialogCases) && args.action.confirmationDialogCases.length > 0,
          title: resolveLocalizedString(milestoneConfirmationDialog.title, languageRef.current, '') || null
        });
        const confirmed = await openConfiguredConfirmDialog({
          dialog: milestoneConfirmationDialog,
          kind: 'guidedStepMilestone',
          refId: args.stepId
        });
        if (!confirmed) {
          logEvent('guidedStep.milestone.confirm.cancel', {
            stepId: args.stepId,
            nextStepId: args.nextStepId || null
          });
          return { success: false, advanceToNext: false, message: 'cancelled' };
        }
      }
      const milestoneQueuePolicy =
        args.action.waitForQueue ||
        (args.action.waitForBackgroundSaves ? 'all' : 'none');
      const busySeq = guidedMilestoneBusy.lock({
        title: tSystem('draft.savingShort', languageRef.current, 'Saving…'),
        message: tSystem(
          'navigation.waitSaving',
          languageRef.current,
          'Please wait while we save your changes...'
        ),
        kind: 'guidedStepMilestone',
        diagnosticMeta: { stepId: args.stepId, nextStepId: args.nextStepId || null }
      });
      let busyUnlocked = false;
      const existingRecordId =
        resolveExistingRecordId({
          selectedRecordId: selectedRecordIdRef.current,
          selectedRecordSnapshot: selectedRecordSnapshotRef.current,
          lastSubmissionMetaId: lastSubmissionMetaRef.current?.id || null
        }) || '';

      try {
        if (milestoneQueuePolicy === 'all') {
          const waitResult = await flushAutoSaveBeforeNavigate(reason);
          logEvent('guidedStep.milestone.flush', {
            stepId: args.stepId,
            recordId: existingRecordId || null,
            flushed: waitResult
          });
        } else if (autoSaveTimerRef.current) {
          globalThis.clearTimeout(autoSaveTimerRef.current);
          autoSaveTimerRef.current = null;
          logEvent('guidedStep.milestone.flush.skipped', {
            stepId: args.stepId,
            recordId: existingRecordId || null,
            waitForQueue: milestoneQueuePolicy
          });
        }
        if (milestoneQueuePolicy !== 'none') {
          const queueResult = await waitForBackgroundSaves(reason, milestoneQueuePolicy);
          logEvent('guidedStep.milestone.queueWait', {
            stepId: args.stepId,
            recordId: existingRecordId || null,
            waitForQueue: milestoneQueuePolicy,
            ok: queueResult.ok
          });
          if (!queueResult.ok) {
            const message = (queueResult.message || 'Could not prepare the record.').toString();
            setStatus(message);
            setStatusLevel('error');
            return { success: false, advanceToNext: false, message };
          }
        }

        let recordId = existingRecordId;
        if (!recordId || args.action.ensureRecordId !== false) {
          const ensured = await ensureDraftRecordId({ reason });
          if (!ensured.success || !ensured.recordId) {
            const message = (ensured.message || 'Could not prepare the record.').toString();
            setStatus(message);
            setStatusLevel('error');
            logEvent('guidedStep.milestone.ensureRecordId.failed', {
              stepId: args.stepId,
              message
            });
            return { success: false, message };
          }
          recordId = ensured.recordId;
        }

        const snapshotSavedByEnsure = !existingRecordId && !!recordId;
        if (!snapshotSavedByEnsure) {
          const snapshotResult = await persistCurrentSnapshot({
            reason: `${reason}.snapshot`,
            mode: 'draft',
            existingRecordId: recordId
          });
          if (!snapshotResult.success || !snapshotResult.recordId) {
            const message = (snapshotResult.message || 'Could not save the latest changes.').toString();
            setStatus(message);
            setStatusLevel('error');
            logEvent('guidedStep.milestone.snapshot.failed', {
              stepId: args.stepId,
              recordId: recordId || null,
              message
            });
            return { success: false, message };
          }
          recordId = snapshotResult.recordId;
        }

        const requiresReservationSyncDrain = [...preActions, ...effectiveBackgroundActions]
          .map(entry => (entry || '').toString().trim().toUpperCase())
          .includes('CLOSE_RECORD');
        if (requiresReservationSyncDrain) {
          const reservationWait = await waitForPendingReservationSync({
            recordId,
            reason: `${reason}.reservationSync`
          });
          if (!reservationWait.ok) {
            const message = (
              reservationWait.message ||
              tSystem('inventory.reservationConfirmFailed', languageRef.current, 'Could not confirm reservation changes.')
            ).toString();
            setStatus(message);
            setStatusLevel('error');
            return { success: false, advanceToNext: false, message };
          }
        }

        const runBatch = async (
          actions: string[],
          batchReason: string
        ): Promise<{ success: boolean; message?: string; byAction?: Map<string, any> }> => {
          try {
            logEvent('guidedStep.milestone.followup.begin', {
              stepId: args.stepId,
              recordId,
              actions,
              runInBackground: batchReason.endsWith('.background') && args.action.runInBackground === true,
              nextStepId: args.nextStepId || null
            });
            const batch = await runSerializedFollowupBatchRequest({
              recordId,
              actions,
              reason: batchReason
            });
            const batchOutcome = applyFollowupBatchResults({
              recordId,
              actions,
              batch,
              reason: batchReason
            });
            const { followupErrors } = batchOutcome;
            await refreshAfterFollowupBatch({
              recordId,
              reason: batchReason,
              mode: batchReason.endsWith('.background') || batchReason.endsWith('.pre') ? 'sharedDataOnly' : 'snapshot'
            });
            if (followupErrors.length) {
              const message = followupErrors.join(' · ');
              setStatus(message);
              setStatusLevel('error');
              return { success: false, message };
            }
            logEvent('guidedStep.milestone.followup.done', {
              stepId: args.stepId,
              recordId,
              actionsCount: actions.length
            });
            return { success: true, byAction: batchOutcome.byAction };
          } catch (err: any) {
            const uiMessage = resolveUiErrorMessage(err, 'Failed to run follow-up actions.');
            const logMessage = resolveLogMessage(err, 'Failed to run follow-up actions.');
            if (uiMessage) {
              setStatus(uiMessage);
              setStatusLevel('error');
            }
            logEvent('guidedStep.milestone.followup.exception', {
              stepId: args.stepId,
              recordId,
              message: logMessage
            });
            return { success: false, message: uiMessage || logMessage };
          }
        };

        const launchEntireBatchInBackground = args.action.runInBackground === true;
        const allBackgroundActions = [
          ...preActions,
          ...effectiveBackgroundActions
        ].filter(Boolean);
        const navigateAfterSuccess = (target: 'current' | 'form' | 'summary' | 'list' | undefined) => {
          if (!target || target === 'current') return;
          setView(target);
        };
        const maybeOpenGeneratedRecordsDialog = async (closeResult: any): Promise<boolean> => {
          const dialogConfig = args.action.generatedRecordsDialog;
          if (!dialogConfig) return false;
          const generatedRecords = filterGeneratedRecordsForDialog({
            config: dialogConfig,
            records: getGeneratedRecordsFromFollowupResult(closeResult)
          });
          if (!generatedRecords.length) {
            logEvent('guidedStep.milestone.generatedRecords.skip', {
              stepId: args.stepId,
              targetFormKey: dialogConfig.targetFormKey || null,
              submitEffectIds: Array.isArray(dialogConfig.submitEffectIds) ? dialogConfig.submitEffectIds : []
            });
            return false;
          }
          const itemTemplate =
            resolveLocalizedString(dialogConfig.itemTemplate, languageRef.current, '{{recordId}}') || '{{recordId}}';
          const intro = resolveLocalizedString(dialogConfig.message, languageRef.current, '');
          const lines = generatedRecords.map(record => renderGeneratedRecordLine(record, itemTemplate)).filter(Boolean);
          const message = [intro, ...lines].filter(Boolean).join('\n');
          logEvent('guidedStep.milestone.generatedRecords.open', {
            stepId: args.stepId,
            count: generatedRecords.length,
            targetFormKey: dialogConfig.targetFormKey || null
          });
          await openConfiguredConfirmDialog({
            dialog: {
              title: resolveLocalizedString(
                dialogConfig.title,
                languageRef.current,
                tSystem('common.notice', languageRef.current, 'Notice')
              ),
              message,
              confirmLabel: resolveLocalizedString(
                dialogConfig.confirmLabel,
                languageRef.current,
                tSystem('common.ok', languageRef.current, 'OK')
              ),
              showCancel: false,
              showCloseButton: false,
              dismissOnBackdrop: false
            },
            kind: 'guidedStepMilestone.generatedRecords',
            refId: args.stepId
          });
          return true;
        };

        if (launchEntireBatchInBackground && allBackgroundActions.length) {
          const previousStatus =
            ((lastSubmissionMetaRef.current?.status || selectedRecordSnapshotRef.current?.status || '') as any)?.toString?.() || '';
          const optimisticStatus = resolveOptimisticStatusForActions(allBackgroundActions);
          if (optimisticStatus) {
            applyLocalRecordStatus({ recordId, status: optimisticStatus });
          }
          const followupSessionId = recordSessionRef.current;
          const backgroundPromise = (async () => {
            let outcome: { success: boolean; message?: string } = { success: true };
            if (preActions.length) {
              outcome = await runBatch(preActions, `${reason}.pre`);
            }
            if (outcome.success && effectiveBackgroundActions.length) {
              outcome = await runBatch(effectiveBackgroundActions, `${reason}.background`);
            }
            if (outcome.success) {
              return {
                success: true,
                recordId,
                stepId: args.stepId,
                sessionId: followupSessionId,
                reason
              };
            }
            if (optimisticStatus) {
              applyLocalRecordStatus({ recordId, status: previousStatus || null });
            }
            setRequestedGuidedStepId(args.stepId || null);
            return {
              success: false,
              message: outcome.message || '',
              recordId,
              stepId: args.stepId,
              sessionId: followupSessionId,
              reason
            };
          })().finally(() => {
            const pending = pendingFollowupBatchPromisesRef.current.get(recordId);
            if (pending === backgroundPromise) {
              pendingFollowupBatchPromisesRef.current.delete(recordId);
            }
            logEvent('followup.pending.settled', {
              stepId: args.stepId,
              recordId,
              nextStepId: args.nextStepId || null
            });
          });
          pendingFollowupBatchPromisesRef.current.set(recordId, backgroundPromise);
          logEvent('followup.pending.tracked', {
            stepId: args.stepId,
            recordId,
            nextStepId: args.nextStepId || null
          });
          void backgroundPromise;
          guidedMilestoneBusy.unlock(busySeq, {
            stepId: args.stepId,
            launchedBackground: true
          });
          busyUnlocked = true;
          const feedbackDialog = args.action.feedbackDialog;
          if (feedbackDialog) {
            void openConfiguredConfirmDialog({
              dialog: {
                ...feedbackDialog,
                showCancel: feedbackDialog.showCancel ?? false,
                confirmLabel: feedbackDialog.confirmLabel ?? tSystem('common.ok', languageRef.current, 'OK')
              },
              kind: 'guidedStepMilestone',
              refId: args.stepId
            });
          }
          navigateAfterSuccess(args.action.navigateToAfterSuccess);
          return { success: true, advanceToNext: args.action.advanceAfterStart !== false };
        }

        let preOutcomeByAction: Map<string, any> | undefined;
        if (preActions.length) {
          const preOutcome = await runBatch(preActions, `${reason}.pre`);
          if (!preOutcome.success) {
            return { success: false, advanceToNext: false, message: preOutcome.message };
          }
          preOutcomeByAction = preOutcome.byAction;
        }

        const outcome = effectiveBackgroundActions.length
          ? await runBatch(effectiveBackgroundActions, `${reason}.background`)
          : { success: true as const, byAction: undefined as Map<string, any> | undefined };
        guidedMilestoneBusy.unlock(busySeq, {
          stepId: args.stepId,
          launchedBackground: false,
          success: outcome.success
        });
        busyUnlocked = true;
        if (outcome.success) {
          const closeActionResult =
            preOutcomeByAction?.get('CLOSE_RECORD') ||
            outcome.byAction?.get('CLOSE_RECORD') ||
            null;
          const generatedDialogShown = await maybeOpenGeneratedRecordsDialog(closeActionResult);
          if (!generatedDialogShown && args.action.feedbackDialog) {
            const feedbackDialog = args.action.feedbackDialog;
            await openConfiguredConfirmDialog({
              dialog: {
                ...feedbackDialog,
                showCancel: feedbackDialog.showCancel ?? false,
                confirmLabel: feedbackDialog.confirmLabel ?? tSystem('common.ok', languageRef.current, 'OK')
              },
              kind: 'guidedStepMilestone',
              refId: args.stepId
            });
          }
          navigateAfterSuccess(args.action.navigateToAfterSuccess);
        }
        return {
          success: outcome.success,
          advanceToNext: outcome.success && args.action.advanceAfterStart !== false,
          message: outcome.message
        };
      } finally {
        if (!busyUnlocked) {
          guidedMilestoneBusy.unlock(busySeq, {
            stepId: args.stepId,
            launchedBackground: false
          });
        }
      }
    },
    [
      applyFollowupBatchResults,
      definition,
      ensureDraftRecordId,
      flushAutoSaveBeforeNavigate,
      applyLocalRecordStatus,
      guidedUiState,
      guidedMilestoneBusy,
      logEvent,
      openConfiguredConfirmDialog,
      persistCurrentSnapshot,
      refreshAfterFollowupBatch,
      resolveLogMessage,
      runSerializedFollowupBatchRequest,
      statusTransitions,
      resolveUiErrorMessage,
      waitForPendingReservationSync,
      waitForBackgroundSaves
    ]
  );

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
              'This record was updated by another user or automatically by the system. Use Refresh in the header to continue.'
            )
        };
      }

      const sessionAtStart = recordSessionRef.current;
      const queueKey = `record:${sessionAtStart}:${args.fieldPath}`;
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
        const ensuredRecord = await ensureDraftRecordId({ reason: 'upload', fieldPath: args.fieldPath });
        const recordId = `${ensuredRecord.recordId || ''}`.trim();
        if (!ensuredRecord.success || !recordId) {
          return { success: false, message: ensuredRecord.message || 'Failed to create draft record.' };
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
          } catch {
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
          logEvent('upload.files.parallel.start', {
            fieldPath: args.fieldPath,
            fileCount: payloads.length
          });
          const uploadedUrls = await runWithConcurrencyLimit(
            payloads,
            Math.min(3, Math.max(1, payloads.length)),
            async (payload, index) => {
              const uploadRes = await uploadFilesApi([payload], args.uploadConfig);
              if (!uploadRes?.success) {
                const msg = (
                  uploadRes?.message || tSystem('files.error.uploadFailed', languageRef.current, 'Could not add photos.')
                ).toString();
                throw new Error(msg);
              }
              const urls = splitUrlList(uploadRes?.urls || '');
              const firstUrl = (urls[0] || '').toString().trim();
              if (!firstUrl) {
                throw new Error('Upload returned no URLs.');
              }
              logEvent('upload.files.parallel.item.done', {
                fieldPath: args.fieldPath,
                index,
                total: payloads.length
              });
              return firstUrl;
            }
          );
          if (!uploadedUrls.length) {
            const msg = 'Upload returned no URLs.';
            logEvent('upload.files.empty', { fieldPath: args.fieldPath });
            return { success: false, message: msg };
          }
          logEvent('upload.files.parallel.done', {
            fieldPath: args.fieldPath,
            fileCount: uploadedUrls.length
          });

          const allowUiAfterUpload = ensureSession('afterUpload') && allowUiUpdates;
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
          const applyTopLevelMerge = (baseValues: Record<string, FieldValue>) => ({
            ...baseValues,
            [args.questionId as string]: mergedItems as unknown as FieldValue
          });
          const applyLineMerge = (baseLineItems: LineItemState): LineItemState => {
            const rows = baseLineItems[args.groupId!] || [];
            const nextRows = rows.map(r => {
              if (r.id !== args.rowId) return r;
              return { ...r, values: { ...(r.values || {}), [args.fieldId!]: mergedItems } };
            });
            return { ...baseLineItems, [args.groupId!]: nextRows };
          };

          const nextValues =
            args.scope === 'top' && args.questionId ? applyTopLevelMerge(valuesRef.current) : valuesRef.current;

          const nextLineItems =
            args.scope === 'line' && args.groupId && args.rowId && args.fieldId
              ? applyLineMerge(lineItemsRef.current)
              : lineItemsRef.current;

          valuesRef.current = nextValues;
          lineItemsRef.current = nextLineItems;
          uploadedFieldValueOverridesRef.current.set(args.fieldPath, {
            scope: args.scope,
            questionId: args.questionId,
            groupId: args.groupId,
            rowId: args.rowId,
            fieldId: args.fieldId,
            items: mergedItems
          });

          if (allowUiAfterUpload) {
            if (args.scope === 'top' && args.questionId) {
              setValues(prev => {
                const merged = applyTopLevelMerge(prev);
                valuesRef.current = merged;
                return merged;
              });
            }
            if (args.scope === 'line' && args.groupId && args.rowId && args.fieldId) {
              setLineItems(prev => {
                const merged = applyLineMerge(prev);
                lineItemsRef.current = merged;
                return merged;
              });
            }
          }

          ensureSession('afterLocalMerge');
          autoSaveDirtyRef.current = true;
          autoSaveQueuedRef.current = true;
          setDraftSave(prev => (prev.phase === 'saving' ? prev : { phase: 'dirty' }));
          logEvent('upload.urls.localMerged', {
            fieldPath: args.fieldPath,
            recordId,
            urls: mergedItems.filter(it => typeof it === 'string').length
          });
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
          if (
            uploadQueueRef.current.size === 0 &&
            autoSaveQueuedRef.current &&
            autoSaveDirtyRef.current &&
            !submittingRef.current
          ) {
            logEvent('autosave.queued.uploadDrained', {
              debounceMs: autoSaveDebounceMs,
              draftSaveInFlight: draftSaveRequestInFlightRef.current
            });
            void performAutoSaveRef.current('upload.queue.drained');
          }
        } catch {
          // ignore
        }
      });
      return next;
    },
    [
      autoSaveDebounceMs,
      ensureDraftRecordId,
      isClosedRecord,
      language,
      logEvent,
      resolveLogMessage,
      resolveUiErrorMessage,
      syncUploadQueueSize
    ]
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
      rememberAutoSaveSeenState(mappedValues, mappedLineItems);
      dedupBaselineSignatureRef.current = computeDedupSignatureFromValues(dedupPrecheckRules, mappedValues as any);
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
      optimisticClientDataVersionRef.current =
        record && Number.isFinite(Number((record as any).dataVersion)) ? Number((record as any).dataVersion) : null;
      lastRecordServerActivityAtRef.current = record.id ? Date.now() : 0;
      setLastSubmissionMeta({
        id: record.id,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        dataVersion: (record as any).dataVersion,
        status: record.status || null
      });
      setSelectedRecordSnapshot(record);
    } else {
      lastRecordServerActivityAtRef.current = 0;
    }
  }, [dedupPrecheckRules, definition, record, rememberAutoSaveSeenState]);

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
    ignorePending?: boolean,
    snapshots?: { values: Record<string, FieldValue>; lineItems: LineItemState }
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
    const currentValues = snapshots?.values || valuesRef.current;
    const currentLineItems = snapshots?.lineItems || lineItemsRef.current;
    runSelectionEffectsHelper({
      definition,
      question,
      value,
      language,
      values: currentValues,
      lineItems: currentLineItems,
      setValues,
      setLineItems,
      onLineItemsMutated: ({ sourceGroupKey, prevLineItems, nextLineItems, nextValues }) => {
        globalThis.setTimeout(() => {
          runSelectionEffectsForAncestors({
            definition,
            values: nextValues,
            onSelectionEffect: (ancestorQuestion, ancestorValue, ancestorOpts) => {
              runSelectionEffects(
                ancestorQuestion,
                ancestorValue,
                ancestorOpts,
                effectOverrides,
                true,
                { values: nextValues, lineItems: nextLineItems }
              );
            },
            sourceGroupKey,
            prevLineItems,
            nextLineItems,
            options: { mode: 'change', topValues: nextValues }
          });
        }, 0);
      },
      logEvent,
      opts,
      effectOverrides,
      onRowAppended: ({ anchor, targetKey, rowId, source }) => {
        setExternalScrollAnchor(anchor);
        logEvent('ui.selectionEffect.rowAppended', { anchor, targetKey, rowId, source: source || null });
      }
    });
  }

  async function handleSubmit(submitUi?: {
    collapsedRows: Record<string, boolean>;
    collapsedSubgroups: Record<string, boolean>;
    validationDefinition?: WebFormDefinition;
    validationVirtualState?: GuidedStepsVirtualState | null;
  }) {
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
    if (recordSyncPromiseRef.current) {
      await recordSyncPromiseRef.current;
      if (recordStaleRef.current) {
        logEvent('submit.blocked.recordStale.afterSync', { recordId: recordStaleRef.current.recordId });
        return;
      }
    }
    // If we already know the record is stale, block immediately (no validations).
    if (recordStaleRef.current) {
      logEvent('submit.blocked.recordStale', { recordId: recordStaleRef.current.recordId });
      return;
    }
    clearStatus();
    const submitQueuePolicy =
      definition.submissionAfterSubmit?.waitForQueue ||
      'all';
    const waitRes = await waitForBackgroundSaves('submit', submitQueuePolicy);
    if (!waitRes.ok) {
      const msg = (waitRes.message || tSystem('actions.submitFailed', language, 'Submit failed')).toString();
      setStatus(msg);
      setStatusLevel('error');
      logEvent('submit.blocked.backgroundQueue', {
        message: msg,
        phase: 'preValidation',
        waitForQueue: submitQueuePolicy
      });
      return;
    }
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
                markRecordFreshnessServerTouch({ reason: 'record.submitPrecheck', recordId: precheckRecordId });
                const localVersionNow = Number(recordDataVersionRef.current);
                const baselineVersion =
                  Number.isFinite(localVersionNow) && localVersionNow > 0 ? localVersionNow : Number(baseVersion);
                if (Number.isFinite(serverVersion) && serverVersion > 0 && serverVersion !== baselineVersion) {
                  void synchronizeStaleRecord({
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

    const validationDefinition = submitUi?.validationDefinition || definition;
    const validationVirtualState = submitUi?.validationVirtualState || null;

    try {
      setValidationWarnings(
        collectValidationWarnings({
          definition: validationDefinition,
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
      definition: validationDefinition,
      language,
      values,
      lineItems,
      collapsedRows: submitUi?.collapsedRows,
      collapsedSubgroups: submitUi?.collapsedSubgroups,
      virtualState: validationVirtualState
    });
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      submitConfirmedRef.current = false;
      logEvent('submit.validate.failed', {
        errorCount: Object.keys(nextErrors).length,
        firstErrorKeys: Object.keys(nextErrors).slice(0, 5),
        scopedValidation: validationDefinition !== definition
      });
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
        configuredMessage: Boolean(submitConfirmationDialogConfig?.message),
        submitLabelOverridden: Boolean(finalSubmitButtonLabelConfig),
        confirmLabelOverridden: Boolean(submitConfirmationDialogConfig?.confirmLabel),
        cancelLabelOverridden: Boolean(submitConfirmationDialogConfig?.cancelLabel),
        hasConditionalCases: Boolean(definition.submissionAfterSubmit?.confirmationDialogCases?.length)
      });
      return;
    }
    submitConfirmedRef.current = false;
    summarySubmitIntentRef.current = false;
    if (recordSyncPromiseRef.current) {
      await recordSyncPromiseRef.current;
      const syncedStaleInfo = recordStaleRef.current as RecordStaleInfo | null;
      if (syncedStaleInfo) {
        logEvent('submit.blocked.recordStale.beforePipeline', { recordId: syncedStaleInfo.recordId });
        return;
      }
    }
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
    const submitRecordId =
      resolveExistingRecordId({
        selectedRecordId: selectedRecordIdRef.current,
        selectedRecordSnapshot: selectedRecordSnapshotRef.current,
        lastSubmissionMetaId: lastSubmissionMetaRef.current?.id || null
      }) || '';
    if (submitRecordId && pendingFollowupBatchPromisesRef.current.has(submitRecordId)) {
      setStatus(
        tSystem(
          'submit.waitPreviousAction',
          languageRef.current,
          'Please wait while we finish the previous action...'
        )
      );
      setStatusLevel('info');
      const followupWait = await waitForPendingFollowupBatch({
        recordId: submitRecordId,
        reason: 'submit.previousAction'
      });
      if (!followupWait.ok) {
        const message = (followupWait.message || submitPreviousActionRetryMessage()).toString();
        setStatus(message);
        setStatusLevel('error');
        logEvent('submit.blocked.pendingFollowup', {
          recordId: submitRecordId,
          message
        });
        return;
      }
    }
    setStatus(tSystem('actions.submitting', language, 'Submitting…'));
    setStatusLevel('info');
    logEvent('submit.begin', { language, lineItemGroups: Object.keys(lineItems).length, recordId: submitRecordId || null });
    // Ensure submission messages are immediately visible, even if the user is scrolled deep in the form.
    try {
      if (typeof globalThis.scrollTo === 'function') {
        globalThis.scrollTo(0, 0);
        logEvent('submit.scrollTopOnStart');
      }
    } catch {
      // ignore
    }
    try {
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
      const configuredAfterSubmit = definition.submissionAfterSubmit;
      const configuredPreActions = Array.isArray(configuredAfterSubmit?.preActions)
        ? configuredAfterSubmit.preActions.map(entry => (entry || '').toString().trim()).filter(Boolean)
        : [];
      const configuredBackgroundActions = Array.isArray(configuredAfterSubmit?.backgroundActions)
        ? configuredAfterSubmit.backgroundActions.map(entry => (entry || '').toString().trim()).filter(Boolean)
        : [];
      const closeOnlyPreActions =
        configuredPreActions.length === 1 &&
        configuredPreActions[0].toString().trim().toUpperCase() === 'CLOSE_RECORD';
      const submitBaseVersion = recordDataVersionRef.current;
      const closeStatusForPrimarySubmit = closeOnlyPreActions
        ? (resolveStatusTransitionValue((definition as any)?.followup?.statusTransitions, 'onClose', languageRef.current, {
            includeDefaultOnClose: true
          }) || 'Closed')
        : '';
      const submitRpcStartMark = `ck.submit.rpc.start.${Date.now()}`;
      const submitRpcEndMark = `ck.submit.rpc.end.${Date.now()}`;
      perfMark(submitRpcStartMark);
      const submitResult = await persistCurrentSnapshot({
        reason: 'submit',
        mode: 'submit',
        existingRecordId,
        statusOverride: closeStatusForPrimarySubmit || undefined,
        collapsedRows: submitUi?.collapsedRows,
        collapsedSubgroups: submitUi?.collapsedSubgroups
      });
      perfMark(submitRpcEndMark);
      perfMeasure('ck.submit.rpc', submitRpcStartMark, submitRpcEndMark, {
        formKey,
        recordId: existingRecordId || null
      });
      const res = submitResult.response;
      if (!res) {
        logEvent('submit.emptyResponse', { formKey, existingRecordId: existingRecordId || null });
      }
      const ok = Boolean(submitResult.success && res?.success);
      const message = (submitResult.message || res?.message || (ok ? 'Submitted' : 'Submit failed')).toString();
      if (!ok) {
        const isStale = isSubmissionStaleMessage(message);
        if (isStale) {
          const serverVersionRaw = Number((res as any)?.meta?.dataVersion);
          await synchronizeStaleRecord({
            reason: 'submit.rejected.stale',
            recordId: existingRecordId || selectedRecordId || '',
            cachedVersion: Number.isFinite(Number(submitBaseVersion)) ? Number(submitBaseVersion) : null,
            serverVersion: Number.isFinite(serverVersionRaw) ? serverVersionRaw : null,
            serverRow: null
          });
          logEvent('submit.error.staleRecovered', { message, meta: (res as any)?.meta || null });
          return;
        }
        const retryMessage = isRetryableRecordBusyMessage(message) ? submitPreviousActionRetryMessage() : message;
        setStatus(retryMessage);
        setStatusLevel('error');
        logEvent('submit.error', { message, shownMessage: retryMessage, meta: (res as any)?.meta || null });
        return;
      }
      setStatus(message);
      setStatusLevel('success');
      logEvent('submit.success', { recordId: (res as any)?.meta?.id });

      const recordId = ((submitResult.recordId || (res as any)?.meta?.id || existingRecordId || selectedRecordId || '') as string).toString();
      dedupBaselineSignatureRef.current = (submitDedupSignature || '').toString();
      dedupKeyFingerprintBaselineRef.current = submitDedupFingerprint;

      const runFollowupBatchForSubmit = async (args: { actions: string[]; reason: string; refresh: boolean }) => {
        const followupRpcStartMark = `ck.submit.followup.rpc.start.${Date.now()}`;
        const followupRpcEndMark = `ck.submit.followup.rpc.end.${Date.now()}`;
        perfMark(followupRpcStartMark);
        const batch = await runSerializedFollowupBatchRequest({
          recordId,
          actions: args.actions,
          reason: args.reason
        });
        perfMark(followupRpcEndMark);
        perfMeasure('ck.submit.followup.rpc', followupRpcStartMark, followupRpcEndMark, {
          formKey,
          recordId,
          actionsCount: args.actions.length
        });
        const outcome = applyFollowupBatchResults({
          recordId,
          actions: args.actions,
          batch,
          reason: args.reason
        });
        if (args.refresh) {
          await refreshAfterFollowupBatch({ recordId, reason: args.reason });
        }
        return outcome;
      };
      const maybeOpenSubmitGeneratedRecordsDialog = async (closeResult: any): Promise<boolean> => {
        const dialogConfig = configuredAfterSubmit?.generatedRecordsDialog;
        if (!dialogConfig) return false;
        const generatedRecords = filterGeneratedRecordsForDialog({
          config: dialogConfig,
          records: getGeneratedRecordsFromFollowupResult(closeResult)
        });
        if (!generatedRecords.length) {
          logEvent('submit.afterSubmit.generatedRecords.skip', {
            recordId,
            targetFormKey: dialogConfig.targetFormKey || null,
            submitEffectIds: Array.isArray(dialogConfig.submitEffectIds) ? dialogConfig.submitEffectIds : []
          });
          return false;
        }
        const itemTemplate =
          resolveLocalizedString(dialogConfig.itemTemplate, languageRef.current, '{{recordId}}') || '{{recordId}}';
        const intro = resolveLocalizedString(dialogConfig.message, languageRef.current, '');
        const lines = generatedRecords.map(entry => renderGeneratedRecordLine(entry, itemTemplate)).filter(Boolean);
        const message = [intro, ...lines].filter(Boolean).join('\n');
        logEvent('submit.afterSubmit.generatedRecords.open', {
          recordId,
          count: generatedRecords.length,
          targetFormKey: dialogConfig.targetFormKey || null
        });
        // The generated-records dialog is a post-submit success dialog.
        // Release the blocking submit overlay before awaiting user acknowledgement,
        // otherwise the dialog renders underneath the still-active spinner.
        setSubmitting(false);
        await openConfiguredConfirmDialog({
          dialog: {
            title: resolveLocalizedString(
              dialogConfig.title,
              languageRef.current,
              tSystem('common.notice', languageRef.current, 'Notice')
            ),
            message,
            confirmLabel: resolveLocalizedString(
              dialogConfig.confirmLabel,
              languageRef.current,
              tSystem('common.ok', languageRef.current, 'OK')
            ),
            showCancel: false,
            showCloseButton: false,
            dismissOnBackdrop: false
          },
          kind: 'submitAfterSubmit.generatedRecords',
          refId: recordId
        });
        return true;
      };

      const followupCfg = (definition as any)?.followup || null;
      const fallbackActions: string[] = [];
      if (followupCfg?.pdfTemplateId) fallbackActions.push('CREATE_PDF');
      if (followupCfg?.emailTemplateId && followupCfg?.emailRecipients) fallbackActions.push('SEND_EMAIL');
      fallbackActions.push('CLOSE_RECORD');

      let followupErrors: string[] = [];
      let closeResultByAction = new Map<string, any>();
      let handledSubmitNavigation = false;

      if (recordId) {
        if (configuredAfterSubmit && (configuredPreActions.length || configuredBackgroundActions.length)) {
          handledSubmitNavigation = true;
          if (closeOnlyPreActions) {
            closeResultByAction = new Map<string, any>([
              [
                'CLOSE_RECORD',
                {
                  success: true,
                  status: ((res as any)?.meta || {})?.status || closeStatusForPrimarySubmit || null,
                  reservationReconciliation: ((res as any)?.meta || {})?.reservationReconciliation || null,
                  submitEffects: ((res as any)?.meta || {})?.submitEffects || null
                }
              ]
            ]);
            const submitEffectsCreated = Number((res as any)?.meta?.submitEffects?.created || 0) || 0;
            const submitEffectsUpdated = Number((res as any)?.meta?.submitEffects?.updated || 0) || 0;
            invalidateClientSharedDataCaches({ includePersistedDataSources: true });
            logEvent('sharedData.cache.invalidated', {
              reason: 'submit.afterSubmit.pre.primaryClose',
              recordId,
              submitEffectsCreated,
              submitEffectsUpdated
            });
            if (submitEffectsCreated > 0 || submitEffectsUpdated > 0) {
              refreshGuidedDataSourcesInBackground({
                reason: 'submit.afterSubmit.pre.primaryClose.submitEffects',
                forceRefresh: true,
                retryDelaysMs: [0, 1200, 3500]
              });
            }
          }
          if (configuredPreActions.length) {
            try {
              setStatus('Finalizing submission…');
              setStatusLevel('info');
              logEvent('submit.afterSubmit.pre.begin', { recordId, actions: configuredPreActions });
              if (!closeOnlyPreActions) {
                const outcome = await runFollowupBatchForSubmit({
                  actions: configuredPreActions,
                  reason: 'submit.afterSubmit.pre',
                  refresh: true
                });
                followupErrors = outcome.followupErrors;
                closeResultByAction = outcome.byAction;
              }
              logEvent('submit.afterSubmit.pre.done', {
                recordId,
                actionsCount: configuredPreActions.length,
                errorCount: followupErrors.length
              });
            } catch (err: any) {
              const uiMessage = resolveUiErrorMessage(err, 'Failed');
              const logMessage = resolveLogMessage(err, 'Failed');
              followupErrors = [uiMessage || 'Failed'];
              logEvent('submit.afterSubmit.pre.exception', { recordId, message: logMessage });
            }
          }

          if (followupErrors.length) {
            setStatus(`Submitted, but follow-up had issues: ${followupErrors.join(' · ')}`);
            setStatusLevel('error');
            return;
          }

          const reconciliation = closeResultByAction.get('CLOSE_RECORD')?.reservationReconciliation || null;
          const consumedReservations = Number(reconciliation?.consumedReservations || 0) || 0;
          const releasedReservations = Number(reconciliation?.releasedReservations || 0) || 0;
          const baseMessage = tSystem('actions.submittedClosed', language, 'Submitted and closed.');
          const feedbackConfig =
            typeof definition?.reservationLifecycle?.reconcileOnFinalSubmit === 'object'
              ? definition.reservationLifecycle.reconcileOnFinalSubmit.feedback
              : undefined;
          const statusMessage = buildReservationReconciliationFeedback({
            language,
            feedback: feedbackConfig,
            baseMessage,
            consumedReservations,
            releasedReservations,
            fallbackConsumedSummarySingular: tSystem(
              'inventory.reservationConsumedSingular',
              language,
              '{count} reservation consumed'
            ),
            fallbackConsumedSummaryPlural: tSystem(
              'inventory.reservationConsumedPlural',
              language,
              '{count} reservations consumed'
            ),
            fallbackReleasedSummarySingular: tSystem(
              'inventory.reservationReleasedSingular',
              language,
              '{count} reservation released'
            ),
            fallbackReleasedSummaryPlural: tSystem(
              'inventory.reservationReleasedPlural',
              language,
              '{count} reservations released'
            )
          });
          setStatus(statusMessage);
          setStatusLevel('success');

          const closeActionResult = closeResultByAction.get('CLOSE_RECORD') || null;
          const generatedDialogShown = await maybeOpenSubmitGeneratedRecordsDialog(closeActionResult);
          const navigateTarget = (() => {
            const raw = (configuredAfterSubmit.navigateTo || 'auto').toString().trim().toLowerCase();
            if (raw === 'form' || raw === 'summary' || raw === 'list') return raw as 'form' | 'summary' | 'list';
            return summaryViewEnabled ? 'summary' : 'form';
          })();
          setView(navigateTarget);

          if (configuredBackgroundActions.length) {
            logEvent('submit.afterSubmit.background.begin', {
              recordId,
              actions: configuredBackgroundActions,
              navigateTarget
            });
            void (async () => {
              try {
                const outcome = await runFollowupBatchForSubmit({
                  actions: configuredBackgroundActions,
                  reason: 'submit.afterSubmit.background',
                  refresh: false
                });
                if (outcome.followupErrors.length) {
                  setStatus(`Submitted, but follow-up had issues: ${outcome.followupErrors.join(' · ')}`);
                  setStatusLevel('error');
                }
                logEvent('submit.afterSubmit.background.done', {
                  recordId,
                  actionsCount: configuredBackgroundActions.length,
                  errorCount: outcome.followupErrors.length
                });
              } catch (err: any) {
                const uiMessage = resolveUiErrorMessage(err, 'Failed');
                const logMessage = resolveLogMessage(err, 'Failed');
                setStatus(`Submitted, but follow-up had issues: ${uiMessage || 'Failed'}`);
                setStatusLevel('error');
                logEvent('submit.afterSubmit.background.exception', { recordId, message: logMessage });
              }
            })();

            if (!generatedDialogShown && configuredAfterSubmit.feedbackDialog) {
              void openConfiguredConfirmDialog({
                dialog: {
                  ...configuredAfterSubmit.feedbackDialog,
                  showCancel: configuredAfterSubmit.feedbackDialog.showCancel ?? false,
                  confirmLabel: configuredAfterSubmit.feedbackDialog.confirmLabel ?? tSystem('common.ok', languageRef.current, 'OK')
                },
                kind: 'submitAfterSubmit',
                refId: recordId
              });
            }
          }
        } else {
          try {
            setStatus('Running follow-up…');
            setStatusLevel('info');
            logEvent('followup.auto.batch.begin', { recordId, actions: fallbackActions });
            const outcome = await runFollowupBatchForSubmit({
              actions: fallbackActions,
              reason: 'submit.legacyAutoFollowup',
              refresh: true
            });
            followupErrors = outcome.followupErrors;
            closeResultByAction = outcome.byAction;
            logEvent('followup.auto.batch.done', {
              recordId,
              actionsCount: fallbackActions.length,
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
            const reconciliation = closeResultByAction.get('CLOSE_RECORD')?.reservationReconciliation || null;
            const consumedReservations = Number(reconciliation?.consumedReservations || 0) || 0;
            const releasedReservations = Number(reconciliation?.releasedReservations || 0) || 0;
            const baseMessage = tSystem('actions.submittedClosed', language, 'Submitted and closed.');
            const feedbackConfig =
              typeof definition?.reservationLifecycle?.reconcileOnFinalSubmit === 'object'
                ? definition.reservationLifecycle.reconcileOnFinalSubmit.feedback
                : undefined;
            const statusMessage = buildReservationReconciliationFeedback({
              language,
              feedback: feedbackConfig,
              baseMessage,
              consumedReservations,
              releasedReservations,
              fallbackConsumedSummarySingular: tSystem(
                'inventory.reservationConsumedSingular',
                language,
                '{count} reservation consumed'
              ),
              fallbackConsumedSummaryPlural: tSystem(
                'inventory.reservationConsumedPlural',
                language,
                '{count} reservations consumed'
              ),
              fallbackReleasedSummarySingular: tSystem(
                'inventory.reservationReleasedSingular',
                language,
                '{count} reservation released'
              ),
              fallbackReleasedSummaryPlural: tSystem(
                'inventory.reservationReleasedPlural',
                language,
                '{count} reservations released'
              )
            });
            setStatus(statusMessage);
            setStatusLevel('success');
          }
        }
      }

      if (!handledSubmitNavigation) {
        const submitEffectsCreated = Number((res as any)?.meta?.submitEffects?.created || 0) || 0;
        const submitEffectsUpdated = Number((res as any)?.meta?.submitEffects?.updated || 0) || 0;
        invalidateClientSharedDataCaches({ includePersistedDataSources: true });
        logEvent('sharedData.cache.invalidated', {
          reason: 'submit.success',
          recordId: recordId || null,
          submitEffectsCreated,
          submitEffectsUpdated
        });
        if (submitEffectsCreated > 0 || submitEffectsUpdated > 0) {
          refreshGuidedDataSourcesInBackground({
            reason: 'submit.success.submitEffects',
            forceRefresh: true,
            retryDelaysMs: [0, 1200, 3500]
          });
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
      }
    } catch (err: any) {
      const uiMessage = resolveUiErrorMessage(err, 'Submit failed');
      const logMessage = resolveLogMessage(err, 'Submit failed');
      const shownMessage =
        isRetryableRecordBusyMessage(uiMessage || logMessage) ? submitPreviousActionRetryMessage() : uiMessage;
      if (uiMessage) {
        setStatus(shownMessage || uiMessage);
        setStatusLevel('error');
      } else {
        setStatusLevel(null);
      }
      logEvent('submit.exception', { message: logMessage, shownMessage: shownMessage || null });
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

  handleSubmitRef.current = handleSubmit;

  const handleSummarySubmit = useCallback(() => {
    if (submitting) return;
    if (recordLoadingId) return;
    if (updateRecordBusyOpen) return;
    submitConfirmedRef.current = false;
    summarySubmitIntentRef.current = true;
    logEvent('ui.submit.tap', {
      submitLabelOverridden: Boolean(finalSubmitButtonLabelConfig),
      view: 'summary'
    });
    logEvent('summary.submit.fire', { sourceView: viewRef.current });
    void handleSubmitRef.current();
  }, [finalSubmitButtonLabelConfig, logEvent, recordLoadingId, submitting, updateRecordBusyOpen]);

  const handleRecordSelectRef = useRef<
    ((row: ListItem, fullRecord?: WebFormSubmission, opts?: { openView?: 'auto' | 'form' | 'summary' | 'button' | 'copy' | 'submit'; openButtonId?: string }) => void) | null
  >(null);

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
    setPrefetchedSummaryHtml(null);
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
    const statusRaw = ((sourceRecord?.status || row.status || '') as any)?.toString?.() || '';
    const resolvedOpenView =
      requested === 'form'
        ? 'form'
        : requested === 'summary'
          ? summaryViewEnabled
            ? 'summary'
            : 'form'
          : resolveStatusAutoView(statusRaw, summaryViewEnabled).view;
    const shouldUseCombinedSummaryFetch =
      !sourceRecord &&
      !shouldTriggerButton &&
      !shouldCopy &&
      !shouldSubmit &&
      resolvedOpenView === 'summary' &&
      Boolean(definition.summaryHtmlTemplateId);

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

    const openCopyBusy = () =>
      copyRecordBusy.lock({
        title: tSystem('navigation.waitTitle', language, 'Please wait'),
        message: tSystem('navigation.waitCopyRecord', language, 'Please wait while we prepare your copied record...'),
        diagnosticMeta: { recordId: row.id }
      });

    const fetchFullSnapshotThenCopy = (source: string, busySeq: number | null) => {
      setRecordLoadingId(row.id || (hintedRow ? `row:${hintedRow}` : null));
      setRecordLoadError(null);
      const startedAt = Date.now();
      void (async () => {
        try {
          const ok = await loadRecordSnapshot(row.id, hintedRow);
          if (!ok) return;
          if (selectedRecordIdRef.current !== row.id) return;
          logEvent('list.openView.copy', { recordId: row.id, source });
          handleDuplicateCurrent();
        } finally {
          if (busySeq !== null) {
            copyRecordBusy.unlock(busySeq, {
              recordId: row.id,
              source,
              durationMs: Date.now() - startedAt
            });
          }
        }
      })();
    };

    // Fast path: show cached record immediately when available.
    // Re-check the server version in the background when we have a cached version; refetch if stale.
    if (sourceRecord) {
      if (shouldCopy) {
        fetchFullSnapshotThenCopy('copy.fetchedFromListCache', openCopyBusy());
        return;
      }
      applyRecordSnapshot(sourceRecord);
      // If the list requested a button action, don't wait on version checks; render immediately from the cached snapshot.
      // (If the cached snapshot is stale, the user can always refresh; we avoid blocking the UX on a second roundtrip.)
      if (shouldTriggerButton) {
        triggerOpenButtonIfNeeded();
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
              markRecordFreshnessServerTouch({ reason: 'record.versionCheck', recordId });
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
              if (Number.isFinite(serverVersion) && serverVersion > 0 && serverVersion !== baselineVersion) {
                const syncBlockers = getRecordFreshnessSyncBlockers();
                const shouldDeferSync = syncBlockers.length > 0;
                if (shouldDeferSync) {
                  pendingDeferredRecordFreshnessSyncRef.current = {
                    reason: 'versionCheck.stale',
                    recordId,
                    cachedVersion: baselineVersion,
                    serverVersion,
                    serverRow: serverRow || hintedRow || null
                  };
                  logEvent('record.versionCheck.stale.deferred', {
                    recordId,
                    cachedVersion: baselineVersion,
                    serverVersion,
                    serverRow: serverRow || hintedRow || null,
                    draftSavePhase: draftSave.phase,
                    autoSaveQueued: autoSaveQueuedRef.current,
                    blockers: syncBlockers
                  });
                  scheduleRecordFreshnessCheck('record.versionCheck.staleDeferred');
                  return;
                }
                pendingDeferredRecordFreshnessSyncRef.current = null;
                void synchronizeStaleRecordRef.current({
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
      if (shouldUseCombinedSummaryFetch) {
        setRecordLoadingId(row.id || (hintedRow ? `row:${hintedRow}` : null));
        setRecordLoadError(null);
      }
      let copyBusyDelegated = false;
      const copyBusySeq = shouldCopy ? openCopyBusy() : null;
      const hydrateFromInFlightPrefetch = async (): Promise<boolean> => {
        if (shouldUseCombinedSummaryFetch) return false;
        if (!hintedRow || hintedRow < 2) return false;
        const pending = listRecordSnapshotPrefetchByRowRef.current.get(hintedRow);
        if (!pending) return false;
        const awaited = await Promise.race([
          pending.then(res => res || null).catch(() => null),
          new Promise<null>(resolve => {
            globalThis.setTimeout(() => resolve(null), 2200);
          })
        ]);
        if (!awaited) return false;
        if (selectedRecordIdRef.current !== row.id) return true;
        const prefetchedRecord = awaited[row.id];
        if (!prefetchedRecord) return false;
        applyRecordSnapshot(prefetchedRecord);
        if (shouldCopy) {
          copyBusyDelegated = true;
          fetchFullSnapshotThenCopy('copy.fetchedAfterPrefetch', copyBusySeq);
          return true;
        }
        if (shouldSubmit) {
          logEvent('list.openView.submit', { recordId: row.id, source: 'prefetched' });
          setView('form');
          scheduleListOpenSubmit({ recordId: row.id, source: 'prefetched' });
          return true;
        }
        triggerOpenButtonIfNeeded();
        return true;
      };

      void (async () => {
        const startedAt = Date.now();
        if (shouldUseCombinedSummaryFetch) {
          const startedAt = Date.now();
          logEvent('summary.fetchCombined.start', { recordId: row.id, rowNumberHint: hintedRow || null });
          try {
            const res = await fetchSummaryRecordApi(formKey, language, row.id, hintedRow || null);
            if (selectedRecordIdRef.current !== row.id) return;
            const snapshot = res?.record || null;
            if (!snapshot) throw new Error((res?.message || 'Record not found.').toString());
            applyRecordSnapshot(snapshot);
            if (res?.success && res?.html) {
              const draft = buildDraftPayload({
                definition,
                formKey,
                language,
                values: valuesRef.current,
                lineItems: lineItemsRef.current,
                existingRecordId: snapshot.id
              });
              (draft as any).status = snapshot.status || null;
              (draft as any).createdAt = snapshot.createdAt || undefined;
              (draft as any).updatedAt = snapshot.updatedAt || undefined;
              (draft as any).pdfUrl = (snapshot as any).pdfUrl || undefined;
              seedSummaryHtmlTemplateCache(draft, {
                success: true,
                html: res.html,
                fileName: res.fileName
              });
              setPrefetchedSummaryHtml({ recordId: snapshot.id || row.id, html: res.html });
              logEvent('summary.fetchCombined.ok', {
                recordId: snapshot.id || row.id,
                durationMs: Date.now() - startedAt,
                htmlLength: (res.html || '').toString().length
              });
            } else {
              logEvent('summary.fetchCombined.degraded', {
                recordId: snapshot.id || row.id,
                durationMs: Date.now() - startedAt,
                message: res?.message || 'summaryRenderFailed'
              });
            }
            return;
          } catch (err: any) {
            if (selectedRecordIdRef.current !== row.id) return;
            const uiMessage = resolveUiErrorMessage(err, 'Failed to load summary.');
            const logMessage = resolveLogMessage(err, 'Failed to load summary.');
            setRecordLoadError(uiMessage);
            setRecordLoadingId(null);
            logEvent('summary.fetchCombined.error', {
              recordId: row.id,
              rowNumberHint: hintedRow || null,
              durationMs: Date.now() - startedAt,
              message: logMessage
            });
            return;
          }
        }

        try {
          const resolvedFromPrefetch = await hydrateFromInFlightPrefetch();
          if (resolvedFromPrefetch) return;
          const ok = await loadRecordSnapshot(row.id, hintedRow);
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
        } finally {
          if (copyBusySeq !== null && !copyBusyDelegated) {
            copyRecordBusy.unlock(copyBusySeq, {
              recordId: row.id,
              source: 'copy.fetched',
              durationMs: Date.now() - startedAt
            });
          }
        }
      })();
    }
    // When Summary view is disabled, always open the Form view (closed records are read-only).
    if (shouldTriggerButton) {
      // Stay on the list view; the button action will open a preview overlay when the record snapshot is ready.
      return;
    }
    if (shouldCopy || shouldSubmit) {
      // Navigation is handled by the copy/submit flows above.
      return;
    }

    if (requested === 'auto') {
      const resolved = resolveStatusAutoView(statusRaw, summaryViewEnabled);
      logEvent('list.openView.autoByStatus', {
        recordId: row.id,
        source: sourceRecord ? 'cached' : 'fetched',
        status: statusRaw || null,
        statusKey: resolved.statusKey,
        nextView: resolvedOpenView
      });
    }
    setView(resolvedOpenView);
  };

  handleRecordSelectRef.current = handleRecordSelect;

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
      handleRecordSelectRef.current?.(row, listCache.records[id], { openView });
      return true;
    },
    [listCache.records, listCache.response?.items, logEvent, perfEnabled]
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
    const envLower = (envTag || '').toString().trim().toLowerCase();
    const enabled = debugEnabled || envLower === 'stage-2' || envLower === 'staging';
    if (!enabled) return;
    const globalAny = globalThis as any;
    const hook = () => ({
      values: valuesRef.current,
      lineItems: lineItemsRef.current,
      selectedRecordId,
      view
    });
    globalAny.__CK_DEBUG_FORM_STATE__ = hook;
    return () => {
      try {
        if (globalAny.__CK_DEBUG_FORM_STATE__ === hook) {
          delete globalAny.__CK_DEBUG_FORM_STATE__;
        }
      } catch (_) {
        // ignore cleanup failures
      }
    };
  }, [debugEnabled, envTag, selectedRecordId, view]);

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

  const currentRecord = selectedRecordSnapshot || (selectedRecordId && !recordLoadingId ? listCache.records[selectedRecordId] : null);
  const showFormRecordLoadingPlaceholder = shouldShowRecordLoadingPlaceholder({
    recordLoading: Boolean(recordLoadingId),
    hasCurrentRecord: Boolean(currentRecord)
  });
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
  const headerServiceUrl = useMemo(() => resolveServiceUrl(), []);
  const headerAdminEnabled = useMemo(() => resolveAdminEnabled(), []);
  const hasAnalyticsPageWidgets = useMemo(() => {
    const widgets = Array.isArray(definition.analytics?.widgets) ? definition.analytics.widgets : [];
    return widgets.some(widget => {
      const placements = Array.isArray(widget?.placements) ? widget.placements : ['analyticsPage'];
      return placements.some(token => (token || '').toString().trim() === 'analyticsPage');
    });
  }, [definition.analytics?.widgets]);
  const openAnalyticsOverlay = useCallback(() => {
    setAnalyticsOverlayOpen(true);
    setAnalyticsOverlayError(null);
    setAnalyticsOverlayLoading(true);
    const requestId = analyticsOverlayRequestRef.current + 1;
    analyticsOverlayRequestRef.current = requestId;
    logEvent('ui.header.drawer.analytics.open', { formKey, requestId });
    fetchBootstrapContextApi(formKey, { includeAnalytics: true })
      .then(res => {
        if (analyticsOverlayRequestRef.current !== requestId) return;
        const snapshot = ((res as any)?.analytics || null) as any;
        setAnalyticsSnapshot(snapshot);
        const nextRev = Number((res as any)?.analyticsRev ?? snapshot?.revision ?? 0);
        setAnalyticsSnapshotRev(Number.isFinite(nextRev) && nextRev >= 0 ? nextRev : 0);
        logEvent('ui.header.drawer.analytics.ready', {
          formKey,
          itemCount: Array.isArray(snapshot?.items) ? snapshot.items.length : 0,
          requestId
        });
      })
      .catch((err: any) => {
        if (analyticsOverlayRequestRef.current !== requestId) return;
        const message = resolveUserFacingErrorMessage(err, 'Failed to load analytics.');
        setAnalyticsOverlayError(message);
        logEvent('ui.header.drawer.analytics.error', { formKey, message, requestId });
      })
      .finally(() => {
        if (analyticsOverlayRequestRef.current !== requestId) return;
        setAnalyticsOverlayLoading(false);
      });
  }, [formKey, logEvent]);
  const closeAnalyticsOverlay = useCallback(() => {
    setAnalyticsOverlayOpen(false);
    setAnalyticsOverlayLoading(false);
    setAnalyticsOverlayError(null);
    logEvent('ui.header.drawer.analytics.close', { formKey });
  }, [formKey, logEvent]);
  const drawerActions = useMemo(() => {
    const actions: Array<{ id: string; label: string; onClick: () => void; placement?: 'main' | 'secondary' | 'footer' }> = [];
    if (hasAnalyticsPageWidgets) {
      actions.push({
        id: 'analytics',
        label: tSystem('app.analytics', language, 'Analytics'),
        placement: 'secondary',
        onClick: () => {
          openAnalyticsOverlay();
        }
      });
    }
    actions.push({
      id: 'landing',
      label: tSystem('app.forms', language, 'Forms'),
      placement: 'footer',
      onClick: () => {
        const targetUrl = buildLandingUrl(headerServiceUrl, headerAdminEnabled);
        logEvent('ui.header.drawer.landing.navigate', { targetUrl });
        const seq = navigateHomeBusy.lock({
          title: tSystem('navigation.waitTitle', language, 'Please wait'),
          message: tSystem('navigation.waitForms', language, 'Please wait while we open the forms page...')
        });
        globalThis.requestAnimationFrame?.(() => {
          globalThis.requestAnimationFrame?.(() => {
            navigateToTopLevel(targetUrl);
            globalThis.setTimeout?.(() => {
              navigateHomeBusy.unlock(seq, { targetUrl });
            }, 1500);
          });
        });
      }
    });
    return actions;
  }, [hasAnalyticsPageWidgets, headerAdminEnabled, headerServiceUrl, language, navigateHomeBusy, openAnalyticsOverlay, logEvent]);

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
        const keys = Object.keys(dedupIdentityFieldIdMap || {});
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
    [dedupIdentityFieldIdMap, definition, language, optionState]
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
      const showKeyValues = !(ingredientsFormActive && createFlowRef.current);
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {intro ? <div>{intro}</div> : null}
          {showKeyValues && items.length ? (
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
    [dedupDialogCopy.intro, dedupDialogCopy.outro, ingredientsFormActive]
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
      hideDedupProgressDialog();
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
    [hideDedupProgressDialog, logEvent]
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
          Object.keys(dedupIdentityFieldIdMap || {}).forEach(key => {
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
    dedupIdentityFieldIdMap,
    definition,
    logEvent,
    resetDedupState,
    setErrors,
    setLineItems,
    setValues,
    setView
  ]);

  const handleDedupCancelCreationToHome = useCallback(() => {
    const conflict = dedupDialogConflict as any;
    resetDedupState('dedup.dialog.cancelCreation');
    createFlowRef.current = false;
    createFlowUserEditedRef.current = false;
    autoSaveUserEditedRef.current = false;
    dedupHoldRef.current = false;
    setView('list');
    setStatus(null);
    setStatusLevel(null);
    logEvent('dedup.dialog.cancelCreation.home', {
      ruleId: conflict?.ruleId || null,
      existingRecordId: conflict?.existingRecordId || null
    });
  }, [dedupDialogConflict, logEvent, resetDedupState]);

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

  const ingredientCreateDedupDialogMode = ingredientsFormActive && createFlowRef.current;
  const dedupDialogConfirmLabel = ingredientCreateDedupDialogMode ? dedupDialogCopy.cancelLabel : dedupDialogCopy.openLabel;
  const dedupDialogCancelLabel = dedupDialogCopy.changeLabel;
  const handleDedupDialogConfirm = ingredientCreateDedupDialogMode ? handleDedupCancelCreationToHome : handleDedupOpenExisting;
  const handleDedupDialogCancel = handleDedupChangeFields;

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

  const showInlineDedupCheckingNotice = precreateDedupChecking || (dedupChecking && !(view === 'form' && dedupCheckDialogEnabled));
  const dedupCheckingNotice =
    showInlineDedupCheckingNotice ? (
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

  const submitTopErrorMessage = resolveLocalizedString(
    definition.submitValidation?.submitTopErrorMessage,
    language,
    ''
  )
    .toString()
    .trim();
  const hideSubmitTopErrorMessage = definition.submitValidation?.hideSubmitTopErrorMessage === true;
  useEffect(() => {
    if (!hideSubmitTopErrorMessage) return;
    logEvent('validation.submitTopError.hidden', { enabled: true });
  }, [hideSubmitTopErrorMessage, logEvent]);
  const validationTopNotice =
    view === 'form' &&
    validationAttempted &&
    !validationNoticeHidden &&
    (Object.keys(errors || {}).length > 0 || (validationWarnings.top || []).length > 0) ? (
      <ValidationHeaderNotice
        language={language}
        errors={errors}
        warnings={validationWarnings.top}
        hideErrorBanner={hideSubmitTopErrorMessage}
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
    const configuredLegend =
      (Array.isArray(definition.listView?.legend) && definition.listView?.legend.length
        ? definition.listView?.legend
        : ((definition as any)?.listViewLegend as any[] | undefined)) || [];
    return buildListViewLegendItems(cols as any, configuredLegend as any, language);
  }, [definition, language]);
  const listLegendColumns = useMemo(() => {
    const raw = Number((definition.listView as any)?.legendColumns ?? (definition as any)?.listViewLegendColumns);
    if (!Number.isFinite(raw) || raw <= 1) return 1;
    return Math.max(1, Math.min(2, Math.round(raw)));
  }, [definition]);
  const listLegendColumnWidths = useMemo(() => {
    const raw = (definition.listView as any)?.legendColumnWidths ?? (definition as any)?.listViewLegendColumnWidths;
    if (!Array.isArray(raw) || raw.length < 2) return null;
    const first = Number(raw[0]);
    const second = Number(raw[1]);
    if (!Number.isFinite(first) || !Number.isFinite(second) || first <= 0 || second <= 0) return null;
    const total = first + second;
    if (!(total > 0)) return null;
    const normalizedFirst = Number(((first / total) * 100).toFixed(2));
    const normalizedSecond = Number((100 - normalizedFirst).toFixed(2));
    return [normalizedFirst, normalizedSecond] as [number, number];
  }, [definition]);

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
          <ListViewLegend
            items={listLegendItems}
            language={language}
            columns={listLegendColumns}
            columnWidths={listLegendColumnWidths}
            className="ck-list-legend--bottomBar"
          />
        ) : null}
      </div>
    ) : null;

  const guidedSubmitLabel =
    view === 'form' && guidedUiState && !guidedUiState.isFinal
      ? guidedUiState.stepSubmitLabel || finalSubmitButtonLabelConfig || tSystem('steps.next', language, 'Next')
      : finalSubmitButtonLabelConfig;
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
  }, [definition, guidedUiState, lastSubmissionMeta?.createdAt, lastSubmissionMeta?.id, lastSubmissionMeta?.status, lastSubmissionMeta?.updatedAt, lineItems, selectedRecordId, selectedRecordSnapshot, systemActionGates, values, view]);

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
        drawerActions={drawerActions}
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
        disabled={
          submitting || updateRecordBusyOpen || recordSyncBusyOpen || Boolean(recordLoadingId) || Boolean(recordStale) || precreateDedupChecking
        }
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

      {view === 'form' && showFormRecordLoadingPlaceholder ? (
        <div className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {recordLoadError ? <div className="error">{recordLoadError}</div> : null}
          <div className="status">{tSystem('summary.loadingRecord', language, 'Loading record…')}</div>
        </div>
      ) : null}

      {view === 'form' && !showFormRecordLoadingPlaceholder ? (
        <FormView
          formKey={formKey}
          definition={definition}
          dedupKeyFieldIdMap={dedupTriggerFieldIdMap}
          language={language}
          values={values}
          setValues={setValues}
          lineItems={lineItems}
          setLineItems={setLineItems}
          onSubmit={handleSubmit}
          submitActionRef={formSubmitActionRef}
          guidedBackActionRef={formBackActionRef}
          navigateToFieldRef={formNavigateToFieldRef}
          submitting={
            submitting ||
            updateRecordBusyOpen ||
            recordSyncBusyOpen ||
            guidedMilestoneBusy.state.open ||
            isClosedRecord ||
            Boolean(recordLoadingId) ||
            Boolean(recordStale)
          }
          errors={errors}
          setErrors={setErrors}
          status={status}
          statusTone={statusLevel}
          recordMeta={formRecordMeta}
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
          onReportButtonPointerDown={handleReportButtonPointerDown}
          reportBusy={reportOverlay.pdfPhase === 'rendering'}
          reportBusyId={reportOverlay.buttonId || null}
          onUserEdit={handleUserEdit}
          onAutomatedMutation={handleAutomatedMutation}
          onDiagnostic={logEvent}
          onFormValidityChange={setFormIsValid}
          onGuidedUiChange={setGuidedUiState}
          onGuidedStepMilestone={handleGuidedStepMilestone}
          requestedGuidedStepId={requestedGuidedStepId}
          guidedExternalSyncToken={guidedExternalSyncToken}
          onRequestedGuidedStepHandled={() => setRequestedGuidedStepId(null)}
          dedupNavigationBlocked={dedupNavigationBlocked}
          guidedForwardNavigationBlocked={submitDisabledByGate}
          openConfirmDialog={customConfirm.openConfirm}
          setAutoSaveHold={setAutoSaveHoldFromUi}
          summarySubmitIntentRef={summarySubmitIntentRef}
          ensureRecordId={ensureDraftRecordId}
          queueGuidedStepReservationDraftSync={queueGuidedStepReservationDraftSync}
          waitForGuidedStepReservationDraftSync={waitForGuidedStepReservationDraftSync}
          onBeforeGuidedStepAdvance={handleBeforeGuidedStepAdvance}
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
          prefetchedSummaryHtml={prefetchedSummaryHtml?.recordId === selectedRecordId ? prefetchedSummaryHtml.html : null}
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
          analyticsSnapshot={analyticsSnapshot || undefined}
          analyticsRevision={analyticsSnapshotRev}
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
          legendItems={listLegendItems}
          legendColumns={listLegendColumns}
          legendColumnWidths={listLegendColumnWidths}
          onSelect={handleRecordSelect}
        />
      )}

      <AnalyticsOverlay
        open={analyticsOverlayOpen}
        language={language}
        title={tSystem('app.analytics', language, 'Analytics')}
        subtitle={definition.title || formKey || ''}
        items={Array.isArray((analyticsSnapshot as any)?.items) ? ((analyticsSnapshot as any).items as any[]) : []}
        loading={analyticsOverlayLoading}
        error={analyticsOverlayError}
        updatedAt={(analyticsSnapshot as any)?.updatedAt || ''}
        onClose={closeAnalyticsOverlay}
      />

      <BlockingOverlay
        open={dedupProgress.open}
        title={dedupProgress.title}
        message={dedupProgress.message}
        mode={dedupProgress.phase === 'checking' ? 'loading' : dedupProgress.phase === 'available' ? 'success' : 'error'}
        zIndex={12019}
      />

      <ConfirmDialogOverlay
        open={recordSyncNotice.open}
        title={recordSyncNotice.title || tSystem('record.syncedTitle', language, 'Record synchronized')}
        message={
          recordSyncNotice.message ||
          tSystem(
            'record.synced',
            language,
            'The source data changed while you were editing. We loaded the latest version. Please review and adapt your changes as needed.'
          )
        }
        confirmLabel={tSystem('common.ok', language, 'OK')}
        cancelLabel={tSystem('common.cancel', language, 'Cancel')}
        showCancel={false}
        dismissOnBackdrop={false}
        showCloseButton={false}
        zIndex={12061}
        onCancel={() => undefined}
        onConfirm={() => setRecordSyncNotice({ open: false, title: '', message: '' })}
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
        confirmLabel={dedupDialogConfirmLabel}
        cancelLabel={dedupDialogCancelLabel}
        dismissOnBackdrop={false}
        showCloseButton={false}
        zIndex={12018}
        onCancel={handleDedupDialogCancel}
        onConfirm={handleDedupDialogConfirm}
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

      <BlockingOverlay
        open={guidedMilestoneBusy.state.open}
        title={guidedMilestoneBusy.state.title || tSystem('draft.savingShort', language, 'Saving…')}
        message={guidedMilestoneBusy.state.message || tSystem('navigation.waitSaving', language, 'Please wait while we save your changes...')}
        zIndex={12046}
      />

      <BlockingOverlay
        open={guidedStepAdvanceBusy.state.open}
        title={guidedStepAdvanceBusy.state.title || tSystem('navigation.waitTitle', language, 'Please wait')}
        message={guidedStepAdvanceBusy.state.message || tSystem('navigation.waitPhotos', language, 'Please wait while your photos finish uploading.')}
        zIndex={12047}
      />

      <BlockingOverlay
        open={copyRecordBusy.state.open}
        title={copyRecordBusy.state.title || tSystem('navigation.waitTitle', language, 'Please wait')}
        message={copyRecordBusy.state.message || tSystem('navigation.waitCopyRecord', language, 'Please wait while we prepare your copied record...')}
        zIndex={12048}
      />

      <BlockingOverlay
        open={recordSyncBusy.state.open}
        title={recordSyncBusy.state.title || tSystem('record.syncingTitle', language, 'Synchronizing record…')}
        message={
          recordSyncBusy.state.message ||
          tSystem(
            'record.syncing',
            language,
            'This record changed at the source. We are synchronizing the latest version now.'
          )
        }
        zIndex={12049}
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
        disabled={
          submitting || updateRecordBusyOpen || recordSyncBusyOpen || Boolean(recordLoadingId) || Boolean(recordStale) || precreateDedupChecking
        }
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
