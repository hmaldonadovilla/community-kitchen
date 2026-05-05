import type { WebFormDefinition, WebQuestionDefinition } from '../../../../types';

const normalizeTargetId = (raw: any): string =>
  raw === undefined || raw === null ? '' : raw.toString().trim();

const isQuestionOrderTarget = (target: any): boolean => {
  if (!target || typeof target !== 'object') return false;
  const kind = (target.kind || '').toString().trim();
  return kind === 'question' || kind === 'lineGroup';
};

const getHeaderTargets = (guidedStepsCfg: any): any[] =>
  Array.isArray(guidedStepsCfg?.header?.include) ? guidedStepsCfg.header.include : [];

const getStepTargets = (stepCfg: any): any[] => (Array.isArray(stepCfg?.include) ? stepCfg.include : []);

export const resolveGuidedOrderedQuestionsAction = (args: {
  orderedEntryEnabled: boolean;
  guidedEnabled: boolean;
  guidedStepsCfg: any;
  guidedStepIds: string[];
  guidedVisibleSteps: any[];
  activeGuidedStepId: string;
  definition: WebFormDefinition;
  scopedDefinition?: WebFormDefinition | null;
}): WebQuestionDefinition[] => {
  if (!args.orderedEntryEnabled) return [];
  const allQuestions = args.definition.questions || [];
  if (!args.guidedEnabled || !args.guidedStepsCfg || !args.guidedStepIds.length) return allQuestions;

  const stepCfg =
    (args.guidedVisibleSteps.find(step => (step?.id || '').toString() === args.activeGuidedStepId) ||
      args.guidedVisibleSteps[0]) as any;
  const ordered: WebQuestionDefinition[] = [];
  const seen = new Set<string>();

  const questionById = new Map<string, WebQuestionDefinition>();
  allQuestions.forEach(question => questionById.set(question.id, question));
  const scopedById = new Map<string, WebQuestionDefinition>();
  (args.scopedDefinition?.questions || []).forEach(question => scopedById.set(question.id, question));

  [...getHeaderTargets(args.guidedStepsCfg), ...getStepTargets(stepCfg)].forEach(target => {
    if (!isQuestionOrderTarget(target)) return;
    const id = normalizeTargetId(target.id);
    if (!id || seen.has(id)) return;
    const question = scopedById.get(id) || questionById.get(id);
    if (!question) return;
    seen.add(id);
    ordered.push(question);
  });

  return ordered.length ? ordered : allQuestions;
};

export const resolveGuidedClearOnChangeOrderedFieldIdsAction = (args: {
  guidedEnabled: boolean;
  guidedStepsCfg: any;
  guidedStepIds: string[];
  guidedVisibleSteps: any[];
  definition: WebFormDefinition;
}): string[] => {
  const byConfig = (args.definition.questions || [])
    .map(question => normalizeTargetId(question?.id))
    .filter(Boolean);
  if (!args.guidedEnabled || !args.guidedStepsCfg || !args.guidedStepIds.length) return byConfig;

  const ordered: string[] = [];
  const seen = new Set<string>();
  const add = (idRaw: any): void => {
    const id = normalizeTargetId(idRaw);
    if (!id || seen.has(id)) return;
    seen.add(id);
    ordered.push(id);
  };

  getHeaderTargets(args.guidedStepsCfg).forEach(target => {
    if (!isQuestionOrderTarget(target)) return;
    add(target.id);
  });

  args.guidedVisibleSteps.forEach(step => {
    getStepTargets(step).forEach(target => {
      if (!isQuestionOrderTarget(target)) return;
      add(target.id);
    });
  });

  byConfig.forEach(add);
  return ordered.length ? ordered : byConfig;
};
