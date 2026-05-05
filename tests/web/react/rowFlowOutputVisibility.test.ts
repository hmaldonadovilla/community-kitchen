import type { VisibilityContext } from '../../../src/web/types';
import {
  resolveVisibleRowFlowOutputSegments,
  shouldRenderRowFlowOutputField
} from '../../../src/web/react/features/steps/domain/rowFlowOutputVisibility';

const ctx: VisibilityContext = {
  getValue: () => undefined,
  getLineValue: () => undefined,
  getLineItems: () => [],
  getLineItemKeys: () => []
};

describe('rowFlow output visibility', () => {
  it('keeps hidden derived fields visible in display segments', () => {
    const visible = shouldRenderRowFlowOutputField({
      segment: {
        id: 'leftoverRows.LEFTOVER_SUMMARY',
        config: { fieldRef: 'leftoverRows.LEFTOVER_SUMMARY' },
        target: null,
        values: [],
        fallbackTarget: null,
        fallbackValues: []
      } as any,
      field: { visibility: { hideWhen: { fieldId: 'ALWAYS', equals: [true] } } },
      ctx: {
        ...ctx,
        getValue: (fieldId: string) => (fieldId === 'ALWAYS' ? true : undefined)
      }
    });

    expect(visible).toBe(true);
  });

  it('still hides control segments when the field is hidden', () => {
    const visible = shouldRenderRowFlowOutputField({
      segment: {
        id: 'cookRow.PREP_QTY',
        config: { fieldRef: 'cookRow.PREP_QTY', renderAs: 'control' },
        target: null,
        values: [],
        fallbackTarget: null,
        fallbackValues: []
      } as any,
      field: { visibility: { hideWhen: { fieldId: 'ALWAYS', equals: [true] } } },
      ctx: {
        ...ctx,
        getValue: (fieldId: string) => (fieldId === 'ALWAYS' ? true : undefined)
      }
    });

    expect(visible).toBe(false);
  });

  it('filters visible output segments while always keeping text and spacer segments', () => {
    const segments = [
      { id: 'text', config: { type: 'text' }, target: null, values: [], fallbackTarget: null, fallbackValues: [] },
      { id: 'spacer', config: { type: 'spacer' }, target: null, values: [], fallbackTarget: null, fallbackValues: [] },
      {
        id: 'hiddenControl',
        config: { fieldRef: 'row.FIELD', renderAs: 'control' },
        target: {
          groupKey: 'ROWS',
          fieldId: 'FIELD',
          primaryRow: { row: { id: 'targetRow', values: { ALWAYS: true } } },
          parentValues: {}
        },
        values: ['x'],
        fallbackTarget: null,
        fallbackValues: []
      },
      {
        id: 'visibleDisplay',
        config: { fieldRef: 'row.HELPER' },
        target: {
          groupKey: 'ROWS',
          fieldId: 'HELPER',
          primaryRow: { row: { id: 'targetRow', values: { ALWAYS: true } } },
          parentValues: {}
        },
        values: ['x'],
        fallbackTarget: null,
        fallbackValues: []
      }
    ] as any[];

    const visible = resolveVisibleRowFlowOutputSegments({
      segments,
      currentRowId: 'currentRow',
      resolveFieldConfig: (_groupKey, fieldId) => ({
        visibility: fieldId === 'FIELD' ? { hideWhen: { fieldId: 'ALWAYS', equals: [true] } } : undefined
      }),
      buildFieldContext: ({ rowValues }) => ({
        ...ctx,
        getValue: (fieldId: string) => (rowValues as any)[fieldId]
      })
    });

    expect(visible.map(segment => segment.id)).toEqual(['text', 'spacer', 'visibleDisplay']);
  });
});
