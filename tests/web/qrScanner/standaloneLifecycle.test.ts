import {
  buildQrScannerCandidateMessage,
  buildQrScannerCommitMessage,
  buildQrScannerSetupMessage,
  QR_SCANNER_MESSAGE_TYPES
} from '../../../src/web/qrScanner/openerProtocol';

jest.mock('../../../src/web/qrScanner/decoder', () => ({
  createNativeQrDetector: jest.fn(() => null),
  decodeQrFromVideoFrame: jest.fn(async () => null),
  isLiveCameraSupported: jest.fn(() => false)
}));

type Listener = (event?: any) => void;

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
const originalCrypto = Object.getOwnPropertyDescriptor(globalThis, 'crypto');

class FakeElement {
  readonly dataset: Record<string, string> = {};
  readonly listeners = new Map<string, Listener>();
  className = '';
  disabled = false;
  hidden = false;
  srcObject: unknown = null;
  textContent = '';

  addEventListener(type: string, listener: Listener): void {
    this.listeners.set(type, listener);
  }

  append(..._children: unknown[]): void {}

  replaceChildren(..._children: unknown[]): void {}

  dispatch(type: string): void {
    this.listeners.get(type)?.({ type });
  }

  async play(): Promise<void> {}
}

const createHarness = (options?: { ios?: boolean; commitOnReturnOnIos?: boolean }) => {
  const windowListeners = new Map<string, Listener>();
  const opener = { postMessage: jest.fn() };
  const status = new FakeElement();
  const instruction = new FakeElement();
  const video = new FakeElement();
  const candidateList = new FakeElement();
  const candidateSummary = new FakeElement();
  const close = new FakeElement();
  const elements = new Map<string, FakeElement>([
    ['[data-role="status"]', status],
    ['[data-role="instruction"]', instruction],
    ['[data-role="video"]', video],
    ['[data-role="candidate-list"]', candidateList],
    ['[data-role="candidate-summary"]', candidateSummary],
    ['[data-action="close"]', close]
  ]);
  const fakeDocument = {
    visibilityState: 'visible',
    querySelector: jest.fn((selector: string) => elements.get(selector) || null),
    createElement: jest.fn(() => new FakeElement())
  };
  const fakeWindow = {
    location: {
      search:
        '?requestId=request-1&targetOrigin=https%3A%2F%2Fform.example.test&hideCloseOnIos=1' +
        (options?.commitOnReturnOnIos ? '&commitOnReturnOnIos=1' : '')
    },
    opener,
    addEventListener: jest.fn((type: string, listener: Listener) => {
      windowListeners.set(type, listener);
    }),
    removeEventListener: jest.fn((type: string) => {
      windowListeners.delete(type);
    }),
    setTimeout: jest.fn((listener: TimerHandler, delay?: number) => globalThis.setTimeout(listener, delay)),
    clearTimeout: jest.fn((timer: ReturnType<typeof setTimeout>) => globalThis.clearTimeout(timer)),
    requestAnimationFrame: jest.fn(() => 101),
    cancelAnimationFrame: jest.fn(),
    close: jest.fn()
  };

  Object.defineProperty(globalThis, 'window', { configurable: true, value: fakeWindow });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: fakeDocument });
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      userAgent: options?.ios
        ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X)'
        : 'Mozilla/5.0 (Linux; Android 15)',
      platform: options?.ios ? 'iPhone' : 'Linux armv8l',
      maxTouchPoints: options?.ios ? 5 : 1
    }
  });
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: {
      getRandomValues: jest.fn((values: Uint32Array) => values.fill(1))
    }
  });

  jest.isolateModules(() => {
    jest.requireActual('../../../src/web/qrScanner/standalone');
  });

  const dispatchFromSource = (data: unknown, source: { postMessage: jest.Mock } = opener): void => {
    windowListeners.get('message')?.({
      data,
      origin: 'https://form.example.test',
      source
    });
  };
  const dispatchFromOpener = (data: unknown): void => dispatchFromSource(data);
  const dispatchPageHide = (): void => {
    windowListeners.get('pagehide')?.({ type: 'pagehide' });
  };
  const messagesOfType = (type: string): any[] =>
    opener.postMessage.mock.calls.map(call => call[0]).filter(message => message?.type === type);
  const acceptCandidate = (scanId = 'scan-1', displayName = 'Receipt 1.jpg'): void => {
    dispatchFromOpener(
      buildQrScannerCandidateMessage('request-1', {
        scanId,
        status: 'accepted',
        code: 'ACCEPTED',
        displayName,
        // Cached opener bundles may still use the old batch-oriented copy.
        message: 'Receipt checked and ready to add.'
      })
    );
  };

  return {
    opener,
    fakeWindow,
    status,
    candidateSummary,
    close,
    dispatchFromOpener,
    dispatchFromSource,
    dispatchPageHide,
    messagesOfType,
    acceptCandidate
  };
};

