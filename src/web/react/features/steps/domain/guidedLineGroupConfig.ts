import type { LineItemGroupConfigOverride, WebQuestionDefinition } from '../../../../types';
import { applyLineItemGroupOverride } from '../../../app/lineItemTree';
import { resolveSubgroupKey } from '../../../app/lineItems';
import {
  normalizeGuidedLineFieldId,
  parseGuidedTargetFieldEntries
} from './guidedTargetFields';

export type GuidedLineGroupPresentation = 'groupEditor' | 'liftedRowFields';

export type GuidedLineGroupConfigResult = {
  presentation: GuidedLineGroupPresentation;
  groupOverride?: LineItemGroupConfigOverride;
  rowFilter: any;
  effectiveLineMode: 'inline' | 'overlay';
  hideInlineSubgroups: boolean;
  delegateTargetHelperText: boolean;
  stepLineCfg: any;
};

const resolveMode = (raw: any): 'inline' | 'overlay' | '' => {
  const value = (raw || '').toString().trim().toLowerCase();
  return value === 'inline' || value === 'overlay' ? value : '';
};

const orderFields = (groupId: string, fields: any[], order: string[]): any[] =>
  order.length
    ? order
        .map(fid => fields.find(f => normalizeGuidedLineFieldId(groupId, (f as any)?.id) === fid))
        .filter(Boolean)
        .concat(fields.filter(f => !order.includes(normalizeGuidedLineFieldId(groupId, (f as any)?.id))))
    : fields;

const applyFieldScope = (groupId: string, fields: any[], scopeRaw: any, readOnlyRaw: any): any[] => {
  const {
    allowed,
    renderAsLabel: renderAsLabelFieldIdsFromFields,
    order,
    explicit
  } = parseGuidedTargetFieldEntries(groupId, scopeRaw);
  const parsedReadOnly = parseGuidedTargetFieldEntries(groupId, readOnlyRaw);
  const readOnlyIds = parsedReadOnly.allowed ? Array.from(parsedReadOnly.allowed) : [];
  const readOnlySet = new Set<string>([...readOnlyIds, ...Array.from(renderAsLabelFieldIdsFromFields)]);
  const filteredBase = explicit
    ? fields.filter((f: any) => {
        const fid = normalizeGuidedLineFieldId(groupId, (f as any)?.id);
        return fid && !!allowed?.has(fid);
      })
    : fields;
  const filtered = readOnlySet.size
    ? filteredBase.map((f: any) => {
        const fid = normalizeGuidedLineFieldId(groupId, (f as any)?.id);
        if (fid && readOnlySet.has(fid)) {
          return { ...(f as any), readOnly: true, ui: { ...((f as any).ui || {}), renderAsLabel: true } };
        }
        return f;
      })
    : filteredBase;
  return orderFields(groupId, filtered, order);
};

