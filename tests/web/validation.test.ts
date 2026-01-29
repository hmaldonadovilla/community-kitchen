import { checkRule, evaluateRules, validateRules } from '../../src/web/rules/validation';

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

  it('validates integer-only rules', () => {
    expect(checkRule('2', { fieldId: 'x', integer: true } as any, 'EN', undefined)).toBe('');
    expect(checkRule('2.5', { fieldId: 'x', integer: true } as any, 'EN', undefined)).toContain('whole');
  });

  it('treats a bare minus sign as invalid when min is set', () => {
    const msg = checkRule('-', { fieldId: 'x', min: 0 }, 'EN', { en: 'Enter 0 or more' });
    expect(msg).toContain('0 or more');
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

  it('supports warning-level rules without blocking submission validation', () => {
    const rules = [
      {
        level: 'warning',
        when: { fieldId: 'A', notEmpty: true },
        then: { fieldId: 'B', required: true },
        message: { en: 'B should be filled when A is set.' }
      }
    ];

    const issues = evaluateRules(rules as any, {
      language: 'EN',
      getValue: (id: string) => (id === 'A' ? 'hello' : ''),
      isHidden: () => false
    } as any);
    expect(issues.length).toBe(1);
    expect((issues[0] as any).level).toBe('warning');

    const errorsOnly = validateRules(rules as any, {
      language: 'EN',
      getValue: (id: string) => (id === 'A' ? 'hello' : ''),
      isHidden: () => false
    } as any);
    expect(errorsOnly.length).toBe(0);
  });

  it('treats level=WARNING (case-insensitive) as non-blocking', () => {
    const rules = [
      {
        level: 'WARNING',
        when: { fieldId: 'A', notEmpty: true },
        then: { fieldId: 'B', required: true },
        message: { en: 'B should be filled when A is set.' }
      }
    ];

    const errorsOnly = validateRules(rules as any, {
      language: 'EN',
      getValue: (id: string) => (id === 'A' ? 'hello' : ''),
      isHidden: () => false
    } as any);
    expect(errorsOnly.length).toBe(0);
  });

  it('supports message-only warning rules (no then)', () => {
    const rules = [
      {
        level: 'warning',
        when: { fieldId: 'STATUS', equals: 'warn' },
        message: {
          en: 'Status triggered a warning.'
        }
      }
    ];

    const issues = evaluateRules(rules as any, {
      language: 'EN',
      getValue: (id: string) => (id === 'STATUS' ? 'warn' : ''),
      isHidden: () => false
    } as any);
    expect(issues.length).toBe(1);
    expect(issues[0].fieldId).toBe('STATUS');
    expect((issues[0] as any).level).toBe('warning');

    const errorsOnly = validateRules(rules as any, {
      language: 'EN',
      getValue: (id: string) => (id === 'STATUS' ? 'warn' : ''),
      isHidden: () => false
    } as any);
    expect(errorsOnly.length).toBe(0);
  });

  it('treats required rules as needing true for boolean values', () => {
    const rules = [
      {
        when: { fieldId: 'CONFIRM', isEmpty: true },
        then: { fieldId: 'CONFIRM', required: true },
        message: { en: 'Confirmation is required.' }
      }
    ];

    const missing = validateRules(rules as any, {
      language: 'EN',
      getValue: (id: string) => (id === 'CONFIRM' ? false : ''),
      isHidden: () => false
    } as any);
    expect(missing.length).toBe(1);

    const ok = validateRules(rules as any, {
      language: 'EN',
      getValue: (id: string) => (id === 'CONFIRM' ? true : ''),
      isHidden: () => false
    } as any);
    expect(ok.length).toBe(0);
  });

  it('supports compound when clauses (all/any/not)', () => {
    const rules = [
      {
        when: { all: [{ fieldId: 'A', equals: 'yes' }, { fieldId: 'B', equals: 'go' }] },
        then: { fieldId: 'C', required: true }
      }
    ];

    const match = validateRules(rules as any, {
      language: 'EN',
      getValue: (id: string) => (id === 'A' ? 'yes' : id === 'B' ? 'go' : ''),
      isHidden: () => false
    } as any);
    expect(match.length).toBe(1);
    expect(match[0].fieldId).toBe('C');

    const noMatch = validateRules(rules as any, {
      language: 'EN',
      getValue: (id: string) => (id === 'A' ? 'yes' : id === 'B' ? 'stop' : ''),
      isHidden: () => false
    } as any);
    expect(noMatch.length).toBe(0);
  });

  it('supports warningDisplay (top/field/both) on warning rules', () => {
    const base = {
      level: 'warning',
      when: { fieldId: 'A', notEmpty: true },
      message: { en: 'Warn A' }
    };

    const top = evaluateRules([{ ...base, warningDisplay: 'top' }] as any, {
      language: 'EN',
      getValue: (id: string) => (id === 'A' ? 'x' : ''),
      isHidden: () => false
    } as any);
    expect((top[0] as any).warningDisplay).toBe('top');

    const field = evaluateRules([{ ...base, warningDisplay: 'field' }] as any, {
      language: 'EN',
      getValue: (id: string) => (id === 'A' ? 'x' : ''),
      isHidden: () => false
    } as any);
    expect((field[0] as any).warningDisplay).toBe('field');

    const both = evaluateRules([{ ...base, warningDisplay: 'both' }] as any, {
      language: 'EN',
      getValue: (id: string) => (id === 'A' ? 'x' : ''),
      isHidden: () => false
    } as any);
    expect((both[0] as any).warningDisplay).toBe('both');
  });
});
