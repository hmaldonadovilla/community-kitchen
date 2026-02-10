import fs from 'fs';
import path from 'path';

const STAGING_CONFIG_DIR = path.resolve(__dirname, '../../docs/config/exports/staging');

const readConfig = (fileName: string): any => {
  const filePath = path.join(STAGING_CONFIG_DIR, fileName);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
};

const findQuestion = (questions: any[], id: string): any => {
  const question = (questions || []).find(entry => entry?.id === id);
  if (!question) throw new Error(`Missing question ${id}`);
  return question;
};

describe('staging integrity dialogs and list legend config', () => {
  const hasNonEmptyEnText = (value: any): boolean => typeof value?.en === 'string' && value.en.trim().length > 0;
  const containsIcons = (legend: any[], expectedIcons: string[]) => {
    const icons = new Set((legend || []).map(item => (item?.icon || '').toString().trim().toLowerCase()).filter(Boolean));
    expectedIcons.forEach(icon => expect(icons.has(icon)).toBe(true));
  };
  const assertLegendColumnWidthsValid = (value: any) => {
    if (value === undefined || value === null) return;
    expect(Array.isArray(value)).toBe(true);
    expect(value.length).toBe(2);
    const first = Number(value[0]);
    const second = Number(value[1]);
    expect(Number.isFinite(first)).toBe(true);
    expect(Number.isFinite(second)).toBe(true);
    expect(first).toBeGreaterThan(0);
    expect(second).toBeGreaterThan(0);
  };

  test('recipes list legend keeps required action icons and valid layout config', () => {
    const cfg = readConfig('config_recipes.json');

    const formLegend = Array.isArray(cfg.form?.listViewLegend) ? cfg.form.listViewLegend : [];
    const defLegend = Array.isArray(cfg.definition?.listView?.legend) ? cfg.definition.listView.legend : [];
    expect(formLegend.length).toBeGreaterThanOrEqual(3);
    expect(defLegend.length).toBeGreaterThanOrEqual(3);
    containsIcons(formLegend, ['edit', 'view', 'copy']);
    containsIcons(defLegend, ['edit', 'view', 'copy']);

    const formColumnsRaw = Number(cfg.form?.listViewLegendColumns);
    const defColumnsRaw = Number(cfg.definition?.listView?.legendColumns);
    expect(Number.isFinite(formColumnsRaw)).toBe(true);
    expect(Number.isFinite(defColumnsRaw)).toBe(true);
    expect(formColumnsRaw).toBeGreaterThanOrEqual(1);
    expect(formColumnsRaw).toBeLessThanOrEqual(2);
    expect(defColumnsRaw).toBeGreaterThanOrEqual(1);
    expect(defColumnsRaw).toBeLessThanOrEqual(2);
    assertLegendColumnWidthsValid(cfg.form?.listViewLegendColumnWidths);
    assertLegendColumnWidthsValid(cfg.definition?.listView?.legendColumnWidths);

    const formActionCases = cfg.form?.listViewColumns?.find((col: any) => col?.fieldId === 'action')?.cases || [];
    const defActionCases = cfg.definition?.listView?.columns?.find((col: any) => col?.fieldId === 'action')?.cases || [];
    const formActionIcons = new Set(formActionCases.map((entry: any) => (entry?.icon || '').toString().trim().toLowerCase()).filter(Boolean));
    const defActionIcons = new Set(defActionCases.map((entry: any) => (entry?.icon || '').toString().trim().toLowerCase()).filter(Boolean));
    expect(formActionIcons.has('edit')).toBe(true);
    expect(formActionIcons.has('view')).toBe(true);
    expect(defActionIcons.has('edit')).toBe(true);
    expect(defActionIcons.has('view')).toBe(true);
  });

  test('meal production keeps critical data-integrity dialogs wired', () => {
    const cfg = readConfig('config_meal_production.json');

    const assertMainHomeDialog = (root: any) => {
      const dialog = root?.actionBars?.system?.home?.dedupIncompleteDialog;
      expect(dialog?.enabled).toBe(true);
      expect(hasNonEmptyEnText(dialog?.title)).toBe(true);
      expect(hasNonEmptyEnText(dialog?.message)).toBe(true);
      expect(hasNonEmptyEnText(dialog?.confirmLabel)).toBe(true);
      expect(hasNonEmptyEnText(dialog?.cancelLabel)).toBe(true);
      expect(dialog?.showCancel).toBe(true);
      expect(dialog?.showCloseButton).toBe(false);
      expect(dialog?.dismissOnBackdrop).toBe(false);
      expect(dialog?.deleteRecordOnConfirm).toBe(true);
    };

    const assertChangeDialogs = (questions: any[]) => {
      const customer = findQuestion(questions, 'MP_DISTRIBUTOR');
      expect(customer?.changeDialog?.when).toEqual({ fieldId: 'MP_PREP_DATE', notEmpty: true });
      expect(hasNonEmptyEnText(customer?.changeDialog?.title)).toBe(true);
      expect(hasNonEmptyEnText(customer?.changeDialog?.message)).toBe(true);
      expect(hasNonEmptyEnText(customer?.changeDialog?.confirmLabel)).toBe(true);
      expect(hasNonEmptyEnText(customer?.changeDialog?.cancelLabel)).toBe(true);

      const prepDate = findQuestion(questions, 'MP_PREP_DATE');
      expect(prepDate?.changeDialog?.when).toEqual({
        all: [
          { fieldId: 'MP_SERVICE', notEmpty: true },
          { fieldId: 'MP_PREP_DATE', isInFuture: true }
        ]
      });
      expect(hasNonEmptyEnText(prepDate?.changeDialog?.title)).toBe(true);
      expect(hasNonEmptyEnText(prepDate?.changeDialog?.message)).toBe(true);
      expect(hasNonEmptyEnText(prepDate?.changeDialog?.confirmLabel)).toBe(true);
      expect(hasNonEmptyEnText(prepDate?.changeDialog?.cancelLabel)).toBe(true);
    };

    assertMainHomeDialog(cfg.form);
    assertMainHomeDialog(cfg.definition);
    assertChangeDialogs(cfg.questions);
    assertChangeDialogs(cfg.definition?.questions || []);
  });

  test('ingredients management uses field-based home leave guard dialog', () => {
    const cfg = readConfig('config_ingredients_mgmt.json');
    const dialog = cfg.form?.actionBars?.system?.home?.incompleteFieldsDialog;
    expect(dialog?.enabled).toBe(true);
    expect(dialog?.criteria).toBe('fieldIds');
    expect(Array.isArray(dialog?.fieldIds)).toBe(true);
    expect(dialog?.fieldIds).toEqual(['INGREDIENT_NAME', 'CREATED_BY']);
    expect(hasNonEmptyEnText(dialog?.title)).toBe(true);
    expect(hasNonEmptyEnText(dialog?.message)).toBe(true);
    expect(hasNonEmptyEnText(dialog?.confirmLabel)).toBe(true);
    expect(hasNonEmptyEnText(dialog?.cancelLabel)).toBe(true);

    expect(cfg.form?.createButtonLabel?.en).toBe('new ingredient');

    const legend = Array.isArray(cfg.form?.listViewLegend) ? cfg.form.listViewLegend : [];
    const legendIcons = new Set(legend.map((item: any) => (item?.icon || '').toString().trim().toLowerCase()).filter(Boolean));
    expect(legend.length).toBe(4);
    expect(legendIcons.has('view')).toBe(true);
    expect(legendIcons.has('edit')).toBe(true);
    expect(legendIcons.has('copy')).toBe(false);
    const legendPills = legend
      .map((item: any) => (item?.pill?.text?.en || '').toString().trim().toLowerCase())
      .filter(Boolean);
    expect(legendPills.includes('disabled')).toBe(false);

    const editCases = cfg.form?.listViewColumns?.find((col: any) => col?.fieldId === 'action_edit')?.cases || [];
    expect(editCases.length).toBe(1);
    expect(editCases[0]?.when?.fieldId).toBe('status');
    expect(editCases[0]?.when?.equals).toBe('Draft');
    const hasCopyColumn = Array.isArray(cfg.form?.listViewColumns)
      ? cfg.form.listViewColumns.some((col: any) => col?.fieldId === 'action_copy')
      : false;
    expect(hasCopyColumn).toBe(false);
  });
});
