import { shouldHideField, validateRules } from '../../core';
import { FieldValue, LangCode, VisibilityContext, WebFormDefinition, WebFormSubmission } from '../../types';
import { SubmissionPayload } from '../api';
import { FormErrors, LineItemState } from '../types';
import { resolveFieldLabel } from '../utils/labels';
import { isEmptyValue } from '../utils/values';
import { buildMaybeFilePayload } from './filePayload';
import { buildSubgroupKey, resolveSubgroupKey } from './lineItems';
import { applyValueMapsToForm } from './valueMaps';
import { buildValidationContext } from './validation';

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

          if (field.required) {
            const hideField = shouldHideField(field.visibility, groupCtx, { rowId: row.id, linePrefix: q.id });
            if (hideField) return;
            const val = row.values[field.id];
            if (isEmptyValue(val as any)) {
              allErrors[`${q.id}__${field.id}__${row.id}`] = resolveFieldLabel(field, language, 'Required') + ' is required';
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

                if (field.required) {
                  const hide = shouldHideField(field.visibility, subCtx, { rowId: subRow.id, linePrefix: subKey });
                  if (hide) return;
                  const val = subRow.values[field.id];
                  if (isEmptyValue(val as any)) {
                    allErrors[`${subKey}__${field.id}__${subRow.id}`] =
                      resolveFieldLabel(field, language, 'Required') + ' is required';
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
              ? 'Complete at least one row (fill the collapsed fields).'
              : 'Complete at least one valid row.'
            : 'At least one line item is required.';
      }
    } else if ((q as any).required && !questionHidden && isEmptyValue(values[q.id])) {
      allErrors[q.id] = 'This field is required.';
    }
  });

  return allErrors;
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
      payloadValues[q.id] = await buildMaybeFilePayload(rawAny, (q as any).uploadConfig?.maxFiles);
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
          base[f.id] = await buildMaybeFilePayload(base[f.id], (f as any).uploadConfig?.maxFiles);
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
                child[f.id] = await buildMaybeFilePayload(child[f.id], (f as any).uploadConfig?.maxFiles);
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


