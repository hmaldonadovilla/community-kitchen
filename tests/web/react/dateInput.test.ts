import {
  isDateInputValueWithinBounds,
  resolveDateInputBound,
  resolveDateInputValueWithinBounds
} from '../../../src/web/react/components/form/dateInputBounds';
import {
  resolveDateInputRenderedValue,
  shouldDeferNativeDateInputCommit
} from '../../../src/web/react/components/form/dateInputInteraction';

describe('DateInput helpers', () => {
  test('resolves today bounds to the local YYYY-MM-DD date', () => {
    expect(resolveDateInputBound('today', new Date(2026, 3, 11))).toBe('2026-04-11');
  });

  test('keeps explicit YYYY-MM-DD bounds unchanged', () => {
    expect(resolveDateInputBound('2026-04-15', new Date(2026, 3, 11))).toBe('2026-04-15');
  });

  test('rejects values outside the configured bounds', () => {
    expect(isDateInputValueWithinBounds('2026-04-10', { min: '2026-04-11' })).toBe(false);
    expect(isDateInputValueWithinBounds('2026-04-12', { min: '2026-04-11', max: '2026-04-20' })).toBe(true);
    expect(isDateInputValueWithinBounds('2026-04-21', { max: '2026-04-20' })).toBe(false);
  });

  test('clamps values below the minimum bound', () => {
    expect(resolveDateInputValueWithinBounds('2026-04-10', { min: '2026-04-11' })).toEqual({
      value: '2026-04-11',
      corrected: true,
      correction: 'min'
    });
  });

  test('clamps values above the maximum bound', () => {
    expect(resolveDateInputValueWithinBounds('2026-04-21', { max: '2026-04-20' })).toEqual({
      value: '2026-04-20',
      corrected: true,
      correction: 'max'
    });
  });

  test('keeps values unchanged when already within bounds', () => {
    expect(resolveDateInputValueWithinBounds('2026-04-15', { min: '2026-04-11', max: '2026-04-20' })).toEqual({
      value: '2026-04-15',
      corrected: false,
      correction: null
    });
  });

  test('does not defer native commit when the input stays in immediate mode', () => {
    expect(
      shouldDeferNativeDateInputCommit('immediate', {
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15',
        platform: 'iPhone',
        maxTouchPoints: 5
      })
    ).toBe(false);
  });

  test('defers native date commit on iPhone-like user agents', () => {
    expect(
      shouldDeferNativeDateInputCommit('deferWhileFocused', {
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15',
        platform: 'iPhone',
        maxTouchPoints: 5
      })
    ).toBe(true);
  });

  test('defers native date commit on iPadOS desktop mode', () => {
    expect(
      shouldDeferNativeDateInputCommit('deferWhileFocused', {
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15',
        platform: 'MacIntel',
        maxTouchPoints: 5
      })
    ).toBe(true);
  });

  test('keeps immediate commit mode on desktop macOS', () => {
    expect(
      shouldDeferNativeDateInputCommit('deferWhileFocused', {
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15',
        platform: 'MacIntel',
        maxTouchPoints: 0
      })
    ).toBe(false);
  });

  test('renders the in-progress native date value while iOS commit is deferred', () => {
    expect(
      resolveDateInputRenderedValue({
        value: '',
        draftValue: '2026-04-25',
        deferNativeCommit: true,
        focused: true
      })
    ).toBe('2026-04-25');
    expect(
      resolveDateInputRenderedValue({
        value: '',
        draftValue: '2026-04-25',
        deferNativeCommit: true,
        focused: false
      })
    ).toBe('');
  });
});
