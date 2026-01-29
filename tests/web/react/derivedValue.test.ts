import { applyValueMapsToForm } from '../../../src/web/react/app/valueMaps';
import { buildSubgroupKey } from '../../../src/web/react/app/lineItems';

const pad2 = (n: number) => n.toString().padStart(2, '0');

const localYmdNow = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

describe('derivedValue', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    // Use a local-time timestamp (no timezone suffix) so the test is stable across environments.
    jest.setSystemTime(new Date('2025-12-20T09:15:00'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('prefills today when empty (default when=empty)', () => {
    const definition: any = {
      questions: [
        {
          id: 'TODAY',
          type: 'DATE',
          derivedValue: { op: 'today' }
        }
      ]
    };

    const { values } = applyValueMapsToForm(definition, { TODAY: '' } as any, {} as any);
    expect(values.TODAY).toBe(localYmdNow());
  });

  it('today does not override a non-empty value by default', () => {
    const definition: any = {
      questions: [
        {
          id: 'TODAY',
          type: 'DATE',
          derivedValue: { op: 'today' }
        }
      ]
    };

    const { values } = applyValueMapsToForm(definition, { TODAY: '2025-01-01' } as any, {} as any);
    expect(values.TODAY).toBe('2025-01-01');
  });

  it('timeOfDayMap selects the first matching threshold and falls back when needed', () => {
    const definition: any = {
      questions: [
        {
          id: 'SHIFT_LABEL',
          type: 'CHOICE',
          derivedValue: {
            op: 'timeOfDayMap',
            thresholds: [
              { before: '10h', value: 'Before 10' },
              { before: '12h', value: 'Still morning' },
              { before: '15h', value: 'Getting closer to tea time' },
              { value: 'out of office' }
            ]
          }
        }
      ]
    };

    // 09:15 -> Before 10
    const a = applyValueMapsToForm(definition, { SHIFT_LABEL: '' } as any, {} as any);
    expect(a.values.SHIFT_LABEL).toBe('Before 10');

    // 18:00 -> fallback
    jest.setSystemTime(new Date('2025-12-20T18:00:00'));
    const b = applyValueMapsToForm(definition, { SHIFT_LABEL: '' } as any, {} as any);
    expect(b.values.SHIFT_LABEL).toBe('out of office');
  });

  it('timeOfDayMap does not override a non-empty value by default', () => {
    const definition: any = {
      questions: [
        {
          id: 'SHIFT',
          type: 'CHOICE',
          derivedValue: {
            op: 'timeOfDayMap',
            thresholds: [{ before: 12, value: 'AM' }, { value: 'PM' }]
          }
        }
      ]
    };

    const { values } = applyValueMapsToForm(definition, { SHIFT: 'manual' } as any, {} as any);
    expect(values.SHIFT).toBe('manual');
  });

  it('addDays still applies always by default', () => {
    const definition: any = {
      questions: [
        { id: 'BASE', type: 'DATE' },
        { id: 'EXP', type: 'DATE', derivedValue: { op: 'addDays', dependsOn: 'BASE', offsetDays: 2 } }
      ]
    };

    const { values } = applyValueMapsToForm(definition, { BASE: '2025-01-01', EXP: '2025-01-10' } as any, {} as any);
    expect(values.EXP).toBe('2025-01-03');
  });

  it('copy prefills from dependsOn when empty (default when=empty)', () => {
    const definition: any = {
      questions: [
        { id: 'A', type: 'NUMBER' },
        { id: 'B', type: 'NUMBER', derivedValue: { op: 'copy', dependsOn: 'A' } }
      ]
    };

    const { values } = applyValueMapsToForm(definition, { A: 20, B: '' } as any, {} as any, { mode: 'blur' });
    expect(values.B).toBe(20);
  });

  it('copy does not override a non-empty value by default', () => {
    const definition: any = {
      questions: [
        { id: 'A', type: 'NUMBER' },
        { id: 'B', type: 'NUMBER', derivedValue: { op: 'copy', dependsOn: 'A' } }
      ]
    };

    const { values } = applyValueMapsToForm(definition, { A: 20, B: 25 } as any, {} as any, { mode: 'blur' });
    expect(values.B).toBe(25);
  });

  it('copy does not apply during mode=change when applyOn=blur (prevents mid-typing updates)', () => {
    const definition: any = {
      questions: [
        { id: 'QTY', type: 'NUMBER' },
        { id: 'ACTUAL', type: 'NUMBER', derivedValue: { op: 'copy', dependsOn: 'QTY', applyOn: 'blur' } }
      ]
    };

    const { values } = applyValueMapsToForm(definition, { QTY: 2, ACTUAL: '' } as any, {} as any, { mode: 'change' });
    expect(values.ACTUAL).toBe('');
  });

  it('copy overrides when when=always', () => {
    const definition: any = {
      questions: [
        { id: 'A', type: 'NUMBER' },
        { id: 'B', type: 'NUMBER', derivedValue: { op: 'copy', dependsOn: 'A', when: 'always' } }
      ]
    };

    const { values } = applyValueMapsToForm(definition, { A: 20, B: 25 } as any, {} as any, { mode: 'blur' });
    expect(values.B).toBe(20);
  });

  it('copyMode=allowIncrease clamps numeric values to never go below the source (when=always)', () => {
    const definition: any = {
      questions: [
        { id: 'QTY', type: 'NUMBER' },
        { id: 'ACTUAL', type: 'NUMBER', derivedValue: { op: 'copy', dependsOn: 'QTY', when: 'always', copyMode: 'allowIncrease' } }
      ]
    };

    const a = applyValueMapsToForm(definition, { QTY: 20, ACTUAL: 25 } as any, {} as any, { mode: 'blur' });
    expect(a.values.ACTUAL).toBe(25);

    const b = applyValueMapsToForm(definition, { QTY: 20, ACTUAL: 15 } as any, {} as any, { mode: 'blur' });
    expect(b.values.ACTUAL).toBe(20);
  });

  it('copyMode=allowDecrease clamps numeric values to never go above the source (when=always)', () => {
    const definition: any = {
      questions: [
        { id: 'QTY', type: 'NUMBER' },
        { id: 'ACTUAL', type: 'NUMBER', derivedValue: { op: 'copy', dependsOn: 'QTY', when: 'always', copyMode: 'allowDecrease' } }
      ]
    };

    const a = applyValueMapsToForm(definition, { QTY: 20, ACTUAL: 15 } as any, {} as any, { mode: 'blur' });
    expect(a.values.ACTUAL).toBe(15);

    const b = applyValueMapsToForm(definition, { QTY: 20, ACTUAL: 25 } as any, {} as any, { mode: 'blur' });
    expect(b.values.ACTUAL).toBe(20);
  });

  it('calc computes line-item aggregates with filters', () => {
    const definition: any = {
      questions: [
        {
          id: 'MP_MEALS_REQUEST',
          type: 'LINE_ITEM_GROUP',
          lineItemConfig: {
            fields: [
              { id: 'QTY', type: 'NUMBER' },
              {
                id: 'MP_TO_COOK',
                type: 'NUMBER',
                derivedValue: {
                  op: 'calc',
                  expression: '{QTY} - SUM(MP_TYPE_LI.PREP_QTY)',
                  lineItemFilters: [
                    { ref: 'MP_TYPE_LI.PREP_QTY', when: { fieldId: 'PREP_TYPE', equals: ['Full Dish'] } }
                  ]
                }
              }
            ],
            subGroups: [
              {
                id: 'MP_TYPE_LI',
                fields: [
                  { id: 'PREP_QTY', type: 'NUMBER' },
                  { id: 'PREP_TYPE', type: 'CHOICE' }
                ]
              }
            ]
          }
        }
      ]
    };

    const rowId = 'row_1';
    const lineItems: any = {
      MP_MEALS_REQUEST: [{ id: rowId, values: { QTY: 10 } }]
    };
    const subgroupKey = buildSubgroupKey('MP_MEALS_REQUEST', rowId, 'MP_TYPE_LI');
    lineItems[subgroupKey] = [
      { id: 'sub_1', values: { PREP_QTY: 3, PREP_TYPE: 'Full Dish' } },
      { id: 'sub_2', values: { PREP_QTY: 2, PREP_TYPE: 'Cook' } }
    ];

    const { lineItems: computed } = applyValueMapsToForm(definition, {} as any, lineItems, { mode: 'change' });
    const updatedRow = (computed.MP_MEALS_REQUEST || []).find((row: any) => row.id === rowId);
    expect(updatedRow?.values?.MP_TO_COOK).toBe(7);
  });
});


