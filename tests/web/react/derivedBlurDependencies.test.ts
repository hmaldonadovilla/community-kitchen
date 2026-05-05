import {
  collectDefinitionBlurDerivedDependencyIds,
  collectDerivedBlurDependencies,
  hasDefinitionBlurDerivedValues,
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

  test('detects and collects blur-derived metadata from form definitions', () => {
    const definition: any = {
      questions: [
        { id: 'customer', type: 'TEXT' },
        {
          id: 'deliveryLabel',
          type: 'TEXT',
          derivedValue: { applyOn: 'blur', dependsOn: 'customer' }
        },
        {
          id: 'lines',
          type: 'LINE_ITEM_GROUP',
          lineItemConfig: {
            fields: [
              { id: 'meal', type: 'TEXT' },
              { id: 'lineLabel', type: 'TEXT', derivedValue: { op: 'copy', dependsOn: 'meal' } }
            ],
            subGroups: [
              {
                id: 'packages',
                fields: [
                  {
                    id: 'packageLabel',
                    type: 'TEXT',
                    derivedValue: { applyOn: 'blur', expression: '{ package.count }' }
                  }
                ]
              }
            ]
          }
        }
      ]
    };

    expect(hasDefinitionBlurDerivedValues(definition)).toBe(true);
    expect(Array.from(collectDefinitionBlurDerivedDependencyIds(definition)).sort()).toEqual([
      'count',
      'customer',
      'deliveryLabel',
      'lineLabel',
      'meal',
      'packageLabel'
    ]);
  });
});
