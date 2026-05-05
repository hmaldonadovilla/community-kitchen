import {
  computeTopLevelGroupProgress,
  findNextIncompleteGroupKey,
  resolveCollapsedGroupsAfterAutoCollapse,
  resolveCompletedGroupAutoCollapse,
  resolvePendingAutoCollapse
} from '../../../src/web/react/components/form/groupProgress';

const visibilityCtx = (values: Record<string, any> = {}, lineItems: Record<string, any[]> = {}) =>
  ({
    getValue: (fieldId: string) => values[fieldId],
    getLineItems: (groupId: string) => lineItems[groupId] || [],
    getLineItemKeys: () => Object.keys(lineItems)
  }) as any;

describe('group progress domain', () => {
  test('computes required completion for visible top-level groups', () => {
    const sections: any[] = [
      {
        key: 'header',
        isHeader: true,
        collapsible: true,
        questions: [{ id: 'headerField', type: 'TEXT', required: true }]
      },
      {
        key: 'main',
        isHeader: false,
        collapsible: true,
        questions: [
          { id: 'name', type: 'TEXT', required: true },
          {
            id: 'notes',
            type: 'PARAGRAPH',
            required: true,
            ui: { paragraphDisclaimer: { separator: '---' } }
          }
        ]
      },
      {
        key: 'optional',
        isHeader: false,
        collapsible: true,
        questions: [{ id: 'comment', type: 'TEXT' }]
      },
      {
        key: 'flat',
        isHeader: false,
        collapsible: false,
        questions: [{ id: 'flatRequired', type: 'TEXT', required: true }]
      }
    ];
    const values: any = {
      name: 'Alice',
      notes: 'User text\n\n\n---\nGenerated disclaimer',
      flatRequired: 'ignored'
    };

    expect(
      computeTopLevelGroupProgress({
        groupSections: sections,
        values,
        lineItems: {},
        collapsedRows: {},
        language: 'en' as any,
        topVisibilityCtx: visibilityCtx(values),
        getTopValue: fieldId => values[fieldId]
      })
    ).toEqual([
      { key: 'main', complete: true, totalRequired: 2, requiredComplete: 2 },
      { key: 'optional', complete: false, totalRequired: 0, requiredComplete: 0 }
    ]);
  });

  test('resolves auto-collapse pending and newly completed groups', () => {
    const progress = [
      { key: 'a', complete: true, totalRequired: 1, requiredComplete: 1 },
      { key: 'b', complete: true, totalRequired: 1, requiredComplete: 1 },
      { key: 'c', complete: false, totalRequired: 1, requiredComplete: 0 },
      { key: 'd', complete: false, totalRequired: 0, requiredComplete: 0 }
    ];

    expect(findNextIncompleteGroupKey({ progress, anchorKey: 'b', enabled: true })).toBe('c');
    expect(findNextIncompleteGroupKey({ progress, anchorKey: 'b', enabled: false })).toBeUndefined();
    expect(
      resolvePendingAutoCollapse({
        pendingKeys: ['missing', 'a', 'a', 'b'],
        progress,
        autoOpenNextIncomplete: true
      })
    ).toEqual({ stillComplete: ['a', 'b'], nextOpenKey: 'c' });

    expect(
      resolveCompletedGroupAutoCollapse({
        previousComplete: { a: true },
        progress,
        autoOpenNextIncomplete: true
      })
    ).toEqual({
      nextComplete: { a: true, b: true, c: false, d: false },
      completedNow: ['b'],
      nextOpenKey: 'c'
    });

    expect(
      resolveCollapsedGroupsAfterAutoCollapse({
        collapsedGroups: { a: false, c: true },
        completedKeys: ['a', 'b'],
        nextOpenKey: 'c'
      })
    ).toEqual({ next: { a: true, b: true, c: false }, changed: true });
  });
});
