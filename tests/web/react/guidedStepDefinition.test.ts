import { buildGuidedStepDefinitionAction } from '../../../src/web/react/features/steps/domain/guidedStepDefinition';

describe('guided step definition helpers', () => {
  const definition = {
    formKey: 'meal_production',
    questions: [
      { id: 'DATE', type: 'DATE' },
      { id: 'CUSTOMER', type: 'TEXT' },
      {
        id: 'meals',
        type: 'LINE_ITEM_GROUP',
        lineItemConfig: {
          fields: [
            { id: 'mealName', label: { en: 'Meal' } },
            { id: 'quantity', label: { en: 'Quantity' } },
            { id: 'notes', label: { en: 'Notes' } }
          ],
          subGroups: [
            {
              id: 'ingredients',
              fields: [
                { id: 'ingredientName' },
                { id: 'amount' },
                { id: 'waste' }
              ]
            },
            {
              id: 'packaging',
              fields: [{ id: 'container' }]
            }
          ]
        }
      }
    ]
  } as any;

  test('returns null when guided steps are not enabled', () => {
    expect(
      buildGuidedStepDefinitionAction({
        guidedEnabled: false,
        guidedStepsCfg: { items: [] },
        guidedStepIds: ['step1'],
        guidedVisibleSteps: [],
        activeGuidedStepId: 'step1',
        definition
      })
    ).toBeNull();
  });

  test('builds scoped top questions and line group fields for a guided step', () => {
    const overrideEvents: any[] = [];
    const result = buildGuidedStepDefinitionAction({
      guidedEnabled: true,
      guidedStepsCfg: {
        header: {
          include: [{ kind: 'question', id: 'DATE', renderAsLabel: true }]
        }
      },
      guidedStepIds: ['step1'],
      activeGuidedStepId: 'step1',
      guidedVisibleSteps: [
        {
          id: 'step1',
          include: [
            {
              kind: 'lineGroup',
              id: 'meals',
              fields: ['mealName', { id: 'quantity', renderAsLabel: true }],
              readOnlyFields: ['notes'],
              validationRows: { fieldId: 'quantity', greaterThan: 0 },
              collapsedFieldsInHeader: true,
              groupOverride: {
                maxRows: 1
              },
              subGroups: {
                include: [
                  {
                    id: 'ingredients',
                    fields: ['ingredientName'],
                    readOnlyFields: ['amount'],
                    rows: { fieldId: 'amount', greaterThan: 0 }
                  }
                ]
              }
            }
          ]
        }
      ],
      definition,
      onLineGroupOverrideApplied: event => overrideEvents.push(event)
    });

    expect(result?.questions.map((question: any) => question.id)).toEqual(['DATE', 'meals']);
    expect((result?.questions[0] as any).ui.renderAsLabel).toBe(true);

    const lineConfig = (result?.questions[1] as any).lineItemConfig;
    expect(lineConfig.maxRows).toBe(1);
    expect(lineConfig.fields.map((field: any) => field.id)).toEqual(['mealName', 'quantity']);
    expect(lineConfig.fields.find((field: any) => field.id === 'quantity').readOnly).toBe(true);
    expect(lineConfig.fields.find((field: any) => field.id === 'quantity').ui.renderAsLabel).toBe(true);
    expect(lineConfig._guidedRowFilter).toEqual({ fieldId: 'quantity', greaterThan: 0 });
    expect(lineConfig._expandGateFields.map((field: any) => field.id)).toEqual(['mealName', 'quantity', 'notes']);
    expect(lineConfig.ui.guidedCollapsedFieldsInHeader).toBe(true);

    expect(lineConfig.subGroups.map((subGroup: any) => subGroup.id)).toEqual(['ingredients']);
    expect(lineConfig.subGroups[0].fields.map((field: any) => field.id)).toEqual(['ingredientName']);
    expect(lineConfig.subGroups[0]._guidedRowFilter).toEqual({ fieldId: 'amount', greaterThan: 0 });
    expect(lineConfig.subGroups[0]._expandGateFields.map((field: any) => field.id)).toEqual([
      'ingredientName',
      'amount',
      'waste'
    ]);

    expect(overrideEvents).toEqual([
      {
        stepId: 'step1',
        groupId: 'meals',
        groupOverride: { maxRows: 1 }
      }
    ]);
  });

  test('hides subgroups when parent fields are scoped without subgroup includes', () => {
    const result = buildGuidedStepDefinitionAction({
      guidedEnabled: true,
      guidedStepsCfg: {},
      guidedStepIds: ['step1'],
      activeGuidedStepId: 'step1',
      guidedVisibleSteps: [
        {
          id: 'step1',
          include: [
            {
              kind: 'lineGroup',
              id: 'meals',
              fields: ['mealName']
            }
          ]
        }
      ],
      definition
    });

    expect((result?.questions[0] as any).lineItemConfig.subGroups).toEqual([]);
  });
});
