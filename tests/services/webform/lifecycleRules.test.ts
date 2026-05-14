import {
  shiftIsoDate,
  shouldApplyLifecycleStatusDateRule
} from '../../../src/services/webform/lifecycleRules';

describe('lifecycle rule domain', () => {
  test('shifts ISO dates and preserves invalid values', () => {
    expect(shiftIsoDate('2026-04-30', -2)).toBe('2026-04-28');
    expect(shiftIsoDate('not-a-date', -2)).toBe('not-a-date');
  });

  test('applies before-today and inclusive date comparisons with status filters', () => {
    const rule: any = {
      fromStatuses: ['Available'],
      dateFieldId: 'EXPIRY',
      compare: 'beforeToday'
    };

    expect(shouldApplyLifecycleStatusDateRule({ rule, currentStatus: 'available', rawDateValue: '2026-04-29', todayIso: '2026-04-30' })).toBe(true);
    expect(shouldApplyLifecycleStatusDateRule({ rule, currentStatus: 'closed', rawDateValue: '2026-04-29', todayIso: '2026-04-30' })).toBe(false);
    expect(shouldApplyLifecycleStatusDateRule({ rule, currentStatus: 'available', rawDateValue: '2026-04-30', todayIso: '2026-04-30' })).toBe(false);
    expect(
      shouldApplyLifecycleStatusDateRule({
        rule: { ...rule, compare: 'onOrBeforeToday' },
        currentStatus: 'available',
        rawDateValue: '2026-04-30',
        todayIso: '2026-04-30'
      })
    ).toBe(true);
  });

  test('supports day offsets for stale-utilisation windows', () => {
    expect(
      shouldApplyLifecycleStatusDateRule({
        rule: { dayOffset: -2 } as any,
        currentStatus: '',
        rawDateValue: '2026-04-27',
        todayIso: '2026-04-30'
      })
    ).toBe(true);
    expect(
      shouldApplyLifecycleStatusDateRule({
        rule: { dayOffset: -2 } as any,
        currentStatus: '',
        rawDateValue: '2026-04-29',
        todayIso: '2026-04-30'
      })
    ).toBe(false);
  });
});
