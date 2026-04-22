import { toOptionSet } from '../../core';
import { resolveLocalizedString } from '../../i18n';
import {
  StepConfig,
  StepFieldTargetRef,
  StepLineGroupTargetConfig,
  WebFormDefinition,
  WebQuestionDefinition
} from '../../../types';
import type { FieldValue, LangCode, LineItemRowState } from '../../types';
import type { LineItemState } from '../types';
import { resolveFieldLabel, resolveLabel } from '../utils/labels';
import { EMPTY_DISPLAY, formatDisplayText } from '../utils/valueDisplay';
import { buildDraftStateFingerprint } from './draftSaveFingerprint';
import { parseSubgroupKey, resolveSubgroupKey } from './lineItems';

const REVIEW_META_VALUE_KEYS = new Set(['status', 'pdfurl']);
const ROW_CONTEXT_FIELD_PRIORITY = [
  'MEAL_TYPE',
  'DIETARY_APPLICABILITY',
  'LEFTOVER_DIETARY_APPLICABILITY',
  'LEFTOVER_MEAL_TYPE',
  'LEFTOVER_INGREDIENT',
  'ING',
  'RECIPE',
  'LEFTOVER_RECIPE',
  'LEFTOVER_ID'
];

const humanizeId = (raw: string): string => {
  const trimmed = (raw || '').toString().trim();
  if (!trimmed) return '';
  const normalized = trimmed
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_\-.]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalized) return trimmed;
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
};

const buildIgnoredTopLevelComparableKeys = (definition?: WebFormDefinition | null): Set<string> => {
  const ignored = new Set<string>();
  const questions = Array.isArray(definition?.questions) ? definition!.questions : [];
  questions.forEach(question => {
    if (question?.type !== 'LINE_ITEM_GROUP') return;
    const groupId = (question.id || '').toString().trim();
    if (!groupId) return;
    ignored.add(groupId);
    ignored.add(`${groupId}_json`);
  });
  return ignored;
};

const isIgnoredComparableKey = (rawKey: string, ignoredKeys?: Set<string>): boolean => {
  const key = (rawKey || '').toString().trim();
  if (!key) return true;
  if (key.startsWith('__ck')) return true;
  if (key.endsWith('_json')) return true;
  if (ignoredKeys?.has(key)) return true;
  return REVIEW_META_VALUE_KEYS.has(key.toLowerCase());
};

const sanitizeComparableValue = (value: any): any => {
  if (Array.isArray(value)) {
    return value.map(entry => sanitizeComparableValue(entry));
  }
  if (!value || typeof value !== 'object') return value;
  const out: Record<string, any> = {};
  Object.keys(value).forEach(key => {
    if (isIgnoredComparableKey(key)) return;
    out[key] = sanitizeComparableValue((value as any)[key]);
  });
  return out;
};

export const stripRecordSyncComparableValues = (
  values?: Record<string, FieldValue> | null,
  definition?: WebFormDefinition | null
): Record<string, FieldValue> => {
  const source = values || {};
  const next: Record<string, FieldValue> = {};
  const ignoredKeys = buildIgnoredTopLevelComparableKeys(definition);
  Object.keys(source).forEach(key => {
    if (isIgnoredComparableKey(key, ignoredKeys)) return;
    next[key] = sanitizeComparableValue((source as any)[key]) as FieldValue;
  });
  return next;
};

export const stripRecordSyncComparableLineItems = (lineItems?: LineItemState | null): LineItemState => {
  const source = lineItems || {};
  const next: LineItemState = {};
  Object.keys(source).forEach(groupKey => {
    const rows = Array.isArray((source as any)[groupKey]) ? (source as any)[groupKey] : [];
    (next as any)[groupKey] = rows.map((row: any) => ({
      ...(row || {}),
      values: sanitizeComparableValue((row && row.values) || {})
    }));
  });
  return next;
};

export const buildRecordSyncComparableFingerprint = (args: {
  definition?: WebFormDefinition | null;
  formKey?: string | null;
  language?: string | null;
  values?: Record<string, FieldValue> | null;
  lineItems?: LineItemState | null;
}): string =>
  buildDraftStateFingerprint({
    formKey: args.formKey || '',
    language: args.language || '',
    values: stripRecordSyncComparableValues(args.values, args.definition),
    lineItems: stripRecordSyncComparableLineItems(args.lineItems)
  });

