import {
  resolveRowFlowActionPlan,
  resolveRowFlowSegmentActionIds,
  resolveRowFlowState
} from '../../../src/web/react/features/steps/domain/rowFlow';

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

  it('resolves deleteLineItems targetRef for leftovers including empty prep type rows', () => {
    const lineItems: any = {
      MEALS: [{ id: 'r1', values: { MP_IS_REHEAT: 'Yes' } }],
      'MEALS::r1::TYPE': [
        { id: 'tCook', values: { PREP_TYPE: 'Cook' } },
        { id: 'tEmpty', values: { PREP_TYPE: '' } },
        { id: 'tEntire', values: { PREP_TYPE: 'Entire dish' } }
      ]
    };

    const rowFlow: any = {
      references: {
        leftoverRows: {
          groupId: 'TYPE',
          match: 'any',
          rowFilter: {
            includeWhen: {
              any: [
                { fieldId: 'PREP_TYPE', equals: ['Entire dish', 'Part dish'] },
                { fieldId: 'PREP_TYPE', isEmpty: true }
              ]
            }
          }
        }
      },
      actions: [{ id: 'clearLeftovers', effects: [{ type: 'deleteLineItems', targetRef: 'leftoverRows' }] }]
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
      actionId: 'clearLeftovers',
      config: rowFlow,
      state,
      groupId: 'MEALS',
      rowId: 'r1',
      rowValues: { MP_IS_REHEAT: 'Yes' },
      lineItems,
      subGroupIds: ['TYPE']
    });

    expect(plan?.effects).toEqual([
      { type: 'deleteLineItems', groupKey: 'MEALS::r1::TYPE', rowIds: ['tEmpty', 'tEntire'] }
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
              overlayContextHeader: { fields: [{ fieldRef: 'MEAL_TYPE', label: { en: 'Meal {{value}}' } }] },
              overlayHelperText: { fields: [{ fieldRef: 'MEAL_TYPE', label: { en: 'Helper {{value}}' } }] }
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
      overlayContextHeader: { fields: [{ fieldRef: 'MEAL_TYPE', label: { en: 'Meal {{value}}' } }] },
      overlayHelperText: { fields: [{ fieldRef: 'MEAL_TYPE', label: { en: 'Helper {{value}}' } }] }
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

  it('resolves addLineItems and closeOverlay effects', () => {
    const lineItems: any = {
      MEALS: [{ id: 'r1', values: { MP_IS_REHEAT: 'Yes' } }],
      'MEALS::r1::TYPE': []
    };

    const rowFlow: any = {
      actions: [
        {
          id: 'addLeftover',
          effects: [
            { type: 'addLineItems', groupId: 'TYPE', preset: { PREP_TYPE: 'Cook' }, count: 2 },
            { type: 'closeOverlay' }
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
      actionId: 'addLeftover',
      config: rowFlow,
      state,
      groupId: 'MEALS',
      rowId: 'r1',
      rowValues: { MP_IS_REHEAT: 'Yes' },
      lineItems,
      subGroupIds: ['TYPE']
    });

    expect(plan?.effects).toEqual([
      { type: 'addLineItems', groupKey: 'MEALS::r1::TYPE', preset: { PREP_TYPE: 'Cook' }, count: 2 },
      { type: 'closeOverlay' }
    ]);
  });

  it('retains output actions when actionsScope is group', () => {
    const lineItems: any = {
      MEALS: [{ id: 'r1', values: { PREP_TYPE: 'Cook' } }]
    };

    const rowFlow: any = {
      output: {
        actionsScope: 'group',
        actions: [{ id: 'addLeftover' }]
      },
      actions: [{ id: 'addLeftover', effects: [{ type: 'addLineItems' }] }]
    };

    const state = resolveRowFlowState({
      config: rowFlow,
      groupId: 'MEALS',
      rowId: 'r1',
      rowValues: { PREP_TYPE: 'Cook' },
      lineItems,
      subGroupIds: []
    });

    expect(state?.outputActions.map(action => action.id)).toEqual(['addLeftover']);
  });

  it('resolves deleteRow effects for the current row', () => {
    const lineItems: any = {
      MEALS: [{ id: 'r1', values: { PREP_TYPE: 'Cook' } }]
    };

    const rowFlow: any = {
      actions: [
        {
          id: 'removeRow',
          effects: [{ type: 'deleteRow' }]
        }
      ]
    };

    const state = resolveRowFlowState({
      config: rowFlow,
      groupId: 'MEALS',
      rowId: 'r1',
      rowValues: { PREP_TYPE: 'Cook' },
      lineItems,
      subGroupIds: []
    });

    const plan = resolveRowFlowActionPlan({
      actionId: 'removeRow',
      config: rowFlow,
      state,
      groupId: 'MEALS',
      rowId: 'r1',
      rowValues: { PREP_TYPE: 'Cook' },
      lineItems,
      subGroupIds: []
    });

    expect(plan?.effects).toEqual([{ type: 'deleteRow', groupKey: 'MEALS', rowId: 'r1' }]);
  });

  it('normalizes output segment action ids', () => {
    const segment: any = {
      fieldRef: 'LEFTOVER_INFO',
      editAction: 'openOverlay',
      editActions: ['deleteRow', 'openOverlay', '  ', null]
    };

    expect(resolveRowFlowSegmentActionIds(segment)).toEqual(['openOverlay', 'deleteRow']);
  });
});
