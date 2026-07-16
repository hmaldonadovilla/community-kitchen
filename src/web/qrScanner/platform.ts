export interface ScannerPlatformInfo {
  userAgent?: string;
  platform?: string;
  maxTouchPoints?: number;
}

export type ScannerCloseMode = 'native' | 'scripted';

/** Detects iPhone/iPad browsers, including iPadOS desktop user-agent mode. */
export const isIosLikeScannerPlatform = (info: ScannerPlatformInfo): boolean => {
  const userAgent = (info.userAgent || '').toString();
  const platform = (info.platform || '').toString();
  const maxTouchPoints = Number(info.maxTouchPoints || 0);
  return /iPad|iPhone|iPod/i.test(userAgent) || (platform === 'MacIntel' && maxTouchPoints > 1);
};

/**
 * iOS browser surfaces can reload or recreate a script-opened tab when
 * `window.close()` is requested. Keep the native browser X as the only exit
 * mechanism there so the retained form tab is not disturbed after a commit.
 */
export const resolveScannerCloseMode = (info: ScannerPlatformInfo): ScannerCloseMode =>
  isIosLikeScannerPlatform(info) ? 'native' : 'scripted';
