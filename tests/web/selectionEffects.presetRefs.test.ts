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

  it('passes selectionEffects.id through to addLineItemRow meta so created rows can be tagged', () => {
    const question: any = {
      id: 'TRIGGER',
      selectionEffects: [
        {
          id: 'rule_meals_auto',
          type: 'addLineItems',
          groupId: 'LINES',
          preset: { SERVICE_DATE: '2025-12-20' }
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
      { topValues: {} } as any
    );

    expect(ctx.addLineItemRow).toHaveBeenCalledWith('LINES', { SERVICE_DATE: '2025-12-20' }, { effectId: 'rule_meals_auto' });
  });

  it('passes selectionEffects.hideRemoveButton through to addLineItemRow meta when configured', () => {
    const question: any = {
      id: 'TRIGGER',
      selectionEffects: [
        {
          type: 'addLineItems',
          groupId: 'LINES',
          hideRemoveButton: true,
          preset: { SERVICE_DATE: '2025-12-20' }
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
      { topValues: {} } as any
    );

    expect(ctx.addLineItemRow).toHaveBeenCalledWith('LINES', { SERVICE_DATE: '2025-12-20' }, { hideRemoveButton: true });
  });

  it('normalizes non-string selectionEffects.id when passing through to addLineItemRow', () => {
    const question: any = {
      id: 'TRIGGER',
      selectionEffects: [
        {
          id: 42,
          type: 'addLineItems',
          groupId: 'LINES',
          preset: { SERVICE_DATE: '2025-12-20' }
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
      { topValues: {} } as any
    );

    expect(ctx.addLineItemRow).toHaveBeenCalledWith('LINES', { SERVICE_DATE: '2025-12-20' }, { effectId: '42' });
  });

  it('dispatches selectionEffects.deleteLineItems to ctx.deleteLineItemRows', () => {
    const question: any = {
      id: 'TRIGGER',
      selectionEffects: [
        {
          type: 'deleteLineItems',
          groupId: 'MP_LINES',
          targetEffectId: 'leftover',
          triggerValues: ['No']
        }
      ]
    };

    const ctx = {
      addLineItemRow: jest.fn(),
      deleteLineItemRows: jest.fn()
    };

    handleSelectionEffects(
      { questions: [] } as any,
      question as any,
      'No' as any,
      'EN' as any,
      ctx as any,
      {
        lineItem: { groupId: 'MP_LINES', rowId: 'r1', rowValues: { MEAL_TYPE: 'Dinner' } },
        topValues: {}
      } as any
    );

    expect(ctx.deleteLineItemRows).toHaveBeenCalledWith('MP_LINES', {
      effectId: 'leftover',
      parentGroupId: 'MP_LINES',
      parentRowId: 'r1'
    });
  });
});

