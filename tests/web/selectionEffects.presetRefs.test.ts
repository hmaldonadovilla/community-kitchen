import { handleSelectionEffects } from '../../src/web/effects/selectionEffects';

describe('selectionEffects.addLineItems preset references', () => {
  it('resolves $row.FIELD_ID from the originating line-item row', () => {
    const question: any = {
      id: 'MP_IS_REHEAT',
      selectionEffects: [
        {
          type: 'addLineItems',
          groupId: 'MP_LINES',
          triggerValues: ['Yes'],
          preset: {
            MEAL_TYPE: '$row.MEAL_TYPE'
          }
        }
      ]
    };

    const ctx = {
      addLineItemRow: jest.fn()
    };

    handleSelectionEffects(
      { questions: [] } as any,
      question as any,
      'Yes' as any,
      'EN' as any,
      ctx as any,
      {
        lineItem: { groupId: 'MP_LINES', rowId: 'r1', rowValues: { MEAL_TYPE: 'Dinner' } },
        topValues: { MEAL_DATE: '2025-12-20' }
      } as any
    );

    expect(ctx.addLineItemRow).toHaveBeenCalledWith('MP_LINES', { MEAL_TYPE: 'Dinner' });
  });

  it('resolves $top.FIELD_ID from top-level values', () => {
    const question: any = {
      id: 'TRIGGER',
      selectionEffects: [
        {
          type: 'addLineItems',
          groupId: 'LINES',
          preset: {
            SERVICE_DATE: '$top.MEAL_DATE'
          }
        }
      ]
    };

    const ctx = {
      addLineItemRow: jest.fn()
    };

    handleSelectionEffects(
      { questions: [] } as any,
      question as any,
      'Anything' as any,
      'EN' as any,
      ctx as any,
      {
        topValues: { MEAL_DATE: '2025-12-20' }
      } as any
    );

    expect(ctx.addLineItemRow).toHaveBeenCalledWith('LINES', { SERVICE_DATE: '2025-12-20' });
  });
});


