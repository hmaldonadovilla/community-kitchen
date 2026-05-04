import { resolveGuidedListProjection } from '../../../src/web/react/features/steps/domain/guidedListProjection';
import { resolveVirtualStepField } from '../../../src/web/react/features/steps/domain/resolveVirtualStepField';

const makeDefinition = (defaultForwardGate: 'free' | 'whenComplete' | 'whenValid' = 'whenValid'): any => ({
  questions: [
    { id: 'A', type: 'TEXT', required: true, label: { en: 'A', fr: 'A', nl: 'A' } },
    { id: 'B', type: 'TEXT', required: false, label: { en: 'B', fr: 'B', nl: 'B' } }
  ],
  steps: {
    mode: 'guided',
    defaultForwardGate,
    items: [
      { id: 'order', include: [{ kind: 'question', id: 'A' }] },
      { id: 'production', include: [{ kind: 'question', id: 'B' }] },
      {
        id: 'email',
        includeWhen: { fieldId: 'showEmail', equals: ['yes'] },
        include: []
      }
    ]
  }
});

describe('guidedListProjection domain', () => {
  test('returns an inactive projection outside guided visibility', () => {
    const projection = resolveGuidedListProjection({
      definition: makeDefinition(),
      language: 'EN',
      values: {},
      lineItems: {},
      applyVisibility: false,
      getVisibilityValue: () => undefined
    });

    expect(projection.stepsConfig).toBeNull();
    expect(projection.visibleSteps).toEqual([]);
    expect(projection.virtualState).toBeNull();
    expect(projection.maxReachableIndex).toBe(-1);
  });

  test('projects visible steps and whenValid reachability into virtual step fields', () => {
    const values: any = { A: 'filled', B: '', showEmail: 'no' };
    const projection = resolveGuidedListProjection({
      definition: makeDefinition('whenValid'),
      language: 'EN',
      values,
      lineItems: {},
      applyVisibility: true,
      getVisibilityValue: fieldId => values[fieldId]
    });

    expect(projection.stepIds).toEqual(['order', 'production']);
    expect(projection.maxReachableIndex).toBe(1);
    expect(projection.activeStepId).toBe('production');
    expect(resolveVirtualStepField('__ckStep', projection.virtualState!)).toBe('production');
    // Status indexes preserve existing behavior from computeGuidedStepsStatus:
    // hidden steps still contribute to the virtual max-valid field.
    expect(resolveVirtualStepField('__ckStepMaxValidIndex', projection.virtualState!)).toBe(2);
  });

  test('uses whenComplete reachability for optional-but-incomplete step fields', () => {
    const incompleteValues: any = { A: 'filled', B: '', showEmail: 'yes' };
    const incomplete = resolveGuidedListProjection({
      definition: makeDefinition('whenComplete'),
      language: 'EN',
      values: incompleteValues,
      lineItems: {},
      applyVisibility: true,
      getVisibilityValue: fieldId => incompleteValues[fieldId]
    });

    expect(incomplete.stepIds).toEqual(['order', 'production', 'email']);
    expect(incomplete.maxReachableIndex).toBe(1);
    expect(incomplete.activeStepId).toBe('production');

    const completeValues: any = { A: 'filled', B: 'done', showEmail: 'yes' };
    const complete = resolveGuidedListProjection({
      definition: makeDefinition('whenComplete'),
      language: 'EN',
      values: completeValues,
      lineItems: {},
      applyVisibility: true,
      getVisibilityValue: fieldId => completeValues[fieldId]
    });

    expect(complete.maxReachableIndex).toBe(2);
    expect(complete.activeStepId).toBe('email');
  });
});
