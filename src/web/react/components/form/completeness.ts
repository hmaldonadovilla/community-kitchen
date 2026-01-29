import { shouldHideField, toOptionSet, validateRules } from '../../../core';
import { FieldValue, LangCode, VisibilityContext } from '../../../types';
import { LineItemState } from '../../types';
import { isEmptyValue } from '../../utils/values';
import { buildSubgroupKey, resolveSubgroupKey } from '../../app/lineItems';
import { resolveParagraphUserText } from '../../app/paragraphDisclaimer';
import { resolveValueMapValue } from './valueMaps';
import { isUploadValueComplete } from './utils';

const resolveRequiredValue = (field: any, rawValue: FieldValue): FieldValue => {
  if (!field || field?.type !== 'PARAGRAPH') return rawValue;
  const cfg = (field?.ui as any)?.paragraphDisclaimer;
  if (!cfg) return rawValue;
  return resolveParagraphUserText({ rawValue, config: cfg });
};

/**
 * Pure helper for UI progress/completeness: determine whether a LINE_ITEM_GROUP question should be
 * treated as "complete" for group pills / auto-collapse.
 *
 * Key behavior: progressive + expandGate disabled rows (collapsed + collapsedFields invalid) are ignored.
 */
export function isLineItemGroupQuestionComplete(args: {
  groupId: string;
  lineItemConfig: any;
  values: Record<string, FieldValue>;
  lineItems: LineItemState;
  collapsedRows?: Record<string, boolean>;
  language: LangCode;
  getTopValue: (fieldId: string) => FieldValue | undefined;
}): boolean {
  const { groupId, lineItemConfig, values, lineItems, collapsedRows, language, getTopValue } = args;
  const rows = (lineItems[groupId] || []) as any[];
  if (!rows.length) return false;

  const ui = lineItemConfig?.ui as any;
  const lineFields = (lineItemConfig?.fields || []) as any[];
  const subGroups = (lineItemConfig?.subGroups || []) as any[];

  const isProgressive =
    ui?.mode === 'progressive' && Array.isArray(ui?.collapsedFields) && (ui?.collapsedFields || []).length > 0;
  const expandGate = (ui?.expandGate || 'collapsedFieldsValid') as 'collapsedFieldsValid' | 'always';
  const defaultCollapsed = ui?.defaultCollapsed !== undefined ? !!ui.defaultCollapsed : true;
  const collapsedFieldConfigs = isProgressive ? (ui?.collapsedFields || []) : [];

  const isRowDisabledByExpandGate = (row: any, rowCollapsed: boolean): boolean => {
    if (!isProgressive) return false;
    if (expandGate === 'always') return false;
    if (!collapsedFieldConfigs.length) return false;
    if (!rowCollapsed) return false; // Only treat a row as "disabled" when it is actually collapsed.

    const groupCtx: VisibilityContext = {
      getValue: fid => getTopValue(fid),
      getLineValue: (_rowId, fid) => (row?.values || {})[fid],
      getLineItems: groupId => lineItems[groupId] || [],
      getLineItemKeys: () => Object.keys(lineItems || {})
    };

    const isHidden = (fieldId: string) => {
      const target = (lineFields || []).find((f: any) => f?.id === fieldId) as any;
      if (!target) return false;
      return shouldHideField(target.visibility, groupCtx, { rowId: row?.id, linePrefix: groupId });
    };

    const blocked: string[] = [];
    (collapsedFieldConfigs || []).forEach((cfg: any) => {
      const fid = cfg?.fieldId ? cfg.fieldId.toString() : '';
      if (!fid) return;
      const field = (lineFields || []).find((f: any) => f?.id === fid) as any;
      if (!field) return;

      const hideField = shouldHideField(field.visibility, groupCtx, { rowId: row?.id, linePrefix: groupId });
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
          Object.prototype.hasOwnProperty.call(row?.values || {}, fieldId) ? (row?.values || {})[fieldId] : values[fieldId],
        language,
        phase: 'submit',
        isHidden
      };
      const errs = validateRules(rules, rulesCtx);
      if (errs.length) blocked.push(field.id);
    });

    return Array.from(new Set(blocked)).length > 0;
  };

  const isRequiredFieldFilled = (field: any, raw: any): boolean => {
    if (field.type === 'FILE_UPLOAD') {
      return isUploadValueComplete({
        value: raw as any,
        uploadConfig: field.uploadConfig,
        required: true
      });
    }
    return !isEmptyValue(resolveRequiredValue(field, raw) as any);
  };

  let hasAnyEnabledRow = false;

  for (const row of rows) {
    const rowValues = (row as any)?.values || {};
    const collapseKey = `${groupId}::${row.id}`;
    const rowCollapsed = isProgressive ? (collapsedRows?.[collapseKey] ?? defaultCollapsed) : false;
    if (isRowDisabledByExpandGate(row, rowCollapsed)) {
      continue;
    }
    hasAnyEnabledRow = true;

    const groupCtx: VisibilityContext = {
      getValue: fid => getTopValue(fid),
      getLineValue: (_rowId, fid) => rowValues[fid],
      getLineItems: groupId => lineItems[groupId] || [],
      getLineItemKeys: () => Object.keys(lineItems || {})
    };

    for (const field of lineFields) {
      if (!field?.required) continue;
      const hideField = shouldHideField(field.visibility, groupCtx, { rowId: row.id, linePrefix: groupId });
      if (hideField) continue;
      const mapped = field.valueMap
        ? resolveValueMapValue(
            field.valueMap,
            (fid: string) => {
              if (Object.prototype.hasOwnProperty.call(rowValues || {}, fid)) return (rowValues as any)[fid];
              return getTopValue(fid);
            },
            { language, targetOptions: toOptionSet(field as any) }
          )
        : undefined;
      const raw = field.valueMap ? mapped : (rowValues as any)[field.id];
      if (!isRequiredFieldFilled(field, raw)) return false;
    }

    for (const sub of subGroups) {
      const subId = resolveSubgroupKey(sub as any);
      if (!subId) continue;
      const subKey = buildSubgroupKey(groupId, row.id, subId);
      const subRows = (lineItems[subKey] || []) as any[];
      if (!subRows.length) continue;
      const subFields = ((sub as any).fields || []) as any[];
      const subUi = (sub as any)?.ui as any;
      const isSubProgressive =
        subUi?.mode === 'progressive' && Array.isArray(subUi?.collapsedFields) && (subUi?.collapsedFields || []).length > 0;
      const subDefaultCollapsed = subUi?.defaultCollapsed !== undefined ? !!subUi.defaultCollapsed : true;

      for (const subRow of subRows) {
        const subCollapseKey = `${subKey}::${subRow.id}`;
        const subRowCollapsed = isSubProgressive ? (collapsedRows?.[subCollapseKey] ?? subDefaultCollapsed) : false;
        // Reuse the same expandGate behavior for subgroup rows.
        const subRowDisabled = (() => {
          const subCfg = { ui: subUi, fields: subFields };
          const subIsProgressive =
            subCfg.ui?.mode === 'progressive' &&
            Array.isArray(subCfg.ui?.collapsedFields) &&
            (subCfg.ui?.collapsedFields || []).length > 0;
          const subExpandGate = (subCfg.ui?.expandGate || 'collapsedFieldsValid') as 'collapsedFieldsValid' | 'always';
          const subCollapsedFieldConfigs = subIsProgressive ? (subCfg.ui?.collapsedFields || []) : [];
          if (!subIsProgressive) return false;
          if (subExpandGate === 'always') return false;
          if (!subCollapsedFieldConfigs.length) return false;
          if (!subRowCollapsed) return false;

          const subCtx: VisibilityContext = {
            getValue: fid => getTopValue(fid),
            getLineValue: (_rowId, fid) => (subRow?.values || {})[fid],
            getLineItems: groupId => lineItems[groupId] || [],
            getLineItemKeys: () => Object.keys(lineItems || {})
          };
          const isHidden = (fieldId: string) => {
            const target = (subFields || []).find((f: any) => f?.id === fieldId) as any;
            if (!target) return false;
            return shouldHideField(target.visibility, subCtx, { rowId: subRow?.id, linePrefix: subKey });
          };

          const blocked: string[] = [];
          (subCollapsedFieldConfigs || []).forEach((cfg: any) => {
            const fid = cfg?.fieldId ? cfg.fieldId.toString() : '';
            if (!fid) return;
            const field = (subFields || []).find((f: any) => f?.id === fid) as any;
            if (!field) return;
            const hideField = shouldHideField(field.visibility, subCtx, { rowId: subRow?.id, linePrefix: subKey });
            if (hideField) return;
            const val = resolveRequiredValue(field, (subRow?.values || {})[field.id]);
            if (field.required && isEmptyValue(val as any)) {
              blocked.push(field.id);
              return;
            }
            const rules = Array.isArray(field.validationRules)
              ? field.validationRules.filter((r: any) => r?.then?.fieldId === field.id)
              : [];
            if (!rules.length) return;
            const rulesCtx: any = {
              ...subCtx,
              getValue: (fieldId: string) => {
                if (Object.prototype.hasOwnProperty.call(subRow?.values || {}, fieldId)) return (subRow?.values || {})[fieldId];
                if (Object.prototype.hasOwnProperty.call(rowValues || {}, fieldId)) return (rowValues as any)[fieldId];
                return values[fieldId];
              },
              language,
              phase: 'submit',
              isHidden
            };
            const errs = validateRules(rules, rulesCtx);
            if (errs.length) blocked.push(field.id);
          });

          return Array.from(new Set(blocked)).length > 0;
        })();

        if (subRowDisabled) continue;

        const subRowValues = (subRow as any)?.values || {};
        const subCtx: VisibilityContext = {
          getValue: (fid: string) => {
            if (Object.prototype.hasOwnProperty.call(subRowValues || {}, fid)) return (subRowValues as any)[fid];
            if (Object.prototype.hasOwnProperty.call(rowValues || {}, fid)) return (rowValues as any)[fid];
            return getTopValue(fid);
          },
          getLineValue: (_rowId, fid) => subRowValues[fid],
          getLineItems: groupId => lineItems[groupId] || [],
          getLineItemKeys: () => Object.keys(lineItems || {})
        };

        for (const field of subFields) {
          if (!field?.required) continue;
          const hide = shouldHideField(field.visibility, subCtx, { rowId: subRow.id, linePrefix: subKey });
          if (hide) continue;
          const mapped = field.valueMap
            ? resolveValueMapValue(
                field.valueMap,
                (fid: string) => {
                  if (Object.prototype.hasOwnProperty.call(subRowValues || {}, fid)) return (subRowValues as any)[fid];
                  if (Object.prototype.hasOwnProperty.call(rowValues || {}, fid)) return (rowValues as any)[fid];
                  return getTopValue(fid);
                },
                { language, targetOptions: toOptionSet(field as any) }
              )
            : undefined;
          const raw = field.valueMap ? mapped : (subRowValues as any)[field.id];
          if (!isRequiredFieldFilled(field, raw)) return false;
        }
      }
    }
  }

  return hasAnyEnabledRow;
}
