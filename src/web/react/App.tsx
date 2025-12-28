import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  loadOptionsFromDataSource,
  optionKey,
  normalizeLanguage
} from '../core';
import {
  FieldValue,
  LangCode,
  WebQuestionDefinition,
  WebFormSubmission
} from '../types';
import {
  BootstrapContext,
  submit,
  triggerFollowup,
  uploadFilesApi,
  renderDocTemplatePdfPreviewApi,
  ListResponse,
  ListItem,
  fetchRecordById,
  fetchRecordByRowNumber
} from './api';
import FormView from './components/FormView';
import ListView from './components/ListView';
import { AppHeader } from './components/app/AppHeader';
import { ActionBar } from './components/app/ActionBar';
import { ReportOverlay, ReportOverlayState } from './components/app/ReportOverlay';
import { SummaryView } from './components/app/SummaryView';
import { FORM_VIEW_STYLES } from './components/form/styles';
import { FormErrors, LineItemState, OptionState, View } from './types';
import {
  buildDraftPayload,
  buildSubmissionPayload,
  collectValidationWarnings,
  computeUrlOnlyUploadUpdates,
  resolveExistingRecordId,
  validateForm
} from './app/submission';
import { runSelectionEffects as runSelectionEffectsHelper } from './app/selectionEffects';
import { detectDebug } from './app/utils';
import {
  buildInitialLineItems,
  clearAutoIncrementFields,
  resolveSubgroupKey
} from './app/lineItems';
import { normalizeRecordValues } from './app/records';
import { applyValueMapsToForm, coerceDefaultValue } from './app/valueMaps';
import { buildFilePayload } from './app/filePayload';
import packageJson from '../../../package.json';
import { resolveLabel } from './utils/labels';
import { tSystem } from '../systemStrings';

type SubmissionMeta = {
  id?: string;
  createdAt?: string;
  updatedAt?: string;
  status?: string | null;
};

type DraftSavePhase = 'idle' | 'dirty' | 'saving' | 'saved' | 'error' | 'paused';

// Build marker to verify deployed bundle version in UI
const BUILD_MARKER = `v${(packageJson as any).version || 'dev'}`;

