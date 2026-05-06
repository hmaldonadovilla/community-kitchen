import type { FieldValue } from '../../../../types';

export type StepDataSourceDrafts = Record<string, Record<string, FieldValue>>;

const draftValuesMatch = (
  previousDraft: Record<string, FieldValue>,
  nextDraft: Record<string, FieldValue>
): boolean => {
  const nextDraftKeys = Object.keys(nextDraft);
  const previousDraftKeys = Object.keys(previousDraft);
  return (
    nextDraftKeys.length === previousDraftKeys.length &&
    nextDraftKeys.every(key => previousDraft[key] === nextDraft[key])
  );
};

export const buildStepDataSourceDraftValuesAction = (args: {
  selectedFieldId: string;
  quantityFieldId: string;
  modeFieldId: string;
  rowValues: Record<string, FieldValue>;
}): Record<string, FieldValue> => {
  const nextDraft: Record<string, FieldValue> = {};
  if (args.selectedFieldId) nextDraft[args.selectedFieldId] = true;
  if (args.quantityFieldId && args.rowValues[args.quantityFieldId] !== undefined) {
    nextDraft[args.quantityFieldId] = args.rowValues[args.quantityFieldId];
  }
  if (
    args.modeFieldId &&
    args.rowValues[args.modeFieldId] !== undefined &&
    args.rowValues[args.modeFieldId] !== null &&
    `${args.rowValues[args.modeFieldId]}` !== ''
  ) {
    nextDraft[args.modeFieldId] = args.rowValues[args.modeFieldId];
  }
  return nextDraft;
};

/**
 * Owner: guided step data-source draft state transition.
 * Returns the previous draft map when the requested transition is a no-op.
 */
export const applyStepDataSourceDraftUpdateAction = (args: {
  previousDrafts: StepDataSourceDrafts;
  draftKey: string;
  shouldSelect: boolean;
  selectedFieldId: string;
  quantityFieldId: string;
  modeFieldId: string;
  rowValues: Record<string, FieldValue>;
}): StepDataSourceDrafts => {
  if (!args.shouldSelect) {
    if (!Object.prototype.hasOwnProperty.call(args.previousDrafts, args.draftKey)) {
      return args.previousDrafts;
    }
    const nextDrafts = { ...args.previousDrafts };
    delete nextDrafts[args.draftKey];
    return nextDrafts;
  }

  const nextDraft = buildStepDataSourceDraftValuesAction({
    selectedFieldId: args.selectedFieldId,
    quantityFieldId: args.quantityFieldId,
    modeFieldId: args.modeFieldId,
    rowValues: args.rowValues
  });
  const previousDraft = args.previousDrafts[args.draftKey] || {};
  if (draftValuesMatch(previousDraft, nextDraft)) return args.previousDrafts;

  return {
    ...args.previousDrafts,
    [args.draftKey]: nextDraft
  };
};
