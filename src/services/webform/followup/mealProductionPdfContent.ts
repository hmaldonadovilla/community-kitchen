import { FormConfig, QuestionConfig, WebFormSubmission } from '../../../types';
import { fetchDriveFileBlob } from '../driveApi';
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
  if (fileId) {
    const blob = fetchDriveFileBlob(fileId, 'pdf.logo');
    if (blob) return buildDataUriFromBlob(blob);
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

const formatCount = (value: any, fallback = '0'): string => {
  const n = parseNumber(value);
  if (n !== null) {
    if (Number.isFinite(n) && Math.abs(n - Math.round(n)) < 1e-9) return String(Math.round(n));
    return String(n);
  }
  const raw = normalizeText(value);
  return raw || fallback;
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

interface RecipeSection {
  mealType: string;
  recipeName: string;
  portionCount: string;
  ingredientsText: string;
  allergensText: string;
}

const buildRecipeSection = (section: RecipeSection): string => {
  return `
    <table class="ck-meal-table" role="table" aria-label="${escapeHtml(section.mealType || 'Meal')}">
      <thead>
        <tr>
          <th class="ck-meal-table__title" scope="col" colspan="2">${escapeHtml(section.mealType || 'Meal')}</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td class="ck-meal-table__label">Portions</td>
          <td class="ck-meal-table__value">${escapeHtml(section.portionCount)}</td>
        </tr>
        <tr>
          <td class="ck-meal-table__label">Recipe</td>
          <td class="ck-meal-table__value">${escapeHtml(section.recipeName || 'Recipe not set')}</td>
        </tr>
        <tr>
          <td class="ck-meal-table__label">Ingredients</td>
          <td class="ck-meal-table__value">${escapeHtml(section.ingredientsText || 'None')}</td>
        </tr>
        <tr>
          <td class="ck-meal-table__label">Allergens</td>
          <td class="ck-meal-table__value">${escapeHtml(section.allergensText || 'None')}</td>
        </tr>
      </tbody>
    </table>`;
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
        allergens: bucket.allergens
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

    const cookBucketIngredients = uniqueList([
      ...(cookEntries[0]?.ingredients || []),
      ...partialEntries.flatMap(entry => entry.ingredients)
    ]);
    const cookBucketAllergens = uniqueList([
      ...(cookEntries[0]?.allergens || []),
      ...partialEntries.flatMap(entry => entry.allergens)
    ]);

    if (cookEntries.length || partialEntries.length) {
      const recipeName = cookEntries[0]?.recipe || 'Cooked recipe';
      blocks.push(
        buildRecipeSection({
          mealType: mealLabel,
          recipeName,
          portionCount: cookPortionsNumber !== null ? formatCount(cookPortionsNumber, '0') : formatCount(meal.FINAL_QTY, '0'),
          ingredientsText: cookBucketIngredients.length ? cookBucketIngredients.join(', ') : 'None',
          allergensText: cookBucketAllergens.length ? cookBucketAllergens.join(', ') : 'None'
        })
      );
    }

    entireEntries.forEach(entry => {
      blocks.push(
        buildRecipeSection({
          mealType: mealLabel,
          recipeName: entry.recipe || 'Leftover recipe',
          portionCount: formatCount(entry.prepQty ?? 0, '0'),
          ingredientsText: uniqueList(entry.ingredients).length ? uniqueList(entry.ingredients).join(', ') : 'None',
          allergensText: uniqueList(entry.allergens).length ? uniqueList(entry.allergens).join(', ') : 'None'
        })
      );
    });

    otherEntries.forEach(entry => {
      blocks.push(
        buildRecipeSection({
          mealType: mealLabel,
          recipeName: entry.recipe || 'Recipe not set',
          portionCount: formatCount(entry.prepQty ?? 0, '0'),
          ingredientsText: uniqueList(entry.ingredients).length ? uniqueList(entry.ingredients).join(', ') : 'None',
          allergensText: uniqueList(entry.allergens).length ? uniqueList(entry.allergens).join(', ') : 'None'
        })
      );
    });
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
