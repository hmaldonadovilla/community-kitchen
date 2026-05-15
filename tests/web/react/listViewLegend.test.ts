import { buildListViewLegendItems, collectListViewRuleIconsUsed } from '../../../src/web/react/app/listViewLegend';

describe('listViewLegend', () => {
  it('collects icons used by rule columns (cases + default)', () => {
    const columns: any[] = [
      {
        type: 'rule',
        fieldId: 'action',
        label: { en: 'Action' },
        cases: [{ text: 'Missing', icon: 'warning' }, { text: 'OK', icon: 'check' }],
        default: { text: '—', icon: 'info' }
      },
      { fieldId: 'Q1', kind: 'question' }
    ];
    expect(collectListViewRuleIconsUsed(columns as any)).toEqual(expect.arrayContaining(['warning', 'check', 'info']));
  });

  it('builds legend items only from configured entries (icons optional)', () => {
    const configured: any[] = [
      { icon: 'warning', pill: { text: { en: 'Draft' }, tone: 'muted' }, text: { en: 'Missing DATE' } },
      { text: { en: 'Click Action to open the record.' } }
    ];
    const legend = buildListViewLegendItems(configured as any, 'EN');

    expect(legend).toEqual([
      { icon: 'warning', text: 'Missing DATE', pill: { text: 'Draft', tone: 'muted' } },
      { text: 'Click Action to open the record.' }
    ]);
  });

  it('does not auto-create a legend when icons are used but legend is not configured', () => {
    expect(buildListViewLegendItems(undefined, 'EN')).toEqual([]);
  });
});
