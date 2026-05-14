import type {
  ButtonConfirmConfig,
  DefaultValue,
  QuestionConfig,
  UpdateRecordDependencyGuardConfig,
  UpdateRecordDependencyMutation,
  WebFormSubmission
} from '../../types';
import type { FieldValue, LangCode, LineItemRowState, VisibilityContext } from '../../web/types';
import { resolveLocalizedString, resolveOptionalLocalizedString } from '../../web/i18n';
import { matchesWhenClause } from '../../web/rules/visibility';
import { getSystemFieldValue } from '../../web/rules/systemFields';
import {
  buildSubgroupKey,
  resolveSubgroupKey,
  ROW_ID_KEY,
  ROW_PARENT_GROUP_ID_KEY,
  ROW_PARENT_ROW_ID_KEY
} from '../../web/react/app/lineItems';
import { debugLog } from './debug';

export interface ResolvedUpdateRecordDependencyDialog {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  showCancel?: boolean;
  showConfirm?: boolean;
  primaryAction?: 'confirm' | 'cancel';
  dismissOnBackdrop?: boolean;
  showCloseButton?: boolean;
}

export interface UpdateRecordDependencyPreviewResult<TRecord extends WebFormSubmission = WebFormSubmission> {
  targetFormKey: string;
  mode: 'confirm' | 'block';
  blocked: boolean;
  impactedCount: number;
  impactedRecords: TRecord[];
  dialog: ResolvedUpdateRecordDependencyDialog;
}

type TemplateVars = Record<string, any>;

type RecordLineItemState = Record<string, LineItemRowState[]>;

type MutationTargetRow = {
  row: Record<string, any>;
  groupKey: string;
  groupCfg: any;
  parentValues?: Record<string, any>;
};

const EXACT_TEMPLATE_TOKEN_RE = /^\{\{\s*([^}]+?)\s*\}\}$/;
const TEMPLATE_TOKEN_RE = /\{\{\s*([^}]+?)\s*\}\}/g;

const isPlainObject = (value: unknown): value is Record<string, any> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const normalizeMetaString = (raw: any): string => {
  if (raw === undefined || raw === null) return '';
  try {
    return raw.toString().trim();
  } catch (_) {
    return '';
  }
};

const cloneJson = <T,>(value: T): T => {
  if (value === undefined) return value;
  return JSON.parse(JSON.stringify(value));
};

const valuesEqual = (left: any, right: any): boolean => {
  if (left === right) return true;
  if (left === undefined || left === null || right === undefined || right === null) {
    return left === right;
  }
  if (typeof left !== typeof right) return false;
  if (Array.isArray(left) || Array.isArray(right) || isPlainObject(left) || isPlainObject(right)) {
    try {
      return JSON.stringify(left) === JSON.stringify(right);
    } catch (_) {
      return false;
    }
  }
  return false;
};

const parseRawRows = (raw: any): any[] => {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }
  return [];
};

