import { resolveActiveFieldDisableRule, isFieldDisabledByRule } from '../../../src/web/react/app/fieldDisableRules';

describe('fieldDisableRules', () => {
  it('activates the first matching rule and respects bypass fields', () => {
    const active = resolveActiveFieldDisableRule({
      rules: [
        { id: 'future-date-lock', when: { fieldId: 'DATE', isInFuture: true }, bypassFields: ['COOK'] },
        { id: 'fallback', when: { fieldId: 'DATE', notEmpty: true } }
      ] as any,
      matchesWhen: when => (when as any)?.fieldId === 'DATE' && (when as any)?.isInFuture === true
    });
    expect(active?.id).toBe('future-date-lock');
    expect(isFieldDisabledByRule('DATE', active)).toBe(true);
    expect(isFieldDisabledByRule('COOK', active)).toBe(false);
    expect(isFieldDisabledByRule('cook', active)).toBe(false);
  });

  it('returns undefined when no rules match', () => {
    const active = resolveActiveFieldDisableRule({
      rules: [{ id: 'no-match', when: { fieldId: 'DATE', isInFuture: true } }] as any,
      matchesWhen: () => false
    });
    expect(active).toBeUndefined();
    expect(isFieldDisabledByRule('DATE', active)).toBe(false);
  });
});
