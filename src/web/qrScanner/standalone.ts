import { createNativeQrDetector, decodeQrFromVideoFrame, isLiveCameraSupported } from './decoder';
import {
  buildQrScannerCancelMessage,
  buildQrScannerClosedMessage,
  buildQrScannerFinishMessage,
  buildQrScannerReadyMessage,
  buildQrScannerScanMessage,
  parseQrScannerFromOpenerMessage,
  QR_SCANNER_MESSAGE_TYPES,
  type QrScannerCandidateMessage
} from './openerProtocol';
import { isIosLikeScannerPlatform, resolveScannerCloseMode } from './platform';
import {
  appendCheckingCandidate,
  applyCandidateResult,
  countScannerCandidates,
  failCheckingCandidates,
  fingerprintQrValue,
  retainScannerCommitRequestId,
  type ScannerCandidateView
} from './scannerState';

type StatusTone = 'neutral' | 'success' | 'error';

const params = new URLSearchParams(window.location.search);
const originalOpenerWindow = window.opener;
let authenticatedReplyPeer = originalOpenerWindow;
const requestId = (params.get('requestId') || '').trim();
const provisionalInstruction = (params.get('instruction') || '').trim().slice(0, 300);
const targetOrigin = (() => {
  const raw = (params.get('targetOrigin') || '').trim().replace(/\/+$/, '');
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:' || url.username || url.password || url.origin !== raw) return '';
    return url.origin;
  } catch {
    return '';
  }
})();

const statusNode = document.querySelector<HTMLElement>('[data-role="status"]');
const instructionNode = document.querySelector<HTMLElement>('[data-role="instruction"]');
const video = document.querySelector<HTMLVideoElement>('[data-role="video"]');
const candidateListNode = document.querySelector<HTMLUListElement>('[data-role="candidate-list"]');
const candidateSummaryNode = document.querySelector<HTMLElement>('[data-role="candidate-summary"]');
const finishButton = document.querySelector<HTMLButtonElement>('[data-action="finish"]');
const cancelButton = document.querySelector<HTMLButtonElement>('[data-action="cancel"]');

let stream: MediaStream | null = null;
let frameId = 0;
let resumeTimer = 0;
let finishRetryTimer = 0;
let idSequence = 0;
let closing = false;
let finishRequested = false;
let commitInFlight = false;
let commitRequestId = '';
let finishRequestedAt = 0;
let setupReceived = false;
let connectionFailed = false;
let closedPosted = false;
let cameraReady = false;
let candidates: ScannerCandidateView[] = [];
let maxFiles = 10;
let existingCount = 0;
let hideCloseOnIos = params.get('hideCloseOnIos') !== '0';
let commitOnReturnOnIos = params.get('commitOnReturnOnIos') === '1';
const recentFingerprints = new Map<string, number>();
const scanFingerprints = new Map<string, string>();

const scanCanvas = document.createElement('canvas');
const detector = createNativeQrDetector();
const FINISH_RETRY_INTERVAL_MS = 900;
const FINISH_RETRY_TIMEOUT_MS = 60_000;

const scannerPlatform = {
  userAgent: navigator.userAgent,
  platform: navigator.platform,
  maxTouchPoints: navigator.maxTouchPoints
};
const isIosLike = isIosLikeScannerPlatform(scannerPlatform);
const scannerCloseMode = resolveScannerCloseMode(scannerPlatform);

const createMessageId = (prefix: string): string => {
  idSequence += 1;
  try {
    if (typeof globalThis.crypto?.getRandomValues === 'function') {
      const values = new Uint32Array(4);
      globalThis.crypto.getRandomValues(values);
      return `${prefix}-${Array.from(values, value => value.toString(16).padStart(8, '0')).join('')}`;
    }
  } catch {
    // A monotonic page-local fallback is sufficient for message correlation.
  }
  return `${prefix}-${Date.now().toString(36)}-${idSequence.toString(36)}`;
};

const setStatus = (message: string, tone: StatusTone = 'neutral'): void => {
  if (!statusNode) return;
  statusNode.textContent = message;
  statusNode.dataset.tone = tone;
};

const usesNativeReturnCommit = (): boolean => isIosLike && commitOnReturnOnIos;

const applyActionVisibility = (): void => {
  if (cancelButton) cancelButton.hidden = isIosLike && hideCloseOnIos;
  if (finishButton) finishButton.hidden = usesNativeReturnCommit();
};

