import { matchesWhen } from '../../rules/visibility';

/**
 * Resolve a TemplateIdMap on the client (supports:
 * - string
 * - language map { EN: "...", FR: "...", nl: "..." }
 * - selector { cases: [{ when, templateId }], default? }
 *
 * This mirrors the server-side `resolveTemplateId()` logic (used for follow-up templates),
 * but is implemented client-side so we can support `bundle:` templates without an Apps Script call.
 */
export const resolveTemplateIdForRecord = (
  template: any,
  recordValues: Record<string, any>,
  language: string
): string | undefined => {
  if (!template) return undefined;

  const pick = (v: any) => (v !== undefined && v !== null ? v.toString().trim() : '');

  const resolveBase = (t: any): any => {
    if (!t) return undefined;
    if (typeof t === 'string') {
      const trimmed = t.trim();
      return trimmed || undefined;
    }
    if (typeof t !== 'object') return undefined;

    // Selector config: choose a template based on record field values.
    if (Array.isArray((t as any).cases)) {
      const cases = (t as any).cases as any[];
      for (const c of cases) {
        const when = c?.when;
        const candidate = c?.templateId;
        const fieldId = when?.fieldId ? when.fieldId.toString() : '';
        if (!fieldId) continue;
        const value = (recordValues as any)?.[fieldId];
        try {
          if (matchesWhen(value, when)) {
            return resolveBase(candidate);
          }
        } catch (_) {
          // ignore invalid conditions
        }
      }
      if ((t as any).default !== undefined) return resolveBase((t as any).default);
      return undefined;
    }

    // Language map object.
    return t;
  };

  const base = resolveBase(template);
  if (!base) return undefined;
  if (typeof base === 'string') return base.trim() || undefined;

  const langKey = (language || 'EN').toString().toUpperCase();
  const direct = pick((base as any)[langKey]);
  if (direct) return direct;
  const lower = (language || 'en').toString().toLowerCase();
  const lowerPick = pick((base as any)[lower]);
  if (lowerPick) return lowerPick;
  const enPick = pick((base as any).EN);
  if (enPick) return enPick;
  const firstKey = Object.keys(base || {})[0];
  const firstPick = firstKey ? pick((base as any)[firstKey]) : '';
  return firstPick || undefined;
};


