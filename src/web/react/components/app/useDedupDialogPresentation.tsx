import { MutableRefObject, useCallback, useMemo } from 'react';

import type { FieldValue, LangCode, WebFormDefinition } from '../../../types';
import type { OptionState } from '../../types';
import {
  buildDedupDialogDetails,
  resolveDedupDialogCopy,
  type DedupDialogItem
} from '../../app/dedupDialog';

export type DedupConflictLike = {
  ruleId?: string;
  message?: string;
  existingRecordId?: string;
  existingRowNumber?: number;
};

export type ListDedupPromptLike = {
  conflict: DedupConflictLike;
  values: Record<string, FieldValue>;
};

export const useDedupDialogPresentation = (args: {
  definition: WebFormDefinition;
  dedupConflict: DedupConflictLike | null;
  dedupNotice: DedupConflictLike | null;
  dedupIdentityFieldIdMap: Record<string, unknown>;
  optionState: OptionState;
  language: LangCode;
  values: Record<string, FieldValue>;
  listDedupPrompt: ListDedupPromptLike | null;
  ingredientsFormActive: boolean;
  createFlowRef: MutableRefObject<boolean>;
}) => {
  const {
    definition,
    dedupConflict,
    dedupNotice,
    dedupIdentityFieldIdMap,
    optionState,
    language,
    values,
    listDedupPrompt,
    ingredientsFormActive,
    createFlowRef
  } = args;

  const dedupDialogConflict = useMemo(() => {
    const conflict = dedupConflict || dedupNotice;
    if (!conflict || !conflict.existingRecordId) return null;
    return conflict;
  }, [dedupConflict, dedupNotice]);

  const buildDetails = useCallback(
    (detailsArgs: { ruleId?: string; values: Record<string, FieldValue> }) =>
      buildDedupDialogDetails({
        definition,
        dedupIdentityFieldIdMap,
        optionState,
        language,
        ruleId: detailsArgs.ruleId,
        values: detailsArgs.values
      }),
    [dedupIdentityFieldIdMap, definition, language, optionState]
  );

  const dedupDialogDetails = useMemo(() => {
    if (!dedupDialogConflict) return null;
    return buildDetails({ ruleId: dedupDialogConflict.ruleId, values });
  }, [buildDetails, dedupDialogConflict, values]);

  const dedupDialogCopy = useMemo(
    () => resolveDedupDialogCopy(definition.dedupDialog, language),
    [definition.dedupDialog, language]
  );

  const renderDedupDialogMessage = useCallback(
    (items: DedupDialogItem[]) => {
      const intro = dedupDialogCopy.intro.trim();
      const outro = dedupDialogCopy.outro.trim();
      const showKeyValues = !(ingredientsFormActive && createFlowRef.current);
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {intro ? <div>{intro}</div> : null}
          {showKeyValues && items.length ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {items.map(item => (
                <div key={item.fieldId}>
                  {item.label}: {item.value}
                </div>
              ))}
            </div>
          ) : null}
          {outro ? <div>{outro}</div> : null}
        </div>
      );
    },
    [createFlowRef, dedupDialogCopy.intro, dedupDialogCopy.outro, ingredientsFormActive]
  );

  const dedupDialogMessage = useMemo(() => {
    if (!dedupDialogConflict) return '';
    const items = dedupDialogDetails?.items || [];
    return renderDedupDialogMessage(items);
  }, [dedupDialogConflict, dedupDialogDetails, renderDedupDialogMessage]);

  const listDedupDialogDetails = useMemo(() => {
    if (!listDedupPrompt) return null;
    return buildDetails({ ruleId: listDedupPrompt.conflict.ruleId, values: listDedupPrompt.values });
  }, [buildDetails, listDedupPrompt]);

  const listDedupDialogMessage = useMemo(() => {
    if (!listDedupPrompt) return '';
    const items = listDedupDialogDetails?.items || [];
    return renderDedupDialogMessage(items);
  }, [listDedupDialogDetails, listDedupPrompt, renderDedupDialogMessage]);

  const ingredientCreateDedupDialogMode = ingredientsFormActive && createFlowRef.current;
  const dedupDialogConfirmLabel = ingredientCreateDedupDialogMode ? dedupDialogCopy.cancelLabel : dedupDialogCopy.openLabel;
  const dedupDialogCancelLabel = dedupDialogCopy.changeLabel;

  return {
    dedupDialogConflict,
    dedupDialogDetails,
    dedupDialogCopy,
    dedupDialogMessage,
    listDedupDialogDetails,
    listDedupDialogMessage,
    ingredientCreateDedupDialogMode,
    dedupDialogConfirmLabel,
    dedupDialogCancelLabel
  };
};
