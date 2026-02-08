import { isPrimaryActionLabel, resolveButtonTonePrimary } from '../../../src/web/react/app/buttonTone';

describe('buttonTone', () => {
  it('uses label heuristics when no tone override is provided', () => {
    expect(isPrimaryActionLabel('Back')).toBe(true);
    expect(resolveButtonTonePrimary('Back', undefined)).toBe(true);
    expect(resolveButtonTonePrimary('Ready for Production', undefined)).toBe(false);
  });

  it('applies explicit tone overrides', () => {
    expect(resolveButtonTonePrimary('Ready for Production', 'primary')).toBe(true);
    expect(resolveButtonTonePrimary('Back', 'secondary')).toBe(false);
  });
});

