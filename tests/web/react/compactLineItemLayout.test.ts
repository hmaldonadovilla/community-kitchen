import { deriveCompactLineItemLayout, shouldRenderCompactLineItemRow } from '../../../src/web/react/app/compactLineItemLayout';

describe('deriveCompactLineItemLayout', () => {
  it('groups checkbox, primary/meta labels, and inline controls for compact leftover rows', () => {
    const layout = deriveCompactLineItemLayout([
      { id: 'LEFTOVER_SELECTED', type: 'CHECKBOX', ui: { hideLabel: true } },
      { id: 'LEFTOVER_RECIPE', type: 'TEXT', readOnly: true, ui: { renderAsLabel: true, hideLabel: true } },
      { id: 'LEFTOVER_META_ENTIRE', type: 'TEXT', readOnly: true, ui: { renderAsLabel: true, hideLabel: true } },
      { id: 'LEFTOVER_UNIT', type: 'TEXT', readOnly: true, pair: 'leftover_use_qty', ui: { renderAsLabel: true, hideLabel: true } },
      { id: 'LEFTOVER_USE_QTY', type: 'NUMBER', pair: 'leftover_use_qty' },
      { id: 'LEFTOVER_USAGE_MODE', type: 'CHOICE' }
    ] as any);

    expect(layout.leadingFieldIds).toEqual(['LEFTOVER_SELECTED']);
    expect(layout.primaryFieldId).toBe('LEFTOVER_RECIPE');
    expect(layout.metaFieldIds).toEqual(['LEFTOVER_META_ENTIRE']);
    expect(layout.inlineFieldIds).toEqual(['LEFTOVER_USE_QTY', 'LEFTOVER_USAGE_MODE']);
    expect(layout.attachedDisplayFieldIdsByControl).toEqual({
      LEFTOVER_USE_QTY: ['LEFTOVER_UNIT']
    });
  });
});

describe('shouldRenderCompactLineItemRow', () => {
  it('hides rows without an anchor value when configured', () => {
    expect(
      shouldRenderCompactLineItemRow({
        rowValues: {
          LEFTOVER_ID: '',
          LEFTOVER_USE_QTY: '',
          LEFTOVER_SELECTED: false
        },
        anchorFieldId: 'LEFTOVER_ID',
        hideRowsWithoutAnchor: true
      })
    ).toBe(false);
  });

  it('keeps rows with an anchor value when configured', () => {
    expect(
      shouldRenderCompactLineItemRow({
        rowValues: {
          LEFTOVER_ID: 'LP-1',
          LEFTOVER_USE_QTY: '250',
          LEFTOVER_SELECTED: true
        },
        anchorFieldId: 'LEFTOVER_ID',
        hideRowsWithoutAnchor: true
      })
    ).toBe(true);
  });
});