const buildRecordLineItems = (
  questions: QuestionConfig[],
  recordValues: Record<string, any> | undefined | null
): RecordLineItemState => {
  let state: RecordLineItemState = {};

  const parseGroupRows = (args: {
    rootGroupId: string;
    groupKey: string;
    groupCfg: any;
    path: string[];
    rawRows: any[];
    parentRowId?: string;
    parentGroupKey?: string;
  }): LineItemRowState[] => {
    const { rootGroupId, groupKey, groupCfg, path, rawRows, parentRowId, parentGroupKey } = args;
    const cfg = groupCfg?.lineItemConfig || groupCfg || {};
    const subGroups = Array.isArray(cfg.subGroups) ? cfg.subGroups : [];

    return (rawRows || []).map((rawRow, index) => {
      const values = { ...(rawRow || {}) };
      const storedRowId = normalizeMetaString((values as any)[ROW_ID_KEY]);
      const rowId = storedRowId || `${path.length ? path[path.length - 1] : rootGroupId}_${index}`;
      (values as any)[ROW_ID_KEY] = rowId;
      if (parentRowId && !Object.prototype.hasOwnProperty.call(values, ROW_PARENT_ROW_ID_KEY)) {
        (values as any)[ROW_PARENT_ROW_ID_KEY] = parentRowId;
      }
      if (parentGroupKey && !Object.prototype.hasOwnProperty.call(values, ROW_PARENT_GROUP_ID_KEY)) {
        (values as any)[ROW_PARENT_GROUP_ID_KEY] = parentGroupKey;
      }

      subGroups.forEach((sub: any) => {
        const subId = resolveSubgroupKey(sub as any);
        if (!subId) return;
        const childKey = buildSubgroupKey(groupKey, rowId, subId);
        const childRows = parseGroupRows({
          rootGroupId,
          groupKey: childKey,
          groupCfg: sub,
          path: [...path, subId],
          rawRows: parseRawRows((rawRow as any)?.[subId]),
          parentRowId: rowId,
          parentGroupKey: groupKey
        });
        if (childRows.length) {
          state = { ...state, [childKey]: childRows };
        }
        delete (values as any)[subId];
      });

      return {
        id: rowId,
        values,
        parentId: parentRowId,
        parentGroupId: parentGroupKey
      };
    });
  };

  (questions || [])
    .filter(q => q && q.type === 'LINE_ITEM_GROUP')
    .forEach(group => {
      const rows = parseGroupRows({
        rootGroupId: group.id,
        groupKey: group.id,
        groupCfg: group,
        path: [],
        rawRows: parseRawRows(recordValues?.[group.id] || recordValues?.[`${group.id}_json`])
      });
      state[group.id] = rows;
    });

  return state;
};

const getRecordFieldValue = (record: WebFormSubmission, fieldId: string): FieldValue => {
  const meta = getSystemFieldValue(fieldId, {
    id: record.id,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    status: record.status || null,
    pdfUrl: record.pdfUrl
  });
  if (meta !== undefined) return meta as FieldValue;
  return (record.values || {})[fieldId] as FieldValue;
};

export const buildRecordVisibilityContext = (
  record: WebFormSubmission,
  questions: QuestionConfig[]
): { ctx: VisibilityContext; lineItems: RecordLineItemState } => {
  const lineItems = buildRecordLineItems(questions, record.values || {});
  const ctx: VisibilityContext = {
    getValue: (fieldId: string) => getRecordFieldValue(record, fieldId),
    getLineItems: (groupId: string) => lineItems[groupId] || [],
    getLineItemKeys: () => Object.keys(lineItems)
  };
  return { ctx, lineItems };
};

export const buildRowVisibilityContext = (args: {
  row: Record<string, any>;
  groupKey: string;
  parentValues?: Record<string, any>;
  topCtx: VisibilityContext;
}): { ctx: VisibilityContext; rowId: string } => {
  const { row, groupKey, parentValues, topCtx } = args;
  const rowId = normalizeMetaString((row as any)?.[ROW_ID_KEY]);
  const scopedPrefix = groupKey ? `${groupKey}__` : '';

  const resolveRowValue = (fieldIdRaw: string): FieldValue => {
    const fieldId = (fieldIdRaw || '').toString();
    const localId = scopedPrefix && fieldId.startsWith(scopedPrefix) ? fieldId.slice(scopedPrefix.length) : fieldId;
    if (Object.prototype.hasOwnProperty.call(row || {}, localId)) return (row as any)[localId] as FieldValue;
    if (parentValues && Object.prototype.hasOwnProperty.call(parentValues || {}, localId)) {
      return (parentValues as any)[localId] as FieldValue;
    }
    if (Object.prototype.hasOwnProperty.call(row || {}, fieldId)) return (row as any)[fieldId] as FieldValue;
    if (parentValues && Object.prototype.hasOwnProperty.call(parentValues || {}, fieldId)) {
      return (parentValues as any)[fieldId] as FieldValue;
    }
    return topCtx.getValue(fieldId);
  };

  const ctx: VisibilityContext = {
    getValue: resolveRowValue,
    getLineValue: (_ignoredRowId: string, fieldId: string) => resolveRowValue(fieldId),
    getLineItems: topCtx.getLineItems,
    getLineItemKeys: topCtx.getLineItemKeys
  };
  return { ctx, rowId };
};

