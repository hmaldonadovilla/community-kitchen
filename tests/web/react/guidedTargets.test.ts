import {
  buildGuidedQuestionByIdMapAction,
  filterGuidedTargetsForContextHeaderAction,
  resolveGuidedTargetQuestionAction
} from '../../../src/web/react/features/steps/domain/guidedTargets';

describe('guided targets domain', () => {
  test('builds question lookup and resolves normal targets', () => {
    const questions = [
      { id: 'A', type: 'TEXT', label: { en: 'A' } },
      { id: 'B', type: 'NUMBER', label: { en: 'B' } }
    ] as any[];
    const questionById = buildGuidedQuestionByIdMapAction(questions);

    expect(resolveGuidedTargetQuestionAction({ target: { id: 'B' }, questionById })).toBe(questions[1]);
    expect(resolveGuidedTargetQuestionAction({ target: { id: 'Missing' }, questionById })).toBeNull();
  });

  test('marks render-as-label targets as read-only without mutating the source question', () => {
    const sourceQuestion = { id: 'STATUS', type: 'TEXT', ui: { width: 'short' } } as any;
    const questionById = buildGuidedQuestionByIdMapAction([sourceQuestion]);
    const resolved = resolveGuidedTargetQuestionAction({
      target: { id: 'STATUS', renderAsLabel: true },
      questionById
    }) as any;

    expect(resolved).toMatchObject({
      id: 'STATUS',
      readOnly: true,
      ui: { width: 'short', renderAsLabel: true }
    });
    expect(sourceQuestion.readOnly).toBeUndefined();
    expect(sourceQuestion.ui.renderAsLabel).toBeUndefined();
  });

  test('filters question targets already rendered in guided context header', () => {
    expect(
      filterGuidedTargetsForContextHeaderAction({
        contextHeaderIds: new Set(['DATE']),
        targets: [
          { kind: 'question', id: 'DATE' },
          { kind: 'question', id: 'STATUS' },
          { kind: 'lineGroup', id: 'ROWS' }
        ]
      })
    ).toEqual([
      { kind: 'question', id: 'STATUS' },
      { kind: 'lineGroup', id: 'ROWS' }
    ]);
  });
});