const comparableValueFingerprint = (value: unknown): string => JSON.stringify(sanitizeComparableValue(value));

const normalizeStepFieldId = (field: StepFieldTargetRef | undefined | null): string =>
  typeof field === 'string' ? field.trim() : ((field as any)?.id || '').toString().trim();

const findLineGroupQuestion = (definition: WebFormDefinition, groupId: string): WebQuestionDefinition | undefined =>
  (definition.questions || []).find(q => q?.type === 'LINE_ITEM_GROUP' && q.id === groupId);

const findSubGroupConfig = (question: WebQuestionDefinition | undefined, subgroupPath: string[]): any => {
  if (!question || question.type !== 'LINE_ITEM_GROUP') return null;
  let currentGroups: any[] = Array.isArray(question.lineItemConfig?.subGroups) ? question.lineItemConfig!.subGroups! : [];
  let current: any = null;
  for (const segment of subgroupPath) {
    current = currentGroups.find(entry => resolveSubgroupKey(entry) === segment) || null;
    if (!current) return null;
    currentGroups = Array.isArray(current.subGroups) ? current.subGroups : [];
  }
  return current;
};

const findFieldDefinition = (args: {
  definition: WebFormDefinition;
  groupId?: string | null;
  subgroupPath?: string[];
  fieldId?: string | null;
}): any => {
  const fieldId = (args.fieldId || '').toString().trim();
  if (!fieldId) return null;
  if (!args.groupId) {
    return (args.definition.questions || []).find(q => q?.id === fieldId && q?.type !== 'LINE_ITEM_GROUP') || null;
  }
  const question = findLineGroupQuestion(args.definition, args.groupId);
  if (!question) return null;
  if (Array.isArray(args.subgroupPath) && args.subgroupPath.length) {
    const subgroupCfg = findSubGroupConfig(question, args.subgroupPath);
    return (subgroupCfg?.fields || []).find((field: any) => field?.id === fieldId) || null;
  }
  return (question.lineItemConfig?.fields || []).find((field: any) => field?.id === fieldId) || null;
};

const formatRawReviewValue = (args: {
  value: any;
  fieldDef?: any;
  fieldId?: string | null;
  language: LangCode;
}): string => {
  const formatted = formatDisplayText(args.value, {
    language: args.language,
    optionSet: args.fieldDef ? toOptionSet(args.fieldDef) : undefined,
    fieldType: args.fieldDef?.type
  });
  if (formatted === EMPTY_DISPLAY) return formatted;
  const label = args.fieldDef ? resolveFieldLabel(args.fieldDef, args.language, (args.fieldId || '').toString().trim()) : '';
  const labelLower = label.toLowerCase();
  const numericRaw =
    typeof args.value === 'number' ||
    (typeof args.value === 'string' && /^-?\d+(\.\d+)?$/.test(args.value.trim()));
  if (numericRaw && labelLower.includes('portion')) {
    const amount = Number(args.value);
    const suffix = Number.isFinite(amount) && Math.abs(amount) === 1 ? 'portion' : 'portions';
    return `${formatted} ${suffix}`;
  }
  return formatted;
};

