export const isTruthyParam = (raw: any): boolean => {
  if (raw === undefined || raw === null) return false;
  const token = raw.toString().trim().toLowerCase();
  if (!token) return false;
  return token === '1' || token === 'true' || token === 'yes' || token === 'on';
};

export const resolveServiceUrl = (): string => {
  try {
    const raw = ((globalThis as any)?.__CK_SERVICE_URL__ || '').toString().trim();
    return raw;
  } catch (_) {
    return '';
  }
};

export const resolveAdminEnabled = (requestParams?: Record<string, any>): boolean => {
  try {
    const params = requestParams || (((globalThis as any)?.__WEB_FORM_REQUEST_PARAMS__ || {}) as Record<string, any>);
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

const buildUrl = (serviceUrl: string, params: Record<string, string>): string => {
  let base = (serviceUrl || '').toString().trim();
  if (!base) {
    try {
      const currentHref = typeof location !== 'undefined' ? location.href : '';
      const currentUrl = new URL((currentHref || '').toString());
      currentUrl.search = '';
      currentUrl.hash = '';
      base = currentUrl.toString();
    } catch {
      // ignore
    }
  }
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    const k = (key || '').toString().trim();
    const v = (value || '').toString().trim();
    if (!k || !v) return;
    query.set(k, v);
  });
  const queryString = query.toString();
  if (base) {
    const sep = base.includes('?') ? '&' : '?';
    return queryString ? `${base}${sep}${queryString}` : base;
  }
  return queryString ? `?${queryString}` : '?';
};

export const buildLandingUrl = (serviceUrl: string, adminEnabled: boolean): string => {
  const params: Record<string, string> = { app: 'landing' };
  if (adminEnabled) params.admin = 'true';
  return buildUrl(serviceUrl, params);
};

export const buildAnalyticsUrl = (serviceUrl: string, adminEnabled: boolean): string => {
  const params: Record<string, string> = { app: 'analytics' };
  if (adminEnabled) params.admin = 'true';
  return buildUrl(serviceUrl, params);
};

export const navigateToTopLevel = (targetUrl: string): void => {
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
