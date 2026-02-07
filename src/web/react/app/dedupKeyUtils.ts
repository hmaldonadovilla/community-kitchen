const normalizeDedupKeyValue = (raw: any): string => {
  if (raw === undefined || raw === null) return '';
  if (Array.isArray(raw)) return raw.map(v => (v === undefined || v === null ? '' : v.toString())).join('|');
  return raw.toString();
};

const getValueByFieldId = (valuesRaw: Record<string, any>, fieldIdRaw: string): any => {
  const fieldId = (fieldIdRaw || '').toString().trim();
  if (!fieldId) return undefined;
  if (Object.prototype.hasOwnProperty.call(valuesRaw || {}, fieldId)) return (valuesRaw as any)[fieldId];
  const lower = fieldId.toLowerCase();
  const entries = Object.entries(valuesRaw || {});
  for (let i = 0; i < entries.length; i += 1) {
    const key = (entries[i][0] || '').toString().trim().toLowerCase();
    if (!key || key !== lower) continue;
    return entries[i][1];
  }
  return undefined;
};

export const collectRejectDedupKeyFieldIds = (rulesRaw: any): string[] => {
  const rules: any[] = Array.isArray(rulesRaw) ? rulesRaw : [];
  const seen = new Set<string>();
  const out: string[] = [];
  rules.forEach(rule => {
    if (!rule) return;
    const keys = Array.isArray(rule.keys) ? rule.keys : [];
    if (!keys.length) return;
    const onConflict = (rule.onConflict || 'reject').toString().trim().toLowerCase();
    if (onConflict !== 'reject') return;
    keys.forEach((k: any) => {
      const id = (k || '').toString().trim();
      const lower = id.toLowerCase();
      if (!id || seen.has(lower)) return;
      seen.add(lower);
      out.push(id);
    });
  });
  return out;
};

export const hasIncompleteRejectDedupKeys = (rulesRaw: any, valuesRaw: Record<string, any>): boolean => {
  const keyFieldIds = collectRejectDedupKeyFieldIds(rulesRaw);
  if (!keyFieldIds.length) return false;
  return keyFieldIds.some(fieldId => {
    const raw = getValueByFieldId(valuesRaw || {}, fieldId);
    const normalized = normalizeDedupKeyValue(raw);
    return !normalized || !normalized.trim();
  });
};

