import { isPerfInstrumentationEnv } from '../../../src/web/react/perfInstrumentation';

describe('perfInstrumentation', () => {
  test('enables instrumentation for staging-like env tags', () => {
    expect(isPerfInstrumentationEnv('staging')).toBe(true);
    expect(isPerfInstrumentationEnv('stage-2')).toBe(true);
    expect(isPerfInstrumentationEnv('stage-two')).toBe(true);
    expect(isPerfInstrumentationEnv('dev-local')).toBe(true);
  });

  test('disables instrumentation for production env tags', () => {
    expect(isPerfInstrumentationEnv('prod')).toBe(false);
    expect(isPerfInstrumentationEnv('production')).toBe(false);
    expect(isPerfInstrumentationEnv('')).toBe(false);
  });
});
