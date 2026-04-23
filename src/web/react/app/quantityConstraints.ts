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

export function computeAvailableFromAggregate(remaining: unknown, reserved: unknown): number {
  return Math.max(0, toFiniteNumberValue(remaining) - toFiniteNumberValue(reserved));
}

export function resolveServerCurrentRecordReservedQuantity(args: {
  hasExplicitServerCurrentRecordReservedQuantity?: boolean;
  serverCurrentRecordReservedQuantity?: unknown;
  fallbackCurrentRecordReservedQuantity?: unknown;
}): number {
  if (args.hasExplicitServerCurrentRecordReservedQuantity) {
    return Math.max(0, toFiniteNumberValue(args.serverCurrentRecordReservedQuantity));
  }
  return Math.max(0, toFiniteNumberValue(args.fallbackCurrentRecordReservedQuantity));
}

export function computeOptimisticAggregateReservedQuantity(args: {
  reservedQuantity: unknown;
  serverCurrentRecordReservedQuantity?: unknown;
  localCurrentRecordReservedQuantity?: unknown;
}): number {
  const reservedQuantity = Math.max(0, toFiniteNumberValue(args.reservedQuantity));
  const serverCurrentRecordReservedQuantity = Math.max(0, toFiniteNumberValue(args.serverCurrentRecordReservedQuantity));
  const localCurrentRecordReservedQuantity = Math.max(0, toFiniteNumberValue(args.localCurrentRecordReservedQuantity));
  const reservedByOthers = Math.max(0, reservedQuantity - serverCurrentRecordReservedQuantity);
  return Math.max(0, reservedByOthers + localCurrentRecordReservedQuantity);
}

export function computeOptimisticFreeQuantity(args: {
  remainingQuantity: unknown;
  reservedQuantity: unknown;
  serverCurrentRecordReservedQuantity?: unknown;
  localCurrentRecordReservedQuantity?: unknown;
}): number {
  const optimisticReservedQuantity = computeOptimisticAggregateReservedQuantity({
    reservedQuantity: args.reservedQuantity,
    serverCurrentRecordReservedQuantity: args.serverCurrentRecordReservedQuantity,
    localCurrentRecordReservedQuantity: args.localCurrentRecordReservedQuantity
  });
  return computeAvailableFromAggregate(args.remainingQuantity, optimisticReservedQuantity);
}

export function computeOptimisticRowMaxQuantity(args: {
  remainingQuantity: unknown;
  reservedQuantity: unknown;
  serverCurrentRecordReservedQuantity?: unknown;
  localCurrentRecordReservedQuantity?: unknown;
  currentRowQuantity?: unknown;
}): number {
  const optimisticFreeQuantity = computeOptimisticFreeQuantity(args);
  const currentRowQuantity = Math.max(0, toFiniteNumberValue(args.currentRowQuantity));
  return Math.max(0, optimisticFreeQuantity + currentRowQuantity);
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
  const maxValue = options?.maxValue;
  if (typeof maxValue === 'number' && Number.isFinite(maxValue) && parsed > maxValue) {
    return formatNumericConstraintValue(maxValue, integerOnly);
  }
  return integerOnly ? sanitized.replace(/^0+(?=\d)/, '') || '0' : sanitized;
}
