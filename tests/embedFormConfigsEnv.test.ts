export {};
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { normalizeEnvName, resolveConfigsDir } = require('../scripts/embed-form-configs');
const path = require('path');

describe('embed-form-configs env helpers', () => {
  test('normalizes production to prod', () => {
    expect(normalizeEnvName('production')).toBe('prod');
    expect(normalizeEnvName('Prod')).toBe('prod');
  });

  test('resolves env-specific config dirs', () => {
    const dir = resolveConfigsDir('staging');
    expect(path.normalize(dir)).toMatch(/docs[\\/]+config[\\/]+exports[\\/]+staging$/);
  });
});
