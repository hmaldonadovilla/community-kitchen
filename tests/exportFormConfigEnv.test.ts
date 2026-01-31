export {};
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { parseEnvContent, normalizeEnvName, resolveDefaultExportDir, resolveOutputPath } = require('../scripts/export-form-config');
const path = require('path');

describe('export-form-config .env parsing', () => {
  test('parses key/value pairs with comments and quotes', () => {
    const content = [
      '# comment',
      'CK_APP_URL="https://example.com/exec"',
      "CK_FORM_KEY='Config: Meal Production'",
      'EMPTY=',
      'INVALID_LINE',
      'CK_EXPORT_OUT=docs/config/exports/meal_production.json'
    ].join('\n');

    const parsed = parseEnvContent(content);
    expect(parsed.CK_APP_URL).toBe('https://example.com/exec');
    expect(parsed.CK_FORM_KEY).toBe('Config: Meal Production');
    expect(parsed.CK_EXPORT_OUT).toBe('docs/config/exports/meal_production.json');
    expect(parsed.EMPTY).toBe('');
    expect((parsed as any).INVALID_LINE).toBeUndefined();
  });
});

describe('export-form-config env helpers', () => {
  test('normalizes production alias', () => {
    expect(normalizeEnvName('production')).toBe('prod');
    expect(normalizeEnvName('Prod')).toBe('prod');
  });

  test('resolves env-specific export directories', () => {
    const dir = resolveDefaultExportDir('staging');
    expect(path.normalize(dir)).toMatch(/docs[\\/]+config[\\/]+exports[\\/]+staging$/);
  });

  test('builds env-aware output paths when no out arg is provided', () => {
    const outPath = resolveOutputPath('Config: Meal Production', '', 'staging');
    expect(path.normalize(outPath)).toMatch(/docs[\\/]+config[\\/]+exports[\\/]+staging[\\/]+config_meal_production\.json$/);
  });
});
