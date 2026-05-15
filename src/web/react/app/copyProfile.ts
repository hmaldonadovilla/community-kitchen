import { matchesWhenClause } from '../../core';
import type { CopyCurrentRecordLineItemProfile, CopyCurrentRecordProfile, WebFormDefinition } from '../../../types';
import type { FieldValue, VisibilityContext } from '../../types';
import type { LineItemState } from '../types';
import { buildInitialLineItems, buildSubgroupKey } from './lineItems';

const SYSTEM_ROW_VALUE_PREFIX = '__ck';

const normalizeIdList = (raw: any): string[] => {
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return list
    .map(v => (v === undefined || v === null ? '' : v.toString()).trim())
    .filter(Boolean);
};

const normalizeLineItemProfiles = (raw: any): CopyCurrentRecordLineItemProfile[] => {
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return list
    .map(v => (v && typeof v === 'object' ? (v as any) : null))
    .filter(Boolean)
    .map(v => {
      const groupId = (v.groupId || v.id || '').toString().trim();
      const fields = normalizeIdList(v.fields || v.keepFields);
      const includeWhen = v.includeWhen || v.rows || undefined;
      const subGroups = normalizeLineItemProfiles(v.subGroups || v.lineItems);
      const fieldValues =
        v.fieldValues && typeof v.fieldValues === 'object' && !Array.isArray(v.fieldValues)
          ? { ...(v.fieldValues as Record<string, FieldValue>) }
          : undefined;
      return { groupId, fields, fieldValues, includeWhen, subGroups } as CopyCurrentRecordLineItemProfile;
    })
    .filter(v => v.groupId && v.fields.length);
};

const resolveCopyProfileValue = (
  raw: FieldValue,
  rowValues: Record<string, FieldValue>,
  topValues: Record<string, FieldValue>
): FieldValue => {
  if (typeof raw !== 'string') return raw;
  const trimmed = raw.trim();
  if (trimmed.startsWith('$row.')) {
    return rowValues[trimmed.slice('$row.'.length)];
  }
  if (trimmed.startsWith('$top.')) {
    return topValues[trimmed.slice('$top.'.length)];
  }
  return raw;
};

const cloneRowWithFields = (
  row: any,
  fields: string[],
  fieldValues: Record<string, FieldValue> | undefined,
  topValues: Record<string, FieldValue>
): any => {
  const rowValues = ((row as any)?.values || {}) as Record<string, FieldValue>;
  const nextRowValues: Record<string, FieldValue> = {};
  fields.forEach(fid => {
    if (Object.prototype.hasOwnProperty.call(rowValues, fid)) nextRowValues[fid] = rowValues[fid];
  });
  Object.entries(fieldValues || {}).forEach(([fieldId, raw]) => {
    if (!fieldId) return;
    const resolved = resolveCopyProfileValue(raw as FieldValue, rowValues, topValues);
    if (resolved !== undefined) nextRowValues[fieldId] = resolved;
  });
  // Preserve internal/system row attributes (e.g. __ckRowSource) so addMode="auto" sync
  // can correctly recognize auto-generated rows and avoid duplicate auto-add behavior.
  Object.keys(rowValues || {}).forEach(key => {
    if (!key || !key.startsWith(SYSTEM_ROW_VALUE_PREFIX)) return;
    if (Object.prototype.hasOwnProperty.call(nextRowValues, key)) return;
    nextRowValues[key] = rowValues[key];
  });
  return { ...row, values: nextRowValues };
};

