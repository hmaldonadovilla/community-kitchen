import { evaluateRules, matchesWhenClause, shouldHideField, validateRules } from '../../core';
import {
  FieldValue,
  LangCode,
  LineItemDedupRule,
  LineItemRowState,
  LocalizedString,
  StepRowFilterConfig,
  VisibilityContext,
  WebFormDefinition,
  WebFormSubmission
} from '../../types';
import { SubmissionPayload } from '../api';
import { FormErrors, LineItemState } from '../types';
import { resolveFieldLabel } from '../utils/labels';
import { isEmptyValue, isUnsetForStep } from '../utils/values';
import { tSystem } from '../../systemStrings';
import { resolveLocalizedString } from '../../i18n';
import { buildMaybeFilePayload } from './filePayload';
import { ROW_ID_KEY, buildLineItemDedupKey, buildSubgroupKey, formatLineItemDedupValue, normalizeLineItemDedupRules, resolveSubgroupKey } from './lineItems';
import { resolveParagraphUserText } from './paragraphDisclaimer';
import { CK_RECIPE_INGREDIENTS_DIRTY_KEY } from './recipeIngredientsDirty';
import { applyValueMapsToForm } from './valueMaps';
import { buildValidationContext } from './validation';
import { GuidedStepsVirtualState, resolveVirtualStepField } from '../features/steps/domain/resolveVirtualStepField';

const formatTemplate = (value: string, vars?: Record<string, string | number | boolean | null | undefined>): string => {
  if (!vars) return value;
  return value.replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, key) => {
    const raw = (vars as any)[key];
    return raw === undefined || raw === null ? '' : String(raw);
  });
};

const lineItemDedupDefaultMessage: LocalizedString = {
  en: 'This entry already exists in this list.',
  fr: 'Cette entrée existe déjà dans cette liste.',
  nl: 'Deze invoer bestaat al in deze lijst.'
};

const resolveLineItemDedupMessage = (
  rule: LineItemDedupRule,
  language: LangCode,
  vars?: Record<string, string | number | boolean | null | undefined>
): string => {
  const base = resolveLocalizedString(rule.message || lineItemDedupDefaultMessage, language, 'This entry already exists in this list.');
  return formatTemplate(base, vars);
};

type StepRowFilterOverrides = {
  groups: Record<string, StepRowFilterConfig[]>;
  subGroups: Record<string, Record<string, StepRowFilterConfig[]>>;
};

const resolveRequiredValue = (field: any, rawValue: FieldValue): FieldValue => {
  if (!field || field?.type !== 'PARAGRAPH') return rawValue;
  const cfg = (field?.ui as any)?.paragraphDisclaimer;
  if (!cfg) return rawValue;
  return resolveParagraphUserText({ rawValue, config: cfg });
};

const normalizeStepRowFilter = (raw: any): StepRowFilterConfig | null => {
  if (!raw || typeof raw !== 'object') return null;
  return raw as StepRowFilterConfig;
};

const isIncludedByRowFilter = (rowValues: Record<string, FieldValue>, filter?: any): boolean => {
  if (!filter) return true;
  const includeWhen = filter?.includeWhen;
  const excludeWhen = filter?.excludeWhen;
  const rowCtx: any = { getValue: (fid: string) => (rowValues as any)[fid] };
  const includeOk = includeWhen ? matchesWhenClause(includeWhen as any, rowCtx) : true;
  const excludeMatch = excludeWhen ? matchesWhenClause(excludeWhen as any, rowCtx) : false;
  return includeOk && !excludeMatch;
};

const collectStepRowFilters = (definition: WebFormDefinition): StepRowFilterOverrides | null => {
  const stepsCfg = (definition as any)?.steps as any;
  if (!stepsCfg || stepsCfg.mode !== 'guided') return null;
  const items = Array.isArray(stepsCfg.items) ? stepsCfg.items : [];
  const headerTargets: any[] = Array.isArray(stepsCfg.header?.include) ? stepsCfg.header.include : [];
  if (!items.length && !headerTargets.length) return null;

  const overrides: StepRowFilterOverrides = { groups: {}, subGroups: {} };

  const addGroupFilter = (groupId: string, filter: StepRowFilterConfig | null) => {
    if (!groupId || !filter) return;
    if (!overrides.groups[groupId]) overrides.groups[groupId] = [];
    overrides.groups[groupId].push(filter);
  };

  const addSubGroupFilter = (groupId: string, subId: string, filter: StepRowFilterConfig | null) => {
    if (!groupId || !subId || !filter) return;
    if (!overrides.subGroups[groupId]) overrides.subGroups[groupId] = {};
    if (!overrides.subGroups[groupId][subId]) overrides.subGroups[groupId][subId] = [];
    overrides.subGroups[groupId][subId].push(filter);
  };

  const collectTargets = (targets: any[]) => {
    (targets || []).forEach(target => {
      if (!target || typeof target !== 'object') return;
      const kind = (target.kind || '').toString().trim();
      if (kind !== 'lineGroup') return;
      const groupId = (target.id || '').toString().trim();
      if (!groupId) return;
      const groupFilter = normalizeStepRowFilter(target.validationRows ?? target.rows);
      addGroupFilter(groupId, groupFilter);

      const subIncludeRaw = target.subGroups?.include;
      const subList: any[] = Array.isArray(subIncludeRaw) ? subIncludeRaw : subIncludeRaw ? [subIncludeRaw] : [];
      subList.forEach(subTarget => {
        if (!subTarget || typeof subTarget !== 'object') return;
        const subId = (subTarget.id || '').toString().trim();
        if (!subId) return;
        const subFilter = normalizeStepRowFilter(subTarget.validationRows ?? subTarget.rows);
        addSubGroupFilter(groupId, subId, subFilter);
      });
    });
  };

  collectTargets(headerTargets);
  items.forEach((step: any) => collectTargets((step as any)?.include || []));

  if (!Object.keys(overrides.groups).length && !Object.keys(overrides.subGroups).length) return null;
  return overrides;
};

