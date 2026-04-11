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
      expect(customer?.dataSource?.mapping?.value).toBe('NICKNAME');
      expect(customer?.dataSource?.mapping?.label).toBeUndefined();
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
      expect(root?.steps?.waitForUploadsDialog?.title?.en).toBe('Please wait');
      expect(root?.steps?.waitForUploadsDialog?.message?.en).toBe('Please wait while your photos finish uploading.');
      expect(root?.steps?.waitForUploadsDialog?.showCancel).toBe(false);
      const leftoverBank = items.find((entry: any) => entry?.id === 'leftoverForm');
      const portioning = items.find((entry: any) => entry?.id === 'portioning');
      const leftovers = items.find((entry: any) => entry?.id === 'leftovers');
      const contextHeaderSteps = items.filter((entry: any) => Array.isArray(entry?.contextHeader?.parts));

      expect(leftoverBank?.label?.en).toBe('Leftover bank');
      expect(leftoverBank?.includeWhen).toBeUndefined();
      expect(leftoverBank?.excludeWhen).toEqual({
        fieldId: 'status',
        equals: ['Emailed', 'Closed']
      });
      expect(contextHeaderSteps.length).toBeGreaterThan(0);
      contextHeaderSteps.forEach((step: any) => {
        expect(step.contextHeader.parts?.[0]).toEqual({
          id: 'MP_DISTRIBUTOR',
          displayField: 'DIST_NAME'
        });
      });
      const leftoverBankMeals = (leftoverBank?.include || []).find(
        (entry: any) => entry?.kind === 'lineGroup' && entry?.id === 'MP_MEALS_REQUEST'
      );
      const leftoverDataSourceRows = Array.isArray(leftoverBankMeals?.dataSourceRows)
        ? leftoverBankMeals.dataSourceRows
        : [];
      const leftoverInventoryRows = leftoverDataSourceRows.find((entry: any) => entry?.id === 'leftoverInventoryRows');
      expect(leftoverInventoryRows?.presentation).toBe('sourceFirstAllocations');
      expect(leftoverInventoryRows?.presentationWhen).toEqual({
        fieldId: '__ckStep',
        equals: ['leftoverForm']
      });
      expect(leftoverInventoryRows?.hideParentRowsWhenPresentationActive).toBe(true);
      expect(leftoverInventoryRows?.allocationLabelFieldId).toBe('MEAL_TYPE');
      expect(leftoverInventoryRows?.sourceMatchFieldId).toBe('DIETARY_APPLICABILITY');
      expect(leftoverInventoryRows?.parentMatchFieldId).toBe('MEAL_TYPE');
      expect(leftoverInventoryRows?.sourceMatchMode).toBe('includesDelimited');
      expect(leftoverInventoryRows?.sourceMatchDelimiter).toBe(',');
      expect(leftoverInventoryRows?.dataSource?.projection).toEqual(
        expect.arrayContaining([
          'DIETARY_APPLICABILITY',
          'LEFTOVER_SOURCE_FORM_KEY',
          'LEFTOVER_SOURCE_RECORD_ID',
          'LEFTOVER_SOURCE_ROW_ID'
        ])
      );
      expect(leftoverInventoryRows?.dataSource?.prefetchOnHome).toBe(true);
      const hiddenLeftoverIdFields = collectObjects(root, (entry: any) => entry?.id === 'LEFTOVER_ID');
      expect(hiddenLeftoverIdFields.length).toBeGreaterThan(0);
      hiddenLeftoverIdFields.forEach((field: any) => {
        expect(field?.visibility).toEqual({
          showWhen: {
            fieldId: 'NEVER_SHOW',
            equals: '1'
          }
        });
        expect(field?.dataSource).toBeUndefined();
      });
      expect(leftoverInventoryRows?.dataSource?.backfill?.whenMissingAnyFieldIds).toEqual(
        expect.arrayContaining(['LEFTOVER_RECIPE', 'LEFTOVER_INGREDIENT', 'LEFTOVER_MEAL_TYPE', 'DIETARY_APPLICABILITY'])
      );
      expect(leftoverInventoryRows?.dataSource?.backfill?.sourceFormKeyFieldId).toBe('LEFTOVER_SOURCE_FORM_KEY');
      expect(leftoverInventoryRows?.dataSource?.backfill?.sourceRecordIdFieldId).toBe('LEFTOVER_SOURCE_RECORD_ID');
      expect(leftoverInventoryRows?.dataSource?.backfill?.sourceRowIdFieldId).toBe('LEFTOVER_SOURCE_ROW_ID');
      expect(leftoverInventoryRows?.dataSource?.backfill?.scopes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: 'mealRow', groupId: 'MP_MEALS_REQUEST' }),
          expect.objectContaining({ id: 'cookRow', groupId: 'MP_TYPE_LI' }),
          expect.objectContaining({ id: 'partialRow', groupId: 'MP_LEFTOVER_CAPTURE_LI' })
        ])
      );
      const partialLeftoversTarget = (leftovers?.include || []).find(
        (entry: any) => entry?.id === 'MP_LEFTOVER_CAPTURE_LI'
      );
      expect(partialLeftoversTarget?.kind).toBe('lineGroup');
      const partialRowScope = (leftoverInventoryRows?.dataSource?.backfill?.scopes || []).find(
        (entry: any) => entry?.id === 'partialRow'
      );
      expect(partialRowScope?.fallbackMatch).toBeUndefined();
      expect(leftoverInventoryRows?.dataSource?.backfill?.values?.LEFTOVER_RECIPE).toBe('{{cookRow.RECIPE}}');
      expect(leftoverInventoryRows?.dataSource?.backfill?.values?.LEFTOVER_MEAL_TYPE).toBe('{{mealRow.MEAL_TYPE}}');
      expect(leftoverInventoryRows?.dataSource?.backfill?.values?.LEFTOVER_INGREDIENT).toBe('{{partialRow.LEFTOVER_INGREDIENT}}');
      expect(leftoverInventoryRows?.dataSource?.backfill?.values?.DIETARY_APPLICABILITY).toEqual(
        expect.objectContaining({
          op: 'lookupSetIntersection',
          collectionPath: 'cookRow.MP_INGREDIENTS_LI',
          itemFieldId: 'ING',
          lookupFormKey: 'Config: Ingredients Management',
          lookupKeyFieldId: 'INGREDIENT_NAME',
          lookupValueFieldId: 'DIETARY_APPLICABILITY',
          fallback: '{{partialRow.LEFTOVER_DIETARY_APPLICABILITY}}'
        })
      );
      expect(leftoverInventoryRows?.ui?.emptyStateMessage?.en).toBe('No compatible leftovers are available for the current dishes.');
      expect(leftoverInventoryRows?.ui?.noSourceRowsMessage?.en).toBe('There is currently no leftover.');
      expect(leftoverInventoryRows?.reservation?.commitMode).toBe('step');
      expect(leftoverInventoryRows?.reservation?.resourceRecordIdFieldId).toBe('LEFTOVER_RECORD_ID');
      expect(leftoverInventoryRows?.sourceFieldMapping).toEqual(
        expect.objectContaining({
          LEFTOVER_MEAL_TYPE: 'LEFTOVER_MEAL_TYPE',
          LEFTOVER_RECIPE: 'LEFTOVER_RECIPE',
          LEFTOVER_INGREDIENT: 'LEFTOVER_INGREDIENT',
          DIETARY_APPLICABILITY: 'DIETARY_APPLICABILITY'
        })
      );
      expect(leftoverInventoryRows?.ui?.compactDetailRows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            when: expect.objectContaining({ fieldId: 'LEFTOVER_KIND', equals: 'Part dish' })
          }),
          expect.objectContaining({
            when: expect.objectContaining({ fieldId: 'LEFTOVER_KIND', equals: 'Entire dish' })
          })
        ])
      );
      expect(portioning?.label?.en).toBe('Portioning');
      expect(portioning?.excludeWhen).toEqual({
        fieldId: 'status',
        equals: ['Emailed', 'Closed']
      });
      expect(leftovers?.label?.en).toBe('Leftovers');
      expect(leftovers?.excludeWhen).toBeUndefined();
      expect(root?.submitButtonLabel?.en).toBe('Complete');
      expect(portioning?.navigation?.submitLabel?.en).toBe('Create report');
      expect(portioning?.navigation?.milestoneAction?.type).toBe('followupBatch');
      expect(portioning?.navigation?.milestoneAction?.preActions).toEqual([
        'RECONCILE_RESERVATIONS'
      ]);
      expect(portioning?.navigation?.milestoneAction?.backgroundActions).toEqual([
        'CREATE_PDF',
        'SEND_EMAIL'
      ]);
      expect(portioning?.navigation?.milestoneAction?.runInBackground).toBe(true);
      expect(portioning?.navigation?.milestoneAction?.validationScope).toBe('throughCurrentStep');
      expect(portioning?.navigation?.milestoneAction?.waitForQueue).toBe('all');
      expect(portioning?.navigation?.milestoneAction?.advanceAfterStart).toBe(true);
      expect(portioning?.navigation?.milestoneAction?.confirmationDialog?.title?.en).toBe('Please confirm');
      expect(portioning?.navigation?.milestoneAction?.confirmationDialog?.message?.en).toBe(
        'Confirm that {MP_SERVICE} for {MP_DISTRIBUTOR} on {MP_PREP_DATE} has been produced by {MP_COOK_NAME} in line with the Meal Production procedure and hygiene rules.\n\nAll ordered portions are ready for delivery.'
      );
      expect(portioning?.navigation?.milestoneAction?.confirmationDialog?.confirmLabel?.en).toBe(
        'Yes, create final report'
      );
      expect(portioning?.navigation?.milestoneAction?.confirmationDialog?.cancelLabel?.en).toBe(
        'No, go back to portioning'
      );
      expect(portioning?.navigation?.milestoneAction?.feedbackDialog?.title?.en).toBe('Leftovers');
      expect(portioning?.navigation?.milestoneAction?.feedbackDialog?.message?.en).toBe(
        'Record any leftovers.\nIf none, click Complete.'
      );
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
      expect(root?.submissionAfterSubmit?.waitForQueue).toBe('uploadsOnly');
      expect(root?.submissionAfterSubmit?.navigateTo).toBe('list');
      expect(root?.submissionAfterSubmit?.confirmationDialogCases).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            when: expect.objectContaining({
              any: expect.arrayContaining([
                expect.objectContaining({
                  lineItems: expect.objectContaining({
                    groupId: 'MP_MEALS_REQUEST',
                    subGroupPath: ['MP_TYPE_LI'],
                    match: 'any',
                    when: expect.objectContaining({
                      fieldId: 'MP_LEFTOVER_PORTIONS_CAPTURE',
                      greaterThan: 0
                    })
                  })
                })
              ])
            }),
            dialog: expect.objectContaining({
              message: expect.objectContaining({
                en: 'Please confirm that all leftovers have been recorded. Remember to label and store leftovers according to storage procedure.'
              })
            })
          })
        ])
      );
      expect(root?.submissionAfterSubmit?.confirmationDialog?.message?.en).toBe('Please confirm there is no leftover.');
      expect(root?.submissionAfterSubmit?.generatedRecordsDialog).toEqual(
        expect.objectContaining({
          targetFormKey: 'Config: Leftover Inventory',
          title: expect.objectContaining({ en: 'Generated leftovers' })
        })
      );

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
        'FINAL_QTY',
        'MP_LEFTOVER_PORTIONS_CAPTURE'
      ]);
      expect(leftovers?.navigation?.milestoneAction?.type).toBe('followupBatch');
      expect(leftovers?.navigation?.milestoneAction?.preActions).toEqual(['CLOSE_RECORD']);
      expect(leftovers?.navigation?.milestoneAction?.waitForQueue).toBe('all');
      expect(leftovers?.navigation?.milestoneAction?.advanceAfterStart).toBe(false);
      expect(leftovers?.navigation?.milestoneAction?.navigateToAfterSuccess).toBe('list');
      expect(leftovers?.navigation?.milestoneAction?.confirmationDialogCases).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            when: expect.objectContaining({
              any: expect.arrayContaining([
                expect.objectContaining({
                  lineItems: expect.objectContaining({
                    groupId: 'MP_MEALS_REQUEST',
                    subGroupPath: ['MP_TYPE_LI'],
                    match: 'any',
                    when: expect.objectContaining({
                      fieldId: 'MP_LEFTOVER_PORTIONS_CAPTURE',
                      greaterThan: 0
                    })
                  })
                })
              ])
            }),
            dialog: expect.objectContaining({
              message: expect.objectContaining({
                en: 'Please confirm that all leftovers have been recorded. Remember to label and store leftovers according to storage procedure.'
              })
            })
          })
        ])
      );
      expect(leftovers?.navigation?.milestoneAction?.confirmationDialog?.message?.en).toBe(
        'Please confirm there is no leftover.'
      );
      expect(leftovers?.navigation?.milestoneAction?.generatedRecordsDialog).toEqual(
        expect.objectContaining({
          targetFormKey: 'Config: Leftover Inventory',
          title: expect.objectContaining({ en: 'Generated leftovers' })
        })
      );

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
      expect(entireDishEffect?.sourceLink).toEqual({
        sourceRecordIdFieldId: 'LEFTOVER_SOURCE_RECORD_ID',
        sourceFormKeyFieldId: 'LEFTOVER_SOURCE_FORM_KEY'
      });
      expect(entireDishEffect?.forEachLineItem?.groupId).toBe('MP_MEALS_REQUEST');
      expect(entireDishEffect?.forEachLineItem?.subGroupPath).toEqual(['MP_TYPE_LI']);
      expect(entireDishEffect?.values?.DIETARY_APPLICABILITY).toEqual(
        expect.objectContaining({
          op: 'lookupSetIntersection',
          collectionPath: 'row.MP_INGREDIENTS_LI',
          itemFieldId: 'ING',
          lookupFormKey: 'Config: Ingredients Management',
          lookupKeyFieldId: 'INGREDIENT_NAME',
          lookupValueFieldId: 'DIETARY_APPLICABILITY'
        })
      );
      const partialDishEffect = followupEffects.find((entry: any) => entry?.id === 'captureProducedLeftovers');
      expect(partialDishEffect?.sourceLink).toEqual({
        sourceRecordIdFieldId: 'LEFTOVER_SOURCE_RECORD_ID',
        sourceFormKeyFieldId: 'LEFTOVER_SOURCE_FORM_KEY'
      });
      expect(partialDishEffect?.values?.DIETARY_APPLICABILITY).toBe('{{row.LEFTOVER_DIETARY_APPLICABILITY}}');
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
    expect(cfg.form?.reservationLifecycle?.reconcileOnFinalSubmit?.refreshMode).toBe('revisionOnly');
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
