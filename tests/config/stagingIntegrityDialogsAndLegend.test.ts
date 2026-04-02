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
  const collectObjects = (value: any, predicate: (entry: any) => boolean, acc: any[] = []): any[] => {
    if (Array.isArray(value)) {
      value.forEach(entry => collectObjects(entry, predicate, acc));
      return acc;
    }
    if (!value || typeof value !== 'object') return acc;
    if (predicate(value)) acc.push(value);
    Object.values(value).forEach(entry => collectObjects(entry, predicate, acc));
    return acc;
  };
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

    const assertClosedListActions = (root: any) => {
      const columns = Array.isArray(root?.listViewColumns)
        ? root.listViewColumns
        : Array.isArray(root?.listView?.columns)
          ? root.listView.columns
          : [];
      const actionCases = columns.find((col: any) => col?.fieldId === 'action')?.cases || [];
      const closedCase = actionCases.find(
        (entry: any) => entry?.when?.fieldId === 'status' && entry?.when?.equals === 'Closed'
      );
      expect(closedCase?.actions?.length).toBe(2);
      expect(closedCase?.actions?.[0]?.icon).toBe('view');
      expect(closedCase?.actions?.[0]?.openView).toBe('summary');
      expect(closedCase?.actions?.[1]?.icon).toBe('copy');
      expect(closedCase?.actions?.[1]?.openView).toBe('copy');
    };

    const assertPastIncompleteWarningAction = (root: any) => {
      const columns = Array.isArray(root?.listViewColumns)
        ? root.listViewColumns
        : Array.isArray(root?.listView?.columns)
          ? root.listView.columns
          : [];
      const actionCases = columns.find((col: any) => col?.fieldId === 'action')?.cases || [];
      const pastIncompleteCase = actionCases.find(
        (entry: any) =>
          Array.isArray(entry?.when?.all) &&
          entry.when.all.some((clause: any) => clause?.fieldId === 'status' && clause?.notEquals === 'Closed') &&
          entry.when.all.some((clause: any) => clause?.fieldId === 'MP_PREP_DATE' && clause?.isInPast === true)
      );
      expect(pastIncompleteCase?.actions?.length).toBe(1);
      expect(pastIncompleteCase?.actions?.[0]?.icon).toBe('warning');
      expect(pastIncompleteCase?.actions?.[0]?.style).toBe('warning');
      expect(pastIncompleteCase?.actions?.[0]?.openView).toBe('summary');
    };

    const assertMealProductionLegend = (root: any) => {
      const legend = Array.isArray(root?.listViewLegend)
        ? root.listViewLegend
        : Array.isArray(root?.listView?.legend)
          ? root.listView.legend
          : [];
      expect(legend.length).toBe(4);
      containsIcons(legend, ['edit', 'view', 'copy', 'warning']);

      const columnsRaw = Number(root?.listViewLegendColumns ?? root?.listView?.legendColumns);
      expect(columnsRaw).toBe(2);

      const widths = root?.listViewLegendColumnWidths ?? root?.listView?.legendColumnWidths;
      assertLegendColumnWidthsValid(widths);
    };

    const assertSearchPresets = (questions: any[]) => {
      const past = findQuestion(questions, 'PAST_7_DAYS_BTN');
      expect(past?.button?.action).toBe('listViewSearchPreset');
      expect(past?.button?.lookbackDays).toBe(7);
      expect(past?.button?.includeToday).toBe(false);

      const future = findQuestion(questions, 'NEXT_7_DAYS_BTN');
      expect(future?.button?.action).toBe('listViewSearchPreset');
      expect(future?.button?.lookaheadDays).toBe(7);
      expect(future?.button?.includeToday).toBe(true);
    };

    const assertGuidedStepLayout = (root: any, questions: any[]) => {
      const items = Array.isArray(root?.steps?.items) ? root.steps.items : [];
      const leftoverBank = items.find((entry: any) => entry?.id === 'leftoverForm');
      const portioning = items.find((entry: any) => entry?.id === 'portioning');
      const leftovers = items.find((entry: any) => entry?.id === 'leftovers');

      expect(leftoverBank?.label?.en).toBe('Leftover bank');
      expect(leftoverBank?.includeWhen).toEqual({
        fieldId: '__ckDataSourceCount.Leftover Inventory Data',
        greaterThan: 0
      });
      expect(leftoverBank?.excludeWhen).toEqual({
        fieldId: 'status',
        equals: ['Emailed', 'Closed']
      });
      expect(portioning?.label?.en).toBe('Portioning');
      expect(portioning?.excludeWhen).toEqual({
        fieldId: 'status',
        equals: ['Emailed', 'Closed']
      });
      expect(leftovers?.label?.en).toBe('Leftovers');
      expect(leftovers?.excludeWhen).toBeUndefined();
      expect(portioning?.navigation?.submitLabel?.en).toBe('Complete portioning');
      expect(portioning?.navigation?.milestoneAction?.type).toBe('followupBatch');
      expect(portioning?.navigation?.milestoneAction?.actions).toEqual([
        'RECONCILE_RESERVATIONS',
        'CREATE_PDF',
        'SEND_EMAIL'
      ]);
      expect(portioning?.navigation?.milestoneAction?.runInBackground).toBe(true);
      expect(portioning?.navigation?.milestoneAction?.validationScope).toBe('throughCurrentStep');
      expect(portioning?.navigation?.milestoneAction?.waitForBackgroundSaves).toBe(true);
      expect(portioning?.navigation?.milestoneAction?.advanceAfterStart).toBe(true);
      expect(portioning?.navigation?.milestoneAction?.confirmationDialog?.title?.en).toBe('Please confirm');
      expect(portioning?.navigation?.milestoneAction?.feedbackDialog?.title?.en).toBe('Background actions started');
      expect(portioning?.navigation?.milestoneAction?.feedbackDialog?.showCancel).toBe(false);
      expect(portioning?.navigation?.milestoneAction?.feedbackDialog?.showCloseButton).toBe(false);
      expect(portioning?.navigation?.milestoneAction?.feedbackDialog?.dismissOnBackdrop).toBe(false);
      ['orderInfo', 'deliveryForm', 'foodSafety'].forEach(stepId => {
        const step = items.find((entry: any) => entry?.id === stepId);
        expect(step?.excludeWhen).toEqual({
          fieldId: 'status',
          equals: ['Emailed', 'Closed']
        });
      });
      expect(root?.submissionAfterSubmit?.preActions).toEqual(['CLOSE_RECORD']);
      expect(root?.submissionAfterSubmit?.backgroundActions).toBeUndefined();
      expect(root?.submissionAfterSubmit?.navigateTo).toBe('summary');
      expect(root?.submissionAfterSubmit?.feedbackDialog?.title?.en).toBe('Meal production closed');
      expect(root?.submissionAfterSubmit?.feedbackDialog?.showCancel).toBe(false);
      expect(root?.submissionAfterSubmit?.feedbackDialog?.showCloseButton).toBe(false);
      expect(root?.submissionAfterSubmit?.feedbackDialog?.dismissOnBackdrop).toBe(false);

      const portioningQuestionIds = new Set((portioning?.include || []).map((entry: any) => entry?.id).filter(Boolean));
      expect(portioningQuestionIds.has('MP_HAS_LEFTOVERS_PRODUCED')).toBe(false);
      expect(portioningQuestionIds.has('MP_LEFTOVER_CAPTURE_LI')).toBe(false);

      const leftoversInclude = Array.isArray(leftovers?.include) ? leftovers.include : [];
      const leftoversQuestionIds = new Set(leftoversInclude.map((entry: any) => entry?.id).filter(Boolean));
      expect(leftoversQuestionIds.has('MP_HAS_LEFTOVERS_PRODUCED')).toBe(false);
      expect(leftoversQuestionIds.has('MP_LEFTOVER_CAPTURE_LI')).toBe(true);

      const leftoversMeals = leftoversInclude.find((entry: any) => entry?.kind === 'lineGroup' && entry?.id === 'MP_MEALS_REQUEST');
      expect(leftoversMeals?.presentation).toBe('liftedRowFields');
      expect((leftoversMeals?.fields || []).map((entry: any) => (typeof entry === 'string' ? entry : entry?.id))).toEqual([
        'MEAL_TYPE',
        'MP_LEFTOVER_PORTIONS_CAPTURE'
      ]);

      const partialLeftovers = findQuestion(questions || [], 'MP_LEFTOVER_CAPTURE_LI');
      expect(partialLeftovers?.qEn).toBe('Partial leftovers');
      expect(partialLeftovers?.visibility).toBeUndefined();
      expect(partialLeftovers?.lineItemConfig?.ui?.addButtonPlacement).toBe('top');

      const pdfPreview = findQuestion(questions || [], 'PDF_PREVIEW');
      expect(pdfPreview?.button?.disableWhenValueMissing).toBe(true);

      const meals = findQuestion(questions || [], 'MP_MEALS_REQUEST');
      const mealFields = Array.isArray(meals?.lineItemConfig?.fields) ? meals.lineItemConfig.fields : [];
      const leftoverPortionsField = mealFields.find((entry: any) => entry?.id === 'MP_LEFTOVER_PORTIONS_CAPTURE');
      expect(leftoverPortionsField?.defaultValue).toBeUndefined();

      const followupEffects = Array.isArray(root?.followupConfig?.submitEffects)
        ? root.followupConfig.submitEffects
        : Array.isArray(root?.followup?.submitEffects)
          ? root.followup.submitEffects
          : [];
      const entireDishEffect = followupEffects.find((entry: any) => entry?.id === 'captureProducedEntireDishLeftovers');
      expect(entireDishEffect?.type).toBe('createRecord');
      expect(entireDishEffect?.forEachLineItem?.groupId).toBe('MP_MEALS_REQUEST');
      expect(entireDishEffect?.forEachLineItem?.subGroupPath).toEqual(['MP_TYPE_LI']);
    };

    assertMainHomeDialog(cfg.form);
    assertMainHomeDialog(cfg.definition);
    assertChangeDialogs(cfg.questions);
    assertChangeDialogs(cfg.definition?.questions || []);
    assertClosedListActions(cfg.form);
    assertClosedListActions(cfg.definition);
    assertPastIncompleteWarningAction(cfg.form);
    assertPastIncompleteWarningAction(cfg.definition);
    assertMealProductionLegend(cfg.form);
    assertMealProductionLegend(cfg.definition);
    assertSearchPresets(cfg.questions);
    assertSearchPresets(cfg.definition?.questions || []);
    assertGuidedStepLayout(cfg.form, cfg.questions);
    assertGuidedStepLayout(cfg.definition, cfg.definition?.questions || []);

    const recipeIngredientEffects = collectObjects(
      cfg,
      (entry: any) =>
        entry?.type === 'addLineItemsFromDataSource' &&
        entry?.groupId === 'MP_INGREDIENTS_LI' &&
        entry?.targetPath === 'MP_INGREDIENTS_LI' &&
        entry?.dataField === 'Q65ILNUSGL'
    );
    expect(recipeIngredientEffects.length).toBeGreaterThanOrEqual(4);
    recipeIngredientEffects.forEach((effect: any) => {
      expect(effect?.lineItemMapping?.ING).toBe('ING');
      expect(effect?.lineItemMapping?.QTY).toBe('QTY');
      expect(effect?.lineItemMapping?.UNIT).toBe('UNIT');
      expect(effect?.lineItemMapping?.CAT).toBe('CAT');
      expect(effect?.lineItemMapping?.ALLERGEN).toBe('ALLERGEN');
    });
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
