import { shouldKeepInvalidSourceFirstQuantityDraft } from '../../../src/web/react/features/lineItems/domain/sourceFirstUtilisationDraftDecision';

describe('sourceFirstUtilisationDraftDecision', () => {
  test('keeps empty and non-positive quantity drafts local on blur', () => {
    expect(
      shouldKeepInvalidSourceFirstQuantityDraft({
        fieldId: 'LEFTOVER_USE_QTY',
        quantityFieldId: 'LEFTOVER_USE_QTY',
        value: ''
      })
    ).toBe(true);
    expect(
      shouldKeepInvalidSourceFirstQuantityDraft({
        fieldId: 'LEFTOVER_USE_QTY',
        quantityFieldId: 'LEFTOVER_USE_QTY',
        value: '0'
      })
    ).toBe(true);
    expect(
      shouldKeepInvalidSourceFirstQuantityDraft({
        fieldId: 'LEFTOVER_USE_QTY',
        quantityFieldId: 'LEFTOVER_USE_QTY',
        value: '-1'
      })
    ).toBe(true);
  });

  test('does not intercept positive quantities or unrelated fields', () => {
    expect(
      shouldKeepInvalidSourceFirstQuantityDraft({
        fieldId: 'LEFTOVER_USE_QTY',
        quantityFieldId: 'LEFTOVER_USE_QTY',
        value: '1'
      })
    ).toBe(false);
    expect(
      shouldKeepInvalidSourceFirstQuantityDraft({
        fieldId: 'LEFTOVER_USAGE_MODE',
        quantityFieldId: 'LEFTOVER_USE_QTY',
        value: '0'
      })
    ).toBe(false);
  });
});
