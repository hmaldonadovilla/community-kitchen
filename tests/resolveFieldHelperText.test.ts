import { resolveFieldHelperText } from '../src/web/react/components/form/utils';

describe('resolveFieldHelperText', () => {
  test('returns empty when helperText is missing', () => {
    expect(resolveFieldHelperText({ ui: {}, language: 'EN' })).toEqual({
      belowLabelText: '',
      placeholderText: '',
      text: '',
      placement: 'belowLabel'
    });
  });

  test('resolves localized helper text', () => {
    expect(resolveFieldHelperText({ ui: { helperText: { en: 'Enter a name', fr: 'Entrez un nom' } }, language: 'FR' })).toEqual({
      belowLabelText: 'Entrez un nom',
      placeholderText: '',
      text: 'Entrez un nom',
      placement: 'belowLabel'
    });
  });

  test('normalizes placement to placeholder', () => {
    expect(resolveFieldHelperText({ ui: { helperText: 'Enter a name', helperPlacement: 'placeholder' }, language: 'EN' })).toEqual({
      belowLabelText: '',
      placeholderText: 'Enter a name',
      text: 'Enter a name',
      placement: 'placeholder'
    });
    expect(resolveFieldHelperText({ ui: { helperText: 'Enter a name', helperPlacement: 'inside' }, language: 'EN' })).toEqual({
      belowLabelText: '',
      placeholderText: 'Enter a name',
      text: 'Enter a name',
      placement: 'placeholder'
    });
  });

  test('supports dual helper text values', () => {
    expect(
      resolveFieldHelperText({
        ui: {
          helperTextBelowLabel: { en: 'Rules below the label' },
          helperTextPlaceholder: { en: 'Type value here' }
        },
        language: 'EN'
      })
    ).toEqual({
      belowLabelText: 'Rules below the label',
      placeholderText: 'Type value here',
      text: 'Rules below the label',
      placement: 'belowLabel'
    });
  });
});
