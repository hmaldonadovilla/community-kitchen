import { resolveCompactTextControlDisplayValue } from '../../../src/web/react/components/form/compactControlValue';

describe('resolveCompactTextControlDisplayValue', () => {
  it('keeps an empty explicit value while the compact control is actively being edited', () => {
    expect(
      resolveCompactTextControlDisplayValue({
        explicitValue: null,
        fallbackValue: 'Chicken & vegetable sauce',
        preserveEmptyWhileEditing: true
      })
    ).toBe('');
  });

  it('falls back after editing ends and the explicit value is empty', () => {
    expect(
      resolveCompactTextControlDisplayValue({
        explicitValue: null,
        fallbackValue: 'Chicken & vegetable sauce',
        preserveEmptyWhileEditing: false
      })
    ).toBe('Chicken & vegetable sauce');
  });
});
