import { evaluateRules, shouldHideField, validateRules } from '../../core';
import { FieldValue, LangCode, VisibilityContext, WebFormDefinition, WebFormSubmission } from '../../types';
import { SubmissionPayload } from '../api';
import { FormErrors, LineItemState } from '../types';
import { resolveFieldLabel } from '../utils/labels';
import { isEmptyValue } from '../utils/values';
import { tSystem } from '../../systemStrings';
import { resolveLocalizedString } from '../../i18n';
import { buildMaybeFilePayload } from './filePayload';
import { buildSubgroupKey, resolveSubgroupKey } from './lineItems';
import { applyValueMapsToForm } from './valueMaps';
import { buildValidationContext } from './validation';

const formatTemplate = (value: string, vars?: Record<string, string | number | boolean | null | undefined>): string => {
  if (!vars) return value;
  return value.replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, key) => {
    const raw = (vars as any)[key];
    return raw === undefined || raw === null ? '' : String(raw);
  });
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

const validateUploadCounts = (args: {
  value: any;
  uploadConfig?: any;
  required?: boolean;
  language: LangCode;
  fieldLabel: string;
}): string => {
  const { value, uploadConfig, required, language, fieldLabel } = args;
  const count = countUploadItems(value);
  const minCfg = uploadConfig?.minFiles;
  const min = minCfg !== undefined && minCfg !== null ? Number(minCfg) : required ? 1 : undefined;
  const maxCfg = uploadConfig?.maxFiles;
  const max = maxCfg !== undefined && maxCfg !== null ? Number(maxCfg) : undefined;

  if (min !== undefined && Number.isFinite(min) && min > 0 && count < min) {
    return resolveUploadErrorMessage({
      uploadConfig,
      language,
      kind: 'minFiles',
      fallback: '{field} requires at least {min} file{plural}.',
      vars: { field: fieldLabel, min, plural: min > 1 ? 's' : '' }
    });
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
  language: LangCode;
  linePrefix: string;
  rowCollapsed: boolean;
}): boolean => {
  const { ui, fields, row, topValues, language, linePrefix, rowCollapsed } = args;
  const isProgressive = ui?.mode === 'progressive' && Array.isArray(ui?.collapsedFields) && (ui?.collapsedFields || []).length > 0;
  const expandGate = (ui?.expandGate || 'collapsedFieldsValid') as 'collapsedFieldsValid' | 'always';
  const collapsedFieldConfigs = isProgressive ? (ui?.collapsedFields || []) : [];
  if (!isProgressive) return false;
  if (expandGate === 'always') return false;
  if (!collapsedFieldConfigs.length) return false;
  if (!rowCollapsed) return false; // Only treat a row as "disabled" when it is actually collapsed in the UI.

  const groupCtx: VisibilityContext = {
    getValue: fid => topValues[fid],
    getLineValue: (_rowId, fid) => (row?.values || {})[fid]
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

    const val = (row?.values || {})[field.id];
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
}): FormErrors => {
  const { definition, language, values, lineItems, collapsedRows } = args;
  const ctx = buildValidationContext(values, lineItems);
  const allErrors: FormErrors = {};

  definition.questions.forEach(q => {
    const questionHidden = shouldHideField(q.visibility, ctx);

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
        required: !!(q as any).required,
        language,
        fieldLabel
      });
      if (msg) {
        allErrors[q.id] = msg;
      }
    }

    if (q.type === 'LINE_ITEM_GROUP' && q.lineItemConfig?.fields) {
      const rows = lineItems[q.id] || [];
      const ui = (q.lineItemConfig as any)?.ui;
      const isProgressive =
        ui?.mode === 'progressive' && Array.isArray(ui?.collapsedFields) && (ui?.collapsedFields || []).length > 0;
      const expandGate = (ui?.expandGate || 'collapsedFieldsValid') as 'collapsedFieldsValid' | 'always';
      const defaultCollapsed = ui?.defaultCollapsed !== undefined ? !!ui.defaultCollapsed : true;

      let hasAtLeastOneValidEnabledRow = false;
      let hasAnyRow = false;
      let hasAnyNonDisabledRow = false;

      rows.forEach(row => {
        hasAnyRow = true;
        const collapseKey = `${q.id}::${row.id}`;
        const rowCollapsed = isProgressive ? (collapsedRows?.[collapseKey] ?? defaultCollapsed) : false;
        // Skip "disabled" rows: collapsed + progressive + expandGate=collapsedFieldsValid where collapsed fields aren't valid yet.
        if (
          isRowDisabledByExpandGate({
            ui,
            fields: q.lineItemConfig?.fields || [],
            row: row as any,
            topValues: values,
            language,
            linePrefix: q.id,
            rowCollapsed
          })
        ) {
          return;
        }
        hasAnyNonDisabledRow = true;
        let rowValid = true;
        const groupCtx: VisibilityContext = {
          getValue: fid => values[fid],
          getLineValue: (_rowId, fid) => row.values[fid]
        };
        const getRowValue = (fieldId: string): FieldValue => {
          if (Object.prototype.hasOwnProperty.call(row.values || {}, fieldId)) return (row.values || {})[fieldId];
          return values[fieldId];
        };

        q.lineItemConfig?.fields.forEach(field => {
          if (field.validationRules && field.validationRules.length) {
            const errs = validateRules(field.validationRules, {
              ...groupCtx,
              getValue: getRowValue,
              language,
              phase: 'submit',
              isHidden: () => shouldHideField(field.visibility, groupCtx, { rowId: row.id, linePrefix: q.id })
            } as any);
            errs.forEach(err => {
              allErrors[`${q.id}__${field.id}__${row.id}`] = err.message;
            });
            if (errs.length) rowValid = false;
          }

          const hideField = shouldHideField(field.visibility, groupCtx, { rowId: row.id, linePrefix: q.id });
          if (hideField) return;

          if ((field as any).type === 'FILE_UPLOAD') {
            const fieldLabel = resolveFieldLabel(field, language, field.id);
            const msg = validateUploadCounts({
              value: row.values[field.id],
              uploadConfig: (field as any).uploadConfig,
              required: !!field.required,
              language,
              fieldLabel
            });
            if (msg) {
              allErrors[`${q.id}__${field.id}__${row.id}`] = msg;
              rowValid = false;
            }
          } else if (field.required) {
            const val = row.values[field.id];
            if (isEmptyValue(val as any)) {
              const fieldLabel = resolveFieldLabel(field, language, field.id);
              allErrors[`${q.id}__${field.id}__${row.id}`] = tSystem(
                'validation.fieldRequired',
                language,
                '{field} is required.',
                { field: fieldLabel }
              );
              rowValid = false;
            }
          }
        });

        // validate subgroups, if any
        if (q.lineItemConfig?.subGroups?.length) {
          q.lineItemConfig.subGroups.forEach(sub => {
            const subId = resolveSubgroupKey(sub as any);
            if (!subId) return;
            const subKey = buildSubgroupKey(q.id, row.id, subId);
            const subRows = lineItems[subKey] || [];
            const subUi = (sub as any)?.ui;
            const isSubProgressive =
              subUi?.mode === 'progressive' &&
              Array.isArray(subUi?.collapsedFields) &&
              (subUi?.collapsedFields || []).length > 0;
            const subDefaultCollapsed = subUi?.defaultCollapsed !== undefined ? !!subUi.defaultCollapsed : true;
            subRows.forEach(subRow => {
              const subCollapseKey = `${subKey}::${subRow.id}`;
              const subRowCollapsed = isSubProgressive ? (collapsedRows?.[subCollapseKey] ?? subDefaultCollapsed) : false;
              // Skip disabled subgroup rows only when they are collapsed and gated.
              if (
                isRowDisabledByExpandGate({
                  ui: subUi,
                  fields: (sub as any).fields || [],
                  row: subRow as any,
                  topValues: { ...values, ...(row.values || {}) },
                  language,
                  linePrefix: subKey,
                  rowCollapsed: subRowCollapsed
                })
              ) {
                return;
              }
              const subCtx: VisibilityContext = {
                getValue: fid => values[fid],
                getLineValue: (_rowId, fid) => subRow.values[fid]
              };
              const getSubValue = (fieldId: string): FieldValue => {
                if (Object.prototype.hasOwnProperty.call(subRow.values || {}, fieldId)) return (subRow.values || {})[fieldId];
                if (Object.prototype.hasOwnProperty.call(row.values || {}, fieldId)) return (row.values || {})[fieldId];
                return values[fieldId];
              };
              (sub as any).fields?.forEach((field: any) => {
                if (field.validationRules && field.validationRules.length) {
                  const errs = validateRules(field.validationRules, {
                    ...subCtx,
                    getValue: getSubValue,
                    language,
                    phase: 'submit',
                    isHidden: () => shouldHideField(field.visibility, subCtx, { rowId: subRow.id, linePrefix: subKey })
                  } as any);
                  errs.forEach(err => {
                    allErrors[`${subKey}__${field.id}__${subRow.id}`] = err.message;
                  });
                  if (errs.length) rowValid = false;
                }

                const hide = shouldHideField(field.visibility, subCtx, { rowId: subRow.id, linePrefix: subKey });
                if (hide) return;

                if ((field as any).type === 'FILE_UPLOAD') {
                  const fieldLabel = resolveFieldLabel(field, language, field.id);
                  const msg = validateUploadCounts({
                    value: subRow.values[field.id],
                    uploadConfig: (field as any).uploadConfig,
                    required: !!field.required,
                    language,
                    fieldLabel
                  });
                  if (msg) {
                    allErrors[`${subKey}__${field.id}__${subRow.id}`] = msg;
                    rowValid = false;
                  }
                } else if (field.required) {
                  const val = subRow.values[field.id];
                  if (isEmptyValue(val as any)) {
                    const fieldLabel = resolveFieldLabel(field, language, field.id);
                    allErrors[`${subKey}__${field.id}__${subRow.id}`] = tSystem(
                      'validation.fieldRequired',
                      language,
                      '{field} is required.',
                      { field: fieldLabel }
                    );
                    rowValid = false;
                  }
                }
              });
            });
          });
        }

        if (rowValid) hasAtLeastOneValidEnabledRow = true;
      });

      // Required LINE_ITEM_GROUPs must have at least one enabled+valid row (disabled rows are ignored).
      if ((q as any).required && !questionHidden && !hasAtLeastOneValidEnabledRow) {
        allErrors[q.id] =
          isProgressive && expandGate === 'collapsedFieldsValid'
            ? !hasAnyRow || !hasAnyNonDisabledRow
              ? tSystem(
                  'validation.completeAtLeastOneRowFillCollapsed',
                  language,
                  'Complete at least one row (fill the collapsed fields).'
                )
              : tSystem('validation.completeAtLeastOneValidRow', language, 'Complete at least one valid row.')
            : tSystem('validation.atLeastOneLineItemRequired', language, 'At least one line item is required.');
      }
    } else if ((q as any).required && q.type !== 'FILE_UPLOAD' && !questionHidden && isEmptyValue(values[q.id])) {
      allErrors[q.id] = tSystem('validation.thisFieldRequired', language, 'This field is required.');
    }
  });

  return allErrors;
};

