import {
  INGREDIENT_ACTIVE_EFFECTIVE_END_DATE,
  INGREDIENT_ACTIVE_STATUS,
  applyIngredientActivationSystemFields,
  getIngredientNameValidationMessage,
  isIngredientCreateAutoSaveReady,
  isIngredientNameFieldId,
  isIngredientsManagementForm,
  isValidIngredientName,
  normalizeIngredientNameIfAllCaps
} from '../../../src/web/react/app/ingredientsCreateRules';

describe('ingredientsCreateRules', () => {
  it('detects the ingredients management form key case-insensitively', () => {
    expect(isIngredientsManagementForm('Config: Ingredients Management')).toBe(true);
    expect(isIngredientsManagementForm('config: ingredients management')).toBe(true);
    expect(isIngredientsManagementForm('Config: Meal Production')).toBe(false);
  });

  it('detects the ingredient name field id', () => {
    expect(isIngredientNameFieldId('INGREDIENT_NAME')).toBe(true);
    expect(isIngredientNameFieldId('ingredient_name')).toBe(true);
    expect(isIngredientNameFieldId('CREATED_BY')).toBe(false);
  });

  it('normalizes ingredient names to title case per word', () => {
    expect(normalizeIngredientNameIfAllCaps('TOMATO')).toBe('Tomato');
    expect(normalizeIngredientNameIfAllCaps('SUN-DRIED TOMATO')).toBe('Sun-Dried Tomato');
    expect(normalizeIngredientNameIfAllCaps('BuRATTA')).toBe('Buratta');
    expect(normalizeIngredientNameIfAllCaps('BURATTA ')).toBe('Buratta ');
    expect(normalizeIngredientNameIfAllCaps('Fresh tomato')).toBe('Fresh Tomato');
  });

  it('validates ingredient name rules', () => {
    expect(isValidIngredientName('T')).toBe(false);
    expect(isValidIngredientName('To')).toBe(true);
    expect(isValidIngredientName('Sun-Dried Tomato')).toBe(true);
    expect(isValidIngredientName('Tomato!')).toBe(false);
  });

  it('returns validation messages for invalid names', () => {
    expect(getIngredientNameValidationMessage('')).toBe('Ingredient name is required.');
    expect(getIngredientNameValidationMessage('T')).toBe('Ingredient name must be at least 2 characters.');
    expect(getIngredientNameValidationMessage('Tomato!')).toBe(
      'Ingredient name can only include letters, numbers, spaces, and dashes.'
    );
    expect(getIngredientNameValidationMessage('TOMATO')).toBe('');
  });

  it('requires created by + valid ingredient name before create autosave', () => {
    expect(isIngredientCreateAutoSaveReady({ CREATED_BY: '', INGREDIENT_NAME: 'Tomato' } as any)).toBe(false);
    expect(isIngredientCreateAutoSaveReady({ CREATED_BY: 'Que', INGREDIENT_NAME: '' } as any)).toBe(false);
    expect(isIngredientCreateAutoSaveReady({ CREATED_BY: 'Que', INGREDIENT_NAME: 'T' } as any)).toBe(false);
    expect(isIngredientCreateAutoSaveReady({ CREATED_BY: 'Que', INGREDIENT_NAME: 'TOMATO' } as any)).toBe(true);
  });

  it('sets status and effective dates when activating ingredient', () => {
    const next = applyIngredientActivationSystemFields(
      {
        CREATED_BY: 'Hector',
        INGREDIENT_NAME: 'Gallina',
        STATUS: 'Draft'
      } as any,
      new Date(2026, 1, 8)
    );

    expect(next.STATUS).toBe(INGREDIENT_ACTIVE_STATUS);
    expect(next.EFFECTIVE_START_DATE).toBe('2026-02-08');
    expect(next.EFFECTIVE_END_DATE).toBe(INGREDIENT_ACTIVE_EFFECTIVE_END_DATE);
  });
});
