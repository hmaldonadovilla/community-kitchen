export function toFiniteNumberValue(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const normalized = value.replace(',', '.').trim();
    if (!normalized) return 0;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function computeAvailableFromBankQuantity(remaining: unknown): number {
  return Math.max(0, toFiniteNumberValue(remaining));
}

export function resolveServerCurrentRecordUtilisedQuantity(args: {
  hasExplicitServerCurrentRecordUtilisedQuantity?: boolean;
  serverCurrentRecordUtilisedQuantity?: unknown;
  fallbackCurrentRecordUtilisedQuantity?: unknown;
}): number {
  if (args.hasExplicitServerCurrentRecordUtilisedQuantity) {
    return Math.max(0, toFiniteNumberValue(args.serverCurrentRecordUtilisedQuantity));
  }
  return Math.max(0, toFiniteNumberValue(args.fallbackCurrentRecordUtilisedQuantity));
}

export function computeOptimisticFreeQuantity(args: {
  remainingQuantity: unknown;
  serverCurrentRecordUtilisedQuantity?: unknown;
  localCurrentRecordUtilisedQuantity?: unknown;
}): number {
  const serverCurrentRecordUtilisedQuantity = Math.max(0, toFiniteNumberValue(args.serverCurrentRecordUtilisedQuantity));
  const localCurrentRecordUtilisedQuantity = Math.max(0, toFiniteNumberValue(args.localCurrentRecordUtilisedQuantity));
  return Math.max(
    0,
    toFiniteNumberValue(args.remainingQuantity) +
      serverCurrentRecordUtilisedQuantity -
      localCurrentRecordUtilisedQuantity
  );
}

export function computeOptimisticRowMaxQuantity(args: {
  remainingQuantity: unknown;
  serverCurrentRecordUtilisedQuantity?: unknown;
  localCurrentRecordUtilisedQuantity?: unknown;
  currentRowQuantity?: unknown;
}): number {
  const remainingQuantity = toFiniteNumberValue(args.remainingQuantity);
  const serverCurrentRecordUtilisedQuantity = Math.max(0, toFiniteNumberValue(args.serverCurrentRecordUtilisedQuantity));
  const localCurrentRecordUtilisedQuantity = Math.max(0, toFiniteNumberValue(args.localCurrentRecordUtilisedQuantity));
  const currentRowQuantity = Math.max(0, toFiniteNumberValue(args.currentRowQuantity));
  return Math.max(
    0,
    remainingQuantity +
      serverCurrentRecordUtilisedQuantity -
      localCurrentRecordUtilisedQuantity +
      currentRowQuantity
  );
}

export function ensureEditableMaxIncludesCurrentValue(maxValue: unknown, currentValue: unknown): number {
  return Math.max(0, Math.max(toFiniteNumberValue(maxValue), toFiniteNumberValue(currentValue)));
}

export function formatNumericConstraintValue(value: number, integerOnly: boolean): string {
  if (!Number.isFinite(value)) return '';
  if (integerOnly) return `${Math.max(0, Math.trunc(value))}`;
  return value.toFixed(6).replace(/\.?0+$/, '');
}

export function sanitizeNumericDraft(
  raw: string,
  options?: {
    integerOnly?: boolean;
    minValue?: number | null;
    maxValue?: number | null;
  }
): string {
  const text = `${raw || ''}`;
  if (!text.trim()) return '';

  const integerOnly = options?.integerOnly === true;
  let sanitized = '';
  if (integerOnly) {
    sanitized = text.replace(/[^\d]/g, '');
  } else {
    let seenSeparator = false;
    for (const char of text) {
      if (/\d/.test(char)) {
        sanitized += char;
        continue;
      }
      if ((char === '.' || char === ',') && !seenSeparator) {
        sanitized += '.';
        seenSeparator = true;
      }
    }
  }

  if (!sanitized.trim()) return '';

  const parsed = Number(sanitized);
  if (!Number.isFinite(parsed)) return '';
  const minValue = options?.minValue;
  if (typeof minValue === 'number' && Number.isFinite(minValue) && parsed < minValue) {
    return formatNumericConstraintValue(minValue, integerOnly);
  }
  const maxValue = options?.maxValue;
  if (typeof maxValue === 'number' && Number.isFinite(maxValue) && parsed > maxValue) {
    return formatNumericConstraintValue(maxValue, integerOnly);
  }
  return integerOnly ? sanitized.replace(/^0+(?=\d)/, '') || '0' : sanitized;
}
