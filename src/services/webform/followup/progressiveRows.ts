import { QuestionConfig } from '../../../types';
import { validateRules } from '../../../web/rules/validation';
import { resolveSubgroupKey, formatTemplateValue, normalizeToIsoDate, toFiniteNumber } from './utils';

/**
 * Progressive PDF rendering helper:
 * decide whether a row should render in "collapsed fields only" mode.
 *
 * We treat a row as "disabled/inactive" when it has:
 * - no meaningful values in the collapsed summary fields (showLabel !== false), AND
 * - no values in any non-collapsed fields, AND
 * - no meaningful subgroup child-row values.
 */
export const shouldRenderCollapsedOnlyForProgressiveRow = (args: {
  group: QuestionConfig;
  row: Record<string, any>;
  ui: any;
  fields: any[];
}): boolean => {
  const { group, row, ui, fields } = args;
  const enabled = ui?.mode === 'progressive' && Array.isArray(ui?.collapsedFields) && (ui?.collapsedFields || []).length > 0;
  if (!enabled) return false;

  // When expand is gated by collapsedFieldsValid, consider the row "disabled" when
  // the collapsed fields are not filled and/or fail their configured validation rules.
  // This matches the UI behavior: disabled rows shouldn't expand, and in PDFs we treat them as inactive.
  if ((ui as any)?.expandGate === 'collapsedFieldsValid') {
    const collapsedConfigs = (ui?.collapsedFields || []) as any[];
    const findFieldCfg = (fid: string): any | undefined =>
      (fields || []).find((f: any) => (f?.id || '').toString().trim().toUpperCase() === fid.toUpperCase());

    const isFilled = (raw: any, type: string): boolean => {
      if (raw === undefined || raw === null) return false;
      const t = (type || '').toString().toUpperCase();
      if (t === 'NUMBER') return toFiniteNumber(raw) !== null; // 0 is filled, but may still fail rules (min)
      if (t === 'DATE') return !!normalizeToIsoDate(raw);
      if (t === 'CHECKBOX') {
        if (raw === true) return true;
        if (Array.isArray(raw)) return raw.length > 0;
        return false;
      }
      if (Array.isArray(raw)) return raw.length > 0;
      if (typeof raw === 'string') return raw.trim() !== '';
      return true;
    };

    const hasAnyInvalid = collapsedConfigs.some(c => {
      const fid = (c?.fieldId ?? '').toString().trim();
      if (!fid) return false;
      // showLabel=false is typically the row title/anchor; don't gate expand on it.
      if (c?.showLabel === false) return false;

      const cfg = findFieldCfg(fid);
      const cfgId = (cfg?.id || fid).toString();
      const type = (cfg as any)?.type ? (cfg as any).type.toString() : '';
      const raw = (row as any)?.[cfgId] ?? (row as any)?.[cfgId.toUpperCase?.() as any];
      if (!isFilled(raw, type)) return true;

      const rules = (cfg as any)?.validationRules;
      if (!Array.isArray(rules) || !rules.length) return false;
      const errs = validateRules(rules as any, {
        language: 'en',
        phase: 'submit',
        getValue: (fieldId: string) => {
          const key = (fieldId || '').toString().trim();
          if (!key) return undefined;
          if ((row as any).hasOwnProperty(key)) return (row as any)[key];
          const upper = key.toUpperCase();
          if ((row as any).hasOwnProperty(upper)) return (row as any)[upper];
          return undefined;
        },
        getLineValue: () => undefined,
        isHidden: () => false
      } as any);
      return errs.length > 0;
    });

    return hasAnyInvalid;
  }

  const collapsedConfigs = (ui?.collapsedFields || []) as any[];
  const collapsedIds = new Set<string>(
    collapsedConfigs
      .map(c => (c?.fieldId ?? '').toString().trim().toUpperCase())
      .filter(Boolean)
  );
  const findFieldCfg = (fid: string): any | undefined =>
    (fields || []).find((f: any) => (f?.id || '').toString().trim().toUpperCase() === fid.toUpperCase());

  const hasMeaningfulCollapsedSummary = (() => {
    for (const c of collapsedConfigs) {
      const fid = (c?.fieldId ?? '').toString().trim();
      if (!fid) continue;
      // showLabel=false is typically a title/anchor field; it should not make the row "active" by itself.
      if (c?.showLabel === false) continue;
      const cfg = findFieldCfg(fid);
      const raw = (row as any)?.[cfg?.id || fid];
      const type = (cfg as any)?.type ? (cfg as any).type.toString().toUpperCase() : '';
      if (type === 'NUMBER') {
        const n = toFiniteNumber(raw);
        if (n !== null && n > 0) return true;
        continue;
      }
      if (type === 'CHECKBOX') {
        if (raw === true) return true;
        if (Array.isArray(raw) && raw.length) return true;
        continue;
      }
      const text = formatTemplateValue(raw, type).trim();
      if (text) return true;
    }
    return false;
  })();

  const hasAnyNonCollapsedValue = (() => {
    for (const f of fields || []) {
      const fid = (f?.id || '').toString().trim().toUpperCase();
      if (!fid) continue;
      if (collapsedIds.has(fid)) continue;
      const raw = (row as any)?.[f.id];
      const type = (f as any)?.type ? (f as any).type.toString().toUpperCase() : '';
      if (type === 'NUMBER') {
        const n = toFiniteNumber(raw);
        if (n !== null && n > 0) return true;
        continue;
      }
      if (type === 'CHECKBOX') {
        if (raw === true) return true;
        if (Array.isArray(raw) && raw.length) return true;
        continue;
      }
      const text = formatTemplateValue(raw, type).trim();
      if (text) return true;
    }

    // Subgroup rows are considered "details" beyond the collapsed summary ONLY if they contain meaningful values.
    // Some flows may persist empty/placeholder child rows; those should not force full-row rendering in PDF.
    const subGroups = group.lineItemConfig?.subGroups || [];
    for (const sub of subGroups) {
      const key = resolveSubgroupKey(sub as any);
      if (!key) continue;
      const children = (row as any)?.[key];
      if (!Array.isArray(children) || !children.length) continue;
      const subFields = ((sub as any)?.fields || []) as any[];
      const hasMeaningfulChild = (child: any): boolean => {
        if (!child || typeof child !== 'object') return false;
        // If schema is unavailable, fall back to "any non-empty value".
        if (!subFields.length) {
          return Object.values(child).some(v => {
            if (v === undefined || v === null) return false;
            if (typeof v === 'string') return v.trim() !== '';
            if (typeof v === 'number') return Number.isFinite(v) && v > 0;
            if (typeof v === 'boolean') return v === true;
            if (Array.isArray(v)) return v.length > 0;
            return true;
          });
        }
        for (const sf of subFields) {
          const raw = (child as any)?.[sf.id];
          const type = (sf as any)?.type ? (sf as any).type.toString().toUpperCase() : '';
          if (type === 'NUMBER') {
            const n = toFiniteNumber(raw);
            if (n !== null && n > 0) return true;
            continue;
          }
          if (type === 'CHECKBOX') {
            if (raw === true) return true;
            if (Array.isArray(raw) && raw.length) return true;
            continue;
          }
          const text = formatTemplateValue(raw, type).trim();
          if (text) return true;
        }
        return false;
      };
      if (children.some(c => hasMeaningfulChild(c))) return true;
    }
    return false;
  })();

  const active = hasMeaningfulCollapsedSummary || hasAnyNonCollapsedValue;
  return !active;
};


