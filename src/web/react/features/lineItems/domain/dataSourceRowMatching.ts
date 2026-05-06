const normalizeToken = (value: unknown): string => `${value ?? ''}`.trim().toLowerCase();

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const splitDelimitedTokens = (value: unknown, delimiter?: string): string[] => {
  if (Array.isArray(value)) {
    return value
      .map(entry => normalizeToken(entry))
      .filter(Boolean);
  }
  const text = `${value ?? ''}`.trim();
  if (!text) return [];
  const separator = delimiter && delimiter.trim() ? escapeRegExp(delimiter.trim()) : ',';
  return text
    .split(new RegExp(`${separator}|;|/|\\|`))
    .map(entry => normalizeToken(entry))
    .filter(Boolean);
};

const containsTokenAsSegment = (text: string, token: string): boolean => {
  if (!text || !token) return false;
  const escaped = escapeRegExp(token);
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(text);
};

export type DataSourceRowMatchMode = 'equals' | 'includesDelimited';

const resolveSourceMatchFieldIds = (args: {
  sourceMatchFieldId?: string | null;
  sourceMatchFieldIds?: Array<string | null | undefined> | null;
}): string[] => {
  const primary = `${args.sourceMatchFieldId || ''}`.trim();
  const extras = Array.isArray(args.sourceMatchFieldIds)
    ? args.sourceMatchFieldIds
        .map(value => `${value || ''}`.trim())
        .filter(Boolean)
    : [];
  return Array.from(new Set([primary, ...extras].filter(Boolean)));
};

export function matchesDataSourceRowToParent(args: {
  item: Record<string, any> | null | undefined;
  sourceMatchFieldId?: string | null;
  sourceMatchFieldIds?: Array<string | null | undefined> | null;
  parentValue: unknown;
  mode?: DataSourceRowMatchMode | string | null;
  delimiter?: string | null;
}): boolean {
  const item = args.item;
  if (!item || typeof item !== 'object') return false;
  const sourceMatchFieldIds = resolveSourceMatchFieldIds(args);
  if (!sourceMatchFieldIds.length) return true;

  const parentToken = normalizeToken(args.parentValue);
  if (!parentToken) return false;

  const mode = `${args.mode || 'equals'}`.trim().toLowerCase();
  const populatedSourceValues = sourceMatchFieldIds
    .map(sourceMatchFieldId => item[sourceMatchFieldId])
    .filter(value => value !== undefined && value !== null && `${value}`.trim() !== '');
  if (!populatedSourceValues.length) {
    return true;
  }
  return sourceMatchFieldIds.some(sourceMatchFieldId => {
    const rawSourceValue = item[sourceMatchFieldId];
    if (rawSourceValue === undefined || rawSourceValue === null || `${rawSourceValue}`.trim() === '') return false;
    if (mode === 'includesdelimited') {
      const rowTokens = splitDelimitedTokens(rawSourceValue, `${args.delimiter || ''}`.trim() || undefined);
      if (rowTokens.includes(parentToken)) return true;
      return containsTokenAsSegment(normalizeToken(rawSourceValue), parentToken);
    }

    return normalizeToken(rawSourceValue) === parentToken;
  });
}
