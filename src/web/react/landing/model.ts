import type { FormCatalogItem } from '../api';

export const LANDING_TITLE_FALLBACK = 'Community Kitchen';

export const isTruthyParam = (raw: any): boolean => {
  if (raw === undefined || raw === null) return false;
  const token = raw.toString().trim().toLowerCase();
  if (!token) return false;
  return token === '1' || token === 'true' || token === 'yes' || token === 'on';
};

export const appendAdminQuery = (targetUrl: string, adminEnabled: boolean): string => {
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

export const pickLandingLogoUrl = (items: FormCatalogItem[]): string | undefined => {
  const counts = new Map<string, number>();
  let best: string | undefined;
  let bestCount = 0;

  (Array.isArray(items) ? items : []).forEach(item => {
    const raw = (item?.logoUrl || '').toString().trim();
    if (!raw) return;
    const nextCount = (counts.get(raw) || 0) + 1;
    counts.set(raw, nextCount);
    if (nextCount > bestCount) {
      best = raw;
      bestCount = nextCount;
    }
  });

  return best;
};

export const resolveLandingHeaderTitle = (documentTitle?: string | null): string => {
  const raw = (documentTitle || '').toString().trim();
  return raw || LANDING_TITLE_FALLBACK;
};
