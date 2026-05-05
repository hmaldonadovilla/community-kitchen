import type { WebQuestionDefinition } from '../../../../types';

export const buildGuidedQuestionByIdMapAction = (
  questions?: WebQuestionDefinition[] | null
): Map<string, WebQuestionDefinition> => {
  const questionById = new Map<string, WebQuestionDefinition>();
  (questions || []).forEach(question => {
    if (!question?.id) return;
    questionById.set(question.id, question);
  });
  return questionById;
};

export const resolveGuidedTargetQuestionAction = (args: {
  target: any;
  questionById: Map<string, WebQuestionDefinition>;
}): WebQuestionDefinition | null => {
  const target = args.target;
  if (!target || typeof target !== 'object') return null;
  const id = (target.id || '').toString().trim();
  if (!id) return null;
  const question = args.questionById.get(id) || null;
  if (!question) return null;
  const renderAsLabel = target?.renderAsLabel === true;
  if (!renderAsLabel) return question;
  return {
    ...(question as any),
    readOnly: true,
    ui: {
      ...((question as any).ui || {}),
      renderAsLabel: true
    }
  } as WebQuestionDefinition;
};

export const filterGuidedTargetsForContextHeaderAction = (args: {
  targets: any[];
  contextHeaderIds: Set<string> | string[];
}): any[] => {
  const ids = args.contextHeaderIds instanceof Set ? args.contextHeaderIds : new Set(args.contextHeaderIds || []);
  if (!ids.size) return args.targets;
  return (args.targets || []).filter(target => {
    if (!target || typeof target !== 'object') return true;
    const kind = (target.kind || '').toString().trim();
    const id = (target.id || '').toString().trim();
    return !(kind === 'question' && ids.has(id));
  });
};