describe('standalone incremental QR scanner lifecycle', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-07-16T08:00:00.000Z'));
    jest.resetModules();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else Reflect.deleteProperty(globalThis, 'window');
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
    else Reflect.deleteProperty(globalThis, 'document');
    if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
    else Reflect.deleteProperty(globalThis, 'navigator');
    if (originalCrypto) Object.defineProperty(globalThis, 'crypto', originalCrypto);
    else Reflect.deleteProperty(globalThis, 'crypto');
  });

  test('shows every accepted candidate as durably added and remains available for another scan', () => {
    const harness = createHarness();

    harness.acceptCandidate();
    expect(harness.status.textContent).toContain('Receipt added. Scan another receipt');
    expect(harness.candidateSummary.textContent).toBe('1 added, 0 checking, 0 not added.');

    harness.acceptCandidate('scan-2', 'Receipt 2.pdf');
    expect(harness.candidateSummary.textContent).toBe('2 added, 0 checking, 0 not added.');
    expect(harness.messagesOfType(QR_SCANNER_MESSAGE_TYPES.finish)).toHaveLength(0);
    expect(harness.messagesOfType(QR_SCANNER_MESSAGE_TYPES.cancel)).toHaveLength(0);
    expect(harness.messagesOfType(QR_SCANNER_MESSAGE_TYPES.closed)).toHaveLength(0);
  });

  test('uses one local Close action on Android without committing or cancelling the session', () => {
    const harness = createHarness({ commitOnReturnOnIos: true });
    expect(harness.close.hidden).toBe(false);

    harness.close.dispatch('click');
    harness.dispatchPageHide();

    expect(harness.messagesOfType(QR_SCANNER_MESSAGE_TYPES.closed)).toHaveLength(1);
    expect(harness.messagesOfType(QR_SCANNER_MESSAGE_TYPES.finish)).toHaveLength(0);
    expect(harness.messagesOfType(QR_SCANNER_MESSAGE_TYPES.cancel)).toHaveLength(0);
    expect(harness.fakeWindow.close).toHaveBeenCalledTimes(1);
  });

  test('hides the page Close action on iOS and reports native X pagehide as CLOSED only', () => {
    const harness = createHarness({ ios: true, commitOnReturnOnIos: true });
    harness.dispatchFromOpener(
      buildQrScannerSetupMessage('request-1', {
        hideCloseOnIos: false,
        commitOnReturnOnIos: false
      })
    );

    expect(harness.close.hidden).toBe(true);
    harness.acceptCandidate();
    expect(harness.status.textContent).toContain('use the browser X when finished');

    harness.dispatchPageHide();

    expect(harness.messagesOfType(QR_SCANNER_MESSAGE_TYPES.closed)).toHaveLength(1);
    expect(harness.messagesOfType(QR_SCANNER_MESSAGE_TYPES.finish)).toHaveLength(0);
    expect(harness.messagesOfType(QR_SCANNER_MESSAGE_TYPES.cancel)).toHaveLength(0);
    expect(harness.fakeWindow.close).not.toHaveBeenCalled();
  });

  test('retains the original opener while also posting CLOSED to an authenticated replacement source', () => {
    const harness = createHarness();
    const replacementOpener = { postMessage: jest.fn() };
    harness.dispatchFromSource(
      buildQrScannerCandidateMessage('request-1', {
        scanId: 'scan-rebound',
        status: 'accepted'
      }),
      replacementOpener
    );

    harness.close.dispatch('click');

    expect(replacementOpener.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: QR_SCANNER_MESSAGE_TYPES.closed, requestId: 'request-1' }),
      'https://form.example.test'
    );
    expect(harness.messagesOfType(QR_SCANNER_MESSAGE_TYPES.closed)).toHaveLength(1);
  });

  test('does not emit liveness or terminal actions while the scanner is idle', () => {
    const harness = createHarness();

    jest.advanceTimersByTime(10_000);

    const types = harness.opener.postMessage.mock.calls.map(call => call[0]?.type);
    expect(types).toEqual([QR_SCANNER_MESSAGE_TYPES.ready, QR_SCANNER_MESSAGE_TYPES.ready]);
  });

  test('still consumes a cached legacy committed response', () => {
    const harness = createHarness();

    harness.dispatchFromOpener(
      buildQrScannerCommitMessage('request-1', {
        status: 'committed',
        linkedCount: 1,
        message: '1 receipt added.'
      })
    );
    jest.advanceTimersByTime(350);

    expect(harness.status.textContent).toBe('1 receipt added.');
    expect(harness.fakeWindow.close).toHaveBeenCalled();
  });
});
