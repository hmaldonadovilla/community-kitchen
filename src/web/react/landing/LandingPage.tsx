import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import packageJson from '../../../../package.json';
import { BUNDLED_FORM_CONFIGS } from '../../../config/bundledFormConfigs';
import { fetchFormCatalogApi, FormCatalogItem } from '../api';
import { AppHeader } from '../components/app/AppHeader';
import { BlockingOverlay } from '../features/overlays/BlockingOverlay';
import { appendAdminQuery, buildBundledLandingCatalog, isTruthyParam, pickLandingLogoUrl, resolveLandingHeaderTitle } from './model';

const BUILD_MARKER = `v${(packageJson as any).version || 'dev'}`;

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

const resolveEnvTag = (): string | null => {
  try {
    const globalAny = globalThis as any;
    const raw = globalAny?.__WEB_FORM_BOOTSTRAP__?.envTag ?? globalAny?.__CK_ENV_TAG__ ?? '';
    const trimmed = raw.toString().trim();
    return trimmed || null;
  } catch (_) {
    return null;
  }
};

const navigateToTopLevel = (targetUrl: string): void => {
  const resolved = (targetUrl || '').toString().trim();
  if (!resolved) return;
  try {
    if (typeof globalThis.open === 'function') {
      globalThis.open(resolved, '_top');
      return;
    }
  } catch (_) {
    // ignore
  }
  try {
    globalThis.location.assign(resolved);
    return;
  } catch (_) {
    // ignore
  }
  try {
    globalThis.location.href = resolved;
  } catch (_) {
    // ignore
  }
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
  const bundledItems = useMemo(() => buildBundledLandingCatalog(BUNDLED_FORM_CONFIGS as any), []);
  const [loading, setLoading] = useState(bundledItems.length === 0);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<FormCatalogItem[]>(() => bundledItems);
  const [isMobile, setIsMobile] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<{ targetUrl: string; title: string; message: string } | null>(null);
  const adminEnabled = useMemo(() => resolveAdminEnabled(), []);
  const envTag = useMemo(() => resolveEnvTag(), []);
  const headerTitle = useMemo(() => resolveLandingHeaderTitle(typeof document !== 'undefined' ? document.title : ''), []);
  const headerLogoUrl = useMemo(() => pickLandingLogoUrl(items), [items]);

  useEffect(() => {
    const apply = () => {
      try {
        const next = typeof globalThis.matchMedia === 'function'
          ? globalThis.matchMedia('(max-width: 720px)').matches
          : (globalThis.innerWidth || 0) <= 720;
        setIsMobile(Boolean(next));
      } catch (_) {
        setIsMobile(false);
      }
    };
    apply();
    globalThis.addEventListener?.('resize', apply);
    return () => globalThis.removeEventListener?.('resize', apply);
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!bundledItems.length) {
      setLoading(true);
    }
    setError(null);
    logEvent('catalog.fetch.start', { adminEnabled, bundledCount: bundledItems.length });
    fetchFormCatalogApi()
      .then(response => {
        if (cancelled) return;
        const list = Array.isArray(response) ? response : [];
        if (list.length) {
          setItems(list);
        }
        logEvent('catalog.fetch.success', { count: list.length, replacedBundled: list.length > 0 });
      })
      .catch((err: any) => {
        if (cancelled) return;
        const message = (err?.message || err?.toString?.() || 'Failed to load forms.').toString();
        if (!bundledItems.length) {
          setError(message);
        }
        logEvent('catalog.fetch.error', { message, usedBundledFallback: bundledItems.length > 0 });
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [adminEnabled, bundledItems]);

  const headerRight = useMemo(() => {
    if (!envTag) return null;
    return (
      <span className="ck-env-tag" role="status" aria-label={`Environment: ${envTag}`}>
        {envTag}
      </span>
    );
  }, [envTag]);

  return (
    <div className="page">
      <BlockingOverlay
        open={!!pendingNavigation}
        title={pendingNavigation?.title || 'Please wait'}
        message={pendingNavigation?.message || 'Opening the selected form...'}
      />
      <AppHeader
        title={headerTitle}
        titleRight={headerRight}
        logoUrl={headerLogoUrl}
        buildMarker={BUILD_MARKER}
        isMobile={isMobile}
        languages={['EN']}
        language="EN"
        onLanguageChange={() => undefined}
        onRefresh={() => globalThis.location.reload()}
        onDiagnostic={logEvent}
      />
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
            {items.map(item => {
              const targetUrl = appendAdminQuery(item.targetUrl || `?form=${encodeURIComponent(item.formKey)}`, adminEnabled);
              return (
                <a
                  key={item.formKey}
                  href={targetUrl}
                  target="_top"
                  className="card"
                  style={{ textDecoration: 'none', color: 'var(--text)', display: 'block' }}
                  onClick={event => {
                    event.preventDefault();
                    logEvent('catalog.navigate', { formKey: item.formKey, targetUrl });
                    setPendingNavigation({
                      targetUrl,
                      title: 'Please wait',
                      message: 'Opening the selected form...'
                    });
                    globalThis.requestAnimationFrame?.(() => {
                      globalThis.requestAnimationFrame?.(() => {
                        navigateToTopLevel(targetUrl);
                      });
                    });
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{item.title}</div>
                  {item.description ? (
                    <div className="muted" style={{ marginTop: 4 }}>
                      {item.description}
                    </div>
                  ) : null}
                </a>
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
  root.render(<LandingPage />);
};

if (typeof document !== 'undefined') {
  mount();
}

export default LandingPage;
