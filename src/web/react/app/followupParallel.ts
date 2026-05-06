import type {
  FollowupActionResult,
  InventoryReservationReconciliationRequest,
  InventoryReservationReconciliationResult,
  WebFormDefinition
} from '../../../types';

const DEFAULT_LEDGER_FORM_KEY = 'Config: Inventory Reservation Ledger';

const normalizeAction = (value: unknown): string =>
  value === undefined || value === null ? '' : value.toString().trim().toUpperCase();

const normalizeString = (value: unknown): string =>
  value === undefined || value === null ? '' : value.toString().trim();

const normalizeRefreshMode = (value: unknown): 'full' | 'revisionOnly' | 'none' =>
  value === 'revisionOnly' || value === 'none' ? value : 'full';

const REPORT_FOLLOWUP_ACTIONS = new Set(['RECONCILE_RESERVATIONS', 'CREATE_PDF', 'SEND_EMAIL']);

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

export type ParallelReconcileFollowupPlan = {
  reconcileAction: string;
  createPdfAction: string;
  sendEmailAction?: string;
  request: InventoryReservationReconciliationRequest;
};

export const resolveParallelReconcileFollowupPlan = (args: {
  definition: WebFormDefinition;
  formKey: string;
  recordId: string;
  actions: string[];
}): ParallelReconcileFollowupPlan | null => {
  const actions = (Array.isArray(args.actions) ? args.actions : [])
    .map(action => normalizeString(action))
    .filter(Boolean);
  if (actions.length < 2) return null;

  const normalized = actions.map(normalizeAction);
  const reconcileIndexes = normalized
    .map((action, index) => (action === 'RECONCILE_RESERVATIONS' ? index : -1))
    .filter(index => index >= 0);
  if (reconcileIndexes.length !== 1 || reconcileIndexes[0] !== 0) return null;
  if (normalized.includes('CLOSE_RECORD')) return null;

  const createPdfIndex = normalized.indexOf('CREATE_PDF');
  if (createPdfIndex < 1) return null;
  const sendEmailIndex = normalized.indexOf('SEND_EMAIL');
  const supported = normalized.every(action =>
    action === 'RECONCILE_RESERVATIONS' || action === 'CREATE_PDF' || action === 'SEND_EMAIL'
  );
  if (!supported) return null;
  if (normalized.filter(action => action === 'CREATE_PDF').length !== 1) return null;
  if (normalized.filter(action => action === 'SEND_EMAIL').length > 1) return null;
  if (sendEmailIndex >= 0 && sendEmailIndex < createPdfIndex) return null;

  const recordId = normalizeString(args.recordId);
  const formKey = normalizeString(args.formKey);
  if (!recordId || !formKey) return null;

  const lifecycle = args.definition?.reservationLifecycle;
  const raw = lifecycle?.reconcileOnFinalSubmit;
  const enabled = raw === true || (raw && typeof raw === 'object' && raw.enabled !== false);
  if (!enabled) return null;

  const rawObject = raw && typeof raw === 'object' ? raw : null;
  const ledgerFormKey =
    normalizeString(rawObject?.ledgerFormKey) ||
    normalizeString(lifecycle?.ledgerFormKey) ||
    DEFAULT_LEDGER_FORM_KEY;

  return {
    reconcileAction: actions[reconcileIndexes[0]],
    createPdfAction: actions[createPdfIndex],
    sendEmailAction: sendEmailIndex >= 0 ? actions[sendEmailIndex] : undefined,
    request: {
      sourceFormKey: formKey,
      sourceRecordId: recordId,
      ledgerFormKey,
      mode: 'consume',
      refreshMode: normalizeRefreshMode(rawObject?.refreshMode)
    }
  };
};

export const buildReconcileFollowupActionResult = (args: {
  recordId: string;
  result: InventoryReservationReconciliationResult;
  durationMs: number;
}): FollowupActionResult => {
  const success = Boolean(args.result?.success);
  return {
    success,
    message: success ? undefined : (args.result?.message || 'Failed to reconcile active reservations.').toString(),
    durationMs: Math.max(0, Math.round(Number(args.durationMs) || 0)),
    reservationReconciliation: {
      success,
      sourceRecordId: normalizeString(args.recordId) || undefined,
      reconciledReservations: Number(args.result?.reconciledReservations || 0) || 0,
      consumedReservations: Number(args.result?.consumedReservations || 0) || 0,
      releasedReservations: Number(args.result?.releasedReservations || 0) || 0,
      touchedInventoryRecords: Number(args.result?.touchedInventoryRecords || 0) || 0
    }
  };
};
