import type { BrowserContext, CDPSession, Page } from 'playwright/test';

import type { MobilePresetId } from '../fixtures/env';

const { PRESETS, kbpsToBytesPerSecond } = require('../../../scripts/performance/playwrightMobileProfile.js');

export function resolveMobilePreset(presetId: MobilePresetId) {
  const preset = PRESETS[presetId];
  if (!preset) {
    throw new Error(`Unsupported E2E mobile preset "${presetId}".`);
  }
  return preset;
}

export async function applyMobileThrottling(
  context: BrowserContext,
  page: Page,
  presetId: MobilePresetId
): Promise<CDPSession> {
  const preset = resolveMobilePreset(presetId);
  const session = await context.newCDPSession(page);

  await session.send('Network.enable');
  await session.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: preset.cdp.latencyMs,
    downloadThroughput: kbpsToBytesPerSecond(preset.cdp.downloadKbps),
    uploadThroughput: kbpsToBytesPerSecond(preset.cdp.uploadKbps),
    connectionType: preset.cdp.connectionType
  });
  await session.send('Emulation.setCPUThrottlingRate', {
    rate: preset.cdp.cpuSlowdownMultiplier
  });

  return session;
}