const resolveUploadErrorMessage = (args: {
  uploadConfig?: any;
  language: LangCode;
  kind: 'minFiles' | 'maxFiles';
  fallback: string;
  vars?: Record<string, string | number | boolean | null | undefined>;
}): string => {
  const custom = args.uploadConfig?.errorMessages?.[args.kind];
  const customText = custom ? resolveLocalizedString(custom, args.language, '') : '';
  if (customText) return formatTemplate(customText, args.vars);
  const key = args.kind === 'minFiles' ? 'files.error.minFiles' : 'files.error.maxFiles';
  return tSystem(key, args.language, args.fallback, args.vars);
};

const splitUploadString = (raw: string): string[] => {
  const trimmed = (raw || '').toString().trim();
  if (!trimmed) return [];
  const commaParts = trimmed
    .split(',')
    .map(p => p.trim())
    .filter(Boolean);
  if (commaParts.length > 1) return commaParts;
  const matches = trimmed.match(/https?:\/\/[^\s,]+/gi);
  if (matches && matches.length > 1) return matches.map(m => m.trim()).filter(Boolean);
  return [trimmed];
};

const countUploadItems = (raw: any): number => {
  if (raw === undefined || raw === null) return 0;
  if (typeof raw === 'string') return splitUploadString(raw).length;
  // Arrays can contain strings, File payloads, {url}, or File objects (before upload completes).
  if (Array.isArray(raw)) return raw.reduce((acc, item) => acc + countUploadItems(item), 0);
  try {
    if (typeof FileList !== 'undefined' && raw instanceof FileList) return raw.length;
  } catch (_) {
    // ignore
  }
  try {
    if (typeof File !== 'undefined' && raw instanceof File) return 1;
  } catch (_) {
    // ignore
  }
  if (typeof raw === 'object') {
    const url = typeof (raw as any).url === 'string' ? ((raw as any).url as string).trim() : '';
    if (url) return countUploadItems(url);
    // dataUrl payloads built by buildFilePayload
    if (typeof (raw as any).dataUrl === 'string' && ((raw as any).dataUrl as string).trim()) return 1;
  }
  return 0;
};

export const validateUploadCounts = (args: {
  value: any;
  uploadConfig?: any;
  required?: boolean;
  requiredMessage?: any;
  language: LangCode;
  fieldLabel: string;
}): string => {
  const { value, uploadConfig, required, requiredMessage, language, fieldLabel } = args;
  const count = countUploadItems(value);
  const minCfg = uploadConfig?.minFiles;
  const min = minCfg !== undefined && minCfg !== null ? Number(minCfg) : required ? 1 : undefined;
  const maxCfg = uploadConfig?.maxFiles;
  const max = maxCfg !== undefined && maxCfg !== null ? Number(maxCfg) : undefined;

  if (min !== undefined && Number.isFinite(min) && min > 0 && count < min) {
    const vars = { field: fieldLabel, min, plural: min > 1 ? 's' : '' };

    // 1) uploadConfig errorMessages override everything (most specific)
    const uploadCustom = uploadConfig?.errorMessages?.minFiles;
    const uploadCustomText = uploadCustom ? resolveLocalizedString(uploadCustom, language, '') : '';
    if (uploadCustomText) return formatTemplate(uploadCustomText, vars);

    // 2) requiredMessage: treat minFiles=1 as "required"
    if (min === 1) {
      const requiredText = requiredMessage ? resolveLocalizedString(requiredMessage, language, '') : '';
      if (requiredText) return formatTemplate(requiredText, vars);
    }

    // 3) default/system message
    return tSystem('files.error.minFiles', language, '{field} requires at least {min} file{plural}.', vars);
  }
  if (max !== undefined && Number.isFinite(max) && max > 0 && count > max) {
    return resolveUploadErrorMessage({
      uploadConfig,
      language,
      kind: 'maxFiles',
      fallback: '{field} allows at most {max} file{plural}.',
      vars: { field: fieldLabel, max, plural: max > 1 ? 's' : '' }
    });
  }
  return '';
};

const isRowDisabledByExpandGate = (args: {
  ui: any;
  fields: any[];
  row: { id: string; values: Record<string, FieldValue> };
  topValues: Record<string, FieldValue>;
  lineItems: LineItemState;
  language: LangCode;
  linePrefix: string;
  rowCollapsed: boolean;
}): boolean => {
  const { ui, fields, row, topValues, lineItems, language, linePrefix, rowCollapsed } = args;
  const isProgressive = ui?.mode === 'progressive' && Array.isArray(ui?.collapsedFields) && (ui?.collapsedFields || []).length > 0;
  const expandGate = (ui?.expandGate || 'collapsedFieldsValid') as 'collapsedFieldsValid' | 'always';
  const collapsedFieldConfigs = isProgressive ? (ui?.collapsedFields || []) : [];
  if (!isProgressive) return false;
  if (expandGate === 'always') return false;
  if (!collapsedFieldConfigs.length) return false;
  if (!rowCollapsed) return false; // Only treat a row as "disabled" when it is actually collapsed in the UI.

  const groupCtx: VisibilityContext = {
    getValue: fid => topValues[fid],
    getLineValue: (_rowId, fid) => (row?.values || {})[fid],
    getLineItems: groupId => lineItems[groupId] || [],
    getLineItemKeys: () => Object.keys(lineItems || {})
  };

  const isHidden = (fieldId: string) => {
    const target = (fields || []).find((f: any) => f?.id === fieldId) as any;
    if (!target) return false;
    return shouldHideField(target.visibility, groupCtx, { rowId: row?.id, linePrefix });
  };

  const blocked: string[] = [];
  collapsedFieldConfigs.forEach((cfg: any) => {
    const fid = cfg?.fieldId ? cfg.fieldId.toString() : '';
    if (!fid) return;
    const field = (fields || []).find((f: any) => f?.id === fid) as any;
    if (!field) return;

    const hideField = shouldHideField(field.visibility, groupCtx, { rowId: row?.id, linePrefix });
    if (hideField) return;

    const val = resolveRequiredValue(field, (row?.values || {})[field.id]);
    if (field.required && isEmptyValue(val as any)) {
      blocked.push(field.id);
      return;
    }

    const rules = Array.isArray(field.validationRules)
      ? field.validationRules.filter((r: any) => r?.then?.fieldId === field.id)
      : [];
    if (!rules.length) return;
    const rulesCtx: any = {
      ...groupCtx,
      getValue: (fieldId: string) =>
        Object.prototype.hasOwnProperty.call(row?.values || {}, fieldId) ? (row?.values || {})[fieldId] : topValues[fieldId],
      language,
      phase: 'submit',
      isHidden
    };
    const errs = validateRules(rules, rulesCtx);
    if (errs.length) blocked.push(field.id);
  });

  return Array.from(new Set(blocked)).length > 0;
};

