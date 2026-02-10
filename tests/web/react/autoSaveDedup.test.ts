import {
  buildFieldIdMap,
  filterDedupRulesForPrecheck,
  getValueByFieldId,
  hasIncompleteConfiguredFields,
  normalizeFieldIdList,
  resolveDedupCheckDialogCopy
} from '../../../src/web/react/app/autoSaveDedup';

describe('autoSaveDedup helpers', () => {
  it('normalizes field id list from arrays and CSV', () => {
    expect(normalizeFieldIdList([' INGREDIENT_NAME ', 'created_by', 'INGREDIENT_NAME'])).toEqual([
      'INGREDIENT_NAME',
      'created_by'
    ]);
    expect(normalizeFieldIdList('INGREDIENT_NAME, CREATED_BY , INGREDIENT_NAME')).toEqual([
      'INGREDIENT_NAME',
      'CREATED_BY'
    ]);
  });

  it('builds case-insensitive field id map', () => {
    const map = buildFieldIdMap(['INGREDIENT_NAME']);
    expect(map.INGREDIENT_NAME).toBe(true);
    expect(map.ingredient_name).toBe(true);
  });

  it('reads values with case-insensitive field ids', () => {
    expect(getValueByFieldId({ ingredient_name: 'Tomato' }, 'INGREDIENT_NAME')).toBe('Tomato');
  });

  it('checks incomplete configured autosave fields', () => {
    expect(hasIncompleteConfiguredFields(['CREATED_BY'], { CREATED_BY: '' })).toBe(true);
    expect(hasIncompleteConfiguredFields(['CREATED_BY'], { CREATED_BY: 'Alice' })).toBe(false);
  });

  it('filters dedup rules using trigger fields', () => {
    const rules = [
      { id: 'name-only', onConflict: 'reject', keys: ['INGREDIENT_NAME'] },
      { id: 'name-and-created', onConflict: 'reject', keys: ['INGREDIENT_NAME', 'CREATED_BY'] },
      { id: 'warn-rule', onConflict: 'warn', keys: ['INGREDIENT_NAME'] }
    ];
    const filtered = filterDedupRulesForPrecheck(rules, ['INGREDIENT_NAME']);
    expect(filtered.map((r: any) => r.id)).toEqual(['name-only']);
  });

  it('resolves dedup check dialog copy with defaults and overrides', () => {
    const copy = resolveDedupCheckDialogCopy(
      {
        checkingTitle: { en: 'Checking ingredient name' },
        availableAutoCloseMs: 1300
      },
      'EN',
      {
        checkingMessage: 'Checking...',
        availableTitle: 'Available',
        availableMessage: 'Continue',
        duplicateTitle: 'Duplicate',
        duplicateMessage: 'Exists'
      }
    );

    expect(copy.enabled).toBe(true);
    expect(copy.checkingTitle).toBe('Checking ingredient name');
    expect(copy.checkingMessage).toBe('Checking...');
    expect(copy.availableAutoCloseMs).toBe(1300);
    expect(copy.duplicateAutoCloseMs).toBe(900);
  });
});