const postToOpener = (message: unknown): boolean => {
  const peers = [originalOpenerWindow, authenticatedReplyPeer].filter(
    (peer, index, all): peer is Window => Boolean(peer) && all.indexOf(peer) === index
  );
  if (!targetOrigin || peers.length === 0) {
    failScannerConnection('The form connection is unavailable. Return to the form and try again.');
    return false;
  }
  const posted = peers.reduce((delivered, peer) => {
    try {
      // The original opener is retained because WebKit may expose a parent
      // WindowProxy as event.source. Fan out to an authenticated reply peer
      // without replacing the route that successfully delivered READY/SCAN.
      peer.postMessage(message, targetOrigin);
      return true;
    } catch {
      return delivered;
    }
  }, false);
  if (!posted) {
    failScannerConnection('The form connection is unavailable. Return to the form and try again.');
    return false;
  }
  return true;
};

const candidateStatusLabel = (candidate: ScannerCandidateView): string => {
  if (candidate.status === 'checking') return 'Checking';
  if (candidate.status === 'accepted') return 'Ready to add';
  if (candidate.status === 'error') return 'Check failed';
  return 'Not added';
};

function renderCandidates(): void {
  const counts = countScannerCandidates(candidates);
  const availableSlots = Math.max(0, maxFiles - existingCount - counts.accepted);
  if (candidateSummaryNode) {
    candidateSummaryNode.textContent = candidates.length
      ? `${counts.accepted} ready to add, ${counts.checking} checking, ${counts.notAdded} not added.`
      : 'No receipts scanned yet.';
  }
  if (candidateListNode) {
    candidateListNode.replaceChildren(
      ...candidates.map((candidate, index) => {
        const item = document.createElement('li');
        item.className = 'candidate';
        item.dataset.status = candidate.status;

        const copy = document.createElement('div');
        copy.className = 'candidate-copy';
        const name = document.createElement('span');
        name.className = 'candidate-name';
        name.textContent = candidate.displayName || `Receipt ${index + 1}`;
        const message = document.createElement('span');
        message.className = 'candidate-message';
        message.textContent = candidate.message;
        copy.append(name, message);

        const status = document.createElement('span');
        status.className = 'candidate-status';
        status.textContent = candidateStatusLabel(candidate);
        item.append(copy, status);
        return item;
      })
    );
  }
  if (finishButton) {
    finishButton.disabled =
      closing ||
      finishRequested ||
      commitInFlight ||
      connectionFailed ||
      counts.checking > 0 ||
      counts.accepted === 0;
  }
  if (!connectionFailed && !finishRequested && !commitInFlight && availableSlots === 0 && counts.accepted > 0) {
    setStatus(
      usesNativeReturnCommit()
        ? 'The maximum number of receipts is ready. Use the browser X to add them.'
        : 'The maximum number of receipts is ready to add. Select Finish and add receipts.',
      'success'
    );
  }
}

const stopScanLoop = (): void => {
  if (resumeTimer) {
    window.clearTimeout(resumeTimer);
    resumeTimer = 0;
  }
  if (frameId) {
    window.cancelAnimationFrame(frameId);
    frameId = 0;
  }
};

const stopFinishRetry = (): void => {
  if (!finishRetryTimer) return;
  window.clearTimeout(finishRetryTimer);
  finishRetryTimer = 0;
};

const stopCamera = (): void => {
  stopScanLoop();
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = null;
  }
  if (video) video.srcObject = null;
  cameraReady = false;
};

function failScannerConnection(message: string): void {
  connectionFailed = true;
  stopFinishRetry();
  candidates = failCheckingCandidates(
    candidates,
    'This receipt was not checked. Return to the form and open the scanner again.'
  );
  stopCamera();
  setStatus(message, 'error');
  renderCandidates();
}

const closeScannerWindow = (): void => {
  if (scannerCloseMode === 'native') return;
  const tryClose = (): void => {
    try {
      window.close();
    } catch {
      // Some mobile browser surfaces require the user to use their native close control.
    }
  };
  tryClose();
  window.setTimeout(tryClose, 80);
  window.setTimeout(() => {
    if (document.visibilityState === 'visible') {
      setStatus('Return to the form using the browser close control.');
    }
  }, 500);
};

const postClosed = (): void => {
  if (closedPosted || !requestId || !targetOrigin) return;
  closedPosted = true;
  postToOpener(buildQrScannerClosedMessage(requestId));
};

const scheduleNextFrame = (): void => {
  if (closing || finishRequested || connectionFailed || !cameraReady) return;
  frameId = window.requestAnimationFrame(() => {
    void scanLoop();
  });
};

