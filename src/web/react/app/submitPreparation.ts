export type SubmitWaitQueuePolicy = 'all' | 'uploadsOnly' | 'none';

export type SubmitPreparationSnapshot = {
  stepsMode?: string | null;
  waitForQueue?: SubmitWaitQueuePolicy | string | null;
  autoSaveInFlight?: boolean;
  draftSaveInFlight?: boolean;
  uploadsInFlight?: number;
  recordSyncInFlight?: boolean;
};

const normalizeQueuePolicy = (value?: SubmitWaitQueuePolicy | string | null): SubmitWaitQueuePolicy => {
  const normalized = (value || 'all').toString().trim();
  if (normalized === 'uploadsOnly' || normalized === 'none') return normalized;
  return 'all';
};

export const shouldShowSubmitPreparationOverlay = (snapshot: SubmitPreparationSnapshot): boolean => {
  if ((snapshot.stepsMode || '').toString().trim() === 'guided') return false;
  if (snapshot.recordSyncInFlight) return true;

  const waitForQueue = normalizeQueuePolicy(snapshot.waitForQueue);
  if (waitForQueue === 'none') return false;

  const uploadsInFlight = Number(snapshot.uploadsInFlight || 0);
  if (Number.isFinite(uploadsInFlight) && uploadsInFlight > 0) return true;
  if (waitForQueue === 'uploadsOnly') return false;

  return Boolean(snapshot.autoSaveInFlight || snapshot.draftSaveInFlight);
};

export const resolveSubmitPreparationMessageKey = (
  snapshot: SubmitPreparationSnapshot
): 'navigation.waitPhotos' | 'navigation.waitSaving' => {
  const uploadsInFlight = Number(snapshot.uploadsInFlight || 0);
  const hasOnlyUploads =
    Number.isFinite(uploadsInFlight) &&
    uploadsInFlight > 0 &&
    !snapshot.recordSyncInFlight &&
    !snapshot.autoSaveInFlight &&
    !snapshot.draftSaveInFlight;
  return hasOnlyUploads ? 'navigation.waitPhotos' : 'navigation.waitSaving';
};
