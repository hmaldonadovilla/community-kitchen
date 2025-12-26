import { shouldHideField } from '../../src/web/rules/visibility';

describe('shouldHideField', () => {
  const ctx = {
    getValue: (id: string) => (id === 'dep' ? 'yes' : ''),
    getLineValue: (_row: string, fieldId: string) => (fieldId === 'line__dep' ? 'no' : '')
  };

  it('hides when showWhen not matched', () => {
    const hide = shouldHideField({ showWhen: { fieldId: 'dep', equals: 'no' } }, ctx);
    expect(hide).toBe(true);
  });

  it('hides when hideWhen matched', () => {
    const hide = shouldHideField({ hideWhen: { fieldId: 'dep', equals: 'yes' } }, ctx);
    expect(hide).toBe(true);
  });

  it('shows when showWhen matched', () => {
    const hide = shouldHideField({ showWhen: { fieldId: 'dep', equals: 'yes' } }, ctx);
    expect(hide).toBe(false);
  });

  it('supports notEmpty in showWhen', () => {
    const ctxEmpty = { getValue: (_id: string) => '' };
    const ctxNonEmpty = { getValue: (_id: string) => 'hello' };
    expect(shouldHideField({ showWhen: { fieldId: 'dep', notEmpty: true } } as any, ctxEmpty as any)).toBe(true);
    expect(shouldHideField({ showWhen: { fieldId: 'dep', notEmpty: true } } as any, ctxNonEmpty as any)).toBe(false);
  });
});