const resolveRowContext = (args: {
  definition: WebFormDefinition;
  groupKey: string;
  subgroupPath: string[];
  previousRow?: LineItemRowState | null;
  nextRow?: LineItemRowState | null;
  previousLineItems: LineItemState;
  nextLineItems: LineItemState;
  language: LangCode;
}): string => {
  const candidates: Array<{ values: Record<string, FieldValue>; groupId: string; subgroupPath: string[] }> = [];
  const subgroupInfo = parseSubgroupKey(args.groupKey);
  if (subgroupInfo) {
    const parentRows = [
      ...((((args.nextLineItems || {}) as any)[subgroupInfo.rootGroupId] || []) as LineItemRowState[]),
      ...((((args.previousLineItems || {}) as any)[subgroupInfo.rootGroupId] || []) as LineItemRowState[])
    ];
    const parentRow = parentRows.find(row => row?.id === subgroupInfo.parentRowId);
    if (parentRow?.values) {
      candidates.push({
        values: (parentRow.values || {}) as Record<string, FieldValue>,
        groupId: subgroupInfo.rootGroupId,
        subgroupPath: []
      });
    }
  }
  if (args.nextRow?.values) {
    candidates.push({
      values: (args.nextRow.values || {}) as Record<string, FieldValue>,
      groupId: subgroupInfo?.rootGroupId || args.groupKey,
      subgroupPath: args.subgroupPath
    });
  }
  if (args.previousRow?.values) {
    candidates.push({
      values: (args.previousRow.values || {}) as Record<string, FieldValue>,
      groupId: subgroupInfo?.rootGroupId || args.groupKey,
      subgroupPath: args.subgroupPath
    });
  }

  for (const candidate of candidates) {
    for (const fieldId of ROW_CONTEXT_FIELD_PRIORITY) {
      const raw = (candidate.values || {})[fieldId];
      if (raw === undefined || raw === null || raw === '') continue;
      const fieldDef = findFieldDefinition({
        definition: args.definition,
        groupId: candidate.groupId,
        subgroupPath: candidate.subgroupPath,
        fieldId
      });
      const formatted = formatRawReviewValue({
        value: raw,
        fieldDef,
        fieldId,
        language: args.language
      });
      if (formatted && formatted !== EMPTY_DISPLAY) return formatted;
    }
  }
  return '';
};

const isQuantityLikeField = (fieldId: string, label: string): boolean => {
  const normalizedId = (fieldId || '').toString().trim().toLowerCase();
  const normalizedLabel = (label || '').toString().trim().toLowerCase();
  return (
    normalizedId.includes('qty') ||
    normalizedId.includes('portion') ||
    normalizedId.includes('amount') ||
    normalizedLabel.includes('quantity') ||
    normalizedLabel.includes('portion') ||
    normalizedLabel.includes('yield')
  );
};

