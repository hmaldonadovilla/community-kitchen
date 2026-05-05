export const normalizeCompactLookupValueAction = (value: any): string => {
  if (value === undefined || value === null) return '';
  if (Array.isArray(value)) {
    const firstNonEmpty = value.find(entry => entry !== undefined && entry !== null && `${entry}`.trim() !== '');
    return firstNonEmpty === undefined || firstNonEmpty === null ? '' : `${firstNonEmpty}`.trim().toLowerCase();
  }
  return `${value}`.trim().toLowerCase();
};

export const getCompactSourceValueAction = (sourceRow: any, sourceField: any): any => {
  if (!sourceRow || sourceField === undefined || sourceField === null) return undefined;
  const path = `${sourceField}`.trim();
  if (!path) return undefined;
  const resolveSegment = (acc: any, segment: string) => {
    if (acc === undefined || acc === null || typeof acc !== 'object') return undefined;
    if (acc?.[segment] !== undefined) return acc[segment];
    const normalized = segment.toLowerCase();
    const fallbackKey = Object.keys(acc).find(key => key.toLowerCase() === normalized);
    return fallbackKey ? acc[fallbackKey] : undefined;
  };
  const resolveFromCandidate = (candidate: any): any => {
    if (!candidate) return undefined;
    if (!path.includes('.')) return resolveSegment(candidate, path);
    return path.split('.').reduce((acc: any, segment: string) => resolveSegment(acc, segment), candidate);
  };
  const directValue = resolveFromCandidate(sourceRow);
  if (directValue !== undefined) return directValue;
  if (sourceRow && typeof sourceRow === 'object' && sourceRow.values && typeof sourceRow.values === 'object') {
    return resolveFromCandidate(sourceRow.values);
  }
  return undefined;
};

export const coerceCompactItemsCollectionAction = (payload: any): any[] => {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (typeof payload === 'string') {
    const trimmed = payload.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed;
      if (parsed && typeof parsed === 'object') return [parsed];
    } catch {
      return [];
    }
    return [];
  }
  if (typeof payload === 'object') return [payload];
  return [];
};

export const mapCompactActionEntriesAction = (entries: any[], action: any): Record<string, any>[] => {
  const rawMapping =
    action && typeof action.lineItemMapping === 'object' && action.lineItemMapping
      ? (action.lineItemMapping as Record<string, string>)
      : {};
  const mapped = entries
    .map(entry => {
      if (!entry || typeof entry !== 'object') return null;
      if (!Object.keys(rawMapping).length) return { ...entry };
      const next: Record<string, any> = {};
      Object.entries(rawMapping).forEach(([targetId, sourceId]) => {
        if (!targetId || !sourceId) return;
        const rawValue = getCompactSourceValueAction(entry, sourceId);
        if (rawValue === undefined) return;
        next[targetId] = rawValue;
      });
      return next;
    })
    .filter(Boolean) as Record<string, any>[];
  const aggregateBy = Array.isArray(action?.aggregateBy)
    ? action.aggregateBy.map((key: any) => `${key || ''}`.trim()).filter(Boolean) as string[]
    : [];
  const aggregateNumericFields = Array.isArray(action?.aggregateNumericFields)
    ? action.aggregateNumericFields.map((key: any) => `${key || ''}`.trim()).filter(Boolean) as string[]
    : [];
  if (!aggregateBy.length || !mapped.length) return mapped;
  const buckets = new Map<string, Record<string, any>>();
  mapped.forEach(entry => {
    const bucketKey = aggregateBy.map(key => `${entry[key] ?? ''}`).join('||');
    if (!buckets.has(bucketKey)) {
      buckets.set(bucketKey, { ...entry });
      return;
    }
    const existing = buckets.get(bucketKey)!;
    aggregateNumericFields.forEach(fieldId => {
      const current = Number(existing[fieldId]);
      const next = Number(entry[fieldId]);
      if (!Number.isFinite(next)) return;
      existing[fieldId] = Number.isFinite(current) ? current + next : next;
    });
  });
  return Array.from(buckets.values());
};