const shouldSuppressValue = (value: string): boolean => {
  const fingerprint = fingerprintQrValue(value);
  const now = Date.now();
  const prior = recentFingerprints.get(fingerprint) || 0;
  recentFingerprints.set(fingerprint, now);
  for (const [key, timestamp] of recentFingerprints) {
    if (now - timestamp > 30_000) recentFingerprints.delete(key);
  }
  return now - prior < 10_000;
};

const sendDetectedValue = (value: string): void => {
  if (closing || finishRequested || connectionFailed || shouldSuppressValue(value)) return;
  const scanId = createMessageId('scan');
  scanFingerprints.set(scanId, fingerprintQrValue(value));
  candidates = appendCheckingCandidate(candidates, scanId);
  setStatus(setupReceived ? 'Receipt detected. Checking authorisation...' : 'Receipt detected. Waiting for a secure check...');
  renderCandidates();
  if (!postToOpener(buildQrScannerScanMessage(requestId, scanId, value))) {
    const fingerprint = scanFingerprints.get(scanId);
    if (fingerprint) recentFingerprints.delete(fingerprint);
    scanFingerprints.delete(scanId);
  }
};

async function scanLoop(): Promise<void> {
  if (!video || closing || finishRequested || connectionFailed || !cameraReady) return;
  const value = await decodeQrFromVideoFrame(video, scanCanvas, detector);
  if (closing || finishRequested || connectionFailed || !cameraReady) return;
  if (value) {
    sendDetectedValue(value);
    resumeTimer = window.setTimeout(scheduleNextFrame, 700);
    return;
  }
  scheduleNextFrame();
}

const beginScanning = (): void => {
  if (closing || finishRequested || connectionFailed || !cameraReady) return;
  stopScanLoop();
  scheduleNextFrame();
};

const startCamera = async (): Promise<void> => {
  if (!video || stream || closing || connectionFailed) return;
  if (!isLiveCameraSupported()) {
    setStatus('Live camera scanning is not available in this browser. Return to the form.', 'error');
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
    if (closing || connectionFailed) {
      stopCamera();
      return;
    }
    video.srcObject = stream;
    await video.play();
    if (closing || connectionFailed || !stream) {
      stopCamera();
      return;
    }
    cameraReady = true;
    setStatus(setupReceived ? 'Camera ready.' : 'Camera ready. You can scan while the secure check is prepared.');
    beginScanning();
  } catch {
    stopCamera();
    if (!connectionFailed) {
      setStatus(
        'Could not start the camera. Check camera permission, then return to the form and open the scanner again.',
        'error'
      );
    }
  }
};

const handleCandidate = (message: QrScannerCandidateMessage): void => {
  candidates = applyCandidateResult(candidates, message);
  const fingerprint = scanFingerprints.get(message.scanId);
  if (message.status === 'error' && fingerprint) recentFingerprints.delete(fingerprint);
  scanFingerprints.delete(message.scanId);
  const tone: StatusTone = message.status === 'accepted' ? 'success' : message.status === 'error' ? 'error' : 'neutral';
  const resultMessage =
    message.message || candidates.find(candidate => candidate.scanId === message.scanId)?.message || 'Receipt checked.';
  setStatus(
    message.status === 'accepted' && usesNativeReturnCommit()
      ? 'Receipt ready. Scan another receipt, or use the browser X when finished.'
      : resultMessage,
    tone
  );
  renderCandidates();
};

