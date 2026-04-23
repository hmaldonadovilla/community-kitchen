import fs from 'fs';
import path from 'path';

const STAGING_CONFIG_DIR = path.resolve(__dirname, '../../docs/config/exports/staging');

describe('staging form header sidebar defaults', () => {
  test('all staged form exports disable the title-open sidebar', () => {
    const files = fs
      .readdirSync(STAGING_CONFIG_DIR)
      .filter(name => /^config_.*\.json$/.test(name))
      .sort();

    expect(files.length).toBeGreaterThan(0);

    files.forEach(fileName => {
      const filePath = path.join(STAGING_CONFIG_DIR, fileName);
      const cfg = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      expect(cfg?.form?.appHeader?.sidebarEnabled).toBe(false);
      if (cfg?.definition) {
        expect(cfg?.definition?.appHeader?.sidebarEnabled).toBe(false);
      }
    });
  });
});
