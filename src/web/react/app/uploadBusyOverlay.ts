export type UploadBusyOverlayTransition = 'lock' | 'unlock' | 'none';

export const resolveUploadBusyOverlayTransition = (args: {
  uploadsInFlight: number;
  activeSeq: number | null | undefined;
}): UploadBusyOverlayTransition => {
  const uploadsInFlight = Number.isFinite(Number(args.uploadsInFlight))
    ? Math.max(0, Number(args.uploadsInFlight))
    : 0;
  const active = args.activeSeq !== null && args.activeSeq !== undefined;
  if (uploadsInFlight > 0 && !active) return 'lock';
  if (uploadsInFlight <= 0 && active) return 'unlock';
  return 'none';
};