export const validateForm = (args: {
  definition: WebFormDefinition;
  language: LangCode;
  values: Record<string, FieldValue>;
  lineItems: LineItemState;
  collapsedRows?: Record<string, boolean>;
  collapsedSubgroups?: Record<string, boolean>;
  requiredMode?: 'configured' | 'stepComplete';
  virtualState?: GuidedStepsVirtualState | null;
}): FormErrors => {
  const { definition, language, values, lineItems, collapsedRows } = args;
  const requiredMode = args.requiredMode === 'stepComplete' ? 'stepComplete' : 'configured';
  const requireAllFields = requiredMode === 'stepComplete';
  const virtualState = args.virtualState || null;
  const resolveVirtual = (fieldId: string): FieldValue | undefined => {
    if (!virtualState) return undefined;
    return resolveVirtualStepField(fieldId, virtualState);
  };
  const ctx = buildValidationContext(values, lineItems, virtualState);
  const stepRowFilters = collectStepRowFilters(definition);
  const allErrors: FormErrors = {};
  const applyLineItemDedupRules = (args: {
    groupId: string;
    rows: LineItemRowState[];
    rules: LineItemDedupRule[];
    buildFieldPath: (rowId: string, fieldId: string) => string;
  }): void => {
    const { rows, rules, buildFieldPath } = args;
    if (!rows.length || !rules.length) return;
    const rowById = new Map(rows.map(row => [row.id, row]));
    rules.forEach(rule => {
      const fields = (rule.fields || []).map((fid: string) => (fid ?? '').toString().trim()).filter(Boolean);
      if (!fields.length) return;
      const matches = new Map<string, string[]>();
      rows.forEach(row => {
        const key = buildLineItemDedupKey((row.values || {}) as Record<string, FieldValue>, fields);
        if (!key) return;
        const list = matches.get(key) || [];
        list.push(row.id);
        matches.set(key, list);
      });
      matches.forEach(rowIds => {
        if (rowIds.length < 2) return;
        rowIds.forEach(rowId => {
          const fieldPath = buildFieldPath(rowId, fields[0]);
          if (!fieldPath) return;
          const row = rowById.get(rowId);
          const valueToken = row ? formatLineItemDedupValue((row.values || {})[fields[0]] as FieldValue) : '';
          const message = resolveLineItemDedupMessage(rule, language, valueToken ? { value: valueToken } : undefined);
          if (!allErrors[fieldPath]) allErrors[fieldPath] = message;
        });
      });
    });
  };

  const validateGroupRows = (args: {
    groupCfg: any;
    groupKey: string;
    rows: LineItemRowState[];
    contextValues: Record<string, FieldValue>;
    rootGroupId: string;
    rowFilterOverrides?: StepRowFilterOverrides | null;
  }): {
    eligibleRows: LineItemRowState[];
    hasAnyRow: boolean;
    hasAnyNonDisabledRow: boolean;
    hasAnyValidEnabledRow: boolean;
  } => {
    const { groupCfg, groupKey, rows, contextValues, rootGroupId, rowFilterOverrides } = args;
    const ui = (groupCfg as any)?.ui;
    const isProgressive =
      ui?.mode === 'progressive' && Array.isArray(ui?.collapsedFields) && (ui?.collapsedFields || []).length > 0;
    const expandGate = (ui?.expandGate || 'collapsedFieldsValid') as 'collapsedFieldsValid' | 'always';
    const defaultCollapsed = ui?.defaultCollapsed !== undefined ? !!ui.defaultCollapsed : true;
    const expandGateFields = (((groupCfg as any)?._expandGateFields as any[]) || groupCfg?.fields || []) as any[];
    const fields = (groupCfg?.fields || []) as any[];
    const fieldIdSet = new Set(fields.map((f: any) => (f?.id !== undefined ? f.id.toString() : '')).filter(Boolean));
    const normalizeFieldId = (rawId: string): string => {
      const s = rawId !== undefined && rawId !== null ? rawId.toString() : '';
      const prefix = `${groupKey}__`;
      const rootPrefix = `${rootGroupId}__`;
      if (s.startsWith(prefix)) return s.slice(prefix.length);
      if (s.startsWith(rootPrefix)) return s.slice(rootPrefix.length);
      return s;
    };

    const resolvedRowFilters = (() => {
      const hasScopedGuidedRowFilter =
        !!groupCfg && Object.prototype.hasOwnProperty.call(groupCfg as any, '_guidedRowFilter');
      if (hasScopedGuidedRowFilter) {
        const guidedRowFilter = (groupCfg as any)?._guidedRowFilter;
        return guidedRowFilter ? [guidedRowFilter] : null;
      }
      if (!rowFilterOverrides) return null;
      if (groupKey === rootGroupId) return rowFilterOverrides.groups[rootGroupId] || null;
      const subId = resolveSubgroupKey(groupCfg as any);
      if (!subId) return null;
      return rowFilterOverrides.subGroups?.[rootGroupId]?.[subId] || null;
    })();

    let hasAnyRow = false;
    let hasAnyNonDisabledRow = false;
    let hasAnyValidEnabledRow = false;
    const eligibleRows: LineItemRowState[] = [];

    rows.forEach(row => {
      const rowValues = (row as any)?.values || {};
      if (resolvedRowFilters && resolvedRowFilters.length) {
        const matchesAny = resolvedRowFilters.some(filter => isIncludedByRowFilter(rowValues, filter));
        if (!matchesAny) return;
      }
      hasAnyRow = true;
      const collapseKey = `${groupKey}::${row.id}`;
      const rowCollapsedBase = isProgressive ? (collapsedRows?.[collapseKey] ?? defaultCollapsed) : false;
      const rowCollapsed = ui?.guidedCollapsedFieldsInHeader ? false : rowCollapsedBase;
      if (
        isRowDisabledByExpandGate({
          ui,
          fields: expandGateFields,
          row: row as any,
          topValues: contextValues,
          lineItems,
          language,
          linePrefix: groupKey,
          rowCollapsed
        })
      ) {
        return;
      }
      hasAnyNonDisabledRow = true;
      eligibleRows.push(row as LineItemRowState);
      let rowValid = true;
      const groupCtx: VisibilityContext = {
        getValue: fid => {
          const virtual = resolveVirtual(fid);
          if (virtual !== undefined) return virtual;
          return (contextValues as any)[fid];
        },
        getLineValue: (_rowId, fid) => row.values[fid],
        getLineItems: groupId => lineItems[groupId] || [],
        getLineItemKeys: () => Object.keys(lineItems || {})
      };
      const getRowValue = (fieldId: string): FieldValue => {
        const virtual = resolveVirtual(fieldId);
        if (virtual !== undefined) return virtual;
        const localId = normalizeFieldId(fieldId);
        if (Object.prototype.hasOwnProperty.call(row.values || {}, localId)) return (row.values || {})[localId];
        if (Object.prototype.hasOwnProperty.call(row.values || {}, fieldId)) return (row.values || {})[fieldId];
        if (Object.prototype.hasOwnProperty.call(contextValues || {}, fieldId)) return (contextValues as any)[fieldId];
        if (Object.prototype.hasOwnProperty.call(contextValues || {}, localId)) return (contextValues as any)[localId];
        return (contextValues as any)[fieldId];
      };

      fields.forEach(field => {
        if (field.validationRules && field.validationRules.length) {
          const errs = validateRules(field.validationRules, {
            ...groupCtx,
            getValue: getRowValue,
            language,
            phase: 'submit',
            isHidden: (fieldId: string) => {
              const localId = normalizeFieldId(fieldId);
              const target = fields.find((f: any) => f?.id?.toString?.() === localId) as any;
              if (!target) return false;
              return shouldHideField(target.visibility, groupCtx, { rowId: row.id, linePrefix: groupKey });
            }
          } as any);
          errs.forEach(err => {
            const targetIdRaw = err?.fieldId !== undefined && err?.fieldId !== null ? err.fieldId.toString() : field.id;
            const targetId = normalizeFieldId(targetIdRaw);
            const key = fieldIdSet.has(targetId) ? `${groupKey}__${targetId}__${row.id}` : targetId;
            if (key) allErrors[key] = err.message;
          });
          if (errs.length) rowValid = false;
        }

        const hideField = shouldHideField(field.visibility, groupCtx, { rowId: row.id, linePrefix: groupKey });
        if (hideField) return;

        const requiredByConfig = !!field.required;
        const requireField = requiredByConfig || requireAllFields;

        if ((field as any).type === 'FILE_UPLOAD') {
          const fieldLabel = resolveFieldLabel(field, language, field.id);
          const msg = validateUploadCounts({
            value: row.values[field.id],
            uploadConfig: (field as any).uploadConfig,
            required: requireField,
            requiredMessage: (field as any).requiredMessage,
            language,
            fieldLabel
          });
          if (msg) {
            allErrors[`${groupKey}__${field.id}__${row.id}`] = msg;
            rowValid = false;
          } else if (requireField && countUploadItems(row.values[field.id]) === 0) {
            const custom = resolveLocalizedString((field as any)?.requiredMessage, language, '');
            allErrors[`${groupKey}__${field.id}__${row.id}`] = custom
              ? formatTemplate(custom, { field: fieldLabel })
              : tSystem('validation.fieldRequired', language, '{field} is required.', { field: fieldLabel });
            rowValid = false;
          }
        } else if (requireField) {
          const val = resolveRequiredValue(field, row.values[field.id]);
          const missing = requiredByConfig ? isEmptyValue(val as any) : isUnsetForStep(val as any);
          if (missing) {
            const fieldLabel = resolveFieldLabel(field, language, field.id);
            const custom = resolveLocalizedString((field as any)?.requiredMessage, language, '');
            allErrors[`${groupKey}__${field.id}__${row.id}`] = custom
              ? formatTemplate(custom, { field: fieldLabel })
              : tSystem('validation.fieldRequired', language, '{field} is required.', { field: fieldLabel });
            rowValid = false;
          }
        }
      });

      const subGroups = (groupCfg?.subGroups || []) as any[];
      if (subGroups.length) {
        const nextContext = { ...contextValues, ...(row.values || {}) };
        subGroups.forEach(sub => {
          const subId = resolveSubgroupKey(sub as any);
          if (!subId) return;
          const subKey = buildSubgroupKey(groupKey, row.id, subId);
          const subRows = lineItems[subKey] || [];
          const res = validateGroupRows({
            groupCfg: sub,
            groupKey: subKey,
            rows: subRows,
            contextValues: nextContext,
            rootGroupId,
            rowFilterOverrides
          });
          const subDedupRules = normalizeLineItemDedupRules((sub as any)?.dedupRules);
          applyLineItemDedupRules({
            groupId: subKey,
            rows: res.eligibleRows,
            rules: subDedupRules,
            buildFieldPath: (rowId: string, fieldId: string) => `${subKey}__${fieldId}__${rowId}`
          });
        });
      }

      if (rowValid) hasAnyValidEnabledRow = true;
    });

    const dedupRules = normalizeLineItemDedupRules((groupCfg as any)?.dedupRules);
    applyLineItemDedupRules({
      groupId: groupKey,
      rows: eligibleRows,
      rules: dedupRules,
      buildFieldPath: (rowId: string, fieldId: string) => `${groupKey}__${fieldId}__${rowId}`
    });

    return { eligibleRows, hasAnyRow, hasAnyNonDisabledRow, hasAnyValidEnabledRow };
  };

  definition.questions.forEach(q => {
    const questionHidden = shouldHideField(q.visibility, ctx);
    const requiredByConfig = !!(q as any).required;
    const requireField = requiredByConfig || requireAllFields;

    if (q.validationRules && q.validationRules.length) {
      const errs = validateRules(q.validationRules, { ...ctx, language, phase: 'submit', isHidden: () => questionHidden });
      errs.forEach(err => {
        allErrors[err.fieldId] = err.message;
      });
    }

    if (q.type === 'FILE_UPLOAD' && !questionHidden) {
      const fieldLabel = resolveFieldLabel(q as any, language, q.id);
      const msg = validateUploadCounts({
        value: values[q.id],
        uploadConfig: (q as any).uploadConfig,
        required: requireField,
        requiredMessage: (q as any).requiredMessage,
        language,
        fieldLabel
      });
      if (msg) {
        allErrors[q.id] = msg;
      } else if (requireField && countUploadItems(values[q.id]) === 0) {
        const custom = resolveLocalizedString((q as any)?.requiredMessage, language, '');
        allErrors[q.id] = custom
          ? formatTemplate(custom, { field: fieldLabel })
          : tSystem('validation.fieldRequired', language, '{field} is required.', { field: fieldLabel });
      }
    }

    if (q.type === 'LINE_ITEM_GROUP' && q.lineItemConfig?.fields) {
      const rows = lineItems[q.id] || [];
      const ui = (q.lineItemConfig as any)?.ui;
      const isProgressive =
        ui?.mode === 'progressive' && Array.isArray(ui?.collapsedFields) && (ui?.collapsedFields || []).length > 0;
      const expandGate = (ui?.expandGate || 'collapsedFieldsValid') as 'collapsedFieldsValid' | 'always';

      const result = validateGroupRows({
        groupCfg: q.lineItemConfig,
        groupKey: q.id,
        rows,
        contextValues: values,
        rootGroupId: q.id,
        rowFilterOverrides: stepRowFilters
      });

      // Required LINE_ITEM_GROUPs must have at least one enabled+valid row (disabled rows are ignored).
      if ((q as any).required && !questionHidden && !result.hasAnyValidEnabledRow) {
        allErrors[q.id] =
          isProgressive && expandGate === 'collapsedFieldsValid'
            ? !result.hasAnyRow || !result.hasAnyNonDisabledRow
              ? tSystem(
                  'validation.completeAtLeastOneRowFillCollapsed',
                  language,
                  'Complete at least one row (fill the collapsed fields).'
                )
              : tSystem('validation.completeAtLeastOneValidRow', language, 'Complete at least one valid row.')
            : tSystem('validation.atLeastOneLineItemRequired', language, 'At least one line item is required.');
      }
    } else if (requireField && q.type !== 'FILE_UPLOAD' && !questionHidden) {
      const requiredValue = resolveRequiredValue(q, values[q.id]);
      const missing = requiredByConfig ? isEmptyValue(requiredValue as any) : isUnsetForStep(requiredValue as any);
      if (!missing) return;
      const fieldLabel = resolveFieldLabel(q as any, language, q.id);
      const custom = resolveLocalizedString((q as any)?.requiredMessage, language, '');
      allErrors[q.id] = custom
        ? formatTemplate(custom, { field: fieldLabel })
        : tSystem('validation.fieldRequired', language, '{field} is required.', { field: fieldLabel });
    }
  });

  return allErrors;
};

