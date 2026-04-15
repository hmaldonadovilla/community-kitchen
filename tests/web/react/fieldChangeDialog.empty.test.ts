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
});
