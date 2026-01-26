import { resolveRowFlowActionPlan, resolveRowFlowState } from '../../../src/web/react/features/steps/domain/rowFlow';

describe('rowFlow domain', () => {
  it('resolves references and output segments for nested groups', () => {
    const lineItems: any = {
      MEALS: [{ id: 'r1', values: { MEAL_TYPE: 'Veg', QTY: 10 } }],
      'MEALS::r1::TYPE': [{ id: 't1', values: { PREP_TYPE: 'Cook', RECIPE: 'Pasta', PREP_QTY: 10 } }],
      'MEALS::r1::TYPE::t1::ING': [
        { id: 'i1', values: { ING: 'Tomato' } },
        { id: 'i2', values: { ING: 'Onion' } }
      ]
    };

    const rowFlow: any = {
      references: {
        typeRef: { groupId: 'TYPE' },
        ingRef: { groupId: 'ING', parentRef: 'typeRef' }
      },
      output: {
        hideEmpty: true,
        segments: [
          { fieldRef: 'MEAL_TYPE' },
          { fieldRef: 'QTY' },
          { fieldRef: 'typeRef.RECIPE' },
          { fieldRef: 'ingRef.ING', format: { type: 'list', listDelimiter: ', ' } }
        ]
      },
      prompts: []
    };

    const state = resolveRowFlowState({
      config: rowFlow,
      groupId: 'MEALS',
      rowId: 'r1',
      rowValues: { MEAL_TYPE: 'Veg', QTY: 10 },
      lineItems,
      subGroupIds: ['TYPE']
    });

    expect(state?.segments.map(segment => segment.config.fieldRef)).toEqual([
      'MEAL_TYPE',
      'QTY',
      'typeRef.RECIPE',
      'ingRef.ING'
    ]);
    const ingSegment = state?.segments.find(segment => segment.config.fieldRef === 'ingRef.ING');
    expect(ingSegment?.values).toEqual(['Tomato', 'Onion']);
  });

  it('selects the first incomplete prompt while keeping completed prompts visible', () => {
    const lineItems: any = {
      MEALS: [{ id: 'r1', values: { MP_IS_REHEAT: 'No' } }],
      'MEALS::r1::TYPE': [{ id: 't1', values: { RECIPE: 'Pasta', PREP_QTY: '' } }]
    };

    const rowFlow: any = {
      references: {
        typeRef: { groupId: 'TYPE' }
      },
      prompts: [
        { id: 'leftovers', fieldRef: 'MP_IS_REHEAT', hideWhenFilled: true },
        { id: 'recipe', fieldRef: 'typeRef.RECIPE', keepVisibleWhenFilled: true },
        { id: 'qty', fieldRef: 'typeRef.PREP_QTY' }
      ]
    };

    const state = resolveRowFlowState({
      config: rowFlow,
      groupId: 'MEALS',
      rowId: 'r1',
      rowValues: { MP_IS_REHEAT: 'No' },
      lineItems,
      subGroupIds: ['TYPE']
    });

    expect(state?.activePromptId).toBe('qty');
    const recipePrompt = state?.prompts.find(prompt => prompt.id === 'recipe');
    expect(recipePrompt?.complete).toBe(true);
    expect(recipePrompt?.visible).toBe(true);
  });

  it('builds action plans for row updates and deletions', () => {
    const lineItems: any = {
      MEALS: [{ id: 'r1', values: { MP_IS_REHEAT: 'Yes' } }],
      'MEALS::r1::TYPE': [{ id: 't1', values: { PREP_TYPE: 'Cook' } }]
    };

    const rowFlow: any = {
      references: {
        typeRef: { groupId: 'TYPE' }
      },
      actions: [
        {
          id: 'resetLeftovers',
          effects: [
            { type: 'setValue', fieldRef: 'MP_IS_REHEAT', value: '' },
            { type: 'deleteLineItems', targetRef: 'typeRef' }
          ]
        }
      ]
    };

    const state = resolveRowFlowState({
      config: rowFlow,
      groupId: 'MEALS',
      rowId: 'r1',
      rowValues: { MP_IS_REHEAT: 'Yes' },
      lineItems,
      subGroupIds: ['TYPE']
    });

    const plan = resolveRowFlowActionPlan({
      actionId: 'resetLeftovers',
      config: rowFlow,
      state,
      groupId: 'MEALS',
      rowId: 'r1',
      rowValues: { MP_IS_REHEAT: 'Yes' },
      lineItems,
      subGroupIds: ['TYPE']
    });

    expect(plan?.effects).toEqual([
      { type: 'setValue', groupKey: 'MEALS', rowId: 'r1', fieldId: 'MP_IS_REHEAT', value: '' },
      { type: 'deleteLineItems', groupKey: 'MEALS::r1::TYPE', rowIds: ['t1'] }
    ]);
  });

  it('resolves openOverlay effects with conditions and overrides', () => {
    const lineItems: any = {
      MEALS: [{ id: 'r1', values: { MP_IS_REHEAT: 'Yes', MEAL_TYPE: 'Veg' } }],
      'MEALS::r1::TYPE': [{ id: 't1', values: { PREP_TYPE: 'Cook' } }]
    };

    const rowFlow: any = {
      references: {
        typeRef: { groupId: 'TYPE' }
      },
      actions: [
        {
          id: 'openLeftovers',
          effects: [
            {
              type: 'openOverlay',
              groupId: 'TYPE',
              when: { fieldId: 'MP_IS_REHEAT', equals: ['Yes'] },
              rowFilter: { includeWhen: { fieldId: 'PREP_TYPE', equals: ['Cook'] } },
              label: { en: 'Edit' },
              groupOverride: { maxRows: 1 },
              rowFlow: { output: { segments: [{ fieldRef: 'PREP_TYPE' }] } },
              overlayContextHeader: { fields: [{ fieldRef: 'MEAL_TYPE', label: { en: 'Meal {{value}}' } }] }
            }
          ]
        }
      ]
    };

    const state = resolveRowFlowState({
      config: rowFlow,
      groupId: 'MEALS',
      rowId: 'r1',
      rowValues: { MP_IS_REHEAT: 'Yes', MEAL_TYPE: 'Veg' },
      lineItems,
      subGroupIds: ['TYPE']
    });

    const plan = resolveRowFlowActionPlan({
      actionId: 'openLeftovers',
      config: rowFlow,
      state,
      groupId: 'MEALS',
      rowId: 'r1',
      rowValues: { MP_IS_REHEAT: 'Yes', MEAL_TYPE: 'Veg' },
      lineItems,
      subGroupIds: ['TYPE']
    });

    expect(plan?.effects).toHaveLength(1);
    expect(plan?.effects[0]).toMatchObject({
      type: 'openOverlay',
      targetKind: 'sub',
      key: 'MEALS::r1::TYPE',
      rowFilter: { includeWhen: { fieldId: 'PREP_TYPE', equals: ['Cook'] } },
      label: { en: 'Edit' },
      groupOverride: { maxRows: 1 },
      rowFlow: { output: { segments: [{ fieldRef: 'PREP_TYPE' }] } },
      overlayContextHeader: { fields: [{ fieldRef: 'MEAL_TYPE', label: { en: 'Meal {{value}}' } }] }
    });

    const planWhenNo = resolveRowFlowActionPlan({
      actionId: 'openLeftovers',
      config: rowFlow,
      state,
      groupId: 'MEALS',
      rowId: 'r1',
      rowValues: { MP_IS_REHEAT: 'No', MEAL_TYPE: 'Veg' },
      lineItems,
      subGroupIds: ['TYPE']
    });

    expect(planWhenNo?.effects).toHaveLength(0);
  });
});
