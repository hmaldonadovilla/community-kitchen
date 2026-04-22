import { isMultiIngredientLeftoverKind, isSingleIngredientLeftoverKind } from '../../../domain/leftoverKinds';
import { WebFormSubmission } from '../../../types';

type IngredientRow = Record<string, any>;
type MealProductionRecord = WebFormSubmission & { values: Record<string, any> };

const toText = (value: any): string => {
  if (value === undefined || value === null) return '';
  return value.toString().trim();
};

const toIngredientRows = (raw: any): IngredientRow[] => {
  if (Array.isArray(raw)) {
    return raw
      .filter(row => row && typeof row === 'object')
      .map(row => ({ ...row }));
  }
  if (typeof raw === 'string') {
    const text = raw.trim();
    if (!text) return [];
    try {
      const parsed = JSON.parse(text);
      return Array.isArray(parsed)
        ? parsed.filter(row => row && typeof row === 'object').map(row => ({ ...row }))
        : [];
    } catch {
      return [];
    }
  }
  return [];
};

const hasIngredientRows = (raw: any): boolean => {
  return toIngredientRows(raw).some(row => toText(row.ING));
};

const buildSingleIngredientRows = (prepRow: Record<string, any>, leftoverValues: Record<string, any>): IngredientRow[] => {
  const ingredient = toText(leftoverValues.LEFTOVER_INGREDIENT || prepRow.RECIPE);
  if (!ingredient) return [];
  return [
    {
      ING: ingredient,
      CAT: toText(leftoverValues.LEFTOVER_CAT),
      ALLERGEN: toText(leftoverValues.LEFTOVER_ALLERGEN || 'None'),
      QTY: toText(prepRow.LEFTOVER_USE_QTY || prepRow.PREP_QTY || leftoverValues.LEFTOVER_QTY),
      UNIT: toText(prepRow.LEFTOVER_DISPLAY_UNIT || leftoverValues.LEFTOVER_UNIT),
      __ckRowSource: 'auto'
    }
  ];
};

const buildFallbackIngredientRows = (prepRow: Record<string, any>, leftoverRecord: WebFormSubmission | null): IngredientRow[] => {
  const leftoverValues = leftoverRecord?.values && typeof leftoverRecord.values === 'object' ? leftoverRecord.values : {};
  const multiIngredientRows = toIngredientRows(leftoverValues.LEFTOVER_INGREDIENTS_LI);
  if (multiIngredientRows.some(row => toText(row.ING))) {
    return multiIngredientRows;
  }

  const kindValue = toText(prepRow.LEFTOVER_KIND || leftoverValues.LEFTOVER_KIND || prepRow.PREP_TYPE || leftoverValues.LEFTOVER_PREP_TYPE);
  if (isSingleIngredientLeftoverKind(kindValue)) {
    return buildSingleIngredientRows(prepRow, leftoverValues);
  }
  if (isMultiIngredientLeftoverKind(kindValue)) {
    return multiIngredientRows;
  }
  return [];
};

export const hydrateMealProductionPrepIngredientsFromLeftovers = (
  record: WebFormSubmission,
  resolveLeftoverRecord: (leftoverRecordId: string) => WebFormSubmission | null
): WebFormSubmission => {
  const values = record?.values;
  const meals = Array.isArray(values?.MP_MEALS_REQUEST) ? (values.MP_MEALS_REQUEST as any[]) : null;
  if (!values || !meals || !meals.length) {
    return record;
  }

  const leftoverCache = new Map<string, WebFormSubmission | null>();
  let mealsChanged = false;

  const nextMeals = meals.map(mealRow => {
    const prepRows = Array.isArray(mealRow?.MP_TYPE_LI) ? (mealRow.MP_TYPE_LI as any[]) : null;
    if (!prepRows || !prepRows.length) {
      return mealRow;
    }

    let prepRowsChanged = false;
    const nextPrepRows = prepRows.map(prepRow => {
      if (!prepRow || typeof prepRow !== 'object') {
        return prepRow;
      }
      if (hasIngredientRows(prepRow.MP_INGREDIENTS_LI)) {
        return prepRow;
      }

      const leftoverRecordId = toText(prepRow.LEFTOVER_RECORD_ID);
      if (!leftoverRecordId) {
        return prepRow;
      }

      let leftoverRecord = leftoverCache.get(leftoverRecordId);
      if (leftoverRecord === undefined) {
        leftoverRecord = resolveLeftoverRecord(leftoverRecordId);
        leftoverCache.set(leftoverRecordId, leftoverRecord);
      }

      const fallbackIngredientRows = buildFallbackIngredientRows(prepRow, leftoverRecord);
      if (!fallbackIngredientRows.some(row => toText(row.ING))) {
        return prepRow;
      }

      prepRowsChanged = true;
      return {
        ...prepRow,
        MP_INGREDIENTS_LI: fallbackIngredientRows
      };
    });

    if (!prepRowsChanged) {
      return mealRow;
    }

    mealsChanged = true;
    return {
      ...mealRow,
      MP_TYPE_LI: nextPrepRows
    };
  });

  if (!mealsChanged) {
    return record;
  }

  return {
    ...record,
    values: {
      ...values,
      MP_MEALS_REQUEST: nextMeals
    }
  } as MealProductionRecord;
};
