import { isServerTimingEnabled, shouldEnableServerTiming } from '../src/services/webform/serverTiming';

describe('server timing enablement', () => {
  test('enables timing for staging env tags', () => {
    expect(isServerTimingEnabled('staging')).toBe(true);
    expect(shouldEnableServerTiming('staging', {})).toBe(true);
  });

  test('enables timing for admin and explicit timing params without env tag', () => {
    expect(shouldEnableServerTiming(null, { admin: 'true' })).toBe(true);
    expect(shouldEnableServerTiming(null, { timing: '1' })).toBe(true);
    expect(shouldEnableServerTiming(null, { serverTiming: 'yes' })).toBe(true);
    expect(shouldEnableServerTiming(null, { perf: 'on' })).toBe(true);
    expect(shouldEnableServerTiming(null, { 'admin-true': '' })).toBe(true);
  });

  test('stays disabled for ordinary requests without staging markers', () => {
    expect(shouldEnableServerTiming(null, { form: 'Config: Meal Production' })).toBe(false);
  });
});
