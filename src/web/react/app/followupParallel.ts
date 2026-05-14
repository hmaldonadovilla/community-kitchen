const normalizeAction = (value: unknown): string =>
  value === undefined || value === null ? '' : value.toString().trim().toUpperCase();

const REPORT_FOLLOWUP_ACTIONS = new Set(['CREATE_PDF', 'SEND_EMAIL']);

export const isReportFollowupAction = (action: unknown): boolean =>
  REPORT_FOLLOWUP_ACTIONS.has(normalizeAction(action));

export const areReportFollowupActions = (actions: unknown[]): boolean => {
  const normalized = (Array.isArray(actions) ? actions : []).map(normalizeAction).filter(Boolean);
  return normalized.length > 0 && normalized.every(action => REPORT_FOLLOWUP_ACTIONS.has(action));
};

export const resolveOptimisticStatusTransitionForActions = (
  actions: unknown[]
): 'onClose' | 'onPdf' | 'onEmail' | '' => {
  const normalized = (Array.isArray(actions) ? actions : []).map(normalizeAction).filter(Boolean);
  if (!normalized.length) return '';
  if (normalized.includes('CLOSE_RECORD')) return 'onClose';
  if (normalized.includes('CREATE_PDF')) return 'onPdf';
  if (normalized.includes('SEND_EMAIL')) return 'onEmail';
  return '';
};
