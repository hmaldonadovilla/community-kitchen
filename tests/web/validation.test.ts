import { checkRule, validateRules } from '../../src/web/rules/validation';

describe('validation rules', () => {
  it('validates required', () => {
    const msg = checkRule('', { fieldId: 'x', required: true }, 'EN', undefined);
    expect(msg).toContain('required');
  });

  it('validates min/max', () => {
    expect(checkRule('1', { fieldId: 'x', min: 2 }, 'EN', undefined)).toContain('>=');
    expect(checkRule('5', { fieldId: 'x', max: 2 }, 'EN', undefined)).toContain('<=');
  });

  it('does not apply min/max to empty values when not required', () => {
    expect(checkRule('', { fieldId: 'x', min: 2 }, 'EN', undefined)).toBe('');
    expect(checkRule('', { fieldId: 'x', max: 2 }, 'EN', undefined)).toBe('');
  });

  it('supports min/max derived from another field (minFieldId/maxFieldId)', () => {
    const msg = checkRule(
      '19',
      { fieldId: 'B', minFieldId: 'A' } as any,
      'EN',
      undefined,
      (id: string) => (id === 'A' ? 20 : undefined)
    );
    expect(msg).toContain('20');
    expect(msg).toContain('>=');
  });

  it('validateRules respects when/hide', () => {
    const rules = [
      {
        when: { fieldId: 'a', equals: 'yes' },
        then: { fieldId: 'b', required: true }
      }
    ];
    const errors = validateRules(rules as any, {
      language: 'EN',
      getValue: (id: string) => (id === 'a' ? 'yes' : ''),
      isHidden: () => false
    });
    expect(errors[0].fieldId).toBe('b');
  });

  it('validateRules can enforce minFieldId cross-field comparisons', () => {
    const rules = [
      {
        when: { fieldId: 'A' }, // always applies
        then: { fieldId: 'B', minFieldId: 'A' }
      }
    ];
    const errors = validateRules(rules as any, {
      language: 'EN',
      getValue: (id: string) => (id === 'A' ? 20 : id === 'B' ? 19 : ''),
      isHidden: () => false
    } as any);
    expect(errors.length).toBe(1);
    expect(errors[0].fieldId).toBe('B');
  });

  it('supports when.notEmpty for conditional required (text fields)', () => {
    const rules = [
      {
        when: { fieldId: 'A', notEmpty: true },
        then: { fieldId: 'B', required: true }
      }
    ];

    const emptyA = validateRules(rules as any, {
      language: 'EN',
      getValue: (id: string) => (id === 'A' ? '' : ''),
      isHidden: () => false
    } as any);
    expect(emptyA.length).toBe(0);

    const blankA = validateRules(rules as any, {
      language: 'EN',
      getValue: (id: string) => (id === 'A' ? '   ' : ''),
      isHidden: () => false
    } as any);
    expect(blankA.length).toBe(0);

    const nonEmptyA = validateRules(rules as any, {
      language: 'EN',
      getValue: (id: string) => (id === 'A' ? 'hello' : ''),
      isHidden: () => false
    } as any);
    expect(nonEmptyA.length).toBe(1);
    expect(nonEmptyA[0].fieldId).toBe('B');
  });
});
