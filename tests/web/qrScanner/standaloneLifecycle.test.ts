import {
  buildQrScannerCandidateMessage,
  buildQrScannerCommitMessage,
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
  const finish = new FakeElement();
  const cancel = new FakeElement();
  const elements = new Map<string, FakeElement>([
    ['[data-role="status"]', status],
    ['[data-role="instruction"]', instruction],
    ['[data-role="video"]', video],
    ['[data-role="candidate-list"]', candidateList],
    ['[data-role="candidate-summary"]', candidateSummary],
    ['[data-action="finish"]', finish],
    ['[data-action="cancel"]', cancel]
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
    setTimeout: jest.fn((listener: TimerHandler, delay?: number) =>
      globalThis.setTimeout(listener, delay)
    ),
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
    opener.postMessage.mock.calls
      .map(call => call[0])
      .filter(message => message?.type === type);
  const acceptCandidate = (): void => {
    dispatchFromOpener(
      buildQrScannerCandidateMessage('request-1', {
        scanId: 'scan-1',
        status: 'accepted',
        code: 'ACCEPTED',
        displayName: 'Receipt 1.jpg',
        message: 'Receipt checked and ready to add.'
      })
    );
  };

  return {
    opener,
    status,
    finish,
    dispatchFromOpener,
    dispatchFromSource,
    dispatchPageHide,
    messagesOfType,
    acceptCandidate
  };
};

describe('standalone QR scanner Finish lifecycle', () => {
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

  test('retries one stable Finish request until the committed response arrives', () => {
    const harness = createHarness();
    harness.acceptCandidate();
    expect(harness.finish.disabled).toBe(false);

    harness.finish.dispatch('click');
    const initial = harness.messagesOfType(QR_SCANNER_MESSAGE_TYPES.finish);
    expect(initial).toHaveLength(1);
    expect(initial[0].commitRequestId).toBeTruthy();

    jest.advanceTimersByTime(900);
    const retried = harness.messagesOfType(QR_SCANNER_MESSAGE_TYPES.finish);
    expect(retried).toHaveLength(2);
    expect(retried[1].commitRequestId).toBe(initial[0].commitRequestId);

    harness.dispatchFromOpener(
      buildQrScannerCommitMessage('request-1', {
        status: 'committed',
        linkedCount: 1,
        message: '1 receipt added.'
      })
    );
    jest.advanceTimersByTime(5_000);

    expect(harness.messagesOfType(QR_SCANNER_MESSAGE_TYPES.finish)).toHaveLength(2);
  });

  test('retains the original opener while also using an authenticated replacement source', () => {
    const harness = createHarness();
    const replacementOpener = { postMessage: jest.fn() };
    harness.dispatchFromSource(
      buildQrScannerCandidateMessage('request-1', {
        scanId: 'scan-rebound',
        status: 'accepted',
        code: 'ACCEPTED',
        displayName: 'Receipt rebound.jpg',
        message: 'Receipt checked and ready to add.'
      }),
      replacementOpener
    );

    harness.finish.dispatch('click');

    expect(replacementOpener.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: QR_SCANNER_MESSAGE_TYPES.finish,
        requestId: 'request-1'
      }),
      'https://form.example.test'
    );
    expect(harness.opener.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: QR_SCANNER_MESSAGE_TYPES.finish,
        requestId: 'request-1'
      }),
      'https://form.example.test'
    );
  });

  test('replays Finish rather than cancelling when pagehide follows Finish', () => {
    const harness = createHarness();
    harness.acceptCandidate();
    harness.finish.dispatch('click');
    const firstFinish = harness.messagesOfType(QR_SCANNER_MESSAGE_TYPES.finish)[0];

    harness.dispatchPageHide();

    const finishMessages = harness.messagesOfType(QR_SCANNER_MESSAGE_TYPES.finish);
    expect(finishMessages).toHaveLength(2);
    expect(finishMessages[1].commitRequestId).toBe(firstFinish.commitRequestId);
    expect(harness.messagesOfType(QR_SCANNER_MESSAGE_TYPES.closed)).toHaveLength(0);
    jest.advanceTimersByTime(5_000);
    expect(harness.messagesOfType(QR_SCANNER_MESSAGE_TYPES.finish)).toHaveLength(2);
  });

  test('reports a normal pagehide as closed when Finish was not requested', () => {
    const harness = createHarness();

    harness.dispatchPageHide();

    expect(harness.messagesOfType(QR_SCANNER_MESSAGE_TYPES.finish)).toHaveLength(0);
    expect(harness.messagesOfType(QR_SCANNER_MESSAGE_TYPES.closed)).toHaveLength(1);
  });

  test('uses the native X as Done on configured iOS scanners', () => {
    const harness = createHarness({ ios: true, commitOnReturnOnIos: true });
    harness.acceptCandidate();

    expect(harness.finish.hidden).toBe(true);
    expect(harness.status.textContent).toContain('use the browser X when finished');

    harness.dispatchPageHide();

    expect(harness.messagesOfType(QR_SCANNER_MESSAGE_TYPES.finish)).toHaveLength(0);
    expect(harness.messagesOfType(QR_SCANNER_MESSAGE_TYPES.closed)).toHaveLength(0);
  });

  test('keeps explicit Finish and page-close handling on Android when native return is configured', () => {
    const harness = createHarness({ commitOnReturnOnIos: true });
    harness.acceptCandidate();

    expect(harness.finish.hidden).toBe(false);
    harness.dispatchPageHide();

    expect(harness.messagesOfType(QR_SCANNER_MESSAGE_TYPES.finish)).toHaveLength(0);
    expect(harness.messagesOfType(QR_SCANNER_MESSAGE_TYPES.closed)).toHaveLength(1);
  });

  test('keeps explicit Finish on iOS when native return is not configured', () => {
    const harness = createHarness({ ios: true });
    harness.acceptCandidate();

    expect(harness.finish.hidden).toBe(false);
    harness.dispatchPageHide();

    expect(harness.messagesOfType(QR_SCANNER_MESSAGE_TYPES.finish)).toHaveLength(0);
    expect(harness.messagesOfType(QR_SCANNER_MESSAGE_TYPES.closed)).toHaveLength(1);
  });
});
