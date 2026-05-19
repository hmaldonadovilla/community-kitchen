import React, { startTransition, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ANALYTICS_PAGE_CONFIG } from '../../../config/analyticsPage';
import type { AnalyticsDashboardPayload, AnalyticsDashboardPipeline } from '../../../config/analyticsPageTypes';
import { buildLandingUrl, navigateToTopLevel, resolveAdminEnabled, resolveServiceUrl } from '../app/headerNavigation';
import { fetchAnalyticsDashboardApi, queueAnalyticsPipelineRunApi } from '../api';
import { BlockingOverlay } from '../features/overlays/BlockingOverlay';
import { formatDateEeeDdMmmYyyy } from '../utils/valueDisplay';
import { formatAnalyticsValue } from './model';

const ANALYTICS_PAGE_STYLES = `
  .ck-analytics-page.page {
    max-width: 1180px;
    gap: 24px;
    font-size: var(--ck-font-label);
  }
  .ck-analytics-shell {
    display: flex;
    flex-direction: column;
    gap: 24px;
  }
  .ck-analytics-header {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    align-items: center;
    gap: 16px;
    padding-top: 6px;
  }
  .ck-analytics-header-slot {
    display: flex;
    align-items: center;
    min-width: 0;
  }
  .ck-analytics-header-slot--start {
    justify-content: flex-start;
  }
  .ck-analytics-header-slot--center {
    justify-content: center;
    text-align: center;
  }
  .ck-analytics-header-slot--end {
    justify-content: flex-end;
  }
  .ck-analytics-header-title {
    margin: 0;
    font-size: var(--ck-font-group-title);
    line-height: 1.15;
    font-weight: 600;
    letter-spacing: 0;
  }
  .ck-analytics-pill {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    padding: 0 14px;
    border-radius: 8px;
    border: 1px solid rgba(107, 117, 128, 0.28);
    background: transparent;
    color: var(--text);
    font-size: calc(var(--ck-font-label) * 0.94);
    font-weight: 500;
    line-height: 1;
    white-space: nowrap;
  }
  .ck-analytics-back {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 48px;
    min-width: 150px;
    padding: 0 18px;
    border-radius: 8px;
    border: 1px solid var(--accent);
    background: var(--accent);
    color: #fff;
    -webkit-text-fill-color: #fff;
    text-decoration: none;
    font-size: calc(var(--ck-font-label) * 0.95);
    font-weight: 500;
    line-height: 1;
    white-space: nowrap;
  }
  .ck-analytics-hero {
    display: grid;
    gap: 8px;
  }
  .ck-analytics-description {
    margin: 0;
    color: var(--text);
    font-size: var(--ck-font-label);
    line-height: 1.4;
  }
  .ck-analytics-empty,
  .ck-analytics-loading {
    margin: 0;
    color: var(--muted);
    font-size: calc(var(--ck-font-label) * 0.95);
    line-height: 1.45;
  }
  .ck-analytics-updated {
    margin: 0;
    color: var(--muted);
    font-size: calc(var(--ck-font-label) * 0.7);
    line-height: 1.4;
  }
  .ck-analytics-errors {
    display: grid;
    gap: 8px;
  }
  .ck-analytics-error {
    margin: 0;
    color: var(--danger);
    font-size: calc(var(--ck-font-label) * 0.9);
    line-height: 1.45;
  }
  .ck-analytics-section {
    display: flex;
    flex-direction: column;
    gap: 18px;
  }
  .ck-analytics-section-head {
    display: grid;
    gap: 8px;
  }
  .ck-analytics-section-title {
    margin: 0;
    font-size: var(--ck-font-group-title);
    line-height: 1.15;
    font-weight: 600;
    letter-spacing: 0;
  }
  .ck-analytics-section-description {
    margin: 0;
    color: var(--muted);
    font-size: calc(var(--ck-font-label) * 0.95);
    line-height: 1.45;
  }
  .ck-analytics-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 16px;
  }
  .ck-analytics-card {
    border-radius: 8px;
    border: 1px solid rgba(107, 117, 128, 0.36);
    background: rgba(255, 255, 255, 0.94);
    padding: 22px;
    display: grid;
    gap: 16px;
    min-height: 220px;
  }
  .ck-analytics-card-meta {
    display: grid;
    gap: 6px;
  }
  .ck-analytics-card-source {
    margin: 0;
    color: var(--muted);
    font-size: calc(var(--ck-font-label) * 0.82);
    line-height: 1.35;
  }
  .ck-analytics-card-title {
    margin: 0;
    color: var(--text);
    font-size: var(--ck-font-label);
    line-height: 1.12;
    font-weight: 600;
    letter-spacing: 0;
  }
  .ck-analytics-card-value {
    margin: 0;
    font-size: var(--ck-font-group-title);
    line-height: 1.15;
    font-weight: 600;
    letter-spacing: 0;
    word-break: break-word;
  }
  .ck-analytics-card-description {
    margin: 0;
    color: var(--muted);
    font-size: calc(var(--ck-font-label) * 0.9);
    line-height: 1.45;
  }
  .ck-analytics-pipeline-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
    align-items: start;
  }
  .ck-analytics-pipeline-grid--single {
    max-width: 560px;
    grid-template-columns: minmax(0, 1fr);
  }
  .ck-analytics-pipeline-card {
    border-radius: 8px;
    border: 1px solid rgba(107, 117, 128, 0.36);
    background: rgba(255, 255, 255, 0.94);
    padding: 18px;
    display: grid;
    gap: 14px;
  }
  .ck-analytics-pipeline-form {
    display: grid;
    gap: 12px;
  }
  .ck-analytics-field {
    display: grid;
    gap: 10px;
  }
  .ck-analytics-date-action-row {
    display: flex;
    align-items: stretch;
    gap: 10px;
    min-width: 0;
    width: 100%;
  }
  .ck-analytics-field-label,
  .ck-analytics-notice,
  .ck-analytics-pipeline-helper {
    font-size: calc(var(--ck-font-label) * 0.9);
    line-height: 1.45;
  }
  .ck-analytics-field-label {
    color: var(--text);
    font-weight: 500;
  }
  .ck-analytics-pipeline-helper,
  .ck-analytics-notice {
    margin: 0;
    color: var(--muted);
  }
  .ck-analytics-date-input {
    min-height: 46px;
    border-radius: 8px;
    border: 1px solid rgba(107, 117, 128, 0.28);
    background: #fff;
    color: var(--text);
    padding: 0 14px;
    font-size: calc(var(--ck-font-label) * 0.95);
    font-family: inherit;
    min-width: 0;
    min-inline-size: 0;
    max-width: 100%;
    max-inline-size: 100%;
    width: 100%;
    inline-size: 100%;
    box-sizing: border-box;
    text-align: left;
    overflow: hidden;
  }
  .ck-analytics-date-field {
    position: relative;
    flex: 1 1 0;
    width: auto;
    min-width: 0;
    max-width: 100%;
    overflow: hidden;
    padding-right: 50px;
  }
  .ck-analytics-date-field,
  .ck-analytics-submit {
    min-inline-size: 0;
  }
  .ck-analytics-date-input.ck-analytics-date-input--display {
    color: transparent;
    -webkit-text-fill-color: transparent;
  }
  .ck-analytics-date-input.ck-analytics-date-input--display::-webkit-date-and-time-value,
  .ck-analytics-date-input.ck-analytics-date-input--display::-webkit-datetime-edit {
    color: transparent;
    -webkit-text-fill-color: transparent;
  }
  .ck-analytics-date-input::-webkit-date-and-time-value {
    min-width: 0;
    max-width: 100%;
    text-align: left;
  }
  .ck-analytics-date-input::-webkit-calendar-picker-indicator {
    margin: 0;
  }
  .ck-analytics-date-overlay {
    position: absolute;
    inset: 0;
    pointer-events: none;
    display: flex;
    align-items: center;
    padding: 0 50px 0 14px;
    color: var(--text);
    font-size: calc(var(--ck-font-label) * 0.95);
    line-height: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: clip;
    font-family: inherit;
  }
  .ck-analytics-submit {
    min-height: 46px;
    border: 0;
    border-radius: 8px;
    background: rgba(11, 87, 208, 0.96);
    color: #fff;
    font-size: calc(var(--ck-font-label) * 0.95);
    font-family: inherit;
    font-weight: 500;
    padding: 0 14px;
    flex: 0 0 auto;
    min-width: 132px;
    white-space: nowrap;
  }
  .ck-analytics-submit[disabled] {
    opacity: 0.6;
  }
  @media (max-width: 980px) {
    .ck-analytics-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
    .ck-analytics-pipeline-grid {
      grid-template-columns: minmax(0, 1fr);
    }
  }
  @media (max-width: 620px) {
    .ck-analytics-header {
      grid-template-columns: minmax(0, 1fr) auto;
      grid-template-areas:
        "back env"
        "title title";
      gap: 10px 12px;
    }
    .ck-analytics-header-title {
      font-size: calc(var(--ck-font-group-title) * 0.92);
    }
    .ck-analytics-header-slot--start {
      grid-area: back;
      justify-content: flex-start;
    }
    .ck-analytics-header-slot--center {
      grid-area: title;
      justify-content: center;
    }
    .ck-analytics-header-slot--end {
      grid-area: env;
      justify-content: flex-end;
    }
    .ck-analytics-back {
      min-width: 0;
      min-height: 46px;
      padding: 0 14px;
    }
    .ck-analytics-pill {
      min-height: 42px;
      padding: 0 12px;
    }
    .ck-analytics-grid {
      grid-template-columns: minmax(0, 1fr);
    }
    .ck-analytics-page.page {
      gap: 18px;
    }
    .ck-analytics-shell {
      gap: 18px;
    }
    .ck-analytics-pipeline-grid {
      gap: 12px;
    }
    .ck-analytics-pipeline-card {
      padding: 16px;
    }
    .ck-analytics-date-action-row {
      flex-direction: column;
    }
    .ck-analytics-date-field {
      flex: none;
      width: 100%;
    }
    .ck-analytics-submit {
      width: 100%;
      padding: 0 14px;
    }
  }
  @media (max-width: 340px) {
    .ck-analytics-header {
      grid-template-columns: minmax(0, 1fr);
      grid-template-areas:
        "back"
        "title"
        "env";
      justify-items: stretch;
    }
    .ck-analytics-header-slot {
      justify-content: center;
    }
    .ck-analytics-header-slot--start {
      justify-content: flex-start;
    }
    .ck-analytics-header-slot--end {
      justify-content: flex-start;
    }
    .ck-analytics-back,
    .ck-analytics-pill {
      width: fit-content;
    }
    .ck-analytics-date-action-row {
      flex-direction: column;
    }
    .ck-analytics-submit {
      width: 100%;
    }
  }
`;

