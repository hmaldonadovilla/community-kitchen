import type { AppHeaderConfig, AnalyticsSnapshotItem } from '../types';

export type AnalyticsPageLandingTileSection = 'primary' | 'admin';

export interface AnalyticsPageHeaderConfig extends AppHeaderConfig {
  logoFormKey?: string;
}

export interface AnalyticsPageLandingTileConfig {
  title: string;
  description?: string;
  section: AnalyticsPageLandingTileSection;
  order: number;
  imagePath?: string;
  imageUrl?: string;
}

export interface AnalyticsPageCopyConfig {
  loadingLabel: string;
  emptyLabel: string;
  backToLandingLabel: string;
  pendingNavigationTitle: string;
  pendingNavigationMessage: string;
}

export interface AnalyticsPageWidgetConfig {
  id: string;
  sourceFormKey: string;
  sourceWidgetId: string;
  title?: string;
  description?: string;
}

export interface AnalyticsPageSectionConfig {
  id: string;
  title: string;
  description?: string;
  widgets: AnalyticsPageWidgetConfig[];
}

export interface AnalyticsPageConfig {
  pageTitle: string;
  pageDescription?: string;
  appHeader?: AnalyticsPageHeaderConfig;
  landingTile: AnalyticsPageLandingTileConfig;
  copy: AnalyticsPageCopyConfig;
  sections: AnalyticsPageSectionConfig[];
}

export interface AnalyticsDashboardWidget extends AnalyticsSnapshotItem {
  dashboardWidgetId: string;
  title: string;
  description?: string;
  sourceFormKey: string;
  sourceFormTitle: string;
  sourceWidgetId: string;
}

export interface AnalyticsDashboardPipeline {
  dashboardPipelineId: string;
  pipelineId: string;
  order?: number;
  title: string;
  description?: string;
  ownerFormKey: string;
  sourceFormKey: string;
  sourceFormTitle: string;
  dateLabel?: string;
  dateHelperText?: string;
  submitLabel?: string;
  pendingLabel?: string;
  queuedNotice?: string;
}

export interface AnalyticsDashboardSection {
  id: string;
  title: string;
  description?: string;
  widgets: AnalyticsDashboardWidget[];
}

export interface AnalyticsDashboardPayload {
  pageTitle: string;
  pageDescription?: string;
  sections: AnalyticsDashboardSection[];
  pipelines?: AnalyticsDashboardPipeline[];
  updatedAt?: string;
  errors: string[];
  envTag?: string;
}

export interface QueueAnalyticsPipelineRequest {
  ownerFormKey: string;
  pipelineId: string;
  startDate: string;
}

export interface QueueAnalyticsPipelineResult {
  success: boolean;
  message?: string;
}
