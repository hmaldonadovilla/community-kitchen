import type { FieldValue, LangCode, WebFormDefinition, WebQuestionDefinition } from '../../types';
import type { LineItemState } from '../types';
import { runSelectionEffects } from './selectionEffects';
import { runSelectionEffectsForAncestors } from './runSelectionEffectsForAncestors';

type AncestorSelectionEffectOptions = {
  lineItem?: { groupId: string; rowId: string; rowValues: Record<string, FieldValue> };
  contextId?: string;
  forceContextReset?: boolean;
  snapshots?: { values: Record<string, FieldValue>; lineItems: LineItemState };
};

export const applySourceFirstAncestorSelectionEffects = (args: {
  definition: WebFormDefinition;
  language: LangCode;
  values: Record<string, FieldValue>;
  prevLineItems: LineItemState;
  nextLineItems: LineItemState;
  sourceGroupKey: string;
}): { values: Record<string, FieldValue>; lineItems: LineItemState } => {
  let localValues = args.values;
  let localLineItems = args.nextLineItems;

  const setValues = (
    next: Record<string, FieldValue> | ((prev: Record<string, FieldValue>) => Record<string, FieldValue>)
  ): void => {
    localValues = typeof next === 'function' ? next(localValues) : next;
  };
  const setLineItems = (next: LineItemState | ((prev: LineItemState) => LineItemState)): void => {
    localLineItems = typeof next === 'function' ? next(localLineItems) : next;
  };

  const onSelectionEffect = (
    question: WebQuestionDefinition,
    value: FieldValue,
    opts?: AncestorSelectionEffectOptions
  ): void => {
    const { snapshots, ...selectionOpts } = opts || {};
    runSelectionEffects({
      definition: args.definition,
      question,
      value,
      language: args.language,
      values: snapshots?.values || localValues,
      lineItems: snapshots?.lineItems || localLineItems,
      setValues,
      setLineItems,
      opts: selectionOpts
    });
  };

  runSelectionEffectsForAncestors({
    definition: args.definition,
    values: args.values,
    onSelectionEffect,
    sourceGroupKey: args.sourceGroupKey,
    prevLineItems: args.prevLineItems,
    nextLineItems: args.nextLineItems,
    options: {
      mode: 'change',
      topValues: args.values
    }
  });

  return { values: localValues, lineItems: localLineItems };
};
