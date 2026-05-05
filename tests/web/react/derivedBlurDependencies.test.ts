import {
  collectDerivedBlurDependencies,
  isBlurDerivedValue,
  normalizeDerivedTokenToFieldId
} from '../../../src/web/react/features/derivedValues/domain/blurDependencies';

describe('derived blur dependencies domain', () => {
  test('detects blur-derived values using explicit and copy defaults', () => {
    expect(isBlurDerivedValue({ applyOn: 'blur' })).toBe(true);
    expect(isBlurDerivedValue({ applyOn: 'change', op: 'copy' })).toBe(false);
    expect(isBlurDerivedValue({ op: 'copy' })).toBe(true);
    expect(isBlurDerivedValue({ op: 'calc' })).toBe(false);
  });

  test('normalizes field tokens from dotted expressions', () => {
    expect(normalizeDerivedTokenToFieldId(' parent.quantity ')).toBe('quantity');
    expect(normalizeDerivedTokenToFieldId(' line . nested . field ')).toBe('field');
    expect(normalizeDerivedTokenToFieldId('')).toBe('');
  });

  test('collects dependencies from blur-derived expressions and filters', () => {
    const out = new Set<string>();
    collectDerivedBlurDependencies(
      {
        applyOn: 'blur',
        dependsOn: 'parent.customer',
        expression: 'SUM(lines.quantity) + { meal.count }',
        filters: [
          { ref: 'inventory.item', when: { fieldId: 'status', equals: 'active' } },
          { path: 'source.remaining' }
        ]
      },
      out
    );

    expect(Array.from(out).sort()).toEqual(['count', 'customer', 'item', 'quantity', 'remaining', 'status']);
  });
});
