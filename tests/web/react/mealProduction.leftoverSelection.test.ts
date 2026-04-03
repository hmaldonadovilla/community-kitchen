import { WebFormDefinition } from '../../../src/types';

const getDefinition = (): WebFormDefinition =>
  JSON.parse(
    JSON.stringify(require('../../../docs/config/exports/staging/config_meal_production.json').definition)
  ) as WebFormDefinition;

const getExport = (): any =>
  JSON.parse(
    JSON.stringify(require('../../../docs/config/exports/staging/config_meal_production.json'))
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

    expect(target?.dataSourceRows).toHaveLength(1);
    expect(formTarget?.dataSourceRows).toHaveLength(1);
    expect(target?.subGroups).toBeUndefined();
    expect((question.lineItemConfig.subGroups || []).map((group: any) => group.id)).not.toContain('MP_LEFTOVER_SELECTION_LI');
    expect(
      ((question.lineItemConfig.fields || []).find((field: any) => field.id === 'MEAL_TYPE') || {}).selectionEffects || []
    ).toEqual([]);
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
    expect(config?.ui?.emptyStateMessage?.en).toBe('No compatible leftovers are available for the current dishes.');
    expect(config?.exclusiveSelection).toBeUndefined();

    expect(config?.outputRules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'sync_leftover_part_prep',
          preset: expect.objectContaining({
            PREP_TYPE: 'Part dish',
            PREP_QTY: '$row.LEFTOVER_USE_QTY',
            LEFTOVER_ID: '$row.LEFTOVER_ID',
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
            PREP_TYPE: 'Entire dish',
            PREP_QTY: '$row.LEFTOVER_USE_QTY',
            LEFTOVER_ID: '$row.LEFTOVER_ID',
            LEFTOVER_USAGE_MODE: '$row.LEFTOVER_USAGE_MODE',
            RECIPE: '$source.LEFTOVER_RECIPE',
            LEFTOVER_RECORD_ID: '$source.id',
            MP_INGREDIENTS_LI: '$source.LEFTOVER_INGREDIENTS_LI'
          })
        }),
        expect.objectContaining({
          id: 'sync_leftover_entire_combine_prep',
          preset: expect.objectContaining({
            PREP_TYPE: 'Entire dish',
            PREP_QTY: 0,
            LEFTOVER_ID: '$row.LEFTOVER_ID',
            LEFTOVER_USAGE_MODE: '$row.LEFTOVER_USAGE_MODE',
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

    const partHeadline = (config?.ui?.compactHeadlineRows || []).find((rule: any) => rule?.when?.equals === 'Part dish');
    const entireHeadline = (config?.ui?.compactHeadlineRows || []).find((rule: any) => rule?.when?.equals === 'Entire dish');
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
          when: expect.objectContaining({ fieldId: 'LEFTOVER_KIND', equals: 'Part dish' }),
          parts: expect.arrayContaining([expect.objectContaining({ sourcePath: 'LEFTOVER_INGREDIENT' })])
        }),
        expect.objectContaining({
          when: expect.objectContaining({ fieldId: 'LEFTOVER_KIND', equals: 'Entire dish' }),
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

  it('configures the Leftovers step LE capture as a rowFlow sentence with cook references', () => {
    const definition = getDefinition();
    const leftoversStep = definition.steps?.items?.find((step: any) => step.id === 'leftovers');
    const target = leftoversStep?.include?.find((entry: any) => entry.kind === 'lineGroup' && entry.id === 'MP_MEALS_REQUEST') as any;

    expect(target?.subGroups?.include).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'MP_TYPE_LI',
          fields: expect.arrayContaining(['PREP_TYPE', 'RECIPE'])
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
          })
        }),
        output: expect.objectContaining({
          separator: '',
          hideEmpty: true,
          segments: expect.arrayContaining([
            expect.objectContaining({ fieldRef: 'MEAL_TYPE' }),
            expect.objectContaining({ fieldRef: 'cookRow.RECIPE' }),
            expect.objectContaining({
              fieldRef: 'cookIngredients.ING',
              tone: 'muted',
              format: expect.objectContaining({
                type: 'list',
                listDelimiter: ', ',
                unique: true
              })
            }),
            expect.objectContaining({
              fieldRef: 'MP_LEFTOVER_PORTIONS_CAPTURE',
              renderAs: 'control',
              controlStyle: 'compact'
            }),
            expect.objectContaining({
              type: 'text',
              text: expect.objectContaining({ en: ' portions' })
            })
          ])
        })
      })
    );
  });
});
