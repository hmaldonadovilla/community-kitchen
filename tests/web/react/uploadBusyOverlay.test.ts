import { resolveUploadBusyOverlayTransition } from '../../../src/web/react/app/uploadBusyOverlay';

describe('uploadBusyOverlay', () => {
  it('locks when an upload transaction starts without an active overlay', () => {
    expect(resolveUploadBusyOverlayTransition({ uploadsInFlight: 1, activeSeq: null })).toBe('lock');
  });

  it('keeps the active overlay while concurrent uploads are still running', () => {
    expect(resolveUploadBusyOverlayTransition({ uploadsInFlight: 2, activeSeq: 12 })).toBe('none');
    expect(resolveUploadBusyOverlayTransition({ uploadsInFlight: 1, activeSeq: 12 })).toBe('none');
  });

  it('unlocks only after the upload queue drains', () => {
    expect(resolveUploadBusyOverlayTransition({ uploadsInFlight: 0, activeSeq: 12 })).toBe('unlock');
  });
});
