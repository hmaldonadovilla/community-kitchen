import { matchesWhen, shouldHideField } from '../../src/web/rules/visibility';

describe('shouldHideField', () => {
  const ctx = {
    getValue: (id: string) => (id === 'dep' ? 'yes' : ''),
    getLineValue: (_row: string, fieldId: string) => (fieldId === 'line__dep' ? 'no' : '')
  };

  it('hides when showWhen not matched', () => {
    const hide = shouldHideField({ showWhen: { fieldId: 'dep', equals: 'no' } }, ctx);
    expect(hide).toBe(true);
  });

  it('hides when hideWhen matched', () => {
    const hide = shouldHideField({ hideWhen: { fieldId: 'dep', equals: 'yes' } }, ctx);
    expect(hide).toBe(true);
  });

  it('shows when showWhen matched', () => {
    const hide = shouldHideField({ showWhen: { fieldId: 'dep', equals: 'yes' } }, ctx);
    expect(hide).toBe(false);
  });

  it('supports notEmpty in showWhen', () => {
    const ctxEmpty = { getValue: (_id: string) => '' };
    const ctxNonEmpty = { getValue: (_id: string) => 'hello' };
    expect(shouldHideField({ showWhen: { fieldId: 'dep', notEmpty: true } } as any, ctxEmpty as any)).toBe(true);
    expect(shouldHideField({ showWhen: { fieldId: 'dep', notEmpty: true } } as any, ctxNonEmpty as any)).toBe(false);
  });

  it('does not treat empty values as 0 for numeric comparisons', () => {
    expect(matchesWhen('', { fieldId: 'dep', lessThan: 63 } as any)).toBe(false);
    expect(matchesWhen('   ', { fieldId: 'dep', lessThan: 63 } as any)).toBe(false);
    expect(matchesWhen(0, { fieldId: 'dep', lessThan: 63 } as any)).toBe(true);
  });

  it('supports notEquals matching', () => {
    expect(matchesWhen('Closed', { fieldId: 'status', notEquals: 'Closed' } as any)).toBe(false);
    expect(matchesWhen('In progress', { fieldId: 'status', notEquals: 'Closed' } as any)).toBe(true);
    expect(matchesWhen(' Closed ', { fieldId: 'status', notEquals: ['Closed'] } as any)).toBe(false);
  });

  it('supports compound when clauses (all/any/not)', () => {
    const ctx2: any = {
      getValue: (id: string) => (id === 'a' ? 'yes' : id === 'b' ? 'ok' : '')
    };

    expect(shouldHideField({ showWhen: { all: [{ fieldId: 'a', equals: 'yes' }, { fieldId: 'b', equals: 'ok' }] } } as any, ctx2)).toBe(
      false
    );
    expect(shouldHideField({ showWhen: { all: [{ fieldId: 'a', equals: 'yes' }, { fieldId: 'b', equals: 'no' }] } } as any, ctx2)).toBe(
      true
    );

    expect(shouldHideField({ showWhen: { any: [{ fieldId: 'a', equals: 'no' }, { fieldId: 'b', equals: 'ok' }] } } as any, ctx2)).toBe(
      false
    );
    expect(
      shouldHideField({ showWhen: { any: [{ fieldId: 'a', equals: 'no' }, { fieldId: 'b', equals: 'no' }] } } as any, ctx2)
    ).toBe(true);

    // NOT can be used for "not equals"/"not in" patterns (negating a leaf or compound clause).
    expect(shouldHideField({ showWhen: { not: { fieldId: 'a', equals: 'yes' } } } as any, ctx2)).toBe(true);
    expect(shouldHideField({ hideWhen: { not: { fieldId: 'a', equals: 'yes' } } } as any, ctx2)).toBe(false);
  });

  it('supports lineItems row matching for top-level visibility', () => {
    const lineItems: any = {
      MEALS: [
        { id: 'r1', values: { RECIPE: '', MP_IS_REHEAT: 'No' } },
        { id: 'r2', values: { RECIPE: 'Soup', MP_IS_REHEAT: 'No' } }
      ]
    };
    const ctx: any = {
      getValue: (_id: string) => '',
      getLineItems: (groupId: string) => lineItems[groupId] || []
    };
    const visibility: any = {
      showWhen: {
        lineItems: {
          groupId: 'MEALS',
          when: {
            all: [
              { fieldId: 'RECIPE', notEmpty: true },
              { fieldId: 'MP_IS_REHEAT', equals: 'No' }
            ]
          }
        }
      }
    };
    expect(shouldHideField(visibility, ctx)).toBe(false);

    const lineItemsNoMatch: any = {
      MEALS: [
        { id: 'r1', values: { RECIPE: 'Soup', MP_IS_REHEAT: 'Yes' } },
        { id: 'r2', values: { RECIPE: '', MP_IS_REHEAT: 'No' } }
      ]
    };
    const ctxNoMatch: any = {
      getValue: (_id: string) => '',
      getLineItems: (groupId: string) => lineItemsNoMatch[groupId] || []
    };
    expect(shouldHideField(visibility, ctxNoMatch)).toBe(true);
  });

  it('supports lineItems subgroup matching', () => {
    const lineItems: any = {
      MEALS: [{ id: 'p1', values: { DISH: 'Pasta' } }],
      'MEALS::p1::INGREDIENTS': [{ id: 'c1', values: { ING_NAME: 'Tomato' } }]
    };
    const ctx: any = {
      getValue: (_id: string) => '',
      getLineItems: (groupId: string) => lineItems[groupId] || []
    };
    const visibility: any = {
      showWhen: {
        lineItems: {
          groupId: 'MEALS',
          subGroupId: 'INGREDIENTS',
          when: { fieldId: 'ING_NAME', equals: 'Tomato' }
        }
      }
    };
    expect(shouldHideField(visibility, ctx)).toBe(false);
  });

  it('does not fall back to top-level values for lineItems row fields', () => {
    const lineItems: any = {
      MEALS: [
        { id: 'r1', values: { RECIPE: 'Soup', MP_IS_REHEAT: 'Yes' } },
        { id: 'r2', values: { MP_IS_REHEAT: 'No' } }
      ]
    };
    const ctx: any = {
      getValue: (id: string) => (id === 'RECIPE' ? 'TopLevelRecipe' : ''),
      getLineItems: (groupId: string) => lineItems[groupId] || []
    };
    const visibility: any = {
      showWhen: {
        lineItems: {
          groupId: 'MEALS',
          match: 'any',
          when: {
            all: [
              { fieldId: 'RECIPE', notEmpty: true },
              { fieldId: 'MP_IS_REHEAT', equals: 'No' }
            ]
          }
        }
      }
    };
    expect(shouldHideField(visibility, ctx)).toBe(true);
  });

  it('supports parent-scoped subgroup matching', () => {
    const lineItems: any = {
      MEALS: [
        { id: 'p1', values: { RECIPE: 'Soup', MP_IS_REHEAT: 'No' } },
        { id: 'p2', values: { RECIPE: 'Salad', MP_IS_REHEAT: 'Yes' } }
      ],
      'MEALS::p1::ING': [{ id: 'c1', values: { __ckRowSource: 'manual' } }],
      'MEALS::p2::ING': [{ id: 'c2', values: { __ckRowSource: 'auto' } }]
    };
    const ctx: any = {
      getValue: (_id: string) => '',
      getLineItems: (groupId: string) => lineItems[groupId] || []
    };
    const visibility: any = {
      showWhen: {
        lineItems: {
          groupId: 'MEALS',
          subGroupId: 'ING',
          parentWhen: {
            all: [
              { fieldId: 'RECIPE', notEmpty: true },
              { fieldId: 'MP_IS_REHEAT', equals: 'No' }
            ]
          },
          when: { fieldId: '__ckRowSource', equals: 'manual' }
        }
      }
    };
    expect(shouldHideField(visibility, ctx)).toBe(false);

    const visibilityAllParents: any = {
      showWhen: {
        lineItems: {
          groupId: 'MEALS',
          subGroupId: 'ING',
          parentWhen: { fieldId: 'RECIPE', notEmpty: true },
          parentMatch: 'all',
          when: { fieldId: '__ckRowSource', equals: 'manual' }
        }
      }
    };
    expect(shouldHideField(visibilityAllParents, ctx)).toBe(true);
  });
});
