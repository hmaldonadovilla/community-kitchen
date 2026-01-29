import { QuestionConfig, WebFormSubmission } from '../../../types';
import { collectLineItemRows } from './placeholders';

interface TypeRow {
  __parent?: any;
  [key: string]: any;
}

interface IngredientRow {
  __parent?: any;
  [key: string]: any;
}

const escapeHtml = (value: string): string =>
  (value || '')
    .toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const parseNumber = (value: any): number | null => {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const raw = value.toString().trim().replace(',', '.');
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
};

const formatPortions = (value: any, fallback = 0): string => {
  const parsed = parseNumber(value);
  if (parsed !== null) return `${parsed} portions`;
  const text = (value || '').toString().trim();
  if (text) return `${text} portions`;
  return `${fallback} portions`;
};

const normalizeText = (value: any): string => {
  const raw = value === undefined || value === null ? '' : value.toString().trim();
  return raw;
};

const uniqueList = (items: string[]): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  items.forEach(item => {
    const trimmed = normalizeText(item);
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(trimmed);
  });
  return out;
};

const getFieldValue = (source: any, fieldId: string): any => {
  if (!source) return undefined;
  const key = fieldId.trim();
  const candidates = [key, key.toUpperCase(), key.toLowerCase()];
  for (let i = 0; i < candidates.length; i += 1) {
    const candidate = candidates[i];
    if (candidate in source) {
      return source[candidate];
    }
  }
  return undefined;
};

const renderRecipeBlock = (
  label: string,
  quantityLabel: string,
  recipeName: string,
  ingredients: string[],
  allergens: string[]
): string => {
  const details: string[] = [];
  if (ingredients.length) {
    details.push(`
      <div class="recipe-detail">
        <span class="recipe-detail-label">Ingredients:</span>
        <span>${escapeHtml(ingredients.join(', '))}</span>
      </div>`);
  }
  if (allergens.length) {
    details.push(`
      <div class="recipe-detail">
        <span class="recipe-detail-label">Allergens:</span>
        <span>${escapeHtml(allergens.join(', '))}</span>
      </div>`);
  }
  const detailHtml = details.length ? `<div class="recipe-details">${details.join('')}</div>` : '';
  return `
    <div class="recipe-block">
      <div class="recipe-heading">
        <span class="recipe-label">${escapeHtml(label)}</span>
        <span class="recipe-portion">${escapeHtml(quantityLabel)}</span>
      </div>
      <div class="recipe-name">${escapeHtml(recipeName || 'Recipe not set')}</div>
      ${detailHtml}
    </div>`;
};

