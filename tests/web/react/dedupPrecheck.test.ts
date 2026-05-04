import {
  collectDedupKeyFieldIds,
  computeDedupKeyFieldIdMap,
  computeDedupKeyFingerprint,
  computeDedupSignatureFromValues
} from '../../../src/web/react/app/dedupPrecheck';

describe('dedupPrecheck', () => {
  const rules = [
    { id: 'meal', onConflict: 'reject', keys: ['CUSTOMER', 'SERVICE', 'DATE'] },
    { id: 'ignored', onConflict: 'ignore', keys: ['OTHER'] },
    { id: 'case-duplicate', keys: ['customer', 'LOCATION'] },
    { id: 'empty', onConflict: 'reject', keys: [] }
  ];

  it('collects unique reject dedup key field ids in first-seen order', () => {
    expect(collectDedupKeyFieldIds(rules)).toEqual(['CUSTOMER', 'SERVICE', 'DATE', 'LOCATION']);
  });

  it('builds a case-insensitive dedup key field map', () => {
    expect(computeDedupKeyFieldIdMap(rules)).toEqual({
      CUSTOMER: true,
      customer: true,
      SERVICE: true,
      service: true,
      DATE: true,
      date: true,
      LOCATION: true,
      location: true
    });
  });

  it('computes sorted reject-rule signatures only when all rule values are present', () => {
    const values = {
      CUSTOMER: ' Belliard ',
      SERVICE: 'Lunch',
      DATE: '2026-05-04',
      LOCATION: '',
      OTHER: 'ignored'
    };

    expect(computeDedupSignatureFromValues(rules, values)).toBe('meal:Belliard||Lunch||2026-05-04');
  });

  it('normalizes array values in signatures and fingerprints', () => {
    const multiKeyRules = [{ id: 'combo', onConflict: 'reject', keys: ['A', 'B'] }];
    const values = { A: ['x', 'y'], B: 4 };

    expect(computeDedupSignatureFromValues(multiKeyRules, values)).toBe('combo:x|y||4');
    expect(computeDedupKeyFingerprint(multiKeyRules, values)).toBe('A=x|y|B=4');
  });

  it('returns empty signatures when no reject rule can be evaluated', () => {
    expect(computeDedupSignatureFromValues([{ id: 'x', onConflict: 'ignore', keys: ['A'] }], { A: '1' })).toBe('');
    expect(computeDedupKeyFingerprint([{ id: 'x', onConflict: 'ignore', keys: ['A'] }], { A: '1' })).toBe('');
  });
});
