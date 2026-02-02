import { isAllowedNumberInputKey, isAllowedNumberInputText } from '../src/web/react/components/form/numberInput';

describe('numberInput', () => {
  test('allows typical navigation keys', () => {
    expect(isAllowedNumberInputKey('Backspace')).toBe(true);
    expect(isAllowedNumberInputKey('ArrowLeft')).toBe(true);
    expect(isAllowedNumberInputKey('Tab')).toBe(true);
  });

  test('allows numeric characters and basic separators', () => {
    expect(isAllowedNumberInputKey('0')).toBe(true);
    expect(isAllowedNumberInputKey('9')).toBe(true);
    expect(isAllowedNumberInputKey('.')).toBe(true);
    expect(isAllowedNumberInputKey(',')).toBe(true);
    expect(isAllowedNumberInputKey('-')).toBe(true);
  });

  test('blocks non-numeric characters', () => {
    expect(isAllowedNumberInputKey('a')).toBe(false);
    expect(isAllowedNumberInputKey('E')).toBe(false);
    expect(isAllowedNumberInputKey('+')).toBe(false);
  });

  test('allows pasted numeric text', () => {
    expect(isAllowedNumberInputText('123')).toBe(true);
    expect(isAllowedNumberInputText('12 34')).toBe(true);
    expect(isAllowedNumberInputText('-12.5')).toBe(true);
  });

  test('blocks pasted non-numeric text', () => {
    expect(isAllowedNumberInputText('1e2')).toBe(false);
    expect(isAllowedNumberInputText('abc')).toBe(false);
    expect(isAllowedNumberInputText('12abc')).toBe(false);
  });
});

