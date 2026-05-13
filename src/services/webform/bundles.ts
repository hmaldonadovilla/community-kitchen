import {
  WEB_FORM_REACT_ASSET_BASE_URL,
  WEB_FORM_REACT_ASSET_MODE,
  getReactBundle,
  getReactBundleAssetFileName,
  getReactBundleHash
} from '../../web/react/reactBundle';

const normalizeBundleKey = (raw?: string | null): string => {
  const key = (raw || '').toString().trim().toLowerCase();
  return key || 'full';
};

export const renderReactBundle = (app?: string | null): GoogleAppsScript.Content.TextOutput => {
  const bundleKey = normalizeBundleKey(app);
  const source = getReactBundle(bundleKey);
  const output = ContentService.createTextOutput(
    source || 'console.error("[ReactForm][assets] Embedded React bundle is unavailable for this deployment.");'
  );
  output.setMimeType(ContentService.MimeType.JAVASCRIPT);
  return output;
};

export const getReactBundleCacheKey = (app?: string | null): string => getReactBundleHash(normalizeBundleKey(app));

export const getReactBundleAssetFile = (app?: string | null): string => getReactBundleAssetFileName(normalizeBundleKey(app));

export const getGeneratedReactAssetMode = (): string => (WEB_FORM_REACT_ASSET_MODE || '').toString().trim().toLowerCase();

export const getGeneratedReactAssetBaseUrl = (): string => (WEB_FORM_REACT_ASSET_BASE_URL || '').toString().trim();
