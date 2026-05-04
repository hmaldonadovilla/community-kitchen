import {
  evaluateFieldChangeDialogWhen,
  evaluateFieldChangeDialogWhenWithFallback,
  shouldDeferFieldChangeMutation,
  shouldHoldFieldChangeSelectionEffects
} from '../../../src/web/react/app/fieldChangeDialog';

describe('evaluateFieldChangeDialogWhen', () => {
  const orderClearWhen = (): any => ({
    all: [
      { fieldId: 'ORD_QTY', equals: 0 },
      {
        lineItems: {
          groupId: 'MP_MEALS_REQUEST',
          subGroupId: 'MP_TYPE_LI',
          match: 'any',
          when: {
            any: [
              { fieldId: 'PREP_TYPE', equals: ['Multi-ingredient', 'Single-ingredient'] },
              { fieldId: 'RECIPE', notEmpty: true },
              { fieldId: 'LEFTOVER_ID', notEmpty: true }
            ]
          }
        }
      }
    ]
  });

  it('does not trigger when the next value is empty', () => {
    const when: any = { fieldId: 'STATUS', equals: ['Open'] };
    const values: any = { STATUS: 'Open', TARGET: 'old' };

    const result = evaluateFieldChangeDialogWhen({
      when,
      scope: 'top',
      fieldId: 'TARGET',
      nextValue: '',
      values,
      lineItems: {}
    });

    expect(result).toBe(false);
  });

  it('can evaluate downstream data when clearing an existing value is allowed', () => {
    const when: any = { fieldId: 'ING_EVD', notEmpty: true };
    const values: any = { ING_EVD: [{ url: 'https://example.test/receipt.jpg' }], TARGET: 'old' };

    const result = evaluateFieldChangeDialogWhen({
      when,
      scope: 'top',
      fieldId: 'TARGET',
      nextValue: '',
      values,
      lineItems: {},
      allowEmptyNextValue: true
    });

    expect(result).toBe(true);
  });

  it('treats pending file uploads as downstream data before upload completion', () => {
    const receipt =
      typeof File !== 'undefined'
        ? new File(['receipt'], 'receipt.svg', { type: 'image/svg+xml' })
        : new Blob(['receipt'], { type: 'image/svg+xml' });

    const result = evaluateFieldChangeDialogWhen({
      when: { fieldId: 'ING_EVD', notEmpty: true } as any,
      scope: 'top',
      fieldId: 'TARGET',
      nextValue: '',
      values: { ING_EVD: [receipt], TARGET: 'old' } as any,
      lineItems: {},
      allowEmptyNextValue: true
    });

    expect(result).toBe(true);
  });

  it('can evaluate parent row data for a line-item clear', () => {
    const result = evaluateFieldChangeDialogWhen({
      when: { any: [{ fieldId: 'MP_COOK_TEMP', equals: true }, { fieldId: 'TEMP_EVD', notEmpty: true }] } as any,
      scope: 'line',
      fieldId: 'RECIPE',
      groupId: 'MP_MEALS_REQUEST::meal1::MP_TYPE_LI',
      rowId: 'prep1',
      nextValue: '',
      values: {},
      lineItems: {
        MP_MEALS_REQUEST: [{ id: 'meal1', values: { MP_COOK_TEMP: true } }],
        'MP_MEALS_REQUEST::meal1::MP_TYPE_LI': [{ id: 'prep1', values: { RECIPE: 'Old recipe' } }]
      } as any,
      allowEmptyNextValue: true
    });

    expect(result).toBe(true);
  });

  it('does not trigger an order clear dialog for only the generated cook row', () => {
    const when = orderClearWhen();

    const result = evaluateFieldChangeDialogWhen({
      when,
      scope: 'line',
      fieldId: 'ORD_QTY',
      groupId: 'MP_MEALS_REQUEST',
      rowId: 'meal1',
      nextValue: 0,
      values: {},
      lineItems: {
        MP_MEALS_REQUEST: [{ id: 'meal1', values: { ORD_QTY: '3' } }],
        'MP_MEALS_REQUEST::meal1::MP_TYPE_LI': [{ id: 'prep1', values: { PREP_TYPE: 'Cook', PREP_QTY: 3 } }]
      } as any
    });

    expect(result).toBe(false);
  });

  it('does not trigger an order clear dialog from top-level production fields alone', () => {
    const when = orderClearWhen();

    const result = evaluateFieldChangeDialogWhen({
      when,
      scope: 'line',
      fieldId: 'ORD_QTY',
      groupId: 'MP_MEALS_REQUEST',
      rowId: 'meal1',
      nextValue: 0,
      values: { ING_EVD: [{ url: 'https://example.test/receipt.jpg' }], MP_COOK_TEMP: true },
      lineItems: {
        MP_MEALS_REQUEST: [{ id: 'meal1', values: { ORD_QTY: '3' } }],
        'MP_MEALS_REQUEST::meal1::MP_TYPE_LI': [{ id: 'prep1', values: { PREP_TYPE: 'Cook', PREP_QTY: 3 } }]
      } as any
    });

    expect(result).toBe(false);
  });

  it('triggers an order clear dialog when the current meal row has a leftover prep row', () => {
    const when = orderClearWhen();

    const result = evaluateFieldChangeDialogWhen({
      when,
      scope: 'line',
      fieldId: 'ORD_QTY',
      groupId: 'MP_MEALS_REQUEST',
      rowId: 'meal1',
      nextValue: 0,
      values: {},
      lineItems: {
        MP_MEALS_REQUEST: [{ id: 'meal1', values: { ORD_QTY: '3' } }],
        'MP_MEALS_REQUEST::meal1::MP_TYPE_LI': [{ id: 'prep1', values: { PREP_TYPE: 'Multi-ingredient', PREP_QTY: 2 } }]
      } as any
    });

    expect(result).toBe(true);
  });

  it('triggers an order clear dialog when the current meal row has production data', () => {
    const when = orderClearWhen();

    const result = evaluateFieldChangeDialogWhen({
      when,
      scope: 'line',
      fieldId: 'ORD_QTY',
      groupId: 'MP_MEALS_REQUEST',
      rowId: 'meal1',
      nextValue: 0,
      values: {},
      lineItems: {
        MP_MEALS_REQUEST: [
          { id: 'meal1', values: { ORD_QTY: 3 } },
          { id: 'meal2', values: { ORD_QTY: 5 } }
        ],
        'MP_MEALS_REQUEST::meal1::MP_TYPE_LI': [
          { id: 'prep1', values: { PREP_TYPE: 'Cook', PREP_QTY: 3, RECIPE: 'Pasta' } }
        ],
        'MP_MEALS_REQUEST::meal2::MP_TYPE_LI': [{ id: 'prep2', values: { PREP_TYPE: 'Cook', PREP_QTY: 5 } }]
      } as any
    });

    expect(result).toBe(true);
  });

  it('scopes order clear production-data checks to the current meal row', () => {
    const when = orderClearWhen();

    const result = evaluateFieldChangeDialogWhen({
      when,
      scope: 'line',
      fieldId: 'ORD_QTY',
      groupId: 'MP_MEALS_REQUEST',
      rowId: 'meal1',
      nextValue: 0,
      values: {},
      lineItems: {
        MP_MEALS_REQUEST: [
          { id: 'meal1', values: { ORD_QTY: 3 } },
          { id: 'meal2', values: { ORD_QTY: 5 } }
        ],
        'MP_MEALS_REQUEST::meal1::MP_TYPE_LI': [{ id: 'prep1', values: { PREP_TYPE: 'Cook', PREP_QTY: 3 } }],
        'MP_MEALS_REQUEST::meal2::MP_TYPE_LI': [
          { id: 'prep2', values: { PREP_TYPE: 'Cook', PREP_QTY: 5, RECIPE: 'Pasta' } }
        ]
      } as any
    });

    expect(result).toBe(false);
  });

  it('triggers when the next value is non-empty and when clause matches', () => {
    const when: any = { fieldId: 'STATUS', equals: ['Open'] };
    const values: any = { STATUS: 'Open', TARGET: 'old' };

    const result = evaluateFieldChangeDialogWhen({
      when,
      scope: 'top',
      fieldId: 'TARGET',
      nextValue: 'new',
      values,
      lineItems: {}
    });

    expect(result).toBe(true);
  });
});