const logEvent = (event: string, payload?: Record<string, unknown>): void => {
  if (typeof console === 'undefined' || typeof console.info !== 'function') return;
  try {
    console.info('[ReactForm][Analytics]', event, payload || {});
  } catch {
    // ignore
  }
};

const readBootstrappedAnalyticsDashboard = (): AnalyticsDashboardPayload | null => {
  try {
    const globalAny = globalThis as any;
    const payload = globalAny?.__WEB_FORM_BOOTSTRAP__?.analyticsDashboard;
    return payload && typeof payload === 'object' ? (payload as AnalyticsDashboardPayload) : null;
  } catch {
    return null;
  }
};

const resolveLanguage = (): 'EN' | 'FR' | 'NL' => {
  try {
    const nav = (typeof navigator !== 'undefined' ? navigator.language : 'en').toLowerCase();
    if (nav.startsWith('fr')) return 'FR';
    if (nav.startsWith('nl')) return 'NL';
  } catch {
    // ignore
  }
  return 'EN';
};

const resolveTodayIso = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const resolvePipelineDateInputId = (dashboardPipelineId: string): string => `pipeline-date-${dashboardPipelineId}`;
const PIPELINE_NOTICE_VISIBLE_MS = 3000;

const readPipelineDateInputValue = (dashboardPipelineId: string): string => {
  if (typeof document === 'undefined') return '';
  const input = document.getElementById(resolvePipelineDateInputId(dashboardPipelineId));
  if (!(input instanceof HTMLInputElement)) return '';
  return (input.value || '').toString().trim();
};

