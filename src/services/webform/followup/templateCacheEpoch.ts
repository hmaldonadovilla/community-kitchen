/**
 * Template cache "epoch" (Apps Script PropertiesService).
 *
 * CacheService has no "list keys" / "clear all" API, so the simplest reliable way
 * to invalidate cached template entries is to include a version/epoch token in the
 * cache key. Bumping the epoch makes future reads use new keys immediately.
 *
 * This module is safe in non-Apps Script environments (tests) where PropertiesService
 * may be undefined.
 */

const PROP_KEY = 'ck.templates.cacheEpoch';

const getScriptProperties = (): GoogleAppsScript.Properties.Properties | null => {
  try {
    const svc = (globalThis as any).PropertiesService;
    if (!svc || typeof svc.getScriptProperties !== 'function') return null;
    return svc.getScriptProperties();
  } catch (_) {
    return null;
  }
};

export const getTemplateCacheEpoch = (): string => {
  const props = getScriptProperties();
  if (!props) return '0';
  try {
    const v = props.getProperty(PROP_KEY);
    return (v || '0').toString().trim() || '0';
  } catch (_) {
    return '0';
  }
};

export const bumpTemplateCacheEpoch = (): { success: boolean; epoch?: string; message?: string } => {
  const props = getScriptProperties();
  if (!props) return { success: false, message: 'PropertiesService is not available.' };
  try {
    const epoch = `${Date.now()}`;
    props.setProperty(PROP_KEY, epoch);
    return { success: true, epoch };
  } catch (err: any) {
    const msg = (err?.message || err?.toString?.() || 'Failed to bump template cache epoch.').toString();
    return { success: false, message: msg };
  }
};