export type WarningCollection = {
  top: Array<{ message: string; fieldPath: string }>;
  byField: Record<string, string[]>;
};

const normalizeWarningDisplay = (raw: any, fallback: 'top' | 'field' | 'both'): 'top' | 'field' | 'both' => {
  const s = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (!s) return fallback;
  if (s === 'field') return 'field';
  if (s === 'both') return 'both';
  if (s === 'top') return 'top';
  return fallback;
};

const normalizeWarningView = (raw: any): 'edit' | 'summary' | 'both' => {
  const s = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (s === 'edit' || s === 'form') return 'edit';
  if (s === 'summary') return 'summary';
  return 'both';
};

export const collectValidationWarnings = (args: {
  definition: WebFormDefinition;
  language: LangCode;
  values: Record<string, FieldValue>;
  lineItems: LineItemState;
  phase?: 'submit' | 'followup';
  uiView?: 'edit' | 'summary';
}): WarningCollection => {
  const { definition, language, values, lineItems, phase = 'submit', uiView } = args;
  const ctx = buildValidationContext(values, lineItems);
  const top: Array<{ message: string; fieldPath: string }> = [];
  const topSeen = new Set<string>();
  const byField: Record<string, string[]> = {};
  const fieldSeen: Record<string, Set<string>> = {};
  const allowWarning = (rawWarningView: any): boolean => {
    if (!uiView) return true;
    const view = normalizeWarningView(rawWarningView);
    return view === 'both' || view === uiView;
  };

  const pushTop = (fieldPath: string, msg: string) => {
    const fp = (fieldPath || '').toString();
    const m = (msg || '').toString().trim();
    if (!fp || !m) return;
    const k = `${fp}||${m}`;
    if (topSeen.has(k)) return;
    topSeen.add(k);
    top.push({ fieldPath: fp, message: m });
  };

  const pushField = (fieldPath: string, msg: string) => {
    const key = (fieldPath || '').toString();
    const m = (msg || '').toString().trim();
    if (!key || !m) return;
    if (!fieldSeen[key]) fieldSeen[key] = new Set<string>();
    if (fieldSeen[key].has(m)) return;
    fieldSeen[key].add(m);
    if (!byField[key]) byField[key] = [];
    byField[key].push(m);
  };

  const pushIssue = (fieldPath: string, msg: string, displayRaw: any) => {
    // UX: in edit view, default warnings should show inline AND in the top notice (unless explicitly overridden).
    const defaultDisplay: 'top' | 'field' | 'both' = uiView === 'edit' ? 'both' : 'top';
    const display = normalizeWarningDisplay(displayRaw, defaultDisplay);
    if (display === 'top' || display === 'both') pushTop(fieldPath, msg);
    if (display === 'field' || display === 'both') pushField(fieldPath, msg);
  };

  const warningRulesOnly = (rules: any[] | undefined | null): any[] =>
    (Array.isArray(rules) ? rules : []).filter(r => {
      const raw = r?.level;
      const s = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
      return s === 'warning' || s === 'warn';
    });

  definition.questions.forEach(q => {
    const questionHidden = shouldHideField(q.visibility, ctx);

    const qWarnRules = warningRulesOnly(q.validationRules);
    if (qWarnRules.length) {
      const issues = evaluateRules(qWarnRules as any, {
        ...ctx,
        language,
        phase,
        isHidden: (fieldId: string) => {
          const target = (definition.questions || []).find(qq => qq && qq.id === fieldId) as any;
          if (!target) return questionHidden;
          return shouldHideField(target.visibility, ctx);
        }
      } as any);
      issues
        .filter(i => (i as any)?.level === 'warning' && allowWarning((i as any)?.warningView))
        .forEach(i => pushIssue(i.fieldId, i.message, (i as any)?.warningDisplay));
    }

    if (q.type !== 'LINE_ITEM_GROUP' || !q.lineItemConfig?.fields) return;

    const rows = lineItems[q.id] || [];
    rows.forEach((row, idx) => {
      void idx;
      const groupCtx: VisibilityContext = {
        getValue: fid => values[fid],
        getLineValue: (_rowId, fid) => row.values[fid],
        getLineItems: groupId => lineItems[groupId] || [],
        getLineItemKeys: () => Object.keys(lineItems || {})
      };
      const getRowValue = (fieldId: string): FieldValue => {
        if (Object.prototype.hasOwnProperty.call(row.values || {}, fieldId)) return (row.values || {})[fieldId];
        return values[fieldId];
      };

      q.lineItemConfig?.fields.forEach(field => {
        const rules = warningRulesOnly(field.validationRules);
        if (!rules.length) return;
        const hideTarget = (fieldId: string): boolean => {
          const target = (q.lineItemConfig?.fields || []).find(f => f?.id === fieldId) as any;
          if (!target) return false;
          return shouldHideField(target.visibility, groupCtx, { rowId: row.id, linePrefix: q.id });
        };
        const issues = evaluateRules(rules as any, {
          ...groupCtx,
          getValue: getRowValue,
          language,
          phase,
          isHidden: (fieldId: string) => hideTarget(fieldId)
        } as any);
        if (!issues.length) return;
        const fieldIds = new Set<string>((q.lineItemConfig?.fields || []).map(f => (f?.id || '').toString()));
        issues
          .filter(i => (i as any)?.level === 'warning' && allowWarning((i as any)?.warningView))
          .forEach(i => {
            const targetId = (i.fieldId || '').toString();
            const fallbackId = (field?.id ?? '').toString();
            const resolvedId = fieldIds.has(targetId) ? targetId : fallbackId || targetId;
            const fieldPath = fieldIds.has(resolvedId) ? `${q.id}__${resolvedId}__${row.id}` : resolvedId;
            pushIssue(fieldPath, i.message, (i as any)?.warningDisplay);
          });
      });

      if (q.lineItemConfig?.subGroups?.length) {
        q.lineItemConfig.subGroups.forEach(sub => {
          const subId = resolveSubgroupKey(sub as any);
          if (!subId) return;
          const subKey = buildSubgroupKey(q.id, row.id, subId);
          const subRows = lineItems[subKey] || [];
          subRows.forEach((subRow, sIdx) => {
            void sIdx;
            const subCtx: VisibilityContext = {
              getValue: fid => values[fid],
              getLineValue: (_rowId, fid) => subRow.values[fid],
              getLineItems: groupId => lineItems[groupId] || [],
              getLineItemKeys: () => Object.keys(lineItems || {})
            };
            const getSubValue = (fieldId: string): FieldValue => {
              if (Object.prototype.hasOwnProperty.call(subRow.values || {}, fieldId)) return (subRow.values || {})[fieldId];
              if (Object.prototype.hasOwnProperty.call(row.values || {}, fieldId)) return (row.values || {})[fieldId];
              return values[fieldId];
            };
            (sub as any).fields?.forEach((field: any) => {
              const rules = warningRulesOnly(field.validationRules);
              if (!rules.length) return;
              const hideTarget = (fieldId: string): boolean => {
                const target = ((sub as any).fields || []).find((f: any) => f?.id === fieldId) as any;
                if (!target) return false;
                return shouldHideField(target.visibility, subCtx, { rowId: subRow.id, linePrefix: subKey });
              };
              const issues = evaluateRules(rules as any, {
                ...subCtx,
                getValue: getSubValue,
                language,
                phase,
                isHidden: (fieldId: string) => hideTarget(fieldId)
              } as any);
              if (!issues.length) return;
              const fieldIds = new Set<string>(((sub as any).fields || []).map((f: any) => (f?.id || '').toString()));
              issues
                .filter((i: any) => i?.level === 'warning' && allowWarning(i?.warningView))
                .forEach((i: any) => {
                  const targetId = (i.fieldId || '').toString();
                  const fallbackId = (field?.id ?? '').toString();
                  const resolvedId = fieldIds.has(targetId) ? targetId : fallbackId || targetId;
                  const fieldPath = fieldIds.has(resolvedId) ? `${subKey}__${resolvedId}__${subRow.id}` : resolvedId;
                  pushIssue(fieldPath, i.message, i?.warningDisplay);
                });
            });
          });
        });
      }
    });
  });

  return { top, byField };
};

