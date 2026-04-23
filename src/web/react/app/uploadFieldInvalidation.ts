import type { WebFormDefinition } from '../../types';
import type { FieldChangeDialogScope, FieldChangeDialogTargetUpdate } from './fieldChangeDialog';
import { resolveTargetFieldConfig } from './fieldChangeDialog';
import { parseSubgroupKey } from './lineItems';
import { isEmptyValue } from '../utils/values';

const normalizeId = (raw: unknown): string => {
  if (raw === undefined || raw === null) return '';
  return String(raw).trim();
};

export const getUploadFieldInvalidationVersion = (versions: Map<string, number>, fieldPath: string): number => {
  const normalizedFieldPath = normalizeId(fieldPath);
  if (!normalizedFieldPath) return 0;
  return versions.get(normalizedFieldPath) || 0;
};

export const bumpUploadFieldInvalidationVersion = (versions: Map<string, number>, fieldPath: string): number => {
  const normalizedFieldPath = normalizeId(fieldPath);
  if (!normalizedFieldPath) return 0;
  const nextVersion = getUploadFieldInvalidationVersion(versions, normalizedFieldPath) + 1;
  versions.set(normalizedFieldPath, nextVersion);
  return nextVersion;
};

export const wasUploadFieldInvalidated = (args: {
  versions: Map<string, number>;
  fieldPath: string;
  expectedVersion: number;
}): boolean => getUploadFieldInvalidationVersion(args.versions, args.fieldPath) !== args.expectedVersion;

export const resolveUploadFieldPathFromDialogUpdate = (args: {
  definition: WebFormDefinition;
  update: FieldChangeDialogTargetUpdate;
  context: { scope: FieldChangeDialogScope; groupId?: string; rowId?: string };
  selectionEffects?: Array<{ id?: string; groupId: string }>;
}): string | null => {
  const target = args.update.target;
  const fieldId = normalizeId(target?.fieldId);
  if (!fieldId) return null;
  const resolved = resolveTargetFieldConfig({
    definition: args.definition,
    target,
    context: args.context,
    selectionEffects: args.selectionEffects
  });
  const targetType = normalizeId(resolved.question?.type || resolved.field?.type).toUpperCase();
  if (targetType !== 'FILE_UPLOAD') return null;
  if (target.scope === 'top') return fieldId;
  if (target.scope === 'row') {
    const groupId = normalizeId(args.context.groupId);
    const rowId = normalizeId(args.context.rowId);
    if (!groupId || !rowId) return null;
    return `${groupId}__${fieldId}__${rowId}`;
  }
  if (target.scope === 'parent') {
    const groupId = normalizeId(args.context.groupId);
    const parsedGroup = parseSubgroupKey(groupId);
    if (parsedGroup?.parentGroupId && parsedGroup.parentRowId) {
      return `${parsedGroup.parentGroupId}__${fieldId}__${parsedGroup.parentRowId}`;
    }
    return fieldId;
  }
  return null;
};

export const resolveInvalidatedUploadFieldPathsFromDialogUpdates = (args: {
  definition: WebFormDefinition;
  updates: FieldChangeDialogTargetUpdate[];
  context: { scope: FieldChangeDialogScope; groupId?: string; rowId?: string };
  selectionEffects?: Array<{ id?: string; groupId: string }>;
}): string[] => {
  const fieldPaths = new Set<string>();
  (args.updates || []).forEach(update => {
    if (!isEmptyValue(update.value)) return;
    const fieldPath = resolveUploadFieldPathFromDialogUpdate({
      definition: args.definition,
      update,
      context: args.context,
      selectionEffects: args.selectionEffects
    });
    if (!fieldPath) return;
    fieldPaths.add(fieldPath);
  });
  return Array.from(fieldPaths);
};
