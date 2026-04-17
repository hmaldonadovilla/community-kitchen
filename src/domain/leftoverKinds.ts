const normalizeLeftoverKindValue = (raw: unknown): string => {
  if (raw === undefined || raw === null) return '';
  try {
    return raw.toString().trim().toLowerCase();
  } catch {
    return '';
  }
};

export const MULTI_INGREDIENT_LEFTOVER_KIND = 'Multi-ingredient';
export const SINGLE_INGREDIENT_LEFTOVER_KIND = 'Single-ingredient';
export const LEGACY_MULTI_INGREDIENT_LEFTOVER_KIND = 'Entire dish';
export const LEGACY_SINGLE_INGREDIENT_LEFTOVER_KIND = 'Part dish';
export const MULTI_INGREDIENT_LEFTOVER_ID_PREFIX = 'MI-';
export const SINGLE_INGREDIENT_LEFTOVER_ID_PREFIX = 'SI-';

export const MULTI_INGREDIENT_LEFTOVER_KIND_ALIASES = [
  MULTI_INGREDIENT_LEFTOVER_KIND,
  LEGACY_MULTI_INGREDIENT_LEFTOVER_KIND
] as const;

export const SINGLE_INGREDIENT_LEFTOVER_KIND_ALIASES = [
  SINGLE_INGREDIENT_LEFTOVER_KIND,
  LEGACY_SINGLE_INGREDIENT_LEFTOVER_KIND
] as const;

export const isMultiIngredientLeftoverKind = (raw: unknown): boolean => {
  const normalized = normalizeLeftoverKindValue(raw);
  return MULTI_INGREDIENT_LEFTOVER_KIND_ALIASES.some(alias => normalized === alias.toLowerCase());
};

export const isSingleIngredientLeftoverKind = (raw: unknown): boolean => {
  const normalized = normalizeLeftoverKindValue(raw);
  return SINGLE_INGREDIENT_LEFTOVER_KIND_ALIASES.some(alias => normalized === alias.toLowerCase());
};

export const toCanonicalLeftoverKind = (raw: unknown): string => {
  if (isMultiIngredientLeftoverKind(raw)) return MULTI_INGREDIENT_LEFTOVER_KIND;
  if (isSingleIngredientLeftoverKind(raw)) return SINGLE_INGREDIENT_LEFTOVER_KIND;
  if (raw === undefined || raw === null) return '';
  try {
    return raw.toString().trim();
  } catch {
    return '';
  }
};
