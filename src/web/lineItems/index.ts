import { LineItemTotalsInput } from '../types';
import { LangCode } from '../types';
import { resolveLocalizedString } from '../i18n';

export interface LineItemTotal {
  key: string;
  label: string;
  value: number;
  decimalPlaces?: number;
  pending?: boolean;
}

export function isEmptyRow(rowValues: Record<string, unknown>): boolean {
  const entries = Object.values(rowValues);
  return entries.every(val => {
    if (val === null || val === undefined) return true;
    if (typeof val === 'string') return val.trim() === '';
    if (Array.isArray(val)) return val.length === 0;
    return false;
  });
}

const hasInvalidFieldPath = (
  invalidFieldPaths: LineItemTotalsInput['invalidFieldPaths'],
  groupId: string | undefined,
  rowId: string | undefined,
  fieldId: string | undefined
): boolean => {
  if (!invalidFieldPaths || !groupId || !rowId || !fieldId) return false;
  const path = `${groupId}__${fieldId}__${rowId}`;
  if (invalidFieldPaths instanceof Set) return invalidFieldPaths.has(path);
  if (Array.isArray(invalidFieldPaths)) return invalidFieldPaths.includes(path);
  return Object.prototype.hasOwnProperty.call(invalidFieldPaths, path) && Boolean((invalidFieldPaths as Record<string, unknown>)[path]);
};

export function computeTotals(input: LineItemTotalsInput, language: LangCode): LineItemTotal[] {
  const { config, rows } = input;
  if (!config.totals || !config.totals.length) return [];

  return config.totals.map(totalCfg => {
    let total = 0;
    let pending = false;
    if (totalCfg.type === 'count') {
      total = rows.filter(r => !isEmptyRow(r.values)).length;
    } else if (totalCfg.type === 'sum') {
      const fieldKey = totalCfg.fieldId;
      if (fieldKey) {
        pending = rows.some(row => hasInvalidFieldPath(input.invalidFieldPaths, input.groupId, row.id, fieldKey));
        if (pending) {
          total = 0;
        } else {
          rows.forEach(row => {
            const val = row.values[fieldKey];
            const parsed = Array.isArray(val) ? Number(val[0]) : Number(val);
            if (!isNaN(parsed)) total += parsed;
          });
        }
      } else {
        total = 0;
      }
    }
    const label = resolveLocalizedString(
      totalCfg.label,
      language,
      totalCfg.type === 'count' ? 'Total' : totalCfg.fieldId || 'Total'
    );
    return {
      key: totalCfg.fieldId || totalCfg.type,
      label,
      value: Number.isFinite(total) ? total : 0,
      decimalPlaces: totalCfg.decimalPlaces,
      pending
    };
  });
}