const filterProfileRows = (args: {
  rows: any[];
  includeWhen: any;
  topValues: Record<string, FieldValue>;
  lineState: LineItemState;
}): any[] => {
  const { rows, includeWhen, topValues, lineState } = args;
  if (!includeWhen) return rows || [];
  return (rows || []).filter(row => {
    const rowValues = ((row as any)?.values || {}) as Record<string, FieldValue>;
    const rowCtx: VisibilityContext = {
      getValue: (fieldId: string) => {
        const fid = (fieldId || '').toString();
        if (!fid) return undefined;
        if (Object.prototype.hasOwnProperty.call(rowValues, fid)) return rowValues[fid];
        return (topValues as any)[fid];
      },
      getLineItems: (groupId: string) => (lineState as any)[groupId] || [],
      getLineItemKeys: () => Object.keys(lineState || {})
    };
    return matchesWhenClause(includeWhen as any, rowCtx as any);
  });
};

const copyLineItemGroup = (args: {
  profile: CopyCurrentRecordLineItemProfile;
  sourceGroupKey: string;
  lineState: LineItemState;
  topValues: Record<string, FieldValue>;
  nextLineItems: LineItemState;
}): LineItemState => {
  const { profile, sourceGroupKey, lineState, topValues } = args;
  let nextLineItems = args.nextLineItems;
  const rows = lineState[sourceGroupKey] || [];
  const filtered = filterProfileRows({
    rows,
    includeWhen: profile.includeWhen,
    topValues,
    lineState
  }).map(row => cloneRowWithFields(row, normalizeIdList(profile.fields), (profile as any).fieldValues, topValues));
  if (!filtered.length) return nextLineItems;
  nextLineItems = { ...nextLineItems, [sourceGroupKey]: filtered };

  const subProfiles = normalizeLineItemProfiles(profile.subGroups);
  if (!subProfiles.length) return nextLineItems;

  filtered.forEach(row => {
    const rowId = ((row as any)?.id || '').toString().trim();
    if (!rowId) return;
    subProfiles.forEach(subProfile => {
      const subgroupKey = buildSubgroupKey(sourceGroupKey, rowId, subProfile.groupId);
      nextLineItems = copyLineItemGroup({
        profile: subProfile,
        sourceGroupKey: subgroupKey,
        lineState,
        topValues,
        nextLineItems
      });
    });
  });

  return nextLineItems;
};

const resolveClearedTopFieldValue = (args: {
  definition: WebFormDefinition;
  fieldId: string;
}): FieldValue | undefined => {
  const question = (args.definition?.questions || []).find(q => q?.id === args.fieldId) as any;
  if (!question) return undefined;
  const type = (question.type || '').toString().trim().toUpperCase();
  if (type === 'LINE_ITEM_GROUP') return undefined;
  if (type === 'CHECKBOX') {
    const hasAnyOption = !!(
      question.options?.en?.length ||
      question.options?.fr?.length ||
      question.options?.nl?.length ||
      question.optionsEn?.length ||
      question.optionsFr?.length ||
      question.optionsNl?.length
    );
    const isConsentCheckbox = !question.dataSource && !hasAnyOption;
    return isConsentCheckbox ? false : [];
  }
  if (type === 'FILE_UPLOAD') return [];
  return '';
};

export const applyCopyCurrentRecordDropFields = (args: {
  definition: WebFormDefinition;
  values: Record<string, FieldValue>;
  lineItems: LineItemState;
  dropFields: string[];
}): {
  values: Record<string, FieldValue>;
  lineItems: LineItemState;
  droppedValues: string[];
  lineItemsCleared: boolean;
} => {
  const dropFields = normalizeIdList(args.dropFields);
  if (!dropFields.length) {
    return {
      values: { ...(args.values || {}) },
      lineItems: args.lineItems,
      droppedValues: [],
      lineItemsCleared: false
    };
  }

  const nextValues: Record<string, FieldValue> = { ...(args.values || {}) };
  let nextLineItems: LineItemState = args.lineItems;
  let lineItemsChanged = false;
  const droppedValues: string[] = [];

  dropFields.forEach(fieldId => {
    if (!fieldId) return;
    const clearedValue = resolveClearedTopFieldValue({
      definition: args.definition,
      fieldId
    });
    if (clearedValue !== undefined) {
      if (Object.prototype.hasOwnProperty.call(nextValues, fieldId)) droppedValues.push(fieldId);
      nextValues[fieldId] = clearedValue;
    }

    // Best-effort: allow dropping entire line item groups (and their subgroups) by id.
    if (nextLineItems && typeof nextLineItems === 'object') {
      Object.keys(nextLineItems).forEach(k => {
        if (k === fieldId || k.startsWith(`${fieldId}::`) || k.startsWith(`${fieldId}__`)) {
          if (!lineItemsChanged) {
            nextLineItems = { ...(nextLineItems as any) };
            lineItemsChanged = true;
          }
          (nextLineItems as any)[k] = [];
        }
      });
    }
  });

  return {
    values: nextValues,
    lineItems: nextLineItems,
    droppedValues,
    lineItemsCleared: lineItemsChanged
  };
};