const getTemplateVar = (vars: TemplateVars, pathRaw: string): any => {
  const path = (pathRaw || '').toString().trim();
  if (!path) return '';
  const parts = path.split('.').map(part => part.trim()).filter(Boolean);
  let current: any = vars;
  for (const part of parts) {
    if (current === undefined || current === null) return '';
    current = current[part];
  }
  return current === undefined ? '' : current;
};

const stringifyTemplateValue = (value: any): string => {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return value.toString();
  if (Array.isArray(value)) {
    return value
      .map(item => stringifyTemplateValue(item))
      .filter(Boolean)
      .join(', ');
  }
  if (isPlainObject(value)) {
    const displayKeys = ['label', 'displayLabel', 'display', 'name', 'value', 'id'];
    for (const key of displayKeys) {
      const displayValue = (value as Record<string, any>)[key];
      if (typeof displayValue === 'string' && displayValue.trim()) return displayValue;
      if (typeof displayValue === 'number' || typeof displayValue === 'boolean') return displayValue.toString();
    }
  }
  try {
    return JSON.stringify(value);
  } catch (_) {
    return '';
  }
};

export const resolveTemplateValue = (value: any, vars: TemplateVars): any => {
  if (typeof value === 'string') {
    const exact = value.match(EXACT_TEMPLATE_TOKEN_RE);
    if (exact) {
      return getTemplateVar(vars, exact[1] || '');
    }
    if (!value.includes('{{')) return value;
    return value.replace(TEMPLATE_TOKEN_RE, (_match, key) => stringifyTemplateValue(getTemplateVar(vars, key || '')));
  }
  if (Array.isArray(value)) {
    return value.map(entry => resolveTemplateValue(entry, vars));
  }
  if (isPlainObject(value)) {
    const out: Record<string, any> = {};
    Object.keys(value).forEach(key => {
      out[key] = resolveTemplateValue((value as any)[key], vars);
    });
    return out;
  }
  return value;
};

export const buildTemplateVars = (args: {
  sourceRecord: WebFormSubmission;
  targetFormKey: string;
  targetFormTitle?: string;
  impactedCount?: number;
  targetRecord?: WebFormSubmission;
  row?: Record<string, any>;
  parent?: Record<string, any>;
  lineItem?: {
    groupId: string;
    subGroupPath?: string[];
    index: number;
    rowId?: string;
  };
}): TemplateVars => {
  const { sourceRecord, targetFormKey, targetFormTitle, impactedCount, targetRecord, row, parent, lineItem } = args;
  return {
    count: impactedCount ?? 0,
    targetFormKey,
    targetFormTitle: targetFormTitle || targetFormKey,
    source: {
      id: sourceRecord.id || '',
      createdAt: sourceRecord.createdAt || '',
      updatedAt: sourceRecord.updatedAt || '',
      status: sourceRecord.status || '',
      ...(sourceRecord.values || {})
    },
    target: targetRecord
      ? {
          id: targetRecord.id || '',
          createdAt: targetRecord.createdAt || '',
          updatedAt: targetRecord.updatedAt || '',
          status: targetRecord.status || '',
          pdfUrl: targetRecord.pdfUrl || '',
          ...(targetRecord.values || {})
        }
      : {},
    row: cloneJson(row || {}),
    parent: cloneJson(parent || {}),
    lineItem: {
      groupId: lineItem?.groupId || '',
      subGroupPath: Array.isArray(lineItem?.subGroupPath) ? [...(lineItem?.subGroupPath || [])] : [],
      index: Number.isFinite(Number(lineItem?.index)) ? Number(lineItem?.index) : 0,
      rowId: lineItem?.rowId || ''
    }
  };
};

export const resolveUpdateRecordDependencyGuardMode = (
  guard: UpdateRecordDependencyGuardConfig | undefined | null
): 'confirm' | 'block' => {
  const mode = (guard?.mode || '').toString().trim().toLowerCase();
  return mode === 'block' || mode === 'blocking' ? 'block' : 'confirm';
};

