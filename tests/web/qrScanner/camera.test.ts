import { buildQrCameraConstraints, optimiseQrCameraTrack } from '../../../src/web/qrScanner/camera';

describe('QR scanner camera policy', () => {
  test('requests a detailed rear-camera stream without hard resolution requirements', () => {
    expect(buildQrCameraConstraints()).toEqual({
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: 24, max: 30 }
      },
      audio: false
    });
  });

  test('uses detail content and continuous focus when the track advertises support', async () => {
    const applyConstraints = jest.fn(async () => undefined);
    const track = {
      contentHint: '',
      getCapabilities: jest.fn(() => ({ focusMode: ['single-shot', 'continuous'] })),
      applyConstraints,
      getSettings: jest.fn(() => ({
        width: 1920,
        height: 1080,
        frameRate: 24,
        facingMode: 'environment',
        deviceId: 'must-not-be-reported'
      }))
    } as unknown as MediaStreamTrack;

    await expect(optimiseQrCameraTrack(track)).resolves.toEqual({
      width: 1920,
      height: 1080,
      frameRate: 24,
      facingMode: 'environment',
      contentHint: 'detail',
      focusMode: 'continuous'
    });
    expect(applyConstraints).toHaveBeenCalledWith({
      advanced: [{ focusMode: 'continuous' }]
    });
  });

  test('keeps browser autofocus when optional camera capabilities are absent', async () => {
    const applyConstraints = jest.fn(async () => undefined);
    const track = {
      applyConstraints,
      getSettings: jest.fn(() => ({ width: 1280, height: 720 }))
    } as unknown as MediaStreamTrack;

    await expect(optimiseQrCameraTrack(track)).resolves.toEqual({
      width: 1280,
      height: 720,
      contentHint: 'unsupported',
      focusMode: 'browser-default'
    });
    expect(applyConstraints).not.toHaveBeenCalled();
  });
});
