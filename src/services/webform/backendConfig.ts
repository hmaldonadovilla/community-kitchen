/**
 * Reads optional backend transport configuration from Apps Script script properties.
 *
 * This module is the server-side boundary between deployment/runtime settings and
 * the web form bootstrap payload. It deliberately does not choose a transport; the
 * React API layer owns client-side routing decisions.
 */
export interface BackendRuntimeConfigPayload {
  mode?: string;
  apiBaseUrl?: string;
  rpcPath?: string;
  httpFunctions?: string[];
  appsScriptFunctions?: string[];
  credentials?: string;
  dataBackend?: string;
  fileBackend?: string;
}

export const BACKEND_CONFIG_PROPERTY_KEY = 'CK_BACKEND_CONFIG';
export const BACKEND_MODE_PROPERTY_KEY = 'CK_BACKEND_MODE';
export const BACKEND_API_BASE_URL_PROPERTY_KEY = 'CK_API_BASE_URL';
export const BACKEND_API_RPC_PATH_PROPERTY_KEY = 'CK_API_RPC_PATH';
export const BACKEND_HTTP_FUNCTIONS_PROPERTY_KEY = 'CK_HTTP_FUNCTIONS';
export const BACKEND_APPS_SCRIPT_FUNCTIONS_PROPERTY_KEY = 'CK_APPS_SCRIPT_FUNCTIONS';
export const BACKEND_REQUEST_CREDENTIALS_PROPERTY_KEY = 'CK_API_CREDENTIALS';
export const BACKEND_DATA_PROVIDER_PROPERTY_KEY = 'CK_DATA_BACKEND';
export const BACKEND_FILE_PROVIDER_PROPERTY_KEY = 'CK_FILE_BACKEND';

const getScriptProperties = (): GoogleAppsScript.Properties.Properties | null => {
  try {
    return typeof PropertiesService !== 'undefined' && PropertiesService.getScriptProperties
      ? PropertiesService.getScriptProperties()
      : null;
  } catch {
    return null;
  }
};

const normalizeString = (value: unknown): string => (value ?? '').toString().trim();

const normalizeStringList = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.map(item => normalizeString(item)).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map(item => item.trim())
      .filter(Boolean);
  }
  return [];
};

const parseJsonConfig = (raw: string): BackendRuntimeConfigPayload => {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as BackendRuntimeConfigPayload) : {};
  } catch {
    return {};
  }
};

const setStringIfPresent = (out: BackendRuntimeConfigPayload, key: keyof BackendRuntimeConfigPayload, value: unknown) => {
  const normalized = normalizeString(value);
  if (normalized) (out as any)[key] = normalized;
};

const setListIfPresent = (out: BackendRuntimeConfigPayload, key: keyof BackendRuntimeConfigPayload, value: unknown) => {
  const list = normalizeStringList(value);
  if (list.length) (out as any)[key] = list;
};

export const getBackendRuntimeConfig = (): BackendRuntimeConfigPayload | null => {
  const props = getScriptProperties();
  if (!props) return null;

  const jsonConfig = parseJsonConfig(normalizeString(props.getProperty(BACKEND_CONFIG_PROPERTY_KEY)));
  const config: BackendRuntimeConfigPayload = { ...jsonConfig };

  setStringIfPresent(config, 'mode', props.getProperty(BACKEND_MODE_PROPERTY_KEY) ?? config.mode);
  setStringIfPresent(config, 'apiBaseUrl', props.getProperty(BACKEND_API_BASE_URL_PROPERTY_KEY) ?? config.apiBaseUrl);
  setStringIfPresent(config, 'rpcPath', props.getProperty(BACKEND_API_RPC_PATH_PROPERTY_KEY) ?? config.rpcPath);
  setStringIfPresent(config, 'credentials', props.getProperty(BACKEND_REQUEST_CREDENTIALS_PROPERTY_KEY) ?? config.credentials);
  setStringIfPresent(config, 'dataBackend', props.getProperty(BACKEND_DATA_PROVIDER_PROPERTY_KEY) ?? config.dataBackend);
  setStringIfPresent(config, 'fileBackend', props.getProperty(BACKEND_FILE_PROVIDER_PROPERTY_KEY) ?? config.fileBackend);
  setListIfPresent(config, 'httpFunctions', props.getProperty(BACKEND_HTTP_FUNCTIONS_PROPERTY_KEY) ?? config.httpFunctions);
  setListIfPresent(
    config,
    'appsScriptFunctions',
    props.getProperty(BACKEND_APPS_SCRIPT_FUNCTIONS_PROPERTY_KEY) ?? config.appsScriptFunctions
  );

  return Object.keys(config).length ? config : null;
};
