import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { BootstrapContext, submit, triggerFollowup, ListResponse, ListItem, fetchRecordById, fetchRecordByRowNumber } from './api';
import FormView from './components/FormView';
import ListView from './components/ListView';
import { AppHeader } from './components/app/AppHeader';
import { BottomActionBar } from './components/app/BottomActionBar';
import { SummaryView } from './components/app/SummaryView';
import { FormErrors, LineItemState, OptionState, View } from './types';
import { buildSubmissionPayload, computeUrlOnlyUploadUpdates, resolveExistingRecordId, validateForm } from './app/submission';
import { runSelectionEffects as runSelectionEffectsHelper } from './app/selectionEffects';
import { detectDebug } from './app/utils';
import {
  buildInitialLineItems,
  clearAutoIncrementFields,
  resolveSubgroupKey
} from './app/lineItems';
import { normalizeRecordValues } from './app/records';
import { applyValueMapsToForm } from './app/valueMaps';
import packageJson from '../../../package.json';

type SubmissionMeta = {
  id?: string;
  createdAt?: string;
  updatedAt?: string;
  status?: string | null;
};

// Build marker to verify deployed bundle version in UI
const BUILD_MARKER = `v${(packageJson as any).version || 'dev'}`;

const App: React.FC<BootstrapContext> = ({ definition, formKey, record }) => {
  const [language, setLanguage] = useState<LangCode>(normalizeLanguage(definition.languages?.[0] || record?.language));
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
  const [errors, setErrors] = useState<FormErrors>({});
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

  const formSubmitActionRef = useRef<(() => void) | null>(null);
  const vvBottomRef = useRef<number>(-1);

  const [listCache, setListCache] = useState<{ response: ListResponse | null; records: Record<string, WebFormSubmission> }>(() => {
    const globalAny = globalThis as any;
    const bootstrap = globalAny.__WEB_FORM_BOOTSTRAP__ || null;
    const response = bootstrap?.listResponse || null;
    const records = bootstrap?.records || {};
    return { response, records };
  });
  const [listRefreshToken, setListRefreshToken] = useState(0);
  const invalidateListCache = () => {
    // Keep any already-hydrated record snapshots (from bootstrap and/or recent selections) so navigating
    // back to the list does not reintroduce slow record fetches.
    setListCache(prev => ({ response: null, records: prev.records }));
    setListRefreshToken(token => token + 1);
  };

  const applyRecordSnapshot = useCallback(
    (snapshot: WebFormSubmission) => {
      const id = snapshot?.id;
      if (!snapshot || !id) return;
      const normalized = normalizeRecordValues(definition, snapshot.values || {});
      const initialLineItems = buildInitialLineItems(definition, normalized);
      const mapped = applyValueMapsToForm(definition, normalized, initialLineItems, { mode: 'init' });
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
    const normalized = normalizeRecordValues(definition);
    const initialLineItems = buildInitialLineItems(definition);
    const mapped = applyValueMapsToForm(definition, normalized, initialLineItems, { mode: 'init' });
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
    const cleared = clearAutoIncrementFields(definition, values, lineItems);
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

  useEffect(() => {
    if (record?.values) {
      const normalizedValues = normalizeRecordValues(definition, record.values);
      const initialLineItems = buildInitialLineItems(definition, normalizedValues);
      const { values: mappedValues, lineItems: mappedLineItems } = applyValueMapsToForm(
        definition,
        normalizedValues,
        initialLineItems
      );
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
    clearStatus();
    logEvent('submit.begin', { language, lineItemGroups: Object.keys(lineItems).length });
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
      setStatus('Please fix validation errors.');
      setStatusLevel('error');
      logEvent('submit.validationFailed');
      return;
    }
    setSubmitting(true);
    setStatus('Submitting…');
    setStatusLevel('info');
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
      setView('summary');
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

    setView('summary');
  };

  const currentRecord = selectedRecordSnapshot || (selectedRecordId ? listCache.records[selectedRecordId] : null);

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
      <AppHeader
        title={definition.title || 'Form'}
        buildMarker={BUILD_MARKER}
        isMobile={isMobile}
        languages={definition.languages || ['EN']}
        language={language}
        onLanguageChange={raw => setLanguage(normalizeLanguage(raw))}
        onRefresh={handleGlobalRefresh}
      />

      {view === 'form' && (
        <>
          <FormView
            definition={definition}
            language={language}
            values={values}
            setValues={setValues}
            lineItems={lineItems}
            setLineItems={setLineItems}
            onSubmit={handleSubmit}
            submitActionRef={formSubmitActionRef}
            submitting={submitting}
            errors={errors}
            setErrors={setErrors}
            status={status}
            statusTone={statusLevel}
            onStatusClear={clearStatus}
            optionState={optionState}
            setOptionState={setOptionState}
            ensureOptions={ensureOptions}
            ensureLineOptions={ensureLineOptions}
            externalScrollAnchor={externalScrollAnchor}
            onExternalScrollConsumed={() => setExternalScrollAnchor(null)}
            onSelectionEffect={runSelectionEffects}
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
          optionState={optionState}
          tooltipState={tooltipState}
          lastSubmissionMeta={lastSubmissionMeta}
          recordLoadError={recordLoadError}
          selectedRecordId={selectedRecordId}
          recordLoadingId={recordLoadingId}
          currentRecord={currentRecord}
          isMobile={isMobile}
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

      <BottomActionBar
        view={view}
        submitting={submitting}
        canCopy={view === 'form' ? true : Boolean(selectedRecordId || lastSubmissionMeta?.id)}
        onHome={handleGoHome}
        onCreateNew={handleSubmitAnother}
        onCreateCopy={handleDuplicateCurrent}
        onEdit={() => setView('form')}
        onSummary={() => setView('summary')}
        onSubmit={() => formSubmitActionRef.current?.()}
      />
    </div>
  );
};

export default App;

