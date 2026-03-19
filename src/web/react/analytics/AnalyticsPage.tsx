import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { AnalyticsSnapshotItem, LangCode } from '../../types';
import { fetchBootstrapContextApi } from '../api';
import { AnalyticsPanel } from '../components/app/AnalyticsOverlay';

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

const resolveLanguage = (): LangCode => {
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

const AnalyticsPage: React.FC = () => {
  const formKey = useMemo(() => resolveFormKey(), []);
  const adminEnabled = useMemo(() => resolveAdminEnabled(), []);
  const language = useMemo(() => resolveLanguage(), []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState<string>('Analytics');
  const [items, setItems] = useState<AnalyticsSnapshotItem[]>([]);
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
        setItems(Array.isArray(snapshot?.items) ? (snapshot.items as AnalyticsSnapshotItem[]) : []);
        const ts = (snapshot?.updatedAt || '').toString().trim();
        setUpdatedAt(ts);
        logEvent('bootstrap.fetch.success', {
          formKey,
          itemCount: Array.isArray(snapshot?.items) ? snapshot.items.length : 0,
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
        <AnalyticsPanel language={language} items={items} loading={loading} error={error} updatedAt={updatedAt} />
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
