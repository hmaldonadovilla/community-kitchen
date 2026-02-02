import { validateForm } from '../../../src/web/react/app/submission';

const pad2 = (n: number): string => n.toString().padStart(2, '0');
const formatLocalYmd = (d: Date): string => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

describe('validateForm guided virtual step fields', () => {
  it('supports __ckStep in validation rules when virtualState is provided', () => {
    const tomorrow = (() => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      return formatLocalYmd(d);
    })();

    const definition: any = {
      questions: [
        { id: 'MP_PREP_DATE', type: 'DATE', label: { en: 'Prep date' } },
        {
          id: 'LINES',
          type: 'LINE_ITEM_GROUP',
          lineItemConfig: {
            fields: [
              {
                id: 'MP_COOK_TEMP',
                type: 'CHECKBOX',
                required: false,
                validationRules: [
                  {
                    when: {
                      all: [
                        { not: { fieldId: 'MP_COOK_TEMP', equals: ['__never__'] } },
                        { fieldId: 'MP_PREP_DATE', isInFuture: true },
                        { fieldId: '__ckStep', equals: ['foodSafety'] }
                      ]
                    },
                    message: { en: 'Food safety can only be recorded on the day of production.' }
                  }
                ]
              }
            ]
          }
        }
      ]
    };

    const values: any = { MP_PREP_DATE: tomorrow };
    const lineItems: any = { LINES: [{ id: 'r1', values: {} }] };

    const withoutVirtual = validateForm({
      definition,
      language: 'EN' as any,
      values,
      lineItems
    });
    expect(withoutVirtual['LINES__MP_COOK_TEMP__r1']).toBeUndefined();

    const withVirtualOtherStep = validateForm({
      definition,
      language: 'EN' as any,
      values,
      lineItems,
      virtualState: {
        prefix: '__ckStep',
        activeStepId: 'orderInfo',
        activeStepIndex: 0,
        maxValidIndex: 0,
        maxCompleteIndex: 0,
        steps: []
      }
    });
    expect(withVirtualOtherStep['LINES__MP_COOK_TEMP__r1']).toBeUndefined();

    const withVirtualFoodSafety = validateForm({
      definition,
      language: 'EN' as any,
      values,
      lineItems,
      virtualState: {
        prefix: '__ckStep',
        activeStepId: 'foodSafety',
        activeStepIndex: 1,
        maxValidIndex: 0,
        maxCompleteIndex: 0,
        steps: []
      }
    });
    expect(withVirtualFoodSafety['LINES__MP_COOK_TEMP__r1']).toBeDefined();
  });
});

