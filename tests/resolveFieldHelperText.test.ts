import { resolveFieldHelperText } from '../src/web/react/components/form/utils';

describe('resolveFieldHelperText', () => {
  test('returns empty when helperText is missing', () => {
    expect(resolveFieldHelperText({ ui: {}, language: 'EN' })).toEqual({ text: '', placement: 'belowLabel' });
  });

  test('resolves localized helper text', () => {
    expect(resolveFieldHelperText({ ui: { helperText: { en: 'Enter a name', fr: 'Entrez un nom' } }, language: 'FR' })).toEqual({
      text: 'Entrez un nom',
      placement: 'belowLabel'
    });
  });

  test('normalizes placement to placeholder', () => {
    expect(resolveFieldHelperText({ ui: { helperText: 'Enter a name', helperPlacement: 'placeholder' }, language: 'EN' })).toEqual({
      text: 'Enter a name',
      placement: 'placeholder'
    });
    expect(resolveFieldHelperText({ ui: { helperText: 'Enter a name', helperPlacement: 'inside' }, language: 'EN' })).toEqual({
      text: 'Enter a name',
      placement: 'placeholder'
    });
  });
});

