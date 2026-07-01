import { FormConfig, QuestionConfig, WebFormSubmission } from '../../../types';
import { collectLineItemRows } from './placeholders';

const MEAL_GROUP_ID = 'MP_MEALS_REQUEST';
const PREP_GROUP_PATH = 'MP_MEALS_REQUEST.MP_TYPE_LI';
const GUARDED_ACTIONS = new Set(['CREATE_PDF', 'SEND_EMAIL', 'CLOSE_RECORD']);

const normalizeText = (value: any): string => {
  if (value === undefined || value === null) return '';
  return value.toString().trim();
};

const normalizeComparable = (value: any): string => normalizeText(value).toLowerCase();

const parseNumber = (value: any): number | null => {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const normalized = value.toString().trim().replace(',', '.');
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const isPositive = (value: any): boolean => {
  const parsed = parseNumber(value);
  return parsed !== null && parsed > 0;
};

const resolveActionLabel = (action: string): string => {
  switch (action) {
    case 'CREATE_PDF':
      return 'create the final report';
    case 'SEND_EMAIL':
      return 'send the final report email';
    case 'CLOSE_RECORD':
      return 'close the Meal Production record';
    default:
      return 'continue';
  }
};

const isMealProductionForm = (form: FormConfig, questions: QuestionConfig[], record: WebFormSubmission): boolean => {
  const formKeys = [form?.configSheet, form?.title, record?.formKey]
    .map(value => normalizeComparable(value))
    .filter(Boolean);
  if (formKeys.some(value => value === 'config: meal production' || value === 'meal production')) return true;
  return questions.some(q => q?.id === MEAL_GROUP_ID && q?.type === 'LINE_ITEM_GROUP');
};

const describeMeal = (mealRow: any, rowIndex: number): string => {
  const mealType = normalizeText(mealRow?.MEAL_TYPE);
  if (mealType) return mealType;
  return `row ${rowIndex + 1}`;
};

const getPrepRowsForMeal = (prepRows: any[], mealRow: any): any[] =>
  prepRows.filter(row => (row as any)?.__parent === mealRow);

export const validateMealProductionFollowupActionReadiness = (args: {
  form: FormConfig;
  questions: QuestionConfig[];
  record: WebFormSubmission;
  action: string;
}): string[] => {
  const normalizedAction = normalizeText(args.action).toUpperCase();
  if (!GUARDED_ACTIONS.has(normalizedAction)) return [];
  if (!isMealProductionForm(args.form, args.questions, args.record)) return [];

  const lineItemRows = collectLineItemRows(args.record, args.questions);
  const mealRows = lineItemRows[MEAL_GROUP_ID] || [];
  const prepRows = lineItemRows[PREP_GROUP_PATH] || [];
  if (!mealRows.length) return [];

  const actionLabel = resolveActionLabel(normalizedAction);
  const errors: string[] = [];

  mealRows.forEach((mealRow, rowIndex) => {
    const hasPortionsToCook = isPositive((mealRow as any)?.MP_TO_COOK);
    const cookRows = getPrepRowsForMeal(prepRows, mealRow).filter(row => normalizeComparable((row as any)?.PREP_TYPE) === 'cook');
    const hasActiveCookRow = cookRows.some(row => isPositive((row as any)?.PREP_QTY));
    if (!hasPortionsToCook && !hasActiveCookRow) return;

    const activeCookRows = cookRows.filter(row => isPositive((row as any)?.PREP_QTY) || hasPortionsToCook);
    const rowsToValidate = activeCookRows.length ? activeCookRows : cookRows;
    const mealLabel = describeMeal(mealRow, rowIndex);

    if (!rowsToValidate.length) {
      errors.push(
        `Cannot ${actionLabel} because ${mealLabel} has portions to cook but no cooked prep row. Go back to Production and select a recipe before continuing.`
      );
      return;
    }

    const missingRecipe = rowsToValidate.some(row => !normalizeText((row as any)?.RECIPE));
    if (missingRecipe) {
      errors.push(
        `Cannot ${actionLabel} because ${mealLabel} has portions to cook but no recipe is selected. Go back to Production and select a recipe before continuing.`
      );
    }
  });

  return errors;
};
