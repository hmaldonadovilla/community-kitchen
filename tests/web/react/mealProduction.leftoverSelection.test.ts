import { WebFormDefinition } from '../../../src/types';
import { buildSubgroupKey } from '../../../src/web/react/app/lineItems';
import { applyValueMapsToForm } from '../../../src/web/react/app/valueMaps';

const getDefinition = (): WebFormDefinition =>
  JSON.parse(
    JSON.stringify(require('../../../docs/config/exports/staging/config_meal_production.json').definition)
  ) as WebFormDefinition;

const getExport = (): any =>
  JSON.parse(
    JSON.stringify(require('../../../docs/config/exports/staging/config_meal_production.json'))
  );

const getBankExport = (): any =>
  JSON.parse(
    JSON.stringify(require('../../../docs/config/exports/staging/config_leftover_bank.json'))
  );

describe('meal production leftover selection config', () => {
  it('renders the Leftover step from datasource-backed rows instead of a persisted subgroup', () => {
    const definition = getDefinition();
    const exported = getExport();
    const question = definition.questions.find(q => q.id === 'MP_MEALS_REQUEST') as any;
    const leftoverStep = definition.steps?.items?.find((step: any) => step.id === 'leftoverForm');
    const formStep = exported.form?.steps?.items?.find((step: any) => step.id === 'leftoverForm');
    const target = leftoverStep?.include?.find((entry: any) => entry.kind === 'lineGroup' && entry.id === 'MP_MEALS_REQUEST') as any;
    const formTarget = formStep?.include?.find((entry: any) => entry.kind === 'lineGroup' && entry.id === 'MP_MEALS_REQUEST') as any;

    expect(leftoverStep?.helpText).toBeUndefined();
    expect(formStep?.helpText).toBeUndefined();
    expect(target?.dataSourceRows).toHaveLength(1);
    expect(formTarget?.dataSourceRows).toHaveLength(1);
    expect(target?.helperText?.en).toBe(
      'Skip this page if not using leftovers.\nTick the box to use leftovers and adjust quantity if needed.\nFor multi-ingredient leftovers, select Combine or Reheat.\nSingle-ingredient leftovers are combined by default.\nTo remove leftovers, adjust quantity or untick the box.'
    );
    expect(formTarget?.helperText?.en).toBe(
      'Skip this page if not using leftovers.\nTick the box to use leftovers and adjust quantity if needed.\nFor multi-ingredient leftovers, select Combine or Reheat.\nSingle-ingredient leftovers are combined by default.\nTo remove leftovers, adjust quantity or untick the box.'
    );
    expect(target?.dataSourceBootstrap).toEqual({
      waitForGuidedUtilisationSync: true,
      waitForSharedDataMutations: true
    });
    expect(formTarget?.dataSourceBootstrap).toEqual(target?.dataSourceBootstrap);
    expect(target?.subGroups).toBeUndefined();
    expect((question.lineItemConfig.subGroups || []).map((group: any) => group.id)).not.toContain('MP_LEFTOVER_SELECTION_LI');
    expect(
      ((question.lineItemConfig.fields || []).find((field: any) => field.id === 'MEAL_TYPE') || {}).selectionEffects || []
    ).toEqual([]);
  });

  it('configures a background freshness watch for the leftover bank datasource', () => {
    const definition = getDefinition();
    const exported = getExport();
    const formWatches = Array.isArray(exported.form?.recordFreshness?.dataSourceWatches)
      ? exported.form.recordFreshness.dataSourceWatches
      : [];
    const definitionWatches = Array.isArray(definition.recordFreshness?.dataSourceWatches)
      ? definition.recordFreshness?.dataSourceWatches
      : [];

    expect(formWatches).toEqual([
      expect.objectContaining({
        stepId: 'leftoverForm',
        dataSourceIds: ['Leftover Bank Data'],
        quietWindowMs: 30000,
        dialog: expect.objectContaining({
          message: expect.objectContaining({
            en: 'Leftover availability changed while you were editing. Please review your selections before continuing.'
          }),
          showCancel: false
        })
      })
    ]);
    expect(definitionWatches).toEqual(formWatches);
  });

  it('renames leftover ids to MI and SI prefixes in the shared bank form', () => {
    const exported = getBankExport();
    const idField = (exported.questions || []).find((question: any) => question?.id === 'LEFTOVER_ID');
    const kindField = (exported.questions || []).find((question: any) => question?.id === 'LEFTOVER_KIND');

    expect(kindField?.options).toEqual(['Multi-ingredient', 'Single-ingredient']);
    expect(idField?.autoIncrement?.prefixByValue?.map).toEqual(
      expect.objectContaining({
        'Multi-ingredient': 'MI-',
        'Single-ingredient': 'SI-'
      })
    );
  });

  it('does not queue the generic utilisation sync when leaving Order for Leftover bank', () => {
    const definition = getDefinition();
    const exported = getExport();
    const formOrderStep = exported.form?.steps?.items?.find((step: any) => step.id === 'orderInfo');
    const definitionOrderStep = definition.steps?.items?.find((step: any) => step.id === 'orderInfo');
    const formLeftoverStep = exported.form?.steps?.items?.find((step: any) => step.id === 'leftoverForm');
    const definitionLeftoverStep = definition.steps?.items?.find((step: any) => step.id === 'leftoverForm');

    expect(formOrderStep?.navigation?.backgroundUtilisationSyncOnAdvance).toBe(false);
    expect(definitionOrderStep?.navigation?.backgroundUtilisationSyncOnAdvance).toBe(false);
    expect(formLeftoverStep?.navigation?.backgroundUtilisationSyncOnAdvance).toBe(false);
    expect(definitionLeftoverStep?.navigation?.backgroundUtilisationSyncOnAdvance).toBe(false);
  });

  it('defines direct MP_TYPE_LI output rules for part dish, reheat, and combine', () => {
    const definition = getDefinition();
    const leftoverStep = definition.steps?.items?.find((step: any) => step.id === 'leftoverForm');
    const target = leftoverStep?.include?.find((entry: any) => entry.kind === 'lineGroup' && entry.id === 'MP_MEALS_REQUEST') as any;
    const config = Array.isArray(target?.dataSourceRows) ? target.dataSourceRows[0] : null;

    expect(config).toEqual(
      expect.objectContaining({
        dataSource: expect.objectContaining({
          id: 'Leftover Bank Data',
          formKey: 'Config: Leftover Bank',
          mode: 'options',
          statusFieldId: 'LEFTOVER_STATUS',
          statusAllowList: ['available', 'used'],
          projection: expect.arrayContaining([
            'LEFTOVER_ID',
            'LEFTOVER_KIND',
            'LEFTOVER_RECIPE',
            'LEFTOVER_INGREDIENT',
            'LEFTOVER_CAT',
            'LEFTOVER_ALLERGEN',
            'LEFTOVER_PORTIONS',
            'LEFTOVER_QTY',
            'LEFTOVER_UNIT',
            'LEFTOVER_INGREDIENTS_LI'
          ])
        }),
        rowKeyFieldId: 'LEFTOVER_ID',
        outputGroupId: 'MP_TYPE_LI',
        outputKeyFieldId: 'LEFTOVER_ID',
        selectedFieldId: 'LEFTOVER_SELECTED',
        quantityFieldId: 'LEFTOVER_USE_QTY',
        modeFieldId: 'LEFTOVER_USAGE_MODE'
      })
    );
    expect(config?.sourceFieldMapping).toEqual(
      expect.objectContaining({
        LEFTOVER_ID: 'LEFTOVER_ID',
        LEFTOVER_KIND: 'LEFTOVER_KIND',
        LEFTOVER_MEAL_TYPE: 'LEFTOVER_MEAL_TYPE',
        LEFTOVER_RECIPE: 'LEFTOVER_RECIPE',
        LEFTOVER_INGREDIENT: 'LEFTOVER_INGREDIENT',
        DIETARY_APPLICABILITY: 'DIETARY_APPLICABILITY',
        LEFTOVER_PORTIONS_AVAILABLE: 'LEFTOVER_PORTIONS',
        LEFTOVER_QTY_AVAILABLE: 'LEFTOVER_QTY',
        LEFTOVER_UNIT: 'LEFTOVER_UNIT'
      })
    );
    expect(config?.sourceFieldMapping?.LEFTOVER_INGREDIENTS_LI).toBeUndefined();
    expect(config?.sourceFieldMapping?.LEFTOVER_RECORD_ID).toBeUndefined();
    expect(config?.parentMatchFieldId).toBe('MEAL_TYPE');
    expect(config?.sourceMatchFieldId).toBe('DIETARY_APPLICABILITY');
    expect(config?.sourceMatchMode).toBe('includesDelimited');
    expect(config?.sourceMatchDelimiter).toBe(',');
    expect(config?.presentation).toBe('sourceFirstAllocations');
    expect(config?.presentationWhen).toEqual({
      fieldId: '__ckStep',
      equals: ['leftoverForm']
    });
    expect(config?.hideParentRowsWhenPresentationActive).toBe(true);
    expect(config?.allocationLabelFieldId).toBe('MEAL_TYPE');
    expect(config?.ui?.allocationLabelVisibility).toBe('always');
    expect(config?.ui?.emptyStateMessage?.en).toBe('No compatible leftovers are available for the current dishes.');
    expect(config?.ui?.noSourceRowsMessage?.en).toBe('There is currently no leftover.');
    expect(config?.sourceRows).toEqual({
      includeWhen: {
        all: [
          {
            fieldId: 'LEFTOVER_EXP_DATE',
            greaterThanOrEqualFieldId: 'MP_PREP_DATE'
          },
          {
            any: [
              {
                fieldId: '__ckCurrentRecordUtilisedQuantity',
                greaterThan: 0
              },
              {
                fieldId: '__ckFreeQuantity',
                greaterThan: 0
              }
            ]
          }
        ]
      },
      removeOutputWhenExcluded: true
    });
    expect(config?.exclusiveSelection).toBeUndefined();

    expect(config?.outputRules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'sync_leftover_part_prep',
          preset: expect.objectContaining({
            PREP_TYPE: 'Single-ingredient',
            PREP_QTY: '$row.LEFTOVER_USE_QTY',
            LEFTOVER_ID: '$row.LEFTOVER_ID',
            LEFTOVER_DISPLAY_UNIT: '$source.LEFTOVER_UNIT',
            LEFTOVER_SUMMARY_ACTION: '',
            LEFTOVER_SUMMARY_AMOUNT_SOURCE: '$row.LEFTOVER_USE_QTY',
            LEFTOVER_SUMMARY_UNIT_PREFIX: ' ',
            RECIPE: '$source.LEFTOVER_INGREDIENT',
            LEFTOVER_RECORD_ID: '$source.id',
            MP_INGREDIENTS_LI: [
              {
                ING: '$source.LEFTOVER_INGREDIENT',
                QTY: '$row.LEFTOVER_USE_QTY',
                UNIT: '$source.LEFTOVER_UNIT',
                CAT: '$source.LEFTOVER_CAT',
                ALLERGEN: '$source.LEFTOVER_ALLERGEN'
              }
            ]
          })
        }),
        expect.objectContaining({
          id: 'sync_leftover_entire_reheat_prep',
          preset: expect.objectContaining({
            PREP_TYPE: 'Multi-ingredient',
            PREP_QTY: '$row.LEFTOVER_USE_QTY',
            LEFTOVER_ID: '$row.LEFTOVER_ID',
            LEFTOVER_DISPLAY_UNIT: 'portions',
            LEFTOVER_USAGE_MODE: '$row.LEFTOVER_USAGE_MODE',
            LEFTOVER_SUMMARY_ACTION: 'reheat ',
            LEFTOVER_SUMMARY_AMOUNT_SOURCE: '$row.LEFTOVER_USE_QTY',
            LEFTOVER_SUMMARY_UNIT_PREFIX: ' ',
            RECIPE: '$source.LEFTOVER_RECIPE',
            LEFTOVER_RECORD_ID: '$source.id',
            MP_INGREDIENTS_LI: '$source.LEFTOVER_INGREDIENTS_LI'
          })
        }),
        expect.objectContaining({
          id: 'sync_leftover_entire_combine_prep',
          preset: expect.objectContaining({
            PREP_TYPE: 'Multi-ingredient',
            PREP_QTY: 0,
            LEFTOVER_ID: '$row.LEFTOVER_ID',
            LEFTOVER_DISPLAY_UNIT: '',
            LEFTOVER_USAGE_MODE: '$row.LEFTOVER_USAGE_MODE',
            LEFTOVER_SUMMARY_ACTION: 'combine',
            LEFTOVER_SUMMARY_AMOUNT_SOURCE: '',
            LEFTOVER_SUMMARY_UNIT_PREFIX: '',
            RECIPE: '$source.LEFTOVER_RECIPE',
            LEFTOVER_RECORD_ID: '$source.id',
            MP_INGREDIENTS_LI: '$source.LEFTOVER_INGREDIENTS_LI'
          })
        })
      ])
    );

    const fieldById = (id: string) => (Array.isArray(config?.fields) ? config.fields.find((field: any) => field.id === id) : null);
    expect(fieldById('LEFTOVER_RECORD_ID')).toBeUndefined();
    expect(fieldById('LEFTOVER_RECIPE')).toBeUndefined();
    expect(fieldById('LEFTOVER_INGREDIENT')).toBeUndefined();
    expect(fieldById('LEFTOVER_INGREDIENTS_LI')).toBeUndefined();
    expect(fieldById('LEFTOVER_ID')?.optionFilter).toBeUndefined();
    expect((fieldById('LEFTOVER_SELECTED')?.selectionEffects || []).map((effect: any) => effect.type)).toEqual([
      'setValue',
      'setValue'
    ]);
    expect(fieldById('LEFTOVER_USE_QTY')?.selectionEffects || []).toEqual([]);
    expect(fieldById('LEFTOVER_USAGE_MODE')?.selectionEffects || []).toEqual([]);
    expect(config?.subGroups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'LEFTOVER_INGREDIENTS_VIEW_LI',
          ui: expect.objectContaining({
            mode: 'table',
            addButtonPlacement: 'hidden',
            hideRemoveColumn: true
          })
        })
      ])
    );

    const hasEqualsValue = (when: any, value: string) => {
      const equals = when?.equals;
      return Array.isArray(equals) ? equals.includes(value) : equals === value;
    };
    expect(config?.defaultModeValue).toBeUndefined();
    const compactSentenceRows = Array.isArray(config?.ui?.compactSentenceRows) ? config.ui.compactSentenceRows : [];
    const singleIngredientSentence = compactSentenceRows.find((rule: any) =>
      hasEqualsValue(rule?.when, 'Single-ingredient')
    );
    const multiIngredientSentence = compactSentenceRows.find((rule: any) =>
      hasEqualsValue(rule?.when, 'Multi-ingredient')
    );
    expect((singleIngredientSentence?.parts || []).map((part: any) => part?.fieldId)).toEqual(['LEFTOVER_USE_QTY']);
    expect((multiIngredientSentence?.parts || []).map((part: any) => part?.fieldId)).toEqual([
      'LEFTOVER_USE_QTY',
      'LEFTOVER_USAGE_MODE'
    ]);
    const partHeadline = (config?.ui?.compactHeadlineRows || []).find((rule: any) =>
      hasEqualsValue(rule?.when, 'Single-ingredient')
    );
    const entireHeadline = (config?.ui?.compactHeadlineRows || []).find((rule: any) =>
      hasEqualsValue(rule?.when, 'Multi-ingredient')
    );
    expect(partHeadline?.parts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sourcePathAlternatives: ['LEFTOVER_INGREDIENT', 'LEFTOVER_RECIPE'] }),
        expect.objectContaining({ fieldId: 'LEFTOVER_QTY_AVAILABLE' })
      ])
    );
    expect(entireHeadline?.parts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourcePathAlternatives: ['LEFTOVER_RECIPE', 'LEFTOVER_INGREDIENT', 'LEFTOVER_MEAL_TYPE']
        }),
        expect.objectContaining({ fieldId: 'LEFTOVER_PORTIONS_AVAILABLE' })
      ])
    );
    const detailRules = config?.ui?.compactDetailRows || [];
    expect(detailRules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          when: expect.objectContaining({ fieldId: 'LEFTOVER_KIND', equals: ['Single-ingredient', 'Part dish'] }),
          parts: expect.arrayContaining([expect.objectContaining({ sourcePath: 'LEFTOVER_INGREDIENT' })])
        }),
        expect.objectContaining({
          when: expect.objectContaining({ fieldId: 'LEFTOVER_KIND', equals: ['Multi-ingredient', 'Entire dish'] }),
          parts: expect.arrayContaining([
            expect.objectContaining({
              type: 'sourceListSummary',
              sourcePath: 'LEFTOVER_INGREDIENTS_LI',
              summaryFieldId: 'ING',
              sort: 'alphabetical'
            })
          ])
        })
      ])
    );
    expect(config?.ui?.sourceFirstRowSort).toBe('alphabetical');
    expect(config?.availability).toEqual(
      expect.objectContaining({
        targetQuantityFieldId: 'LEFTOVER_QTY_AVAILABLE',
        targetMaxQuantityFieldId: 'LEFTOVER_QTY_MAX',
        targetPortionsFieldId: 'LEFTOVER_PORTIONS_AVAILABLE',
        targetMaxPortionsFieldId: 'LEFTOVER_PORTIONS_MAX'
      })
    );
    expect(config?.utilisation).toEqual(
      expect.objectContaining({
        enabled: true,
        utilisationFormKey: 'Config: Leftover Utilisation',
        conflictDialog: expect.objectContaining({
          title: { en: '' },
          message: {
            en: 'Leftover availability changed before you completed your selection. Your selected quantity is no longer available. Please adjust your selections before continuing'
          },
          confirmLabel: { en: 'OK' },
          showCancel: false,
          showCloseButton: false,
          dismissOnBackdrop: false
        })
      })
    );
  });

  it('configures the Production step to show selected leftovers below the to-cook summary', () => {
    const definition = getDefinition();
    const exported = getExport();
    const definitionStep = definition.steps?.items?.find((step: any) => step.id === 'deliveryForm');
    const formStep = exported.form?.steps?.items?.find((step: any) => step.id === 'deliveryForm');
    const definitionTarget = definitionStep?.include?.find((entry: any) => entry.kind === 'lineGroup' && entry.id === 'MP_MEALS_REQUEST') as any;
    const formTarget = formStep?.include?.find((entry: any) => entry.kind === 'lineGroup' && entry.id === 'MP_MEALS_REQUEST') as any;
    const question = definition.questions.find(q => q.id === 'MP_MEALS_REQUEST') as any;
    const typeGroup = (question?.lineItemConfig?.subGroups || []).find((entry: any) => entry?.id === 'MP_TYPE_LI');
    const fieldIds = (typeGroup?.fields || []).map((entry: any) => entry?.id);
    const summaryField = (typeGroup?.fields || []).find((entry: any) => entry?.id === 'LEFTOVER_SUMMARY');

    expect(definitionTarget?.rowFlow?.references).toEqual(
      expect.objectContaining({
        cookRow: expect.objectContaining({
          groupId: 'MP_TYPE_LI',
          match: 'first'
        }),
        leftoverRows: expect.objectContaining({
          groupId: 'MP_TYPE_LI',
          match: 'any',
          rowFilter: expect.objectContaining({
            includeWhen: expect.objectContaining({
              all: expect.arrayContaining([
                expect.objectContaining({ fieldId: 'LEFTOVER_ID', notEmpty: true }),
                expect.objectContaining({
                  fieldId: 'PREP_TYPE',
                  equals: ['Multi-ingredient', 'Entire dish', 'Single-ingredient', 'Part dish']
                })
              ])
            })
          })
        })
      })
    );
    expect(definitionTarget?.rowFlow?.output).toEqual(
      expect.objectContaining({
        separator: ' | ',
        hideEmpty: true
      })
    );
    expect(definitionTarget?.rowFlow?.output?.segments?.[0]).toEqual(expect.objectContaining({ fieldRef: 'MEAL_TYPE' }));
    expect(definitionTarget?.rowFlow?.output?.segments?.[1]).toEqual(
      expect.objectContaining({
        fieldRef: 'MP_TO_COOK',
        label: expect.objectContaining({ en: 'To cook' })
      })
    );
    expect(definitionTarget?.rowFlow?.output?.segments?.[1]?.showWhen).toBeUndefined();
    expect(definitionTarget?.rowFlow?.prompts?.find((prompt: any) => prompt?.id === 'recipe')).toEqual(
      expect.objectContaining({
        fieldRef: 'cookRow.RECIPE',
        showWhen: {
          fieldId: 'MP_TO_COOK',
          greaterThan: 0
        }
      })
    );
    expect(definitionTarget?.rowFlow?.output?.segments?.[2]).toEqual(
      expect.objectContaining({
        fieldRef: 'leftoverRows.LEFTOVER_SUMMARY',
        layout: 'block',
        format: expect.objectContaining({
          type: 'list',
          listDelimiter: '\n',
          unique: false
        })
      })
    );
    expect(formTarget?.rowFlow?.output).toEqual(definitionTarget?.rowFlow?.output);
    expect(fieldIds).toEqual(
      expect.arrayContaining([
        'LEFTOVER_DISPLAY_UNIT',
        'LEFTOVER_SUMMARY_ACTION',
        'LEFTOVER_SUMMARY_AMOUNT_SOURCE',
        'LEFTOVER_SUMMARY_UNIT_PREFIX',
        'LEFTOVER_SUMMARY_UNIT',
        'LEFTOVER_SUMMARY_AMOUNT',
        'LEFTOVER_SUMMARY'
      ])
    );
    const summaryUnitField = (typeGroup?.fields || []).find((entry: any) => entry?.id === 'LEFTOVER_SUMMARY_UNIT');
    const summaryAmountField = (typeGroup?.fields || []).find((entry: any) => entry?.id === 'LEFTOVER_SUMMARY_AMOUNT');
    expect(summaryUnitField?.derivedValue).toEqual(
      expect.objectContaining({
        op: 'template',
        template: '{LEFTOVER_SUMMARY_UNIT_PREFIX}{LEFTOVER_DISPLAY_UNIT}',
        when: 'always',
        hidden: true
      })
    );
    expect(summaryAmountField?.derivedValue).toEqual(
      expect.objectContaining({
        op: 'template',
        template: '{LEFTOVER_SUMMARY_AMOUNT_SOURCE}{LEFTOVER_SUMMARY_UNIT}',
        when: 'always',
        hidden: true
      })
    );
    expect(summaryField?.derivedValue).toEqual(
      expect.objectContaining({
        op: 'template',
        template: '{LEFTOVER_ID} | {RECIPE} | {LEFTOVER_SUMMARY_ACTION}{LEFTOVER_SUMMARY_AMOUNT}',
        when: 'always',
        hidden: true
      })
    );
  });

  it('computes selected leftover summary templates in a single value-map pass', () => {
    const definition = getDefinition();
    const parentRowId = 'meal-row';
    const typeGroupKey = buildSubgroupKey('MP_MEALS_REQUEST', parentRowId, 'MP_TYPE_LI');
    const lineItems: any = {
      MP_MEALS_REQUEST: [
        {
          id: parentRowId,
          values: {
            MEAL_TYPE: 'Vegetarian',
            ORD_QTY: 50
          }
        }
      ],
      [typeGroupKey]: [
        {
          id: 'leftover-row',
          values: {
            PREP_TYPE: 'Multi-ingredient',
            PREP_QTY: '15',
            LEFTOVER_ID: 'MI-8',
            LEFTOVER_USAGE_MODE: 'Reheat',
            LEFTOVER_DISPLAY_UNIT: 'portions',
            LEFTOVER_SUMMARY_ACTION: 'reheat ',
            LEFTOVER_SUMMARY_AMOUNT_SOURCE: '15',
            LEFTOVER_SUMMARY_UNIT_PREFIX: ' ',
            RECIPE: 'One pot creamy pasta'
          }
        }
      ]
    };

    const first = applyValueMapsToForm(definition, {} as any, lineItems, { mode: 'change' });
    const leftoverRow = first.lineItems[typeGroupKey][0];
    expect(leftoverRow.values.LEFTOVER_SUMMARY_UNIT).toBe(' portions');
    expect(leftoverRow.values.LEFTOVER_SUMMARY_AMOUNT).toBe('15 portions');
    expect(leftoverRow.values.LEFTOVER_SUMMARY).toBe('MI-8 | One pot creamy pasta | reheat 15 portions');

    const second = applyValueMapsToForm(definition, first.values, first.lineItems, { mode: 'change' });
    expect(second.lineItems).toBe(first.lineItems);
    expect(second.lineItems[typeGroupKey][0]).toBe(leftoverRow);
  });

  it('limits recipe and ingredient datasource freshness to cook rows only', () => {
    const definition = getDefinition();
    const exported = getExport();
    const question = definition.questions.find(q => q.id === 'MP_MEALS_REQUEST') as any;
    const typeGroup = (question?.lineItemConfig?.subGroups || []).find((entry: any) => entry?.id === 'MP_TYPE_LI');
    const recipeField = (typeGroup?.fields || []).find((entry: any) => entry?.id === 'RECIPE');
    const recipeSync = (recipeField?.selectionEffects || []).find((entry: any) => entry?.id === 'syncRecipeIngredientsFromSource');
    const ingredientsGroup = (typeGroup?.subGroups || []).find((entry: any) => entry?.id === 'MP_INGREDIENTS_LI');
    const ingredientField = (ingredientsGroup?.fields || []).find((entry: any) => entry?.id === 'ING');
    const ingredientSync = (ingredientField?.selectionEffects || []).find((entry: any) => entry?.id === 'syncIngredientFromSource');
    const toCookField = (question?.lineItemConfig?.fields || []).find((entry: any) => entry?.id === 'MP_TO_COOK');
    const rawQuestion = (exported.questions || []).find((entry: any) => entry?.id === 'MP_MEALS_REQUEST');
    const rawToCook = (rawQuestion?.optionsRaw || []).find((entry: any) => entry?.ID === 'MP_TO_COOK');
    const rawConfig = JSON.parse(rawToCook?.['Config (JSON/REF)'] || '{}');

    expect(recipeField?.validationRules?.[0]?.when).toEqual({
      all: [
        { fieldId: 'PREP_TYPE', equals: ['Cook'] },
        { fieldId: 'MP_TO_COOK', greaterThan: 0 }
      ]
    });
    expect(recipeSync?.when).toEqual({
      all: [
        { fieldId: 'MP_TO_COOK', greaterThan: 0 },
        { fieldId: 'PREP_TYPE', equals: ['Cook'] }
      ]
    });
    expect(recipeSync?.sourceSync).toEqual(
      expect.objectContaining({
        refreshOnInit: true,
        forceRefresh: true,
        forceRefreshMaxCacheAgeMs: 120000,
        stopWhen: { fieldId: 'status', equals: 'Closed' }
      })
    );
    expect(recipeSync?.clearOnNoMatch).toBe(true);
    expect(recipeSync?.parentFieldMapping).toEqual(
      expect.objectContaining({
        RECIPE_SOURCE_ID: 'id',
        RECIPE_SOURCE_UPDATED_AT: 'updatedAt',
        RECIPE: 'QFTD5RD2EM'
      })
    );
    expect(ingredientSync?.when).toEqual({ fieldId: 'PREP_TYPE', equals: ['Cook'] });
    expect(toCookField?.derivedValue).toEqual(expect.objectContaining({ min: 0 }));
    expect(rawConfig?.derivedValue).toEqual(expect.objectContaining({ min: 0 }));
  });

  it('copies recipe source metadata when duplicating a closed meal production record', () => {
    const exported = getExport();
    const profileSubGroup = exported.form?.copyCurrentRecordProfile?.lineItems?.[0]?.subGroups?.find(
      (entry: any) => entry?.groupId === 'MP_TYPE_LI'
    );

    expect(profileSubGroup?.fields).toEqual(
      expect.arrayContaining(['PREP_TYPE', 'PREP_QTY', 'RECIPE', 'RECIPE_SOURCE_ID', 'RECIPE_SOURCE_UPDATED_AT'])
    );
  });

  it('sets delivered portions from ordered portions when duplicating a closed meal production record', () => {
    const exported = getExport();
    const profileGroup = exported.form?.copyCurrentRecordProfile?.lineItems?.find(
      (entry: any) => entry?.groupId === 'MP_MEALS_REQUEST'
    );

    expect(profileGroup?.fields).toEqual(expect.arrayContaining(['MEAL_TYPE', 'ORD_QTY']));
    expect(profileGroup?.fields || []).not.toContain('FINAL_QTY');
    expect(profileGroup?.fieldValues).toEqual({
      FINAL_QTY: '$row.ORD_QTY'
    });
  });

  it('configures the Leftovers step LE capture as a rowFlow sentence with combined ingredient references', () => {
    const definition = getDefinition();
    const leftoversStep = definition.steps?.items?.find((step: any) => step.id === 'leftovers');
    const target = leftoversStep?.include?.find((entry: any) => entry.kind === 'lineGroup' && entry.id === 'MP_MEALS_REQUEST') as any;

    expect(target?.label?.en).toBe('Multi-ingredient leftovers');
    expect(target?.helperText?.en).toBe(
      'Leave empty if there are no leftovers, then click Complete.\nTo record multi-ingredient leftovers, enter a value > 0. Rename if needed and deselect ingredients not included.\nTick ❄️ if freezing (expiry: +3 months). Leave unticked for refrigerated storage (expiry: 3 days).\nTo record single-ingredient leftovers, follow instructions at the bottom of the page otherwise click Complete to generate the Leftover ID.'
    );
    expect((target?.fields || []).map((entry: any) => (typeof entry === 'string' ? entry : entry?.id))).toEqual(
      expect.arrayContaining([
        'MEAL_TYPE',
        'FINAL_QTY',
        'MP_LEFTOVER_RECIPE_CAPTURE',
        'MP_LEFTOVER_PORTIONS_CAPTURE',
        'MP_LEFTOVER_FROZEN_CAPTURE'
      ])
    );
    expect(target?.subGroups?.include).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'MP_TYPE_LI',
          fields: expect.arrayContaining(['PREP_TYPE', 'RECIPE'])
        }),
        expect.objectContaining({
          id: 'MP_LEFTOVER_INGREDIENTS_CAPTURE_LI',
          fields: ['ING_SELECTED', 'ING']
        })
      ])
    );
    expect(target?.rowFlow).toEqual(
      expect.objectContaining({
        references: expect.objectContaining({
          cookRow: expect.objectContaining({
            groupId: 'MP_TYPE_LI',
            match: 'first'
          }),
          cookIngredients: expect.objectContaining({
            groupId: 'MP_INGREDIENTS_LI',
            parentRef: 'cookRow',
            match: 'any'
          }),
          contributingPrepRows: expect.objectContaining({
            groupId: 'MP_TYPE_LI',
            match: 'any',
            rowFilter: expect.objectContaining({
              includeWhen: expect.objectContaining({
                any: expect.arrayContaining([
                  expect.objectContaining({
                    fieldId: 'PREP_TYPE',
                    equals: ['Cook', 'Single-ingredient', 'Part dish']
                  }),
                  expect.objectContaining({
                    all: expect.arrayContaining([
                      expect.objectContaining({
                        fieldId: 'PREP_TYPE',
                        equals: ['Multi-ingredient', 'Entire dish']
                      }),
                      expect.objectContaining({
                        fieldId: 'PREP_QTY',
                        equals: 0
                      })
                    ])
                  })
                ])
              })
            })
          }),
          contributingIngredients: expect.objectContaining({
            groupId: 'MP_INGREDIENTS_LI',
            parentRef: 'contributingPrepRows',
            match: 'any'
          }),
          capturedIngredientsSelected: expect.objectContaining({
            groupId: 'MP_LEFTOVER_INGREDIENTS_CAPTURE_LI',
            match: 'any',
            rowFilter: expect.objectContaining({
              includeWhen: expect.objectContaining({
                fieldId: 'ING_SELECTED',
                equals: true
              })
            })
          })
        }),
        output: expect.objectContaining({
          separator: '',
          hideEmpty: true,
          actionsLayout: 'below',
          actions: [{ id: 'editIngredients' }],
          segments: expect.arrayContaining([
            expect.objectContaining({ fieldRef: 'MEAL_TYPE' }),
            expect.objectContaining({
              fieldRef: 'MP_LEFTOVER_RECIPE_CAPTURE',
              fallbackFieldRef: 'cookRow.RECIPE',
              renderAs: 'control',
              maxWidth: 999
            }),
            expect.objectContaining({
              fieldRef: 'capturedIngredientsSelected.ING',
              tone: 'muted',
              showWhen: expect.objectContaining({
                fieldId: 'MP_LEFTOVER_INGREDIENTS_CAPTURE_READY',
                notEmpty: true
              }),
              format: expect.objectContaining({
                type: 'list',
                listDelimiter: ', ',
                unique: true,
                sort: 'alphabetical'
              })
            }),
            expect.objectContaining({
              fieldRef: 'contributingIngredients.ING',
              tone: 'muted',
              showWhen: expect.objectContaining({
                fieldId: 'MP_LEFTOVER_INGREDIENTS_CAPTURE_READY',
                isEmpty: true
              }),
              format: expect.objectContaining({
                type: 'list',
                listDelimiter: ', ',
                unique: true,
                sort: 'alphabetical'
              })
            }),
            expect.objectContaining({
              type: 'text',
              text: expect.objectContaining({ en: 'Yield ' })
            }),
            expect.objectContaining({
              fieldRef: 'MP_LEFTOVER_PORTIONS_CAPTURE',
              renderAs: 'control',
              controlStyle: 'compact'
            }),
            expect.objectContaining({
              type: 'spacer',
              showWhen: expect.objectContaining({
                fieldId: 'MP_LEFTOVER_PORTIONS_CAPTURE',
                greaterThan: 0
              })
            }),
            expect.objectContaining({
              type: 'text',
              text: expect.objectContaining({ en: '❄️' }),
              showWhen: expect.objectContaining({
                fieldId: 'MP_LEFTOVER_PORTIONS_CAPTURE',
                greaterThan: 0
              })
            }),
            expect.objectContaining({
              fieldRef: 'MP_LEFTOVER_FROZEN_CAPTURE',
              renderAs: 'control',
              controlStyle: 'compact',
              minWidth: 32,
              maxWidth: 32,
              showWhen: expect.objectContaining({
                fieldId: 'MP_LEFTOVER_PORTIONS_CAPTURE',
                greaterThan: 0
              })
            }),
            expect.objectContaining({
              type: 'text',
              text: expect.objectContaining({ en: ' portions to reheat or combine' })
            })
          ])
        }),
        actions: expect.arrayContaining([
          expect.objectContaining({
            id: 'editIngredients',
            label: expect.objectContaining({ en: 'Edit ingredients' }),
            variant: 'button',
            tone: 'primary',
            effects: expect.arrayContaining([
              expect.objectContaining({
                type: 'seedLineItemsFromReference',
                sourceRef: 'contributingIngredients',
                groupId: 'MP_LEFTOVER_INGREDIENTS_CAPTURE_LI',
                whenEmpty: true
              }),
              expect.objectContaining({
                type: 'openOverlay',
                groupId: 'MP_LEFTOVER_INGREDIENTS_CAPTURE_LI',
                overlayContextHeader: expect.objectContaining({
                  en: 'Deselect any ingredient not included in this leftover and click save.'
                }),
                groupOverride: expect.objectContaining({
                  ui: expect.objectContaining({
                    maxVisibleRows: 0,
                    rowSort: expect.objectContaining({
                      fieldId: 'ING'
                    })
                  })
                }),
                hideCloseButton: true,
                overlaySession: expect.objectContaining({
                  enabled: true,
                  fillAvailableHeight: true
                })
              })
            ])
          })
        ])
      })
    );
    const editIngredientsAction = target?.rowFlow?.actions?.find((action: any) => action?.id === 'editIngredients');
    const openOverlayEffect = editIngredientsAction?.effects?.find(
      (effect: any) => effect?.type === 'openOverlay' && effect?.groupId === 'MP_LEFTOVER_INGREDIENTS_CAPTURE_LI'
    );
    expect(openOverlayEffect?.overlaySession).not.toHaveProperty('bulkSelection');
  });

  it('derives created multi-ingredient leftover ingredients from the Cook row only', () => {
    const exported = getExport();
    const followupEffects = Array.isArray(exported.form?.followupConfig?.submitEffects)
      ? exported.form.followupConfig.submitEffects
      : [];
    const target = followupEffects.find((entry: any) => entry?.id === 'captureProducedEntireDishLeftovers');

    expect(target?.values?.DIETARY_APPLICABILITY?.collection).toEqual(
      expect.objectContaining({
        op: 'filterCollection',
        collectionPath: 'row.MP_INGREDIENTS_LI',
        pickFields: ['ING']
      })
    );
    expect(target?.values?.LEFTOVER_INGREDIENTS_LI).toEqual(
      expect.objectContaining({
        op: 'scaleCollection',
        collectionPath: 'row.MP_INGREDIENTS_LI',
        pickFields: ['ING', 'QTY', 'UNIT', 'CAT', 'ALLERGEN'],
        scaleNumericFields: ['QTY'],
        multiplierPath: 'parent.MP_LEFTOVER_PORTIONS_CAPTURE',
        divisorPath: 'row.PREP_QTY'
      })
    );
  });

  it('renames and reconfigures the single-ingredient leftovers section', () => {
    const definition = getDefinition();
    const leftoversStep = definition.steps?.items?.find((step: any) => step.id === 'leftovers');
    const target = leftoversStep?.include?.find((entry: any) => entry.kind === 'lineGroup' && entry.id === 'MP_LEFTOVER_CAPTURE_LI') as any;
    const question = definition.questions.find(q => q.id === 'MP_LEFTOVER_CAPTURE_LI') as any;
    const meals = definition.questions.find(q => q.id === 'MP_MEALS_REQUEST') as any;
    const ingredientCaptureGroup = (meals?.lineItemConfig?.subGroups || []).find(
      (entry: any) => entry?.id === 'MP_LEFTOVER_INGREDIENTS_CAPTURE_LI'
    );

    expect(target?.label?.en).toBe('Single-ingredient leftovers');
    expect(target?.helperText?.en).toBe(
      'To add single-ingredient leftovers (e.g. rice, bulgur, couscous, chickpeas), search and select the ingredient, then enter the quantity and unit.\nTick ❄️ if freezing.  Leave unticked for refrigerated storage.\nClick Complete to generate the Leftover ID.'
    );
    expect(question?.qEn).toBe('Single-ingredient leftovers');
    expect(question?.ui?.hideLabel).toBe(true);
    expect(question?.lineItemConfig?.addButtonLabel?.en).toBe('Single-ingredient leftover');
    expect(question?.lineItemConfig?.ui).toEqual(
      expect.objectContaining({
        tableColumns: ['LEFTOVER_INGREDIENT', 'LEFTOVER_QTY', 'LEFTOVER_UNIT', 'LEFTOVER_FROZEN'],
        tableColumnWidths: expect.objectContaining({
          LEFTOVER_INGREDIENT: '40%',
          LEFTOVER_QTY: '24%',
          LEFTOVER_FROZEN: '18%'
        })
      })
    );
    const ingredientField = (question?.lineItemConfig?.fields || []).find((entry: any) => entry?.id === 'LEFTOVER_INGREDIENT');
    const frozenField = (question?.lineItemConfig?.fields || []).find((entry: any) => entry?.id === 'LEFTOVER_FROZEN');
    const storageField = (question?.lineItemConfig?.fields || []).find((entry: any) => entry?.id === 'LEFTOVER_STORAGE');
    const chilledExpiryField = (question?.lineItemConfig?.fields || []).find((entry: any) => entry?.id === 'LEFTOVER_EXP_DATE_CHILLED');
    const frozenExpiryField = (question?.lineItemConfig?.fields || []).find((entry: any) => entry?.id === 'LEFTOVER_EXP_DATE_FROZEN');
    expect(ingredientField?.ui).toEqual(
      expect.objectContaining({
        choiceSearchEnabled: true,
        helperPlacement: 'placeholder',
        helperText: expect.objectContaining({ en: 'Search ingredients' })
      })
    );
    expect(storageField).toEqual(
      expect.objectContaining({
        defaultValue: 'Chilled',
        options: ['Chilled', 'Frozen'],
        visibility: expect.objectContaining({
          showWhen: expect.objectContaining({
            fieldId: 'NEVER_SHOW'
          })
        }),
        selectionEffects: expect.arrayContaining([
          expect.objectContaining({
            fieldId: 'LEFTOVER_FROZEN',
            value: false
          }),
          expect.objectContaining({
            fieldId: 'LEFTOVER_FROZEN',
            value: true
          }),
          expect.objectContaining({
            fieldId: 'LEFTOVER_EXP_DATE',
            value: '$row.LEFTOVER_EXP_DATE_CHILLED'
          }),
          expect.objectContaining({
            fieldId: 'LEFTOVER_EXP_DATE',
            value: '$row.LEFTOVER_EXP_DATE_FROZEN'
          })
        ])
      })
    );
    expect(frozenField).toEqual(
      expect.objectContaining({
        labelEn: '❄️',
        selectionEffects: expect.arrayContaining([
          expect.objectContaining({
            fieldId: 'LEFTOVER_STORAGE',
            value: 'Chilled'
          }),
          expect.objectContaining({
            fieldId: 'LEFTOVER_STORAGE',
            value: 'Frozen'
          }),
          expect.objectContaining({
            fieldId: 'LEFTOVER_EXP_DATE',
            value: '$row.LEFTOVER_EXP_DATE_CHILLED'
          }),
          expect.objectContaining({
            fieldId: 'LEFTOVER_EXP_DATE',
            value: '$row.LEFTOVER_EXP_DATE_FROZEN'
          })
        ])
      })
    );
    expect(chilledExpiryField?.derivedValue).toEqual(
      expect.objectContaining({
        op: 'copy',
        dependsOn: 'MP_EXP_DATE',
        hidden: true
      })
    );
    expect(frozenExpiryField?.derivedValue).toEqual(
      expect.objectContaining({
        op: 'addMonths',
        dependsOn: 'MP_PREP_DATE',
        offsetMonths: 3,
        hidden: true
      })
    );
    expect(ingredientCaptureGroup?.ui).toEqual(
      expect.objectContaining({
        tableColumns: ['ING_SELECTED', 'ING'],
        tableColumnWidths: expect.objectContaining({
          ING_SELECTED: '44px',
          ING: 'calc(100% - 44px)'
        }),
        hideRemoveColumn: true,
        addButtonPlacement: 'hidden'
      })
    );
    expect((ingredientCaptureGroup?.fields || []).map((entry: any) => entry?.id)).toEqual([
      'ING_SELECTED',
      'ING',
      'QTY',
      'UNIT',
      'CAT',
      'ALLERGEN'
    ]);
  });
});
