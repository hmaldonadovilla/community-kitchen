export type ExternalQrScannerLaunch = {
  url: string;
  origin: string;
};

export const resolveExternalQrScannerLaunch = (args: {
  assetBaseUrl?: string | null;
  requestId: string;
  targetOrigin?: string | null;
}): ExternalQrScannerLaunch | null => {
  const baseUrl = (args.assetBaseUrl || '').toString().trim().replace(/\/+$/, '');
  const requestId = (args.requestId || '').toString().trim();
  if (!baseUrl || !requestId || !/^https:\/\//i.test(baseUrl)) return null;

  try {
    const base = new URL(baseUrl);
    const scannerUrl = new URL('/qr-scanner.html', base);
    scannerUrl.searchParams.set('requestId', requestId);
    scannerUrl.searchParams.set('targetOrigin', (args.targetOrigin || '*').toString().trim() || '*');
    return { url: scannerUrl.toString(), origin: base.origin };
  } catch {
    return null;
  }
};
