import { hasIncompleteRejectDedupKeys } from './dedupKeyUtils';

export const shouldDeferCopiedDraftCreation = (args: {
  dedupRules?: any;
  values?: Record<string, any> | null;
  existingRecordId?: string | null;
}): boolean => {
  const existingRecordId = (args.existingRecordId || '').toString().trim();
  if (existingRecordId) return false;
  return hasIncompleteRejectDedupKeys(args.dedupRules, args.values || {});
};
