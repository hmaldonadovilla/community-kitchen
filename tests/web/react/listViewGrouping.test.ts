import { groupListItemsByField } from '../../../src/web/react/app/listViewGrouping';

describe('listViewGrouping', () => {
  it('groups rows by field value and sorts group titles alphabetically when requested', () => {
    const groups = groupListItemsByField(
      [
        { id: '2', MP_DISTRIBUTOR: 'Le Phare' },
        { id: '1', MP_DISTRIBUTOR: 'Belliard' },
        { id: '3', MP_DISTRIBUTOR: 'Belliard' }
      ] as any,
      'MP_DISTRIBUTOR',
      { sort: 'asc' }
    );

    expect(groups.map(group => group.label)).toEqual(['Belliard', 'Le Phare']);
    expect(groups[0].items.map(item => item.id)).toEqual(['1', '3']);
  });
});
