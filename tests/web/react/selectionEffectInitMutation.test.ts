import { shouldSkipSelectionEffectInitValueWrite } from '../../../src/web/react/features/formState/domain/selectionEffectInitMutation';

describe('selectionEffectInitMutation', () => {
  it('skips writing an unchanged selection-effect init trigger value', () => {
    expect(
      shouldSkipSelectionEffectInitValueWrite({
        source: 'selectionEffectInit',
        currentValue: 'Black pepper',
        nextValue: 'Black pepper'
      })
    ).toBe(true);
  });

  it('allows user writes and changed init values', () => {
    expect(
      shouldSkipSelectionEffectInitValueWrite({
        source: 'user',
        currentValue: 'Black pepper',
        nextValue: 'Black pepper'
      })
    ).toBe(false);
    expect(
      shouldSkipSelectionEffectInitValueWrite({
        source: 'selectionEffectInit',
        currentValue: 'Black pepper',
        nextValue: 'Peanut butter'
      })
    ).toBe(false);
  });
});