const scheduleTopLevelNavigation = (targetUrl: string): void => {
  const navigate = () => navigateToTopLevel(targetUrl);
  try {
    if (typeof globalThis.requestAnimationFrame === 'function') {
      globalThis.requestAnimationFrame(() => {
        globalThis.requestAnimationFrame(navigate);
      });
      return;
    }
  } catch {
    // ignore
  }
  try {
    globalThis.setTimeout(navigate, 0);
  } catch {
    navigate();
  }
};

const AnalyticsPage: React.FC = () => {
  const language = useMemo(() => resolveLanguage(), []);
  const adminEnabled = useMemo(() => resolveAdminEnabled(), []);
  const serviceUrl = useMemo(() => resolveServiceUrl(), []);
  const todayIso = useMemo(() => resolveTodayIso(), []);
  const bootstrappedPayload = useMemo(() => readBootstrappedAnalyticsDashboard(), []);
  const [loading, setLoading] = useState(() => !bootstrappedPayload);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<AnalyticsDashboardPayload | null>(() => bootstrappedPayload);
  const [pendingNavigation, setPendingNavigation] = useState(false);
  const [pendingPipelineIds, setPendingPipelineIds] = useState<Record<string, boolean>>({});
  const [pipelineDates, setPipelineDates] = useState<Record<string, string>>({});
  const [pipelineErrors, setPipelineErrors] = useState<Record<string, string>>({});
  const [pipelineNotices, setPipelineNotices] = useState<Record<string, string>>({});
  const [focusedPipelineId, setFocusedPipelineId] = useState<string | null>(null);
  const pendingPipelineIdsRef = useRef<Set<string>>(new Set());
  const pointerSubmittedPipelineIdRef = useRef<string | null>(null);
  const pipelineNoticeTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const clearPipelineNoticeTimer = (dashboardPipelineId: string): void => {
    const timer = pipelineNoticeTimersRef.current[dashboardPipelineId];
    if (!timer) return;
    clearTimeout(timer);
    delete pipelineNoticeTimersRef.current[dashboardPipelineId];
  };

  const showPipelineNotice = (dashboardPipelineId: string, notice: string): void => {
    clearPipelineNoticeTimer(dashboardPipelineId);
    setPipelineNotices(prev => ({ ...prev, [dashboardPipelineId]: notice }));
    pipelineNoticeTimersRef.current[dashboardPipelineId] = setTimeout(() => {
      delete pipelineNoticeTimersRef.current[dashboardPipelineId];
      setPipelineNotices(prev => {
        if (!prev[dashboardPipelineId]) return prev;
        const next = { ...prev };
        delete next[dashboardPipelineId];
        return next;
      });
    }, PIPELINE_NOTICE_VISIBLE_MS);
  };

  useEffect(() => {
    if (bootstrappedPayload) {
      setPayload(bootstrappedPayload);
      setError(null);
      setLoading(false);
      logEvent('dashboard.bootstrap.used', {
        sectionCount: Array.isArray(bootstrappedPayload.sections) ? bootstrappedPayload.sections.length : 0,
        pipelineCount: Array.isArray(bootstrappedPayload.pipelines) ? bootstrappedPayload.pipelines.length : 0,
        errorCount: Array.isArray(bootstrappedPayload.errors) ? bootstrappedPayload.errors.length : 0
      });
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    logEvent('dashboard.fetch.start', { adminEnabled });
    fetchAnalyticsDashboardApi()
      .then(res => {
        if (cancelled) return;
        startTransition(() => setPayload(res));
        logEvent('dashboard.fetch.success', {
          sectionCount: Array.isArray(res?.sections) ? res.sections.length : 0,
          pipelineCount: Array.isArray(res?.pipelines) ? res.pipelines.length : 0,
          errorCount: Array.isArray(res?.errors) ? res.errors.length : 0
        });
      })
      .catch((err: any) => {
        if (cancelled) return;
        const message = (err?.message || err?.toString?.() || 'Failed to load analytics dashboard.').toString();
        setError(message);
        logEvent('dashboard.fetch.error', { message });
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [adminEnabled, bootstrappedPayload]);

  useEffect(() => {
    return () => {
      Object.values(pipelineNoticeTimersRef.current).forEach(timer => clearTimeout(timer));
      pipelineNoticeTimersRef.current = {};
    };
  }, []);

  const backUrl = useMemo(() => buildLandingUrl(serviceUrl, adminEnabled), [adminEnabled, serviceUrl]);
  const updatedAt = (payload?.updatedAt || '').toString().trim();
  const sections = Array.isArray(payload?.sections) ? payload.sections : [];
  const pipelines = Array.isArray(payload?.pipelines) ? payload.pipelines : [];
  const envTag = (payload?.envTag || '').toString().trim();
  const errors = Array.isArray(payload?.errors) ? payload.errors : [];

  const submitPipeline = async (pipeline: AnalyticsDashboardPipeline): Promise<void> => {
    const dashboardPipelineId = pipeline.dashboardPipelineId;
    if (pendingPipelineIdsRef.current.has(dashboardPipelineId)) return;
    const startDate =
      (pipelineDates[dashboardPipelineId] || '').toString().trim() ||
      readPipelineDateInputValue(dashboardPipelineId);
    if (!startDate) {
      setPipelineErrors(prev => ({ ...prev, [dashboardPipelineId]: 'Select a date.' }));
      return;
    }
    if (startDate > todayIso) {
      setPipelineErrors(prev => ({ ...prev, [dashboardPipelineId]: 'The selected date must be today or earlier.' }));
      return;
    }
    pendingPipelineIdsRef.current.add(dashboardPipelineId);
    setPendingPipelineIds(prev => ({ ...prev, [dashboardPipelineId]: true }));
    setPipelineErrors(prev => ({ ...prev, [dashboardPipelineId]: '' }));
    try {
      const result = await queueAnalyticsPipelineRunApi({
        ownerFormKey: pipeline.ownerFormKey,
        pipelineId: pipeline.pipelineId,
        startDate
      });
      const notice = (result?.message || pipeline.queuedNotice || '').toString().trim();
      if (notice) {
        showPipelineNotice(dashboardPipelineId, notice);
      } else {
        clearPipelineNoticeTimer(dashboardPipelineId);
        setPipelineNotices(prev => {
          const next = { ...prev };
          delete next[dashboardPipelineId];
          return next;
        });
      }
      setPipelineDates(prev => ({ ...prev, [dashboardPipelineId]: '' }));
      logEvent('dashboard.pipeline.queue.success', {
        ownerFormKey: pipeline.ownerFormKey,
        pipelineId: pipeline.pipelineId,
        startDate
      });
    } catch (err: any) {
      const message = (err?.message || err?.toString?.() || 'Failed to send report request.').toString();
      setPipelineErrors(prev => ({ ...prev, [dashboardPipelineId]: message }));
      logEvent('dashboard.pipeline.queue.error', {
        ownerFormKey: pipeline.ownerFormKey,
        pipelineId: pipeline.pipelineId,
        message
      });
    } finally {
      pendingPipelineIdsRef.current.delete(dashboardPipelineId);
      setPendingPipelineIds(prev => {
        const next = { ...prev };
        delete next[dashboardPipelineId];
        return next;
      });
    }
  };

  const handlePipelineSubmitPointerDown = (pipeline: AnalyticsDashboardPipeline): void => {
    if (typeof document === 'undefined') return;
    const activeElement = document.activeElement;
    const inputId = resolvePipelineDateInputId(pipeline.dashboardPipelineId);
    if (!(activeElement instanceof HTMLInputElement) || activeElement.id !== inputId) return;

    pointerSubmittedPipelineIdRef.current = pipeline.dashboardPipelineId;
    activeElement.blur();
    void submitPipeline(pipeline);
  };

  const handlePipelineSubmitClick = (pipeline: AnalyticsDashboardPipeline): void => {
    if (pointerSubmittedPipelineIdRef.current === pipeline.dashboardPipelineId) {
      pointerSubmittedPipelineIdRef.current = null;
      return;
    }
    void submitPipeline(pipeline);
  };

  return (
    <div className="ck-analytics-page page">
      <style>{ANALYTICS_PAGE_STYLES}</style>
      <BlockingOverlay
        open={pendingNavigation}
        title={ANALYTICS_PAGE_CONFIG.copy.pendingNavigationTitle}
        message={ANALYTICS_PAGE_CONFIG.copy.pendingNavigationMessage}
      />
      <div className="ck-analytics-shell">
        <header className="ck-analytics-header">
          <div className="ck-analytics-header-slot ck-analytics-header-slot--start">
            <a
              href={backUrl}
              target="_top"
              className="ck-analytics-back"
              onClick={event => {
                event.preventDefault();
                logEvent('dashboard.back.navigate', { backUrl });
                setPendingNavigation(true);
                scheduleTopLevelNavigation(backUrl);
              }}
            >
              {ANALYTICS_PAGE_CONFIG.copy.backToLandingLabel}
            </a>
          </div>
          <div className="ck-analytics-header-slot ck-analytics-header-slot--center">
            <h1 className="ck-analytics-header-title">{payload?.pageTitle || ANALYTICS_PAGE_CONFIG.pageTitle}</h1>
          </div>
          <div className="ck-analytics-header-slot ck-analytics-header-slot--end">
            {envTag ? (
              <span className="ck-analytics-pill" role="status" aria-label={`Environment: ${envTag}`}>
                {envTag}
              </span>
            ) : null}
          </div>
        </header>

        <section className="ck-analytics-hero">
          {(payload?.pageDescription || ANALYTICS_PAGE_CONFIG.pageDescription) ? (
            <p className="ck-analytics-description">{payload?.pageDescription || ANALYTICS_PAGE_CONFIG.pageDescription}</p>
          ) : null}
          {updatedAt ? <p className="ck-analytics-updated">Updated: {updatedAt}</p> : null}
          {loading ? <p className="ck-analytics-loading">{ANALYTICS_PAGE_CONFIG.copy.loadingLabel}</p> : null}
          {error ? (
            <p className="ck-analytics-error" role="alert">
              {error}
            </p>
          ) : null}
          {!error && errors.length ? (
            <div className="ck-analytics-errors">
              {errors.map(entry => (
                <p key={entry} className="ck-analytics-error" role="alert">
                  {entry}
                </p>
              ))}
            </div>
          ) : null}
        </section>

        {!loading && !error && !sections.length && !pipelines.length ? (
          <p className="ck-analytics-empty">{ANALYTICS_PAGE_CONFIG.copy.emptyLabel}</p>
        ) : null}

        {pipelines.length ? (
          <section className="ck-analytics-section">
            <div
              className={`ck-analytics-pipeline-grid${pipelines.length === 1 ? ' ck-analytics-pipeline-grid--single' : ''}`}
            >
              {pipelines.map(pipeline => {
                const pending = Boolean(pendingPipelineIds[pipeline.dashboardPipelineId]);
                const pipelineDateValue = pipelineDates[pipeline.dashboardPipelineId] || '';
                const showFormattedPipelineDate = Boolean(
                  pipelineDateValue && focusedPipelineId !== pipeline.dashboardPipelineId
                );
                const pipelineDateDisplay = showFormattedPipelineDate
                  ? formatDateEeeDdMmmYyyy(pipelineDateValue, 'EN')
                  : '';
                return (
                  <article key={pipeline.dashboardPipelineId} className="ck-analytics-pipeline-card">
                    <div className="ck-analytics-card-meta">
                      <h3 className="ck-analytics-card-title">{pipeline.title}</h3>
                    </div>
                    {pipeline.description ? <p className="ck-analytics-card-description">{pipeline.description}</p> : null}
                    <div className="ck-analytics-pipeline-form">
                      <div className="ck-analytics-field">
                        <label
                          className="ck-analytics-field-label"
                          htmlFor={resolvePipelineDateInputId(pipeline.dashboardPipelineId)}
                        >
                          {pipeline.dateLabel || 'Date'}
                        </label>
                        <div className="ck-analytics-date-action-row">
                          <div className="ck-analytics-date-field">
                            <input
                              id={resolvePipelineDateInputId(pipeline.dashboardPipelineId)}
                              className={`ck-analytics-date-input${showFormattedPipelineDate ? ' ck-analytics-date-input--display' : ''}`}
                              type="date"
                              max={todayIso}
                              value={pipelineDateValue}
                              onFocus={() => setFocusedPipelineId(pipeline.dashboardPipelineId)}
                              onBlur={() =>
                                setFocusedPipelineId(current =>
                                  current === pipeline.dashboardPipelineId ? null : current
                                )
                              }
                              onChange={event => {
                                const value = event.currentTarget.value;
                                setPipelineDates(prev => ({ ...prev, [pipeline.dashboardPipelineId]: value }));
                                if (pipelineErrors[pipeline.dashboardPipelineId]) {
                                  setPipelineErrors(prev => ({ ...prev, [pipeline.dashboardPipelineId]: '' }));
                                }
                              }}
                            />
                            {pipelineDateDisplay ? (
                              <div className="ck-analytics-date-overlay" aria-hidden="true">
                                {pipelineDateDisplay}
                              </div>
                            ) : null}
                          </div>
                          <button
                            type="button"
                            className="ck-analytics-submit"
                            disabled={pending}
                            onPointerDown={() => handlePipelineSubmitPointerDown(pipeline)}
                            onClick={() => handlePipelineSubmitClick(pipeline)}
                          >
                            {pending ? pipeline.pendingLabel || 'Sending...' : pipeline.submitLabel || 'Send report'}
                          </button>
                        </div>
                        {pipeline.dateHelperText ? (
                          <p className="ck-analytics-pipeline-helper">{pipeline.dateHelperText}</p>
                        ) : null}
                      </div>
                      {pipelineErrors[pipeline.dashboardPipelineId] ? (
                        <p className="ck-analytics-error" role="alert">
                          {pipelineErrors[pipeline.dashboardPipelineId]}
                        </p>
                      ) : null}
                      {pipelineNotices[pipeline.dashboardPipelineId] ? (
                        <p className="ck-analytics-notice" role="status">
                          {pipelineNotices[pipeline.dashboardPipelineId]}
                        </p>
                      ) : null}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ) : null}

        {sections.map(section => (
          <section key={section.id} className="ck-analytics-section">
            <div className="ck-analytics-section-head">
              <h2 className="ck-analytics-section-title">{section.title}</h2>
              {section.description ? <p className="ck-analytics-section-description">{section.description}</p> : null}
            </div>
            <div className="ck-analytics-grid">
              {section.widgets.map(widget => (
                <article key={widget.dashboardWidgetId} className="ck-analytics-card">
                  <div className="ck-analytics-card-meta">
                    <h3 className="ck-analytics-card-title">{widget.title}</h3>
                    <p className="ck-analytics-card-source">{widget.sourceFormTitle}</p>
                  </div>
                  <p className="ck-analytics-card-value">{formatAnalyticsValue(widget, language) || '-'}</p>
                  {widget.description ? <p className="ck-analytics-card-description">{widget.description}</p> : null}
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
};

const mount = () => {
  const rootEl = document.getElementById('react-prototype-root');
  if (!rootEl) return;
  const root = createRoot(rootEl);
  root.render(<AnalyticsPage />);
};

if (typeof document !== 'undefined') {
  mount();
}

export default AnalyticsPage;
