import { matchesWhenClause } from '../../../../rules/visibility';
import type { FieldValue } from '../../../../types';
import { parseSubgroupKey } from '../../../app/lineItems';
import { normalizeGuidedLineFieldId, parseGuidedTargetFieldEntries } from '../../steps/domain/guidedTargetFields';

type LineItemRows = Record<string, Array<{ id?: string; values?: Record<string, FieldValue> }>>;

export type GuidedErrorNavigationTarget = {
  key: string;
  stepId?: string;
};

export const normalizeGuidedRowFilterForGroup = (groupId: string, filter?: any): any => {
  if (!filter) return null;
  const includeWhen = (filter as any)?.includeWhen;
  const excludeWhen = (filter as any)?.excludeWhen;
  const next: any = { ...(filter as any) };

  const normalizeWhen = (when: any): any => {
    if (!when) return undefined;
    if (Array.isArray(when)) {
      const list = when.map(entry => normalizeWhen(entry)).filter(Boolean);
      return list.length ? list : undefined;
    }
    if (typeof when !== 'object') return when;
    const all = (when as any).all ?? (when as any).and;
    if (Array.isArray(all)) {
      const list = all.map((entry: any) => normalizeWhen(entry)).filter(Boolean);
      return list.length ? { ...(when as any), all: list } : undefined;
    }
    const anyList = (when as any).any ?? (when as any).or;
    if (Array.isArray(anyList)) {
      const list = anyList.map((entry: any) => normalizeWhen(entry)).filter(Boolean);
      return list.length ? { ...(when as any), any: list } : undefined;
    }
    if (Object.prototype.hasOwnProperty.call(when as any, 'not')) {
      const nested = normalizeWhen((when as any).not);
      return nested ? { ...(when as any), not: nested } : undefined;
    }
    if ((when as any).fieldId) {
      return { ...(when as any), fieldId: normalizeGuidedLineFieldId(groupId, (when as any).fieldId) };
    }
    return when;
  };

  if (includeWhen) next.includeWhen = normalizeWhen(includeWhen);
  if (excludeWhen) next.excludeWhen = normalizeWhen(excludeWhen);
  return next;
};

export const isGuidedRowIncludedByFilter = (rowValues: Record<string, FieldValue>, filter?: any): boolean => {
  if (!filter) return true;
  const includeWhen = (filter as any)?.includeWhen;
  const excludeWhen = (filter as any)?.excludeWhen;
  const rowCtx: any = { getValue: (fieldId: string) => (rowValues as any)[fieldId] };
  const includeOk = includeWhen ? matchesWhenClause(includeWhen as any, rowCtx) : true;
  const excludeMatch = excludeWhen ? matchesWhenClause(excludeWhen as any, rowCtx) : false;
  return includeOk && !excludeMatch;
};

