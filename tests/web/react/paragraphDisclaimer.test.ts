import { computeParagraphDisclaimerUpdates } from '../../../src/web/react/app/paragraphDisclaimer';
import { ROW_NON_MATCH_OPTIONS_KEY } from '../../../src/web/react/app/lineItems';

describe('paragraph disclaimer domain', () => {
  test('computes paragraph disclaimer field updates from form state', () => {
    const definition: any = {
      questions: [
        {
          id: 'meals',
          type: 'LINE_ITEM_GROUP',
          lineItemConfig: {
            fields: [{ id: 'meal', type: 'TEXT' }]
          }
        },
        {
          id: 'notes',
          type: 'PARAGRAPH',
          ui: {
            paragraphDisclaimer: {
              separator: '---',
              sourceGroupId: 'meals',
              itemFieldId: 'meal'
            }
          }
        }
      ]
    };

    const result = computeParagraphDisclaimerUpdates({
      definition,
      language: 'en' as any,
      values: { notes: 'User note' },
      lineItems: {
        meals: [{ id: 'row1', values: { meal: 'Soup', [ROW_NON_MATCH_OPTIONS_KEY]: ['Onions'] } }]
      },
      optionState: {}
    });

    expect(result.updatedCount).toBe(1);
    expect(result.fieldUpdates).toEqual([{ fieldId: 'notes', keyCount: 1, itemCount: 1 }]);
    expect(result.updates.notes?.toString()).toContain('User note');
    expect(result.updates.notes?.toString()).toContain('Pay attention to:');
    expect(result.updates.notes?.toString()).toContain('For Onions, do not use: Soup.');

    expect(
      computeParagraphDisclaimerUpdates({
        definition,
        language: 'en' as any,
        values: result.updates,
        lineItems: {
          meals: [{ id: 'row1', values: { meal: 'Soup', [ROW_NON_MATCH_OPTIONS_KEY]: ['Onions'] } }]
        },
        optionState: {}
      }).updatedCount
    ).toBe(0);
  });

  test('does not update editable paragraph disclaimers when no disclaimer section is available', () => {
    const definition: any = {
      questions: [
        {
          id: 'notes',
          type: 'PARAGRAPH',
          ui: {
            paragraphDisclaimer: {
              editable: true
            }
          }
        }
      ]
    };

    expect(
      computeParagraphDisclaimerUpdates({
        definition,
        language: 'en' as any,
        values: { notes: 'User note' },
        lineItems: {},
        optionState: {}
      })
    ).toEqual({ updates: {}, updatedCount: 0, fieldUpdates: [] });
  });
});
