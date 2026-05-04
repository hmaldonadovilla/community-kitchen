import {
  collectGuidedContextHeaderConfig,
  resolveGuidedContextHeaderValue
} from '../../../src/web/react/features/steps/domain/guidedContextHeader';

describe('guided context header', () => {
  it('collects explicit, field-list, and keyed context header parts', () => {
    expect(
      collectGuidedContextHeaderConfig({
        separator: ' / ',
        parts: ['customer', { fieldId: 'customer', displayField: 'name' }, null, { id: 'date' }]
      })
    ).toEqual({
      separator: ' / ',
      partIds: ['customer', 'date'],
      parts: [
        { id: 'customer' },
        { id: 'customer', displayField: 'name' },
        { id: 'date' }
      ]
    });

    expect(
      collectGuidedContextHeaderConfig({
        part2: 'serviceDate',
        part1: 'customer'
      }).parts
    ).toEqual([{ id: 'customer' }, { id: 'serviceDate' }]);
  });

  it('formats date and raw option display values', () => {
    const dateValue = resolveGuidedContextHeaderValue({
      part: { id: 'serviceDate' },
      question: { id: 'serviceDate', type: 'DATE' } as any,
      raw: '2026-05-04',
      values: {},
      language: 'EN'
    });
    const optionValue = resolveGuidedContextHeaderValue({
      part: { id: 'customer', displayField: 'displayName' },
      question: { id: 'customer', type: 'CHOICE' } as any,
      raw: 'cust1',
      values: {},
      language: 'EN',
      optionSet: {
        en: ['cust1'],
        raw: [
          {
            __ckOptionValue: 'cust1',
            __ckOptionLabel: 'Customer One',
            displayName: 'Kitchen Client'
          }
        ]
      } as any
    });

    expect(dateValue).toBe('Mon, 04-May-2026');
    expect(optionValue).toBe('Kitchen Client');
  });
});
