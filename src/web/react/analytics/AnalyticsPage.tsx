import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ANALYTICS_PAGE_CONFIG } from '../../../config/analyticsPage';
import type { AnalyticsDashboardPayload } from '../../../config/analyticsPageTypes';
import { buildLandingUrl, navigateToTopLevel, resolveAdminEnabled, resolveServiceUrl } from '../app/headerNavigation';
import { fetchAnalyticsDashboardApi } from '../api';
import { BlockingOverlay } from '../features/overlays/BlockingOverlay';
import { formatAnalyticsValue } from './model';

const ANALYTICS_PAGE_STYLES = `
  .ck-analytics-page.page {
    max-width: 1180px;
    gap: 24px;
  }
  .ck-analytics-shell {
    display: flex;
    flex-direction: column;
    gap: 24px;
  }
  .ck-analytics-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding-top: 6px;
  }
  .ck-analytics-brand {
    display: flex;
    align-items: center;
    gap: 16px;
    min-width: 0;
  }
  .ck-analytics-brand-mark {
    width: 72px;
    height: 72px;
    border-radius: 20px;
    border: 1px solid rgba(107, 117, 128, 0.24);
    background: rgba(11, 87, 208, 0.06);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    flex: 0 0 auto;
  }
  .ck-analytics-brand-mark img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    padding: 10px;
    display: block;
  }
  .ck-analytics-brand-fallback {
    font-size: calc(var(--ck-font-group-title) * 0.7);
    font-weight: 600;
    line-height: 1;
  }
  .ck-analytics-header-actions {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
    justify-content: flex-end;
  }
  .ck-analytics-pill {
    display: inline-flex;
    align-items: center;
    min-height: 44px;
    padding: 0 14px;
    border-radius: 999px;
    border: 1px solid rgba(107, 117, 128, 0.28);
    font-size: calc(var(--ck-font-label) * 0.48);
  }
  .ck-analytics-back {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 46px;
    padding: 0 18px;
    border-radius: 16px;
    border: 1px solid rgba(107, 117, 128, 0.28);
    background: transparent;
    color: var(--text);
    text-decoration: none;
    font-size: calc(var(--ck-font-label) * 0.48);
    font-weight: 500;
  }
  .ck-analytics-hero {
    display: grid;
    gap: 10px;
  }
  .ck-analytics-title {
    margin: 0;
    font-size: clamp(34px, calc(var(--ck-font-group-title) * 1.18), 50px);
    line-height: 1.02;
    font-weight: 600;
    letter-spacing: -0.03em;
  }
  .ck-analytics-description,
  .ck-analytics-updated,
  .ck-analytics-empty,
  .ck-analytics-loading {
    margin: 0;
    color: var(--muted);
    font-size: calc(var(--ck-font-label) * 0.5);
    line-height: 1.45;
  }
  .ck-analytics-errors {
    display: grid;
    gap: 8px;
  }
  .ck-analytics-error {
    margin: 0;
    color: var(--danger);
    font-size: calc(var(--ck-font-label) * 0.48);
    line-height: 1.45;
  }
  .ck-analytics-section {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .ck-analytics-section-head {
    display: grid;
    gap: 6px;
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
    font-size: calc(var(--ck-font-label) * 0.48);
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
    gap: 14px;
    min-height: 220px;
  }
  .ck-analytics-card-meta {
    display: grid;
    gap: 6px;
  }
  .ck-analytics-card-source {
    margin: 0;
    color: var(--muted);
    font-size: calc(var(--ck-font-label) * 0.42);
    line-height: 1.3;
  }
  .ck-analytics-card-title {
    margin: 0;
    font-size: clamp(21px, calc(var(--ck-font-group-title) * 0.72), 28px);
    line-height: 1.14;
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
    font-size: calc(var(--ck-font-label) * 0.46);
    line-height: 1.45;
  }
  @media (max-width: 980px) {
    .ck-analytics-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  @media (max-width: 760px) {
    .ck-analytics-header {
      flex-direction: column;
      align-items: stretch;
    }
    .ck-analytics-header-actions {
      justify-content: flex-start;
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

const AnalyticsBrandMark: React.FC<{ logoUrl?: string }> = ({ logoUrl }) => {
  const [failed, setFailed] = useState(false);
  if (logoUrl && !failed) {
    return (
      <span className="ck-analytics-brand-mark" aria-hidden="true">
        <img src={logoUrl} alt="" onError={() => setFailed(true)} />
      </span>
    );
  }
  return (
    <span className="ck-analytics-brand-mark" aria-hidden="true">
      <span className="ck-analytics-brand-fallback">A</span>
    </span>
  );
};

const AnalyticsPage: React.FC = () => {
  const language = useMemo(() => resolveLanguage(), []);
  const adminEnabled = useMemo(() => resolveAdminEnabled(), []);
  const serviceUrl = useMemo(() => resolveServiceUrl(), []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<AnalyticsDashboardPayload | null>(null);
  const [pendingNavigation, setPendingNavigation] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    logEvent('dashboard.fetch.start', { adminEnabled });
    fetchAnalyticsDashboardApi()
      .then(res => {
        if (cancelled) return;
        setPayload(res);
        logEvent('dashboard.fetch.success', {
          sectionCount: Array.isArray(res?.sections) ? res.sections.length : 0,
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
  const envTag = (payload?.envTag || '').toString().trim();
  const errors = Array.isArray(payload?.errors) ? payload.errors : [];

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
          <div className="ck-analytics-brand">
            <AnalyticsBrandMark logoUrl={ANALYTICS_PAGE_CONFIG.appHeader?.logoUrl} />
          </div>
          <div className="ck-analytics-header-actions">
            {envTag ? (
              <span className="ck-analytics-pill" role="status" aria-label={`Environment: ${envTag}`}>
                {envTag}
              </span>
            ) : null}
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
        </header>

        <section className="ck-analytics-hero">
          <h1 className="ck-analytics-title">{payload?.pageTitle || ANALYTICS_PAGE_CONFIG.pageTitle}</h1>
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

        {!loading && !error && !sections.length ? (
          <p className="ck-analytics-empty">{ANALYTICS_PAGE_CONFIG.copy.emptyLabel}</p>
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