const App: React.FC<BootstrapContext> = ({ definition, formKey, record }) => {
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
  const reportPdfObjectUrlsRef = useRef<string[]>([]);
  const reportPdfSeqRef = useRef<number>(0);
  const [errors, setErrors] = useState<FormErrors>({});
  const [validationWarnings, setValidationWarnings] = useState<{
    top: Array<{ message: string; fieldPath: string }>;
    byField: Record<string, string[]>;
  }>({
    top: [],
    byField: {}
  });
  const [status, setStatus] = useState<string | null>(null);
  const [statusLevel, setStatusLevel] = useState<'info' | 'success' | 'error' | null>(null);
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
  const [debugEnabled] = useState<boolean>(() => detectDebug());
  const logEvent = useCallback(
    (event: string, payload?: Record<string, unknown>) => {
      if (!debugEnabled || typeof console === 'undefined' || typeof console.info !== 'function') return;
      try {
        console.info('[ReactForm]', event, payload || {});
      } catch (_) {
        // ignore logging failures
      }
    },
    [debugEnabled]
  );

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
  const vvBottomRef = useRef<number>(-1);
  const [draftSave, setDraftSave] = useState<{ phase: DraftSavePhase; message?: string; updatedAt?: string }>(() => ({
    phase: 'idle'
  }));

  const autoSaveTimerRef = useRef<number | null>(null);
  const autoSaveDirtyRef = useRef<boolean>(false);
  const autoSaveInFlightRef = useRef<boolean>(false);
  const autoSaveQueuedRef = useRef<boolean>(false);
  const lastAutoSaveSeenRef = useRef<{ values: Record<string, FieldValue>; lineItems: LineItemState } | null>(null);

  // Keep latest values in refs so autosave can run without stale closures.
  const viewRef = useRef<View>(view);
  const submittingRef = useRef<boolean>(submitting);
  const valuesRef = useRef<Record<string, FieldValue>>(values);
  const lineItemsRef = useRef<LineItemState>(lineItems);
  const languageRef = useRef<LangCode>(language);
  const selectedRecordIdRef = useRef<string>(selectedRecordId);
  const selectedRecordSnapshotRef = useRef<WebFormSubmission | null>(selectedRecordSnapshot);
  const lastSubmissionMetaRef = useRef<SubmissionMeta | null>(lastSubmissionMeta);

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

  const [listCache, setListCache] = useState<{ response: ListResponse | null; records: Record<string, WebFormSubmission> }>(() => {
    const globalAny = globalThis as any;
    const bootstrap = globalAny.__WEB_FORM_BOOTSTRAP__ || null;
    const response = bootstrap?.listResponse || null;
    const records = bootstrap?.records || {};
    return { response, records };
  });
  const [listRefreshToken, setListRefreshToken] = useState(0);
  const invalidateListCache = useCallback(() => {
    // Keep any already-hydrated record snapshots (from bootstrap and/or recent selections) so navigating
    // back to the list does not reintroduce slow record fetches.
    setListCache(prev => ({ response: null, records: prev.records }));
    setListRefreshToken(token => token + 1);
  }, []);

  const applyRecordSnapshot = useCallback(
    (snapshot: WebFormSubmission) => {
      const id = snapshot?.id;
      if (!snapshot || !id) return;
      const normalized = normalizeRecordValues(definition, snapshot.values || {});
      const initialLineItems = buildInitialLineItems(definition, normalized);
      const mapped = applyValueMapsToForm(definition, normalized, initialLineItems, { mode: 'init' });
      // Avoid autosaving immediately due to state hydration from a server snapshot.
      autoSaveDirtyRef.current = false;
      if (autoSaveTimerRef.current) {
        globalThis.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      setDraftSave({ phase: 'idle' });
      lastAutoSaveSeenRef.current = { values: mapped.values, lineItems: mapped.lineItems };
      setValues(mapped.values);
      setLineItems(mapped.lineItems);
      setErrors({});
      setSelectedRecordId(id);
      setSelectedRecordSnapshot(snapshot);
      setLastSubmissionMeta({
        id,
        createdAt: snapshot.createdAt,
        updatedAt: snapshot.updatedAt,
        status: snapshot.status || null
      });
      setRecordLoadingId(null);
      setRecordLoadError(null);
      setListCache(prev => ({
        response: prev.response,
        records: { ...prev.records, [id]: snapshot }
      }));
    },
    [definition]
  );

  const loadRecordSnapshot = useCallback(
    async (recordId: string, rowNumberHint?: number) => {
      const candidateRow = rowNumberHint && Number.isFinite(rowNumberHint) && rowNumberHint >= 2 ? rowNumberHint : undefined;
      if (!recordId && !candidateRow) return;
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
          if (seq !== recordFetchSeqRef.current) return;
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
        if (seq !== recordFetchSeqRef.current) return;
        if (!snapshot) throw new Error('Record not found.');
        applyRecordSnapshot(snapshot);
        logEvent('record.fetch.done', { recordId: snapshot.id || recordId, durationMs: Date.now() - startedAt });
      } catch (err: any) {
        if (seq !== recordFetchSeqRef.current) return;
        const message = (err?.message || err?.toString?.() || 'Failed to load record.').toString();
        setRecordLoadError(message);
        setRecordLoadingId(null);
        logEvent('record.fetch.error', { recordId, message, rowNumberHint, durationMs: Date.now() - startedAt });
      }
    },
    [applyRecordSnapshot, formKey, logEvent]
  );

  const handleGlobalRefresh = useCallback(async () => {
    invalidateListCache();
    if (!selectedRecordId) return;
    await loadRecordSnapshot(selectedRecordId);
  }, [invalidateListCache, loadRecordSnapshot, selectedRecordId]);

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

  // Warnings are surfaced as transient "submission messages" in Form view.
  // Summary/PDF compute warnings from record values, so clear when leaving the Form view.
  useEffect(() => {
    if (view !== 'form') setValidationWarnings([]);
  }, [view]);

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
      setIsCompact(mobile && shortBased && landscapeBased);
    };
    updateMobile();
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', updateMobile);
      return () => window.removeEventListener('resize', updateMobile);
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

  const handleSubmitAnother = useCallback(() => {
    autoSaveDirtyRef.current = false;
    if (autoSaveTimerRef.current) {
      globalThis.clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    setDraftSave({ phase: 'idle' });
    const normalized = normalizeRecordValues(definition);
    const initialLineItems = buildInitialLineItems(definition);
    const mapped = applyValueMapsToForm(definition, normalized, initialLineItems, { mode: 'init' });
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
    logEvent('form.reset', { reason: 'submitAnother' });
  }, [definition, logEvent]);

  const handleGoHome = useCallback(() => {
    setView('list');
    setStatus(null);
    setStatusLevel(null);
  }, []);

  const handleDuplicateCurrent = useCallback(() => {
    // Preserve current values/line items but clear record context so the next submit creates a new record.
    autoSaveDirtyRef.current = false;
    if (autoSaveTimerRef.current) {
      globalThis.clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    setDraftSave({ phase: 'idle' });
    const cleared = clearAutoIncrementFields(definition, values, lineItems);
    lastAutoSaveSeenRef.current = { values: cleared.values, lineItems: cleared.lineItems };
    setValues(cleared.values);
    setLineItems(cleared.lineItems);
    setSelectedRecordId('');
    setSelectedRecordSnapshot(null);
    setLastSubmissionMeta(null);
    setErrors({});
    setStatus(null);
    setStatusLevel(null);
    setView('form');
  }, [definition, values, lineItems]);

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
    return definition.questions
      .map((q, idx) => ({ q, idx }))
      .filter(({ q }) => q.type === 'BUTTON')
      .map(({ q, idx }) => {
        const cfg: any = (q as any)?.button;
        if (!cfg || typeof cfg !== 'object') return null;
        const action = (cfg.action || '').toString().trim();
        if (action === 'renderDocTemplate') {
          if (!cfg.templateId) return null;
        } else if (action === 'createRecordPreset') {
          if (!createPresetEnabled) return null;
          if (!cfg.presetValues || typeof cfg.presetValues !== 'object') return null;
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
  }, [definition.questions, encodeButtonRef, language]);

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

  const generateReportPdfPreview = useCallback(
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
      const title = btn ? resolveLabel(btn, languageRef.current) : (baseId || 'Report');

      setReportOverlay(prev => ({
        ...(prev || { title: '' }),
        // Keep the report generation inside the app (iOS suspends background tabs and can stall callbacks).
        open: true,
        buttonId,
        title,
        subtitle: definition.title,
        pdfPhase: 'rendering',
        pdfObjectUrl: undefined,
        pdfFileName: undefined,
        pdfMessage: undefined
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
          setReportOverlay(prev => {
            if (!prev?.open || prev.buttonId !== buttonId) return prev;
            return { ...prev, pdfPhase: 'error', pdfMessage: msg };
          });
          logEvent('report.pdfPreview.error', { buttonId, message: msg });
          return;
        }
        const mimeType = (res.mimeType || 'application/pdf').toString();
        const objectUrl = base64ToPdfObjectUrl(res.pdfBase64, mimeType);
        reportPdfObjectUrlsRef.current.push(objectUrl);
        // Keep a small buffer of recent object URLs so multiple opened PDFs keep working.
        // Revoke the oldest ones to avoid unbounded memory growth.
        while (reportPdfObjectUrlsRef.current.length > 4) {
          const old = reportPdfObjectUrlsRef.current.shift();
          if (old) {
            try {
              URL.revokeObjectURL(old);
            } catch (_) {
              // ignore
            }
          }
        }

        const fileName = (res.fileName || 'report.pdf').toString();
        // Show overlay with Open/Download buttons (no embedded preview).
        setReportOverlay(prev => {
          if (prev?.buttonId !== buttonId) return prev;
          return {
            ...prev,
            open: true,
            pdfPhase: 'ready',
            pdfObjectUrl: objectUrl,
            pdfFileName: fileName,
            pdfMessage: undefined
          };
        });
        logEvent('report.pdfPreview.ok', { buttonId, fileName: (res.fileName || '').toString() });
      } catch (err: any) {
        if (seq !== reportPdfSeqRef.current) return;
        const msg = (err?.message || err?.toString?.() || 'Failed to generate PDF preview.').toString();
        // Always surface errors in-app as well.
        setReportOverlay(prev => {
          if (prev?.buttonId !== buttonId) return prev;
          return { ...prev, open: true, pdfPhase: 'error', pdfMessage: msg };
        });
        logEvent('report.pdfPreview.exception', { buttonId, message: msg });
      }
    },
    [base64ToPdfObjectUrl, definition, formKey, logEvent]
  );

  const openReport = useCallback(
    (buttonId: string) => {
      void generateReportPdfPreview(buttonId);
    },
    [generateReportPdfPreview]
  );

  const createRecordFromPreset = useCallback(
    (args: { buttonId: string; presetValues: Record<string, any> }) => {
      const { buttonId, presetValues } = args;

      // Creating a preset record is a "new record" flow: clear draft autosave and record context.
      autoSaveDirtyRef.current = false;
      if (autoSaveTimerRef.current) {
        globalThis.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      setDraftSave({ phase: 'idle' });

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
    [definition, logEvent, parseButtonRef]
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
        openReport(buttonId);
        return;
      }
      if (action === 'createRecordPreset') {
        createRecordFromPreset({ buttonId, presetValues: (cfg?.presetValues || {}) as any });
        return;
      }

      logEvent('ui.customButton.unsupported', { buttonId: baseId, qIdx: qIdx ?? null, action: action || null });
    },
    [createRecordFromPreset, definition.questions, logEvent, openReport, parseButtonRef]
  );

  const closeReportOverlay = useCallback(() => {
    // Cancel any in-flight report request so late responses can't re-open/overwrite the overlay.
    reportPdfSeqRef.current += 1;
    setReportOverlay(prev => ({
      ...(prev || { title: '' }),
      open: false,
      pdfPhase: 'idle',
      pdfObjectUrl: undefined,
      pdfFileName: undefined,
      pdfMessage: undefined,
      buttonId: undefined
    }));
  }, []);

  const autoSaveEnabled = Boolean(definition.autoSave?.enabled);
  const summaryViewEnabled = definition.summaryViewEnabled !== false;
  const copyCurrentRecordEnabled = definition.copyCurrentRecordEnabled !== false;
  const autoSaveDebounceMs = (() => {
    const raw = definition.autoSave?.debounceMs;
    const n = raw === undefined || raw === null ? NaN : Number(raw);
    if (!Number.isFinite(n)) return 2000;
    return Math.max(300, Math.min(60000, Math.floor(n)));
  })();
  const autoSaveStatusValue = (definition.autoSave?.status || 'In progress').toString();

  const isClosedRecord = (() => {
    const raw =
      (lastSubmissionMeta?.status || selectedRecordSnapshot?.status || '').toString();
    return raw.trim().toLowerCase() === 'closed';
  })();

  const performAutoSave = useCallback(
    async (reason: string) => {
      if (!autoSaveEnabled) return;
      if (viewRef.current !== 'form') return;
      if (submittingRef.current) return;

      const statusRaw =
        ((lastSubmissionMetaRef.current?.status || selectedRecordSnapshotRef.current?.status || '') as any)?.toString?.() ||
        '';
      if (statusRaw.trim().toLowerCase() === 'closed') {
        setDraftSave(prev => (prev.phase === 'paused' ? prev : { phase: 'paused', message: 'Closed (read-only)' }));
        return;
      }

      if (!autoSaveDirtyRef.current) return;
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
        const existingRecordId = resolveExistingRecordId({
          selectedRecordId: selectedRecordIdRef.current,
          selectedRecordSnapshot: selectedRecordSnapshotRef.current,
          lastSubmissionMetaId: lastSubmissionMetaRef.current?.id || null
        });

        const payload = buildDraftPayload({
          definition,
          formKey,
          language: languageRef.current,
          values: valuesRef.current,
          lineItems: lineItemsRef.current,
          existingRecordId
        }) as any;
        payload.__ckSaveMode = 'draft';
        payload.__ckStatus = autoSaveStatusValue;

        const res = await submit(payload);
        const ok = !!res?.success;
        const msg = (res?.message || '').toString();
        if (!ok) {
          const errText = msg || 'Autosave failed.';
          // If the server rejects because the record was closed, lock the UI.
          if (errText.toLowerCase().includes('closed')) {
            setLastSubmissionMeta(prev => ({ ...(prev || {}), status: 'Closed' }));
            setDraftSave({ phase: 'paused', message: 'Closed (read-only)' });
            return;
          }
          autoSaveDirtyRef.current = true;
          setDraftSave({ phase: 'error', message: errText });
          logEvent('autosave.error', { reason, message: errText });
          return;
        }

        const newId = (res?.meta?.id || existingRecordId || '').toString();
        const updatedAt = (res?.meta?.updatedAt || '').toString();
        if (newId) setSelectedRecordId(newId);
        setLastSubmissionMeta(prev => ({
          ...(prev || {}),
          id: newId || prev?.id,
          createdAt: res?.meta?.createdAt || prev?.createdAt,
          updatedAt: updatedAt || prev?.updatedAt,
          status: autoSaveStatusValue
        }));
        setDraftSave({ phase: 'saved', updatedAt: updatedAt || undefined });
        invalidateListCache();
        logEvent('autosave.success', { reason, recordId: newId || null, updatedAt: updatedAt || null });
      } catch (err: any) {
        const errText = (err?.message || err?.toString?.() || 'Autosave failed.').toString();
        autoSaveDirtyRef.current = true;
        setDraftSave({ phase: 'error', message: errText });
        logEvent('autosave.exception', { reason, message: errText });
      } finally {
        autoSaveInFlightRef.current = false;
        if (autoSaveQueuedRef.current && viewRef.current === 'form' && !submittingRef.current) {
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
    [autoSaveDebounceMs, autoSaveEnabled, autoSaveStatusValue, definition, formKey, invalidateListCache, logEvent]
  );

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
      setDraftSave(prev => (prev.phase === 'paused' ? prev : { phase: 'paused', message: 'Closed (read-only)' }));
      return;
    }

    autoSaveDirtyRef.current = true;
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
  }, [autoSaveDebounceMs, autoSaveEnabled, isClosedRecord, performAutoSave, submitting, view, values, lineItems]);

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
      if (isClosedRecord) return { success: false, message: 'Closed (read-only).' };

      // Ensure we don't have a pending debounced draft save that might race with this sequence.
      if (autoSaveTimerRef.current) {
        globalThis.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }

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
        try {
          setDraftSave({ phase: 'saving' });
          const draft = buildDraftPayload({
            definition,
            formKey,
            language: languageRef.current,
            values: valuesRef.current,
            lineItems: lineItemsRef.current
          }) as any;
          draft.__ckSaveMode = 'draft';
          draft.__ckStatus = autoSaveStatusValue;
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
          setLastSubmissionMeta(prev => ({
            ...(prev || {}),
            id: recordId,
            createdAt: res?.meta?.createdAt || prev?.createdAt,
            updatedAt: res?.meta?.updatedAt || prev?.updatedAt,
            status: autoSaveStatusValue
          }));
          setDraftSave({ phase: 'saved', updatedAt: (res?.meta?.updatedAt || '').toString() || undefined });
          invalidateListCache();
          logEvent('upload.ensureRecord.saved', { recordId, fieldPath: args.fieldPath });
        } catch (err: any) {
          const msg = (err?.message || err?.toString?.() || 'Failed to create draft record.').toString();
          setDraftSave({ phase: 'error', message: msg });
          return { success: false, message: msg };
        }
      }

      // Step 2: upload file payloads to Drive and get final URL list.
      const existingUrls = (args.items || []).filter((it): it is string => typeof it === 'string').filter(Boolean);
      const fileItems = (args.items || []).filter(isFile);
      if (!fileItems.length) {
        // Nothing new to upload (e.g., only URLs).
        return { success: true };
      }

      try {
        const payloads = await buildFilePayload(fileItems, undefined);
        const uploadRes = await uploadFilesApi([...existingUrls, ...payloads], args.uploadConfig);
        if (!uploadRes?.success) {
          const msg = (uploadRes?.message || 'Failed to upload files.').toString();
          logEvent('upload.files.error', { fieldPath: args.fieldPath, message: msg });
          return { success: false, message: msg };
        }
        const urls = splitUrlList(uploadRes?.urls || '');
        if (!urls.length) {
          const msg = 'Upload returned no URLs.';
          logEvent('upload.files.empty', { fieldPath: args.fieldPath });
          return { success: false, message: msg };
        }

        // Step 3: update local state with URL(s) (remove File objects), then save draft again to persist URL(s) to the sheet.
        const nextValues =
          args.scope === 'top' && args.questionId
            ? { ...valuesRef.current, [args.questionId]: urls }
            : valuesRef.current;

        const nextLineItems =
          args.scope === 'line' && args.groupId && args.rowId && args.fieldId
            ? (() => {
                const current = lineItemsRef.current;
                const rows = current[args.groupId!] || [];
                const nextRows = rows.map(r =>
                  r.id === args.rowId ? { ...r, values: { ...(r.values || {}), [args.fieldId!]: urls } } : r
                );
                return { ...current, [args.groupId!]: nextRows };
              })()
            : lineItemsRef.current;

        if (args.scope === 'top' && args.questionId) {
          setValues(nextValues);
        }
        if (args.scope === 'line' && args.groupId) {
          setLineItems(nextLineItems);
        }

        const draft2 = buildDraftPayload({
          definition,
          formKey,
          language: languageRef.current,
          values: nextValues,
          lineItems: nextLineItems,
          existingRecordId: recordId
        }) as any;
        draft2.__ckSaveMode = 'draft';
        draft2.__ckStatus = autoSaveStatusValue;

        const res2 = await submit(draft2);
        if (!res2?.success) {
          const msg = (res2?.message || 'Failed to save uploaded file URLs.').toString();
          logEvent('upload.saveUrls.error', { fieldPath: args.fieldPath, recordId, message: msg });
          setDraftSave({ phase: 'error', message: msg });
          return { success: false, message: msg };
        }

        setLastSubmissionMeta(prev => ({
          ...(prev || {}),
          id: recordId,
          updatedAt: (res2?.meta?.updatedAt || prev?.updatedAt) as any,
          status: autoSaveStatusValue
        }));
        setDraftSave({ phase: 'saved', updatedAt: (res2?.meta?.updatedAt || '').toString() || undefined });
        invalidateListCache();
        logEvent('upload.saveUrls.success', { fieldPath: args.fieldPath, recordId, urls: urls.length });
        return { success: true };
      } catch (err: any) {
        const msg = (err?.message || err?.toString?.() || 'Failed to upload files.').toString();
        logEvent('upload.files.exception', { fieldPath: args.fieldPath, message: msg });
        return { success: false, message: msg };
      }
    },
    [autoSaveStatusValue, definition, formKey, invalidateListCache, isClosedRecord, logEvent]
  );

  useEffect(() => {
    // Avoid autosaving due to initial bootstrap hydration.
    autoSaveDirtyRef.current = false;
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
      setValues(mappedValues);
      setLineItems(mappedLineItems);
    }
    if (record?.id) {
      setSelectedRecordId(record.id);
    }
    if (record) {
      setLastSubmissionMeta({
        id: record.id,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
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
    }
  ) {
    runSelectionEffectsHelper({
      definition,
      question,
      value,
      language,
      values,
      setValues,
      setLineItems,
      logEvent,
      opts,
      onRowAppended: ({ anchor, targetKey, rowId, source }) => {
        setExternalScrollAnchor(anchor);
        logEvent('ui.selectionEffect.rowAppended', { anchor, targetKey, rowId, source: source || null });
      }
    });
  }

  const handleSubmit = async (submitUi?: { collapsedRows: Record<string, boolean>; collapsedSubgroups: Record<string, boolean> }) => {
    if (isClosedRecord) {
      setStatus(tSystem('app.closedReadOnly', language, 'Closed (read-only)'));
      setStatusLevel('info');
      logEvent('submit.blocked.closed');
      return;
    }
    clearStatus();
    logEvent('submit.begin', { language, lineItemGroups: Object.keys(lineItems).length });
    try {
      setValidationWarnings(
        collectValidationWarnings({
          definition,
          language,
          values,
          lineItems,
          phase: 'submit'
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
      setStatus(tSystem('validation.fixErrors', language, 'Please fix validation errors.'));
      setStatusLevel('error');
      logEvent('submit.validationFailed');
      return;
    }
    setSubmitting(true);
    setStatus(tSystem('actions.submitting', language, 'Submitting…'));
    setStatusLevel('info');
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
      const existingRecordId = resolveExistingRecordId({
        selectedRecordId,
        selectedRecordSnapshot,
        lastSubmissionMetaId: lastSubmissionMeta?.id || null
      });
      const payload = await buildSubmissionPayload({
        definition,
        formKey,
        language,
        values,
        lineItems,
        existingRecordId,
        collapsedRows: submitUi?.collapsedRows,
        collapsedSubgroups: submitUi?.collapsedSubgroups
      });
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
      const res = await submit(payload);
      const message = res.message || (res.success ? 'Submitted' : 'Submit failed');
      setStatus(message);
      setStatusLevel(res.success ? 'success' : 'error');
      if (!res.success) {
        logEvent('submit.error', { message, meta: res.meta });
        return;
      }
      logEvent('submit.success', { recordId: res.meta?.id });

      const recordId = (res.meta?.id || existingRecordId || selectedRecordId || '').toString();
      if (recordId) setSelectedRecordId(recordId);

      setLastSubmissionMeta(prev => ({
        id: recordId || prev?.id || selectedRecordId,
        createdAt: res.meta?.createdAt || prev?.createdAt,
        updatedAt: res.meta?.updatedAt || prev?.updatedAt,
        status: (res.meta as any)?.status || prev?.status || null
      }));

      // Run follow-up actions automatically (and close the record) now that the Follow-up view is removed.
      const followupCfg = (definition as any)?.followup || null;
      if (recordId) {
        const actions: string[] = [];
        if (followupCfg?.pdfTemplateId) actions.push('CREATE_PDF');
        if (followupCfg?.emailTemplateId && followupCfg?.emailRecipients) actions.push('SEND_EMAIL');
        // Always close on submit (per UX requirement).
        actions.push('CLOSE_RECORD');

        const labelForAction = (action: string): string => {
          if (action === 'CREATE_PDF') return 'Creating PDF';
          if (action === 'SEND_EMAIL') return 'Sending email';
          if (action === 'CLOSE_RECORD') return 'Closing record';
          return 'Running follow-up';
        };

        const followupErrors: string[] = [];
        for (const action of actions) {
          try {
            setStatus(`${labelForAction(action)}…`);
            setStatusLevel('info');
            logEvent('followup.auto.begin', { action, recordId });
            const r = await triggerFollowup(formKey, recordId, action);
            if (!r?.success) {
              const msg = (r?.message || r?.status || 'Failed').toString();
              followupErrors.push(`${action}: ${msg}`);
              logEvent('followup.auto.error', { action, recordId, message: msg });
              // Continue so we still attempt CLOSE_RECORD even if earlier steps fail.
              continue;
            }

            invalidateListCache();
            logEvent('followup.auto.success', { action, recordId, status: r.status || null });
            setLastSubmissionMeta(prev => ({
              ...(prev || { id: recordId }),
              updatedAt: r.updatedAt || prev?.updatedAt,
              status: r.status || prev?.status || null
            }));
            setSelectedRecordSnapshot(prev =>
              prev
                ? {
                    ...prev,
                    updatedAt: r.updatedAt || prev.updatedAt,
                    status: r.status || prev.status,
                    pdfUrl: r.pdfUrl || prev.pdfUrl
                  }
                : prev
            );
          } catch (err: any) {
            const msg = (err?.message || err || 'Failed').toString();
            followupErrors.push(`${action}: ${msg}`);
            logEvent('followup.auto.exception', { action, recordId, message: msg });
          }
        }

        if (followupErrors.length) {
          setStatus(`Submitted, but follow-up had issues: ${followupErrors.join(' · ')}`);
          setStatusLevel('error');
        } else {
          setStatus('Submitted and closed.');
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
      invalidateListCache();
    } catch (err: any) {
      setStatus(err?.message || 'Submit failed');
      setStatusLevel('error');
      logEvent('submit.exception', { message: err?.message || err });
    } finally {
      setSubmitting(false);
    }
  };

  const handleRecordSelect = (row: ListItem, fullRecord?: WebFormSubmission) => {
    const sourceRecord = fullRecord || listCache.records[row.id] || null;
    setStatus(null);
    setStatusLevel(null);
    setRecordLoadError(null);
    setSelectedRecordId(row.id);

    if (sourceRecord) {
      applyRecordSnapshot(sourceRecord);
    } else {
      setSelectedRecordSnapshot(null);
      setLastSubmissionMeta({
        id: row.id,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        status: row.status ? row.status.toString() : null
      });
      const rowNumberHint = Number((row as any).__rowNumber);
      loadRecordSnapshot(row.id, Number.isFinite(rowNumberHint) ? rowNumberHint : undefined);
    }

    const statusRaw = ((sourceRecord?.status || row.status || '') as any)?.toString?.() || '';
    const isClosed = statusRaw.trim().toLowerCase() === 'closed';
    // When Summary view is disabled, always open the Form view (closed records are read-only).
    setView(summaryViewEnabled ? (isClosed ? 'summary' : 'form') : 'form');
  };

  const currentRecord = selectedRecordSnapshot || (selectedRecordId ? listCache.records[selectedRecordId] : null);
  const draftBanner = (() => {
    if (isClosedRecord) {
      return (
        <output
          style={{
            padding: '12px 14px',
            borderRadius: 14,
            border: '1px solid rgba(15, 23, 42, 0.14)',
            background: 'rgba(118,118,128,0.08)',
            fontWeight: 700
          }}
          aria-live="polite"
        >
          {tSystem('app.closedReadOnly', language, 'Closed (read-only)')}
        </output>
      );
    }

    if (!autoSaveEnabled) return null;
    if (draftSave.phase === 'idle') return null;

    let text: string | null = null;
    if (draftSave.phase === 'saving') text = tSystem('draft.saving', language, 'Saving draft…');
    else if (draftSave.phase === 'saved') text = tSystem('draft.saved', language, 'Draft saved.');
    else if (draftSave.phase === 'dirty') text = tSystem('draft.dirty', language, 'Draft has unsaved changes.');
    else if (draftSave.phase === 'paused') text = draftSave.message || tSystem('draft.paused', language, 'Draft autosave paused.');
    else if (draftSave.phase === 'error') {
      const message = draftSave.message || tSystem('draft.unknownError', language, 'Unknown error');
      text = tSystem('draft.saveFailed', language, 'Draft save failed: {message}', { message });
    }

    if (!text) return null;
    const isError = draftSave.phase === 'error';

    return (
      <output
        style={{
          padding: '10px 14px',
          borderRadius: 14,
          border: isError ? '1px solid #fca5a5' : '1px solid rgba(15, 23, 42, 0.12)',
          background: isError ? '#fee2e2' : 'rgba(118,118,128,0.06)',
          color: '#0f172a',
          fontWeight: 700
        }}
        aria-live="polite"
      >
        {text}
      </output>
    );
  })();

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
      <AppHeader
        title={definition.title || 'Form'}
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
      />

      <ActionBar
        position="top"
        language={language}
        view={view}
        disabled={submitting || Boolean(recordLoadingId)}
        submitting={submitting}
        readOnly={view === 'form' && isClosedRecord}
        summaryEnabled={summaryViewEnabled}
        copyEnabled={copyCurrentRecordEnabled}
        canCopy={copyCurrentRecordEnabled && (view === 'form' ? true : Boolean(selectedRecordId || lastSubmissionMeta?.id))}
        customButtons={customButtons as any}
        actionBars={definition.actionBars}
        onHome={handleGoHome}
        onCreateNew={handleSubmitAnother}
        onCreateCopy={handleDuplicateCurrent}
        onEdit={() => setView('form')}
        onSummary={() => {
          if (!summaryViewEnabled) return;
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
        }}
        onSubmit={() => formSubmitActionRef.current?.()}
        onCustomButton={handleCustomButton}
        onDiagnostic={logEvent}
      />

      {view === 'form' && (
        <>
          {draftBanner}
          <FormView
            definition={definition}
            language={language}
            values={values}
            setValues={setValues}
            lineItems={lineItems}
            setLineItems={setLineItems}
            onSubmit={handleSubmit}
            submitActionRef={formSubmitActionRef}
            submitting={submitting || isClosedRecord || Boolean(recordLoadingId)}
            errors={errors}
            setErrors={setErrors}
            status={status}
            statusTone={statusLevel}
            warningTop={validationWarnings.top}
            warningByField={validationWarnings.byField}
            onStatusClear={clearStatus}
            optionState={optionState}
            setOptionState={setOptionState}
            ensureOptions={ensureOptions}
            ensureLineOptions={ensureLineOptions}
            externalScrollAnchor={externalScrollAnchor}
            onExternalScrollConsumed={() => setExternalScrollAnchor(null)}
            onSelectionEffect={runSelectionEffects}
            onUploadFiles={uploadFieldUrls}
            onReportButton={openReport}
            reportBusy={reportOverlay.pdfPhase === 'rendering'}
            reportBusyId={reportOverlay.buttonId || null}
            onDiagnostic={logEvent}
          />
        </>
      )}

      {view === 'summary' && (
        <SummaryView
          definition={definition}
          language={language}
          values={values}
          lineItems={lineItems}
          lastSubmissionMeta={lastSubmissionMeta}
          recordLoadError={recordLoadError}
          selectedRecordId={selectedRecordId}
          recordLoadingId={recordLoadingId}
          currentRecord={currentRecord}
        />
      )}
      {view === 'list' && (
        <ListView
          formKey={formKey}
          definition={definition}
          language={language}
          cachedResponse={listCache.response}
          cachedRecords={listCache.records}
          refreshToken={listRefreshToken}
          onDiagnostic={logEvent}
          onCache={({ response, records }) => {
            setListCache(prev => ({
              response,
              records: { ...prev.records, ...records }
            }));
          }}
          onSelect={handleRecordSelect}
        />
      )}

      <ReportOverlay
        language={language}
        state={reportOverlay}
        onClose={closeReportOverlay}
      />

      <ActionBar
        position="bottom"
        language={language}
        view={view}
        disabled={submitting || Boolean(recordLoadingId)}
        submitting={submitting}
        readOnly={view === 'form' && isClosedRecord}
        summaryEnabled={summaryViewEnabled}
        copyEnabled={copyCurrentRecordEnabled}
        canCopy={copyCurrentRecordEnabled && (view === 'form' ? true : Boolean(selectedRecordId || lastSubmissionMeta?.id))}
        customButtons={customButtons as any}
        actionBars={definition.actionBars}
        onHome={handleGoHome}
        onCreateNew={handleSubmitAnother}
        onCreateCopy={handleDuplicateCurrent}
        onEdit={() => setView('form')}
        onSummary={() => {
          if (!summaryViewEnabled) return;
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
        }}
        onSubmit={() => formSubmitActionRef.current?.()}
        onCustomButton={handleCustomButton}
        onDiagnostic={logEvent}
      />
    </div>
  );
};

export default App;

