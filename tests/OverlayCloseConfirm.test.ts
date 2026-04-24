import {
  resolveOverlayCloseConfirm,
  resolveOverlayCloseVisibilityScope
} from '../src/web/react/features/overlays/domain/overlayCloseConfirm';
import {
  applyOverlayCloseDeletePlan,
  resolveOverlayCloseDeletePlan,
  resolveOverlayCloseDeleteScope
} from '../src/web/react/features/overlays/domain/overlayCloseEffects';
import { CK_RECIPE_INGREDIENTS_DIRTY_KEY } from '../src/web/react/app/recipeIngredientsDirty';

describe('overlay close confirm', () => {
  test('resolves simple RowFlowActionConfirmConfig as-is', () => {
    const confirm = {
      title: { en: 'Confirm' },
      body: { en: 'Close?' },
      confirmLabel: { en: 'OK' },
      cancelLabel: { en: 'Cancel' }
    };
    const resolved = resolveOverlayCloseConfirm({
      closeConfirm: confirm as any,
      ctx: {
        getValue: () => undefined,
        getLineValue: () => undefined,
        getLineItems: () => [],
        getLineItemKeys: () => []
      }
    });
    expect(resolved?.source).toBe('simple');
    expect(resolved?.confirm).toEqual(confirm);
    expect(resolved?.onConfirmEffects || []).toHaveLength(0);
  });

  test('resolves first matching case with scoped subgroup lineItems clauses', () => {
    const rootGroupId = 'MP_MEALS_REQUEST';
    const rootRowId = 'req_1';
    const overlaySubId = 'MP_TYPE_LI';
    const overlayGroupKey = `${rootGroupId}::${rootRowId}::${overlaySubId}`;
    const overlayRowId = 'cook_1';
    const subId = 'MP_INGREDIENTS_LI';
    const subKey = `${overlayGroupKey}::${overlayRowId}::${subId}`;

    const closeConfirm = {
      allowCloseFromEdit: true,
      cases: [
        {
          when: {
            not: {
              lineItems: { groupId: rootGroupId, subGroupPath: [overlaySubId, subId], match: 'any' }
            }
          },
          title: { en: 'Missing ingredients' },
          body: { en: 'No ingredients have been added. Do you want to exit?' },
          confirmLabel: { en: 'Yes' },
          cancelLabel: { en: 'No' },
          validateOnReopen: true
        },
        {
          when: {
            lineItems: {
              groupId: rootGroupId,
              subGroupPath: [overlaySubId, subId],
              match: 'any',
              when: {
                all: [
                  { fieldId: 'ING', notEmpty: true },
                  { any: [{ fieldId: 'QTY', notEmpty: false }, { fieldId: 'UNIT', notEmpty: false }] }
                ]
              }
            }
          },
          title: { en: 'Missing quantity/unit' },
          body: { en: 'Missing qty/unit' },
          confirmLabel: { en: 'Close' },
          cancelLabel: { en: 'Continue' },
          highlightFirstError: true,
          validateOnReopen: true,
          onConfirmEffects: [
            {
              type: 'deleteLineItems',
              groupId: subId,
              rowFilter: {
                includeWhen: {
                  any: [{ fieldId: 'QTY', notEmpty: false }, { fieldId: 'UNIT', notEmpty: false }]
                }
              }
            }
          ]
        }
      ]
    };

    const ctx = {
      getValue: () => undefined,
      getLineValue: () => undefined,
      getLineItems: (key: string) => {
        if (key === rootGroupId) return [{ id: rootRowId, values: {} }];
        if (key === overlayGroupKey) return [{ id: overlayRowId, values: {} }];
        if (key === subKey) return [];
        return [];
      },
      getLineItemKeys: () => [rootGroupId, overlayGroupKey]
    };

    const resolvedEmpty = resolveOverlayCloseConfirm({
      closeConfirm: closeConfirm as any,
      ctx: ctx as any,
      scope: { rowId: overlayRowId, linePrefix: overlayGroupKey }
    });
    expect(resolvedEmpty?.confirm.title).toEqual({ en: 'Missing ingredients' });
    expect(resolvedEmpty?.validateOnReopen).toBe(true);
    expect(resolvedEmpty?.allowCloseFromEdit).toBe(true);

    const ctxMissing = {
      ...ctx,
      getLineItems: (key: string) => {
        if (key === rootGroupId) return [{ id: rootRowId, values: {} }];
        if (key === overlayGroupKey) return [{ id: overlayRowId, values: {} }];
        if (key === subKey)
          return [
            { id: 'i1', values: { ING: 'Carrot', QTY: '', UNIT: '' } },
            { id: 'i2', values: { ING: 'Onion', QTY: 1, UNIT: 'kg' } }
          ];
        return [];
      },
      getLineItemKeys: () => [rootGroupId, overlayGroupKey, subKey]
    };

    const resolvedMissing = resolveOverlayCloseConfirm({
      closeConfirm: closeConfirm as any,
      ctx: ctxMissing as any,
      scope: { rowId: overlayRowId, linePrefix: overlayGroupKey }
    });
    expect(resolvedMissing?.confirm.title).toEqual({ en: 'Missing quantity/unit' });
    expect(resolvedMissing?.highlightFirstError).toBe(true);
    expect(resolvedMissing?.onConfirmEffects?.length).toBe(1);
  });

  test('scopes subgroup overlay close confirms to the active nested detail row', () => {
    const rootGroupId = 'MP_MEALS_REQUEST';
    const rootRowId = 'meal_1';
    const overlayGroupKey = `${rootGroupId}::${rootRowId}::MP_TYPE_LI`;
    const activeRowId = 'cook_1';
    const activeIngredientsKey = `${overlayGroupKey}::${activeRowId}::MP_INGREDIENTS_LI`;
    const emptyRowId = 'cook_2';
    const emptyIngredientsKey = `${overlayGroupKey}::${emptyRowId}::MP_INGREDIENTS_LI`;
    const closeConfirm = {
      cases: [
        {
          when: {
            not: {
              lineItems: {
                groupId: rootGroupId,
                subGroupPath: ['MP_TYPE_LI', 'MP_INGREDIENTS_LI'],
                parentWhen: { fieldId: 'PREP_TYPE', equals: ['Cook'] },
                match: 'any'
              }
            }
          },
          title: { en: 'Missing ingredients' },
          body: { en: 'No ingredients have been added. Do you want to exit?' },
          confirmLabel: { en: 'Yes' },
          cancelLabel: { en: 'No' }
        }
      ]
    };
    const lineItems: any = {
      [rootGroupId]: [{ id: rootRowId, values: {} }],
      [overlayGroupKey]: [
        { id: activeRowId, values: { PREP_TYPE: 'Cook' } },
        { id: emptyRowId, values: { PREP_TYPE: 'Cook' } }
      ],
      [activeIngredientsKey]: [{ id: 'ing_1', values: { ING: 'Salt', QTY: 1, UNIT: 'kg' } }],
      [emptyIngredientsKey]: []
    };
    const ctx = {
      getValue: () => undefined,
      getLineValue: () => undefined,
      getLineItems: (key: string) => lineItems[key] || [],
      getLineItemKeys: () => Object.keys(lineItems)
    };
    const scope = resolveOverlayCloseVisibilityScope({
      overlayGroupId: overlayGroupKey,
      detailSelectionGroupId: overlayGroupKey,
      detailSelectionRowId: activeRowId
    });

    expect(scope).toEqual({ rowId: activeRowId, linePrefix: overlayGroupKey });
    expect(resolveOverlayCloseConfirm({ closeConfirm: closeConfirm as any, ctx: ctx as any, scope })).toBeNull();
    expect(
      resolveOverlayCloseConfirm({
        closeConfirm: closeConfirm as any,
        ctx: ctx as any,
        scope: { rowId: emptyRowId, linePrefix: overlayGroupKey }
      })?.confirm.title
    ).toEqual({ en: 'Missing ingredients' });
  });

  test('scopes subgroup overlay close confirms to active alias detail rows', () => {
    const rootGroupId = 'MP_MEALS_REQUEST';
    const rootRowId = 'meal_1';
    const overlayGroupKey = `${rootGroupId}::${rootRowId}::MP_TYPE_LI`;
    const activeRowId = 'cook_1';
    const emptyRowId = 'cook_2';
    const activeIngredientsKey = `MP_TYPE_LI::${activeRowId}::MP_INGREDIENTS_LI`;
    const emptyIngredientsKey = `MP_TYPE_LI::${emptyRowId}::MP_INGREDIENTS_LI`;
    const closeConfirm = {
      cases: [
        {
          when: {
            not: {
              lineItems: {
                groupId: rootGroupId,
                subGroupPath: ['MP_TYPE_LI', 'MP_INGREDIENTS_LI'],
                match: 'any'
              }
            }
          },
          title: { en: 'Missing ingredients' },
          body: { en: 'No ingredients have been added. Do you want to exit?' },
          confirmLabel: { en: 'Yes' },
          cancelLabel: { en: 'No' }
        }
      ]
    };
    const lineItems: any = {
      [rootGroupId]: [{ id: rootRowId, values: {} }],
      [overlayGroupKey]: [
        { id: activeRowId, values: { RECIPE: 'Soup' } },
        { id: emptyRowId, values: { RECIPE: 'Pasta' } }
      ],
      MP_TYPE_LI: [
        { id: activeRowId, values: { RECIPE: 'Soup' } },
        { id: emptyRowId, values: { RECIPE: 'Pasta' } }
      ],
      [activeIngredientsKey]: [{ id: 'ing_1', values: { ING: 'Salt', QTY: 1, UNIT: 'kg' } }],
      [emptyIngredientsKey]: []
    };
    const ctx = {
      getValue: () => undefined,
      getLineValue: () => undefined,
      getLineItems: (key: string) => lineItems[key] || [],
      getLineItemKeys: () => Object.keys(lineItems)
    };
    const scope = resolveOverlayCloseVisibilityScope({
      overlayGroupId: overlayGroupKey,
      detailSelectionGroupId: overlayGroupKey,
      detailSelectionRowId: activeRowId
    });

    expect(resolveOverlayCloseConfirm({ closeConfirm: closeConfirm as any, ctx: ctx as any, scope })).toBeNull();
    expect(
      resolveOverlayCloseConfirm({
        closeConfirm: closeConfirm as any,
        ctx: ctx as any,
        scope: { rowId: emptyRowId, linePrefix: overlayGroupKey }
      })?.confirm.title
    ).toEqual({ en: 'Missing ingredients' });
  });
});

