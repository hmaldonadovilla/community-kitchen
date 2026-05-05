import { shouldHideField } from '../../../../core';
import { resolveLocalizedString } from '../../../../i18n';
import type {
  FieldValue,
  LangCode,
  LineItemDedupRule,
  LineItemFieldConfig,
  VisibilityContext,
  WebQuestionDefinition
} from '../../../../types';
import { resolveParagraphUserText } from '../../../app/paragraphDisclaimer';
import { formatLineItemDedupValue, resolveSubgroupKey } from '../../../app/lineItems';
import { isEmptyValue } from '../../../utils/values';

const LINE_ITEM_DEDUP_DEFAULT_MESSAGE = {
  en: 'This entry already exists in this list.',
  fr: 'Cette entrée existe déjà dans cette liste.',
  nl: 'Deze invoer bestaat al in deze lijst.'
};

const formatTemplate = (value: string, vars?: Record<string, string | number | boolean | null | undefined>): string => {
  if (!vars) return value;
  return value.replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, key) => {
    const raw = (vars as any)[key];
    return raw === undefined || raw === null ? '' : String(raw);
  });
};

export const hasSelectionEffects = (field: any): boolean =>
  Array.isArray(field?.selectionEffects) && field.selectionEffects.length > 0;

export const areFieldValuesEqual = (a: FieldValue, b: FieldValue): boolean => {
  if (a === b) return true;
  const arrayA = Array.isArray(a) ? a : null;
  const arrayB = Array.isArray(b) ? b : null;
  if (arrayA || arrayB) {
    const arrA = arrayA || [];
    const arrB = arrayB || [];
    if (arrA.length !== arrB.length) return false;
    return arrA.every((val, idx) => val === arrB[idx]);
  }
  if (typeof a === 'object' || typeof b === 'object') {
    if (!a || !b) return false;
    try {
      return JSON.stringify(a) === JSON.stringify(b);
    } catch {
      return false;
    }
  }
  return false;
};

export const parseLineFieldPath = (
  fieldPath: string
): { groupId: string; fieldId: string; rowId: string } | null => {
  const raw = (fieldPath || '').toString().trim();
  if (!raw || !raw.includes('__')) return null;
  const parts = raw.split('__');
  if (parts.length < 3) return null;
  const [groupId, fieldId, rowId] = parts;
  if (!groupId || !fieldId || !rowId) return null;
  return { groupId, fieldId, rowId };
};

export const resolveRequiredValue = (field: any, rawValue: FieldValue): FieldValue => {
  if (!field || field?.type !== 'PARAGRAPH') return rawValue;
  const cfg = (field?.ui as any)?.paragraphDisclaimer;
  if (!cfg) return rawValue;
  return resolveParagraphUserText({ rawValue, config: cfg });
};

export const resolveOverlayHeaderFields = (groupCfg: any, overlayDetail: any): LineItemFieldConfig[] => {
  if (!groupCfg) return [];
  const headerColumnsExplicit = Array.isArray(overlayDetail?.header?.tableColumns);
  const raw = headerColumnsExplicit ? overlayDetail.header.tableColumns : [];
  const fallback = Array.isArray(groupCfg?.ui?.tableColumns) ? groupCfg.ui.tableColumns : [];
  const ids = raw
    .map((id: any) => (id !== undefined && id !== null ? id.toString().trim() : ''))
    .filter(Boolean);
  if (headerColumnsExplicit && !ids.length) return [];
  const fallbackIds = fallback
    .map((id: any) => (id !== undefined && id !== null ? id.toString().trim() : ''))
    .filter(Boolean);
  const fields = (groupCfg.fields || []) as LineItemFieldConfig[];
  const finalIds = ids.length ? ids : fallbackIds.length ? fallbackIds : fields.map(f => f.id);
  return finalIds.map((id: string) => fields.find((f: LineItemFieldConfig) => f.id === id)).filter(Boolean);
};

export const areOverlayHeaderFieldsComplete = (args: {
  fields: LineItemFieldConfig[];
  rowValues: Record<string, FieldValue>;
  ctx: VisibilityContext;
  rowId: string;
  linePrefix: string;
}): boolean => {
  const { fields, rowValues, ctx, rowId, linePrefix } = args;
  if (!fields.length) return false;
  return fields.every(field => {
    if (shouldHideField(field.visibility, ctx, { rowId, linePrefix })) return true;
    const val = resolveRequiredValue(field, rowValues[field.id]);
    return !isEmptyValue(val as any);
  });
};

export const collectLineItemConfigEntries = (questions: WebQuestionDefinition[]) => {
  const entries: Array<{ id: string; config: any }> = [];
  const visit = (id: string, config: any, parentPath?: string) => {
    if (!id || !config) return;
    const key = parentPath ? `${parentPath}.${id}` : id;
    entries.push({ id: key, config });
    const subs = Array.isArray(config.subGroups) ? config.subGroups : [];
    subs.forEach((sub: any) => {
      const subId = resolveSubgroupKey(sub as any);
      if (!subId) return;
      visit(subId, sub, key);
    });
  };
  (questions || []).forEach(q => {
    if (q.type !== 'LINE_ITEM_GROUP') return;
    visit(q.id, (q as any).lineItemConfig);
  });
  return entries;
};

export const resolveLineItemDedupMessage = (
  rule: LineItemDedupRule,
  language: LangCode,
  vars?: Record<string, string | number | boolean | null | undefined>
): string => {
  const base = resolveLocalizedString(
    rule.message || LINE_ITEM_DEDUP_DEFAULT_MESSAGE,
    language,
    'This entry already exists in this list.'
  );
  return formatTemplate(base, vars);
};

export const resolveLineItemDedupValueToken = (rowValues: Record<string, FieldValue>, fieldId: string): string => {
  const raw = (rowValues || {})[fieldId];
  return formatLineItemDedupValue(raw);
};