export const resolveCopyCurrentRecordDestructiveChangeBypassFieldIds = (args: {
  definition: WebFormDefinition;
  dropFields: string[];
}): string[] => {
  const dropFields = normalizeIdList(args.dropFields);
  if (!dropFields.length) return [];
  const questions = Array.isArray(args.definition?.questions) ? args.definition.questions : [];
  const questionTypeById = new Map<string, string>();
  questions.forEach(question => {
    const fieldId = (question?.id || '').toString().trim();
    if (!fieldId || questionTypeById.has(fieldId)) return;
    questionTypeById.set(fieldId, (question?.type || '').toString().trim().toUpperCase());
  });
  const bypassFieldIds: string[] = [];
  const seen = new Set<string>();
  dropFields.forEach(fieldId => {
    const questionType = questionTypeById.get(fieldId);
    if (!questionType || questionType === 'LINE_ITEM_GROUP' || seen.has(fieldId)) return;
    seen.add(fieldId);
    bypassFieldIds.push(fieldId);
  });
  return bypassFieldIds;
};

export const shouldBypassCopyCurrentRecordDestructiveChange = (args: {
  scope: 'top' | 'line';
  fieldId?: string;
  isCreateFlow: boolean;
  bypassFieldIds: string[] | Record<string, true>;
}): boolean => {
  if (args.scope !== 'top') return false;
  const fieldId = (args.fieldId || '').toString().trim();
  if (!fieldId) return false;
  if (Array.isArray(args.bypassFieldIds)) {
    return normalizeIdList(args.bypassFieldIds).includes(fieldId);
  }
  return Boolean(args.bypassFieldIds && (args.bypassFieldIds as Record<string, true>)[fieldId]);
};

export const applyCopyCurrentRecordProfile = (args: {
  definition: WebFormDefinition;
  values: Record<string, FieldValue>;
  lineItems: LineItemState;
}): { values: Record<string, FieldValue>; lineItems: LineItemState } | null => {
  const profile = (args.definition as any)?.copyCurrentRecordProfile as CopyCurrentRecordProfile | undefined;
  if (!profile || typeof profile !== 'object') return null;

  const keepValueIds = normalizeIdList((profile as any).values);
  const lineProfiles = normalizeLineItemProfiles((profile as any).lineItems);

  const nextValues: Record<string, FieldValue> = {};
  keepValueIds.forEach(fid => {
    if (!fid) return;
    if (Object.prototype.hasOwnProperty.call(args.values || {}, fid)) {
      nextValues[fid] = (args.values as any)[fid];
    }
  });

  let nextLineItems: LineItemState = buildInitialLineItems(args.definition);

  const topValues = args.values || {};
  const lineState = args.lineItems || {};

  lineProfiles.forEach(lp => {
    nextLineItems = copyLineItemGroup({
      profile: lp,
      sourceGroupKey: lp.groupId,
      lineState,
      topValues,
      nextLineItems
    });
  });

  return { values: nextValues, lineItems: nextLineItems };
};
