import {
  collectComputedSelectionEffectInitTargets,
  collectSelectionEffectInitTargets,
  collectSubgroupSeedInitTargets
} from '../../../src/web/react/features/lineItems/domain/selectionEffectInit';
import { buildSubgroupKey } from '../../../src/web/react/app/lineItems';

describe('collectSelectionEffectInitTargets', () => {
  it('includes subgroup rows with selection-effect fields that already have values', () => {
    const question: any = {
      id: 'MEALS',
      type: 'LINE_ITEM_GROUP',
      lineItemConfig: {
        fields: [{ id: 'MEAL_TYPE', type: 'TEXT' }],
        subGroups: [
          {
            id: 'LEFTOVERS',
            fields: [
              {
                id: 'LEFTOVER_ID',
                type: 'CHOICE',
                selectionEffects: [
                  {
                    type: 'setValuesFromDataSource',
                    lookupField: 'LEFTOVER_ID',
                    fieldMapping: {
                      LEFTOVER_RECIPE: 'LEFTOVER_RECIPE'
                    }
                  }
                ]
              },
              { id: 'LEFTOVER_RECIPE', type: 'TEXT' }
            ]
          }
        ]
      }
    };

    const subgroupKey = buildSubgroupKey('MEALS', 'meal-1', 'LEFTOVERS');
    const lineItems: any = {
      MEALS: [{ id: 'meal-1', values: { MEAL_TYPE: 'Standard' } }],
      [subgroupKey]: [
        {
          id: 'leftover-row-1',
          values: {
            LEFTOVER_ID: 'LE-4'
          }
        }
      ]
    };

    const targets = collectSelectionEffectInitTargets(question, lineItems);

    expect(targets).toEqual([
      expect.objectContaining({
        group: expect.objectContaining({ id: subgroupKey }),
        groupKey: subgroupKey,
        rowId: 'leftover-row-1',
        rawValue: 'LE-4',
        signature: `${subgroupKey}::leftover-row-1::LEFTOVER_ID::"LE-4"`
      })
    ]);
  });

  it('re-seeds subgroup rows from parent selection effects when subgroup anchor values are still empty', () => {
    const question: any = {
      id: 'MEALS',
      type: 'LINE_ITEM_GROUP',
      lineItemConfig: {
        fields: [
          {
            id: 'MEAL_TYPE',
            type: 'CHOICE',
            selectionEffects: [
              {
                id: 'seed_leftovers',
                type: 'addLineItemsFromDataSource',
                groupId: 'LEFTOVERS',
                dataSource: { id: 'Leftover Bank Data' },
                lineItemMapping: {
                  LEFTOVER_ID: 'LEFTOVER_ID',
                  LEFTOVER_KIND: 'LEFTOVER_KIND'
                }
              }
            ]
          }
        ],
        subGroups: [
          {
            id: 'LEFTOVERS',
            anchorFieldId: 'LEFTOVER_ID',
            fields: [
              { id: 'LEFTOVER_ID', type: 'CHOICE' },
              { id: 'LEFTOVER_KIND', type: 'TEXT' }
            ]
          }
        ]
      }
    };

    const subgroupKey = buildSubgroupKey('MEALS', 'meal-1', 'LEFTOVERS');
    const lineItems: any = {
      MEALS: [{ id: 'meal-1', values: { MEAL_TYPE: 'Vegetarian' } }],
      [subgroupKey]: [
        {
          id: 'leftover-row-blank',
          values: {
            LEFTOVER_ID: '',
            LEFTOVER_KIND: ''
          }
        }
      ]
    };

    const targets = collectSubgroupSeedInitTargets(question, lineItems);

    expect(targets).toEqual([
      expect.objectContaining({
        group: question,
        groupKey: 'MEALS',
        rowId: 'meal-1',
        rawValue: 'Vegetarian',
        signature:
          'MEALS::meal-1::MEAL_TYPE::seedSubgroup::LEFTOVERS::"Vegetarian"::LEFTOVER_ID:""|LEFTOVER_KIND:""'
      })
    ]);
  });

  it('re-seeds nested subgroup rows from subgroup field selection effects after copy-style hydration', () => {
    const question: any = {
      id: 'MEALS',
      type: 'LINE_ITEM_GROUP',
      lineItemConfig: {
        fields: [{ id: 'MEAL_TYPE', type: 'TEXT' }],
        subGroups: [
          {
            id: 'COOK_ROWS',
            fields: [
              { id: 'PREP_TYPE', type: 'CHOICE' },
              { id: 'PREP_QTY', type: 'NUMBER' },
              {
                id: 'RECIPE',
                type: 'CHOICE',
                selectionEffects: [
                  {
                    id: 'seed_ingredients',
                    type: 'addLineItemsFromDataSource',
                    groupId: 'INGREDIENTS',
                    dataSource: { id: 'Recipes Data' },
                    lineItemMapping: {
                      ING: 'ING',
                      QTY: 'QTY'
                    }
                  }
                ]
              }
            ],
            subGroups: [
              {
                id: 'INGREDIENTS',
                anchorFieldId: 'ING',
                fields: [
                  { id: 'ING', type: 'CHOICE' },
                  { id: 'QTY', type: 'NUMBER' }
                ]
              }
            ]
          }
        ]
      }
    };

    const cookRowsKey = buildSubgroupKey('MEALS', 'meal-1', 'COOK_ROWS');
    const ingredientsKey = buildSubgroupKey(cookRowsKey, 'cook-1', 'INGREDIENTS');
    const lineItems: any = {
      MEALS: [{ id: 'meal-1', values: { MEAL_TYPE: 'Standard' } }],
      [cookRowsKey]: [
        {
          id: 'cook-1',
          values: {
            PREP_TYPE: 'Cook',
            PREP_QTY: 50,
            RECIPE: 'Chili',
            __ckRowSource: 'auto'
          }
        }
      ],
      [ingredientsKey]: []
    };

    const targets = collectSubgroupSeedInitTargets(question, lineItems);

    expect(targets).toEqual([
      expect.objectContaining({
        groupKey: cookRowsKey,
        rowId: 'cook-1',
        rawValue: 'Chili',
        signature: `${cookRowsKey}::cook-1::RECIPE::seedSubgroup::INGREDIENTS::"Chili"::__empty__`
      })
    ]);
  });

  it('does not replay subgroup seed fields through the generic init collector', () => {
    const question: any = {
      id: 'MEALS',
      type: 'LINE_ITEM_GROUP',
      lineItemConfig: {
        fields: [
          {
            id: 'MEAL_TYPE',
            type: 'CHOICE',
            selectionEffects: [
              {
                id: 'seed_leftovers',
                type: 'addLineItemsFromDataSource',
                groupId: 'LEFTOVERS',
                dataSource: { id: 'Leftover Bank Data' },
                lineItemMapping: {
                  LEFTOVER_ID: 'LEFTOVER_ID'
                }
              }
            ]
          }
        ],
        subGroups: [
          {
            id: 'LEFTOVERS',
            anchorFieldId: 'LEFTOVER_ID',
            fields: [{ id: 'LEFTOVER_ID', type: 'CHOICE' }]
          }
        ]
      }
    };

    const lineItems: any = {
      MEALS: [{ id: 'meal-1', values: { MEAL_TYPE: 'Vegetarian' } }]
    };

    expect(collectSelectionEffectInitTargets(question, lineItems)).toEqual([]);
    expect(collectSubgroupSeedInitTargets(question, lineItems)).toEqual([
      expect.objectContaining({
        groupKey: 'MEALS',
        rowId: 'meal-1',
        rawValue: 'Vegetarian'
      })
    ]);
  });

  it('re-seeds subgroup rows when anchor values exist but mapped seed fields are still missing', () => {
    const question: any = {
      id: 'MEALS',
      type: 'LINE_ITEM_GROUP',
      lineItemConfig: {
        fields: [
          {
            id: 'MEAL_TYPE',
            type: 'CHOICE',
            selectionEffects: [
              {
                id: 'seed_leftovers',
                type: 'addLineItemsFromDataSource',
                groupId: 'LEFTOVERS',
                dataSource: { id: 'Leftover Bank Data' },
                lineItemMapping: {
                  LEFTOVER_ID: 'LEFTOVER_ID',
                  LEFTOVER_KIND: 'LEFTOVER_KIND',
                  LEFTOVER_QTY_AVAILABLE: 'LEFTOVER_QTY'
                }
              }
            ]
          }
        ],
        subGroups: [
          {
            id: 'LEFTOVERS',
            anchorFieldId: 'LEFTOVER_ID',
            fields: [
              { id: 'LEFTOVER_ID', type: 'CHOICE' },
              { id: 'LEFTOVER_KIND', type: 'TEXT' },
              { id: 'LEFTOVER_QTY_AVAILABLE', type: 'NUMBER' }
            ]
          }
        ]
      }
    };

    const subgroupKey = buildSubgroupKey('MEALS', 'meal-1', 'LEFTOVERS');
    const lineItems: any = {
      MEALS: [{ id: 'meal-1', values: { MEAL_TYPE: 'Vegetarian' } }],
      [subgroupKey]: [
        {
          id: 'leftover-row-stale',
          values: {
            LEFTOVER_ID: 'LP-1',
            LEFTOVER_KIND: '',
            LEFTOVER_QTY_AVAILABLE: ''
          }
        }
      ]
    };

    const targets = collectSubgroupSeedInitTargets(question, lineItems);

    expect(targets).toEqual([
      expect.objectContaining({
        group: question,
        groupKey: 'MEALS',
        rowId: 'meal-1',
        rawValue: 'Vegetarian',
        signature: expect.stringContaining('MEALS::meal-1::MEAL_TYPE::seedSubgroup::LEFTOVERS::"Vegetarian"')
      })
    ]);
  });

  it('does not re-seed transient selector subgroups once anchored rows already exist', () => {
    const question: any = {
      id: 'MEALS',
      type: 'LINE_ITEM_GROUP',
      lineItemConfig: {
        fields: [
          {
            id: 'MEAL_TYPE',
            type: 'CHOICE',
            selectionEffects: [
              {
                id: 'seed_leftovers',
                type: 'addLineItemsFromDataSource',
                groupId: 'LEFTOVERS',
                dataSource: { id: 'Leftover Bank Data' },
                lineItemMapping: {
                  LEFTOVER_ID: 'LEFTOVER_ID',
                  LEFTOVER_KIND: 'LEFTOVER_KIND',
                  LEFTOVER_QTY_AVAILABLE: 'LEFTOVER_QTY'
                }
              }
            ]
          }
        ],
        subGroups: [
          {
            id: 'LEFTOVERS',
            anchorFieldId: 'LEFTOVER_ID',
            ui: { persistRows: false },
            fields: [
              { id: 'LEFTOVER_ID', type: 'CHOICE' },
              { id: 'LEFTOVER_KIND', type: 'TEXT' },
              { id: 'LEFTOVER_QTY_AVAILABLE', type: 'NUMBER' }
            ]
          }
        ]
      }
    };

    const subgroupKey = buildSubgroupKey('MEALS', 'meal-1', 'LEFTOVERS');
    const lineItems: any = {
      MEALS: [{ id: 'meal-1', values: { MEAL_TYPE: 'Vegetarian' } }],
      [subgroupKey]: [
        {
          id: 'leftover-row-seeded',
          values: {
            LEFTOVER_ID: 'LP-1',
            LEFTOVER_KIND: '',
            LEFTOVER_QTY_AVAILABLE: ''
          }
        }
      ]
    };

    const targets = collectSubgroupSeedInitTargets(question, lineItems);

    expect(targets).toEqual([]);
  });

  it('changes subgroup seed signature when hydrated seed fields are later populated', () => {
    const question: any = {
      id: 'MEALS',
      type: 'LINE_ITEM_GROUP',
      lineItemConfig: {
        fields: [
          {
            id: 'MEAL_TYPE',
            type: 'CHOICE',
            selectionEffects: [
              {
                id: 'seed_leftovers',
                type: 'addLineItemsFromDataSource',
                groupId: 'LEFTOVERS',
                dataSource: { id: 'Leftover Bank Data' },
                lineItemMapping: {
                  LEFTOVER_ID: 'LEFTOVER_ID',
                  LEFTOVER_KIND: 'LEFTOVER_KIND',
                  LEFTOVER_QTY_AVAILABLE: 'LEFTOVER_QTY'
                }
              }
            ]
          }
        ],
        subGroups: [
          {
            id: 'LEFTOVERS',
            anchorFieldId: 'LEFTOVER_ID',
            fields: [
              { id: 'LEFTOVER_ID', type: 'CHOICE' },
              { id: 'LEFTOVER_KIND', type: 'TEXT' },
              { id: 'LEFTOVER_QTY_AVAILABLE', type: 'NUMBER' }
            ]
          }
        ]
      }
    };

    const subgroupKey = buildSubgroupKey('MEALS', 'meal-1', 'LEFTOVERS');
    const beforeLineItems: any = {
      MEALS: [{ id: 'meal-1', values: { MEAL_TYPE: 'Vegetarian' } }],
      [subgroupKey]: [
        {
          id: 'leftover-row-stale',
          values: {
            LEFTOVER_ID: 'LP-1',
            LEFTOVER_KIND: '',
            LEFTOVER_QTY_AVAILABLE: ''
          }
        }
      ]
    };
    const afterLineItems: any = {
      MEALS: [{ id: 'meal-1', values: { MEAL_TYPE: 'Vegetarian' } }],
      [subgroupKey]: [
        {
          id: 'leftover-row-stale',
          values: {
            LEFTOVER_ID: 'LP-1',
            LEFTOVER_KIND: 'Part dish',
            LEFTOVER_QTY_AVAILABLE: 250
          }
        }
      ]
    };

    const beforeSignature = collectSubgroupSeedInitTargets(question, beforeLineItems)[0]?.signature;
    const afterTargets = collectSubgroupSeedInitTargets(question, afterLineItems);
    const afterSignature = afterTargets[0]?.signature;

    expect(beforeSignature).toBeTruthy();
    expect(afterTargets).toHaveLength(0);
    expect(afterSignature).toBeUndefined();
  });

  it('keeps transient subgroup seed signatures stable when blank auto rows are recreated with new ids', () => {
    const question: any = {
      id: 'MEALS',
      type: 'LINE_ITEM_GROUP',
      lineItemConfig: {
        fields: [
          {
            id: 'MEAL_TYPE',
            type: 'CHOICE',
            selectionEffects: [
              {
                id: 'seed_leftovers',
                type: 'addLineItemsFromDataSource',
                groupId: 'LEFTOVERS',
                dataSource: { id: 'Leftover Bank Data' },
                lineItemMapping: {
                  LEFTOVER_ID: 'LEFTOVER_ID',
                  LEFTOVER_KIND: 'LEFTOVER_KIND'
                }
              }
            ]
          }
        ],
        subGroups: [
          {
            id: 'LEFTOVERS',
            anchorFieldId: 'LEFTOVER_ID',
            ui: { persistRows: false },
            fields: [
              { id: 'LEFTOVER_ID', type: 'CHOICE' },
              { id: 'LEFTOVER_KIND', type: 'TEXT' }
            ]
          }
        ]
      }
    };

    const subgroupKey = buildSubgroupKey('MEALS', 'meal-1', 'LEFTOVERS');
    const beforeLineItems: any = {
      MEALS: [{ id: 'meal-1', values: { MEAL_TYPE: 'Vegetarian' } }],
      [subgroupKey]: [
        {
          id: 'blank-row-a',
          values: {
            LEFTOVER_ID: '',
            LEFTOVER_KIND: ''
          }
        }
      ]
    };
    const afterLineItems: any = {
      MEALS: [{ id: 'meal-1', values: { MEAL_TYPE: 'Vegetarian' } }],
      [subgroupKey]: [
        {
          id: 'blank-row-b',
          values: {
            LEFTOVER_ID: '',
            LEFTOVER_KIND: ''
          }
        }
      ]
    };

    const beforeSignature = collectSubgroupSeedInitTargets(question, beforeLineItems)[0]?.signature;
    const afterSignature = collectSubgroupSeedInitTargets(question, afterLineItems)[0]?.signature;

    expect(beforeSignature).toBeTruthy();
    expect(afterSignature).toBe(beforeSignature);
  });

  it('skips computed init replay when effect-owned rows already exist', () => {
    const question: any = {
      id: 'MEALS',
      type: 'LINE_ITEM_GROUP',
      lineItemConfig: {
        fields: [
          { id: 'ORD_QTY', type: 'NUMBER' },
          {
            id: 'MP_TO_COOK',
            type: 'NUMBER',
            derivedValue: {
              op: 'copy',
              dependsOn: 'ORD_QTY',
              applyOn: 'change',
              when: 'always'
            },
            selectionEffects: [
              {
                id: 'mp_to_cook_sync',
                type: 'addLineItems',
                groupId: 'MP_TYPE_LI',
                preset: {
                  PREP_QTY: '$row.MP_TO_COOK',
                  PREP_TYPE: 'Cook'
                }
              }
            ]
          }
        ],
        subGroups: [
          {
            id: 'MP_TYPE_LI',
            fields: [
              { id: 'PREP_TYPE', type: 'CHOICE' },
              { id: 'PREP_QTY', type: 'NUMBER' }
            ]
          }
        ]
      }
    };

    const subgroupKey = buildSubgroupKey('MEALS', 'meal-1', 'MP_TYPE_LI');
    const beforeLineItems: any = {
      MEALS: [{ id: 'meal-1', values: { ORD_QTY: 12 } }],
      [subgroupKey]: []
    };
    const afterLineItems: any = {
      MEALS: [{ id: 'meal-1', values: { ORD_QTY: 12 } }],
      [subgroupKey]: [
        {
          id: 'prep-row-1',
          values: {
            PREP_TYPE: 'Cook',
            PREP_QTY: 12,
            __ckSelectionEffectId: 'mp_to_cook_sync',
            __ckParentGroupId: 'MEALS',
            __ckParentRowId: 'meal-1'
          }
        }
      ]
    };

    const beforeTargets = collectComputedSelectionEffectInitTargets(question, beforeLineItems, {});
    const afterTargets = collectComputedSelectionEffectInitTargets(question, afterLineItems, {});

    expect(beforeTargets).toHaveLength(1);
    expect(afterTargets).toEqual([]);
  });

  it('skips direct init replay when effect-owned rows already exist', () => {
    const question: any = {
      id: 'MEALS',
      type: 'LINE_ITEM_GROUP',
      lineItemConfig: {
        fields: [
          {
            id: 'MP_TO_COOK',
            type: 'NUMBER',
            selectionEffects: [
              {
                id: 'mp_to_cook_sync',
                type: 'addLineItems',
                groupId: 'MP_TYPE_LI',
                preset: {
                  PREP_QTY: '$row.MP_TO_COOK',
                  PREP_TYPE: 'Cook'
                }
              }
            ]
          }
        ],
        subGroups: [
          {
            id: 'MP_TYPE_LI',
            fields: [
              { id: 'PREP_TYPE', type: 'CHOICE' },
              { id: 'PREP_QTY', type: 'NUMBER' }
            ]
          }
        ]
      }
    };

    const subgroupKey = buildSubgroupKey('MEALS', 'meal-1', 'MP_TYPE_LI');
    const lineItems: any = {
      MEALS: [{ id: 'meal-1', values: { MP_TO_COOK: 12 } }],
      [subgroupKey]: [
        {
          id: 'prep-row-1',
          values: {
            PREP_TYPE: 'Cook',
            PREP_QTY: 12,
            __ckSelectionEffectId: 'mp_to_cook_sync',
            __ckParentGroupId: 'MEALS',
            __ckParentRowId: 'meal-1'
          }
        }
      ]
    };

    const targets = collectSelectionEffectInitTargets(question, lineItems);

    expect(targets).toEqual([]);
  });

  it('skips replay for hydrated data-source outputs when only transient __ck fields remain unset', () => {
    const question: any = {
      id: 'MEALS',
      type: 'LINE_ITEM_GROUP',
      lineItemConfig: {
        fields: [{ id: 'MEAL_TYPE', type: 'TEXT' }],
        subGroups: [
          {
            id: 'COOK_ROWS',
            fields: [
              {
                id: 'RECIPE',
                type: 'CHOICE',
                selectionEffects: [
                  {
                    id: 'seed_ingredients',
                    type: 'addLineItemsFromDataSource',
                    groupId: 'INGREDIENTS',
                    dataSource: { id: 'Recipes Data' },
                    lineItemMapping: {
                      ING: 'ING',
                      QTY: 'QTY'
                    }
                  },
                  {
                    type: 'setValue',
                    fieldId: '__ckRecipeIngredientsDirty',
                    value: false
                  }
                ]
              }
            ],
            subGroups: [
              {
                id: 'INGREDIENTS',
                anchorFieldId: 'ING',
                fields: [
                  { id: 'ING', type: 'CHOICE' },
                  { id: 'QTY', type: 'NUMBER' }
                ]
              }
            ]
          }
        ]
      }
    };

    const cookRowsKey = buildSubgroupKey('MEALS', 'meal-1', 'COOK_ROWS');
    const ingredientsKey = buildSubgroupKey(cookRowsKey, 'cook-1', 'INGREDIENTS');
    const lineItems: any = {
      MEALS: [{ id: 'meal-1', values: { MEAL_TYPE: 'Standard' } }],
      [cookRowsKey]: [
        {
          id: 'cook-1',
          values: {
            RECIPE: 'Chili'
          }
        }
      ],
      [ingredientsKey]: [
        {
          id: 'ingredient-1',
          values: {
            ING: 'Tomato',
            QTY: 3
          }
        }
      ]
    };

    expect(collectSelectionEffectInitTargets(question, lineItems, {})).toEqual([]);
  });

  it('skips direct init replay when an effect when clause does not match the current value', () => {
    const question: any = {
      id: 'MEALS',
      type: 'LINE_ITEM_GROUP',
      lineItemConfig: {
        fields: [
          {
            id: 'MP_TO_COOK',
            type: 'NUMBER',
            selectionEffects: [
              {
                id: 'mp_to_cook_sync',
                type: 'addLineItems',
                groupId: 'MP_TYPE_LI',
                when: {
                  fieldId: 'MP_TO_COOK',
                  greaterThan: 0
                },
                preset: {
                  PREP_QTY: '$row.MP_TO_COOK',
                  PREP_TYPE: 'Cook'
                }
              }
            ]
          }
        ],
        subGroups: [
          {
            id: 'MP_TYPE_LI',
            fields: [
              { id: 'PREP_TYPE', type: 'CHOICE' },
              { id: 'PREP_QTY', type: 'NUMBER' }
            ]
          }
        ]
      }
    };

    const subgroupKey = buildSubgroupKey('MEALS', 'meal-1', 'MP_TYPE_LI');
    const lineItems: any = {
      MEALS: [{ id: 'meal-1', values: { MP_TO_COOK: 0 } }],
      [subgroupKey]: []
    };

    expect(collectSelectionEffectInitTargets(question, lineItems, {})).toEqual([]);
  });

  it('evaluates child row init when clauses against the immediate parent row', () => {
    const question: any = {
      id: 'MEALS',
      type: 'LINE_ITEM_GROUP',
      lineItemConfig: {
        fields: [{ id: 'MEAL_TYPE', type: 'TEXT' }],
        subGroups: [
          {
            id: 'PREP_ROWS',
            fields: [{ id: 'PREP_TYPE', type: 'CHOICE' }],
            subGroups: [
              {
                id: 'INGREDIENTS',
                fields: [
                  {
                    id: 'ING',
                    type: 'CHOICE',
                    selectionEffects: [
                      {
                        type: 'setValuesFromDataSource',
                        lookupField: 'ING',
                        sourceSync: { refreshOnInit: true },
                        when: { fieldId: 'PREP_TYPE', equals: ['Cook'] },
                        fieldMapping: {
                          ING_SOURCE_ID: 'id'
                        }
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      }
    };

    const prepRowsKey = buildSubgroupKey('MEALS', 'meal-1', 'PREP_ROWS');
    const cookIngredientsKey = buildSubgroupKey(prepRowsKey, 'prep-cook', 'INGREDIENTS');
    const leftoverIngredientsKey = buildSubgroupKey(prepRowsKey, 'prep-leftover', 'INGREDIENTS');
    const lineItems: any = {
      MEALS: [{ id: 'meal-1', values: { MEAL_TYPE: 'Standard' } }],
      [prepRowsKey]: [
        { id: 'prep-cook', values: { PREP_TYPE: 'Cook' } },
        { id: 'prep-leftover', values: { PREP_TYPE: 'Multi-ingredient' } }
      ],
      [cookIngredientsKey]: [{ id: 'ing-cook', values: { ING: 'Carrot' } }],
      [leftoverIngredientsKey]: [{ id: 'ing-leftover', values: { ING: 'Carrot' } }]
    };

    const targets = collectSelectionEffectInitTargets(question, lineItems, {});

    expect(targets).toEqual([
      expect.objectContaining({
        groupKey: cookIngredientsKey,
        rowId: 'ing-cook',
        rawValue: 'Carrot'
      })
    ]);
  });

  it('includes computed selection-effect fields that are derived from the current row state', () => {
    const question: any = {
      id: 'MEALS',
      type: 'LINE_ITEM_GROUP',
      lineItemConfig: {
        fields: [
          { id: 'ORD_QTY', type: 'NUMBER' },
          {
            id: 'MP_TO_COOK',
            type: 'NUMBER',
            derivedValue: {
              op: 'copy',
              dependsOn: 'ORD_QTY',
              applyOn: 'change',
              when: 'always'
            },
            selectionEffects: [
              {
                id: 'mp_to_cook_sync',
                type: 'addLineItems',
                groupId: 'MP_TYPE_LI',
                preset: {
                  PREP_QTY: '$row.MP_TO_COOK',
                  PREP_TYPE: 'Cook'
                }
              }
            ]
          }
        ]
      }
    };

    const lineItems: any = {
      MEALS: [{ id: 'meal-1', values: { ORD_QTY: 12 } }]
    };

    const targets = collectComputedSelectionEffectInitTargets(question, lineItems, {});

    expect(targets).toEqual([
      expect.objectContaining({
        groupKey: 'MEALS',
        rowId: 'meal-1',
        rawValue: 12
      })
    ]);
  });

  it('skips computed init replay when the field disables selection effects on init', () => {
    const question: any = {
      id: 'MEALS',
      type: 'LINE_ITEM_GROUP',
      lineItemConfig: {
        fields: [
          { id: 'ORD_QTY', type: 'NUMBER' },
          {
            id: 'MP_TO_COOK',
            type: 'NUMBER',
            ui: { runSelectionEffectsOnInit: false },
            derivedValue: {
              op: 'copy',
              dependsOn: 'ORD_QTY',
              applyOn: 'change',
              when: 'always'
            },
            selectionEffects: [
              {
                id: 'mp_to_cook_sync',
                type: 'addLineItems',
                groupId: 'MP_TYPE_LI',
                preset: {
                  PREP_QTY: '$row.MP_TO_COOK',
                  PREP_TYPE: 'Cook'
                }
              }
            ]
          }
        ]
      }
    };

    const lineItems: any = {
      MEALS: [{ id: 'meal-1', values: { ORD_QTY: 12 } }]
    };

    const targets = collectComputedSelectionEffectInitTargets(question, lineItems, {});

    expect(targets).toEqual([]);
  });

  it('skips computed init replay when an effect when clause does not match the computed value', () => {
    const question: any = {
      id: 'MEALS',
      type: 'LINE_ITEM_GROUP',
      lineItemConfig: {
        fields: [
          { id: 'ORD_QTY', type: 'NUMBER' },
          {
            id: 'MP_TO_COOK',
            type: 'NUMBER',
            derivedValue: {
              op: 'copy',
              dependsOn: 'ORD_QTY',
              applyOn: 'change',
              when: 'always'
            },
            selectionEffects: [
              {
                id: 'mp_to_cook_sync',
                type: 'addLineItems',
                groupId: 'MP_TYPE_LI',
                when: {
                  fieldId: 'MP_TO_COOK',
                  greaterThan: 0
                },
                preset: {
                  PREP_QTY: '$row.MP_TO_COOK',
                  PREP_TYPE: 'Cook'
                }
              }
            ]
          }
        ],
        subGroups: [
          {
            id: 'MP_TYPE_LI',
            fields: [
              { id: 'PREP_TYPE', type: 'CHOICE' },
              { id: 'PREP_QTY', type: 'NUMBER' }
            ]
          }
        ]
      }
    };

    const lineItems: any = {
      MEALS: [{ id: 'meal-1', values: { ORD_QTY: 0 } }]
    };

    expect(collectComputedSelectionEffectInitTargets(question, lineItems, {})).toEqual([]);
  });
});
