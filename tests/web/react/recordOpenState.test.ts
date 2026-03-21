import {
  shouldShowRecordLoadingPlaceholder,
  shouldShowSummaryLoadingCard
} from '../../../src/web/react/app/recordOpenState';

describe('recordOpenState', () => {
  it('shows the record placeholder only when loading and no current record is available', () => {
    expect(shouldShowRecordLoadingPlaceholder({ recordLoading: true, hasCurrentRecord: false })).toBe(true);
    expect(shouldShowRecordLoadingPlaceholder({ recordLoading: true, hasCurrentRecord: true })).toBe(false);
    expect(shouldShowRecordLoadingPlaceholder({ recordLoading: false, hasCurrentRecord: false })).toBe(false);
  });

  it('collapses summary loading into a single loading card', () => {
    expect(
      shouldShowSummaryLoadingCard({
        recordLoading: true,
        recordLoadError: false,
        useSummaryHtml: true,
        summaryPhase: 'idle',
        hasSummaryHtml: false
      })
    ).toBe(true);

    expect(
      shouldShowSummaryLoadingCard({
        recordLoading: false,
        recordLoadError: false,
        useSummaryHtml: true,
        summaryPhase: 'rendering',
        hasSummaryHtml: false
      })
    ).toBe(true);

    expect(
      shouldShowSummaryLoadingCard({
        recordLoading: false,
        recordLoadError: false,
        useSummaryHtml: true,
        summaryPhase: 'ready',
        hasSummaryHtml: true
      })
    ).toBe(false);
  });
});
