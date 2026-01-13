import { computeGuidedStepsStatus } from '../../../src/web/react/features/steps/domain/computeStepStatus';
import { resolveVirtualStepField } from '../../../src/web/react/features/steps/domain/resolveVirtualStepField';

describe('guidedSteps domain', () => {
  it('computes per-step complete/valid and contiguous max indexes', () => {
    const definition: any = {
      questions: [
        { id: 'A', type: 'TEXT', required: true, label: { en: 'A', fr: 'A', nl: 'A' } },
        { id: 'B', type: 'TEXT', required: false, label: { en: 'B', fr: 'B', nl: 'B' } }
      ],
      steps: {
        mode: 'guided',
        items: [
          { id: 's1', include: [{ kind: 'question', id: 'A' }] },
          { id: 's2', include: [{ kind: 'question', id: 'B' }] }
        ]
      }
    };

    const out = computeGuidedStepsStatus({
      definition,
      language: 'EN' as any,
      values: { A: '', B: '' } as any,
      lineItems: {} as any
    });

    expect(out.steps.map(s => ({ id: s.id, complete: s.complete, valid: s.valid }))).toEqual([
      { id: 's1', complete: false, valid: false },
      // B is not required; s2 can be valid even if incomplete
      { id: 's2', complete: false, valid: true }
    ]);
    expect(out.maxCompleteIndex).toBe(-1);
    expect(out.maxValidIndex).toBe(-1);
  });

  it('applies row filtering for lifted lineGroup fields (only evaluates included rows)', () => {
    const definition: any = {
      questions: [
        {
          id: 'G',
          type: 'LINE_ITEM_GROUP',
          required: false,
          lineItemConfig: {
            fields: [
              { id: 'QTY', type: 'NUMBER', required: false, options: [], optionsFr: [], optionsNl: [] },
              { id: 'MEAL_TYPE', type: 'CHOICE', required: true, options: [], optionsFr: [], optionsNl: [] }
            ]
          }
        }
      ],
      steps: {
        mode: 'guided',
        items: [
          {
            id: 'recipes',
            include: [
              {
                kind: 'lineGroup',
                id: 'G',
                presentation: 'liftedRowFields',
                rows: { includeWhen: { fieldId: 'QTY', greaterThan: 0 } },
                fields: ['MEAL_TYPE']
              }
            ]
          }
        ]
      }
    };

    const out = computeGuidedStepsStatus({
      definition,
      language: 'EN' as any,
      values: {} as any,
      lineItems: {
        G: [
          { id: 'r1', values: { QTY: 0, MEAL_TYPE: '' } },
          { id: 'r2', values: { QTY: 2, MEAL_TYPE: '' } }
        ]
      } as any
    });

    expect(out.steps[0].missingRequiredCount).toBe(1); // only r2 is in scope
    expect(out.steps[0].complete).toBe(false);
    expect(out.steps[0].valid).toBe(false);
  });

  it('supports validationRows to validate a subset of rows while still allowing all rows to be displayed', () => {
    const definition: any = {
      questions: [
        {
          id: 'G',
          type: 'LINE_ITEM_GROUP',
          required: false,
          lineItemConfig: {
            fields: [
              { id: 'QTY', type: 'NUMBER', required: false, options: [], optionsFr: [], optionsNl: [] },
              { id: 'MEAL_TYPE', type: 'CHOICE', required: true, options: [], optionsFr: [], optionsNl: [] }
            ]
          }
        }
      ],
      steps: {
        mode: 'guided',
        items: [
          {
            id: 'orderForm',
            include: [
              {
                kind: 'lineGroup',
                id: 'G',
                presentation: 'liftedRowFields',
                // Display could still show all rows (no `rows` filter), but validation should only consider rows where QTY > 0.
                validationRows: { includeWhen: { fieldId: 'QTY', greaterThan: 0 } },
                fields: ['MEAL_TYPE']
              }
            ]
          }
        ]
      }
    };

    const out = computeGuidedStepsStatus({
      definition,
      language: 'EN' as any,
      values: {} as any,
      lineItems: {
        G: [
          { id: 'r1', values: { QTY: 0, MEAL_TYPE: '' } },
          { id: 'r2', values: { QTY: 2, MEAL_TYPE: '' } }
        ]
      } as any
    });

    // Completion counts all displayed rows (no `rows` filter). Validity counts only validationRows (QTY > 0).
    // Both rows are missing required MEAL_TYPE -> completion missing count is 2.
    expect(out.steps[0].missingRequiredCount).toBe(2);
    expect(out.steps[0].complete).toBe(false);
    expect(out.steps[0].valid).toBe(false);

    const outNone = computeGuidedStepsStatus({
      definition,
      language: 'EN' as any,
      values: {} as any,
      lineItems: { G: [{ id: 'r1', values: { QTY: 0, MEAL_TYPE: '' } }] } as any
    });

    // With a validation-only row filter, the step should NOT be vacuously complete/valid when no rows match.
    expect(outNone.steps[0].missingRequiredCount).toBe(1);
    expect(outNone.steps[0].complete).toBe(false);
    expect(outNone.steps[0].valid).toBe(false);
  });

  it('treats progressive rows blocked by expandGate (collapsedFieldsValid) as blocking step completion/validity', () => {
    const definition: any = {
      questions: [
        {
          id: 'G',
          type: 'LINE_ITEM_GROUP',
          required: false,
          lineItemConfig: {
            ui: {
              mode: 'progressive',
              expandGate: 'collapsedFieldsValid',
              defaultCollapsed: true,
              collapsedFields: [
                { fieldId: 'MEAL_TYPE', showLabel: true },
                { fieldId: 'QTY', showLabel: true }
              ]
            },
            fields: [
              { id: 'MEAL_TYPE', type: 'CHOICE', required: true, options: [], optionsFr: [], optionsNl: [] },
              { id: 'QTY', type: 'NUMBER', required: true, options: [], optionsFr: [], optionsNl: [] }
            ]
          }
        }
      ],
      steps: {
        mode: 'guided',
        items: [
          {
            id: 's1',
            include: [
              {
                kind: 'lineGroup',
                id: 'G',
                presentation: 'liftedRowFields',
                fields: ['MEAL_TYPE', 'QTY']
              }
            ]
          }
        ]
      }
    };

    const out = computeGuidedStepsStatus({
      definition,
      language: 'EN' as any,
      values: {} as any,
      lineItems: {
        G: [
          // r1 is disabled by expandGate (QTY missing)
          { id: 'r1', values: { MEAL_TYPE: 'A', QTY: '' } },
          // r2 is enabled and valid
          { id: 'r2', values: { MEAL_TYPE: 'B', QTY: 2 } }
        ]
      } as any
    });

    // This step targets ONLY collapsed fields, so expandGate should NOT suppress validation of those fields.
    // r1 has missing QTY, so the step is incomplete/invalid.
    expect(out.steps[0].missingRequiredCount).toBe(1);
    expect(out.steps[0].complete).toBe(false);
    expect(out.steps[0].valid).toBe(false);
  });

  it('does not require expanded fields/subgroups while a progressive row is locked by expandGate', () => {
    const definition: any = {
      questions: [
        {
          id: 'G',
          type: 'LINE_ITEM_GROUP',
          required: false,
          lineItemConfig: {
            ui: {
              mode: 'progressive',
              expandGate: 'collapsedFieldsValid',
              defaultCollapsed: true,
              collapsedFields: [
                { fieldId: 'MEAL_TYPE', showLabel: true },
                { fieldId: 'QTY', showLabel: true }
              ]
            },
            fields: [
              { id: 'MEAL_TYPE', type: 'CHOICE', required: true, options: [], optionsFr: [], optionsNl: [] },
              { id: 'QTY', type: 'NUMBER', required: true, options: [], optionsFr: [], optionsNl: [] },
              // Expanded field for the step: should only be counted once the row is unlocked
              { id: 'RECIPE', type: 'CHOICE', required: true, options: [], optionsFr: [], optionsNl: [] }
            ],
            subGroups: [
              {
                id: 'SUB',
                label: { en: 'Sub', fr: 'Sub', nl: 'Sub' },
                fields: [{ id: 'SUB_A', type: 'TEXT', required: true }]
              }
            ]
          }
        }
      ],
      steps: {
        mode: 'guided',
        items: [
          {
            id: 's1',
            include: [
              {
                kind: 'lineGroup',
                id: 'G',
                presentation: 'groupEditor',
                fields: ['MEAL_TYPE', 'QTY', 'RECIPE'],
                subGroups: { include: [{ id: 'SUB', fields: ['SUB_A'] }] }
              }
            ]
          }
        ]
      }
    };

    const out = computeGuidedStepsStatus({
      definition,
      language: 'EN' as any,
      values: {} as any,
      lineItems: {
        G: [
          // r1 is locked by expandGate due to missing QTY; RECIPE + subgroup should NOT count yet
          { id: 'r1', values: { MEAL_TYPE: 'A', QTY: '', RECIPE: '' } },
          // r2 is unlocked; RECIPE should count
          { id: 'r2', values: { MEAL_TYPE: 'B', QTY: 2, RECIPE: '' } }
        ],
        'G::r1::SUB': [{ id: 'sr1', values: { SUB_A: '' } }],
        'G::r2::SUB': [{ id: 'sr2', values: { SUB_A: '' } }]
      } as any
    });

    // Missing should include: r1.QTY (collapsed field), plus r2.RECIPE + r2.SUB_A.
    // r1 is expandGate-locked, so expanded fields/subgroups should not contribute for r1.
    expect(out.steps[0].missingRequiredCount).toBe(3);
    expect(out.steps[0].complete).toBe(false);
    expect(out.steps[0].valid).toBe(false);
  });

  it('resolves __ckStep* virtual fields for visibility', () => {
    const state = {
      prefix: '__ckStep',
      activeStepId: 'order',
      activeStepIndex: 1,
      maxValidIndex: 0,
      maxCompleteIndex: 0,
      steps: [
        { id: 'context', index: 0, complete: true, valid: true, missingRequiredCount: 0, errorCount: 0 },
        { id: 'order', index: 1, complete: false, valid: false, missingRequiredCount: 2, errorCount: 0 }
      ]
    };

    expect(resolveVirtualStepField('__ckStep', state as any)).toBe('order');
    expect(resolveVirtualStepField('__ckStepIndex', state as any)).toBe(1);
    expect(resolveVirtualStepField('__ckStepMaxValidIndex', state as any)).toBe(0);
    expect(resolveVirtualStepField('__ckStepMaxCompleteIndex', state as any)).toBe(0);
    expect(resolveVirtualStepField('__ckStepValid_context', state as any)).toBe('true');
    expect(resolveVirtualStepField('__ckStepValid_order', state as any)).toBe('false');
    expect(resolveVirtualStepField('__ckStepComplete_context', state as any)).toBe('true');
    expect(resolveVirtualStepField('__ckStepComplete_order', state as any)).toBe('false');
  });
});

