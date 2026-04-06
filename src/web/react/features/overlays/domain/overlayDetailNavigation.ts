export const shouldAutoOpenSubgroupForPendingAnchor = (args: {
  targetParentGroupKey?: string | null;
  lineItemOverlayOpen: boolean;
  lineItemOverlayGroupId?: string | null;
  subgroupOverlayOpen?: boolean;
  subgroupOverlaySubKey?: string | null;
}): boolean => {
  const targetParentGroupKey = (args.targetParentGroupKey || '').toString().trim();
  const lineItemOverlayGroupId = (args.lineItemOverlayGroupId || '').toString().trim();
  const subgroupOverlaySubKey = (args.subgroupOverlaySubKey || '').toString().trim();
  if (!targetParentGroupKey) return true;
  if (targetParentGroupKey === lineItemOverlayGroupId) return false;
  if (args.subgroupOverlayOpen && targetParentGroupKey === subgroupOverlaySubKey) return false;
  return true;
};
