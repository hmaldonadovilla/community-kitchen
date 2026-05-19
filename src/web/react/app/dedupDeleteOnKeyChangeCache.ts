import type { WebFormDefinition } from '../../types';
import { invalidateClientSharedDataCaches } from '../api';
import { clearDateSearchLocalCacheFamily } from './dateSearchLocalCache';
import { clearHomeListLocalCache } from './homeListLocalCache';

type DiagnosticLogger = (event: string, payload?: Record<string, unknown>) => void;

export const clearCachesAfterDedupDeleteOnKeyChange = (args: {
  definition: WebFormDefinition;
  formKey: string;
  homeListLocalCacheKey: string;
  recordId: string;
  logEvent: DiagnosticLogger;
}): void => {
  try {
    invalidateClientSharedDataCaches({
      includePersistedDataSources: false,
      includeHtmlRenderCache: true
    });
    clearHomeListLocalCache(args.homeListLocalCacheKey);
    clearDateSearchLocalCacheFamily({ formKey: args.formKey, listView: args.definition.listView });
    args.logEvent('cache.client.clear', {
      scope: 'dedupDeleteOnKeyChange',
      recordId: args.recordId,
      dataSourcesCleared: 'memory',
      persistedDataSourcesCleared: false,
      htmlRenderCacheCleared: true,
      optionsCleared: false
    });
  } catch (cacheErr: any) {
    args.logEvent('cache.client.clear.error', {
      scope: 'dedupDeleteOnKeyChange',
      recordId: args.recordId,
      message: cacheErr?.message || cacheErr?.toString?.() || 'unknown'
    });
  }
};