export const buildMealProductionHtmlBlocks = (record: WebFormSubmission, questions: QuestionConfig[]): string => {
  const lineItemRows = collectLineItemRows(record, questions);
  const mealRows = (lineItemRows['MP_MEALS_REQUEST'] || []) as any[];
  if (!mealRows.length) {
    return '<div class="meal-block">No meal data available.</div>';
  }

  const typeRows = (lineItemRows['MP_MEALS_REQUEST.MP_TYPE_LI'] || []) as TypeRow[];
  const ingredientRows = (lineItemRows['MP_MEALS_REQUEST.MP_TYPE_LI.MP_INGREDIENTS_LI'] || []) as IngredientRow[];

  const ingredientsByType = new Map<TypeRow, { names: string[]; allergens: string[] }>();
  ingredientRows.forEach(row => {
    const parent = row.__parent;
    if (!parent) return;
    const entry = ingredientsByType.get(parent) || { names: [], allergens: [] };
    const name = normalizeText(getFieldValue(row, 'ING'));
    if (name) entry.names.push(name);
    const allergen = normalizeText(getFieldValue(row, 'ALLERGEN'));
    if (allergen && allergen.toLowerCase() !== 'none') entry.allergens.push(allergen);
    ingredientsByType.set(parent, entry);
  });

  const typesByMeal = new Map<any, TypeRow[]>();
  typeRows.forEach(row => {
    const parent = row.__parent;
    if (!parent) return;
    const list = typesByMeal.get(parent) || [];
    list.push(row);
    typesByMeal.set(parent, list);
  });

  const blocks: string[] = [];

  mealRows.forEach(mealRow => {
    const mealLabel = normalizeText(getFieldValue(mealRow, 'MEAL_TYPE')) || 'Meal';
    const finalQtyValue = getFieldValue(mealRow, 'FINAL_QTY');
    const finalQtyLabel = formatPortions(finalQtyValue, 0);
    const prepTypeRows = typesByMeal.get(mealRow) || [];
    if (!prepTypeRows.length) {
      blocks.push(`
        <div class="meal-block">
          <div class="meal-heading">
            <div class="meal-type">${escapeHtml(mealLabel)}</div>
            <div class="meal-portions">Delivered: ${escapeHtml(finalQtyLabel)}</div>
          </div>
          <div class="recipe-block">
            <div class="recipe-name">No preparation details available.</div>
          </div>
        </div>`);
      return;
    }

    const normalizedEntries = prepTypeRows.map(row => {
      const prepType = normalizeText(getFieldValue(row, 'PREP_TYPE'));
      const prepQty = parseNumber(getFieldValue(row, 'PREP_QTY'));
      const recipe = normalizeText(getFieldValue(row, 'RECIPE'));
      const ingredients = ingredientsByType.get(row)?.names || [];
      const allergens = ingredientsByType.get(row)?.allergens || [];
      return {
        row,
        prepType: prepType.toLowerCase(),
        prepQty,
        recipe,
        ingredients,
        allergens
      };
    });

    const cookEntries = normalizedEntries.filter(e => e.prepType === 'cook');
    const entireEntries = normalizedEntries.filter(e => e.prepType === 'entire dish');
    const partialEntries = normalizedEntries.filter(e => e.prepType === 'part dish');

    const entireDishTotal = entireEntries.reduce((sum, entry) => sum + (entry.prepQty ?? 0), 0);
    const finalNumeric = parseNumber(finalQtyValue);
    const cookPortionsValue = finalNumeric !== null ? Math.max(0, finalNumeric - entireDishTotal) : null;

    const mealSegments: string[] = [];

    if (cookEntries.length) {
      const cookEntry = cookEntries[0];
      const cookIngredients = uniqueList([
        ...(cookEntry.ingredients || []),
        ...partialEntries.flatMap(entry => entry.ingredients)
      ]);
      const cookAllergens = uniqueList([
        ...(cookEntry.allergens || []),
        ...partialEntries.flatMap(entry => entry.allergens)
      ]);
      const cookQuantityLabel = cookPortionsValue !== null ? `${cookPortionsValue} portions` : formatPortions(cookEntry.prepQty ?? finalQtyValue, 0);
      mealSegments.push(renderRecipeBlock('Cooked', cookQuantityLabel, cookEntry.recipe, cookIngredients, cookAllergens));
    } else if (partialEntries.length) {
      const partialIngredients = uniqueList(partialEntries.flatMap(entry => entry.ingredients));
      const partialAllergens = uniqueList(partialEntries.flatMap(entry => entry.allergens));
      const partialPortionsLabel = cookPortionsValue !== null ? `${cookPortionsValue} portions` : finalQtyLabel;
      mealSegments.push(renderRecipeBlock('Cooked', partialPortionsLabel, 'Partial leftovers', partialIngredients, partialAllergens));
    }

    entireEntries.forEach(entry => {
      const qtyLabel = formatPortions(entry.prepQty ?? 0, 0);
      mealSegments.push(renderRecipeBlock('Leftover (entire dish)', qtyLabel, entry.recipe, uniqueList(entry.ingredients), uniqueList(entry.allergens)));
    });

    blocks.push(`
      <div class="meal-block">
        <div class="meal-heading">
          <div class="meal-type">${escapeHtml(mealLabel)}</div>
          <div class="meal-portions">Delivered: ${escapeHtml(finalQtyLabel)}</div>
        </div>
        ${mealSegments.join('')}
      </div>`);
  });

  return blocks.join('');
};
