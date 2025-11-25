import { DataSourceConfig, WebQuestionDefinition } from '../../types';
import { LangCode } from '../types';

declare const google: {
  script?: {
    run?: {
      withSuccessHandler: (cb: (res: any) => void) => any;
      withFailureHandler: (cb: (err: any) => void) => any;
      fetchDataSource?: (id: string, language: LangCode) => void;
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
        .fetchDataSource?.(config.id, language);
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
  if (Array.isArray(res)) return res;
  return null;
}
