import { evaluateDedupConflict } from '../src/services/dedup';
import { DedupRule } from '../src/types';

describe('evaluateDedupConflict', () => {
  const rule: DedupRule = {
    id: 'uniqueNameDate',
    scope: 'form',
    keys: ['name', 'date'],
    matchMode: 'caseInsensitive',
    onConflict: 'reject',
    message: { en: 'Duplicate', fr: 'Dupliqué' }
  };

  it('returns undefined when no rules', () => {
    const res = evaluateDedupConflict(undefined, { values: {}, id: '' }, []);
    expect(res).toBeUndefined();
  });

  it('detects conflict on matching composite keys', () => {
    const res = evaluateDedupConflict(
      [rule],
      { id: 'new', values: { name: 'Soup', date: '2024-01-01' } },
      [
        { id: 'existing', values: { name: 'soup', date: '2024-01-01' } }
      ],
      'en'
    );
    expect(res).toBe('Duplicate');
  });

  it('ignores self when ids match', () => {
    const res = evaluateDedupConflict(
      [rule],
      { id: 'same', values: { name: 'Soup', date: '2024-01-01' } },
      [
        { id: 'same', values: { name: 'soup', date: '2024-01-01' } }
      ],
      'en'
    );
    expect(res).toBeUndefined();
  });

  it('respects matchMode exact', () => {
    const res = evaluateDedupConflict(
      [{ ...rule, matchMode: 'exact' }],
      { id: 'new', values: { name: 'Soup', date: '2024-01-01' } },
      [
        { id: 'existing', values: { name: 'soup', date: '2024-01-01' } }
      ],
      'en'
    );
    expect(res).toBeUndefined();
  });
});
