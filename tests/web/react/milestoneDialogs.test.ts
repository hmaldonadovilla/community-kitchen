import {
  GENERATED_SUBMIT_EFFECT_RECORDS_FIELD,
  buildGeneratedSubmitEffectRecordsTemplateJson,
  filterGeneratedRecordsForDialog,
  getGeneratedRecordsFromFollowupResult,
  mergeGeneratedSubmitEffectRecordsIntoValues,
  renderGeneratedRecordLine,
  selectMilestoneConfirmationDialog,
  selectMilestoneProgressDialog
} from '../../../src/web/react/features/steps/domain/milestoneDialogs';

describe('milestoneDialogs', () => {
  test('selects the first matching confirmation dialog case before the fallback dialog', () => {
    const dialog = selectMilestoneConfirmationDialog({
      action: {
        type: 'followupBatch',
        preActions: ['CLOSE_RECORD'],
        confirmationDialogCases: [
          {
            when: { fieldId: 'LEFTOVER_COUNT', greaterThan: 0 },
            dialog: {
              title: { en: 'Store leftovers' },
              message: { en: 'Label leftovers now.' }
            }
          }
        ],
        confirmationDialog: {
          title: { en: 'No leftovers' },
          message: { en: 'Confirm no leftovers.' }
        }
      } as any,
      ctx: {
        getValue: (fieldId: string) => (fieldId === 'LEFTOVER_COUNT' ? 2 : '')
      } as any,
      now: new Date('2026-04-07T12:00:00Z')
    });

    expect(dialog).toEqual({
      title: { en: 'Store leftovers' },
      message: { en: 'Label leftovers now.' }
    });
  });

  test('selects the first matching progress dialog case before the fallback dialog', () => {
    const dialog = selectMilestoneProgressDialog({
      action: {
        type: 'followupBatch',
        preActions: ['CLOSE_RECORD'],
        progressDialogCases: [
          {
            when: { fieldId: 'LEFTOVER_COUNT', greaterThan: 0 },
            dialog: {
              title: { en: 'Leftovers' },
              message: { en: 'Please wait for leftover ids.' }
            }
          }
        ],
        progressDialog: {
          title: { en: 'Submitting' },
          message: { en: 'Please wait.' }
        }
      } as any,
      ctx: {
        getValue: (fieldId: string) => (fieldId === 'LEFTOVER_COUNT' ? 2 : '')
      } as any,
      now: new Date('2026-04-07T12:00:00Z')
    });

    expect(dialog).toEqual({
      title: { en: 'Leftovers' },
      message: { en: 'Please wait for leftover ids.' }
    });
  });

  test('filters generated records by effect id and target form key', () => {
    const filtered = filterGeneratedRecordsForDialog({
      config: {
        submitEffectIds: ['captureProducedLeftovers'],
        targetFormKey: 'Config: Leftover Bank'
      } as any,
      records: [
        { effectId: 'captureProducedEntireDishLeftovers', targetFormKey: 'Config: Leftover Bank', recordId: 'rec-1' },
        { effectId: 'captureProducedLeftovers', targetFormKey: 'Config: Leftover Bank', recordId: 'rec-2' },
        { effectId: 'captureProducedLeftovers', targetFormKey: 'Config: Other', recordId: 'rec-3' }
      ]
    });

    expect(filtered).toEqual([
      { effectId: 'captureProducedLeftovers', targetFormKey: 'Config: Leftover Bank', recordId: 'rec-2' }
    ]);
  });

  test('renders generated record line placeholders from record values', () => {
    expect(
      renderGeneratedRecordLine(
        {
          effectId: 'captureProducedLeftovers',
          targetFormKey: 'Config: Leftover Bank',
          recordId: 'inv-1',
          values: {
            LEFTOVER_ID: 'SI-1',
            LEFTOVER_KIND: 'Single-ingredient',
            LEFTOVER_INGREDIENT: 'Rice'
          }
        },
        '{{LEFTOVER_ID}} | {{LEFTOVER_KIND}} | {{LEFTOVER_INGREDIENT}}'
      )
    ).toBe('SI-1 | Single-ingredient | Rice');
  });

  test('renders generated record lines with fallback, pluralization, and date formatting', () => {
    expect(
      renderGeneratedRecordLine(
        {
          effectId: 'captureProducedEntireDishLeftovers',
          targetFormKey: 'Config: Leftover Bank',
          recordId: 'inv-1',
          values: {
            LEFTOVER_ID: 'MI-8',
            LEFTOVER_KIND: 'Multi-ingredient',
            LEFTOVER_RECIPE: 'Chicken & vegetable sauce',
            LEFTOVER_PORTIONS: 5,
            LEFTOVER_EXP_DATE: '2026-04-17'
          }
        },
        '{{LEFTOVER_ID}} | {{LEFTOVER_RECIPE || LEFTOVER_INGREDIENT || LEFTOVER_KIND}} | {{LEFTOVER_PORTIONS | pluralize:portion:portions || LEFTOVER_QTY | appendField:LEFTOVER_UNIT}} | {{LEFTOVER_EXP_DATE | date:dd-MMM-yyyy | label:Expires}}'
      )
    ).toBe('MI-8 | Chicken & vegetable sauce | 5 portions | Expires 17-Apr-2026');
  });

  test('renders generated record lines with alternate quantity fields', () => {
    expect(
      renderGeneratedRecordLine(
        {
          effectId: 'captureProducedLeftovers',
          targetFormKey: 'Config: Leftover Bank',
          recordId: 'inv-2',
          values: {
            LEFTOVER_ID: 'SI-4',
            LEFTOVER_KIND: 'Single-ingredient',
            LEFTOVER_INGREDIENT: 'Basmati rice',
            LEFTOVER_QTY: 5000,
            LEFTOVER_UNIT: 'gr',
            LEFTOVER_EXP_DATE: '2026-04-18T00:00:00.000Z'
          }
        },
        '{{LEFTOVER_ID}} | {{LEFTOVER_RECIPE || LEFTOVER_INGREDIENT || LEFTOVER_KIND}} | {{LEFTOVER_PORTIONS | pluralize:portion:portions || LEFTOVER_QTY | appendField:LEFTOVER_UNIT}} | {{LEFTOVER_EXP_DATE | date:dd-MMM-yyyy | label:Expires}}'
      )
    ).toBe('SI-4 | Basmati rice | 5000 gr | Expires 18-Apr-2026');
  });

  test('extracts generated records from follow-up action results', () => {
    expect(
      getGeneratedRecordsFromFollowupResult({
        success: true,
        submitEffects: {
          generatedRecords: [
            { effectId: 'captureProducedLeftovers', targetFormKey: 'Config: Leftover Bank', recordId: 'inv-1' }
          ]
        }
      } as any)
    ).toEqual([
      { effectId: 'captureProducedLeftovers', targetFormKey: 'Config: Leftover Bank', recordId: 'inv-1' }
    ]);
  });

  test('builds summary template payload from generated submit-effect records', () => {
    const json = buildGeneratedSubmitEffectRecordsTemplateJson([
      {
        effectId: 'captureProducedEntireDishLeftovers',
        targetFormKey: 'Config: Leftover Bank',
        recordId: 'leftover::MP-1::entire::Standard',
        values: {
          LEFTOVER_ID: 'MI-6',
          LEFTOVER_KIND: 'Multi-ingredient',
          LEFTOVER_RECIPE: 'Courgette creamy pasta',
          LEFTOVER_PORTIONS: 15
        }
      }
    ]);

    expect(JSON.parse(json)).toEqual({
      byTargetFormKey: {
        'Config: Leftover Bank': [
          {
            effectId: 'captureProducedEntireDishLeftovers',
            targetFormKey: 'Config: Leftover Bank',
            recordId: 'leftover::MP-1::entire::Standard',
            values: {
              LEFTOVER_ID: 'MI-6',
              LEFTOVER_KIND: 'Multi-ingredient',
              LEFTOVER_RECIPE: 'Courgette creamy pasta',
              LEFTOVER_PORTIONS: 15
            }
          }
        ]
      }
    });
  });

  test('merges generated submit-effect records into summary render values without mutating empty results', () => {
    const values = { MP_ID: 'MP-1' };
    expect(mergeGeneratedSubmitEffectRecordsIntoValues(values, [])).toBe(values);

    const next = mergeGeneratedSubmitEffectRecordsIntoValues(values, [
      {
        targetFormKey: 'Config: Leftover Bank',
        recordId: 'leftover::MP-1::entire::Standard',
        values: { LEFTOVER_ID: 'MI-6' }
      }
    ]);

    expect(next).not.toBe(values);
    expect(next.MP_ID).toBe('MP-1');
    expect(JSON.parse(next[GENERATED_SUBMIT_EFFECT_RECORDS_FIELD])).toEqual({
      byTargetFormKey: {
        'Config: Leftover Bank': [
          {
            targetFormKey: 'Config: Leftover Bank',
            recordId: 'leftover::MP-1::entire::Standard',
            values: { LEFTOVER_ID: 'MI-6' }
          }
        ]
      }
    });
  });
});
