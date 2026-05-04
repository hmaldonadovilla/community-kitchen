const {
  shiftIsoDate,
  shouldApplyLifecycleStatusDateRule
} = require('../cloud-run/api/domain/lifecycleRules');

describe('Cloud Run lifecycle rule domain', () => {
  test('matches Apps Script lifecycle status/date rule behavior', () => {
    expect(shiftIsoDate('2026-04-30', -2)).toBe('2026-04-28');
    expect(
      shouldApplyLifecycleStatusDateRule({
        rule: { fromStatuses: ['Available'], compare: 'beforeToday' },
        currentStatus: 'available',
        rawDateValue: '2026-04-29',
        todayIso: '2026-04-30'
      })
    ).toBe(true);
    expect(
      shouldApplyLifecycleStatusDateRule({
        rule: { fromStatuses: ['Available'], compare: 'onOrBeforeToday' },
        currentStatus: 'available',
        rawDateValue: '2026-04-30',
        todayIso: '2026-04-30'
      })
    ).toBe(true);
  });
});
