import { filterItemsByAdvancedSearch, hasActiveAdvancedSearch } from '../../../src/web/react/app/listViewAdvancedSearch';

describe('listViewAdvancedSearch', () => {
  it('detects whether an advanced search has active criteria', () => {
    expect(hasActiveAdvancedSearch(undefined)).toBe(false);
    expect(hasActiveAdvancedSearch({ keyword: '   ' })).toBe(false);
    expect(hasActiveAdvancedSearch({ fieldFilters: { name: '   ' } })).toBe(false);
    expect(hasActiveAdvancedSearch({ fieldFilters: { tags: ['   ', ''] } })).toBe(false);
    expect(hasActiveAdvancedSearch({ keyword: 'bulgur' })).toBe(true);
    expect(hasActiveAdvancedSearch({ fieldFilters: { name: 'bulgur' } })).toBe(true);
    expect(hasActiveAdvancedSearch({ fieldFilters: { tags: ['A', ''] } })).toBe(true);
  });

  it('filters by keyword across configured fields', () => {
    const items = [
      { id: '1', name: 'Vegetables Bulgur', status: 'Active' },
      { id: '2', name: 'Soup', status: 'Closed' }
    ];
    const out = filterItemsByAdvancedSearch(items, { keyword: 'bulgur' }, { keywordFieldIds: ['name', 'status'] });
    expect(out.map(i => i.id)).toEqual(['1']);
  });

  it('filters by per-field values (AND behavior)', () => {
    const items = [
      { id: '1', name: 'Vegetables Bulgur', status: 'Active' },
      { id: '2', name: 'Vegetables Bulgur', status: 'Closed' }
    ];
    const out = filterItemsByAdvancedSearch(
      items,
      { fieldFilters: { name: 'bulgur', status: 'active' } },
      { keywordFieldIds: ['name', 'status'] }
    );
    expect(out.map(i => i.id)).toEqual(['1']);
  });

  it('matches YYYY-MM-DD against DATE/DATETIME fields using local date normalization', () => {
    const items = [
      { id: '1', DATE: new Date(2026, 0, 5) },
      { id: '2', DATE: new Date(2026, 0, 6) }
    ];
    const out = filterItemsByAdvancedSearch(
      items,
      { fieldFilters: { DATE: '2026-01-05' } },
      { keywordFieldIds: ['DATE'], fieldTypeById: { DATE: 'DATE' } }
    );
    expect(out.map(i => i.id)).toEqual(['1']);
  });

  it('supports multi-select CHECKBOX filters (matches any selected token)', () => {
    const items = [
      { id: '1', CAT: 'A, B' },
      { id: '2', CAT: 'C' }
    ];
    const out = filterItemsByAdvancedSearch(
      items,
      { fieldFilters: { CAT: ['B', 'X'] } },
      { keywordFieldIds: ['CAT'], fieldTypeById: { CAT: 'CHECKBOX' } }
    );
    expect(out.map(i => i.id)).toEqual(['1']);
  });
});

