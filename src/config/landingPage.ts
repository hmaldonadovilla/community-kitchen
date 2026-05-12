import { BUNDLED_LANDING_PAGE_CONFIG } from './bundledLandingPageConfig';
import type {
  LandingIllustrationKey,
  LandingPageAppConfig,
  LandingPageConfig,
  LandingPageCopyConfig,
  LandingPageHeaderConfig,
  LandingSectionKey
} from './landingPageTypes';

const DEFAULT_LANDING_PAGE_CONFIG: LandingPageConfig = {
  brandName: 'Community Kitchen',
  heroTitle: 'Welcome to the Community Kitchen',
  heroDescription: 'Select an app below to begin managing operations.',
  copy: {
    refreshLabel: 'Refresh',
    loadingAppsLabel: 'Loading apps...',
    emptyPrimaryAppsLabel: 'No primary apps were found.',
    pendingNavigationTitle: 'Please wait',
    pendingNavigationMessage: 'Opening the selected app...',
    openAppLabel: 'Go to app',
    primarySectionTitle: 'Apps for cooks',
    adminSectionTitle: 'Administrator apps',
    adminSectionNote: 'Reports are available from the dashboard below.',
    overflowTitle: 'More Admin Forms',
    overflowShowLabel: 'Show forms',
    overflowHideLabel: 'Hide forms',
    overflowDescriptionSingular: 'Open the remaining admin form.',
    overflowDescriptionPlural: 'Open the remaining {count} admin forms and internal tools.'
  },
  apps: []
};

const normalizeOptionalText = (value: any): string | undefined => {
  if (value === undefined || value === null) return undefined;
  const raw = value.toString().trim();
  return raw || undefined;
};

const normalizeOptionalTextAllowEmpty = (value: any): string | undefined => {
  if (value === undefined || value === null) return undefined;
  return value.toString().trim();
};

const normalizeRequiredText = (value: any, fallback: string): string => normalizeOptionalText(value) || fallback;

const normalizeSection = (value: any): LandingSectionKey => {
  const raw = normalizeOptionalText(value);
  return raw === 'primary' || raw === 'admin' || raw === 'overflow' ? raw : 'overflow';
};

const normalizeIllustration = (value: any): LandingIllustrationKey => {
  const raw = normalizeOptionalText(value);
  return raw === 'checks' || raw === 'meal' || raw === 'customers' || raw === 'ingredients' || raw === 'recipes' || raw === 'more' || raw === 'admin'
    || raw === 'analytics'
    ? raw
    : 'admin';
};

const normalizeCopy = (value: any): LandingPageCopyConfig => {
  const source = value && typeof value === 'object' ? value : {};
  return {
    refreshLabel: normalizeRequiredText(source.refreshLabel, DEFAULT_LANDING_PAGE_CONFIG.copy.refreshLabel),
    loadingAppsLabel: normalizeRequiredText(source.loadingAppsLabel, DEFAULT_LANDING_PAGE_CONFIG.copy.loadingAppsLabel),
    emptyPrimaryAppsLabel: normalizeRequiredText(source.emptyPrimaryAppsLabel, DEFAULT_LANDING_PAGE_CONFIG.copy.emptyPrimaryAppsLabel),
    pendingNavigationTitle:
      normalizeOptionalTextAllowEmpty(source.pendingNavigationTitle) ?? DEFAULT_LANDING_PAGE_CONFIG.copy.pendingNavigationTitle,
    pendingNavigationMessage: normalizeRequiredText(source.pendingNavigationMessage, DEFAULT_LANDING_PAGE_CONFIG.copy.pendingNavigationMessage),
    openAppLabel: normalizeRequiredText(source.openAppLabel, DEFAULT_LANDING_PAGE_CONFIG.copy.openAppLabel),
    primarySectionTitle: normalizeRequiredText(source.primarySectionTitle, DEFAULT_LANDING_PAGE_CONFIG.copy.primarySectionTitle),
    adminSectionTitle: normalizeRequiredText(source.adminSectionTitle, DEFAULT_LANDING_PAGE_CONFIG.copy.adminSectionTitle),
    adminSectionNote: normalizeRequiredText(source.adminSectionNote, DEFAULT_LANDING_PAGE_CONFIG.copy.adminSectionNote),
    overflowTitle: normalizeRequiredText(source.overflowTitle, DEFAULT_LANDING_PAGE_CONFIG.copy.overflowTitle),
    overflowShowLabel: normalizeRequiredText(source.overflowShowLabel, DEFAULT_LANDING_PAGE_CONFIG.copy.overflowShowLabel),
    overflowHideLabel: normalizeRequiredText(source.overflowHideLabel, DEFAULT_LANDING_PAGE_CONFIG.copy.overflowHideLabel),
    overflowDescriptionSingular: normalizeRequiredText(
      source.overflowDescriptionSingular,
      DEFAULT_LANDING_PAGE_CONFIG.copy.overflowDescriptionSingular
    ),
    overflowDescriptionPlural: normalizeRequiredText(
      source.overflowDescriptionPlural,
      DEFAULT_LANDING_PAGE_CONFIG.copy.overflowDescriptionPlural
    )
  };
};

const normalizeHeader = (value: any): LandingPageHeaderConfig | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const logoUrl = normalizeOptionalText(value.logoUrl);
  const logoFormKey = normalizeOptionalText(value.logoFormKey);
  if (!logoUrl && !logoFormKey) return undefined;
  return {
    logoUrl,
    logoFormKey
  };
};

const normalizeApps = (value: any): LandingPageAppConfig[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry, index) => {
      const source = entry && typeof entry === 'object' ? entry : {};
      const formKey = normalizeOptionalText(source.formKey);
      if (!formKey) return null;
      const parsedOrder = Number(source.order);
      return {
        formKey,
        section: normalizeSection(source.section),
        order: Number.isFinite(parsedOrder) ? parsedOrder : 1000 + index,
        illustration: normalizeIllustration(source.illustration),
        imagePath: normalizeOptionalText(source.imagePath),
        imageUrl: normalizeOptionalText(source.imageUrl),
        title: normalizeOptionalText(source.title),
        description: normalizeOptionalText(source.description)
      } satisfies LandingPageAppConfig;
    })
    .filter(Boolean) as LandingPageAppConfig[];
};

const normalizeLandingPageConfig = (value: any): LandingPageConfig => {
  const source = value && typeof value === 'object' ? value : {};
  return {
    brandName: normalizeRequiredText(source.brandName, DEFAULT_LANDING_PAGE_CONFIG.brandName),
    heroTitle: normalizeRequiredText(source.heroTitle, DEFAULT_LANDING_PAGE_CONFIG.heroTitle),
    heroDescription: normalizeRequiredText(source.heroDescription, DEFAULT_LANDING_PAGE_CONFIG.heroDescription),
    appHeader: normalizeHeader(source.appHeader),
    copy: normalizeCopy(source.copy),
    apps: normalizeApps(source.apps)
  };
};

export const LANDING_PAGE_CONFIG: LandingPageConfig = normalizeLandingPageConfig(BUNDLED_LANDING_PAGE_CONFIG);