describe('evaluateFieldChangeDialogWhenWithFallback', () => {
  const orderClearWhen = (): any => ({
    all: [
      { fieldId: 'ORD_QTY', equals: 0 },
      {
        lineItems: {
          groupId: 'MP_MEALS_REQUEST',
          subGroupId: 'MP_TYPE_LI',
          match: 'any',
          when: {
            any: [
              { fieldId: 'PREP_TYPE', equals: ['Multi-ingredient', 'Single-ingredient'] },
              { fieldId: 'RECIPE', notEmpty: true },
              { fieldId: 'LEFTOVER_ID', notEmpty: true }
            ]
          }
        }
      }
    ]
  });

  it('uses fallback snapshot when current values no longer match', () => {
    const result = evaluateFieldChangeDialogWhenWithFallback({
      when: { fieldId: 'MP_SERVICE', notEmpty: true } as any,
      scope: 'top',
      fieldId: 'MP_PREP_DATE',
      nextValue: '2026-02-12',
      values: { MP_SERVICE: '', MP_PREP_DATE: '2026-02-11' } as any,
      lineItems: {},
      fallbackValues: { MP_SERVICE: 'Lunch', MP_PREP_DATE: '2026-02-11' } as any,
      fallbackLineItems: {}
    });

    expect(result).toEqual({ matches: true, matchedOn: 'fallback' });
  });

  it('uses the row-scoped fallback snapshot after a numeric edit clears child production rows', () => {
    const result = evaluateFieldChangeDialogWhenWithFallback({
      when: orderClearWhen(),
      scope: 'line',
      fieldId: 'ORD_QTY',
      groupId: 'MP_MEALS_REQUEST',
      rowId: 'meal1',
      nextValue: '0',
      values: {},
      lineItems: {
        MP_MEALS_REQUEST: [{ id: 'meal1', values: { ORD_QTY: '' } }]
      } as any,
      fallbackValues: {},
      fallbackLineItems: {
        MP_MEALS_REQUEST: [{ id: 'meal1', values: { ORD_QTY: 50 } }],
        'MP_MEALS_REQUEST::meal1::MP_TYPE_LI': [
          { id: 'prep1', values: { PREP_TYPE: 'Cook', PREP_QTY: 50, RECIPE: 'Pasta' } }
        ]
      } as any
    });

    expect(result).toEqual({ matches: true, matchedOn: 'fallback' });
  });

  it('does not match when both current and fallback values fail', () => {
    const result = evaluateFieldChangeDialogWhenWithFallback({
      when: { fieldId: 'MP_SERVICE', notEmpty: true } as any,
      scope: 'top',
      fieldId: 'MP_PREP_DATE',
      nextValue: '2026-02-12',
      values: { MP_SERVICE: '' } as any,
      lineItems: {},
      fallbackValues: { MP_SERVICE: '' } as any,
      fallbackLineItems: {}
    });

    expect(result).toEqual({ matches: false, matchedOn: null });
  });
});

