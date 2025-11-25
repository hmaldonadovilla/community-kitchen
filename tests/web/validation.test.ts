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
});
