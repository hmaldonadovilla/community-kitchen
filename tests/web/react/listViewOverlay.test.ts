import { buildGroupedOverlayTableSections } from '../../../src/web/react/app/listViewOverlay';

describe('listViewOverlay', () => {
  it('builds grouped overlay sections with table columns excluding the group-by field', () => {
    const sections = buildGroupedOverlayTableSections({
      items: [
        { id: '1', MP_DISTRIBUTOR: 'Belliard', MP_PREP_DATE: '2026-04-10', MP_SERVICE: 'Lunch' },
        { id: '2', MP_DISTRIBUTOR: 'HUB', MP_PREP_DATE: '2026-04-11', MP_SERVICE: 'Dinner' }
      ] as any,
      groupByFieldId: 'MP_DISTRIBUTOR',
      columns: [
        { fieldId: 'MP_DISTRIBUTOR', label: { en: 'Customer' } },
        { fieldId: 'MP_PREP_DATE', label: { en: 'Date' } },
        { fieldId: 'MP_SERVICE', label: { en: 'Service' } },
        { fieldId: 'action', label: { en: 'Action' }, type: 'rule' as any }
      ] as any,
      groupTitleSuffixText: 'last 7 days'
    });

    expect(sections).toHaveLength(2);
    expect(sections[0]?.title).toBe('Belliard last 7 days');
    expect(sections[0]?.columns.map(col => col.fieldId)).toEqual(['MP_PREP_DATE', 'MP_SERVICE', 'action']);
    expect(sections[0]?.items.map(item => item.id)).toEqual(['1']);
    expect(sections[1]?.title).toBe('HUB last 7 days');
  });

  it('falls back to the original columns when filtering would remove every table column', () => {
    const sections = buildGroupedOverlayTableSections({
      items: [{ id: '1', MP_DISTRIBUTOR: 'Belliard' }] as any,
      groupByFieldId: 'MP_DISTRIBUTOR',
      columns: [{ fieldId: 'MP_DISTRIBUTOR', label: { en: 'Customer' } }] as any
    });

    expect(sections[0]?.columns.map(col => col.fieldId)).toEqual(['MP_DISTRIBUTOR']);
  });
});
