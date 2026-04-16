import type { VisibilityContext } from '../../../src/web/types';
import { shouldRenderRowFlowOutputField } from '../../../src/web/react/features/steps/domain/rowFlowOutputVisibility';

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
});
