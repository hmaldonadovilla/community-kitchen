export type FormStatusTone = 'info' | 'success' | 'error' | null | undefined;

const SAVE_FAILURE_MESSAGES = [
  'could not save the latest changes',
  'failed to save the current record',
  'autosave failed',
  'record save lock',
  'record mutation queue',
  'could not queue record mutation',
  'could not add photos',
  'upload failed',
  'upload folder not accessible',
  'drive createfile failed',
  'drive api not available'
];

const normalizeStatusText = (value: unknown): string =>
  (value === undefined || value === null ? '' : value.toString())
    .trim()
    .toLowerCase();

export const shouldClearStatusAfterSuccessfulSave = (args: {
  status?: string | null;
  statusTone?: FormStatusTone;
}): boolean => {
  if (args.statusTone !== 'error') return false;
  const text = normalizeStatusText(args.status);
  if (!text) return false;
  return SAVE_FAILURE_MESSAGES.some(message => text.includes(message));
};
