import { DataSourceConfig, WebQuestionDefinition } from '../../types';
import { LangCode } from '../types';

declare const google: {
  script?: {
    run?: {
      withSuccessHandler: (cb: (res: any) => void) => any;
      withFailureHandler: (cb: (err: any) => void) => any;
      fetchDataSource?: (config: any, locale?: LangCode, projection?: string[], limit?: number, pageToken?: string) => void;
    };
  };
} | undefined;

type CacheKey = string;
const cache: Map<CacheKey, any> = new Map();

function key(id: string, lang: LangCode): string {
  return `${id || 'default'}::${(lang || 'EN').toString().toUpperCase()}`;
}

export async function fetchDataSource(
  config: DataSourceConfig,
  language: LangCode
): Promise<any> {
  const cacheKey = key(config.id, language);
  if (cache.has(cacheKey)) return cache.get(cacheKey);
  const scriptRun = google?.script?.run;
  if (!scriptRun) {
    return null;
  }
  return new Promise((resolve) => {
    try {
      scriptRun
        .withSuccessHandler((res: any) => {
          cache.set(cacheKey, res);
          resolve(res);
        })
        .withFailureHandler(() => resolve(null))
        .fetchDataSource?.(config, language, config.projection, config.limit, undefined);
    } catch (_) {
      resolve(null);
    }
  });
}

export async function resolveQuestionOptionsFromSource(
  question: WebQuestionDefinition,
  language: LangCode
): Promise<string[] | null> {
  if (!question.dataSource || question.type !== 'CHOICE') return null;
  const res = await fetchDataSource(question.dataSource, language);
  if (!res) return null;
  const items = Array.isArray((res as any).items) ? (res as any).items : Array.isArray(res) ? res : [];
  if (!items.length) return null;

  const mapping = (question.dataSource as any).mapping || {};
  const valueKey = mapping.value || mapping.id;

  if (typeof items[0] === 'object' && !Array.isArray(items[0])) {
    const keys = Object.keys(items[0]);
    if (!keys.length) return null;
    const resolvedKey = valueKey || keys[0];
    return items
      .map((row: any) => row[resolvedKey])
      .filter(Boolean)
      .map((v: any) => v.toString());
  }

  return (items as any[]).map(v => v != null ? v.toString() : '').filter(Boolean);
}
