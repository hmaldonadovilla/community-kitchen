import type { FormCatalogItem } from '../api';
import type { FormConfigExport } from '../../../types';
import type { LandingIllustrationKey, LandingPageAppConfig, LandingPageConfig } from '../../../config/landingPageTypes';

export const LANDING_TITLE_FALLBACK = 'Community Kitchen';
export type { LandingIllustrationKey } from '../../../config/landingPageTypes';

export interface LandingAppItem extends FormCatalogItem {
  displayTitle: string;
  displayDescription?: string;
  illustration: LandingIllustrationKey;
  imageUrl?: string;
}

export interface LandingCatalogLayout {
  primaryApps: LandingAppItem[];
  adminApps: LandingAppItem[];
  overflowAdminApps: LandingAppItem[];
}

export interface LandingSpecialAppConfig {
  id: string;
  section: Exclude<LandingSection, 'overflow'>;
  order: number;
  illustration: LandingIllustrationKey;
  targetUrl: string;
  title: string;
  description?: string;
  imageUrl?: string;
}

type LandingSection = 'primary' | 'admin' | 'overflow';

type LandingFormPreset = LandingPageAppConfig & {
  section: LandingSection;
};

type OrderedLandingAppItem = LandingAppItem & {
  __landingOrder?: number;
};

const resolveLandingPreset = (item: FormCatalogItem, pageConfig: LandingPageConfig): LandingFormPreset => {
  const formKey = (item?.formKey || '').toString().trim();
  const preset = (Array.isArray(pageConfig?.apps) ? pageConfig.apps : []).find(entry => entry.formKey === formKey);
  if (preset) return preset;
  return {
    formKey,
    section: 'overflow',
    order: 999,
    illustration: 'admin'
  };
};

const toLandingAppItem = (item: FormCatalogItem, preset: LandingFormPreset): LandingAppItem => {
  const nextItem = {
    ...item,
    displayTitle: (preset.title || item.title || item.formKey).toString().trim(),
    displayDescription: (preset.description || item.description || '').toString().trim() || undefined,
    illustration: preset.illustration,
    imageUrl: normalizeOptionalText(preset.imageUrl)
  } as LandingAppItem;

  Object.defineProperty(nextItem, '__landingOrder', {
    value: preset.order,
    enumerable: false,
    configurable: true,
    writable: true
  });

  return nextItem;
};

const compareLandingItems = (
  left: { item: LandingAppItem; preset: LandingFormPreset },
  right: { item: LandingAppItem; preset: LandingFormPreset }
): number => {
  if (left.preset.order !== right.preset.order) return left.preset.order - right.preset.order;
  return left.item.displayTitle.localeCompare(right.item.displayTitle);
};

const compareOrderedLandingItems = (left: OrderedLandingAppItem, right: OrderedLandingAppItem): number => {
  const leftOrder = Number(left.__landingOrder ?? Number.MAX_SAFE_INTEGER);
  const rightOrder = Number(right.__landingOrder ?? Number.MAX_SAFE_INTEGER);
  if (leftOrder !== rightOrder) return leftOrder - rightOrder;
  return left.displayTitle.localeCompare(right.displayTitle);
};

const normalizeOptionalText = (value: any): string | undefined => {
  if (value === undefined || value === null) return undefined;
  const raw = value.toString().trim();
  return raw || undefined;
};

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

export const pickLandingLogoUrlByFormKey = (items: FormCatalogItem[], formKey: string | null | undefined): string | undefined => {
  const matchKey = normalizeOptionalText(formKey);
  if (!matchKey) return undefined;
  const match = (Array.isArray(items) ? items : []).find(item => (item?.formKey || '').toString().trim() === matchKey);
  return normalizeOptionalText(match?.logoUrl);
};

export const resolveLandingLogoUrl = (
  configuredLogoUrl: string | null | undefined,
  configuredLogoFormKey: string | null | undefined,
  items: FormCatalogItem[]
): string | undefined => {
  return normalizeOptionalText(configuredLogoUrl) || pickLandingLogoUrlByFormKey(items, configuredLogoFormKey) || pickLandingLogoUrl(items);
};

export const resolveLandingHeaderTitle = (documentTitle?: string | null, configuredTitle?: string | null): string => {
  return normalizeOptionalText(configuredTitle) || normalizeOptionalText(documentTitle) || LANDING_TITLE_FALLBACK;
};