const getClientDeviceInfo = (): string => {
  try {
    const nav: any = typeof globalThis !== 'undefined' ? (globalThis as any).navigator : undefined;
    if (!nav) return '';
    const info = {
      userAgent: nav.userAgent || '',
      platform: nav.platform || '',
      language: nav.language || '',
      languages: Array.isArray(nav.languages) ? nav.languages : [],
      vendor: nav.vendor || '',
      maxTouchPoints:
        nav.maxTouchPoints !== undefined && nav.maxTouchPoints !== null ? Number(nav.maxTouchPoints) : undefined
    };
    return JSON.stringify(info);
  } catch (_) {
    return '';
  }
};

export const buildSubmissionPayload = async (args: {
  definition: WebFormDefinition;
  formKey: string;
  language: LangCode;
  values: Record<string, FieldValue>;
  lineItems: LineItemState;
  existingRecordId?: string;
  collapsedRows?: Record<string, boolean>;
  collapsedSubgroups?: Record<string, boolean>;
}): Promise<SubmissionPayload> => {
  const { definition, formKey, language, values, lineItems, existingRecordId, collapsedRows } = args;
  const recomputed = applyValueMapsToForm(definition, values, lineItems, { mode: 'submit' });
  const payloadValues: Record<string, any> = { ...recomputed.values };

  for (const q of definition.questions) {
    if (q.type === 'FILE_UPLOAD') {
      const rawAny = recomputed.values[q.id] as any;
      payloadValues[q.id] = await buildMaybeFilePayload(rawAny, (q as any).uploadConfig?.maxFiles, (q as any).uploadConfig);
    }
  }

  for (const q of definition.questions.filter(q => q.type === 'LINE_ITEM_GROUP')) {
    const serializeGroupRows = async (args: {
      groupCfg: any;
      groupKey: string;
      rows: LineItemRowState[];
      contextValues: Record<string, FieldValue>;
    }): Promise<Record<string, any>[]> => {
      const { groupCfg, groupKey, rows, contextValues } = args;
      const ui = (groupCfg as any)?.ui;
      const isProgressive =
        ui?.mode === 'progressive' && Array.isArray(ui?.collapsedFields) && (ui?.collapsedFields || []).length > 0;
      const defaultCollapsed = ui?.defaultCollapsed !== undefined ? !!ui.defaultCollapsed : true;
      const saveDisabledRows = ui?.saveDisabledRows === true;
      const rowsToSave = saveDisabledRows
        ? rows
        : rows.filter(row => {
            const collapseKey = `${groupKey}::${row.id}`;
            const rowCollapsed = isProgressive ? (collapsedRows?.[collapseKey] ?? defaultCollapsed) : false;
            return !isRowDisabledByExpandGate({
              ui,
              fields: (groupCfg?.fields || []) as any[],
              row: row as any,
              topValues: contextValues,
              lineItems,
              language,
              linePrefix: groupKey,
              rowCollapsed
            });
          });

      const fields = (groupCfg?.fields || []) as any[];
      const fileFields = fields.filter((f: any) => f?.type === 'FILE_UPLOAD');
      const subGroups = (groupCfg?.subGroups || []) as any[];

      return Promise.all(
        rowsToSave.map(async row => {
          const base: Record<string, any> = { ...(row.values || {}), [ROW_ID_KEY]: row.id };
          delete base[CK_RECIPE_INGREDIENTS_DIRTY_KEY];

          for (const f of fileFields) {
            base[f.id] = await buildMaybeFilePayload(base[f.id], (f as any).uploadConfig?.maxFiles, (f as any).uploadConfig);
          }

          const nextContext = { ...contextValues, ...(row.values || {}) };
          for (const sub of subGroups) {
            const key = resolveSubgroupKey(sub as any);
            if (!key) continue;
            const childKey = buildSubgroupKey(groupKey, row.id, key);
            const childRows = recomputed.lineItems[childKey] || [];
            const childSerialized = await serializeGroupRows({
              groupCfg: sub,
              groupKey: childKey,
              rows: childRows,
              contextValues: nextContext
            });
            base[key] = childSerialized;
          }

          return base;
        })
      );
    };

    const rows = recomputed.lineItems[q.id] || [];
    const serialized = await serializeGroupRows({
      groupCfg: q.lineItemConfig,
      groupKey: q.id,
      rows,
      contextValues: recomputed.values
    });

    payloadValues[q.id] = serialized;
    payloadValues[`${q.id}_json`] = JSON.stringify(serialized);
  }

  const submission: SubmissionPayload = {
    formKey,
    language,
    values: payloadValues,
    ...payloadValues
  };
  (submission as any).__ckDeviceInfo = getClientDeviceInfo();

  if (existingRecordId) {
    submission.id = existingRecordId;
  }

  return submission;
};

