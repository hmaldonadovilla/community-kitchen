import type { FieldValue } from '../../types';

const INGREDIENTS_FORM_KEY = 'config: ingredients management';
const INGREDIENT_NAME_ID = 'INGREDIENT_NAME';
const CREATED_BY_ID = 'CREATED_BY';
const STATUS_ID = 'STATUS';
const EFFECTIVE_START_DATE_ID = 'EFFECTIVE_START_DATE';
const EFFECTIVE_END_DATE_ID = 'EFFECTIVE_END_DATE';

export const INGREDIENT_ACTIVE_STATUS = 'Active';
export const INGREDIENT_ACTIVE_EFFECTIVE_END_DATE = '9999-12-31';

const toTrimmedText = (raw: FieldValue): string => {
  if (raw === undefined || raw === null) return '';
  return raw
    .toString()
    .replace(/\s+/g, ' ')
    .trim();
};

const toNormalizedInputText = (raw: FieldValue): string => {
  if (raw === undefined || raw === null) return '';
  return raw
    .toString()
    .replace(/\s+/g, ' ');
};

const toTitleCasePart = (part: string): string => {
  const value = (part || '').toString();
  if (!value) return value;
  const firstLetterIndex = value.search(/[A-Za-z]/);
  if (firstLetterIndex < 0) return value;
  const head = value.slice(0, firstLetterIndex);
  const first = value.charAt(firstLetterIndex).toUpperCase();
  const tail = value.slice(firstLetterIndex + 1).toLowerCase();
  return `${head}${first}${tail}`;
};

const toTitleCaseWord = (word: string): string => {
  return word
    .split('-')
    .map(part => toTitleCasePart(part))
    .join('-');
};

export const isIngredientsManagementForm = (formKeyRaw: string | null | undefined): boolean => {
  const key = (formKeyRaw || '').toString().trim().toLowerCase();
  return key === INGREDIENTS_FORM_KEY;
};

export const isIngredientNameFieldId = (fieldIdRaw: string | null | undefined): boolean => {
  const fieldId = (fieldIdRaw || '').toString().trim().toUpperCase();
  return fieldId === INGREDIENT_NAME_ID;
};

export const normalizeIngredientNameIfAllCaps = (raw: FieldValue): string => {
  const normalizedInput = toNormalizedInputText(raw);
  if (!normalizedInput) return '';

  return normalizedInput
    .split(' ')
    .map(token => toTitleCaseWord(token))
    .join(' ');
};

export const isValidIngredientName = (raw: FieldValue): boolean => {
  const normalized = toTrimmedText(normalizeIngredientNameIfAllCaps(raw));
  if (normalized.length < 2) return false;
  return /^[A-Za-z0-9]+(?:[A-Za-z0-9 -]*[A-Za-z0-9])?$/.test(normalized);
};

export const getIngredientNameValidationMessage = (raw: FieldValue): string => {
  const normalized = toTrimmedText(normalizeIngredientNameIfAllCaps(raw));
  if (!normalized) return 'Ingredient name is required.';
  if (normalized.length < 2) return 'Ingredient name must be at least 2 characters.';
  if (!/^[A-Za-z0-9]+(?:[A-Za-z0-9 -]*[A-Za-z0-9])?$/.test(normalized)) {
    return 'Ingredient name can only include letters, numbers, spaces, and dashes.';
  }
  return '';
};

export const isIngredientCreateAutoSaveReady = (valuesRaw: Record<string, FieldValue> | null | undefined): boolean => {
  const values = valuesRaw || {};
  const createdBy = toTrimmedText(values[CREATED_BY_ID]);
  if (!createdBy) return false;
  return isValidIngredientName(values[INGREDIENT_NAME_ID]);
};

const toYmd = (date: Date): string => {
  const pad2 = (value: number): string => value.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
};

export const applyIngredientActivationSystemFields = (
  valuesRaw: Record<string, FieldValue> | null | undefined,
  now: Date = new Date()
): Record<string, FieldValue> => {
  const values = { ...(valuesRaw || {}) };
  values[STATUS_ID] = INGREDIENT_ACTIVE_STATUS;
  values[EFFECTIVE_START_DATE_ID] = toYmd(now);
  values[EFFECTIVE_END_DATE_ID] = INGREDIENT_ACTIVE_EFFECTIVE_END_DATE;
  return values;
};
