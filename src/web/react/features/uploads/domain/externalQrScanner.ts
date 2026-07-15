export type ExternalQrScannerLaunch = {
  url: string;
  origin: string;
};

export const matchesExternalQrScannerOverlayTarget = (
  overlay: { open: boolean; scope?: string; fieldId?: unknown },
  target: { fieldId: string; fieldPath: string }
): boolean => {
  const fieldId = (overlay.fieldId || '').toString();
  return Boolean(
    overlay.open &&
    overlay.scope === 'top' &&
    fieldId &&
    fieldId === target.fieldId &&
    fieldId === target.fieldPath
  );
};

export const resolveExternalQrScannerLaunch = (args: {
  assetBaseUrl?: string | null;
  requestId: string;
  targetOrigin?: string | null;
  instruction?: string | null;
  hideCloseOnIos?: boolean;
}): ExternalQrScannerLaunch | null => {
  const baseUrl = (args.assetBaseUrl || '').toString().trim().replace(/\/+$/, '');
  const requestId = (args.requestId || '').toString().trim();
  const targetOrigin = (args.targetOrigin || '').toString().trim().replace(/\/+$/, '');
  if (!baseUrl || !requestId || requestId.length > 256 || !targetOrigin) return null;

  try {
    const base = new URL(baseUrl);
    const target = new URL(targetOrigin);
    if (
      base.protocol !== 'https:' ||
      base.username ||
      base.password ||
      target.protocol !== 'https:' ||
      target.username ||
      target.password ||
      target.origin !== targetOrigin
    ) {
      return null;
    }
    const scannerUrl = new URL('/qr-scanner.html', base);
    scannerUrl.searchParams.set('requestId', requestId);
    scannerUrl.searchParams.set('targetOrigin', target.origin);
    const instruction = (args.instruction || '').toString().trim().slice(0, 300);
    if (instruction) scannerUrl.searchParams.set('instruction', instruction);
    scannerUrl.searchParams.set('hideCloseOnIos', args.hideCloseOnIos === false ? '0' : '1');
    return { url: scannerUrl.toString(), origin: base.origin };
  } catch {
    return null;
  }
};
