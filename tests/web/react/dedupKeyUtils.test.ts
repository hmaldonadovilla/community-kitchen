import { collectRejectDedupKeyFieldIds, hasIncompleteRejectDedupKeys } from '../../../src/web/react/app/dedupKeyUtils';

describe('dedupKeyUtils', () => {
  it('collects unique reject-rule key ids in first-seen order', () => {
    const rules = [
      { id: 'r1', onConflict: 'reject', keys: ['A', 'B'] },
      { id: 'r2', onConflict: 'ignore', keys: ['C'] },
      { id: 'r3', onConflict: 'reject', keys: ['b', 'D'] },
      { id: 'r4', keys: ['E'] }
    ];
    expect(collectRejectDedupKeyFieldIds(rules)).toEqual(['A', 'B', 'D', 'E']);
  });

  it('returns true when at least one reject dedup key is missing', () => {
    const rules = [{ id: 'r1', onConflict: 'reject', keys: ['MP_DISTRIBUTOR', 'MP_SERVICE', 'MP_PREP_DATE'] }];
    const values = {
      MP_DISTRIBUTOR: 'Belliard',
      MP_PREP_DATE: '2026-02-08',
      MP_SERVICE: ''
    };
    expect(hasIncompleteRejectDedupKeys(rules, values)).toBe(true);
  });

  it('returns false when all reject dedup keys are populated', () => {
    const rules = [{ id: 'r1', onConflict: 'reject', keys: ['MP_DISTRIBUTOR', 'MP_SERVICE', 'MP_PREP_DATE'] }];
    const values = {
      MP_DISTRIBUTOR: 'Belliard',
      MP_PREP_DATE: '2026-02-08',
      MP_SERVICE: 'Lunch'
    };
    expect(hasIncompleteRejectDedupKeys(rules, values)).toBe(false);
  });

  it('returns false when there are no reject dedup keys', () => {
    const rules = [{ id: 'r1', onConflict: 'ignore', keys: ['A'] }];
    expect(hasIncompleteRejectDedupKeys(rules, { A: '' })).toBe(false);
  });
});

