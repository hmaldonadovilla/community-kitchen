import { FieldValue } from '../../types';

const normalizeString = (raw: unknown): string => {
  if (raw === undefined || raw === null) return '';
  try {
    return raw.toString().trim();
  } catch {
    return '';
  }
};

const normalizeToken = (raw: unknown): string => normalizeString(raw).replace(/[\s_-]/g, '').toLowerCase();

const isSourceTrackingField = (targetFieldId: string, sourceFieldId: string, lookupSourceFieldId: string): boolean => {
  const normalizedTarget = normalizeString(targetFieldId);
  if (!normalizedTarget) return false;
  if (lookupSourceFieldId && normalizedTarget === lookupSourceFieldId) return true;

  const targetToken = normalizeToken(normalizedTarget);
  const sourceToken = normalizeToken(sourceFieldId);
  if (targetToken.endsWith('sourceid') || targetToken.endsWith('sourceupdatedat')) return true;
  return sourceToken === 'id' || sourceToken === 'updatedat' || sourceToken === 'lastupdatedat';
};

export const collectSelectionEffectSourceMetadataFieldIds = (field: any, changedFieldId: string): string[] => {
  const changedId = normalizeString(changedFieldId);
  if (!changedId) return [];
  const effects = Array.isArray(field?.selectionEffects) ? field.selectionEffects : [];
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (fieldId: unknown) => {
    const normalized = normalizeString(fieldId);
    if (!normalized || normalized === changedId || seen.has(normalized)) return;
    seen.add(normalized);
    out.push(normalized);
  };

  effects.forEach((effect: any) => {
    if (!effect || typeof effect !== 'object') return;
    const lookupSourceFieldId = normalizeString(effect.lookupSourceFieldId);
    add(lookupSourceFieldId);

    const mappings = [effect.parentFieldMapping, effect.fieldMapping].filter(
      mapping => mapping && typeof mapping === 'object' && !Array.isArray(mapping)
    );
    mappings.forEach(mapping => {
      Object.entries(mapping as Record<string, unknown>).forEach(([targetFieldId, sourceFieldId]) => {
        if (isSourceTrackingField(targetFieldId, normalizeString(sourceFieldId), lookupSourceFieldId)) {
          add(targetFieldId);
        }
      });
    });
  });

  return out;
};

export const clearSelectionEffectSourceMetadata = (
  rowValues: Record<string, FieldValue>,
  field: any,
  changedFieldId: string
): Record<string, FieldValue> => {
  const fieldIds = collectSelectionEffectSourceMetadataFieldIds(field, changedFieldId);
  if (!fieldIds.length) return rowValues;

  let changed = false;
  const next = { ...(rowValues || {}) };
  fieldIds.forEach(fieldId => {
    if ((next as any)[fieldId] === null) return;
    (next as any)[fieldId] = null;
    changed = true;
  });
  return changed ? next : rowValues;
};
