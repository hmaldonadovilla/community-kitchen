export type RecordOpenView = 'form' | 'summary' | 'list';

export const shouldShowRecordLoadingPlaceholder = (args: {
  recordLoading: boolean;
  hasCurrentRecord: boolean;
  recordLoadError?: boolean;
}): boolean => Boolean(args.recordLoading || args.recordLoadError) && !args.hasCurrentRecord;

export const shouldShowSummaryLoadingCard = (args: {
  recordLoading: boolean;
  recordLoadError: boolean;
  useSummaryHtml: boolean;
  summaryPhase: 'idle' | 'rendering' | 'ready' | 'error';
  hasSummaryHtml: boolean;
}): boolean => {
  if (args.recordLoadError) return false;
  if (args.recordLoading) return true;
  return Boolean(args.useSummaryHtml) && args.summaryPhase === 'rendering' && !args.hasSummaryHtml;
};