const resolveDialogRecordList = <TRecord extends WebFormSubmission = WebFormSubmission>(args: {
  dialog: ButtonConfirmConfig;
  language: LangCode;
  baseVars: TemplateVars;
  sourceRecord: WebFormSubmission;
  targetFormKey: string;
  targetFormTitle?: string;
  impactedRecords: TRecord[];
}): string => {
  const recordListCfg = (args.dialog as any)?.recordList;
  if (!recordListCfg || typeof recordListCfg !== 'object') return '';
  const templateRaw = recordListCfg.template ?? recordListCfg.lineTemplate ?? recordListCfg.itemTemplate;
  const template = resolveLocalizedString(templateRaw, args.language, '').toString();
  if (!template.trim()) return '';

  if (!args.impactedRecords.length) {
    return resolveLocalizedString(recordListCfg.emptyText, args.language, '').toString().trim();
  }

  const limitRaw = Number(recordListCfg.limit);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.floor(limitRaw) : args.impactedRecords.length;
  return args.impactedRecords
    .slice(0, limit)
    .map(record => {
      const vars = buildTemplateVars({
        sourceRecord: args.sourceRecord,
        targetRecord: record,
        targetFormKey: args.targetFormKey,
        targetFormTitle: args.targetFormTitle,
        impactedCount: args.impactedRecords.length
      });
      return resolveTemplateValue(template, { ...args.baseVars, ...vars }).toString().trim();
    })
    .filter(Boolean)
    .join('\n');
};

const resolveDialog = (args: {
  dialog: ButtonConfirmConfig;
  language: LangCode;
  vars: TemplateVars;
  sourceRecord: WebFormSubmission;
  targetFormKey: string;
  targetFormTitle?: string;
  impactedRecords: WebFormSubmission[];
}): ResolvedUpdateRecordDependencyDialog => {
  const recordsList = resolveDialogRecordList({
    dialog: args.dialog,
    language: args.language,
    baseVars: args.vars,
    sourceRecord: args.sourceRecord,
    targetFormKey: args.targetFormKey,
    targetFormTitle: args.targetFormTitle,
    impactedRecords: args.impactedRecords
  });
  const dialogVars = {
    ...args.vars,
    recordsList
  };
  const dialogResolved = resolveTemplateValue(args.dialog, dialogVars) as ButtonConfirmConfig;
  return {
    title: resolveOptionalLocalizedString(dialogResolved?.title, args.language, 'Confirm').toString().trim(),
    message: resolveLocalizedString(
      (dialogResolved as any)?.message ?? (dialogResolved as any)?.body,
      args.language,
      ''
    )
      .toString()
      .trim(),
    confirmLabel: resolveLocalizedString(dialogResolved?.confirmLabel, args.language, 'Confirm').toString().trim(),
    cancelLabel: resolveLocalizedString(dialogResolved?.cancelLabel, args.language, 'Cancel').toString().trim(),
    showCancel: (dialogResolved as any)?.showCancel,
    showConfirm: (dialogResolved as any)?.showConfirm,
    primaryAction: (dialogResolved as any)?.primaryAction === 'cancel' ? 'cancel' : undefined,
    dismissOnBackdrop: (dialogResolved as any)?.dismissOnBackdrop,
    showCloseButton: (dialogResolved as any)?.showCloseButton
  };
};

const normalizeSubGroupPath = (raw: string | string[] | undefined): string[] => {
  if (!raw) return [];
  const list = Array.isArray(raw) ? raw : raw.toString().split('.');
  return list.map(item => (item === undefined || item === null ? '' : item.toString().trim())).filter(Boolean);
};

const resolveRootGroupConfig = (questions: QuestionConfig[], groupId: string): any | null => {
  const target = (questions || []).find(q => q && q.type === 'LINE_ITEM_GROUP' && q.id === groupId);
  return target?.lineItemConfig || null;
};

