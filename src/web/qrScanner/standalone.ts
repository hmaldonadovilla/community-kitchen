import { createNativeQrDetector, decodeQrFromVideoFrame, isLiveCameraSupported } from './decoder';

const params = new URLSearchParams(window.location.search);
const requestId = params.get('requestId') || '';
const targetOrigin = params.get('targetOrigin') || '*';
const closeOnResult = params.get('closeOnResult') === '1';
const successMessage = params.get('successMessage') || 'QR code detected. Sent to the form.';

const statusNode = document.querySelector<HTMLElement>('[data-role="status"]');
const video = document.querySelector<HTMLVideoElement>('[data-role="video"]');
const closeButton = document.querySelector<HTMLButtonElement>('[data-action="close"]');

let stream: MediaStream | null = null;
let frameId = 0;
let resumeTimer = 0;
let closing = false;
let lastSentValue = '';
let lastSentAt = 0;
let closePosted = false;

const scanCanvas = document.createElement('canvas');
const detector = createNativeQrDetector();

const setStatus = (message: string, tone?: 'success'): void => {
  if (!statusNode) return;
  statusNode.textContent = message;
  statusNode.className = tone === 'success' ? 'status success' : 'status';
};

const stopScanLoop = (): void => {
  if (resumeTimer) {
    window.clearTimeout(resumeTimer);
    resumeTimer = 0;
  }
  if (frameId) {
    cancelAnimationFrame(frameId);
    frameId = 0;
  }
};

const stopCamera = (): void => {
  stopScanLoop();
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = null;
  }
  if (video) video.srcObject = null;
};

const postClosed = (): void => {
  if (closePosted || !window.opener || window.opener.closed) return;
  closePosted = true;
  window.opener.postMessage(
    {
      type: 'ck.qrScanner.closed',
      requestId
    },
    targetOrigin === '*' ? '*' : targetOrigin
  );
};

const beginScanning = (): void => {
  if (closing) return;
  stopScanLoop();
  setStatus('Point the camera at the QR code.');
  void scanLoop();
};

const sendResult = (value: string): void => {
  if (closing) return;
  stopScanLoop();
  setStatus(closeOnResult ? 'QR code detected. Returning to the form...' : successMessage, closeOnResult ? undefined : 'success');

  if (window.opener && !window.opener.closed) {
    window.opener.postMessage(
      {
        type: 'ck.qrScanner.result',
        requestId,
        value
      },
      targetOrigin === '*' ? '*' : targetOrigin
    );
    if (closeOnResult) {
      window.setTimeout(() => window.close(), 700);
      return;
    }
  }

  resumeTimer = window.setTimeout(() => {
    if (!closing && stream) beginScanning();
  }, 1400);
};

async function scanLoop(): Promise<void> {
  if (!video || closing) return;
  const value = await decodeQrFromVideoFrame(video, scanCanvas, detector);
  if (closing) return;
  if (value) {
    const now = Date.now();
    if (value !== lastSentValue || now - lastSentAt > 10000) {
      lastSentValue = value;
      lastSentAt = now;
      sendResult(value);
      return;
    }
  }
  frameId = requestAnimationFrame(() => {
    void scanLoop();
  });
}

const startCamera = async (): Promise<void> => {
  if (!video) return;
  stopScanLoop();
  if (!isLiveCameraSupported()) {
    setStatus('Live camera scanning is not available in this browser.');
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
    beginScanning();
  } catch {
    setStatus('Could not start the camera.');
  }
};

closeButton?.addEventListener('click', () => {
  closing = true;
  postClosed();
  stopCamera();
  window.close();
});

window.addEventListener('pagehide', () => {
  closing = true;
  postClosed();
  stopCamera();
});

void startCamera();
