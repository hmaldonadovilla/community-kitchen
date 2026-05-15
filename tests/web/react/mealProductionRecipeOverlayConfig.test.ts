import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '../../..');
const configPath = path.join(root, 'docs/config/exports/staging/config_meal_production.json');
const templatePath = path.join(root, 'docs/templates/mp.ing_recipe.html');
const formStylesPath = path.join(root, 'src/web/react/components/form/styles.ts');

const viewHelper = "Review recipe ingredients for today's dish. Tap ✏️ to adjust ingredients if needed.";
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
      expect(body.edit.rowSort).toEqual({ fieldId: 'ING', direction: 'asc', mode: 'text', newRows: 'firstUntilSave' });
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
      expect(group.ui.rowSort).toEqual({ fieldId: 'ING', direction: 'asc', mode: 'text', newRows: 'firstUntilSave' });
      expect(group.addButtonLabel.en).toBe('Add ingredients');
      expect(group.addOverlay.title.en).toBe('Add ingredients');
      expect(group.addOverlay.helperText.en).toBe('Search and select ingredients to adjust today’s dish recipe.');
      expect(group.addOverlay.searchHelperText.en).toBe('Enter exact ingredient name (example: tomato, not tom).');
    });
  });

  test('embeds the edit ingredients action in the ingredient tab', () => {
    const template = fs.readFileSync(templatePath, 'utf8');
    expect(template.indexOf('class="ck-ingredients-table"')).toBeGreaterThan(-1);
    expect(template).toContain('class="ck-tab-row"');
    expect(template).toContain('grid-template-columns: 1fr 5fr;');
    expect(template).toContain('grid-template-columns: 2fr 3fr;');
    expect(template).toContain('class="ck-tab-edit-button"');
    expect(template).toContain('data-ck-action="edit"');
    expect(template).toContain('aria-label="Edit ingredients"');
    expect(template).toContain('background: var(--accent, #0B5ED7);');
    expect(template).toContain('color: var(--accentText, #fff);');
    expect(template.indexOf('data-ck-action="edit"')).toBeLessThan(template.indexOf('id="ck-tab-btn-ingredients"'));
    expect(template).not.toContain('class="ck-panel-actions"');
  });

  test('keeps recipe edit controls sticky above long ingredient tables', () => {
    const formStyles = fs.readFileSync(formStylesPath, 'utf8');
    expect(formStyles).toContain('.ck-overlay-detail-edit-actions {');
    expect(formStyles).toContain('position: sticky;');
    expect(formStyles).toContain('.ck-overlay-detail-edit-layout .ck-line-item-table thead th');
    expect(formStyles).toContain('top: calc(var(--ck-overlay-detail-edit-actions-height, 72px) + 8px);');
    expect(formStyles).toContain('.ck-inline-pencil-icon svg');
  });
});
