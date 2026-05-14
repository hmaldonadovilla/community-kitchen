import {
  getGeneratedReactAssetBaseUrl,
  getGeneratedReactAssetMode,
  getReactBundleAssetFile,
  getReactBundleCacheKey
} from './bundles';

export type ReactBundleAssetMode = 'embedded' | 'external';

export interface ReactBundleScriptDescriptor {
  src: string;
  mode: ReactBundleAssetMode;
  target: string;
  cacheKey: string;
  assetFileName: string | null;
  baseUrl: string | null;
}

const WEB_ASSET_MODE_PROPERTY = 'CK_WEB_ASSET_MODE';
const WEB_ASSET_BASE_URL_PROPERTY = 'CK_WEB_ASSET_BASE_URL';

const normalizeAssetMode = (raw?: string | null): ReactBundleAssetMode => {
  const value = (raw || '').toString().trim().toLowerCase();
  return value === 'external' || value === 'firebase' ? 'external' : 'embedded';
};

const normalizeExternalAssetBaseUrl = (raw?: string | null): string => {
  const value = (raw || '').toString().trim().replace(/\/+$/, '');
  if (/[?#]/.test(value)) return '';
  if (!value || !/^https:\/\/[^/?#]+/i.test(value)) return '';
  return value;
};

const getScriptProperty = (key: string): string => {
  try {
    if (typeof PropertiesService === 'undefined' || !PropertiesService.getScriptProperties) return '';
    const props = PropertiesService.getScriptProperties();
    return (props?.getProperty(key) || '').toString().trim();
  } catch {
    return '';
  }
};

const resolveAssetMode = (): ReactBundleAssetMode => {
  const scriptMode = getScriptProperty(WEB_ASSET_MODE_PROPERTY);
  if (scriptMode) return normalizeAssetMode(scriptMode);
  return normalizeAssetMode(getGeneratedReactAssetMode());
};

const resolveAssetBaseUrl = (): string =>
  normalizeExternalAssetBaseUrl(getScriptProperty(WEB_ASSET_BASE_URL_PROPERTY) || getGeneratedReactAssetBaseUrl());

const normalizeBundleServiceUrl = (baseUrl: string): string =>
  baseUrl.replace(/^(https:\/\/script\.google\.com)\/a\/[^/]+(\/macros\/)/, '$1$2');

const buildEmbeddedBundleSrc = (
  target: string,
  requestParams: Record<string, string> | undefined,
  cacheVersion: string,
  serviceUrl?: string | null
): string => {
  const appParam = target ? `&app=${encodeURIComponent(target)}` : '';
  const bundleCacheKey = getReactBundleCacheKey(target);
  const versionKey = [cacheVersion, bundleCacheKey].filter(Boolean).join('.');
  const versionParam = versionKey ? `&v=${encodeURIComponent(versionKey)}` : '';
  const tsParamRaw = (requestParams?.ts || requestParams?.t || '').toString().trim();
  const tsParam = tsParamRaw ? `&ts=${encodeURIComponent(tsParamRaw)}` : '';
  const query = `bundle=react${appParam}${versionParam}${tsParam}`;
  if (!serviceUrl) return `?${query}`;
  const publicBundleBaseUrl = normalizeBundleServiceUrl(serviceUrl);
  const sep = publicBundleBaseUrl.includes('?') ? '&' : '?';
  return `${publicBundleBaseUrl}${sep}${query}`;
};

const buildExternalBundleSrc = (
  baseUrl: string,
  assetFileName: string,
  requestParams?: Record<string, string>
): string => {
  const path = assetFileName.replace(/^\/+/, '');
  const tsParamRaw = (requestParams?.ts || requestParams?.t || '').toString().trim();
  const tsParam = tsParamRaw ? `?ts=${encodeURIComponent(tsParamRaw)}` : '';
  return `${baseUrl}/${path}${tsParam}`;
};

export const resolveReactBundleScript = (
  bundleTarget?: string,
  requestParams?: Record<string, string>,
  cacheVersionOverride?: string,
  serviceUrlOverride?: string | null
): ReactBundleScriptDescriptor => {
  const target = (bundleTarget || '').toString().trim();
  const cacheVersion = (cacheVersionOverride || '').toString().trim();
  const cacheKey = getReactBundleCacheKey(target);
  const assetMode = resolveAssetMode();
  const assetFileName = getReactBundleAssetFile(target);
  const assetBaseUrl = resolveAssetBaseUrl();
  if (assetMode === 'external' && assetBaseUrl && assetFileName) {
    return {
      src: buildExternalBundleSrc(assetBaseUrl, assetFileName, requestParams),
      mode: 'external',
      target,
      cacheKey,
      assetFileName,
      baseUrl: assetBaseUrl
    };
  }
  return {
    src: buildEmbeddedBundleSrc(target, requestParams, cacheVersion, serviceUrlOverride),
    mode: 'embedded',
    target,
    cacheKey,
    assetFileName: assetFileName || null,
    baseUrl: null
  };
};
