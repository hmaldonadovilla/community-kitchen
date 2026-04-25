import { shouldUseSearchableChoiceControl } from '../../../src/web/react/components/form/choiceControls';

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
});
