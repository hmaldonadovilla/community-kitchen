import { FormConfig, QuestionConfig, WebFormSubmission } from '../../../types';
import { collectLineItemRows } from './placeholders';

interface TypeRow {
  __parent?: any;
  [key: string]: any;
}

interface IngredientRow {
  __parent?: TypeRow;
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

const normalizeText = (value: any): string => {
  if (value === undefined || value === null) return '';
  return value.toString().trim();
};

const extractDriveFileId = (value: string): string => {
  const text = normalizeText(value);
  if (!text) return '';
  const idParamMatch = text.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idParamMatch) return idParamMatch[1];
  const pathMatch = text.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (pathMatch) return pathMatch[1];
  return '';
};

const buildDataUriFromBlob = (blob: GoogleAppsScript.Base.Blob): string => {
  const contentType = blob.getContentType() || 'image/png';
  const base64 = Utilities.base64Encode(blob.getBytes());
  return `data:${contentType};base64,${base64}`;
};

const resolveLogoDataUri = (logoUrl: string): string => {
  const normalized = normalizeText(logoUrl);
  if (!normalized) return '';
  if (normalized.startsWith('data:')) return normalized;
  const fileId = extractDriveFileId(normalized);
  if (fileId && typeof DriveApp !== 'undefined') {
    try {
      const blob = DriveApp.getFileById(fileId).getBlob();
      return buildDataUriFromBlob(blob);
    } catch (err) {
      // ignore; fallback to fetching the raw URL below.
    }
  }
  if (typeof UrlFetchApp !== 'undefined') {
    try {
      const response = UrlFetchApp.fetch(normalized);
      return buildDataUriFromBlob(response.getBlob());
    } catch (err) {
      return '';
    }
  }
  return '';
};

const parseNumber = (value: any): number | null => {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const text = value.toString().trim().replace(',', '.');
  if (!text) return null;
  const num = Number(text);
  return Number.isFinite(num) ? num : null;
};

const formatPortions = (value: any, fallback = 0): string => {
  const n = parseNumber(value);
  if (n !== null) return `${n} portions`;
  const raw = normalizeText(value);
  if (raw) return `${raw} portions`;
  return `${fallback} portions`;
};

