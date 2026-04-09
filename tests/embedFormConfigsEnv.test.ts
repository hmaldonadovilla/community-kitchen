export {};
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { normalizeEnvName, resolveConfigsDir } = require('../scripts/embed-form-configs');
const path = require('path');
const fs = require('fs');

describe('embed-form-configs env helpers', () => {
  test('normalizes production to prod', () => {
    expect(normalizeEnvName('production')).toBe('prod');
    expect(normalizeEnvName('Prod')).toBe('prod');
  });

  test('resolves env-specific config dirs', () => {
    const dir = resolveConfigsDir('staging');
    expect(path.normalize(dir)).toMatch(/docs[\\/]+config[\\/]+exports[\\/]+staging$/);
  });

  test('exported configs include a stable cache fingerprint', () => {
    const raw = fs.readFileSync(path.join(__dirname, '..', 'src', 'config', 'bundledFormConfigs.ts'), 'utf8');
    expect(raw).toContain('"cacheFingerprint":');
  });
});
