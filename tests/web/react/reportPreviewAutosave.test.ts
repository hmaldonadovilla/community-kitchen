import {
  shouldArmAutoSaveHoldForReportAction,
  shouldHoldAutoSaveForReportOverlay
} from '../../../src/web/react/app/reportPreviewAutosave';

describe('reportPreviewAutosave', () => {
  it('arms autosave hold only for in-app preview actions', () => {
    expect(shouldArmAutoSaveHoldForReportAction('renderHtmlTemplate')).toBe(true);
    expect(shouldArmAutoSaveHoldForReportAction('renderMarkdownTemplate')).toBe(true);
    expect(shouldArmAutoSaveHoldForReportAction('renderDocTemplate')).toBe(false);
    expect(shouldArmAutoSaveHoldForReportAction('updateRecord')).toBe(false);
  });

  it('keeps autosave held while a markdown or html preview is rendering or open', () => {
    expect(
      shouldHoldAutoSaveForReportOverlay({
        kind: 'html',
        buttonId: 'ING_PREVIEW',
        open: true,
        pdfPhase: 'ready'
      })
    ).toBe(true);

    expect(
      shouldHoldAutoSaveForReportOverlay({
        kind: 'markdown',
        buttonId: 'FINAL_REPORT',
        open: false,
        pdfPhase: 'rendering'
      })
    ).toBe(true);
  });

  it('does not hold autosave for pdf previews or closed overlays', () => {
    expect(
      shouldHoldAutoSaveForReportOverlay({
        kind: 'pdf',
        buttonId: 'FINAL_REPORT',
        open: false,
        pdfPhase: 'rendering'
      })
    ).toBe(false);

    expect(
      shouldHoldAutoSaveForReportOverlay({
        kind: 'html',
        buttonId: 'ING_PREVIEW',
        open: false,
        pdfPhase: 'idle'
      })
    ).toBe(false);
  });
});
