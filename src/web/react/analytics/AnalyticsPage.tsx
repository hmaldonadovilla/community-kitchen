import React, { startTransition, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ANALYTICS_PAGE_CONFIG } from '../../../config/analyticsPage';
import type { AnalyticsDashboardPayload, AnalyticsDashboardPipeline } from '../../../config/analyticsPageTypes';
import { buildLandingUrl, navigateToTopLevel, resolveAdminEnabled, resolveServiceUrl } from '../app/headerNavigation';
import { fetchAnalyticsDashboardApi, queueAnalyticsPipelineRunApi } from '../api';
import { BlockingOverlay } from '../features/overlays/BlockingOverlay';
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
    font-size: clamp(28px, calc(var(--ck-font-group-title) * 1.5), 38px);
    line-height: 1.06;
    font-weight: 600;
    letter-spacing: -0.03em;
  }
  .ck-analytics-pill {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    padding: 0 14px;
    border-radius: 999px;
    border: 1px solid rgba(107, 117, 128, 0.28);
    background: transparent;
    color: var(--text);
    font-size: var(--ck-font-label);
    font-weight: 500;
    line-height: 1;
  }
  .ck-analytics-back {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 44px;
    padding: 0 16px;
    border-radius: 16px;
    border: 1px solid rgba(107, 117, 128, 0.28);
    background: transparent;
    color: var(--text);
    text-decoration: none;
    font-size: var(--ck-font-label);
    font-weight: 600;
    line-height: 1;
  }
  .ck-analytics-hero {
    display: grid;
    gap: 8px;
  }
  .ck-analytics-description,
  .ck-analytics-updated,
  .ck-analytics-empty,
  .ck-analytics-loading {
    margin: 0;
    color: var(--muted);
    font-size: var(--ck-font-label);
    line-height: 1.45;
  }
  .ck-analytics-errors {
    display: grid;
    gap: 8px;
  }
  .ck-analytics-error {
    margin: 0;
    color: var(--danger);
    font-size: var(--ck-font-label);
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
    font-size: clamp(24px, calc(var(--ck-font-group-title) * 0.88), 32px);
    line-height: 1.08;
    font-weight: 600;
    letter-spacing: -0.02em;
  }
  .ck-analytics-section-description {
    margin: 0;
    color: var(--muted);
    font-size: var(--ck-font-label);
    line-height: 1.45;
  }
  .ck-analytics-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 16px;
  }
  .ck-analytics-card {
    border-radius: 24px;
    border: 1px solid rgba(107, 117, 128, 0.22);
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
    font-size: calc(var(--ck-font-label) * 0.92);
    line-height: 1.35;
  }
  .ck-analytics-card-title {
    margin: 0;
    font-size: clamp(22px, calc(var(--ck-font-group-title) * 1.05), 28px);
    line-height: 1.18;
    font-weight: 600;
    letter-spacing: -0.02em;
  }
  .ck-analytics-card-value {
    margin: 0;
    font-size: clamp(36px, calc(var(--ck-font-group-title) * 1.08), 52px);
    line-height: 1;
    font-weight: 600;
    letter-spacing: -0.04em;
    word-break: break-word;
  }
  .ck-analytics-card-description {
    margin: 0;
    color: var(--muted);
    font-size: calc(var(--ck-font-label) * 0.95);
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
    border-radius: 24px;
    border: 1px solid rgba(107, 117, 128, 0.22);
    background: rgba(255, 255, 255, 0.94);
    padding: 22px;
    display: grid;
    gap: 16px;
    min-height: 220px;
  }
  .ck-analytics-pipeline-form {
    display: grid;
    gap: 14px;
  }
  .ck-analytics-field {
    display: grid;
    gap: 8px;
  }
  .ck-analytics-field-label,
  .ck-analytics-notice,
  .ck-analytics-pipeline-helper {
    font-size: var(--ck-font-label);
    line-height: 1.45;
  }
  .ck-analytics-field-label {
    color: var(--text);
    font-weight: 600;
  }
  .ck-analytics-pipeline-helper,
  .ck-analytics-notice {
    margin: 0;
    color: var(--muted);
  }
  .ck-analytics-date-input {
    min-height: 46px;
    border-radius: 16px;
    border: 1px solid rgba(107, 117, 128, 0.28);
    background: #fff;
    color: var(--text);
    padding: 0 14px;
    font-size: var(--ck-font-label);
    font-family: inherit;
  }
  .ck-analytics-submit {
    min-height: 48px;
    border: 0;
    border-radius: 16px;
    background: rgba(11, 87, 208, 0.96);
    color: #fff;
    font-size: var(--ck-font-label);
    font-family: inherit;
    font-weight: 600;
    padding: 0 18px;
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
  @media (max-width: 760px) {
    .ck-analytics-header {
      grid-template-columns: 1fr;
      justify-items: stretch;
    }
    .ck-analytics-header-slot {
      justify-content: center;
    }
    .ck-analytics-header-slot--start {
      justify-content: flex-start;
    }
    .ck-analytics-header-slot--end {
      justify-content: center;
    }
    .ck-analytics-grid {
      grid-template-columns: minmax(0, 1fr);
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<AnalyticsDashboardPayload | null>(null);
  const [pendingNavigation, setPendingNavigation] = useState(false);
  const [pendingPipelineId, setPendingPipelineId] = useState<string | null>(null);
  const [pipelineDates, setPipelineDates] = useState<Record<string, string>>({});
  const [pipelineErrors, setPipelineErrors] = useState<Record<string, string>>({});
  const [pipelineNotices, setPipelineNotices] = useState<Record<string, string>>({});

  useEffect(() => {
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
  }, [adminEnabled]);

  const backUrl = useMemo(() => buildLandingUrl(serviceUrl, adminEnabled), [adminEnabled, serviceUrl]);
  const updatedAt = (payload?.updatedAt || '').toString().trim();
  const sections = Array.isArray(payload?.sections) ? payload.sections : [];
  const pipelines = Array.isArray(payload?.pipelines) ? payload.pipelines : [];
  const envTag = (payload?.envTag || '').toString().trim();
  const errors = Array.isArray(payload?.errors) ? payload.errors : [];

  const submitPipeline = async (pipeline: AnalyticsDashboardPipeline): Promise<void> => {
    const startDate = (pipelineDates[pipeline.dashboardPipelineId] || '').toString().trim();
    if (!startDate) {
      setPipelineErrors(prev => ({ ...prev, [pipeline.dashboardPipelineId]: 'Select a date.' }));
      return;
    }
    if (startDate > todayIso) {
      setPipelineErrors(prev => ({ ...prev, [pipeline.dashboardPipelineId]: 'The selected date must be today or earlier.' }));
      return;
    }
    setPendingPipelineId(pipeline.dashboardPipelineId);
    setPipelineErrors(prev => ({ ...prev, [pipeline.dashboardPipelineId]: '' }));
    try {
      const result = await queueAnalyticsPipelineRunApi({
        ownerFormKey: pipeline.ownerFormKey,
        pipelineId: pipeline.pipelineId,
        startDate
      });
      const notice = (result?.message || pipeline.queuedNotice || '').toString().trim();
      setPipelineNotices(prev => ({ ...prev, [pipeline.dashboardPipelineId]: notice }));
      logEvent('dashboard.pipeline.queue.success', {
        ownerFormKey: pipeline.ownerFormKey,
        pipelineId: pipeline.pipelineId,
        startDate
      });
    } catch (err: any) {
      const message = (err?.message || err?.toString?.() || 'Failed to queue analytics pipeline.').toString();
      setPipelineErrors(prev => ({ ...prev, [pipeline.dashboardPipelineId]: message }));
      logEvent('dashboard.pipeline.queue.error', {
        ownerFormKey: pipeline.ownerFormKey,
        pipelineId: pipeline.pipelineId,
        message
      });
    } finally {
      setPendingPipelineId(null);
    }
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
            <div className="ck-analytics-section-head">
              <h2 className="ck-analytics-section-title">Exports</h2>
              <p className="ck-analytics-section-description">
                Queue spreadsheet exports and receive the results by email.
              </p>
            </div>
            <div
              className={`ck-analytics-pipeline-grid${pipelines.length === 1 ? ' ck-analytics-pipeline-grid--single' : ''}`}
            >
              {pipelines.map(pipeline => {
                const pending = pendingPipelineId === pipeline.dashboardPipelineId;
                return (
                  <article key={pipeline.dashboardPipelineId} className="ck-analytics-pipeline-card">
                    <div className="ck-analytics-card-meta">
                      <p className="ck-analytics-card-source">{pipeline.sourceFormTitle}</p>
                      <h3 className="ck-analytics-card-title">{pipeline.title}</h3>
                    </div>
                    {pipeline.description ? <p className="ck-analytics-card-description">{pipeline.description}</p> : null}
                    <div className="ck-analytics-pipeline-form">
                      <div className="ck-analytics-field">
                        <label className="ck-analytics-field-label" htmlFor={`pipeline-date-${pipeline.dashboardPipelineId}`}>
                          {pipeline.dateLabel || 'Start date'}
                        </label>
                        <input
                          id={`pipeline-date-${pipeline.dashboardPipelineId}`}
                          className="ck-analytics-date-input"
                          type="date"
                          max={todayIso}
                          value={pipelineDates[pipeline.dashboardPipelineId] || ''}
                          onChange={event => {
                            const value = event.currentTarget.value;
                            setPipelineDates(prev => ({ ...prev, [pipeline.dashboardPipelineId]: value }));
                            if (pipelineErrors[pipeline.dashboardPipelineId]) {
                              setPipelineErrors(prev => ({ ...prev, [pipeline.dashboardPipelineId]: '' }));
                            }
                          }}
                        />
                        {pipeline.dateHelperText ? (
                          <p className="ck-analytics-pipeline-helper">{pipeline.dateHelperText}</p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        className="ck-analytics-submit"
                        disabled={pending}
                        onClick={() => {
                          void submitPipeline(pipeline);
                        }}
                      >
                        {pending ? pipeline.pendingLabel || 'Queueing...' : pipeline.submitLabel || 'Send report'}
                      </button>
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
                    <p className="ck-analytics-card-source">{widget.sourceFormTitle}</p>
                    <h3 className="ck-analytics-card-title">{widget.title}</h3>
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