export type WarningCollection = {
  top: Array<{ message: string; fieldPath: string }>;
  byField: Record<string, string[]>;
};

const normalizeWarningDisplay = (raw: any): 'top' | 'field' | 'both' => {
  const s = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (s === 'field') return 'field';
  if (s === 'both') return 'both';
  return 'top';
};

export const collectValidationWarnings = (args: {
  definition: WebFormDefinition;
  language: LangCode;
  values: Record<string, FieldValue>;
  lineItems: LineItemState;
  phase?: 'submit' | 'followup';
}): WarningCollection => {
  const { definition, language, values, lineItems, phase = 'submit' } = args;
  const ctx = buildValidationContext(values, lineItems);
  const top: Array<{ message: string; fieldPath: string }> = [];
  const topSeen = new Set<string>();
  const byField: Record<string, string[]> = {};
  const fieldSeen: Record<string, Set<string>> = {};

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
    const display = normalizeWarningDisplay(displayRaw);
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
        .filter(i => (i as any)?.level === 'warning')
        .forEach(i => pushIssue(i.fieldId, i.message, (i as any)?.warningDisplay));
    }

    if (q.type !== 'LINE_ITEM_GROUP' || !q.lineItemConfig?.fields) return;

    const rows = lineItems[q.id] || [];
    rows.forEach((row, idx) => {
      void idx;
      const groupCtx: VisibilityContext = {
        getValue: fid => values[fid],
        getLineValue: (_rowId, fid) => row.values[fid]
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
          .filter(i => (i as any)?.level === 'warning')
          .forEach(i => {
            const targetId = (i.fieldId || '').toString();
            const fieldPath = fieldIds.has(targetId) ? `${q.id}__${targetId}__${row.id}` : targetId;
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
              getLineValue: (_rowId, fid) => subRow.values[fid]
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
                .filter((i: any) => i?.level === 'warning')
                .forEach((i: any) => {
                  const targetId = (i.fieldId || '').toString();
                  const fieldPath = fieldIds.has(targetId) ? `${subKey}__${targetId}__${subRow.id}` : targetId;
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
    const rows = recomputed.lineItems[q.id] || [];
    const ui = (q.lineItemConfig as any)?.ui;
    const isProgressive =
      ui?.mode === 'progressive' && Array.isArray(ui?.collapsedFields) && (ui?.collapsedFields || []).length > 0;
    const defaultCollapsed = ui?.defaultCollapsed !== undefined ? !!ui.defaultCollapsed : true;
    // Do not persist "disabled" rows: collapsed + progressive + expandGate=collapsedFieldsValid where collapsed fields aren't valid yet.
    const rowsToSave = rows.filter(row => {
      const collapseKey = `${q.id}::${row.id}`;
      const rowCollapsed = isProgressive ? (collapsedRows?.[collapseKey] ?? defaultCollapsed) : false;
      return !isRowDisabledByExpandGate({
        ui,
        fields: q.lineItemConfig?.fields || [],
        row: row as any,
        topValues: recomputed.values,
        language,
        linePrefix: q.id,
        rowCollapsed
      });
    });
    const lineFields = q.lineItemConfig?.fields || [];
    const lineFileFields = lineFields.filter(f => (f as any).type === 'FILE_UPLOAD');
    const subGroups = q.lineItemConfig?.subGroups || [];

    const serialized = await Promise.all(
      rowsToSave.map(async row => {
        const base: Record<string, any> = { ...(row.values || {}) };

        for (const f of lineFileFields) {
          base[f.id] = await buildMaybeFilePayload(base[f.id], (f as any).uploadConfig?.maxFiles, (f as any).uploadConfig);
        }

        for (const sub of subGroups) {
          const key = resolveSubgroupKey(sub as any);
          if (!key) continue;
          const childKey = buildSubgroupKey(q.id, row.id, key);
          const childRows = recomputed.lineItems[childKey] || [];
          const subUi = (sub as any)?.ui;
          const isSubProgressive =
            subUi?.mode === 'progressive' &&
            Array.isArray(subUi?.collapsedFields) &&
            (subUi?.collapsedFields || []).length > 0;
          const subDefaultCollapsed = subUi?.defaultCollapsed !== undefined ? !!subUi.defaultCollapsed : true;
          const subRowsToSave = childRows.filter(cr => {
            const subCollapseKey = `${childKey}::${cr.id}`;
            const subRowCollapsed = isSubProgressive ? (collapsedRows?.[subCollapseKey] ?? subDefaultCollapsed) : false;
            return !isRowDisabledByExpandGate({
              ui: subUi,
              fields: (sub as any).fields || [],
              row: cr as any,
              topValues: { ...(recomputed.values || {}), ...(row.values || {}) },
              language,
              linePrefix: childKey,
              rowCollapsed: subRowCollapsed
            });
          });
          const subFields = (sub as any).fields || [];
          const subFileFields = subFields.filter((f: any) => f?.type === 'FILE_UPLOAD');
          base[key] = await Promise.all(
            subRowsToSave.map(async cr => {
              const child: Record<string, any> = { ...(cr.values || {}) };
              for (const f of subFileFields) {
                child[f.id] = await buildMaybeFilePayload(child[f.id], (f as any).uploadConfig?.maxFiles, (f as any).uploadConfig);
              }
              return child;
            })
          );
        }

        return base;
      })
    );

    payloadValues[q.id] = serialized;
    payloadValues[`${q.id}_json`] = JSON.stringify(serialized);
  }

  const submission: SubmissionPayload = {
    formKey,
    language,
    values: payloadValues,
    ...payloadValues
  };

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
    const rows = recomputed.lineItems[q.id] || [];
    const lineFields = q.lineItemConfig?.fields || [];
    const lineFileFields = lineFields.filter(f => (f as any).type === 'FILE_UPLOAD');
    const subGroups = q.lineItemConfig?.subGroups || [];

    const serialized = rows.map(row => {
      const base: Record<string, any> = { ...(row.values || {}) };
      lineFileFields.forEach(f => {
        base[f.id] = toUrlOnlyUploadString(base[f.id]);
      });

      for (const sub of subGroups) {
        const key = resolveSubgroupKey(sub as any);
        if (!key) continue;
        const childKey = buildSubgroupKey(q.id, row.id, key);
        const childRows = recomputed.lineItems[childKey] || [];
        const subFields = (sub as any).fields || [];
        const subFileFields = subFields.filter((f: any) => f?.type === 'FILE_UPLOAD');
        base[key] = childRows.map(cr => {
          const child: Record<string, any> = { ...(cr.values || {}) };
          subFileFields.forEach((f: any) => {
            child[f.id] = toUrlOnlyUploadString(child[f.id]);
          });
          return child;
        });
      }

      return base;
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