const resolveReviewTargetMeta = (args: {
  definition: WebFormDefinition;
  language: LangCode;
  groupKey?: string | null;
  fieldId?: string | null;
}): {
  stepId: string | null;
  stepLabel: string;
  stepOrder: number;
  targetLabel: string;
  fieldLabel: string;
  fieldDef: any;
  groupId: string | null;
  subgroupPath: string[];
} => {
  const groupKey = (args.groupKey || '').toString().trim();
  const fieldId = (args.fieldId || '').toString().trim();
  const subgroupInfo = groupKey ? parseSubgroupKey(groupKey) : null;
  const groupId = subgroupInfo?.rootGroupId || groupKey || null;
  const subgroupPath = subgroupInfo?.path || [];
  const groupQuestion = groupId ? findLineGroupQuestion(args.definition, groupId) : null;
  const subgroupCfg =
    groupQuestion && subgroupPath.length ? findSubGroupConfig(groupQuestion, subgroupPath) : null;
  const fieldDef = findFieldDefinition({
    definition: args.definition,
    groupId,
    subgroupPath,
    fieldId
  });
  const targetFallback = subgroupCfg
    ? resolveLocalizedString(subgroupCfg.label, args.language, '') || humanizeId(subgroupPath[subgroupPath.length - 1] || '')
    : groupQuestion
      ? resolveLabel(groupQuestion, args.language)
      : fieldId
        ? humanizeId(fieldId)
        : groupId
          ? humanizeId(groupId)
          : '';
  const fieldLabelFromDef = fieldDef
    ? resolveFieldLabel(fieldDef, args.language, fieldId || targetFallback)
    : fieldId
      ? humanizeId(fieldId)
      : targetFallback;

  const steps = Array.isArray((args.definition.steps as any)?.items)
    ? (((args.definition.steps as any).items || []) as StepConfig[])
    : [];

  for (let stepIndex = 0; stepIndex < steps.length; stepIndex += 1) {
    const step = steps[stepIndex];
    const stepLabel = resolveLocalizedString(step?.label, args.language, humanizeId(step?.id || '')) || humanizeId(step?.id || '');
    const include = Array.isArray(step?.include) ? step.include : [];
    for (const target of include as any[]) {
      if (!target || typeof target !== 'object') continue;
      if (target.kind === 'question' && !groupId) {
        if ((target.id || '').toString().trim() !== fieldId) continue;
        return {
          stepId: (step.id || '').toString().trim() || null,
          stepLabel,
          stepOrder: stepIndex,
          targetLabel: resolveLabel(
            ((args.definition.questions || []).find(question => question?.id === fieldId) as WebQuestionDefinition) || ({ id: fieldId } as any),
            args.language
          ),
          fieldLabel: fieldLabelFromDef,
          fieldDef,
          groupId,
          subgroupPath
        };
      }
      if (target.kind !== 'lineGroup') continue;
      const targetGroupId = (target.id || '').toString().trim();
      if (!groupId || targetGroupId !== groupId) continue;
      const lineTarget = target as StepLineGroupTargetConfig;
      const targetLabel =
        resolveLocalizedString(lineTarget.label, args.language, '') ||
        targetFallback ||
        resolveLabel(groupQuestion as WebQuestionDefinition, args.language);

      if (subgroupPath.length) {
        const targetSubgroups = Array.isArray(lineTarget.subGroups?.include) ? lineTarget.subGroups!.include! : [];
        if (!targetSubgroups.length) {
          return {
            stepId: (step.id || '').toString().trim() || null,
            stepLabel,
            stepOrder: stepIndex,
            targetLabel,
            fieldLabel: fieldLabelFromDef,
            fieldDef,
            groupId,
            subgroupPath
          };
        }
        const subgroupTarget = targetSubgroups.find((entry: any) => resolveSubgroupKey(entry) === subgroupPath[subgroupPath.length - 1]);
        if (!subgroupTarget) continue;
        const subgroupFields = Array.isArray(subgroupTarget.fields) ? subgroupTarget.fields.map(normalizeStepFieldId).filter(Boolean) : [];
        if (fieldId && subgroupFields.length && !subgroupFields.includes(fieldId)) continue;
        const subgroupLabel =
          resolveLocalizedString((subgroupCfg as any)?.label, args.language, '') ||
          targetLabel ||
          humanizeId(subgroupPath[subgroupPath.length - 1] || '');
        return {
          stepId: (step.id || '').toString().trim() || null,
          stepLabel,
          stepOrder: stepIndex,
          targetLabel: subgroupLabel,
          fieldLabel: fieldLabelFromDef,
          fieldDef,
          groupId,
          subgroupPath
        };
      }

      const targetFields = Array.isArray(lineTarget.fields) ? lineTarget.fields.map(normalizeStepFieldId).filter(Boolean) : [];
      const readOnlyFields = Array.isArray(lineTarget.readOnlyFields)
        ? lineTarget.readOnlyFields.map((entry: any) => (entry || '').toString().trim().split(/[:._]+/).pop() || '').filter(Boolean)
        : [];
      if (fieldId && targetFields.length && !targetFields.includes(fieldId) && !readOnlyFields.includes(fieldId)) {
        continue;
      }
      return {
        stepId: (step.id || '').toString().trim() || null,
        stepLabel,
        stepOrder: stepIndex,
        targetLabel,
        fieldLabel: fieldLabelFromDef,
        fieldDef,
        groupId,
        subgroupPath
      };
    }
  }

  return {
    stepId: null,
    stepLabel: '',
    stepOrder: Number.MAX_SAFE_INTEGER,
    targetLabel: targetFallback,
    fieldLabel: fieldLabelFromDef,
    fieldDef,
    groupId,
    subgroupPath
  };
};

const buildReviewLabel = (args: {
  fieldId?: string | null;
  fieldLabel: string;
  targetLabel: string;
  rowContext: string;
}): string => {
  const fieldId = (args.fieldId || '').toString().trim();
  const explicitFieldLabel =
    fieldId && fieldId.toUpperCase().includes('RECIPE')
      ? 'Recipe'
      : (args.fieldLabel || '').toString().trim();
  const targetLabel = (args.targetLabel || '').toString().trim();
  let baseLabel = explicitFieldLabel || targetLabel;
  if (!fieldId || isQuantityLikeField(fieldId, explicitFieldLabel)) {
    baseLabel = targetLabel || explicitFieldLabel;
  }
  if (args.rowContext) {
    return [baseLabel, args.rowContext].filter(Boolean).join(' | ').trim();
  }
  return baseLabel.trim();
};

