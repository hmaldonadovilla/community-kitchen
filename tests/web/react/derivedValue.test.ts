import { applyValueMapsToForm } from '../../../src/web/react/app/valueMaps';

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
});