export const buildBundledLandingCatalog = (configs: FormConfigExport[]): FormCatalogItem[] => {
  const items = (Array.isArray(configs) ? configs : [])
    .map(config => {
      const formKey = (config?.formKey || config?.form?.configSheet || config?.form?.title || '').toString().trim();
      if (!formKey) return null;
      const title = (config?.form?.title || formKey).toString().trim() || formKey;
      const description = (config?.form?.description || '').toString().trim() || undefined;
      const targetUrl = (config?.form?.appUrl || '').toString().trim() || undefined;
      const logoUrl = (config?.form?.appHeader?.logoUrl || '').toString().trim() || undefined;
      return {
        formKey,
        title,
        description,
        targetUrl,
        logoUrl
      } satisfies FormCatalogItem;
    })
    .filter(Boolean) as FormCatalogItem[];

  items.sort((a, b) => a.title.localeCompare(b.title));
  return items;
};

export const filterNavigableLandingItems = (items: FormCatalogItem[], adminEnabled: boolean): FormCatalogItem[] => {
  const next = (Array.isArray(items) ? items : [])
    .map(item => {
      const rawTargetUrl = (item?.targetUrl || '').toString().trim();
      if (!rawTargetUrl) return null;
      return {
        ...item,
        targetUrl: appendAdminQuery(rawTargetUrl, adminEnabled)
      } satisfies FormCatalogItem;
    })
    .filter(Boolean) as FormCatalogItem[];

  next.sort((a, b) => a.title.localeCompare(b.title));
  return next;
};

export const resolveLandingCatalogItems = (
  runtimeItems: FormCatalogItem[],
  adminEnabled: boolean
): FormCatalogItem[] => {
  return filterNavigableLandingItems(runtimeItems, adminEnabled);
};

export const buildLandingCatalogLayout = (items: FormCatalogItem[], adminEnabled: boolean, pageConfig: LandingPageConfig): LandingCatalogLayout => {
  const primaryApps: Array<{ item: LandingAppItem; preset: LandingFormPreset }> = [];
  const adminApps: Array<{ item: LandingAppItem; preset: LandingFormPreset }> = [];
  const overflowAdminApps: Array<{ item: LandingAppItem; preset: LandingFormPreset }> = [];

  (Array.isArray(items) ? items : []).forEach(item => {
    const preset = resolveLandingPreset(item, pageConfig);
    const nextItem = toLandingAppItem(item, preset);

    if (preset.section === 'primary') {
      primaryApps.push({ item: nextItem, preset });
      return;
    }

    if (!adminEnabled) return;

    if (preset.section === 'admin') {
      adminApps.push({ item: nextItem, preset });
      return;
    }

    overflowAdminApps.push({ item: nextItem, preset });
  });

  primaryApps.sort(compareLandingItems);
  adminApps.sort(compareLandingItems);
  overflowAdminApps.sort(compareLandingItems);

  return {
    primaryApps: primaryApps.map(entry => entry.item),
    adminApps: adminApps.map(entry => entry.item),
    overflowAdminApps: overflowAdminApps.map(entry => entry.item)
  };
};

export const appendLandingSpecialItems = (
  layout: LandingCatalogLayout,
  adminEnabled: boolean,
  specialItems: LandingSpecialAppConfig[]
): LandingCatalogLayout => {
  const specialPrimary: Array<LandingAppItem & { __landingOrder: number }> = [];
  const specialAdmin: Array<LandingAppItem & { __landingOrder: number }> = [];

  (Array.isArray(specialItems) ? specialItems : []).forEach(item => {
    const nextItem = {
      formKey: item.id,
      title: item.title,
      displayTitle: item.title,
      displayDescription: item.description,
      targetUrl: item.targetUrl,
      illustration: item.illustration,
      imageUrl: item.imageUrl,
      __landingOrder: item.order
    } as LandingAppItem & { __landingOrder: number };
    const bucket = item.section === 'primary' ? specialPrimary : adminEnabled ? specialAdmin : null;
    if (!bucket) return;
    bucket.push(nextItem);
  });

  const nextPrimary = [...layout.primaryApps, ...specialPrimary].sort(compareOrderedLandingItems).map(item => {
    const nextItem = { ...item } as OrderedLandingAppItem;
    delete nextItem.__landingOrder;
    return nextItem as LandingAppItem;
  });
  const nextAdmin = [...layout.adminApps, ...specialAdmin].sort(compareOrderedLandingItems).map(item => {
    const nextItem = { ...item } as OrderedLandingAppItem;
    delete nextItem.__landingOrder;
    return nextItem as LandingAppItem;
  });

  return {
    primaryApps: nextPrimary,
    adminApps: nextAdmin,
    overflowAdminApps: layout.overflowAdminApps
  };
};
