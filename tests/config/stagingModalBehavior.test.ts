import fs from 'fs';
import path from 'path';

const STAGING_CONFIG_DIR = path.resolve(__dirname, '../../docs/config/exports/staging');

type ModalViolation = {
  file: string;
  key: string;
  value: unknown;
  path: string;
};

const walk = (node: unknown, file: string, currentPath: string, out: ModalViolation[]): void => {
  if (Array.isArray(node)) {
    node.forEach((entry, idx) => walk(entry, file, `${currentPath}[${idx}]`, out));
    return;
  }
  if (!node || typeof node !== 'object') return;
  Object.entries(node as Record<string, unknown>).forEach(([key, value]) => {
    const nextPath = currentPath ? `${currentPath}.${key}` : key;
    if ((key === 'dismissOnBackdrop' || key === 'showCloseButton') && value === true) {
      out.push({ file, key, value, path: nextPath });
    }
    walk(value, file, nextPath, out);
  });
};

describe('staging modal behavior config', () => {
  it('does not allow dismiss-on-backdrop or close-button by default', () => {
    const files = fs
      .readdirSync(STAGING_CONFIG_DIR)
      .filter(name => name.endsWith('.json'))
      .map(name => path.join(STAGING_CONFIG_DIR, name));

    const violations: ModalViolation[] = [];
    files.forEach(filePath => {
      const raw = fs.readFileSync(filePath, 'utf8');
      const parsed = JSON.parse(raw);
      walk(parsed, path.basename(filePath), '', violations);
    });

    expect(violations).toEqual([]);
  });
});

