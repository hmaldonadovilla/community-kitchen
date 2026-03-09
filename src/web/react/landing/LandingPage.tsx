import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { fetchFormCatalogApi, FormCatalogItem } from '../api';

const isTruthyParam = (raw: any): boolean => {
  if (raw === undefined || raw === null) return false;
  const token = raw.toString().trim().toLowerCase();
  if (!token) return false;
  return token === '1' || token === 'true' || token === 'yes' || token === 'on';
};

const resolveAdminEnabled = (): boolean => {
  try {
    const globalAny = globalThis as any;
    const params = (globalAny?.__WEB_FORM_REQUEST_PARAMS__ || {}) as Record<string, any>;
    if (Object.prototype.hasOwnProperty.call(params, 'admin-true')) return true;
    if (isTruthyParam(params.admin)) return true;
  } catch (_) {
    // ignore
  }
  try {
    const search = typeof location !== 'undefined' ? location.search : '';
    const qs = new URLSearchParams(search || '');
    if (qs.has('admin-true')) return true;
    if (isTruthyParam(qs.get('admin'))) return true;
  } catch (_) {
    // ignore
  }
  return false;
};

const appendAdminQuery = (targetUrl: string, adminEnabled: boolean): string => {
  if (!adminEnabled) return targetUrl;
  const raw = (targetUrl || '').toString().trim();
  if (!raw) return '?admin=true';
  const hashIndex = raw.indexOf('#');
  const hash = hashIndex >= 0 ? raw.slice(hashIndex) : '';
  const base = hashIndex >= 0 ? raw.slice(0, hashIndex) : raw;
  const sep = base.includes('?') ? '&' : '?';
  if (/[?&]admin=/.test(base)) return `${base}${hash}`;
  return `${base}${sep}admin=true${hash}`;
};

const logEvent = (event: string, payload?: Record<string, unknown>): void => {
  if (typeof console === 'undefined' || typeof console.info !== 'function') return;
  try {
    console.info('[ReactForm][Landing]', event, payload || {});
  } catch (_) {
    // ignore
  }
};

const LandingPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<FormCatalogItem[]>([]);
  const adminEnabled = useMemo(() => resolveAdminEnabled(), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    logEvent('catalog.fetch.start', { adminEnabled });
    fetchFormCatalogApi()
      .then(response => {
        if (cancelled) return;
        const list = Array.isArray(response) ? response : [];
        setItems(list);
        logEvent('catalog.fetch.success', { count: list.length });
      })
      .catch((err: any) => {
        if (cancelled) return;
        const message = (err?.message || err?.toString?.() || 'Failed to load forms.').toString();
        setError(message);
        logEvent('catalog.fetch.error', { message });
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [adminEnabled]);

  return (
    <div className="page">
      <main className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h1 style={{ margin: 0 }}>Forms</h1>
        <p className="muted" style={{ margin: 0 }}>
          Select a form.
        </p>
        {adminEnabled ? (
          <p className="muted" style={{ margin: 0 }}>
            Admin mode is active.
          </p>
        ) : null}
        {loading ? <p className="muted">Loading forms...</p> : null}
        {error ? (
          <p role="alert" style={{ color: 'var(--danger)', margin: 0 }}>
            {error}
          </p>
        ) : null}
        {!loading && !error && !items.length ? <p className="muted">No forms were found.</p> : null}
        {!loading && !error && items.length ? (
          <div style={{ display: 'grid', gap: 10 }}>
            {items.map(item => (
              <a
                key={item.formKey}
                href={appendAdminQuery(item.targetUrl || `?form=${encodeURIComponent(item.formKey)}`, adminEnabled)}
                className="card"
                style={{ textDecoration: 'none', color: 'var(--text)', display: 'block' }}
              >
                <div style={{ fontWeight: 600 }}>{item.title}</div>
                {item.description ? (
                  <div className="muted" style={{ marginTop: 4 }}>
                    {item.description}
                  </div>
                ) : null}
              </a>
            ))}
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
  root.render(<LandingPage />);
};

if (typeof document !== 'undefined') {
  mount();
}

export default LandingPage;

