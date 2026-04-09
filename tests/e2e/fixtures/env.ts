const DEFAULT_FORM_KEY = 'Config: Meal Production';
const DEFAULT_PRESET = 'mobile-4g';

export type MobilePresetId = 'mobile-4g' | 'mobile-wifi';

export const e2eEnv = {
  baseUrl: (process.env.E2E_BASE_URL || '').trim(),
  mealProductionFormKey: (process.env.E2E_FORM_KEY_MEAL_PRODUCTION || DEFAULT_FORM_KEY).trim(),
  mobilePreset: ((process.env.E2E_MOBILE_PRESET || DEFAULT_PRESET).trim() || DEFAULT_PRESET) as MobilePresetId,
  adminEnabled:
    ['1', 'true', 'yes', 'on'].includes((process.env.E2E_ADMIN_ENABLED || '').trim().toLowerCase()),
  debug: ['1', 'true', 'yes', 'on'].includes((process.env.E2E_DEBUG || '').trim().toLowerCase())
};

export function requireBaseUrl(): string {
  if (!e2eEnv.baseUrl) {
    throw new Error('Missing E2E_BASE_URL. The deployed staging URL must be provided by the deployment job output.');
  }
  return e2eEnv.baseUrl;
}

export function buildFormUrl(formKey = e2eEnv.mealProductionFormKey): string {
  const url = new URL(requireBaseUrl());

  if (formKey.trim()) {
    url.searchParams.set('form', formKey.trim());
  }

  const hasDiagnosticsOptIn =
    url.searchParams.has('timing') ||
    url.searchParams.has('serverTiming') ||
    url.searchParams.has('perf') ||
    url.searchParams.has('admin') ||
    url.searchParams.has('admin-true');

  if (!hasDiagnosticsOptIn) {
    url.searchParams.set('timing', '1');
  }

  if (e2eEnv.adminEnabled) {
    url.searchParams.set('admin', 'true');
  }

  return url.toString();
}
