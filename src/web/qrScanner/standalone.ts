import {
  createNativeQrDetector,
  decodeQrFromImageFile,
  decodeQrFromVideoFrame,
  isLiveCameraSupported
} from './decoder';

const params = new URLSearchParams(window.location.search);
const requestId = params.get('requestId') || '';
const targetOrigin = params.get('targetOrigin') || '*';

const statusNode = document.querySelector<HTMLElement>('[data-role="status"]');
const video = document.querySelector<HTMLVideoElement>('[data-role="video"]');
const startButton = document.querySelector<HTMLButtonElement>('[data-action="start"]');
const photoButton = document.querySelector<HTMLButtonElement>('[data-action="photo"]');
const closeButton = document.querySelector<HTMLButtonElement>('[data-action="close"]');
const copyButton = document.querySelector<HTMLButtonElement>('[data-action="copy"]');
const resultNode = document.querySelector<HTMLElement>('[data-role="result"]');
const photoInput = document.querySelector<HTMLInputElement>('[data-role="photo-input"]');

let stream: MediaStream | null = null;
let frameId = 0;
let lastResult = '';

const setStatus = (message: string): void => {
  if (statusNode) statusNode.textContent = message;
};

const stopCamera = (): void => {
  if (frameId) {
    cancelAnimationFrame(frameId);
    frameId = 0;
  }
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = null;
  }
  if (video) video.srcObject = null;
};

const showResult = (value: string): void => {
  lastResult = value;
  if (resultNode) {
    resultNode.textContent = value;
    resultNode.hidden = false;
  }
  if (copyButton) copyButton.hidden = false;
};

const sendResult = (value: string): void => {
  stopCamera();
  showResult(value);
  setStatus('QR code detected. Returning to the form...');

  if (window.opener && !window.opener.closed) {
    window.opener.postMessage(
      {
        type: 'ck.qrScanner.result',
        requestId,
        value
      },
      targetOrigin === '*' ? '*' : targetOrigin
    );
    window.setTimeout(() => window.close(), 700);
    return;
  }

  setStatus('QR code detected. Copy the link, return to the form, and paste it.');
};

const scanLoop = async (canvas: HTMLCanvasElement, detector = createNativeQrDetector()): Promise<void> => {
  if (!video) return;
  const value = await decodeQrFromVideoFrame(video, canvas, detector);
  if (value) {
    sendResult(value);
    return;
  }
  frameId = requestAnimationFrame(() => {
    void scanLoop(canvas, detector);
  });
};

const startCamera = async (): Promise<void> => {
  if (!video) return;
  stopCamera();
  if (!isLiveCameraSupported()) {
    setStatus('Live camera scanning is not available in this browser. Take or choose a QR photo instead.');
    return;
  }

  setStatus('Starting camera...');
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    });
    video.srcObject = stream;
    await video.play();
    setStatus('Point the camera at the QR code.');
    void scanLoop(document.createElement('canvas'));
  } catch {
    setStatus('Could not start the camera. Take or choose a QR photo instead.');
  }
};

const scanPhoto = async (file: File): Promise<void> => {
  setStatus('Reading QR code from photo...');
  try {
    const value = await decodeQrFromImageFile(file, document.createElement('canvas'), createNativeQrDetector());
    if (value) {
      sendResult(value);
      return;
    }
    setStatus('No QR code found in that photo. Try a closer, sharper photo or use the live scanner.');
  } catch {
    setStatus('Could not read that photo. Try again or paste the Drive link in the form.');
  }
};

startButton?.addEventListener('click', () => {
  void startCamera();
});

photoButton?.addEventListener('click', () => {
  photoInput?.click();
});

photoInput?.addEventListener('change', event => {
  const input = event.currentTarget as HTMLInputElement;
  const file = input.files?.[0] || null;
  input.value = '';
  if (file) void scanPhoto(file);
});

copyButton?.addEventListener('click', () => {
  if (!lastResult || !navigator.clipboard?.writeText) return;
  void navigator.clipboard.writeText(lastResult).then(() => setStatus('Link copied. Return to the form and paste it.'));
});

closeButton?.addEventListener('click', () => {
  stopCamera();
  window.close();
});

void startCamera();
