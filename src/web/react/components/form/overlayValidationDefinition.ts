import type { WebFormDefinition, WebQuestionDefinition } from '../../../types';
import { applyLineItemGroupOverride } from '../../app/lineItemTree';
import { parseSubgroupKey, resolveSubgroupKey } from '../../app/lineItems';

/**
 * Owner: FormView overlay-scoped validation definitions.
 * Builds temporary single-question definitions used when validating fields
 * inside line-item and subgroup overlays.
 */
export const buildLineItemGroupOverlayValidationDefinitionAction = (args: {
  definition: WebFormDefinition;
  overlay: {
    open?: boolean;
    groupId?: string;
    group?: WebQuestionDefinition | null;
    rowFilter?: any;
  };
}): WebFormDefinition | null => {
  const { definition, overlay } = args;
  if (!overlay.open || !overlay.groupId) return null;
  const overrideGroup = overlay.group;
  const baseGroup =
    overrideGroup && overrideGroup.type === 'LINE_ITEM_GROUP'
      ? overrideGroup
      : definition.questions.find(q => q.id === overlay.groupId && q.type === 'LINE_ITEM_GROUP');
  if (!baseGroup) return null;
  const baseConfig = (baseGroup as any).lineItemConfig;
  if (!baseConfig) return null;
  const rowFilter = overlay.rowFilter || null;
  const nextConfig = rowFilter ? { ...baseConfig, _guidedRowFilter: rowFilter } : baseConfig;
  const validationGroup =
    nextConfig === baseConfig ? baseGroup : ({ ...(baseGroup as any), lineItemConfig: nextConfig } as WebQuestionDefinition);
  return { ...(definition as any), questions: [validationGroup] } as WebFormDefinition;
};

export const buildSubgroupOverlayValidationDefinitionAction = (args: {
  definition: WebFormDefinition;
  overlay: {
    open?: boolean;
    subKey?: string;
    rowFilter?: any;
    groupOverride?: any;
  };
}): WebFormDefinition | null => {
  const { definition, overlay } = args;
  if (!overlay.open || !overlay.subKey) return null;
  const subKey = overlay.subKey;
  const info = parseSubgroupKey(subKey);
  if (!info) return null;
  const parentGroup = definition.questions.find(q => q.id === info.rootGroupId && q.type === 'LINE_ITEM_GROUP');
  if (!parentGroup) return null;
  let current: any = parentGroup;
  let subConfigBase: any = null;
  for (let i = 0; i < info.path.length; i += 1) {
    const subId = info.path[i];
    const subs = (current?.lineItemConfig?.subGroups || current?.subGroups || []) as any[];
    const match = subs.find(s => resolveSubgroupKey(s) === subId);
    if (!match) break;
    if (i === info.path.length - 1) {
      subConfigBase = match;
      break;
    }
    current = match;
  }
  if (!parentGroup || !subConfigBase) return null;
  const overlayRowFilter = overlay.rowFilter || null;
  const subConfig = overlay.groupOverride
    ? applyLineItemGroupOverride(subConfigBase, overlay.groupOverride)
    : subConfigBase;
  const nextConfig = overlayRowFilter ? { ...subConfig, _guidedRowFilter: overlayRowFilter } : subConfig;
  const validationGroup: WebQuestionDefinition = {
    ...(parentGroup as any),
    id: subKey,
    lineItemConfig: { ...(nextConfig as any), fields: nextConfig.fields || [], subGroups: nextConfig.subGroups || [] }
  };
  return { ...(definition as any), questions: [validationGroup] } as WebFormDefinition;
};
