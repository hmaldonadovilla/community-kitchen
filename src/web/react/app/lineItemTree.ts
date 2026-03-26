import { LineItemGroupConfigOverride } from '../../types';
import { LineItemState } from '../types';
import { ROW_ID_KEY, buildSubgroupKey, resolveSubgroupKey, shouldPersistLineItemRows } from './lineItems';

const mergeOverlayDetailConfig = (base: any, override: any) => {
  if (!base && !override) return undefined;
  if (!base) return override;
  if (!override) return base;
  return {
    ...base,
    ...override,
    header: { ...(base.header || {}), ...(override.header || {}) },
    body: {
      ...(base.body || {}),
      ...(override.body || {}),
      edit: { ...(base.body?.edit || {}), ...(override.body?.edit || {}) },
      view: { ...(base.body?.view || {}), ...(override.body?.view || {}) }
    },
    rowActions: { ...(base.rowActions || {}), ...(override.rowActions || {}) }
  };
};

export const applyLineItemGroupOverride = (baseConfig: any, override?: LineItemGroupConfigOverride) => {
  if (!baseConfig || !override || typeof override !== 'object') return baseConfig;
  const mergedConfig = { ...baseConfig, ...override } as any;
  mergedConfig.fields = Array.isArray(override.fields) && override.fields.length ? override.fields : baseConfig.fields;
  if (override.subGroups !== undefined) mergedConfig.subGroups = override.subGroups;
  const baseUi = baseConfig.ui || {};
  const overrideUi = (override as any).ui || {};
  const mergedUi = {
    ...baseUi,
    ...overrideUi
  };
  const mergedOverlayDetail = mergeOverlayDetailConfig(baseUi?.overlayDetail, overrideUi?.overlayDetail);
  if (mergedOverlayDetail) {
    (mergedUi as any).overlayDetail = mergedOverlayDetail;
  }
  mergedConfig.ui = Object.keys(mergedUi).length ? mergedUi : undefined;
  const baseAddOverlay = (baseConfig as any)?.addOverlay || {};
  const overrideAddOverlay = (override as any)?.addOverlay || {};
  if (Object.keys(baseAddOverlay).length || Object.keys(overrideAddOverlay).length) {
    (mergedConfig as any).addOverlay = { ...baseAddOverlay, ...overrideAddOverlay };
  }
  return mergedConfig;
};

export const serializeLineItemTree = (args: {
  lineItems: LineItemState;
  groupCfg: any;
  groupKey: string;
  rowFilters?: Record<string, string>;
  groupOverridesByKey?: Record<string, LineItemGroupConfigOverride | undefined>;
}): Record<string, any>[] => {
  const { lineItems, groupCfg, groupKey, rowFilters, groupOverridesByKey } = args;
  if (!shouldPersistLineItemRows(groupCfg)) return [];
  const rowsAll = lineItems[groupKey] || [];
  const filterRowId = (rowFilters?.[groupKey] || '').toString().trim();
  const rows = filterRowId ? rowsAll.filter(row => row.id === filterRowId) : rowsAll;
  const effectiveGroupCfg = applyLineItemGroupOverride(groupCfg, groupOverridesByKey?.[groupKey]);
  const subGroups = (effectiveGroupCfg?.subGroups || []) as any[];

  return rows.map(row => {
    const base: Record<string, any> = {
      ...((row as any)?.values || {}),
      [ROW_ID_KEY]: row.id
    };
    subGroups.forEach(sub => {
      const subId = resolveSubgroupKey(sub as any);
      if (!subId) return;
      if (!shouldPersistLineItemRows(sub)) return;
      const childKey = buildSubgroupKey(groupKey, row.id, subId);
      base[subId] = serializeLineItemTree({
        lineItems,
        groupCfg: sub,
        groupKey: childKey,
        rowFilters,
        groupOverridesByKey
      });
    });
    return base;
  });
};
