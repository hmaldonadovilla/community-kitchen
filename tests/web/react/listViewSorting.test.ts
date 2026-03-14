import { sortListItems } from '../../../src/web/react/app/listViewSorting';

describe('listViewSorting', () => {
  it('uses configured tie-breakers even when the sorted fields are hidden from the main list', () => {
    const items = [
      { id: '3', MP_PREP_DATE: '2026-02-04', MP_DISTRIBUTOR: 'HUB', MP_SERVICE: 'Lunch', updatedAt: '2026-02-04T12:00:00Z' },
      { id: '2', MP_PREP_DATE: '2026-02-04', MP_DISTRIBUTOR: 'Belliard', MP_SERVICE: 'Lunch', updatedAt: '2026-02-04T11:00:00Z' },
      { id: '1', MP_PREP_DATE: '2026-02-04', MP_DISTRIBUTOR: 'Belliard', MP_SERVICE: 'Dinner', updatedAt: '2026-02-04T10:00:00Z' }
    ] as any[];

    const questions = [
      { id: 'MP_PREP_DATE', listView: false, listViewSort: { priority: 1, direction: 'desc' } },
      { id: 'MP_DISTRIBUTOR', listView: false, listViewSort: { priority: 2, direction: 'asc' } },
      { id: 'MP_SERVICE', listView: false, listViewSort: { priority: 3, direction: 'asc' } }
    ] as any;

    const sorted = sortListItems({
      items: items as any,
      sortField: 'MP_PREP_DATE',
      sortDirection: 'desc',
      questions,
      fieldTypeById: {
        MP_PREP_DATE: 'DATE',
        MP_DISTRIBUTOR: 'CHOICE',
        MP_SERVICE: 'CHOICE',
        updatedAt: 'DATETIME'
      }
    });

    expect(sorted.map(item => `${item.MP_DISTRIBUTOR}:${item.MP_SERVICE}`)).toEqual([
      'Belliard:Dinner',
      'Belliard:Lunch',
      'HUB:Lunch'
    ]);
  });
});
