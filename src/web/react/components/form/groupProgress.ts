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
