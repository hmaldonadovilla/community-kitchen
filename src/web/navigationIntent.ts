export const APP_OPEN_NAVIGATION_PARAM = 'ckNav';
export const APP_OPEN_NAVIGATION_VALUE = 'open-app';

const normalizeText = (value: unknown): string => (value === undefined || value === null ? '' : value.toString().trim());

export const appendAppOpeningNavigationParam = (targetUrl: string): string => {
  const raw = normalizeText(targetUrl);
  if (!raw) return '';
  const hashIndex = raw.indexOf('#');
  const hash = hashIndex >= 0 ? raw.slice(hashIndex) : '';
  const base = hashIndex >= 0 ? raw.slice(0, hashIndex) : raw;
  const encodedParam = `${APP_OPEN_NAVIGATION_PARAM}=${encodeURIComponent(APP_OPEN_NAVIGATION_VALUE)}`;
  const existingPattern = new RegExp(`([?&])${APP_OPEN_NAVIGATION_PARAM}=[^&#]*`);
  if (existingPattern.test(base)) return `${base.replace(existingPattern, `$1${encodedParam}`)}${hash}`;
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}${encodedParam}${hash}`;
};

export const isAppOpeningNavigationParams = (params?: Record<string, unknown> | null): boolean => {
  if (!params || typeof params !== 'object') return false;
  return normalizeText(params[APP_OPEN_NAVIGATION_PARAM]).toLowerCase() === APP_OPEN_NAVIGATION_VALUE;
};