const toUrlOnlyUploadString = (raw: any): string => {
  if (raw === undefined || raw === null) return '';
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw)) {
    const urls: string[] = [];
    raw.forEach(item => {
      if (!item) return;
      if (typeof item === 'string') {
        item
          .split(',')
          .map(p => p.trim())
          .filter(Boolean)
          .forEach(u => urls.push(u));
        return;
      }
      if (typeof item === 'object' && typeof (item as any).url === 'string') {
        const u = ((item as any).url as string).trim();
        if (u) urls.push(u);
      }
    });
    const seen = new Set<string>();
    const deduped = urls.filter(u => {
      if (!u) return false;
      if (seen.has(u)) return false;
      seen.add(u);
      return true;
    });
    return deduped.join(', ');
  }
  if (typeof raw === 'object' && typeof (raw as any).url === 'string') {
    return ((raw as any).url as string).trim();
  }
  return '';
};

/**
 * Build a "draft save" payload for autosave:
 * - No validation required.
 * - Does NOT convert Files to base64 payloads (so it won't upload files).
 * - Persists only URL/string values for FILE_UPLOAD fields.
 */
export const buildDraftPayload = (args: {
  definition: WebFormDefinition;
  formKey: string;
  language: LangCode;
  values: Record<string, FieldValue>;
  lineItems: LineItemState;
  existingRecordId?: string;
}): SubmissionPayload => {
  const { definition, formKey, language, values, lineItems, existingRecordId } = args;
  const recomputed = applyValueMapsToForm(definition, values, lineItems, { mode: 'change' });
  const payloadValues: Record<string, any> = { ...recomputed.values };

  // Sanitize top-level uploads
  for (const q of definition.questions) {
    if (q.type === 'FILE_UPLOAD') {
      payloadValues[q.id] = toUrlOnlyUploadString(recomputed.values[q.id]);
    }
  }

  // Serialize line item groups (and sanitize any nested FILE_UPLOAD fields to URL-only strings)
  for (const q of definition.questions.filter(q => q.type === 'LINE_ITEM_GROUP')) {
    const serializeGroupRows = (args: { groupCfg: any; groupKey: string; rows: LineItemRowState[] }): Record<string, any>[] => {
      const { groupCfg, groupKey, rows } = args;
      const fields = (groupCfg?.fields || []) as any[];
      const fileFields = fields.filter((f: any) => f?.type === 'FILE_UPLOAD');
      const subGroups = (groupCfg?.subGroups || []) as any[];

      return rows.map(row => {
        const base: Record<string, any> = { ...(row.values || {}), [ROW_ID_KEY]: row.id };
        delete base[CK_RECIPE_INGREDIENTS_DIRTY_KEY];
        fileFields.forEach((f: any) => {
          base[f.id] = toUrlOnlyUploadString(base[f.id]);
        });

        for (const sub of subGroups) {
          const key = resolveSubgroupKey(sub as any);
          if (!key) continue;
          const childKey = buildSubgroupKey(groupKey, row.id, key);
          const childRows = recomputed.lineItems[childKey] || [];
          base[key] = serializeGroupRows({ groupCfg: sub, groupKey: childKey, rows: childRows });
        }

        return base;
      });
    };

    const rows = recomputed.lineItems[q.id] || [];
    const serialized = serializeGroupRows({ groupCfg: q.lineItemConfig, groupKey: q.id, rows });
    payloadValues[q.id] = serialized;
    payloadValues[`${q.id}_json`] = JSON.stringify(serialized);
  }

  const submission: SubmissionPayload = {
    formKey,
    language,
    values: payloadValues,
    ...payloadValues
  };
  (submission as any).__ckDeviceInfo = getClientDeviceInfo();

  if (existingRecordId) {
    submission.id = existingRecordId;
  }

  return submission;
};

