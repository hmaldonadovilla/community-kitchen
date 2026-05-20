import { matchesWhenClause } from '../../../src/web/rules/visibility';
import { ConfigSheet } from '../../../src/config/ConfigSheet';

describe('when clause date comparisons', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    // Local-time timestamp (no timezone suffix) so the test is stable across environments.
    jest.setSystemTime(new Date('2025-12-20T09:15:00'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const ctx = (values: Record<string, any>) =>
    ({
      getValue: (fieldId: string) => values[fieldId]
    }) as any;

  it('matches isToday against local YYYY-MM-DD', () => {
    expect(matchesWhenClause({ fieldId: 'D', isToday: true } as any, ctx({ D: '2025-12-20' }))).toBe(true);
    expect(matchesWhenClause({ fieldId: 'D', isToday: true } as any, ctx({ D: '2025-12-19' }))).toBe(false);
    expect(matchesWhenClause({ fieldId: 'D', isToday: true } as any, ctx({ D: '' }))).toBe(false);
  });

  it('matches isInPast against local YYYY-MM-DD', () => {
    expect(matchesWhenClause({ fieldId: 'D', isInPast: true } as any, ctx({ D: '2025-12-19' }))).toBe(true);
    expect(matchesWhenClause({ fieldId: 'D', isInPast: true } as any, ctx({ D: '2025-12-20' }))).toBe(false);
    expect(matchesWhenClause({ fieldId: 'D', isInPast: true } as any, ctx({ D: '2025-12-21' }))).toBe(false);
    expect(matchesWhenClause({ fieldId: 'D', isInPast: true } as any, ctx({ D: null }))).toBe(false);
  });

  it('matches isInFuture against local YYYY-MM-DD', () => {
    expect(matchesWhenClause({ fieldId: 'D', isInFuture: true } as any, ctx({ D: '2025-12-21' }))).toBe(true);
    expect(matchesWhenClause({ fieldId: 'D', isInFuture: true } as any, ctx({ D: '2025-12-20' }))).toBe(false);
    expect(matchesWhenClause({ fieldId: 'D', isInFuture: true } as any, ctx({ D: '2025-12-19' }))).toBe(false);
    expect(matchesWhenClause({ fieldId: 'D', isInFuture: true } as any, ctx({ D: undefined }))).toBe(false);
  });

  it('parses date-like strings (local date-time) for comparisons', () => {
    expect(matchesWhenClause({ fieldId: 'D', isInFuture: true } as any, ctx({ D: '2025-12-21T08:00:00' }))).toBe(true);
    expect(matchesWhenClause({ fieldId: 'D', isInPast: true } as any, ctx({ D: '2025-12-19T23:59:59' }))).toBe(true);
  });

  it('parses DD/MM/YYYY values for comparisons', () => {
    expect(matchesWhenClause({ fieldId: 'D', isInPast: true } as any, ctx({ D: '19/12/2025' }))).toBe(true);
    expect(matchesWhenClause({ fieldId: 'D', isToday: true } as any, ctx({ D: '20/12/2025' }))).toBe(true);
    expect(matchesWhenClause({ fieldId: 'D', isInFuture: true } as any, ctx({ D: '21/12/2025' }))).toBe(true);
  });

  it('supports cross-field date comparisons', () => {
    expect(
      matchesWhenClause(
        { fieldId: 'LEFTOVER_EXP_DATE', greaterThanOrEqualFieldId: 'MP_PREP_DATE' } as any,
        ctx({ LEFTOVER_EXP_DATE: '2026-04-16', MP_PREP_DATE: '2026-04-16' })
      )
    ).toBe(true);
    expect(
      matchesWhenClause(
        { fieldId: 'LEFTOVER_EXP_DATE', greaterThanOrEqualFieldId: 'MP_PREP_DATE' } as any,
        ctx({ LEFTOVER_EXP_DATE: '2026-04-15', MP_PREP_DATE: '2026-04-16' })
      )
    ).toBe(false);
  });

  it('supports fixed date cutoffs for template selectors and rules', () => {
    expect(matchesWhenClause({ fieldId: 'D', beforeDate: '2026-05-20' } as any, ctx({ D: '2026-05-19' }))).toBe(true);
    expect(matchesWhenClause({ fieldId: 'D', beforeDate: '2026-05-20' } as any, ctx({ D: '2026-05-20' }))).toBe(false);
    expect(matchesWhenClause({ fieldId: 'D', onOrAfterDate: '2026-05-20' } as any, ctx({ D: '2026-05-20' }))).toBe(true);
    expect(matchesWhenClause({ fieldId: 'D', afterDate: '2026-05-20' } as any, ctx({ D: '2026-05-20' }))).toBe(false);
  });

  it('supports cross-field numeric comparisons', () => {
    expect(
      matchesWhenClause(
        { fieldId: 'LEFTOVER_QTY', lessThanOrEqualFieldId: 'LEFTOVER_QTY_MAX' } as any,
        ctx({ LEFTOVER_QTY: 500, LEFTOVER_QTY_MAX: 500 })
      )
    ).toBe(true);
    expect(
      matchesWhenClause(
        { fieldId: 'LEFTOVER_QTY', lessThanFieldId: 'LEFTOVER_QTY_MAX' } as any,
        ctx({ LEFTOVER_QTY: 501, LEFTOVER_QTY_MAX: 500 })
      )
    ).toBe(false);
  });

  it('keeps date operators when normalizing when clauses from sheet JSON', () => {
    const normalized = (ConfigSheet as any).normalizeWhenClause({
      fieldId: 'MP_PREP_DATE',
      isInFuture: true,
      greaterThanOrEqualFieldId: 'LEFTOVER_EXP_DATE',
      beforeDate: '2026-05-20'
    });
    expect(normalized).toEqual({
      fieldId: 'MP_PREP_DATE',
      isInFuture: true,
      greaterThanOrEqualFieldId: 'LEFTOVER_EXP_DATE',
      beforeDate: '2026-05-20'
    });
  });
});
