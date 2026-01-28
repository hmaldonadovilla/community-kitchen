import { evaluateFieldChangeDialogWhen } from '../../../src/web/react/app/fieldChangeDialog';

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
