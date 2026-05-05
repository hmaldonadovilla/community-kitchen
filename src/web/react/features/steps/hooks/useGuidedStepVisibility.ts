import { useCallback, useEffect, useMemo, useState } from 'react';

import type { FieldValue, LineItemRowState, WebFormDefinition } from '../../../../types';
import type { LineItemState } from '../../../types';
import { getSystemFieldValue, type SystemRecordMeta } from '../../../../rules/systemFields';
import {
  DATA_SOURCE_CACHE_CLEARED_EVENT,
  DATA_SOURCE_CACHE_UPDATED_EVENT,
  getCachedDataSourceItemCount
} from '../../../../data/dataSources';
import { collectDataSourceConfigsForPrefetch } from '../../../../data/dataSourcePrefetch';
import {
  DATA_SOURCE_COUNT_FIELD_PREFIX,
  normalizeDataSourceVisibilityKey
} from '../../../app/dataSourceVisibility';
import { filterVisibleGuidedSteps } from '../domain/stepVisibility';

export type GuidedDataSourceConfigMap = {
  byExact: Map<string, any>;
  byNormalized: Map<string, any>;
};

export const resolveDataSourceCountVisibilityValue = (
  fieldId: string,
  configMap: GuidedDataSourceConfigMap,
  language: string
): FieldValue | undefined => {
  if (!fieldId.startsWith(DATA_SOURCE_COUNT_FIELD_PREFIX)) return undefined;
  const key = fieldId.slice(DATA_SOURCE_COUNT_FIELD_PREFIX.length).trim();
  const config = configMap.byExact.get(key) || configMap.byNormalized.get(normalizeDataSourceVisibilityKey(key));
  if (!config) return undefined;
  const count = getCachedDataSourceItemCount(config, language as any);
  return count === null ? undefined : (count as FieldValue);
};

export const useGuidedStepVisibility = (args: {
  definition: WebFormDefinition;
  guidedEnabled: boolean;
  guidedStepsCfg: any;
  language: string;
  values: Record<string, FieldValue>;
  lineItems: LineItemState;
  recordMeta?: SystemRecordMeta;
}) => {
  const { definition, guidedEnabled, guidedStepsCfg, language, values, lineItems, recordMeta } = args;
  const [dataSourceVisibilityVersion, setDataSourceVisibilityVersion] = useState(0);
  const guidedDataSourceConfigs = useMemo(() => collectDataSourceConfigsForPrefetch(definition), [definition]);
  const guidedDataSourceConfigMap = useMemo((): GuidedDataSourceConfigMap => {
    const byExact = new Map<string, any>();
    const byNormalized = new Map<string, any>();
    guidedDataSourceConfigs.forEach(cfg => {
      const id = (cfg?.id || '').toString().trim();
      if (!id) return;
      if (!byExact.has(id)) byExact.set(id, cfg);
      const normalized = normalizeDataSourceVisibilityKey(id);
      if (normalized && !byNormalized.has(normalized)) byNormalized.set(normalized, cfg);
    });
    return { byExact, byNormalized };
  }, [guidedDataSourceConfigs]);

  useEffect(() => {
    const bump = () => setDataSourceVisibilityVersion(version => version + 1);
    try {
      if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
      window.addEventListener(DATA_SOURCE_CACHE_UPDATED_EVENT, bump as EventListener);
      window.addEventListener(DATA_SOURCE_CACHE_CLEARED_EVENT, bump as EventListener);
      return () => {
        window.removeEventListener(DATA_SOURCE_CACHE_UPDATED_EVENT, bump as EventListener);
        window.removeEventListener(DATA_SOURCE_CACHE_CLEARED_EVENT, bump as EventListener);
      };
    } catch {
      return;
    }
  }, []);

  const resolveDataSourceCountValue = useCallback(
    (fieldId: string): FieldValue | undefined =>
      resolveDataSourceCountVisibilityValue(fieldId, guidedDataSourceConfigMap, language),
    [guidedDataSourceConfigMap, language]
  );

  const resolveStepVisibilityValue = useCallback(
    (fieldId: string): FieldValue | undefined => {
      const dataSourceCount = resolveDataSourceCountValue(fieldId);
      if (dataSourceCount !== undefined) return dataSourceCount;
      const direct = values[fieldId];
      if (direct !== undefined && direct !== null && direct !== '') return direct as FieldValue;
      const sys = getSystemFieldValue(fieldId, recordMeta);
      if (sys !== undefined) return sys as FieldValue;
      for (const rows of Object.values(lineItems)) {
        if (!Array.isArray(rows)) continue;
        for (const row of rows) {
          const candidate = (row as LineItemRowState).values[fieldId];
          if (candidate !== undefined && candidate !== null && candidate !== '') return candidate as FieldValue;
        }
      }
      return undefined;
    },
    [lineItems, recordMeta, resolveDataSourceCountValue, values]
  );

  const guidedStepVisibilityCtx = useMemo(
    () => ({
      getValue: (fieldId: string) => resolveStepVisibilityValue(fieldId),
      getLineItems: (groupId: string) => lineItems[groupId] || [],
      getLineItemKeys: () => Object.keys(lineItems)
    }),
    [lineItems, resolveStepVisibilityValue]
  );

  const guidedVisibleSteps = useMemo(() => {
    void dataSourceVisibilityVersion;
    return guidedEnabled ? filterVisibleGuidedSteps((guidedStepsCfg?.items || []) as any[], guidedStepVisibilityCtx) : [];
  }, [dataSourceVisibilityVersion, guidedEnabled, guidedStepVisibilityCtx, guidedStepsCfg]);

  return {
    guidedDataSourceConfigMap,
    guidedStepVisibilityCtx,
    guidedVisibleSteps,
    resolveDataSourceCountValue
  };
};
