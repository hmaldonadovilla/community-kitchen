import fs from 'node:fs';
import path from 'node:path';

const rootDir = path.resolve(__dirname, '..', '..');
const initialEnvKeys = new Set(Object.keys(process.env));

let didLoadEnv = false;

function parseEnvContent(content: string): Record<string, string> {
  if (!content) {
    return {};
  }

  const out: Record<string, string> = {};

  content
    .split(/\r?\n/)
    .map(line => line.trim())
    .forEach(line => {
      if (!line || line.startsWith('#')) {
        return;
      }

      const separatorIndex = line.indexOf('=');
      if (separatorIndex < 0) {
        return;
      }

      const key = line.slice(0, separatorIndex).trim();
      if (!key) {
        return;
      }

      let value = line.slice(separatorIndex + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      out[key] = value;
    });

  return out;
}

function applyEnvFile(filePath: string, allowOverride = false): void {
  if (!filePath || !fs.existsSync(filePath)) {
    return;
  }

  const parsed = parseEnvContent(fs.readFileSync(filePath, 'utf8'));

  Object.entries(parsed).forEach(([key, value]) => {
    if (initialEnvKeys.has(key)) {
      return;
    }

    if (!allowOverride && process.env[key] !== undefined) {
      return;
    }

    process.env[key] = value;
  });
}

function normalizeEnvName(value: string | undefined): string {
  const normalized = (value || '').trim().toLowerCase();

  if (!normalized) {
    return '';
  }

  if (normalized === 'production') {
    return 'prod';
  }

  return normalized;
}

export function resolveE2eEnvName(): string {
  return normalizeEnvName(process.env.E2E_ENV || process.env.CK_CONFIG_ENV || process.env.CK_ENV || process.env.DEPLOY_ENV);
}

export function loadE2eEnv(): void {
  if (didLoadEnv) {
    return;
  }

  applyEnvFile(path.join(rootDir, '.env'));

  const envName = resolveE2eEnvName();
  if (envName) {
    applyEnvFile(path.join(rootDir, `.env.${envName}`), true);
  }

  didLoadEnv = true;
}

export function readBooleanEnv(name: string): boolean {
  return ['1', 'true', 'yes', 'on'].includes((process.env[name] || '').trim().toLowerCase());
}

export function readListEnv(name: string): string[] {
  const raw = (process.env[name] || '').trim();

  if (!raw) {
    return [];
  }

  return raw
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
}