const collectMutationTargetRows = (args: {
  rows: any[];
  groupKey: string;
  groupCfg: any;
  subGroupPath: string[];
  parentValues?: Record<string, any>;
}): MutationTargetRow[] => {
  const { rows, groupKey, groupCfg, subGroupPath, parentValues } = args;
  if (!subGroupPath.length) {
    return (rows || []).map(row => ({ row, groupKey, groupCfg, parentValues }));
  }

  const [nextSubId, ...restPath] = subGroupPath;
  const subGroups = Array.isArray(groupCfg?.subGroups) ? groupCfg.subGroups : [];
  const targetSub = subGroups.find((sub: any) => resolveSubgroupKey(sub as any) === nextSubId);
  if (!targetSub) return [];

  const matches: MutationTargetRow[] = [];
  (rows || []).forEach(row => {
    const rowId = normalizeMetaString((row as any)?.[ROW_ID_KEY]);
    if (!rowId) return;
    const childKey = buildSubgroupKey(groupKey, rowId, nextSubId);
    const childRows = parseRawRows((row as any)?.[nextSubId]);
    matches.push(
      ...collectMutationTargetRows({
        rows: childRows,
        groupKey: childKey,
        groupCfg: targetSub,
        subGroupPath: restPath,
        parentValues: (row || {}) as Record<string, any>
      })
    );
  });
  return matches;
};

const mutateRecordTopLevel = (
  values: Record<string, any>,
  mutation: Extract<UpdateRecordDependencyMutation, { type: 'setRecord' }>
): { values: Record<string, any>; statusChanged: boolean } => {
  const nextValues = { ...(values || {}) };
  let statusChanged = false;
  if (mutation.values && typeof mutation.values === 'object') {
    Object.keys(mutation.values).forEach(fieldId => {
      nextValues[fieldId] = (mutation.values as Record<string, DefaultValue | null>)[fieldId];
    });
  }
  if (Object.prototype.hasOwnProperty.call(mutation, 'status')) {
    statusChanged = true;
  }
  return { values: nextValues, statusChanged };
};

const applyLineItemMutation = (args: {
  mutation: Extract<UpdateRecordDependencyMutation, { type: 'setLineItemValues' }>;
  recordValues: Record<string, any>;
  questions: QuestionConfig[];
  topCtx: VisibilityContext;
  now: Date;
}): boolean => {
  const { mutation, recordValues, questions, topCtx, now } = args;
  const rootRows = Array.isArray(recordValues?.[mutation.groupId]) ? (recordValues[mutation.groupId] as any[]) : [];
  if (!rootRows.length) return false;
  const rootCfg = resolveRootGroupConfig(questions, mutation.groupId);
  if (!rootCfg) return false;

  const candidates = collectMutationTargetRows({
    rows: rootRows,
    groupKey: mutation.groupId,
    groupCfg: rootCfg,
    subGroupPath: normalizeSubGroupPath(mutation.subGroupPath)
  });
  if (!candidates.length) return false;

  let changed = false;
  candidates.forEach(candidate => {
    const { row, groupKey, parentValues } = candidate;
    const rowId = normalizeMetaString((row as any)?.[ROW_ID_KEY]);
    if (!rowId) return;
    if (mutation.when) {
      const rowCtx = buildRowVisibilityContext({ row, groupKey, parentValues, topCtx });
      if (!matchesWhenClause(mutation.when, rowCtx.ctx, { rowId: rowCtx.rowId, linePrefix: groupKey, now })) {
        return;
      }
    }

    Object.keys(mutation.values || {}).forEach(fieldId => {
      const nextValue = (mutation.values as Record<string, DefaultValue | null>)[fieldId];
      if (valuesEqual((row as any)[fieldId], nextValue)) return;
      (row as any)[fieldId] = nextValue;
      changed = true;
    });

    (mutation.clearSubGroups || []).forEach(subIdRaw => {
      const subId = (subIdRaw || '').toString().trim();
      if (!subId) return;
      if (Array.isArray((row as any)[subId]) && (row as any)[subId].length === 0) return;
      (row as any)[subId] = [];
      changed = true;
    });
  });

  return changed;
};

