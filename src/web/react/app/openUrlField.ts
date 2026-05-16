export type OpenUrlFieldMode = 'externalLink' | 'inAppPdfPreview';

export type OpenUrlRuntimeEnvironment = {
  userAgent?: string | null;
  navigatorStandalone?: boolean | null;
  displayModeStandalone?: boolean | null;
};

export type OpenUrlFieldPresentation = {
  href: string;
  mode: OpenUrlFieldMode;
};

const normalizeText = (value: unknown): string => (value === undefined || value === null ? '' : value.toString().trim());

const isIosUserAgent = (userAgent?: string | null): boolean => {
  const ua = normalizeText(userAgent);
  if (!ua) return false;
  return /iPad|iPhone|iPod/i.test(ua) || (/Macintosh/i.test(ua) && /Mobile\/\w+/i.test(ua));
};

const isStandaloneRuntime = (env: OpenUrlRuntimeEnvironment): boolean =>
  env.navigatorStandalone === true || env.displayModeStandalone === true;

export const readOpenUrlRuntimeEnvironment = (): OpenUrlRuntimeEnvironment => {
  const nav: any = typeof navigator !== 'undefined' ? navigator : undefined;
  const matchMediaFn = typeof globalThis.matchMedia === 'function' ? globalThis.matchMedia.bind(globalThis) : null;
  let displayModeStandalone = false;
  try {
    displayModeStandalone = !!matchMediaFn?.('(display-mode: standalone)')?.matches;
  } catch {
    displayModeStandalone = false;
  }
  return {
    userAgent: nav?.userAgent || '',
    navigatorStandalone: nav?.standalone === true,
    displayModeStandalone
  };
};

export const shouldUseInAppPdfPreview = (args: {
  action?: string | null;
  fieldId?: string | null;
  href?: string | null;
  env: OpenUrlRuntimeEnvironment;
}): boolean => {
  const action = normalizeText(args.action);
  const fieldId = normalizeText(args.fieldId);
  const href = normalizeText(args.href);
  if (action !== 'openUrlField' || fieldId !== 'pdfUrl' || !href) return false;
  return isIosUserAgent(args.env.userAgent) && isStandaloneRuntime(args.env);
};

export const resolveOpenUrlFieldPresentation = (args: {
  action?: string | null;
  fieldId?: string | null;
  href?: string | null;
  env: OpenUrlRuntimeEnvironment;
}): OpenUrlFieldPresentation | null => {
  const href = normalizeText(args.href);
  if (!href) return null;
  return {
    href,
    mode: shouldUseInAppPdfPreview(args) ? 'inAppPdfPreview' : 'externalLink'
  };
};

export type OpenUrlInNewContextResult = {
  opened: boolean;
  method: 'windowOpen' | 'currentWindow' | 'blocked';
};

export const openUrlInNewContext = (args: {
  href: string;
  openWindow?: ((href: string, target: string) => Window | null | undefined) | null;
  assignLocation?: ((href: string) => void) | null;
  allowCurrentWindowNavigation?: boolean;
}): OpenUrlInNewContextResult => {
  const href = normalizeText(args.href);
  if (!href) return { opened: false, method: 'blocked' };

  try {
    const popup = args.openWindow?.(href, '_blank');
    if (popup) return { opened: true, method: 'windowOpen' };
  } catch {
    // Continue to the configured fallback below.
  }

  if (args.allowCurrentWindowNavigation === true && args.assignLocation) {
    try {
      args.assignLocation(href);
      return { opened: true, method: 'currentWindow' };
    } catch {
      return { opened: false, method: 'blocked' };
    }
  }

  return { opened: false, method: 'blocked' };
};
