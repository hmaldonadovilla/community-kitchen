import { shouldHideField, toOptionSet } from '../../../core';
import type { FieldValue, LangCode, VisibilityContext } from '../../../types';
import type { LineItemState } from '../../types';
import { resolveParagraphUserText } from '../../app/paragraphDisclaimer';
import { isEmptyValue } from '../../utils/values';
import { isLineItemGroupQuestionComplete } from './completeness';
import type { FormGroupSection } from './grouping';
import { isUploadValueComplete } from './utils';
import { resolveValueMapValue } from './valueMaps';

export type TopLevelGroupProgress = {
  key: string;
  complete: boolean;
  totalRequired: number;
  requiredComplete: number;
};

const isTopLevelGroupQuestionComplete = (args: {
  question: any;
  values: Record<string, FieldValue>;
  lineItems: LineItemState;
  collapsedRows: Record<string, boolean>;
  language: LangCode;
  getTopValue: (fieldId: string) => FieldValue | undefined;
}): boolean => {
  const { question, values, lineItems, collapsedRows, language, getTopValue } = args;
  if (question.type === 'LINE_ITEM_GROUP') {
    if (!question.lineItemConfig) return false;
    return isLineItemGroupQuestionComplete({
      groupId: question.id,
      lineItemConfig: question.lineItemConfig,
      values,
      lineItems,
      collapsedRows,
      language,
      getTopValue
    });
  }

  const mappedValue = question.valueMap
    ? resolveValueMapValue(question.valueMap, (fieldId: string) => values[fieldId], {
        language,
        targetOptions: toOptionSet(question)
      })
    : undefined;
  const raw = question.valueMap ? mappedValue : (values[question.id] as FieldValue);

  if (question.type === 'FILE_UPLOAD') {
    return isUploadValueComplete({ value: raw as any, uploadConfig: question.uploadConfig, required: !!question.required });
  }
  if (question.type === 'PARAGRAPH') {
    const cfg = (question.ui as any)?.paragraphDisclaimer;
    if (cfg && !cfg.editable) {
      const userText = resolveParagraphUserText({ rawValue: raw as FieldValue, config: cfg });
      return !isEmptyValue(userText as FieldValue);
    }
  }
  return !isEmptyValue(raw as FieldValue);
};

export const computeTopLevelGroupProgress = (args: {
  groupSections: FormGroupSection[];
  values: Record<string, FieldValue>;
  lineItems: LineItemState;
  collapsedRows: Record<string, boolean>;
  language: LangCode;
  topVisibilityCtx: VisibilityContext;
  getTopValue: (fieldId: string) => FieldValue | undefined;
}): TopLevelGroupProgress[] => {
  const groups = (args.groupSections || []).filter(section => section && !section.isHeader && section.collapsible);
  return groups
    .map(section => {
      const visible = (section.questions || []).filter(question => !shouldHideField(question.visibility, args.topVisibilityCtx));
      if (!visible.length) return null;

      const requiredQuestions = visible.filter(question => !!question.required);
      const totalRequired = requiredQuestions.length;
      const requiredComplete = requiredQuestions.reduce(
        (acc, question) =>
          isTopLevelGroupQuestionComplete({
            question,
            values: args.values,
            lineItems: args.lineItems,
            collapsedRows: args.collapsedRows,
            language: args.language,
            getTopValue: args.getTopValue
          })
            ? acc + 1
            : acc,
        0
      );
      const complete = totalRequired > 0 && requiredComplete >= totalRequired;
      return { key: section.key, complete, totalRequired, requiredComplete };
    })
    .filter(Boolean) as TopLevelGroupProgress[];
};

export const findNextIncompleteGroupKey = (args: {
  progress: TopLevelGroupProgress[];
  anchorKey?: string;
  enabled: boolean;
}): string | undefined => {
  if (!args.enabled) return undefined;
  const baseIndex = args.anchorKey ? args.progress.findIndex(group => group.key === args.anchorKey) : -1;
  if (baseIndex < 0) return undefined;

  const groupCount = args.progress.length;
  for (let step = 1; step <= groupCount; step += 1) {
    const index = (baseIndex + step) % groupCount;
    const candidate = args.progress[index];
    if (!candidate) continue;
    if (candidate.totalRequired <= 0) continue;
    if (!candidate.complete) return candidate.key;
  }
  return undefined;
};

export const resolvePendingAutoCollapse = (args: {
  pendingKeys: string[];
  progress: TopLevelGroupProgress[];
  autoOpenNextIncomplete: boolean;
}): { stillComplete: string[]; nextOpenKey?: string } => {
  const pending = Array.from(new Set(args.pendingKeys || [])).filter(Boolean);
  if (!pending.length) return { stillComplete: [] };

  const completeSet = new Set(args.progress.filter(group => group.complete).map(group => group.key));
  const stillComplete = pending.filter(key => completeSet.has(key));
  if (!stillComplete.length) return { stillComplete: [] };

  const order = args.progress.map(group => group.key);
  const anchorIndex = stillComplete.reduce((acc, key) => Math.max(acc, order.indexOf(key)), -1);
  const anchorKey = anchorIndex >= 0 ? order[anchorIndex] : stillComplete[stillComplete.length - 1];
  return {
    stillComplete,
    nextOpenKey: findNextIncompleteGroupKey({
      progress: args.progress,
      anchorKey,
      enabled: args.autoOpenNextIncomplete
    })
  };
};

export const resolveCompletedGroupAutoCollapse = (args: {
  previousComplete: Record<string, boolean>;
  progress: TopLevelGroupProgress[];
  autoOpenNextIncomplete: boolean;
}): { nextComplete: Record<string, boolean>; completedNow: string[]; nextOpenKey?: string } => {
  const nextComplete: Record<string, boolean> = {};
  args.progress.forEach(group => {
    nextComplete[group.key] = group.complete;
  });

  const completedNow = args.progress
    .filter(group => group.complete && !args.previousComplete[group.key])
    .map(group => group.key);
  const anchorKey = completedNow[completedNow.length - 1];
  return {
    nextComplete,
    completedNow,
    nextOpenKey: findNextIncompleteGroupKey({
      progress: args.progress,
      anchorKey,
      enabled: args.autoOpenNextIncomplete
    })
  };
};

export const resolveCollapsedGroupsAfterAutoCollapse = (args: {
  collapsedGroups: Record<string, boolean>;
  completedKeys: string[];
  nextOpenKey?: string;
}): { next: Record<string, boolean>; changed: boolean } => {
  let changed = false;
  const next = { ...(args.collapsedGroups || {}) };
  (args.completedKeys || []).forEach(key => {
    if (next[key] !== true) {
      next[key] = true;
      changed = true;
    }
  });
  if (args.nextOpenKey && next[args.nextOpenKey] !== false) {
    next[args.nextOpenKey] = false;
    changed = true;
  }
  return { next, changed };
};
