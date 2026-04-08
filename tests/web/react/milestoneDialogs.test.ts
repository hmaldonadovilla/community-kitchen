import {
  filterGeneratedRecordsForDialog,
  getGeneratedRecordsFromFollowupResult,
  isGeneratedLeftoverRecord,
  renderGeneratedLeftoverLine,
  renderGeneratedRecordLine,
  selectMilestoneConfirmationDialog
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

  test('filters generated records by effect id and target form key', () => {
    const filtered = filterGeneratedRecordsForDialog({
      config: {
        submitEffectIds: ['captureProducedLeftovers'],
        targetFormKey: 'Config: Leftover Inventory'
      } as any,
      records: [
        { effectId: 'captureProducedEntireDishLeftovers', targetFormKey: 'Config: Leftover Inventory', recordId: 'rec-1' },
        { effectId: 'captureProducedLeftovers', targetFormKey: 'Config: Leftover Inventory', recordId: 'rec-2' },
        { effectId: 'captureProducedLeftovers', targetFormKey: 'Config: Other', recordId: 'rec-3' }
      ]
    });

    expect(filtered).toEqual([
      { effectId: 'captureProducedLeftovers', targetFormKey: 'Config: Leftover Inventory', recordId: 'rec-2' }
    ]);
  });

  test('renders generated record line placeholders from record values', () => {
    expect(
      renderGeneratedRecordLine(
        {
          effectId: 'captureProducedLeftovers',
          targetFormKey: 'Config: Leftover Inventory',
          recordId: 'inv-1',
          values: {
            LEFTOVER_ID: 'LP-1',
            LEFTOVER_KIND: 'Part dish',
            LEFTOVER_INGREDIENT: 'Rice'
          }
        },
        '{{LEFTOVER_ID}} | {{LEFTOVER_KIND}} | {{LEFTOVER_INGREDIENT}}'
      )
    ).toBe('LP-1 | Part dish | Rice');
  });

  test('renders entire dish leftovers with portions and bullet formatting', () => {
    expect(
      renderGeneratedLeftoverLine(
        {
          effectId: 'captureProducedEntireDishLeftovers',
          targetFormKey: 'Config: Leftover Inventory',
          recordId: 'inv-1',
          values: {
            LEFTOVER_ID: 'LE-8',
            LEFTOVER_KIND: 'Entire dish',
            LEFTOVER_RECIPE: 'Chicken & vegetable sauce',
            LEFTOVER_PORTIONS: 5
          }
        },
        { bullet: true }
      )
    ).toBe('• LE-8 | Entire dish | Chicken & vegetable sauce | 5 portions');
  });

  test('renders part dish leftovers with quantity and unit formatting', () => {
    expect(
      renderGeneratedLeftoverLine({
        effectId: 'captureProducedLeftovers',
        targetFormKey: 'Config: Leftover Inventory',
        recordId: 'inv-2',
        values: {
          LEFTOVER_ID: 'LP-4',
          LEFTOVER_KIND: 'Part dish',
          LEFTOVER_INGREDIENT: 'Basmati rice',
          LEFTOVER_QTY: 5000,
          LEFTOVER_UNIT: 'gr'
        }
      })
    ).toBe('LP-4 | Part dish | Basmati rice | 5000 gr');
  });

  test('identifies leftover inventory generated records', () => {
    expect(
      isGeneratedLeftoverRecord({
        effectId: 'captureProducedLeftovers',
        targetFormKey: 'Config: Leftover Inventory',
        recordId: 'inv-2'
      } as any)
    ).toBe(true);
    expect(
      isGeneratedLeftoverRecord({
        effectId: 'captureProducedLeftovers',
        targetFormKey: 'Config: Other',
        recordId: 'inv-2'
      } as any)
    ).toBe(false);
  });

  test('extracts generated records from follow-up action results', () => {
    expect(
      getGeneratedRecordsFromFollowupResult({
        success: true,
        submitEffects: {
          generatedRecords: [
            { effectId: 'captureProducedLeftovers', targetFormKey: 'Config: Leftover Inventory', recordId: 'inv-1' }
          ]
        }
      } as any)
    ).toEqual([
      { effectId: 'captureProducedLeftovers', targetFormKey: 'Config: Leftover Inventory', recordId: 'inv-1' }
    ]);
  });
});
