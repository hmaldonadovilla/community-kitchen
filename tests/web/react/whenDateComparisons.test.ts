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

  it('keeps date operators when normalizing when clauses from sheet JSON', () => {
    const normalized = (ConfigSheet as any).normalizeWhenClause({ fieldId: 'MP_PREP_DATE', isInFuture: true });
    expect(normalized).toEqual({ fieldId: 'MP_PREP_DATE', isInFuture: true });
  });
});

