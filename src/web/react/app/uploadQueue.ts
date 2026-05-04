/**
 * Owns pure upload queue coordination decisions for App.tsx.
 *
 * Keep this boundary free of React state and upload transport calls. The React
 * component owns queue mutation; this module derives queue keys, blocking
 * counts, busy messages, and post-drain autosave decisions.
 */

export type UploadQueueBusyState = {
  uploadsInFlight: number;
  blockingUploadsInFlight: number;
  busyMessage: string;
};

export const buildUploadQueueKey = (args: { sessionId: number | string; fieldPath?: string | null }): string => {
  const sessionId = Number.isFinite(Number(args.sessionId)) ? Number(args.sessionId) : 0;
  const fieldPath = (args.fieldPath || '').toString();
  return `record:${sessionId}:${fieldPath}`;
};

export const resolveUploadQueueBusyState = (args: {
  uploadQueueSize?: number | null;
  blockingByKey?: ReadonlyMap<string, boolean> | null;
  busyMessageByKey?: ReadonlyMap<string, string> | null;
  defaultBusyMessage: string;
}): UploadQueueBusyState => {
  const uploadsInFlight = Number.isFinite(Number(args.uploadQueueSize))
    ? Math.max(0, Number(args.uploadQueueSize))
    : 0;
  const blockingEntries = Array.from(args.blockingByKey?.entries?.() || []).filter(([, blocking]) => Boolean(blocking));
  const busyMessage =
    blockingEntries
      .map(([key]) => (args.busyMessageByKey?.get(key) || '').toString().trim())
      .find(Boolean) || args.defaultBusyMessage;

  return {
    uploadsInFlight,
    blockingUploadsInFlight: blockingEntries.length,
    busyMessage
  };
};

export const shouldAutosaveAfterUploadQueueDrained = (args: {
  uploadQueueSize?: number | null;
  autoSaveQueued: boolean;
  autoSaveDirty: boolean;
  submitting: boolean;
}): boolean => {
  const uploadQueueSize = Number.isFinite(Number(args.uploadQueueSize)) ? Math.max(0, Number(args.uploadQueueSize)) : 0;
  return uploadQueueSize === 0 && args.autoSaveQueued && args.autoSaveDirty && !args.submitting;
};
