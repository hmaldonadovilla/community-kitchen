import type { AppHeaderConfig } from '../types';

export type LandingIllustrationKey = 'checks' | 'meal' | 'customers' | 'ingredients' | 'recipes' | 'more' | 'admin';
export type LandingSectionKey = 'primary' | 'admin' | 'overflow';

export interface LandingPageHeaderConfig extends AppHeaderConfig {
  logoFormKey?: string;
}

export interface LandingPageCopyConfig {
  refreshLabel: string;
  loadingAppsLabel: string;
  emptyPrimaryAppsLabel: string;
  pendingNavigationTitle: string;
  pendingNavigationMessage: string;
  openAppLabel: string;
  primarySectionTitle: string;
  adminSectionTitle: string;
  adminSectionNote: string;
  overflowTitle: string;
  overflowShowLabel: string;
  overflowHideLabel: string;
  overflowDescriptionSingular: string;
  overflowDescriptionPlural: string;
}

export interface LandingPageAppConfig {
  formKey: string;
  section: LandingSectionKey;
  order: number;
  illustration: LandingIllustrationKey;
  imagePath?: string;
  imageUrl?: string;
  title?: string;
  description?: string;
}

export interface LandingPageConfig {
  brandName: string;
  heroTitle: string;
  heroDescription: string;
  appHeader?: LandingPageHeaderConfig;
  copy: LandingPageCopyConfig;
  apps: LandingPageAppConfig[];
}
