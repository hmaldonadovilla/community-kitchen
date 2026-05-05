import {
  buildLineItemGroupOverlayValidationDefinitionAction,
  buildSubgroupOverlayValidationDefinitionAction
} from '../../../src/web/react/components/form/overlayValidationDefinition';

describe('overlay validation definition helpers', () => {
  const definition = {
    title: 'Meal Production',
    questions: [
      { id: 'customer', type: 'TEXT' },
      {
        id: 'production',
        type: 'LINE_ITEM_GROUP',
        lineItemConfig: {
          fields: [{ id: 'meal' }],
          subGroups: [
            {
              id: 'ingredients',
              fields: [{ id: 'ingredient' }],
              subGroups: []
            }
          ]
        }
      }
    ]
  } as any;

  test('builds a root line-item overlay validation definition with row filter', () => {
    const result = buildLineItemGroupOverlayValidationDefinitionAction({
      definition,
      overlay: {
        open: true,
        groupId: 'production',
        rowFilter: { rowIds: ['row-1'] }
      }
    });

    expect(result?.questions).toHaveLength(1);
    expect(result?.questions[0].id).toBe('production');
    expect((result?.questions[0] as any).lineItemConfig._guidedRowFilter).toEqual({ rowIds: ['row-1'] });
    expect(definition.questions).toHaveLength(2);
  });

  test('prefers an overlay override group when provided', () => {
    const overrideGroup = {
      id: 'production',
      type: 'LINE_ITEM_GROUP',
      lineItemConfig: { fields: [{ id: 'overrideField' }], subGroups: [] }
    } as any;

    const result = buildLineItemGroupOverlayValidationDefinitionAction({
      definition,
      overlay: {
        open: true,
        groupId: 'production',
        group: overrideGroup
      }
    });

    expect((result?.questions[0] as any).lineItemConfig.fields).toEqual([{ id: 'overrideField' }]);
  });

  test('builds a subgroup overlay validation definition with override and row filter', () => {
    const result = buildSubgroupOverlayValidationDefinitionAction({
      definition,
      overlay: {
        open: true,
        subKey: 'production::row-1::ingredients',
        rowFilter: { rowIds: ['child-1'] },
        groupOverride: {
          fields: [{ id: 'overrideIngredient' }]
        }
      }
    });

    expect(result?.questions).toHaveLength(1);
    expect(result?.questions[0].id).toBe('production::row-1::ingredients');
    expect((result?.questions[0] as any).lineItemConfig.fields).toEqual([{ id: 'overrideIngredient' }]);
    expect((result?.questions[0] as any).lineItemConfig._guidedRowFilter).toEqual({ rowIds: ['child-1'] });
  });
});
