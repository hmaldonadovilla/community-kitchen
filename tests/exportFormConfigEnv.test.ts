// eslint-disable-next-line @typescript-eslint/no-var-requires
const { parseEnvContent } = require('../scripts/export-form-config');

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