const uniqueList = (values: string[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  values.forEach(value => {
    const text = normalizeText(value);
    if (!text) return;
    const key = text.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    result.push(text);
  });
  return result;
};

const formatConfirmation = (value: any): string => {
  const normalized = normalizeText(value).toLowerCase();
  if (!normalized) return 'Not confirmed';
  if (normalized === 'true' || normalized === 'yes' || normalized === '1') return 'Yes';
  if (normalized === 'false' || normalized === 'no' || normalized === '0') return 'No';
  return normalizeText(value);
};

interface RecipeSection {
  recipeName: string;
  portionLabel: string;
  ingredients: string[];
  allergens: string[];
}

const buildRecipeSection = (section: RecipeSection): string => {
  const details: string[] = [];
  const ingredientText = section.ingredients.length ? section.ingredients.join(', ') : 'None';
  details.push(`
    <div class="ck-recipe-detail">
      <span class="ck-recipe-detail-label">Ingredients:</span>
      <span>${escapeHtml(ingredientText)}</span>
    </div>`);
  if (section.allergens.length) {
    details.push(`
      <div class="ck-recipe-detail">
        <span class="ck-recipe-detail-label">Allergens:</span>
        <span>${escapeHtml(section.allergens.join(', '))}</span>
      </div>`);
  }
  const detailsHtml = details.join('');
  return `
    <div class="ck-recipe-block">
      <div class="ck-recipe-heading">
        <div>
          <div class="ck-recipe-title">${escapeHtml(section.recipeName || 'Recipe not set')}</div>
        </div>
        <div class="ck-meal-portions">${escapeHtml(section.portionLabel)}</div>
      </div>
      <div class="ck-recipe-details">${detailsHtml}</div>
    </div>`;
};

const buildMealBlocks = (record: WebFormSubmission, questions: QuestionConfig[]): string => {
  const lineItemRows = collectLineItemRows(record, questions);
  const mealRows = (lineItemRows['MP_MEALS_REQUEST'] || []) as any[];
  if (!mealRows.length) {
    return '<div class="ck-meal-block"><div class="ck-meal-type">No meal data available.</div></div>';
  }

  const typeRows = (lineItemRows['MP_MEALS_REQUEST.MP_TYPE_LI'] || []) as TypeRow[];
  const ingredientRows = (lineItemRows['MP_MEALS_REQUEST.MP_TYPE_LI.MP_INGREDIENTS_LI'] || []) as IngredientRow[];

  const ingredientsByType = new Map<TypeRow, { names: string[]; allergens: string[] }>();
  ingredientRows.forEach(row => {
    const parent = row.__parent;
    if (!parent) return;
    const bucket = ingredientsByType.get(parent) || { names: [], allergens: [] };
    const name = normalizeText(row.ING);
    if (name) bucket.names.push(name);
    const allergen = normalizeText(row.ALLERGEN);
    if (allergen && allergen.toLowerCase() !== 'none') bucket.allergens.push(allergen);
    ingredientsByType.set(parent, bucket);
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

  mealRows.forEach(meal => {
    const mealLabel = normalizeText(meal.MEAL_TYPE) || 'Meal';
    const finalQtyLabel = formatPortions(meal.FINAL_QTY, 0);
    const mealTypeRows = typesByMeal.get(meal) || [];
    const normalizedEntries = mealTypeRows.map(row => {
      const prepType = normalizeText(row.PREP_TYPE).toLowerCase();
      const prepQty = parseNumber(row.PREP_QTY);
      const recipe = normalizeText(row.RECIPE);
      const bucket = ingredientsByType.get(row) || { names: [], allergens: [] };
      return {
        row,
        prepType,
        prepQty,
        recipe,
        ingredients: bucket.names,
        allergens: bucket.allergens,
        coreTemp: normalizeText(row.MP_COOK_TEMP || meal.MP_COOK_TEMP)
      };
    });

    const cookEntries = normalizedEntries.filter(entry => entry.prepType === 'cook');
    const entireEntries = normalizedEntries.filter(entry => entry.prepType === 'entire dish');
    const partialEntries = normalizedEntries.filter(entry => entry.prepType === 'part dish');
    const otherEntries = normalizedEntries.filter(
      entry => entry.prepType !== 'cook' && entry.prepType !== 'entire dish' && entry.prepType !== 'part dish'
    );

    const entireTotal = entireEntries.reduce((sum, entry) => sum + (entry.prepQty ?? 0), 0);
    const finalQtyNumber = parseNumber(meal.FINAL_QTY);
    const cookPortionsNumber = finalQtyNumber !== null ? Math.max(0, finalQtyNumber - entireTotal) : null;

    const segments: string[] = [];

    const cookBucketIngredients = uniqueList([
      ...(cookEntries[0]?.ingredients || []),
      ...partialEntries.flatMap(entry => entry.ingredients)
    ]);
    const cookBucketAllergens = uniqueList([
      ...(cookEntries[0]?.allergens || []),
      ...partialEntries.flatMap(entry => entry.allergens)
    ]);

    if (cookEntries.length || partialEntries.length) {
      const portionLabel = cookPortionsNumber !== null ? `${cookPortionsNumber} portions` : finalQtyLabel;
      const recipeName = cookEntries[0]?.recipe || 'Cooked recipe';
      segments.push(
        buildRecipeSection({
          recipeName,
          portionLabel,
          ingredients: cookBucketIngredients,
          allergens: cookBucketAllergens
        })
      );
    }

    if (!cookEntries.length && partialEntries.length) {
      if (!segments.length) {
        segments.push(
          buildRecipeSection({
            recipeName: 'Partial leftovers',
            portionLabel: finalQtyLabel,
            ingredients: cookBucketIngredients,
            allergens: cookBucketAllergens
          })
        );
      }
    }

    entireEntries.forEach(entry => {
      segments.push(
        buildRecipeSection({
          recipeName: entry.recipe || 'Leftover recipe',
          portionLabel: formatPortions(entry.prepQty ?? 0, 0),
          ingredients: uniqueList(entry.ingredients),
          allergens: uniqueList(entry.allergens)
        })
      );
    });

    otherEntries.forEach(entry => {
      segments.push(
        buildRecipeSection({
          recipeName: entry.recipe || 'Recipe not set',
          portionLabel: formatPortions(entry.prepQty ?? 0, 0),
          ingredients: uniqueList(entry.ingredients),
          allergens: uniqueList(entry.allergens)
        })
      );
    });

    const coreTempCandidate = normalizedEntries.find(entry => entry.coreTemp) ?? { coreTemp: '' };
    const tempLabel = formatConfirmation(coreTempCandidate.coreTemp);
    const showTempConfirmation = finalQtyNumber !== null && finalQtyNumber > 0;
    const tempLine = showTempConfirmation
      ? `<div class="ck-core-temp">All pots ≥63°C confirmed: ${escapeHtml(tempLabel)}</div>`
      : '';

    blocks.push(`
      <div class="ck-meal-block">
        <div class="ck-meal-heading">
          <div class="ck-meal-type">${escapeHtml(mealLabel)}</div>
          <div class="ck-meal-portions">Delivered: ${escapeHtml(finalQtyLabel)}</div>
        </div>
        ${tempLine}
        ${segments.join('')}
      </div>`);
  });

  return blocks.join('');
};

export const buildMealProductionPdfPlaceholders = (args: {
  record: WebFormSubmission;
  questions: QuestionConfig[];
  form: FormConfig;
}): Record<string, string> => {
  const blocks = buildMealBlocks(args.record, args.questions);
  const logo = args.form?.appHeader?.logoUrl ? normalizeText(args.form.appHeader.logoUrl) : '';
  const logoDataUri = logo ? resolveLogoDataUri(logo) : '';
  const logoSrc = logoDataUri || logo;
  const logoHtml = logoSrc ? `<img src="${escapeHtml(logoSrc)}" alt="Community Kitchen logo" />` : '';
  return {
    MEAL_BLOCKS: blocks,
    APP_HEADER_LOGO_HTML: logoHtml
  };
};
