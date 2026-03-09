import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { resolveLocalizedString } from '../../i18n';
import { fetchBootstrapContextApi } from '../api';

type WidgetItem = {
  id: string;
  label?: any;
  value?: any;
  valueNumber?: number;
  valueText?: string;
  placements?: string[];
  updatedAt?: string;
};

const logEvent = (event: string, payload?: Record<string, unknown>): void => {
  if (typeof console === 'undefined' || typeof console.info !== 'function') return;
  try {
    console.info('[ReactForm][Analytics]', event, payload || {});
  } catch (_) {
    // ignore
  }
};

const isTruthyParam = (raw: any): boolean => {
  if (raw === undefined || raw === null) return false;
  const token = raw.toString().trim().toLowerCase();
  if (!token) return false;
  return token === '1' || token === 'true' || token === 'yes' || token === 'on';
};

const resolveLanguage = (): 'EN' | 'FR' | 'NL' => {
  try {
    const nav = (typeof navigator !== 'undefined' ? navigator.language : 'en').toLowerCase();
    if (nav.startsWith('fr')) return 'FR';
    if (nav.startsWith('nl')) return 'NL';
  } catch (_) {
    // ignore
  }
  return 'EN';
};

const resolveAdminEnabled = (): boolean => {
  try {
    const params = (((globalThis as any)?.__WEB_FORM_REQUEST_PARAMS__ || {}) as Record<string, any>) || {};
    if (Object.prototype.hasOwnProperty.call(params, 'admin-true')) return true;
    if (isTruthyParam(params.admin)) return true;
  } catch (_) {
    // ignore
  }
  try {
    const qs = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
    if (qs.has('admin-true')) return true;
    if (isTruthyParam(qs.get('admin'))) return true;
  } catch (_) {
    // ignore
  }
  return false;
};

const resolveFormKey = (): string => {
  try {
    const key = (((globalThis as any)?.__WEB_FORM_KEY__ ?? '') || '').toString().trim();
    if (key) return key;
  } catch (_) {
    // ignore
  }
  try {
    const qs = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
    return (qs.get('form') || '').toString().trim();
  } catch (_) {
    return '';
  }
};

const withAdmin = (url: string, enabled: boolean): string => {
  if (!enabled) return url;
  if (/[?&]admin=/.test(url)) return url;
  const sep = url.includes('?') ? '&' : '?';
  return `${url}${sep}admin=true`;
};

const formatWidgetValue = (item: WidgetItem, language: 'EN' | 'FR' | 'NL'): string => {
  const existing = (item.valueText || '').toString().trim();
  if (existing) return existing;
  const locale = language === 'FR' ? 'fr-BE' : language === 'NL' ? 'nl-BE' : 'en-US';
  if (typeof item.valueNumber === 'number' && Number.isFinite(item.valueNumber)) {
    return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(item.valueNumber);
  }
  if (typeof item.value === 'number' && Number.isFinite(item.value)) {
    return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(item.value);
  }
  if (typeof item.value === 'string') return item.value;
  if (item.value === undefined || item.value === null) return '';
  try {
    return JSON.stringify(item.value);
  } catch (_) {
    return `${item.value}`;
  }
};

const AnalyticsPage: React.FC = () => {
  const formKey = useMemo(() => resolveFormKey(), []);
  const adminEnabled = useMemo(() => resolveAdminEnabled(), []);
  const language = useMemo(() => resolveLanguage(), []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState<string>('Analytics');
  const [widgets, setWidgets] = useState<WidgetItem[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    if (!formKey) {
      setLoading(false);
      setError('Missing form key.');
      logEvent('bootstrap.missingFormKey');
      return;
    }
    setLoading(true);
    setError(null);
    logEvent('bootstrap.fetch.start', { formKey, adminEnabled });
    fetchBootstrapContextApi(formKey)
      .then(res => {
        if (cancelled) return;
        const definition = (res as any)?.definition || null;
        const snapshot = (res as any)?.analytics || null;
        setTitle((definition?.title || formKey || 'Analytics').toString());
        const items = Array.isArray(snapshot?.items) ? (snapshot.items as WidgetItem[]) : [];
        const pageWidgets = items.filter(entry => {
          const placements = Array.isArray(entry.placements) ? entry.placements : [];
          return placements.some(token => (token || '').toString().trim() === 'analyticsPage');
        });
        setWidgets(pageWidgets);
        const ts = (snapshot?.updatedAt || '').toString().trim();
        setUpdatedAt(ts);
        logEvent('bootstrap.fetch.success', {
          formKey,
          widgetCount: pageWidgets.length,
          updatedAt: ts || null
        });
      })
      .catch((err: any) => {
        if (cancelled) return;
        const message = (err?.message || err?.toString?.() || 'Failed to load analytics.').toString();
        setError(message);
        logEvent('bootstrap.fetch.error', { formKey, message });
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [formKey]);

  const backUrl = withAdmin(`?form=${encodeURIComponent(formKey)}`, adminEnabled);

  return (
    <div className="page">
      <main className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <h1 style={{ margin: 0 }}>{title}</h1>
          <a href={backUrl}>Back to app</a>
        </div>
        {updatedAt ? (
          <p className="muted" style={{ margin: 0 }}>
            Updated: {updatedAt}
          </p>
        ) : null}
        {loading ? <p className="muted">Loading analytics...</p> : null}
        {error ? (
          <p role="alert" style={{ color: 'var(--danger)', margin: 0 }}>
            {error}
          </p>
        ) : null}
        {!loading && !error && !widgets.length ? <p className="muted">No analytics widgets are configured.</p> : null}
        {!loading && !error && widgets.length ? (
          <div style={{ display: 'grid', gap: 10 }}>
            {widgets.map(item => {
              const label = resolveLocalizedString(item.label, language, item.id || '').trim() || item.id;
              const valueText = formatWidgetValue(item, language);
              return (
                <div key={item.id} className="card">
                  <div style={{ fontWeight: 600 }}>{label}</div>
                  <div style={{ marginTop: 6 }}>{valueText}</div>
                </div>
              );
            })}
          </div>
        ) : null}
      </main>
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
