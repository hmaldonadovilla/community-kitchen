import { WebFormDefinition } from '../../../src/types';

const getDefinition = (): WebFormDefinition =>
  JSON.parse(
    JSON.stringify(require('../../../docs/config/exports/staging/config_meal_production.json').definition)
  ) as WebFormDefinition;

const getExport = (): any =>
  JSON.parse(
    JSON.stringify(require('../../../docs/config/exports/staging/config_meal_production.json'))
  );

const getInventoryExport = (): any =>
  JSON.parse(
    JSON.stringify(require('../../../docs/config/exports/staging/config_leftover_inventory.json'))
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
      'Use leftovers if needed.\nAdjust the quantity if necessary.\nMI = Multi-ingredient to reheat by default otherwise change to combine.\nSI = Single-ingredient to combine'
    );
    expect(formTarget?.helperText?.en).toBe(
      'Use leftovers if needed.\nAdjust the quantity if necessary.\nMI = Multi-ingredient to reheat by default otherwise change to combine.\nSI = Single-ingredient to combine'
    );
    expect(target?.subGroups).toBeUndefined();
    expect((question.lineItemConfig.subGroups || []).map((group: any) => group.id)).not.toContain('MP_LEFTOVER_SELECTION_LI');
    expect(
      ((question.lineItemConfig.fields || []).find((field: any) => field.id === 'MEAL_TYPE') || {}).selectionEffects || []
    ).toEqual([]);
  });

  it('configures a background freshness watch for the leftover inventory datasource', () => {
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
        dataSourceIds: ['Leftover Inventory Data'],
        quietWindowMs: 30000,
        dialog: expect.objectContaining({
          message: expect.objectContaining({
            en: 'The leftover inventory changed while you were editing. We loaded the latest availability. Please review your selections before continuing.'
          }),
          showCancel: false
        })
      })
    ]);
    expect(definitionWatches).toEqual(formWatches);
  });

  it('renames leftover ids to MI and SI prefixes in the shared inventory form', () => {
    const exported = getInventoryExport();
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

  it('does not queue the generic reservation sync when leaving Order for Leftover bank', () => {
    const definition = getDefinition();
    const exported = getExport();
    const formOrderStep = exported.form?.steps?.items?.find((step: any) => step.id === 'orderInfo');
    const definitionOrderStep = definition.steps?.items?.find((step: any) => step.id === 'orderInfo');
    const formLeftoverStep = exported.form?.steps?.items?.find((step: any) => step.id === 'leftoverForm');
    const definitionLeftoverStep = definition.steps?.items?.find((step: any) => step.id === 'leftoverForm');

    expect(formOrderStep?.navigation?.backgroundReservationSyncOnAdvance).toBe(false);
    expect(definitionOrderStep?.navigation?.backgroundReservationSyncOnAdvance).toBe(false);
    expect(formLeftoverStep?.navigation?.backgroundReservationSyncOnAdvance).toBe(false);
    expect(definitionLeftoverStep?.navigation?.backgroundReservationSyncOnAdvance).toBe(false);
  });

  it('defines direct MP_TYPE_LI output rules for part dish, reheat, and combine', () => {
    const definition = getDefinition();
    const leftoverStep = definition.steps?.items?.find((step: any) => step.id === 'leftoverForm');
    const target = leftoverStep?.include?.find((entry: any) => entry.kind === 'lineGroup' && entry.id === 'MP_MEALS_REQUEST') as any;
    const config = Array.isArray(target?.dataSourceRows) ? target.dataSourceRows[0] : null;

    expect(config).toEqual(
      expect.objectContaining({
        dataSource: expect.objectContaining({
          id: 'Leftover Inventory Data',
          formKey: 'Config: Leftover Inventory',
          mode: 'options',
          statusFieldId: 'LEFTOVER_STATUS',
          statusAllowList: ['available'],
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
                fieldId: '__ckCurrentRecordReservedQuantity',
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
              summaryFieldId: 'ING'
            })
          ])
        })
      ])
    );
    expect(config?.availability).toEqual(
      expect.objectContaining({
        targetQuantityFieldId: 'LEFTOVER_QTY_AVAILABLE',
        targetMaxQuantityFieldId: 'LEFTOVER_QTY_MAX',
        targetPortionsFieldId: 'LEFTOVER_PORTIONS_AVAILABLE',
        targetMaxPortionsFieldId: 'LEFTOVER_PORTIONS_MAX'
      })
    );
    expect(config?.reservation).toEqual(
      expect.objectContaining({
        enabled: true,
        ledgerFormKey: 'Config: Inventory Reservation Ledger'
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

  it('configures the Leftovers step LE capture as a rowFlow sentence with cook references', () => {
    const definition = getDefinition();
    const leftoversStep = definition.steps?.items?.find((step: any) => step.id === 'leftovers');
    const target = leftoversStep?.include?.find((entry: any) => entry.kind === 'lineGroup' && entry.id === 'MP_MEALS_REQUEST') as any;

    expect(target?.label?.en).toBe('Multi-ingredient leftovers');
    expect(target?.helperText?.en).toBe(
      'Leave empty if no leftover.\nEnter a value > 0 for multi-ingredient leftovers (reheat or combine).\nYou can rename the dish and remove ingredients.\n❄️ = to be frozen (expiry: +6 months). Leave unticked for refrigerated storage.'
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
                unique: true
              })
            }),
            expect.objectContaining({
              fieldRef: 'cookIngredients.ING',
              tone: 'muted',
              showWhen: expect.objectContaining({
                fieldId: 'MP_LEFTOVER_INGREDIENTS_CAPTURE_READY',
                isEmpty: true
              }),
              format: expect.objectContaining({
                type: 'list',
                listDelimiter: ', ',
                unique: true
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
            tone: 'secondary',
            effects: expect.arrayContaining([
              expect.objectContaining({
                type: 'seedLineItemsFromReference',
                sourceRef: 'cookIngredients',
                groupId: 'MP_LEFTOVER_INGREDIENTS_CAPTURE_LI',
                whenEmpty: true
              }),
              expect.objectContaining({
                type: 'openOverlay',
                groupId: 'MP_LEFTOVER_INGREDIENTS_CAPTURE_LI',
                overlayContextHeader: expect.objectContaining({
                  en: 'Deselect any ingredient that should not be part of this leftover.\nUse Select all or Deselect all to update the full list quickly.'
                }),
                groupOverride: expect.objectContaining({
                  ui: expect.objectContaining({
                    maxVisibleRows: 0
                  })
                }),
                hideCloseButton: true,
                overlaySession: expect.objectContaining({
                  enabled: true,
                  fillAvailableHeight: true,
                  bulkSelection: expect.objectContaining({
                    fieldId: 'ING_SELECTED'
                  })
                })
              })
            ])
          })
        ])
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
      'To add single-ingredient leftovers (e.g. rice, bulgur, couscous, chickpeas), search and select the ingredient, then enter the quantity and unit.'
    );
    expect(question?.qEn).toBe('Single-ingredient leftovers');
    expect(question?.ui?.hideLabel).toBe(true);
    expect(question?.lineItemConfig?.addButtonLabel?.en).toBe('Single-ingredient leftover');
    expect(question?.lineItemConfig?.ui).toEqual(
      expect.objectContaining({
        tableColumns: ['LEFTOVER_INGREDIENT', 'LEFTOVER_QTY', 'LEFTOVER_UNIT', 'LEFTOVER_FROZEN'],
        tableColumnWidths: expect.objectContaining({
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
        offsetMonths: 6,
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
