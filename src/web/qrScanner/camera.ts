export interface QrCameraDiagnostics {
  width?: number;
  height?: number;
  frameRate?: number;
  facingMode?: string;
  contentHint: 'detail' | 'unsupported';
  focusMode: 'continuous' | 'browser-default';
}

type QrCameraCapabilities = MediaTrackCapabilities & {
  focusMode?: string[];
};

type QrCameraConstraintSet = MediaTrackConstraintSet & {
  focusMode?: string;
};

/** Requests detail while leaving every camera setting as a non-blocking preference. */
export const buildQrCameraConstraints = (): MediaStreamConstraints => ({
  video: {
    facingMode: { ideal: 'environment' },
    width: { ideal: 1920 },
    height: { ideal: 1080 },
    frameRate: { ideal: 24, max: 30 }
  },
  audio: false
});

const readCameraSettings = (track: MediaStreamTrack): Partial<QrCameraDiagnostics> => {
  try {
    const settings = track.getSettings?.() || {};
    return {
      ...(typeof settings.width === 'number' ? { width: settings.width } : {}),
      ...(typeof settings.height === 'number' ? { height: settings.height } : {}),
      ...(typeof settings.frameRate === 'number' ? { frameRate: settings.frameRate } : {}),
      ...(typeof settings.facingMode === 'string' ? { facingMode: settings.facingMode } : {})
    };
  } catch {
    return {};
  }
};

/** Applies optional detail/focus hints without making camera startup depend on them. */
export const optimiseQrCameraTrack = async (inputTrack: MediaStreamTrack): Promise<QrCameraDiagnostics> => {
  const track = inputTrack;
  let contentHint: QrCameraDiagnostics['contentHint'] = 'unsupported';
  let focusMode: QrCameraDiagnostics['focusMode'] = 'browser-default';

  try {
    if ('contentHint' in track) {
      track.contentHint = 'detail';
      if (track.contentHint === 'detail') contentHint = 'detail';
    }
  } catch {
    // Older WebKit versions may expose but reject content hints.
  }

  try {
    const capabilities = track.getCapabilities?.() as QrCameraCapabilities | undefined;
    if (capabilities?.focusMode?.includes('continuous')) {
      const advanced = [{ focusMode: 'continuous' } as QrCameraConstraintSet];
      await track.applyConstraints({ advanced });
      focusMode = 'continuous';
    }
  } catch {
    // Keep the browser's native autofocus when focus constraints are unavailable.
  }

  return {
    ...readCameraSettings(track),
    contentHint,
    focusMode
  };
};
