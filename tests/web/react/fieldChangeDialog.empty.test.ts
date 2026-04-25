import {
  evaluateFieldChangeDialogWhen,
  evaluateFieldChangeDialogWhenWithFallback,
  shouldDeferFieldChangeMutation
} from '../../../src/web/react/app/fieldChangeDialog';

describe('evaluateFieldChangeDialogWhen', () => {
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
