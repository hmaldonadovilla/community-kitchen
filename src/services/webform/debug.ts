const DEBUG_PROPERTY_KEY = 'CK_DEBUG';

let cachedDebugFlag: boolean | null = null;

export const isDebugEnabled = (): boolean => {
  if (cachedDebugFlag !== null) return cachedDebugFlag;
  try {
    const props = (typeof PropertiesService !== 'undefined' && PropertiesService.getScriptProperties)
      ? PropertiesService.getScriptProperties()
      : undefined;
    const flag = props?.getProperty(DEBUG_PROPERTY_KEY);
    cachedDebugFlag = !!flag && (flag === '1' || flag.toLowerCase() === 'true');
    return cachedDebugFlag;
  } catch (_) {
    cachedDebugFlag = false;
    return false;
  }
};

export const debugLog = (message: string, payload?: Record<string, any>): void => {
  if (!isDebugEnabled()) return;
  const serialized = payload ? ` ${JSON.stringify(payload)}` : '';
  const entry = `[WebFormService] ${message}${serialized}`;
  if (typeof Logger !== 'undefined' && (Logger as any).log) {
    try {
      (Logger as any).log(entry);
    } catch (_) {
      // ignore
    }
  }
  if (typeof console !== 'undefined' && (console as any).log) {
    try {
      (console as any).log(entry);
    } catch (_) {
      // ignore
    }
  }
};