describe('overlay close effects', () => {
  test('computes delete plan for subgroup rows using rowFilter', () => {
    const rootGroupId = 'MP_MEALS_REQUEST';
    const rootRowId = 'req_1';
    const overlaySubId = 'MP_TYPE_LI';
    const overlayGroupId = `${rootGroupId}::${rootRowId}::${overlaySubId}`;
    const parentRowId = 'cook_1';
    const subId = 'MP_INGREDIENTS_LI';
    const subKey = `${overlayGroupId}::${parentRowId}::${subId}`;

    const effects = [
      {
        type: 'deleteLineItems',
        groupId: subId,
        rowFilter: {
          includeWhen: {
            all: [
              { fieldId: 'ING', notEmpty: true },
              { any: [{ fieldId: 'QTY', notEmpty: false }, { fieldId: 'UNIT', notEmpty: false }] }
            ]
          }
        }
      }
    ];

    const plan = resolveOverlayCloseDeletePlan({
      effects: effects as any,
      overlayGroupId,
      overlayRowId: parentRowId,
      topValues: {},
      lineItems: {
        [rootGroupId]: [{ id: rootRowId, values: {} }],
        [overlayGroupId]: [{ id: parentRowId, values: {} }],
        [subKey]: [
          { id: 'i1', values: { ING: 'Carrot', QTY: '', UNIT: '' } },
          { id: 'i2', values: { ING: 'Onion', QTY: 1, UNIT: 'kg' } }
        ]
      } as any
    });

    expect(plan).toEqual([{ groupKey: subKey, rowIds: ['i1'] }]);
  });

  test('applies delete plans with the same cascade and dirty recompute as normal row removal', () => {
    const rootGroupId = 'MP_MEALS_REQUEST';
    const rootRowId = 'req_1';
    const overlaySubId = 'MP_TYPE_LI';
    const overlayGroupId = `${rootGroupId}::${rootRowId}::${overlaySubId}`;
    const parentRowId = 'cook_1';
    const subId = 'MP_INGREDIENTS_LI';
    const subKey = `${overlayGroupId}::${parentRowId}::${subId}`;

    const nextState = applyOverlayCloseDeletePlan({
      definition: { questions: [] } as any,
      deletePlan: [{ groupKey: subKey, rowIds: ['i1'] }],
      topValues: { STATUS: 'Draft' } as any,
      lineItems: {
        [rootGroupId]: [{ id: rootRowId, values: {} }],
        [overlayGroupId]: [{ id: parentRowId, values: { PREP_TYPE: 'Cook' } }],
        [subKey]: [
          { id: 'i1', values: { ING: 'Carrot', QTY: '', UNIT: '' } },
          { id: 'i2', values: { ING: 'Onion', QTY: 1, UNIT: 'kg' } }
        ]
      } as any
    });

    expect((nextState.lineItems[subKey] || []).map((row: any) => row.id)).toEqual(['i2']);
    expect((nextState.lineItems[overlayGroupId] || [])[0]?.values?.[CK_RECIPE_INGREDIENTS_DIRTY_KEY]).toBe(true);
    expect(nextState.removed).toEqual([{ groupId: subKey, rowId: 'i1' }]);
    expect(nextState.dirtyGroups).toEqual([
      { groupId: subKey, parentGroupKey: overlayGroupId, parentRowId }
    ]);
    expect(nextState.values).toEqual({ STATUS: 'Draft' });
  });

  test('uses the active overlay detail row as the delete scope for nested subgroup rows', () => {
    const rootGroupId = 'MP_MEALS_REQUEST';
    const rootRowId = 'req_1';
    const typeGroupKey = `${rootGroupId}::${rootRowId}::MP_TYPE_LI`;
    const cookRowId = 'cook_1';
    const ingredientsKey = `${typeGroupKey}::${cookRowId}::MP_INGREDIENTS_LI`;

    const deleteScope = resolveOverlayCloseDeleteScope({
      overlayGroupId: rootGroupId,
      overlayRowId: rootRowId,
      detailSelectionGroupId: typeGroupKey,
      detailSelectionRowId: cookRowId
    });

    expect(deleteScope).toEqual({
      overlayGroupId: typeGroupKey,
      overlayRowId: cookRowId
    });

    const plan = resolveOverlayCloseDeletePlan({
      effects: [
        {
          type: 'deleteLineItems',
          groupId: 'MP_INGREDIENTS_LI',
          rowFilter: {
            includeWhen: {
              any: [{ fieldId: 'QTY', notEmpty: false }, { fieldId: 'UNIT', notEmpty: false }]
            }
          }
        }
      ] as any,
      overlayGroupId: deleteScope.overlayGroupId,
      overlayRowId: deleteScope.overlayRowId,
      topValues: {},
      lineItems: {
        [rootGroupId]: [{ id: rootRowId, values: {} }],
        [typeGroupKey]: [{ id: cookRowId, values: { PREP_TYPE: 'Cook' } }],
        [ingredientsKey]: [
          { id: 'i1', values: { ING: 'Courgette', QTY: '', UNIT: '' } },
          { id: 'i2', values: { ING: 'Salt', QTY: 1, UNIT: 'kg' } }
        ]
      } as any
    });

    expect(plan).toEqual([{ groupKey: ingredientsKey, rowIds: ['i1'] }]);
  });
});