export const isGuidedErrorKeyVisibleInTargets = (args: {
  targets: any[];
  defaultSubGroupDisplayMode?: string;
  key: string;
  lineItems: LineItemRows;
}): boolean => {
  const raw = (args.key || '').toString();
  if (!raw) return false;
  const parts = raw.split('__');
  const isLineKey = parts.length === 3;

  for (const target of args.targets || []) {
    if (!target || typeof target !== 'object') continue;
    const kind = (target.kind || '').toString().trim();
    const id = (target.id || '').toString().trim();
    if (!kind || !id) continue;

    if (kind === 'question') {
      if (!isLineKey && raw === id) return true;
      continue;
    }

    if (kind !== 'lineGroup') continue;
    const groupId = id;

    if (!isLineKey && raw === groupId) return true;

    if (!isLineKey) continue;
    const [prefix, fieldIdRaw, rowId] = parts;
    const subgroupInfo = parseSubgroupKey(prefix);
    if (subgroupInfo) {
      if (subgroupInfo.rootGroupId !== groupId) continue;
      const presentationRaw = ((target as any).presentation || 'groupEditor').toString().trim().toLowerCase();
      const presentation: 'groupEditor' | 'liftedRowFields' =
        presentationRaw === 'liftedrowfields' ? 'liftedRowFields' : 'groupEditor';
      const parentFieldsScoped = (target as any).fields !== undefined && (target as any).fields !== null;
      const subGroupsCfgPresent = !!(target as any).subGroups && typeof (target as any).subGroups === 'object';
      if (!subGroupsCfgPresent && (presentation === 'liftedRowFields' || parentFieldsScoped)) continue;

      const subIncludeRaw = (target.subGroups as any)?.include;
      const subIncludeList: any[] = Array.isArray(subIncludeRaw) ? subIncludeRaw : subIncludeRaw ? [subIncludeRaw] : [];
      const allowedSubIds = subIncludeList
        .map(entry => (entry?.id !== undefined && entry?.id !== null ? entry.id.toString().trim() : ''))
        .filter(Boolean);
      const allowedSubSet = allowedSubIds.length ? new Set(allowedSubIds) : null;
      if (allowedSubSet && !allowedSubSet.has(subgroupInfo.subGroupId)) continue;

      const parentRows = args.lineItems[subgroupInfo.parentGroupKey] || [];
      const parentRow = parentRows.find(row => row && row.id === subgroupInfo.parentRowId);
      const parentRowValues = (parentRow?.values || {}) as Record<string, FieldValue>;
      const normalizedRowFilter = normalizeGuidedRowFilterForGroup(
        groupId,
        (target as any).validationRows ?? (target as any).rows
      );
      if (!isGuidedRowIncludedByFilter(parentRowValues, normalizedRowFilter)) continue;

      void rowId;
      void args.defaultSubGroupDisplayMode;
      return true;
    }

    if (prefix !== groupId) continue;

    const rowValues = (args.lineItems[groupId] || []).find(row => row && row.id === rowId)?.values || {};
    const normalizedRowFilter = normalizeGuidedRowFilterForGroup(
      groupId,
      (target as any).validationRows ?? (target as any).rows
    );
    if (!isGuidedRowIncludedByFilter(rowValues as Record<string, FieldValue>, normalizedRowFilter)) continue;

    const parsedFields = parseGuidedTargetFieldEntries(groupId, (target as any).fields);
    if (parsedFields.allowed && !parsedFields.allowed.has(fieldIdRaw)) continue;
    return true;
  }

  return false;
};

export const resolveGuidedErrorNavigationTarget = (args: {
  errorKeys: string[];
  guidedEnabled: boolean;
  guidedStepsCfg: any;
  guidedStepIds: string[];
  guidedVisibleSteps: any[];
  activeGuidedStepId: string;
  maxReachableGuidedIndex: number;
  lineItems: LineItemRows;
}): GuidedErrorNavigationTarget => {
  const keys = (args.errorKeys || []).map(key => (key || '').toString()).filter(Boolean);
  const firstKey = keys[0] || '';
  if (!firstKey) return { key: '' };
  if (!args.guidedEnabled || !args.guidedStepsCfg || !args.guidedStepIds.length) return { key: firstKey };

  const headerTargets: any[] = Array.isArray(args.guidedStepsCfg.header?.include)
    ? args.guidedStepsCfg.header.include
    : [];
  const steps = args.guidedVisibleSteps || [];
  const stepCfg = (steps.find(step => (step?.id || '').toString() === args.activeGuidedStepId) || steps[0]) as any;
  const stepTargets: any[] = Array.isArray(stepCfg?.include) ? stepCfg.include : [];
  const stepSubGroupsDefaultMode = (stepCfg?.render?.subGroups?.mode || '') as 'inline' | 'overlay' | '';

  const combinedCurrentTargets = [...headerTargets, ...stepTargets];
  const inCurrent = keys.find(key =>
    isGuidedErrorKeyVisibleInTargets({
      targets: combinedCurrentTargets,
      defaultSubGroupDisplayMode: stepSubGroupsDefaultMode,
      key,
      lineItems: args.lineItems
    })
  );
  if (inCurrent) return { key: inCurrent, stepId: args.activeGuidedStepId };

  for (let index = 0; index < args.guidedStepIds.length; index++) {
    if (index > args.maxReachableGuidedIndex) break;
    const stepId = args.guidedStepIds[index];
    const cfg = (steps.find((step: any) => (step?.id || '').toString() === stepId) || null) as any;
    const stepTargetsLocal: any[] = Array.isArray(cfg?.include) ? cfg.include : [];
    const combined = [...headerTargets, ...stepTargetsLocal];
    const stepKey = keys.find(key =>
      isGuidedErrorKeyVisibleInTargets({
        targets: combined,
        defaultSubGroupDisplayMode: stepSubGroupsDefaultMode,
        key,
        lineItems: args.lineItems
      })
    );
    if (stepKey) return { key: stepKey, stepId };
  }

  return { key: firstKey };
};
