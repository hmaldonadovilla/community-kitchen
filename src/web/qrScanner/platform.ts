export interface ScannerPlatformInfo {
  userAgent?: string;
  platform?: string;
  maxTouchPoints?: number;
}

/** Detects iPhone/iPad browsers, including iPadOS desktop user-agent mode. */
export const isIosLikeScannerPlatform = (info: ScannerPlatformInfo): boolean => {
  const userAgent = (info.userAgent || '').toString();
  const platform = (info.platform || '').toString();
  const maxTouchPoints = Number(info.maxTouchPoints || 0);
  return /iPad|iPhone|iPod/i.test(userAgent) || (platform === 'MacIntel' && maxTouchPoints > 1);
};
