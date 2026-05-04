/**
 * Owner: guided steps domain.
 * Normalizes guided line-group field include/read-only lists. Pure helper only;
 * rendering and form mutation stay in FormView.
 */

export type GuidedTargetFieldEntries = {
  allowed: Set<string> | null;
  renderAsLabel: Set<string>;
  order: string[];
  explicit: boolean;
};

export const normalizeGuidedLineFieldId = (groupId: string, rawId: any): string => {
  const s = rawId !== undefined && rawId !== null ? rawId.toString().trim() : '';
  if (!s) return '';
  const underscorePrefix = `${groupId}__`;
  if (s.startsWith(underscorePrefix)) return s.slice(underscorePrefix.length);
  const dotPrefix = `${groupId}.`;
  if (s.startsWith(dotPrefix)) return s.slice(dotPrefix.length);
  if (s.includes('.')) return s.split('.').pop() || s;
  return s;
};

export const parseGuidedTargetFieldEntries = (groupId: string, raw: any): GuidedTargetFieldEntries => {
  if (raw === undefined || raw === null) return { allowed: null, renderAsLabel: new Set(), order: [], explicit: false };
  const entries: Array<{ id: string; renderAsLabel: boolean }> = [];
  const pushEntry = (v: any) => {
    if (v === undefined || v === null) return;
    if (typeof v === 'object') {
      const id = normalizeGuidedLineFieldId(groupId, (v as any).id ?? (v as any).fieldId ?? (v as any).field);
      if (!id) return;
      entries.push({ id, renderAsLabel: Boolean((v as any).renderAsLabel) });
      return;
    }
    const id = normalizeGuidedLineFieldId(groupId, v);
    if (!id) return;
    entries.push({ id, renderAsLabel: false });
  };
  if (Array.isArray(raw)) {
    raw.forEach(pushEntry);
  } else {
    raw
      .toString()
      .split(',')
      .map((s: string) => s.trim())
      .filter(Boolean)
      .forEach(pushEntry);
  }
  const ids = entries.map(e => e.id).filter(Boolean);
  const roIds = entries.filter(e => e.renderAsLabel).map(e => e.id).filter(Boolean);
  const order = Array.from(new Set(ids));
  return { allowed: new Set(ids), renderAsLabel: new Set(roIds), order, explicit: true };
};
