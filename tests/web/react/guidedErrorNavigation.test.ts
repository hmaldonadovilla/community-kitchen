import {
  isGuidedErrorKeyVisibleInTargets,
  normalizeGuidedRowFilterForGroup,
  resolveGuidedErrorNavigationTarget
} from '../../../src/web/react/features/validation/domain/guidedErrorNavigation';

describe('guided error navigation domain', () => {
  test('normalizes row filters from grouped field references', () => {
    expect(
      normalizeGuidedRowFilterForGroup('MEALS', {
        includeWhen: { fieldId: 'MEALS__TYPE', equals: 'dinner' },
        excludeWhen: { fieldId: 'MEALS.STATUS', equals: 'cancelled' }
      })
    ).toEqual({
      includeWhen: { fieldId: 'TYPE', equals: 'dinner' },
      excludeWhen: { fieldId: 'STATUS', equals: 'cancelled' }
    });
  });

  test('prefers an error visible in the active step', () => {
    const result = resolveGuidedErrorNavigationTarget({
      errorKeys: ['EMAIL', 'MEALS__QTY__row1'],
      guidedEnabled: true,
      guidedStepsCfg: { header: { include: [] } },
      guidedStepIds: ['production', 'email'],
      guidedVisibleSteps: [
        { id: 'production', include: [{ kind: 'lineGroup', id: 'MEALS', fields: ['QTY'] }] },
        { id: 'email', include: [{ kind: 'question', id: 'EMAIL' }] }
      ],
      activeGuidedStepId: 'production',
      maxReachableGuidedIndex: 1,
      lineItems: { MEALS: [{ id: 'row1', values: { QTY: '' } }] }
    });

    expect(result).toEqual({ key: 'MEALS__QTY__row1', stepId: 'production' });
  });

  test('falls forward to the earliest reachable step containing an error', () => {
    const result = resolveGuidedErrorNavigationTarget({
      errorKeys: ['EMAIL'],
      guidedEnabled: true,
      guidedStepsCfg: { header: { include: [] } },
      guidedStepIds: ['production', 'email'],
      guidedVisibleSteps: [
        { id: 'production', include: [{ kind: 'lineGroup', id: 'MEALS', fields: ['QTY'] }] },
        { id: 'email', include: [{ kind: 'question', id: 'EMAIL' }] }
      ],
      activeGuidedStepId: 'production',
      maxReachableGuidedIndex: 1,
      lineItems: {}
    });

    expect(result).toEqual({ key: 'EMAIL', stepId: 'email' });
  });

  test('honors line field and row filters', () => {
    const targets = [
      {
        kind: 'lineGroup',
        id: 'MEALS',
        fields: ['QTY'],
        rows: { includeWhen: { fieldId: 'MEAL_TYPE', equals: 'dinner' } }
      }
    ];
    const lineItems = {
      MEALS: [
        { id: 'row1', values: { MEAL_TYPE: 'lunch', QTY: '' } },
        { id: 'row2', values: { MEAL_TYPE: 'dinner', QTY: '' } }
      ]
    };

    expect(isGuidedErrorKeyVisibleInTargets({ targets, key: 'MEALS__QTY__row1', lineItems })).toBe(false);
    expect(isGuidedErrorKeyVisibleInTargets({ targets, key: 'MEALS__QTY__row2', lineItems })).toBe(true);
    expect(isGuidedErrorKeyVisibleInTargets({ targets, key: 'MEALS__NOTE__row2', lineItems })).toBe(false);
  });

  test('requires explicit subgroup config when parent fields are scoped', () => {
    const subgroupKey = 'MEALS::row1::DETAILS';
    const lineItems = {
      MEALS: [{ id: 'row1', values: { MEAL_TYPE: 'dinner' } }]
    };

    expect(
      isGuidedErrorKeyVisibleInTargets({
        targets: [{ kind: 'lineGroup', id: 'MEALS', fields: ['QTY'] }],
        key: `${subgroupKey}__NOTE__detail1`,
        lineItems
      })
    ).toBe(false);

    expect(
      isGuidedErrorKeyVisibleInTargets({
        targets: [{ kind: 'lineGroup', id: 'MEALS', fields: ['QTY'], subGroups: { include: [{ id: 'DETAILS' }] } }],
        key: `${subgroupKey}__NOTE__detail1`,
        lineItems
      })
    ).toBe(true);
  });
});
