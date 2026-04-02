import { filterVisibleGuidedSteps, isGuidedStepVisible } from '../../../src/web/react/features/steps/domain/stepVisibility';

describe('stepVisibility', () => {
  test('hides steps whose excludeWhen matches the current context', () => {
    const visible = isGuidedStepVisible(
      {
        excludeWhen: {
          fieldId: 'status',
          equals: ['Emailed', 'Closed']
        }
      } as any,
      {
        getValue: (fieldId: string) => (fieldId === 'status' ? 'Emailed' : undefined)
      } as any
    );
    expect(visible).toBe(false);
  });

  test('filters guided steps using includeWhen and excludeWhen', () => {
    const steps = filterVisibleGuidedSteps(
      [
        {
          id: 'leftoverForm',
          includeWhen: {
            fieldId: '__ckDataSourceCount.Leftover Inventory Data',
            greaterThan: 0
          }
        },
        {
          id: 'portioning',
          excludeWhen: {
            fieldId: 'status',
            equals: ['Emailed', 'Closed']
          }
        },
        {
          id: 'leftovers'
        }
      ] as any[],
      {
        getValue: (fieldId: string) => {
          if (fieldId === '__ckDataSourceCount.Leftover Inventory Data') return 0;
          if (fieldId === 'status') return 'Emailed';
          return undefined;
        }
      } as any
    );

    expect(steps.map(step => step.id)).toEqual(['leftovers']);
  });
});
