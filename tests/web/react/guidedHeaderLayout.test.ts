import {
  buildGuidedHeaderRows,
  resolveGuidedHeaderLayout
} from '../../../src/web/react/features/lineItems/domain/guidedHeaderLayout';

describe('guided header layout domain', () => {
  test('groups pairable fields into header rows', () => {
    const fields = [
      { id: 'a', pair: 'p1', type: 'TEXT' },
      { id: 'b', pair: 'p1', type: 'NUMBER' },
      { id: 'c', pair: 'p1', type: 'CHOICE' },
      { id: 'd', pair: 'p1', type: 'DATE' },
      { id: 'e', type: 'PARAGRAPH' }
    ];

    expect(buildGuidedHeaderRows(fields).map(row => row.map(field => field.id))).toEqual([
      ['a', 'b', 'c'],
      ['d'],
      ['e']
    ]);
  });

  test('deduplicates compact header rows', () => {
    expect(buildGuidedHeaderRows([{ id: 'x' }, { id: 'x' }, { id: 'y' }]).map(row => row.map(field => field.id))).toEqual([
      ['x', 'y']
    ]);
  });

  test('resolves guided header and body fields without duplicating title or summary fields', () => {
    const fields = [
      { id: 'title' },
      { id: 'summary' },
      { id: 'first', ui: { renderAsLabel: true } },
      { id: 'second', ui: { renderAsLabel: true } },
      { id: 'body', pair: 'details' },
      { id: 'hiddenCollapsed' }
    ];

    const layout = resolveGuidedHeaderLayout({
      guidedCollapsedFieldsInHeader: true,
      collapsedFieldsOrdered: fields,
      fieldsToRender: fields.filter(field => field.id !== 'title'),
      showAnchorTitleAsHeaderTitle: true,
      anchorFieldId: 'title',
      showTitleControlInHeader: false,
      titleFieldId: '',
      guidedCompactHeaderSummaryFieldIdSet: new Set(['summary']),
      collapsedFieldConfigs: [
        { fieldId: 'first' },
        { fieldId: 'second' },
        { fieldId: 'hiddenCollapsed' }
      ],
      guidedCompactHeaderSummaryText: '',
      hasExplicitRowHeaderSummary: false,
      isProgressive: true,
      rowCollapsed: false
    });

    expect(layout.headerFieldsToRender.map(field => field.id)).toEqual(['first', 'second', 'body']);
    expect(layout.bodyFieldsToRender).toEqual([]);
  });

  test('removes compact summary fields from collapsed progressive body rows', () => {
    const fields = [{ id: 'compact' }, { id: 'visible' }];
    const layout = resolveGuidedHeaderLayout({
      guidedCollapsedFieldsInHeader: false,
      collapsedFieldsOrdered: [],
      fieldsToRender: fields,
      showAnchorTitleAsHeaderTitle: false,
      anchorFieldId: '',
      showTitleControlInHeader: false,
      titleFieldId: '',
      guidedCompactHeaderSummaryFieldIdSet: new Set(),
      collapsedFieldConfigs: [{ fieldId: 'compact', showLabel: false }],
      guidedCompactHeaderSummaryText: '',
      hasExplicitRowHeaderSummary: false,
      isProgressive: true,
      rowCollapsed: true
    });

    expect(layout.headerFieldsToRender).toEqual([]);
    expect(layout.bodyFieldsToRender.map(field => field.id)).toEqual(['visible']);
  });
});
