export type ReportPreviewAction =
  | 'renderDocTemplate'
  | 'renderMarkdownTemplate'
  | 'renderHtmlTemplate'
  | '';

export type ReportPreviewOverlaySnapshot = {
  open?: boolean;
  kind?: string | null;
  pdfPhase?: string | null;
  buttonId?: string | null;
};

export function shouldArmAutoSaveHoldForReportAction(actionRaw: string): boolean {
  const action = (actionRaw || '').toString().trim();
  return action === 'renderMarkdownTemplate' || action === 'renderHtmlTemplate';
}

export function shouldHoldAutoSaveForReportOverlay(
  state: ReportPreviewOverlaySnapshot | null | undefined
): boolean {
  if (!state) return false;
  const kind = (state.kind || '').toString().trim();
  if (kind !== 'markdown' && kind !== 'html') return false;
  if (!((state.buttonId || '').toString().trim())) return false;
  return state.open === true || (state.pdfPhase || '').toString().trim() === 'rendering';
}
