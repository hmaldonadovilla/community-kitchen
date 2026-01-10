import { validateForm } from '../../../src/web/react/app/submission';

describe('validateForm (line item validation rule fieldId normalization)', () => {
  test('evaluates rules when rule fieldIds are scoped with groupId__ and targets a different field', () => {
    const definition: any = {
      title: 'Test',
      destinationTab: 'Dest',
      languages: ['EN'],
      questions: [
        {
          id: 'MEALS',
          type: 'LINE_ITEM_GROUP',
          label: { en: 'Meals', fr: 'Repas', nl: 'Maaltijden' },
          required: false,
          lineItemConfig: {
            ui: {
              mode: 'progressive',
              expandGate: 'collapsedFieldsValid',
              defaultCollapsed: true,
              collapsedFields: [{ fieldId: 'REQUESTED_PORTIONS', showLabel: true }]
            },
            fields: [
              {
                id: 'REQUESTED_PORTIONS',
                type: 'NUMBER',
                labelEn: 'Requested portions',
                labelFr: 'Portions demandées',
                labelNl: 'Gevraagde porties',
                required: true,
                options: [],
                optionsFr: [],
                optionsNl: [],
                // Rule targets DELIVERED_PORTIONS using *scoped* ids (MEALS__*)
                validationRules: [
                  {
                    when: { fieldId: 'MEALS__REQUESTED_PORTIONS' },
                    then: { fieldId: 'MEALS__DELIVERED_PORTIONS', minFieldId: 'MEALS__REQUESTED_PORTIONS' },
                    message: { en: 'Delivered portions must be >= requested portions.' }
                  }
                ]
              },
              {
                id: 'DELIVERED_PORTIONS',
                type: 'NUMBER',
                labelEn: 'Delivered portions',
                labelFr: 'Portions livrées',
                labelNl: 'Geleverde porties',
                required: true,
                options: [],
                optionsFr: [],
                optionsNl: []
              }
            ]
          }
        }
      ]
    };

    const errors = validateForm({
      definition,
      language: 'EN',
      values: {},
      lineItems: {
        MEALS: [
          {
            id: 'r1',
            values: {
              REQUESTED_PORTIONS: 10,
              DELIVERED_PORTIONS: 5
            }
          }
        ]
      }
    });

    // Regression: previously this would produce no errors because getValue() couldn't resolve scoped ids.
    expect(errors['MEALS__DELIVERED_PORTIONS__r1']).toBeTruthy();
    // Error should be attached to the *target* field, not the field that holds the rule.
    expect(errors['MEALS__REQUESTED_PORTIONS__r1']).toBeUndefined();
  });
});