export const computeUrlOnlyUploadUpdates = (
  definition: WebFormDefinition,
  payloadValues: Record<string, any>
): Record<string, any> => {
  const isUrlOnlyUploadValue = (v: any): boolean => {
    if (v === undefined || v === null) return false;
    if (typeof v === 'string') return true;
    if (Array.isArray(v)) {
      return v.every(
        item =>
          typeof item === 'string' ||
          (item && typeof item === 'object' && typeof (item as any).url === 'string')
      );
    }
    if (v && typeof v === 'object' && typeof (v as any).url === 'string') return true;
    return false;
  };

  const fileUpdates: Record<string, any> = {};
  definition.questions
    .filter(q => q.type === 'FILE_UPLOAD')
    .forEach(q => {
      const next = payloadValues[q.id];
      // Avoid replacing selected Files with base64 payload objects during submit (keeps retry UX sane).
      if (isUrlOnlyUploadValue(next)) {
        fileUpdates[q.id] = next;
      }
    });

  return fileUpdates;
};

export const resolveExistingRecordId = (args: {
  selectedRecordId?: string;
  selectedRecordSnapshot?: WebFormSubmission | null;
  lastSubmissionMetaId?: string | null;
}): string | undefined => {
  const { selectedRecordId, selectedRecordSnapshot, lastSubmissionMetaId } = args;
  return selectedRecordId || selectedRecordSnapshot?.id || lastSubmissionMetaId || undefined;
};