export const buildGuidedLineGroupConfig = (args: {
  target: any;
  groupQ: WebQuestionDefinition;
  targetHelperText: string;
  stepLineGroupsDefaultMode: 'inline' | 'overlay' | '';
  stepSubGroupsDefaultMode: 'inline' | 'overlay' | '';
}): GuidedLineGroupConfigResult => {
  const { target, groupQ, targetHelperText, stepLineGroupsDefaultMode, stepSubGroupsDefaultMode } = args;
  const presentationRaw = (target.presentation || 'groupEditor').toString().trim().toLowerCase();
  const presentation: GuidedLineGroupPresentation = presentationRaw === 'liftedrowfields' ? 'liftedRowFields' : 'groupEditor';
  const groupOverride = (target as any).groupOverride as LineItemGroupConfigOverride | undefined;
  const baseLineCfg = (groupQ as any).lineItemConfig || {};
  const lineCfg = groupOverride ? applyLineItemGroupOverride(baseLineCfg, groupOverride) : baseLineCfg;

  const targetMode = resolveMode(target.displayMode);
  const stepMode = resolveMode(stepLineGroupsDefaultMode);
  const inheritedOverlay = !!(lineCfg as any)?.ui?.openInOverlay;
  const resolvedLineMode =
    targetMode || stepMode || (inheritedOverlay ? 'overlay' : 'inline');
  const effectiveLineMode: 'inline' | 'overlay' = presentation === 'liftedRowFields' ? 'inline' : resolvedLineMode;

  const subTargetMode = resolveMode((target.subGroups as any)?.displayMode);
  const subStepMode = resolveMode(stepSubGroupsDefaultMode);
  const resolvedSubMode = subTargetMode || subStepMode || 'inline';
  const hideInlineSubgroups = resolvedSubMode === 'overlay';

  const rowFilter = target.rows || null;
  const orderedFields = applyFieldScope(groupQ.id, lineCfg.fields || [], target.fields, (target as any).readOnlyFields);

  const subGroupsCfgPresent = !!target.subGroups && typeof target.subGroups === 'object';
  const hasStepDataSourceRows = Array.isArray((target as any).dataSourceRows) && ((target as any).dataSourceRows as any[]).length > 0;
  const delegateTargetHelperText = effectiveLineMode === 'inline' && hasStepDataSourceRows && !!targetHelperText;
  const subIncludeRaw = subGroupsCfgPresent ? (target.subGroups as any)?.include : undefined;
  const subIncludeList: any[] = Array.isArray(subIncludeRaw) ? subIncludeRaw : subIncludeRaw ? [subIncludeRaw] : [];
  const allowedSubIds = subIncludeList
    .map(s => (s?.id !== undefined && s?.id !== null ? s.id.toString().trim() : ''))
    .filter(Boolean);
  const allowedSubSet = allowedSubIds.length ? new Set(allowedSubIds) : null;

  const filteredSubGroups = (() => {
    const subs = (lineCfg.subGroups || []) as any[];
    if (!subs.length) return subs;
    if (hasStepDataSourceRows && !subGroupsCfgPresent) return [];
    if (!subGroupsCfgPresent && presentation === 'liftedRowFields') return [];
    const kept = allowedSubSet
      ? subs.filter(sub => {
          const subId = resolveSubgroupKey(sub as any);
          return subId && allowedSubSet.has(subId);
        })
      : subs;
    return kept.map(sub => {
      const subId = resolveSubgroupKey(sub as any);
      const subTarget = subIncludeList.find(s => (s?.id !== undefined && s?.id !== null ? s.id.toString().trim() : '') === subId);
      const fields = applyFieldScope(subId, (sub as any).fields || [], subTarget?.fields, subTarget?.readOnlyFields);
      return { ...(sub as any), fields };
    });
  })();

  const stepHasSourceFirstAllocations =
    hasStepDataSourceRows &&
    (((target as any).dataSourceRows as any[]) || []).some(
      (cfg: any) => ((cfg?.presentation || '').toString().trim().toLowerCase() === 'sourcefirstallocations')
    );
  const stepLineCfg: any = {
    ...(lineCfg as any),
    ...(stepHasSourceFirstAllocations ? { totals: [] } : {}),
    fields: orderedFields,
    subGroups: filteredSubGroups
  };
  if (rowFilter) {
    stepLineCfg.ui = { ...(stepLineCfg.ui || {}), addButtonPlacement: 'hidden' };
  }
  if (presentation === 'liftedRowFields') {
    stepLineCfg.ui = { ...(stepLineCfg.ui || {}), showItemPill: false };
  }
  if (target?.collapsedFieldsInHeader === true) {
    stepLineCfg.ui = { ...(stepLineCfg.ui || {}), guidedCollapsedFieldsInHeader: true };
  }

  return {
    presentation,
    groupOverride,
    rowFilter,
    effectiveLineMode,
    hideInlineSubgroups,
    delegateTargetHelperText,
    stepLineCfg
  };
};
