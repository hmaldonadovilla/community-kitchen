export const UI_ENV_TAG_PROPERTY_KEY = 'CK_UI_ENV_TAG';

export const getUiEnvTag = (): string | null => {
  try {
    const props = (typeof PropertiesService !== 'undefined' && PropertiesService.getScriptProperties)
      ? PropertiesService.getScriptProperties()
      : undefined;
    const raw = props?.getProperty(UI_ENV_TAG_PROPERTY_KEY);
    const trimmed = (raw || '').toString().trim();
    return trimmed ? trimmed : null;
  } catch (_) {
    return null;
  }
};
