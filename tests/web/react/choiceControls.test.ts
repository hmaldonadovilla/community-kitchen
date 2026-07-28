import {
  shouldPreferCustomChoiceControl,
  shouldUseSearchableChoiceControl
} from '../../../src/web/react/components/form/choiceControls';

describe('shouldUseSearchableChoiceControl', () => {
  test('keeps an explicit select override native in auto mode', () => {
    expect(
      shouldUseSearchableChoiceControl({
        variant: 'select',
        optionCount: 30,
        override: 'select'
      })
    ).toBe(false);
  });

  test('allows choiceSearchEnabled to force searchable select', () => {
    expect(
      shouldUseSearchableChoiceControl({
        variant: 'select',
        optionCount: 3,
        searchEnabled: true,
        override: 'select'
      })
    ).toBe(true);
  });

  test('uses searchable select automatically for large auto select option sets', () => {
    expect(
      shouldUseSearchableChoiceControl({
        variant: 'select',
        optionCount: 30,
        override: 'auto'
      })
    ).toBe(true);
  });

  test('prefers the custom choice control for Android user agents', () => {
    expect(
      shouldPreferCustomChoiceControl(
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126.0.0.0 Mobile Safari/537.36'
      )
    ).toBe(true);
    expect(shouldPreferCustomChoiceControl('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')).toBe(false);
  });

  test('uses the custom select on Android even when the configuration requests a native select', () => {
    expect(
      shouldUseSearchableChoiceControl({
        variant: 'select',
        optionCount: 8,
        searchEnabled: false,
        override: 'select',
        preferCustomControl: true
      })
    ).toBe(true);
  });
});