describe('shouldDeferFieldChangeMutation', () => {
  it('defers guarded choice changes until the dialog is confirmed', () => {
    expect(
      shouldDeferFieldChangeMutation({
        dialog: { when: { fieldId: 'MP_SERVICE', notEmpty: true } as any } as any,
        fieldType: 'CHOICE',
        shouldTrigger: true,
        prevValue: 'Belliard',
        nextValue: 'Hub'
      })
    ).toBe(true);
  });

  it('defers guarded date changes until the dialog is confirmed', () => {
    expect(
      shouldDeferFieldChangeMutation({
        dialog: { when: { fieldId: 'MP_SERVICE', notEmpty: true } as any } as any,
        fieldType: 'DATE',
        shouldTrigger: true,
        prevValue: '2026-04-15',
        nextValue: '2026-04-16'
      })
    ).toBe(true);
  });

  it('does not defer initial date entry when the first date-change dialog is suppressed', () => {
    expect(
      shouldDeferFieldChangeMutation({
        dialog: { when: { fieldId: 'MP_SERVICE', notEmpty: true } as any } as any,
        fieldType: 'DATE',
        shouldTrigger: true,
        prevValue: '',
        nextValue: '2026-04-16',
        suppressInitialDateDialog: true
      })
    ).toBe(false);
  });

  it('defers clearing an existing guarded choice until the dialog is confirmed', () => {
    expect(
      shouldDeferFieldChangeMutation({
        dialog: { when: { fieldId: 'ING_EVD', notEmpty: true } as any } as any,
        fieldType: 'CHOICE',
        shouldTrigger: true,
        prevValue: 'One pot creamy pasta',
        nextValue: ''
      })
    ).toBe(true);
  });

  it('does not defer setting an initially empty guarded choice', () => {
    expect(
      shouldDeferFieldChangeMutation({
        dialog: { when: { fieldId: 'ING_EVD', notEmpty: true } as any } as any,
        fieldType: 'CHOICE',
        shouldTrigger: true,
        prevValue: '',
        nextValue: 'One pot creamy pasta'
      })
    ).toBe(false);
  });
});

describe('shouldHoldFieldChangeSelectionEffects', () => {
  const dialog: any = { when: { fieldId: 'ORD_QTY', equals: 0 } };

  it('holds guarded line number selection effects while the user temporarily clears the field', () => {
    expect(
      shouldHoldFieldChangeSelectionEffects({
        dialog,
        scope: 'line',
        fieldType: 'NUMBER',
        shouldTrigger: false,
        hasExistingValueChange: true,
        nextValue: ''
      })
    ).toBe(true);
  });

  it('holds guarded line number selection effects once the destructive condition matches', () => {
    expect(
      shouldHoldFieldChangeSelectionEffects({
        dialog,
        scope: 'line',
        fieldType: 'NUMBER',
        shouldTrigger: true,
        hasExistingValueChange: true,
        nextValue: 0
      })
    ).toBe(true);
  });

  it('allows non-destructive non-empty line number edits to run selection effects', () => {
    expect(
      shouldHoldFieldChangeSelectionEffects({
        dialog,
        scope: 'line',
        fieldType: 'NUMBER',
        shouldTrigger: false,
        hasExistingValueChange: true,
        nextValue: 42
      })
    ).toBe(false);
  });

  it('does not hold top-level field selection effects', () => {
    expect(
      shouldHoldFieldChangeSelectionEffects({
        dialog,
        scope: 'top',
        fieldType: 'NUMBER',
        shouldTrigger: true,
        hasExistingValueChange: true,
        nextValue: 0
      })
    ).toBe(false);
  });
});
