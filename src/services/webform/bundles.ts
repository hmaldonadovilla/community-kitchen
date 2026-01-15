import { getReactBundle } from '../../web/react/reactBundle';

const normalizeBundleKey = (raw?: string | null): string => {
  const key = (raw || '').toString().trim().toLowerCase();
  return key || 'full';
};

export const renderReactBundle = (app?: string | null): GoogleAppsScript.Content.TextOutput => {
  const bundleKey = normalizeBundleKey(app);
  const source = getReactBundle(bundleKey);
  const output = ContentService.createTextOutput(source || '');
  output.setMimeType(ContentService.MimeType.JAVASCRIPT);
  return output;
};