const handleOpenerMessage = (event: MessageEvent): void => {
  if (event.origin !== targetOrigin || !event.source) return;
  const message = parseQrScannerFromOpenerMessage(event.data, requestId);
  if (!message) return;
  authenticatedReplyPeer = event.source as Window;

  switch (message.type) {
    case QR_SCANNER_MESSAGE_TYPES.setup:
      setupReceived = true;
      connectionFailed = false;
      maxFiles = message.maxFiles && message.maxFiles > 0 ? message.maxFiles : maxFiles;
      existingCount = message.existingCount || 0;
      hideCloseOnIos = message.hideCloseOnIos !== false;
      commitOnReturnOnIos = message.commitOnReturnOnIos === true;
      if (instructionNode && message.instruction) instructionNode.textContent = message.instruction;
      applyActionVisibility();
      if (cameraReady && !candidates.length) setStatus('Camera ready.');
      renderCandidates();
      break;
    case QR_SCANNER_MESSAGE_TYPES.candidate:
      handleCandidate(message);
      break;
    case QR_SCANNER_MESSAGE_TYPES.commit:
      if (message.status === 'committing') {
        commitInFlight = true;
        finishRequested = true;
        stopScanLoop();
        setStatus(message.message || 'Adding checked receipts...');
      } else if (message.status === 'committed') {
        stopFinishRetry();
        commitInFlight = false;
        closing = true;
        stopCamera();
        const linkedCount = Number(message.linkedCount || 0);
        const successMessage =
          message.message ||
          (linkedCount === 1 ? '1 receipt added.' : `${linkedCount} receipts added.`);
        if (scannerCloseMode === 'native') {
          setStatus(`${successMessage} Use the browser X to return to the form.`, 'success');
        } else {
          setStatus(successMessage, 'success');
          window.setTimeout(closeScannerWindow, 350);
        }
      } else {
        stopFinishRetry();
        commitInFlight = false;
        finishRequested = false;
        setStatus(message.message || 'The receipts could not be added. Try again.', 'error');
        beginScanning();
      }
      renderCandidates();
      break;
    case QR_SCANNER_MESSAGE_TYPES.cancelled:
      stopFinishRetry();
      closing = true;
      stopCamera();
      setStatus(
        scannerCloseMode === 'native'
          ? `${message.message || 'Scan cancelled.'} Use the browser X to return to the form.`
          : message.message || 'Scan cancelled.'
      );
      closeScannerWindow();
      break;
    case QR_SCANNER_MESSAGE_TYPES.error:
      stopFinishRetry();
      commitInFlight = false;
      finishRequested = false;
      failScannerConnection(`${message.message} Return to the form and open the scanner again.`);
      break;
    default:
      break;
  }
};

const postFinishRequest = (): void => {
  if (!finishRequested || closing || connectionFailed || !commitRequestId) return;
  if (Date.now() - finishRequestedAt >= FINISH_RETRY_TIMEOUT_MS) {
    stopFinishRetry();
    stopCamera();
    setStatus('Adding receipts is taking longer than expected. Use the browser X to return to the form and check the receipt list.');
    return;
  }
  postToOpener(buildQrScannerFinishMessage(requestId, commitRequestId));
  stopFinishRetry();
  finishRetryTimer = window.setTimeout(postFinishRequest, commitInFlight ? 1500 : FINISH_RETRY_INTERVAL_MS);
};

finishButton?.addEventListener('click', () => {
  const counts = countScannerCandidates(candidates);
  if (closing || finishRequested || commitInFlight || counts.checking > 0 || counts.accepted === 0) return;
  finishRequested = true;
  stopScanLoop();
  setStatus('Adding checked receipts...');
  renderCandidates();
  // Reuse the same id after an uncertain commit response so Apps Script can
  // reconcile a write that may already be durable.
  commitRequestId = retainScannerCommitRequestId(commitRequestId, () => createMessageId('commit'));
  finishRequestedAt = Date.now();
  postFinishRequest();
});

cancelButton?.addEventListener('click', () => {
  if (closing || commitInFlight) return;
  closing = true;
  stopFinishRetry();
  postToOpener(buildQrScannerCancelMessage(requestId));
  stopCamera();
  closeScannerWindow();
});

window.addEventListener('message', handleOpenerMessage);
window.addEventListener('pagehide', () => {
  if (usesNativeReturnCommit()) {
    // The retained form owns the authoritative commit when iOS returns it to
    // the foreground. Do not turn the native browser X into a cancellation.
  } else if (finishRequested && commitRequestId && !connectionFailed) {
    postToOpener(buildQrScannerFinishMessage(requestId, commitRequestId));
  } else {
    postClosed();
  }
  closing = true;
  stopFinishRetry();
  stopCamera();
});

if (instructionNode) {
  instructionNode.textContent = provisionalInstruction || 'Point the camera at each receipt QR code.';
}
applyActionVisibility();
renderCandidates();

if (!requestId || !targetOrigin) {
  connectionFailed = true;
  setStatus('The scanner link is invalid. Return to the form and try again.', 'error');
  renderCandidates();
} else {
  const readyPosted = postToOpener(buildQrScannerReadyMessage(requestId));
  if (readyPosted) {
    window.setTimeout(() => {
      if (!setupReceived && !closing && !connectionFailed) postToOpener(buildQrScannerReadyMessage(requestId));
    }, 300);
    // Camera permission and streaming start independently of session preparation.
    void startCamera();
  }
}
