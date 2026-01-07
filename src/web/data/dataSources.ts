import { DataSourceConfig } from '../../types';
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
const RUNNER_RETRY_DELAY = 150;
const RUNNER_MAX_ATTEMPTS = 20;

function key(id: string, lang: LangCode): string {
  return `${id || 'default'}::${(lang || 'EN').toString().toUpperCase()}`;
}

function emitLog(
  level: 'info' | 'warn' | 'error',
  message: string,
  payload?: Record<string, any>
): void {
  const localConsole = typeof console !== 'undefined' ? console : undefined;
  localConsole?.[level]?.(message, payload);
  try {
    if (typeof window !== 'undefined' && window.parent && window.parent !== window) {
      const parentConsole = (window.parent as any).console as Console | undefined;
      parentConsole?.[level]?.(message, payload);
    }
  } catch (_) {
    // ignore cross-origin errors
  }
}

interface DataSourceTarget {
  id: string;
  type: string;
  dataSource?: DataSourceConfig;
}

function isChoiceOrCheckbox(type: string): boolean {
  const normalized = (type || '').toString().toUpperCase();
  return normalized === 'CHOICE' || normalized === 'CHECKBOX';
}

export async function fetchDataSource(
  config: DataSourceConfig,
  language: LangCode
): Promise<any> {
  const cacheKey = key(config.id, language);
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  return new Promise((resolve) => {
    let attempts = 0;

    const attempt = () => {
      const scriptRun = google?.script?.run;
      if (!scriptRun) {
        attempts += 1;
        if (attempts === 1) {
          emitLog('info', '[DataSource] google.script.run not ready, retrying', { id: config.id });
        }
        if (attempts > RUNNER_MAX_ATTEMPTS) {
          emitLog('error', '[DataSource] google.script.run never became ready', { id: config.id });
          resolve(null);
          return;
        }
        setTimeout(attempt, RUNNER_RETRY_DELAY);
        return;
      }

      try {
        scriptRun
          .withSuccessHandler((res: any) => {
            emitLog('info', '[DataSource] fetchDataSource success', {
              id: config.id,
              itemCount: Array.isArray(res?.items) ? res.items.length : Array.isArray(res) ? res.length : 0
            });
            cache.set(cacheKey, res);
            resolve(res);
          })
          .withFailureHandler((err: any) => {
            emitLog('error', '[DataSource] fetchDataSource failed', { id: config.id, err });
            resolve(null);
          })
          .fetchDataSource?.(config, language, config.projection, config.limit, undefined);
      } catch (_) {
        emitLog('error', '[DataSource] fetchDataSource threw synchronously', { id: config.id });
        resolve(null);
      }
    };

    attempt();
  });
}

/**
 * Clear the in-memory client cache for fetchDataSource().
 *
 * This cache is intentionally session-only (no localStorage) so a page refresh always resets it.
 * We also expose this so the app "Refresh" action can avoid stale option/projection lookups
 * without requiring a full browser reload.
 */
export function clearFetchDataSourceCache(): void {
  cache.clear();
}

export async function resolveQuestionOptionsFromSource(
  question: DataSourceTarget,
  language: LangCode
): Promise<string[] | null> {
  if (!question.dataSource || !isChoiceOrCheckbox(question.type)) {
    return null;
  }
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