export type RecordSyncReviewItem = {
  fieldPath: string;
  highlightFieldPaths: string[];
  label: string;
  previousText: string;
  nextText: string;
};

export type RecordSyncReviewStep = {
  stepId: string | null;
  stepLabel: string;
  stepOrder: number;
  items: RecordSyncReviewItem[];
  primaryFieldPath: string;
  highlightFieldPaths: string[];
};

const uniqueStrings = (items: string[]): string[] => {
  const seen = new Set<string>();
  return items.filter(item => {
    const key = (item || '').toString().trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const pushReviewItem = (
  groups: Map<string, RecordSyncReviewStep>,
  args: {
    definition: WebFormDefinition;
    language: LangCode;
    groupKey?: string | null;
    fieldId?: string | null;
    fieldPath: string;
    highlightFieldPaths?: string[];
    previousValue: any;
    nextValue: any;
    previousLineItems: LineItemState;
    nextLineItems: LineItemState;
    previousRow?: LineItemRowState | null;
    nextRow?: LineItemRowState | null;
  }
) => {
  const meta = resolveReviewTargetMeta({
    definition: args.definition,
    language: args.language,
    groupKey: args.groupKey,
    fieldId: args.fieldId
  });
  const rowContext = args.groupKey
    ? resolveRowContext({
        definition: args.definition,
        groupKey: args.groupKey,
        subgroupPath: meta.subgroupPath,
        previousRow: args.previousRow || null,
        nextRow: args.nextRow || null,
        previousLineItems: args.previousLineItems,
        nextLineItems: args.nextLineItems,
        language: args.language
      })
    : '';
  const label = buildReviewLabel({
    fieldId: args.fieldId,
    fieldLabel: meta.fieldLabel,
    targetLabel: meta.targetLabel,
    rowContext
  });
  const previousText = formatRawReviewValue({
    value: args.previousValue,
    fieldDef: meta.fieldDef,
    fieldId: args.fieldId,
    language: args.language
  });
  const nextText = formatRawReviewValue({
    value: args.nextValue,
    fieldDef: meta.fieldDef,
    fieldId: args.fieldId,
    language: args.language
  });
  const groupKey = meta.stepId || '__form__';
  const existing =
    groups.get(groupKey) ||
    ({
      stepId: meta.stepId,
      stepLabel: meta.stepLabel,
      stepOrder: meta.stepOrder,
      items: [],
      primaryFieldPath: args.fieldPath,
      highlightFieldPaths: []
    } as RecordSyncReviewStep);
  existing.items.push({
    fieldPath: args.fieldPath,
    highlightFieldPaths: uniqueStrings(args.highlightFieldPaths && args.highlightFieldPaths.length ? args.highlightFieldPaths : [args.fieldPath]),
    label,
    previousText,
    nextText
  });
  existing.highlightFieldPaths = uniqueStrings([
    ...existing.highlightFieldPaths,
    ...(args.highlightFieldPaths && args.highlightFieldPaths.length ? args.highlightFieldPaths : [args.fieldPath])
  ]);
  if (!existing.primaryFieldPath) {
    existing.primaryFieldPath = args.fieldPath;
  }
  groups.set(groupKey, existing);
};

export const buildRecordSyncReviewSteps = (args: {
  definition: WebFormDefinition;
  language: LangCode;
  previousValues?: Record<string, FieldValue> | null;
  previousLineItems?: LineItemState | null;
  nextValues?: Record<string, FieldValue> | null;
  nextLineItems?: LineItemState | null;
  preferredFirstStepId?: string | null;
}): RecordSyncReviewStep[] => {
  const definitionFormKey = (((args.definition as any)?.formKey || '') as any).toString?.() || '';
  const previousValues = stripRecordSyncComparableValues(args.previousValues, args.definition);
  const previousLineItems = stripRecordSyncComparableLineItems(args.previousLineItems);
  const nextValues = stripRecordSyncComparableValues(args.nextValues, args.definition);
  const nextLineItems = stripRecordSyncComparableLineItems(args.nextLineItems);
  if (
    buildRecordSyncComparableFingerprint({
      definition: args.definition,
      formKey: definitionFormKey,
      language: args.language,
      values: previousValues,
      lineItems: previousLineItems
    }) ===
    buildRecordSyncComparableFingerprint({
      definition: args.definition,
      formKey: definitionFormKey,
      language: args.language,
      values: nextValues,
      lineItems: nextLineItems
    })
  ) {
    return [];
  }

  const groups = new Map<string, RecordSyncReviewStep>();

  const topLevelKeys = Array.from(new Set([...Object.keys(previousValues || {}), ...Object.keys(nextValues || {})]));
  topLevelKeys.forEach(fieldId => {
    if (comparableValueFingerprint((previousValues as any)[fieldId]) === comparableValueFingerprint((nextValues as any)[fieldId])) {
      return;
    }
    pushReviewItem(groups, {
      definition: args.definition,
      language: args.language,
      fieldId,
      fieldPath: fieldId,
      previousValue: (previousValues as any)[fieldId],
      nextValue: (nextValues as any)[fieldId],
      previousLineItems,
      nextLineItems
    });
  });

  const lineGroupKeys = Array.from(new Set([...Object.keys(previousLineItems || {}), ...Object.keys(nextLineItems || {})]));
  lineGroupKeys.forEach(groupKey => {
    const previousRows = Array.isArray((previousLineItems as any)[groupKey]) ? ((previousLineItems as any)[groupKey] as LineItemRowState[]) : [];
    const nextRows = Array.isArray((nextLineItems as any)[groupKey]) ? ((nextLineItems as any)[groupKey] as LineItemRowState[]) : [];
    const previousRowsById = new Map(previousRows.map(row => [row?.id || '', row]));
    const nextRowsById = new Map(nextRows.map(row => [row?.id || '', row]));
    const rowIds = Array.from(new Set([...previousRowsById.keys(), ...nextRowsById.keys()])).filter(Boolean);

    rowIds.forEach(rowId => {
      const previousRow = previousRowsById.get(rowId) || null;
      const nextRow = nextRowsById.get(rowId) || null;
      if (!previousRow || !nextRow) {
        pushReviewItem(groups, {
          definition: args.definition,
          language: args.language,
          groupKey,
          fieldPath: groupKey,
          highlightFieldPaths: [groupKey],
          previousValue: previousRow ? 'Present' : EMPTY_DISPLAY,
          nextValue: nextRow ? 'Added' : 'Removed',
          previousLineItems,
          nextLineItems,
          previousRow,
          nextRow
        });
        return;
      }
      const previousRowValues = (previousRow.values || {}) as Record<string, FieldValue>;
      const nextRowValues = (nextRow.values || {}) as Record<string, FieldValue>;
      const fieldIds = Array.from(new Set([...Object.keys(previousRowValues), ...Object.keys(nextRowValues)]));
      fieldIds.forEach(fieldId => {
        if (isIgnoredComparableKey(fieldId)) return;
        if (comparableValueFingerprint(previousRowValues[fieldId]) === comparableValueFingerprint(nextRowValues[fieldId])) {
          return;
        }
        const fieldPath = `${groupKey}__${fieldId}__${rowId}`;
        pushReviewItem(groups, {
          definition: args.definition,
          language: args.language,
          groupKey,
          fieldId,
          fieldPath,
          highlightFieldPaths: [fieldPath],
          previousValue: previousRowValues[fieldId],
          nextValue: nextRowValues[fieldId],
          previousLineItems,
          nextLineItems,
          previousRow,
          nextRow
        });
      });
    });
  });

  const preferredStepId = (args.preferredFirstStepId || '').toString().trim();
  return Array.from(groups.values()).sort((left, right) => {
    const leftPreferred = preferredStepId && left.stepId === preferredStepId ? 0 : 1;
    const rightPreferred = preferredStepId && right.stepId === preferredStepId ? 0 : 1;
    if (leftPreferred !== rightPreferred) return leftPreferred - rightPreferred;
    if (left.stepOrder !== right.stepOrder) return left.stepOrder - right.stepOrder;
    return (left.stepLabel || '').localeCompare(right.stepLabel || '');
  });
};
