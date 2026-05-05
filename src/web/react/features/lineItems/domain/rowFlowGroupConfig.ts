import type { WebQuestionDefinition } from '../../../../types';
import { parseSubgroupKey, resolveSubgroupKey } from '../../../app/lineItems';

export type RowFlowGroupConfigResolution = {
  groupId: string;
  config: any;
};

export const resolveRowFlowGroupConfigAction = (args: {
  groupKey: string;
  currentGroupId: string;
  currentLineItemConfig?: any;
  definitionQuestions: WebQuestionDefinition[];
}): RowFlowGroupConfigResolution | null => {
  const groupKey = (args.groupKey || '').toString().trim();
  if (!groupKey) return null;

  const currentGroupId = (args.currentGroupId || '').toString().trim();
  const baseParsed = parseSubgroupKey(currentGroupId);
  const baseRootId = baseParsed?.rootGroupId || currentGroupId;
  if (groupKey === currentGroupId && args.currentLineItemConfig) {
    return { groupId: currentGroupId, config: args.currentLineItemConfig };
  }

  const rootQuestion = (args.definitionQuestions || []).find(question => question.id === baseRootId);
  const rootConfig =
    baseRootId === currentGroupId && args.currentLineItemConfig
      ? args.currentLineItemConfig
      : rootQuestion?.lineItemConfig;
  const fallbackRootConfig = rootQuestion?.lineItemConfig;
  if (!rootConfig && !fallbackRootConfig) return null;

  const resolveFromConfig = (config: any, path: string[]): any | null => {
    if (!config) return null;
    if (!path.length) return config;
    let current: any = config;
    for (let index = 0; index < path.length; index += 1) {
      const subId = path[index];
      const next = (current?.subGroups || []).find((sub: any) => resolveSubgroupKey(sub as any) === subId);
      if (!next) return null;
      current = next;
    }
    return current;
  };

  const resolveFromRoot = (path: string[]): any | null =>
    resolveFromConfig(rootConfig, path) || resolveFromConfig(fallbackRootConfig, path);

  if (groupKey === baseRootId) {
    return { groupId: baseRootId, config: rootConfig || fallbackRootConfig };
  }

  const parsed = parseSubgroupKey(groupKey);
  if (parsed && parsed.rootGroupId === baseRootId) {
    const config = resolveFromRoot(parsed.path);
    return config ? { groupId: groupKey, config } : null;
  }

  if (groupKey === currentGroupId && baseParsed?.path?.length) {
    const config = resolveFromRoot(baseParsed.path);
    return config ? { groupId: currentGroupId, config } : null;
  }

  if (groupKey === currentGroupId && !baseParsed) {
    return { groupId: currentGroupId, config: rootConfig };
  }

  return null;
};
