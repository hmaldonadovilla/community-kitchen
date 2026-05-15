import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '../../..');
const configPath = path.join(root, 'docs/config/exports/staging/config_meal_production.json');
const templatePath = path.join(root, 'docs/templates/mp.ing_recipe.html');

const viewHelper = 'Review recipe ingredients for today’s dish. Tap “Edit ingredients” to adjust ingredients if needed.';
const editHelper =
  'Adjust ingredients to match today’s dish. Add, update, or remove ingredients as needed. At least one ingredient must remain.';

const collectObjects = (node: unknown, predicate: (value: Record<string, any>) => boolean, out: Record<string, any>[] = []) => {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    node.forEach(item => collectObjects(item, predicate, out));
    return out;
  }
  const value = node as Record<string, any>;
  if (predicate(value)) out.push(value);
  Object.values(value).forEach(item => collectObjects(item, predicate, out));
  return out;
};

describe('meal production recipe ingredient overlay configuration', () => {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

  test('shows meal production record identity on every guided step', () => {
    const steps = config.definition.steps.items;
    expect(steps.length).toBeGreaterThan(0);
    steps.forEach((step: any) => {
      expect(step.contextHeader?.parts).toEqual([
        { id: 'MP_DISTRIBUTOR', displayField: 'DIST_NAME' },
        'MP_SERVICE',
        'MP_PREP_DATE'
      ]);
    });
  });

  test('uses mode-specific framed helper copy and return label for recipe detail overlays', () => {
    const effects = collectObjects(
      config,
      value => value.type === 'openOverlay' && value.groupId === 'MP_TYPE_LI' && value.groupOverride?.id === 'MP_TYPE_LI'
    );

    expect(effects).toHaveLength(2);
    effects.forEach(effect => {
      expect(effect.label).toBeUndefined();
      const body = effect.groupOverride.ui.overlayDetail.body;
      expect(body.view.helperText.en).toBe(viewHelper);
      expect(body.edit.helperText.en).toBe(editHelper);
      expect(body.edit.saveLabel.en).toBe('Back to View Recipe');
      expect(body.edit.rowSort).toEqual({ fieldId: 'ING', direction: 'asc', mode: 'text' });
    });
  });

  test('sorts recipe ingredient edit rows and uses the adjusted ingredient search copy', () => {
    const ingredientGroups = collectObjects(
      config,
      value =>
        value.id === 'MP_INGREDIENTS_LI' &&
        Array.isArray(value.fields) &&
        value.fields.some((field: any) => field.id === 'ING') &&
        value.fields.some((field: any) => field.id === 'QTY') &&
        value.fields.some((field: any) => field.id === 'UNIT')
    );

    expect(ingredientGroups).toHaveLength(2);
    ingredientGroups.forEach(group => {
      expect(group.ui.rowSort).toEqual({ fieldId: 'ING', direction: 'asc', mode: 'text' });
      expect(group.addButtonLabel.en).toBe('Add ingredients');
      expect(group.addOverlay.title.en).toBe('Add ingredients');
      expect(group.addOverlay.helperText.en).toBe('Search and select ingredients to adjust today’s dish recipe.');
      expect(group.addOverlay.searchHelperText.en).toBe('Enter exact ingredient name (example: tomato, not tom).');
    });
  });

  test('keeps the edit ingredients action below the ingredient table', () => {
    const template = fs.readFileSync(templatePath, 'utf8');
    expect(template.indexOf('class="ck-ingredients-table"')).toBeGreaterThan(-1);
    expect(template.indexOf('data-ck-action="edit"')).toBeGreaterThan(template.indexOf('</table>'));
    expect(template).toContain('margin-top: 18px;');
  });
});
