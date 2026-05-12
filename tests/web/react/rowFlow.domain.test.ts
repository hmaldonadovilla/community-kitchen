import {
  resolveRowFlowActionEnabled,
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

  it('keeps text segments and unique list output for nested references', () => {
    const lineItems: any = {
      MEALS: [{ id: 'r1', values: { MEAL_TYPE: 'Vegetarian', MP_LEFTOVER_PORTIONS_CAPTURE: 5 } }],
      'MEALS::r1::TYPE': [{ id: 't1', values: { PREP_TYPE: 'Cook', RECIPE: 'Greek stew' } }],
      'MEALS::r1::TYPE::t1::ING': [
        { id: 'i1', values: { ING: 'Olive oil' } },
        { id: 'i2', values: { ING: 'Garlic paste' } },
        { id: 'i3', values: { ING: 'Olive oil' } }
      ]
    };

    const rowFlow: any = {
      references: {
        cookRow: { groupId: 'TYPE', match: 'first', rowFilter: { includeWhen: { fieldId: 'PREP_TYPE', equals: ['Cook'] } } },
        cookIngredients: { groupId: 'ING', parentRef: 'cookRow', match: 'any' }
      },
      output: {
        separator: '',
        hideEmpty: true,
        segments: [
          { fieldRef: 'MEAL_TYPE', label: { en: '{{value}} | ' } },
          { fieldRef: 'cookRow.RECIPE', label: { en: '{{value}} | ' } },
          { fieldRef: 'cookIngredients.ING', format: { type: 'list', listDelimiter: ', ', unique: true } },
          { type: 'text', text: { en: ' | ' } },
          { fieldRef: 'MP_LEFTOVER_PORTIONS_CAPTURE', renderAs: 'control', controlStyle: 'compact' },
          { type: 'text', text: { en: ' portions' } }
        ]
      },
      prompts: []
    };

    const state = resolveRowFlowState({
      config: rowFlow,
      groupId: 'MEALS',
      rowId: 'r1',
      rowValues: { MEAL_TYPE: 'Vegetarian', MP_LEFTOVER_PORTIONS_CAPTURE: 5 },
      lineItems,
      subGroupIds: ['TYPE']
    });

    expect(state?.segments.map(segment => segment.id)).toEqual([
      'MEAL_TYPE',
      'cookRow.RECIPE',
      'cookIngredients.ING',
      'text:0',
      'MP_LEFTOVER_PORTIONS_CAPTURE',
      'text:1'
    ]);
    expect(state?.segments.find(segment => segment.id === 'cookIngredients.ING')?.values).toEqual([
      'Olive oil',
      'Garlic paste',
      'Olive oil'
    ]);
  });

  it('keeps spacer segments in the resolved output order', () => {
    const lineItems: any = {
      MEALS: [{ id: 'r1', values: { MEAL_TYPE: 'Vegetarian', MP_LEFTOVER_PORTIONS_CAPTURE: 5, MP_LEFTOVER_FROZEN_CAPTURE: true } }]
    };

    const rowFlow: any = {
      output: {
        separator: '',
        hideEmpty: true,
        segments: [
          { fieldRef: 'MEAL_TYPE', label: { en: '{{value}} | ' } },
          { type: 'text', text: { en: 'Yield ' } },
          { fieldRef: 'MP_LEFTOVER_PORTIONS_CAPTURE', renderAs: 'control', controlStyle: 'compact' },
          { type: 'text', text: { en: ' portions' } },
          { type: 'spacer' },
          { type: 'text', text: { en: '❄️' } },
          { fieldRef: 'MP_LEFTOVER_FROZEN_CAPTURE', renderAs: 'control', controlStyle: 'compact' }
        ]
      },
      prompts: []
    };

    const state = resolveRowFlowState({
      config: rowFlow,
      groupId: 'MEALS',
      rowId: 'r1',
      rowValues: { MEAL_TYPE: 'Vegetarian', MP_LEFTOVER_PORTIONS_CAPTURE: 5, MP_LEFTOVER_FROZEN_CAPTURE: true },
      lineItems,
      subGroupIds: []
    });

    expect(state?.segments.map(segment => segment.id)).toEqual([
      'MEAL_TYPE',
      'text:0',
      'MP_LEFTOVER_PORTIONS_CAPTURE',
      'text:1',
      'spacer:0',
      'text:2',
      'MP_LEFTOVER_FROZEN_CAPTURE'
    ]);
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

  it('hides a referenced prompt when its showWhen condition does not match the parent row', () => {
    const rowFlow: any = {
      references: {
        cookRow: { groupId: 'TYPE', match: 'first', rowFilter: { includeWhen: { fieldId: 'PREP_TYPE', equals: ['Cook'] } } }
      },
      prompts: [
        {
          id: 'recipe',
          fieldRef: 'cookRow.RECIPE',
          keepVisibleWhenFilled: true,
          showWhen: { fieldId: 'MP_TO_COOK', greaterThan: 0 }
        }
      ]
    };

    const state = resolveRowFlowState({
      config: rowFlow,
      groupId: 'MEALS',
      rowId: 'r1',
      rowValues: { MEAL_TYPE: 'Vegan', MP_TO_COOK: 0 },
      lineItems: {
        MEALS: [{ id: 'r1', values: { MEAL_TYPE: 'Vegan', MP_TO_COOK: 0 } }],
        'MEALS::r1::TYPE': [{ id: 't1', values: { PREP_TYPE: 'Cook', RECIPE: 'Pasta' } }]
      } as any,
      subGroupIds: ['TYPE']
    });

    expect(state?.activePromptId).toBeUndefined();
    expect(state?.prompts.find(prompt => prompt.id === 'recipe')?.visible).toBe(false);
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

  it('keeps a row-flow action visible but disabled until enabledWhen matches', () => {
    const action: any = {
      id: 'openCookOverlay',
      enabledWhen: {
        lineItems: {
          groupId: 'MEALS',
          subGroupId: 'TYPE',
          when: {
            all: [
              { fieldId: 'PREP_TYPE', equals: 'Cook' },
              { fieldId: 'RECIPE', notEmpty: true }
            ]
          }
        }
      },
      effects: [{ type: 'openOverlay', groupId: 'TYPE' }]
    };
    const config: any = { actions: [action] };
    const baseArgs = {
      config,
      state: null,
      groupId: 'MEALS',
      rowId: 'meal-1',
      rowValues: {},
      subGroupIds: ['TYPE']
    };

    const withoutRecipe = {
      MEALS: [{ id: 'meal-1', values: {} }],
      'MEALS::meal-1::TYPE': [{ id: 'type-1', values: { PREP_TYPE: 'Cook', RECIPE: '' } }]
    } as any;
    const withRecipe = {
      MEALS: [{ id: 'meal-1', values: {} }],
      'MEALS::meal-1::TYPE': [{ id: 'type-1', values: { PREP_TYPE: 'Cook', RECIPE: 'Pasta' } }]
    } as any;

    expect(
      resolveRowFlowActionEnabled({
        action,
        groupId: 'MEALS',
        rowId: 'meal-1',
        rowValues: {},
        lineItems: withoutRecipe
      })
    ).toBe(false);
    expect(resolveRowFlowActionPlan({ ...baseArgs, actionId: 'openCookOverlay', lineItems: withoutRecipe })).toBeNull();
    expect(
      resolveRowFlowActionEnabled({
        action,
        groupId: 'MEALS',
        rowId: 'meal-1',
        rowValues: {},
        lineItems: withRecipe
      })
    ).toBe(true);
    expect(resolveRowFlowActionPlan({ ...baseArgs, actionId: 'openCookOverlay', lineItems: withRecipe })?.effects[0]).toEqual({
      type: 'openOverlay',
      targetKind: 'sub',
      key: 'MEALS::meal-1::TYPE',
      rowFilter: undefined,
      label: undefined,
      hideInlineSubgroups: undefined,
      hideCloseButton: false,
      closeButtonLabel: undefined,
      closeConfirm: undefined,
      groupOverride: undefined,
      rowFlow: undefined,
      overlayContextHeader: undefined,
      overlayHelperText: undefined,
      overlaySession: undefined
    });
  });
});