export const evaluateUpdateRecordDependencyPreview = <TRecord extends WebFormSubmission = WebFormSubmission>(args: {
  guard: UpdateRecordDependencyGuardConfig;
  sourceRecord: WebFormSubmission;
  language: LangCode;
  targetFormKey: string;
  targetFormTitle?: string;
  targetQuestions: QuestionConfig[];
  targetRecords: TRecord[];
  now?: Date;
}): UpdateRecordDependencyPreviewResult<TRecord> => {
  const now = args.now instanceof Date && !Number.isNaN(args.now.getTime()) ? args.now : new Date();
  const mode = resolveUpdateRecordDependencyGuardMode(args.guard);
  const initialVars = buildTemplateVars({
    sourceRecord: args.sourceRecord,
    targetFormKey: args.targetFormKey,
    targetFormTitle: args.targetFormTitle
  });
  const resolvedWhen = resolveTemplateValue(args.guard.when, initialVars);

  const impactedRecords = (args.targetRecords || []).filter(record => {
    const { ctx } = buildRecordVisibilityContext(record, args.targetQuestions);
    return matchesWhenClause(resolvedWhen as any, ctx, { now });
  });

  const vars = buildTemplateVars({
    sourceRecord: args.sourceRecord,
    targetFormKey: args.targetFormKey,
    targetFormTitle: args.targetFormTitle,
    impactedCount: impactedRecords.length
  });

  const dialog = resolveDialog({
    dialog: args.guard.dialog,
    language: args.language,
    vars,
    sourceRecord: args.sourceRecord,
    targetFormKey: args.targetFormKey,
    targetFormTitle: args.targetFormTitle,
    impactedRecords
  });

  debugLog('updateRecordDependencies.preview', {
    targetFormKey: args.targetFormKey,
    impactedCount: impactedRecords.length,
    mode,
    blocked: mode === 'block' && impactedRecords.length > 0
  });

  return {
    targetFormKey: args.targetFormKey,
    mode,
    blocked: mode === 'block' && impactedRecords.length > 0,
    impactedCount: impactedRecords.length,
    impactedRecords,
    dialog
  };
};

export const applyUpdateRecordDependencyMutationsToRecord = (args: {
  guard: UpdateRecordDependencyGuardConfig;
  sourceRecord: WebFormSubmission;
  targetQuestions: QuestionConfig[];
  targetRecord: WebFormSubmission;
  now?: Date;
}): { changed: boolean; record: WebFormSubmission } => {
  const now = args.now instanceof Date && !Number.isNaN(args.now.getTime()) ? args.now : new Date();
  const templateVars = buildTemplateVars({
    sourceRecord: args.sourceRecord,
    targetFormKey: args.guard.targetFormKey
  });

  const nextRecord: WebFormSubmission = {
    ...args.targetRecord,
    values: cloneJson(args.targetRecord.values || {})
  };

  let changed = false;
  let status = args.targetRecord.status;

  (args.guard.mutations || []).forEach(rawMutation => {
    const mutation = resolveTemplateValue(rawMutation, templateVars) as UpdateRecordDependencyMutation;
    if (!mutation || typeof mutation !== 'object') return;

    if (mutation.type === 'setRecord') {
      const topLevel = mutateRecordTopLevel(nextRecord.values || {}, mutation);
      if (!valuesEqual(nextRecord.values, topLevel.values)) {
        nextRecord.values = topLevel.values;
        changed = true;
      }
      if (topLevel.statusChanged) {
        const nextStatus = mutation.status === null || mutation.status === undefined ? undefined : mutation.status.toString();
        if ((status || undefined) !== nextStatus) {
          status = nextStatus;
          changed = true;
        }
      }
      return;
    }

    if (mutation.type === 'setLineItemValues') {
      const { ctx: topCtx } = buildRecordVisibilityContext(nextRecord, args.targetQuestions);
      const lineChanged = applyLineItemMutation({
        mutation,
        recordValues: nextRecord.values || {},
        questions: args.targetQuestions,
        topCtx,
        now
      });
      if (lineChanged) changed = true;
    }
  });

  nextRecord.status = status;

  debugLog('updateRecordDependencies.applyRecord', {
    targetFormKey: args.guard.targetFormKey,
    recordId: args.targetRecord.id || null,
    changed
  });

  return { changed, record: nextRecord };
};
