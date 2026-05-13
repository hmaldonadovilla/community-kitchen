import fs from 'fs';
import path from 'path';

describe('landing bundle imports', () => {
  test('does not import full bundled form configs into the landing entrypoint', () => {
    const source = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'web', 'react', 'landing', 'LandingPage.tsx'), 'utf8');

    expect(source).not.toContain('bundledFormConfigs');
    expect(source).not.toContain('BUNDLED_FORM_CONFIGS');
  });
});
