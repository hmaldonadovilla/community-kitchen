/**
 * Owns client-side duplicate precheck signatures used by autosave and submit.
 *
 * Boundary: this module is pure dedup/domain logic. It does not call React,
 * transport APIs, Apps Script, Cloud Run, or persistence adapters.
 */
const normalizeDedupKeyValue = (raw: any): string => {
  if (raw === undefined || raw === null) return '';
  if (Array.isArray(raw)) return raw.map(v => (v === undefined || v === null ? '' : v.toString())).join('|');
  return raw.toString();
};

export const collectDedupKeyFieldIds = (rulesRaw: any): string[] => {
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

export const computeDedupSignatureFromValues = (rulesRaw: any, values: Record<string, any>): string => {
  const rules: any[] = Array.isArray(rulesRaw) ? rulesRaw : [];
  if (!rules.length) return '';
  const parts: string[] = [];
  rules.forEach(rule => {
    if (!rule) return;
    const keys: any[] = Array.isArray(rule.keys) ? rule.keys : [];
    if (!keys.length) return;
    const onConflict = (rule.onConflict || 'reject').toString().trim().toLowerCase();
    if (onConflict !== 'reject') return;
    const vals: string[] = keys.map((k: any) => normalizeDedupKeyValue((values as any)[(k || '').toString()]));
    if (vals.some(v => !v || !v.trim())) return;
    parts.push(`${(rule.id || '').toString()}:${vals.map(v => v.trim()).join('||')}`);
  });
  return parts.sort().join('|');
};

export const computeDedupKeyFieldIdMap = (rulesRaw: any): Record<string, true> => {
  const map: Record<string, true> = {};
  collectDedupKeyFieldIds(rulesRaw).forEach(id => {
    if (!id) return;
    map[id] = true;
    map[id.toLowerCase()] = true;
  });
  return map;
};

export const computeDedupKeyFingerprint = (rulesRaw: any, values: Record<string, any>): string => {
  const ids = collectDedupKeyFieldIds(rulesRaw);
  if (!ids.length) return '';
  return ids.map(id => `${id}=${normalizeDedupKeyValue((values as any)?.[id])}`).join('|');
};
