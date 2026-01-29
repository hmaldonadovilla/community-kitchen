import { applyValueMapsToForm } from '../../../src/web/react/app/valueMaps';
import { buildSubgroupKey } from '../../../src/web/react/app/lineItems';
import { runSelectionEffectsForAncestors } from '../../../src/web/react/app/runSelectionEffectsForAncestors';
import type { LineItemState } from '../../../src/web/react/types';
import type { WebFormDefinition, WebQuestionDefinition } from '../../../src/types';

describe('runSelectionEffectsForAncestors (blur-derived)', () => {
  it('triggers ancestor selection effects when blur-derived values change', () => {
    const mpTypeSubGroup: any = {
      id: 'MP_TYPE_LI',
      fields: [
        { id: 'PREP_QTY', type: 'NUMBER', label: { en: 'Qty', fr: 'Qty', nl: 'Qty' } },
        { id: 'PREP_TYPE', type: 'CHOICE', label: { en: 'Type', fr: 'Type', nl: 'Type' } }
      ]
    };

    const mpMealsRequest: WebQuestionDefinition = {
      id: 'MP_MEALS_REQUEST',
      type: 'LINE_ITEM_GROUP',
      label: { en: 'Meals', fr: 'Meals', nl: 'Meals' },
      required: false,
      lineItemConfig: {
        fields: [
          { id: 'QTY', type: 'NUMBER', label: { en: 'Total', fr: 'Total', nl: 'Total' }, required: false },
          {
            id: 'MP_TO_COOK',
            type: 'NUMBER',
            label: { en: 'To cook', fr: 'To cook', nl: 'To cook' },
            required: false,
            derivedValue: {
              op: 'calc',
              applyOn: 'blur',
              expression: '{QTY} - SUM(MP_TYPE_LI.PREP_QTY)',
              lineItemFilters: [
                { ref: 'MP_TYPE_LI.PREP_QTY', when: { fieldId: 'PREP_TYPE', equals: ['Entire dish'] } }
              ]
            },
            selectionEffects: [
              {
                id: 'mp_to_cook_sync',
                type: 'addLineItems',
                groupId: 'MP_TYPE_LI',
                preset: { PREP_QTY: '$row.MP_TO_COOK', PREP_TYPE: 'Cook' },
                hideRemoveButton: true
              }
            ]
          }
        ],
        subGroups: [mpTypeSubGroup]
      }
    } as any;

    const definition: WebFormDefinition = {
      title: 'Test',
      destinationTab: 'Main',
      languages: ['EN'] as any,
      questions: [mpMealsRequest]
    };

    const rowId = 'meal_1';
    const subKey = buildSubgroupKey('MP_MEALS_REQUEST', rowId, 'MP_TYPE_LI');
    const prevLineItems: LineItemState = {
      MP_MEALS_REQUEST: [{ id: rowId, values: { QTY: 10, MP_TO_COOK: 10 } }],
      [subKey]: [{ id: 'prep_1', values: { PREP_QTY: 3, PREP_TYPE: 'Entire dish' } }]
    };

    const { lineItems: nextLineItems } = applyValueMapsToForm(definition, {}, prevLineItems, { mode: 'blur' });
    const nextRow = (nextLineItems.MP_MEALS_REQUEST || []).find(row => row.id === rowId);
    expect(nextRow?.values?.MP_TO_COOK).toBe(7);

    const calls: Array<{ id: string; value: any; opts: any }> = [];
    const onSelectionEffect = (q: WebQuestionDefinition, value: any, opts?: any) => {
      calls.push({ id: q.id, value, opts: opts || null });
    };

    runSelectionEffectsForAncestors({
      definition,
      values: {},
      onSelectionEffect,
      sourceGroupKey: subKey,
      prevLineItems,
      nextLineItems,
      options: { mode: 'blur', topValues: {} }
    });

    expect(calls.length).toBe(1);
    expect(calls[0].id).toBe('MP_TO_COOK');
    expect(calls[0].value).toBe(7);
    expect(calls[0].opts?.lineItem?.groupId).toBe('MP_MEALS_REQUEST');
    expect(calls[0].opts?.lineItem?.rowId).toBe(rowId);
  });
});

