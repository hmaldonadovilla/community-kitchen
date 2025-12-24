import { resolveLocalizedString } from './i18n';
import type { LangCode, LocalizedString } from './types';
import systemStrings from './systemStrings.json';

type Vars = Record<string, string | number | boolean | null | undefined>;

const getByPath = (root: any, path: string): any => {
  if (!root || typeof root !== 'object') return undefined;
  const parts = (path || '').split('.').map(p => p.trim()).filter(Boolean);
  if (!parts.length) return undefined;
  return parts.reduce((acc: any, key: string) => {
    if (!acc || typeof acc !== 'object') return undefined;
    return acc[key];
  }, root);
};

const formatTemplate = (value: string, vars?: Vars): string => {
  if (!vars) return value;
  return value.replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, key) => {
    const raw = vars[key];
    return raw === undefined || raw === null ? '' : String(raw);
  });
};

export function tSystem(key: string, language: LangCode, fallback?: string, vars?: Vars): string {
  const raw = getByPath(systemStrings as any, key) as LocalizedString | undefined;
  const resolved = resolveLocalizedString(raw, language, fallback || '');
  return formatTemplate(resolved || fallback || '', vars);
}


