import { BUNDLED_ANALYTICS_PAGE_CONFIG } from './bundledAnalyticsPageConfig';
import type {
  AnalyticsDashboardPayload,
  AnalyticsDashboardSection,
  AnalyticsDashboardWidget,
  AnalyticsPageConfig,
  AnalyticsPageCopyConfig,
  AnalyticsPageHeaderConfig,
  AnalyticsPageLandingTileConfig,
  AnalyticsPageLandingTileSection,
  AnalyticsPageSectionConfig,
  AnalyticsPageWidgetConfig
} from './analyticsPageTypes';

const DEFAULT_ANALYTICS_PAGE_CONFIG: AnalyticsPageConfig = {
  pageTitle: 'Reports',
  pageDescription: '',
  copy: {
    loadingLabel: 'Loading reports...',
    emptyLabel: 'No reports are available.',
    backToLandingLabel: '← Apps',
    pendingNavigationTitle: 'Please wait',
    pendingNavigationMessage: 'Opening forms...'
  },
  landingTile: {
    title: 'Reports',
    description: 'Send operational reports by email.',
    section: 'admin',
    order: 999
  },
  sections: []
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

const normalizeSection = (value: any): AnalyticsPageLandingTileSection => {
  const raw = normalizeOptionalText(value);
  return raw === 'primary' ? 'primary' : 'admin';
};

const normalizeHeader = (value: any): AnalyticsPageHeaderConfig | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const logoUrl = normalizeOptionalText(value.logoUrl);
  const logoFormKey = normalizeOptionalText(value.logoFormKey);
  if (!logoUrl && !logoFormKey) return undefined;
  return {
    logoUrl,
    logoFormKey
  };
};

const normalizeCopy = (value: any): AnalyticsPageCopyConfig => {
  const source = value && typeof value === 'object' ? value : {};
  return {
    loadingLabel: normalizeRequiredText(source.loadingLabel, DEFAULT_ANALYTICS_PAGE_CONFIG.copy.loadingLabel),
    emptyLabel: normalizeRequiredText(source.emptyLabel, DEFAULT_ANALYTICS_PAGE_CONFIG.copy.emptyLabel),
    backToLandingLabel: normalizeRequiredText(source.backToLandingLabel, DEFAULT_ANALYTICS_PAGE_CONFIG.copy.backToLandingLabel),
    pendingNavigationTitle:
      normalizeOptionalTextAllowEmpty(source.pendingNavigationTitle) ??
      DEFAULT_ANALYTICS_PAGE_CONFIG.copy.pendingNavigationTitle,
    pendingNavigationMessage: normalizeRequiredText(
      source.pendingNavigationMessage,
      DEFAULT_ANALYTICS_PAGE_CONFIG.copy.pendingNavigationMessage
    )
  };
};

const normalizeLandingTile = (value: any): AnalyticsPageLandingTileConfig => {
  const source = value && typeof value === 'object' ? value : {};
  const parsedOrder = Number(source.order);
  return {
    title: normalizeRequiredText(source.title, DEFAULT_ANALYTICS_PAGE_CONFIG.landingTile.title),
    description: normalizeOptionalText(source.description) || DEFAULT_ANALYTICS_PAGE_CONFIG.landingTile.description,
    section: normalizeSection(source.section),
    order: Number.isFinite(parsedOrder) ? parsedOrder : DEFAULT_ANALYTICS_PAGE_CONFIG.landingTile.order,
    imagePath: normalizeOptionalText(source.imagePath),
    imageUrl: normalizeOptionalText(source.imageUrl)
  };
};

const normalizeWidget = (value: any): AnalyticsPageWidgetConfig | null => {
  const source = value && typeof value === 'object' ? value : {};
  const id = normalizeOptionalText(source.id);
  const sourceFormKey = normalizeOptionalText(source.sourceFormKey);
  const sourceWidgetId = normalizeOptionalText(source.sourceWidgetId);
  if (!id || !sourceFormKey || !sourceWidgetId) return null;
  return {
    id,
    sourceFormKey,
    sourceWidgetId,
    title: normalizeOptionalText(source.title),
    description: normalizeOptionalText(source.description)
  };
};

const normalizeSections = (value: any): AnalyticsPageSectionConfig[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry, index) => {
      const source = entry && typeof entry === 'object' ? entry : {};
      const id = normalizeOptionalText(source.id) || `section_${index + 1}`;
      const title = normalizeOptionalText(source.title);
      const widgets = (Array.isArray(source.widgets) ? source.widgets : []).map(normalizeWidget).filter(Boolean) as AnalyticsPageWidgetConfig[];
      if (!title || !widgets.length) return null;
      return {
        id,
        title,
        description: normalizeOptionalText(source.description),
        widgets
      } satisfies AnalyticsPageSectionConfig;
    })
    .filter(Boolean) as AnalyticsPageSectionConfig[];
};

const normalizeAnalyticsPageConfig = (value: any): AnalyticsPageConfig => {
  const source = value && typeof value === 'object' ? value : {};
  return {
    pageTitle: normalizeRequiredText(source.pageTitle, DEFAULT_ANALYTICS_PAGE_CONFIG.pageTitle),
    pageDescription: normalizeOptionalTextAllowEmpty(source.pageDescription) ?? DEFAULT_ANALYTICS_PAGE_CONFIG.pageDescription,
    appHeader: normalizeHeader(source.appHeader),
    landingTile: normalizeLandingTile(source.landingTile),
    copy: normalizeCopy(source.copy),
    sections: normalizeSections(source.sections)
  };
};

export const ANALYTICS_PAGE_CONFIG: AnalyticsPageConfig = normalizeAnalyticsPageConfig(BUNDLED_ANALYTICS_PAGE_CONFIG);

export const sortAnalyticsDashboardSections = (sections: AnalyticsDashboardSection[]): AnalyticsDashboardSection[] =>
  [...(Array.isArray(sections) ? sections : [])].map(section => ({
    ...section,
    widgets: [...(Array.isArray(section.widgets) ? section.widgets : [])]
  }));

export const hasAnalyticsDashboardContent = (payload: AnalyticsDashboardPayload | null | undefined): boolean =>
  Boolean(
    payload &&
      ((Array.isArray(payload.sections) && payload.sections.some(section => Array.isArray(section.widgets) && section.widgets.length > 0)) ||
        (Array.isArray(payload.pipelines) && payload.pipelines.length > 0))
  );

export const resolveAnalyticsPageUpdatedAt = (sections: AnalyticsDashboardSection[] | null | undefined): string => {
  let best = '';
  (Array.isArray(sections) ? sections : []).forEach(section => {
    (Array.isArray(section?.widgets) ? section.widgets : []).forEach((widget: AnalyticsDashboardWidget) => {
      const updatedAt = (widget?.updatedAt || '').toString().trim();
      if (updatedAt > best) best = updatedAt;
    });
  });
  return best;
};
