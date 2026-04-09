const { devices } = require('playwright');

const PLAYWRIGHT_DEVICE_NAME = 'Pixel 5';

const PLAYWRIGHT_CONTEXT_OPTIONS = {
  ...devices[PLAYWRIGHT_DEVICE_NAME],
  locale: 'en-US',
  timezoneId: 'America/New_York'
};

const PRESET_MOBILE_4G = {
  id: 'mobile-4g',
  description: 'Mid-tier Android + average 4G (simulated)',
  cdp: {
    latencyMs: 150,
    downloadKbps: 1600,
    uploadKbps: 750,
    cpuSlowdownMultiplier: 4,
    connectionType: 'cellular4g'
  }
};

const PRESET_MOBILE_WIFI = {
  id: 'mobile-wifi',
  description: 'Mid-tier Android + typical Wi-Fi (simulated)',
  cdp: {
    latencyMs: 40,
    downloadKbps: 10000,
    uploadKbps: 5000,
    cpuSlowdownMultiplier: 3,
    connectionType: 'wifi'
  }
};

const PRESETS = {
  [PRESET_MOBILE_4G.id]: PRESET_MOBILE_4G,
  [PRESET_MOBILE_WIFI.id]: PRESET_MOBILE_WIFI
};

function kbpsToBytesPerSecond(kbps) {
  return (kbps * 1024) / 8;
}

module.exports = {
  PLAYWRIGHT_DEVICE_NAME,
  PLAYWRIGHT_CONTEXT_OPTIONS,
  PRESET_MOBILE_4G,
  PRESET_MOBILE_WIFI,
  PRESETS,
  kbpsToBytesPerSecond
};
