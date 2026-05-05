import { useMemo } from 'react';

import { tSystem } from '../../../systemStrings';
import type { LangCode, WebFormDefinition } from '../../../types';
import { computeDedupKeyFieldIdMap } from '../../app/dedupPrecheck';
import {
  buildFieldIdMap,
  filterDedupRulesForPrecheck,
  normalizeFieldIdList,
  resolveDedupCheckDialogCopy
} from '../../app/autoSaveDedup';

/**
 * Owner: App autosave/dedup configuration.
 * Normalizes autosave field lists, dedup precheck rules, and progress-dialog
 * copy without owning dedup execution or record mutation.
 */
export const useAppAutoSaveDedupConfig = (args: {
  definition: WebFormDefinition;
  language: LangCode;
}) => {
  const { definition, language } = args;
  const autoSaveEnableFieldIds = useMemo(
    () => normalizeFieldIdList((definition.autoSave as any)?.enableWhenFields ?? (definition.autoSave as any)?.enableFields),
    [definition.autoSave]
  );
  const dedupTriggerFieldIds = useMemo(
    () => normalizeFieldIdList((definition.autoSave as any)?.dedupTriggerFields ?? (definition.autoSave as any)?.dedupFields),
    [definition.autoSave]
  );
  const dedupPrecheckRules = useMemo(
    () => filterDedupRulesForPrecheck((definition as any)?.dedupRules, dedupTriggerFieldIds),
    [definition, dedupTriggerFieldIds]
  );
  const dedupTriggerFieldIdMap = useMemo(
    () =>
      dedupTriggerFieldIds.length ? buildFieldIdMap(dedupTriggerFieldIds) : computeDedupKeyFieldIdMap((definition as any)?.dedupRules),
    [dedupTriggerFieldIds, definition]
  );
  const dedupIdentityFieldIdMap = useMemo(
    () => computeDedupKeyFieldIdMap((definition as any)?.dedupRules),
    [definition]
  );
  const dedupCheckDialogCopy = useMemo(
    () =>
      resolveDedupCheckDialogCopy((definition.autoSave as any)?.dedupCheckDialog, language, {
        checkingTitle: 'Checking duplicates',
        checkingMessage: 'Please wait while the system checks whether this record already exists.',
        availableTitle: 'Value available',
        availableMessage: 'You can continue entering details.',
        duplicateTitle: 'Duplicate found',
        duplicateMessage: tSystem('dedup.duplicate', language, 'Duplicate record.')
      }),
    [definition.autoSave, language]
  );
  const dedupCheckDialogEnabled = dedupTriggerFieldIds.length > 0 && dedupCheckDialogCopy.enabled;

  return {
    autoSaveEnableFieldIds,
    dedupTriggerFieldIds,
    dedupPrecheckRules,
    dedupTriggerFieldIdMap,
    dedupIdentityFieldIdMap,
    dedupCheckDialogCopy,
    dedupCheckDialogEnabled
  };
};
