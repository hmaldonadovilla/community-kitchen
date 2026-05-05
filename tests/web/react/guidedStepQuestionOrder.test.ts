import {
  resolveGuidedClearOnChangeOrderedFieldIdsAction,
  resolveGuidedOrderedQuestionsAction
} from '../../../src/web/react/features/steps/domain/guidedStepQuestionOrder';

describe('guided step question order helpers', () => {
  const definition = {
    questions: [
      { id: 'DATE', type: 'DATE' },
      { id: 'CUSTOMER', type: 'TEXT' },
      { id: 'meals', type: 'LINE_ITEM_GROUP' },
      { id: 'NOTES', type: 'TEXT' }
    ]
  } as any;

  const guidedStepsCfg = {
    header: {
      include: [
        { kind: 'question', id: 'DATE' },
        { kind: 'unsupported', id: 'IGNORED' }
      ]
    }
  };

  const guidedVisibleSteps = [
    {
      id: 'step1',
      include: [
        { kind: 'lineGroup', id: 'meals' },
        { kind: 'question', id: 'DATE' },
        { kind: 'question', id: 'MISSING' }
      ]
    },
    {
      id: 'step2',
      include: [{ kind: 'question', id: 'CUSTOMER' }]
    }
  ];

  test('returns no ordered entry questions when ordered-entry guidance is disabled', () => {
    expect(
      resolveGuidedOrderedQuestionsAction({
        orderedEntryEnabled: false,
        guidedEnabled: true,
        guidedStepsCfg,
        guidedStepIds: ['step1'],
        guidedVisibleSteps,
        activeGuidedStepId: 'step1',
        definition
      })
    ).toEqual([]);
  });

  test('orders active guided step questions and prefers scoped question definitions', () => {
    const scopedMealQuestion = {
      id: 'meals',
      type: 'LINE_ITEM_GROUP',
      lineItemConfig: { fields: [{ id: 'quantity' }] }
    };

    const ordered = resolveGuidedOrderedQuestionsAction({
      orderedEntryEnabled: true,
      guidedEnabled: true,
      guidedStepsCfg,
      guidedStepIds: ['step1', 'step2'],
      guidedVisibleSteps,
      activeGuidedStepId: 'step1',
      definition,
      scopedDefinition: {
        questions: [
          { id: 'DATE', type: 'DATE', ui: { renderAsLabel: true } },
          scopedMealQuestion
        ]
      } as any
    });

    expect(ordered.map((question: any) => question.id)).toEqual(['DATE', 'meals']);
    expect(ordered[0]).toMatchObject({ ui: { renderAsLabel: true } });
    expect(ordered[1]).toBe(scopedMealQuestion);
  });

  test('falls back to config order outside guided mode', () => {
    expect(
      resolveGuidedOrderedQuestionsAction({
        orderedEntryEnabled: true,
        guidedEnabled: false,
        guidedStepsCfg,
        guidedStepIds: [],
        guidedVisibleSteps: [],
        activeGuidedStepId: '',
        definition
      }).map((question: any) => question.id)
    ).toEqual(['DATE', 'CUSTOMER', 'meals', 'NOTES']);
  });

  test('orders clear-on-change ids by header, visible steps, then config fallback', () => {
    expect(
      resolveGuidedClearOnChangeOrderedFieldIdsAction({
        guidedEnabled: true,
        guidedStepsCfg,
        guidedStepIds: ['step1', 'step2'],
        guidedVisibleSteps,
        definition
      })
    ).toEqual(['DATE', 'meals', 'MISSING', 'CUSTOMER', 'NOTES']);
  });
});
