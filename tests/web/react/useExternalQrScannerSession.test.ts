let mockEffectCleanup: (() => void) | undefined;
let mockRefValues: Array<{ current: unknown }> = [];
let mockRefIndex = 0;
const mockRedeemQrScannerSession = jest.fn();
const mockAddQrScannerCandidate = jest.fn();
const mockAddQrScannerCandidates = jest.fn();
const mockCommitQrScannerSession = jest.fn();
const mockCancelQrScannerSession = jest.fn();
const mockGetQrScannerSession = jest.fn();

jest.mock('react', () => {
  const react = {
    useRef: (value: unknown) => {
      const index = mockRefIndex;
      mockRefIndex += 1;
      if (!mockRefValues[index]) mockRefValues[index] = { current: value };
      return mockRefValues[index];
    },
    useEffect: (effect: () => void | (() => void)) => {
      const cleanup = effect();
      mockEffectCleanup = typeof cleanup === 'function' ? cleanup : undefined;
    },
    useCallback: (callback: unknown) => callback
  };
  return { __esModule: true, default: react, ...react };
});

jest.mock('../../../src/web/react/features/uploads/services/qrScannerSessionClient', () => {
  const actual = jest.requireActual('../../../src/web/react/features/uploads/services/qrScannerSessionClient') as Record<
    string,
    unknown
  >;
  return {
    ...actual,
    redeemQrScannerSession: (...args: unknown[]) => mockRedeemQrScannerSession(...args),
    addQrScannerCandidate: (...args: unknown[]) => mockAddQrScannerCandidate(...args),
    addQrScannerCandidates: (...args: unknown[]) => mockAddQrScannerCandidates(...args),
    commitQrScannerSession: (...args: unknown[]) => mockCommitQrScannerSession(...args),
    cancelQrScannerSession: (...args: unknown[]) => mockCancelQrScannerSession(...args),
    getQrScannerSession: (...args: unknown[]) => mockGetQrScannerSession(...args)
  };
});

import {
  buildQrScannerCancelMessage,
  buildQrScannerClosedMessage,
  buildQrScannerFinishMessage,
  buildQrScannerReadyMessage,
  buildQrScannerScanMessage,
  QR_SCANNER_MESSAGE_TYPES
} from '../../../src/web/qrScanner/openerProtocol';
import { useExternalQrScannerSession } from '../../../src/web/react/features/uploads/hooks/useExternalQrScannerSession';
import type { QrScannerCandidateResult } from '../../../src/web/react/features/uploads/services/qrScannerSessionClient';

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
const originalCrypto = Object.getOwnPropertyDescriptor(globalThis, 'crypto');

const successfulLaunch = {
  success: true as const,
  sessionId: 'session-1',
  launchUrl:
    'https://scanner.example.test/qr-scanner.html#sessionId=session-1&launchToken=launch-token',
  expiresAt: '2026-07-15T10:15:00.000Z'
};

const redeemedSession = {
  credentials: { sessionId: 'session-1', accessToken: 'access-token' },
  session: {
    id: 'session-1',
    instruction: 'Point the camera at each QR code on the ingredient receipts.',
    maxFiles: 10,
    existingCount: 0,
    status: 'ACTIVE' as const
  }
};

const batchedRedeemedSession = {
  ...redeemedSession,
  session: {
    ...redeemedSession.session,
    capabilities: { addCandidates: true, maxCandidateBatchSize: 3 }
  }
};

const receiptUrl = (index: number): string =>
  `https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxY${index}/view`;

const candidateResult = (scanId: string, index: number, linkCount = index) => ({
  candidate: {
    id: `candidate-${scanId}`,
    status: 'AUTHORISED' as const,
    code: 'ACCEPTED',
    fileId: `1AbCdEfGhIjKlMnOpQrStUvWxY${index}`,
    canonicalUrl: receiptUrl(index),
    displayName: `Receipt ${index}.jpg`
  },
  session: redeemedSession.session,
  committed: {
    linkedCount: 1,
    skippedCount: 0,
    recordId: 'record-1',
    dataVersion: 7 + index,
    fieldValue: Array.from({ length: linkCount }, (_, offset) => receiptUrl(offset + 1)).join(', '),
    links: Array.from({ length: linkCount }, (_, offset) => receiptUrl(offset + 1)),
    summaryCode: 'COMMITTED' as const
  }
});

const batchResult = (requests: Array<{ scanId: string; rawValue: string }>) => ({
  results: requests.map((request, index) => ({
    candidate: candidateResult(request.scanId, index + 1).candidate
  })),
  session: batchedRedeemedSession.session,
  committed: {
    linkedCount: requests.length,
    skippedCount: 0,
    recordId: 'record-1',
    dataVersion: 20,
    fieldValue: requests.map((_, index) => receiptUrl(index + 1)).join(', '),
    links: requests.map((_, index) => receiptUrl(index + 1)),
    summaryCode: 'COMMITTED' as const
  },
  transport: 'batch' as const
});

const deferred = <T,>() => {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const flushPromises = async (): Promise<void> => {
  for (let index = 0; index < 12; index += 1) await Promise.resolve();
};

type HookArgs = Parameters<typeof useExternalQrScannerSession>[0];

const createHarness = (options?: {
  args?: Partial<HookArgs>;
  open?: (url: string, target: string, features: string) => Window | null;
}) => {
  const eventListeners = new Map<string, Set<(event: any) => void>>();
  const documentListeners = new Map<string, Set<(event: any) => void>>();
  const timers = new Map<number, { listener: TimerHandler; delay: number }>();
  let timerSequence = 100;
  const popup = {
    closed: false,
    postMessage: jest.fn()
  } as unknown as Window;
  const openMock = jest.fn(options?.open || (() => popup));
  const fakeWindow = {
    location: { origin: 'https://script.googleusercontent.com' },
    open: openMock,
    addEventListener: jest.fn((type: string, listener: (event: any) => void) => {
      const listeners = eventListeners.get(type) || new Set<(event: any) => void>();
      listeners.add(listener);
      eventListeners.set(type, listeners);
    }),
    removeEventListener: jest.fn((type: string, listener: (event: any) => void) => {
      eventListeners.get(type)?.delete(listener);
    }),
    setTimeout: jest.fn((listener: TimerHandler, delay = 0) => {
      timerSequence += 1;
      timers.set(timerSequence, { listener, delay });
      return timerSequence;
    }),
    clearTimeout: jest.fn((timerId: number) => {
      timers.delete(timerId);
    })
  };
  Object.defineProperty(globalThis, 'window', { configurable: true, value: fakeWindow });

  const fakeDocument = {
    visibilityState: 'visible',
    addEventListener: jest.fn((type: string, listener: (event: any) => void) => {
      const listeners = documentListeners.get(type) || new Set<(event: any) => void>();
      listeners.add(listener);
      documentListeners.set(type, listeners);
    }),
    removeEventListener: jest.fn((type: string, listener: (event: any) => void) => {
      documentListeners.get(type)?.delete(listener);
    })
  };
  Object.defineProperty(globalThis, 'document', { configurable: true, value: fakeDocument });
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      userAgent: 'Mozilla/5.0 (Linux; Android 15)',
      platform: 'Linux armv8l',
      maxTouchPoints: 5
    }
  });

  const defaultCallbacks = {
    onSessionReady: jest.fn(),
    onSessionEnd: jest.fn(),
    onPendingWorkChange: jest.fn(),
    onCandidateOutcome: jest.fn(),
    onCommitted: jest.fn(),
    onUnavailable: jest.fn(),
    onDiagnostic: jest.fn()
  };
  const prepareSession = options?.args?.prepareSession || jest.fn(async () => successfulLaunch);
  const baseArgs: HookArgs = {
    assetBaseUrl: 'https://scanner.example.test',
    enabled: true,
    fieldId: 'ING_EVD',
    fieldPath: 'ING_EVD',
    instruction: 'Configured instruction',
    hideCloseOnIos: true,
    commitOnReturnOnIos: false,
    prepareSession,
    ...defaultCallbacks,
    ...options?.args
  };
  const callbacks = {
    onSessionReady: baseArgs.onSessionReady as jest.Mock,
    onSessionEnd: baseArgs.onSessionEnd as jest.Mock,
    onPendingWorkChange: baseArgs.onPendingWorkChange as jest.Mock,
    onCandidateOutcome: baseArgs.onCandidateOutcome as jest.Mock,
    onCommitted: baseArgs.onCommitted as jest.Mock,
    onUnavailable: baseArgs.onUnavailable as jest.Mock,
    onDiagnostic: baseArgs.onDiagnostic as jest.Mock
  };

  mockRefIndex = 0;
  const hook = useExternalQrScannerSession(baseArgs);

  const requestId = (): string => {
    const launchUrl = openMock.mock.calls[0]?.[0];
    if (typeof launchUrl !== 'string') throw new Error('Scanner was not opened.');
    return new URL(launchUrl).searchParams.get('requestId') || '';
  };
  const dispatch = (
    data: unknown,
    event?: { source?: MessageEventSource | null; origin?: string }
  ): void => {
    const messageEvent = {
      data,
      source: event?.source === undefined ? popup : event.source,
      origin: event?.origin || 'https://scanner.example.test'
    } as MessageEvent;
    eventListeners.get('message')?.forEach(listener => listener(messageEvent));
  };
  const dispatchWindowEvent = (type: string): void => {
    eventListeners.get(type)?.forEach(listener => listener({ type }));
  };
  const dispatchVisibility = (visibilityState: 'hidden' | 'visible'): void => {
    fakeDocument.visibilityState = visibilityState;
    documentListeners.get('visibilitychange')?.forEach(listener => listener({ type: 'visibilitychange' }));
  };
  const runAllTimers = (): void => {
    [...timers.entries()].forEach(([timerId, timer]) => {
      timers.delete(timerId);
      if (typeof timer.listener === 'function') timer.listener();
    });
  };

  return {
    hook,
    popup,
    openMock,
    prepareSession,
    callbacks,
    fakeWindow,
    fakeDocument,
    requestId,
    dispatch,
    dispatchWindowEvent,
    dispatchVisibility,
    runAllTimers
  };
};

const expectNoTerminalSessionRpc = (): void => {
  expect(mockCommitQrScannerSession).not.toHaveBeenCalled();
  expect(mockCancelQrScannerSession).not.toHaveBeenCalled();
  expect(mockGetQrScannerSession).not.toHaveBeenCalled();
};

describe('external QR scanner incremental session hook', () => {
  let requestSequence = 0;

  beforeEach(() => {
    requestSequence = 0;
    mockEffectCleanup = undefined;
    mockRefValues = [];
    mockRefIndex = 0;
    mockRedeemQrScannerSession.mockReset().mockResolvedValue(redeemedSession);
    mockAddQrScannerCandidate
      .mockReset()
      .mockImplementation((_credentials, request) => Promise.resolve(candidateResult(request.scanId, 1)));
    mockAddQrScannerCandidates.mockReset();
    mockCommitQrScannerSession.mockReset();
    mockCancelQrScannerSession.mockReset();
    mockGetQrScannerSession.mockReset();
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: {
        randomUUID: jest.fn(() => `request-${++requestSequence}`),
        getRandomValues: jest.fn((values: Uint32Array) => values.fill(1))
      }
    });
  });

  afterEach(async () => {
    mockEffectCleanup?.();
    await flushPromises();
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else Reflect.deleteProperty(globalThis, 'window');
    if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
    else Reflect.deleteProperty(globalThis, 'document');
    if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator);
    else Reflect.deleteProperty(globalThis, 'navigator');
    if (originalCrypto) Object.defineProperty(globalThis, 'crypto', originalCrypto);
    else Reflect.deleteProperty(globalThis, 'crypto');
  });

  test('opens synchronously and defers prepare and redeem until the first scan', async () => {
    const order: string[] = [];
    const prepareSession = jest.fn(async () => {
      order.push('prepare');
      return successfulLaunch;
    });
    mockRedeemQrScannerSession.mockImplementation(async () => {
      order.push('redeem');
      return redeemedSession;
    });
    mockAddQrScannerCandidate.mockImplementation(async (_credentials, request) => {
      order.push('add');
      return candidateResult(request.scanId, 1);
    });
    const harness = createHarness({
      args: { prepareSession },
      open: () => {
        order.push('open');
        return { closed: false, postMessage: jest.fn() } as unknown as Window;
      }
    });

    expect(harness.hook.available).toBe(true);
    expect(harness.hook.openScanner()).toBe(true);
    expect(order).toEqual(['open']);
    await flushPromises();
    expect(order).toEqual(['open']);

    harness.dispatch(buildQrScannerScanMessage(harness.requestId(), 'scan-1', 'receipt-1'));
    await flushPromises();

    expect(order).toEqual(['open', 'prepare', 'redeem', 'add']);
    expect(prepareSession).toHaveBeenCalledWith({ fieldId: 'ING_EVD', fieldPath: 'ING_EVD' });
    expect(mockRedeemQrScannerSession).toHaveBeenCalledWith(successfulLaunch);
    expectNoTerminalSessionRpc();
  });

  test('READY sends provisional setup without creating or redeeming a session', async () => {
    const harness = createHarness();
    expect(harness.hook.openScanner()).toBe(true);

    harness.dispatch(buildQrScannerReadyMessage(harness.requestId()));
    await flushPromises();

    expect(harness.prepareSession).not.toHaveBeenCalled();
    expect(mockRedeemQrScannerSession).not.toHaveBeenCalled();
    expect(mockAddQrScannerCandidate).not.toHaveBeenCalled();
    expect(harness.popup.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: QR_SCANNER_MESSAGE_TYPES.setup,
        requestId: harness.requestId(),
        instruction: 'Configured instruction',
        hideCloseOnIos: true,
        commitOnReturnOnIos: false
      }),
      'https://scanner.example.test'
    );
    const setup = (harness.popup.postMessage as jest.Mock).mock.calls.find(
      ([message]) => message?.type === QR_SCANNER_MESSAGE_TYPES.setup
    )?.[0];
    expect(setup).not.toHaveProperty('maxFiles');
    expect(setup).not.toHaveProperty('existingCount');
    expectNoTerminalSessionRpc();
  });

  test('queues two scans, persists each authoritative update in order, and holds until the scanner closes', async () => {
    const launch = deferred<typeof successfulLaunch>();
    const redeemed = deferred<typeof redeemedSession>();
    const first = deferred<ReturnType<typeof candidateResult>>();
    const second = deferred<ReturnType<typeof candidateResult>>();
    const order: string[] = [];
    const prepareSession = jest.fn(() => launch.promise);
    mockRedeemQrScannerSession.mockImplementation(() => {
      order.push('redeem');
      return redeemed.promise;
    });
    mockAddQrScannerCandidate
      .mockImplementationOnce((_credentials, request) => {
        order.push(`add:${request.scanId}`);
        return first.promise;
      })
      .mockImplementationOnce((_credentials, request) => {
        order.push(`add:${request.scanId}`);
        return second.promise;
      });
    const onSessionReady = jest.fn(() => order.push('hold:start'));
    const onSessionEnd = jest.fn((reason: string) => order.push(`hold:${reason}`));
    const onCommitted = jest.fn(update => order.push(`apply:${update.dataVersion}`));
    const harness = createHarness({
      args: { prepareSession, onSessionReady, onSessionEnd, onCommitted }
    });
    expect(harness.hook.openScanner()).toBe(true);
    const requestId = harness.requestId();

    harness.dispatch(buildQrScannerScanMessage(requestId, 'scan-1', 'receipt-1'));
    harness.dispatch(buildQrScannerScanMessage(requestId, 'scan-2', 'receipt-2'));
    await flushPromises();

    expect(harness.callbacks.onPendingWorkChange.mock.calls.map(([count]) => count)).toEqual([1, 2]);
    expect(onSessionReady).not.toHaveBeenCalled();
    expect(mockAddQrScannerCandidate).not.toHaveBeenCalled();

    launch.resolve(successfulLaunch);
    await flushPromises();
    expect(order).toEqual(['hold:start', 'redeem']);
    expect(onSessionReady).toHaveBeenCalledTimes(1);
    expect(mockAddQrScannerCandidate).not.toHaveBeenCalled();

    redeemed.resolve(redeemedSession);
    await flushPromises();
    expect(order).toEqual(['hold:start', 'redeem', 'add:scan-1']);
    expect(mockAddQrScannerCandidate).toHaveBeenCalledTimes(1);
    expect(onSessionEnd).not.toHaveBeenCalled();

    first.resolve(candidateResult('scan-1', 1));
    await flushPromises();
    expect(order).toEqual(['hold:start', 'redeem', 'add:scan-1', 'apply:8', 'add:scan-2']);
    expect(mockAddQrScannerCandidate).toHaveBeenCalledTimes(2);
    expect(harness.callbacks.onPendingWorkChange.mock.calls.map(([count]) => count)).toEqual([1, 2, 1]);
    expect(onSessionEnd).not.toHaveBeenCalled();

    second.resolve(candidateResult('scan-2', 2));
    await flushPromises();

    expect(order).toEqual([
      'hold:start',
      'redeem',
      'add:scan-1',
      'apply:8',
      'add:scan-2',
      'apply:9'
    ]);
    expect(harness.callbacks.onPendingWorkChange.mock.calls.map(([count]) => count)).toEqual([1, 2, 1, 0]);
    expect(onSessionReady).toHaveBeenCalledTimes(1);
    expect(onSessionEnd).not.toHaveBeenCalled();
    expect(onCommitted.mock.calls.map(([update]) => update)).toEqual([
      {
        fieldId: 'ING_EVD',
        fieldPath: 'ING_EVD',
        recordId: 'record-1',
        fieldValue: receiptUrl(1),
        links: [receiptUrl(1)],
        linkedCount: 1,
        dataVersion: 8
      },
      {
        fieldId: 'ING_EVD',
        fieldPath: 'ING_EVD',
        recordId: 'record-1',
        fieldValue: `${receiptUrl(1)}, ${receiptUrl(2)}`,
        links: [receiptUrl(1), receiptUrl(2)],
        linkedCount: 1,
        dataVersion: 9
      }
    ]);
    expect(harness.callbacks.onCandidateOutcome).not.toHaveBeenCalled();

    harness.dispatch(buildQrScannerClosedMessage(requestId));
    await flushPromises();
    expect(onSessionEnd).toHaveBeenCalledTimes(1);
    expect(onSessionEnd).toHaveBeenCalledWith('closed');
    expectNoTerminalSessionRpc();
  });

  test('focus, visibility, and elapsed time do not create, reconcile, commit, or cancel a session', async () => {
    const harness = createHarness();
    expect(harness.hook.openScanner()).toBe(true);
    harness.dispatch(buildQrScannerReadyMessage(harness.requestId()));

    harness.dispatchWindowEvent('blur');
    harness.dispatchWindowEvent('focus');
    harness.dispatchWindowEvent('pageshow');
    harness.dispatchVisibility('hidden');
    harness.dispatchVisibility('visible');
    harness.runAllTimers();
    await flushPromises();

    expect(harness.fakeWindow.addEventListener.mock.calls.map(([type]) => type)).toEqual(['message']);
    expect(harness.fakeWindow.setTimeout).not.toHaveBeenCalled();
    expect(harness.fakeDocument.addEventListener).not.toHaveBeenCalled();
    expect(harness.prepareSession).not.toHaveBeenCalled();
    expect(mockRedeemQrScannerSession).not.toHaveBeenCalled();
    expect(mockAddQrScannerCandidate).not.toHaveBeenCalled();
    expectNoTerminalSessionRpc();
  });

  test('replays a completed scan ID without another RPC, pending transition, or field update', async () => {
    const harness = createHarness();
    expect(harness.hook.openScanner()).toBe(true);
    const scan = buildQrScannerScanMessage(harness.requestId(), 'scan-replay', 'receipt-replay');

    harness.dispatch(scan);
    await flushPromises();
    const candidateMessagesBeforeReplay = (harness.popup.postMessage as jest.Mock).mock.calls.filter(
      ([message]) => message?.type === QR_SCANNER_MESSAGE_TYPES.candidate && message?.scanId === 'scan-replay'
    ).length;
    expect(candidateMessagesBeforeReplay).toBeGreaterThan(0);
    expect(mockAddQrScannerCandidate).toHaveBeenCalledTimes(1);
    expect(harness.callbacks.onCommitted).toHaveBeenCalledTimes(1);
    expect(harness.callbacks.onPendingWorkChange.mock.calls.map(([count]) => count)).toEqual([1, 0]);

    harness.dispatch(scan);
    await flushPromises();

    const candidateMessagesAfterReplay = (harness.popup.postMessage as jest.Mock).mock.calls.filter(
      ([message]) => message?.type === QR_SCANNER_MESSAGE_TYPES.candidate && message?.scanId === 'scan-replay'
    ).length;
    expect(candidateMessagesAfterReplay).toBe(candidateMessagesBeforeReplay + 1);
    expect(mockAddQrScannerCandidate).toHaveBeenCalledTimes(1);
    expect(harness.callbacks.onCommitted).toHaveBeenCalledTimes(1);
    expect(harness.callbacks.onPendingWorkChange.mock.calls.map(([count]) => count)).toEqual([1, 0]);
    expectNoTerminalSessionRpc();
  });

  test('retries a transient add once with the same scan identity and applies one authoritative update', async () => {
    const { QrScannerSessionError } = jest.requireActual(
      '../../../src/web/react/features/uploads/services/qrScannerSessionClient'
    ) as typeof import('../../../src/web/react/features/uploads/services/qrScannerSessionClient');
    mockAddQrScannerCandidate
      .mockRejectedValueOnce(new QrScannerSessionError('TEMPORARY_ERROR', 'The response was lost.', true))
      .mockResolvedValueOnce(candidateResult('scan-retry', 1));
    const harness = createHarness();
    expect(harness.hook.openScanner()).toBe(true);

    harness.dispatch(buildQrScannerScanMessage(harness.requestId(), 'scan-retry', 'receipt-retry'));
    await flushPromises();

    expect(mockAddQrScannerCandidate).toHaveBeenCalledTimes(2);
    expect(mockAddQrScannerCandidate.mock.calls.map(call => call[1])).toEqual([
      { scanId: 'scan-retry', rawValue: 'receipt-retry' },
      { scanId: 'scan-retry', rawValue: 'receipt-retry' }
    ]);
    expect(harness.callbacks.onPendingWorkChange.mock.calls.map(([count]) => count)).toEqual([1, 0]);
    expect(harness.callbacks.onSessionReady).toHaveBeenCalledTimes(1);
    expect(harness.callbacks.onSessionEnd).not.toHaveBeenCalled();
    expect(harness.callbacks.onCommitted).toHaveBeenCalledTimes(1);
    expect(harness.callbacks.onDiagnostic).toHaveBeenCalledWith(
      'upload.linkCapture.externalScanner.candidateRetry',
      {
        fieldPath: 'ING_EVD',
        scanId: 'scan-retry',
        code: 'TEMPORARY_ERROR',
        attempt: 1
      }
    );

    harness.dispatch(buildQrScannerClosedMessage(harness.requestId()));
    await flushPromises();
    expect(harness.callbacks.onSessionEnd).toHaveBeenCalledWith('closed');
    expectNoTerminalSessionRpc();
  });

  test.each([
    ['CANCEL', (requestId: string) => buildQrScannerCancelMessage(requestId), 'cancelled'],
    ['CLOSED', (requestId: string) => buildQrScannerClosedMessage(requestId), 'closed']
  ] as const)(
    '%s detaches the scanner but lets an in-flight add settle before releasing the hold',
    async (_label, message, expectedReason) => {
      const add = deferred<ReturnType<typeof candidateResult>>();
      mockAddQrScannerCandidate.mockReturnValueOnce(add.promise);
      const harness = createHarness();
      expect(harness.hook.openScanner()).toBe(true);
      const requestId = harness.requestId();
      harness.dispatch(buildQrScannerScanMessage(requestId, 'scan-pending', 'receipt-pending'));
      await flushPromises();
      expect(mockAddQrScannerCandidate).toHaveBeenCalledTimes(1);
      expect(harness.callbacks.onSessionReady).toHaveBeenCalledTimes(1);

      harness.dispatch(message(requestId));
      await flushPromises();

      expect(harness.callbacks.onSessionEnd).not.toHaveBeenCalled();
      expect(harness.callbacks.onCommitted).not.toHaveBeenCalled();
      expect(harness.callbacks.onPendingWorkChange.mock.calls.map(([count]) => count)).toEqual([1]);
      expectNoTerminalSessionRpc();

      add.resolve(candidateResult('scan-pending', 1));
      await flushPromises();

      expect(harness.callbacks.onCommitted).toHaveBeenCalledTimes(1);
      expect(harness.callbacks.onPendingWorkChange.mock.calls.map(([count]) => count)).toEqual([1, 0]);
      expect(harness.callbacks.onSessionEnd).toHaveBeenCalledTimes(1);
      expect(harness.callbacks.onSessionEnd).toHaveBeenCalledWith(expectedReason);
      expectNoTerminalSessionRpc();
    }
  );

  test('keeps the session active after a duplicate and accepts a different scan after the queue is idle', async () => {
    mockAddQrScannerCandidate
      .mockResolvedValueOnce({
        candidate: {
          id: 'candidate-duplicate',
          status: 'DUPLICATE',
          code: 'ALREADY_LINKED',
          fileId: '1AbCdEfGhIjKlMnOpQrStUvWxY1',
          canonicalUrl: receiptUrl(1),
          displayName: 'Receipt 1.jpg'
        },
        session: redeemedSession.session
      } satisfies QrScannerCandidateResult)
      .mockResolvedValueOnce(candidateResult('scan-after-idle', 2));
    const harness = createHarness();
    expect(harness.hook.openScanner()).toBe(true);
    const requestId = harness.requestId();

    harness.dispatch(buildQrScannerScanMessage(requestId, 'scan-duplicate', 'receipt-duplicate'));
    await flushPromises();

    expect(harness.callbacks.onCommitted).not.toHaveBeenCalled();
    expect(harness.callbacks.onCandidateOutcome).toHaveBeenCalledTimes(1);
    expect(harness.callbacks.onCandidateOutcome).toHaveBeenCalledWith({
      scanId: 'scan-duplicate',
      status: 'duplicate',
      code: 'ALREADY_LINKED',
      message: 'This receipt was already scanned or linked.'
    });
    expect(harness.callbacks.onPendingWorkChange.mock.calls.map(([count]) => count)).toEqual([1, 0]);
    expect(harness.callbacks.onSessionEnd).not.toHaveBeenCalled();

    harness.dispatch(buildQrScannerScanMessage(requestId, 'scan-after-idle', 'receipt-after-idle'));
    harness.runAllTimers();
    await flushPromises();

    expect(mockAddQrScannerCandidate).toHaveBeenCalledTimes(2);
    expect(mockRedeemQrScannerSession).toHaveBeenCalledTimes(1);
    expect(harness.callbacks.onPendingWorkChange.mock.calls.map(([count]) => count)).toEqual([1, 0, 1, 0]);
    expect(harness.callbacks.onCommitted).toHaveBeenCalledTimes(1);
    expect(harness.callbacks.onSessionEnd).not.toHaveBeenCalled();

    harness.dispatch(buildQrScannerClosedMessage(requestId));
    await flushPromises();
    expect(harness.callbacks.onSessionEnd).toHaveBeenCalledWith('closed');
    expectNoTerminalSessionRpc();
  });

  test('reports a rejected in-flight scan to the form after the scanner is closed', async () => {
    const add = deferred<QrScannerCandidateResult>();
    mockAddQrScannerCandidate.mockReturnValueOnce(add.promise);
    const harness = createHarness();
    expect(harness.hook.openScanner()).toBe(true);
    const requestId = harness.requestId();
    harness.dispatch(buildQrScannerScanMessage(requestId, 'scan-stale', 'receipt-stale'));
    await flushPromises();
    harness.dispatch(buildQrScannerClosedMessage(requestId));

    add.resolve({
      candidate: {
        id: 'candidate-stale',
        status: 'REJECTED',
        code: 'RECORD_CHANGED'
      },
      session: redeemedSession.session
    });
    await flushPromises();

    expect(harness.callbacks.onCommitted).not.toHaveBeenCalled();
    expect(harness.callbacks.onCandidateOutcome).toHaveBeenCalledWith({
      scanId: 'scan-stale',
      status: 'rejected',
      code: 'RECORD_CHANGED',
      message: 'The form changed while this receipt was being added. Return to the form and reopen the scanner.'
    });
    expect(harness.callbacks.onPendingWorkChange.mock.calls.map(([count]) => count)).toEqual([1, 0]);
    expect(harness.callbacks.onSessionEnd).toHaveBeenCalledWith('closed');
    expectNoTerminalSessionRpc();
  });

  test('legacy FINISH drains pending work and returns a synthetic committed acknowledgement without commit RPC', async () => {
    const add = deferred<ReturnType<typeof candidateResult>>();
    mockAddQrScannerCandidate.mockReturnValueOnce(add.promise);
    const harness = createHarness();
    expect(harness.hook.openScanner()).toBe(true);
    const requestId = harness.requestId();
    harness.dispatch(buildQrScannerScanMessage(requestId, 'scan-before-finish', 'receipt-before-finish'));
    await flushPromises();
    expect(mockAddQrScannerCandidate).toHaveBeenCalledTimes(1);

    harness.dispatch(buildQrScannerFinishMessage(requestId, 'legacy-commit-request'));
    await flushPromises();

    expect(harness.popup.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: QR_SCANNER_MESSAGE_TYPES.commit,
        status: 'committing'
      }),
      'https://scanner.example.test'
    );
    expect(harness.callbacks.onSessionEnd).not.toHaveBeenCalled();
    expectNoTerminalSessionRpc();

    add.resolve(candidateResult('scan-before-finish', 1));
    await flushPromises();

    expect(harness.callbacks.onCommitted).toHaveBeenCalledTimes(1);
    expect(harness.callbacks.onSessionEnd).toHaveBeenCalledWith('committed');
    expect(harness.popup.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: QR_SCANNER_MESSAGE_TYPES.commit,
        status: 'committed',
        linkedCount: 1,
        message: '1 receipt added.'
      }),
      'https://scanner.example.test'
    );
    expectNoTerminalSessionRpc();
  });

  test('micro-batches three scans, applies one aggregate update, then publishes outcomes in scan order', async () => {
    mockRedeemQrScannerSession.mockResolvedValue(batchedRedeemedSession);
    mockAddQrScannerCandidates.mockImplementation(async (_credentials, request) => batchResult(request.candidates));
    const harness = createHarness();
    expect(harness.hook.openScanner()).toBe(true);
    const requestId = harness.requestId();

    [1, 2, 3].forEach(index => {
      harness.dispatch(buildQrScannerScanMessage(requestId, `scan-${index}`, receiptUrl(index)));
    });
    await flushPromises();

    expect(mockAddQrScannerCandidate).not.toHaveBeenCalled();
    expect(mockAddQrScannerCandidates).toHaveBeenCalledTimes(1);
    expect(mockAddQrScannerCandidates.mock.calls[0][1].candidates).toEqual([
      { scanId: 'scan-1', rawValue: receiptUrl(1) },
      { scanId: 'scan-2', rawValue: receiptUrl(2) },
      { scanId: 'scan-3', rawValue: receiptUrl(3) }
    ]);
    expect(harness.callbacks.onCommitted).toHaveBeenCalledTimes(1);
    expect(harness.callbacks.onCommitted).toHaveBeenCalledWith(
      expect.objectContaining({ linkedCount: 3, dataVersion: 20 })
    );
    const candidateCalls = (harness.popup.postMessage as jest.Mock).mock.calls
      .map(([message], index) => ({ message, order: (harness.popup.postMessage as jest.Mock).mock.invocationCallOrder[index] }))
      .filter(entry => entry.message?.type === QR_SCANNER_MESSAGE_TYPES.candidate);
    expect(candidateCalls.map(entry => entry.message.scanId)).toEqual(['scan-1', 'scan-2', 'scan-3']);
    expect(harness.callbacks.onCommitted.mock.invocationCallOrder[0]).toBeLessThan(candidateCalls[0].order);
    expect(harness.callbacks.onPendingWorkChange.mock.calls.map(([count]) => count)).toEqual([1, 2, 3, 2, 1, 0]);
  });

  test('retries the exact ordered batch with one stable request ID', async () => {
    const { QrScannerSessionError } = jest.requireActual(
      '../../../src/web/react/features/uploads/services/qrScannerSessionClient'
    ) as typeof import('../../../src/web/react/features/uploads/services/qrScannerSessionClient');
    mockRedeemQrScannerSession.mockResolvedValue(batchedRedeemedSession);
    mockAddQrScannerCandidates
      .mockRejectedValueOnce(new QrScannerSessionError('TEMPORARY_ERROR', 'The response was lost.', true))
      .mockImplementationOnce(async (_credentials, request) => batchResult(request.candidates));
    const harness = createHarness();
    expect(harness.hook.openScanner()).toBe(true);
    const requestId = harness.requestId();

    harness.dispatch(buildQrScannerScanMessage(requestId, 'scan-1', receiptUrl(1)));
    harness.dispatch(buildQrScannerScanMessage(requestId, 'scan-2', receiptUrl(2)));
    await flushPromises();

    expect(mockAddQrScannerCandidates).toHaveBeenCalledTimes(2);
    const firstRequest = mockAddQrScannerCandidates.mock.calls[0][1];
    const retriedRequest = mockAddQrScannerCandidates.mock.calls[1][1];
    expect(retriedRequest).toEqual(firstRequest);
    expect(firstRequest.candidates.map((candidate: { scanId: string }) => candidate.scanId)).toEqual([
      'scan-1',
      'scan-2'
    ]);
    expect(firstRequest.requestId).toMatch(/^request-/);
    expect(harness.callbacks.onCommitted).toHaveBeenCalledTimes(1);
  });

  test('retains an ambiguous failed batch and recovers it before processing a later scan', async () => {
    const { QrScannerSessionError } = jest.requireActual(
      '../../../src/web/react/features/uploads/services/qrScannerSessionClient'
    ) as typeof import('../../../src/web/react/features/uploads/services/qrScannerSessionClient');
    mockRedeemQrScannerSession.mockResolvedValue(batchedRedeemedSession);
    mockAddQrScannerCandidates
      .mockRejectedValueOnce(new QrScannerSessionError('TEMPORARY_ERROR', 'Append response was lost.', true))
      .mockRejectedValueOnce(new QrScannerSessionError('TEMPORARY_ERROR', 'Append is still ambiguous.', true))
      .mockImplementationOnce(async (_credentials, request) => batchResult(request.candidates))
      .mockImplementationOnce(async (_credentials, request) => batchResult(request.candidates));
    const harness = createHarness();
    expect(harness.hook.openScanner()).toBe(true);
    const requestId = harness.requestId();

    harness.dispatch(buildQrScannerScanMessage(requestId, 'scan-ambiguous', receiptUrl(1)));
    await flushPromises();

    expect(mockAddQrScannerCandidates).toHaveBeenCalledTimes(2);
    expect(mockAddQrScannerCandidates.mock.calls[1][1]).toEqual(mockAddQrScannerCandidates.mock.calls[0][1]);
    expect(harness.callbacks.onCandidateOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ scanId: 'scan-ambiguous', status: 'error', code: 'TEMPORARY_ERROR' })
    );
    expect(harness.callbacks.onPendingWorkChange.mock.calls.map(([count]) => count)).toEqual([1, 0]);

    harness.dispatch(buildQrScannerScanMessage(requestId, 'scan-new', receiptUrl(2)));
    harness.runAllTimers();
    await flushPromises();

    expect(mockAddQrScannerCandidates).toHaveBeenCalledTimes(4);
    expect(mockAddQrScannerCandidates.mock.calls[2][1]).toEqual(mockAddQrScannerCandidates.mock.calls[0][1]);
    expect(mockAddQrScannerCandidates.mock.calls[3][1]).toEqual(
      expect.objectContaining({ candidates: [{ scanId: 'scan-new', rawValue: receiptUrl(2) }] })
    );
    expect(mockAddQrScannerCandidates.mock.calls[3][1].requestId).not.toBe(
      mockAddQrScannerCandidates.mock.calls[0][1].requestId
    );
    expect(harness.callbacks.onCommitted).toHaveBeenCalledTimes(2);
    expect(harness.callbacks.onPendingWorkChange.mock.calls.map(([count]) => count)).toEqual([1, 0, 1, 0]);
    const published = (harness.popup.postMessage as jest.Mock).mock.calls
      .map(([message]) => message)
      .filter(message => message?.type === QR_SCANNER_MESSAGE_TYPES.candidate)
      .map(message => [message.scanId, message.status]);
    expect(published).toEqual([
      ['scan-ambiguous', 'error'],
      ['scan-ambiguous', 'accepted'],
      ['scan-new', 'accepted']
    ]);
  });

  test('legacy FINISH exactly recovers a retained ambiguous batch before its committed acknowledgement', async () => {
    const { QrScannerSessionError } = jest.requireActual(
      '../../../src/web/react/features/uploads/services/qrScannerSessionClient'
    ) as typeof import('../../../src/web/react/features/uploads/services/qrScannerSessionClient');
    mockRedeemQrScannerSession.mockResolvedValue(batchedRedeemedSession);
    mockAddQrScannerCandidates
      .mockRejectedValueOnce(new QrScannerSessionError('TEMPORARY_ERROR', 'Append response was lost.', true))
      .mockRejectedValueOnce(new QrScannerSessionError('TEMPORARY_ERROR', 'Append is still ambiguous.', true))
      .mockImplementationOnce(async (_credentials, request) => batchResult(request.candidates));
    const harness = createHarness();
    expect(harness.hook.openScanner()).toBe(true);
    const requestId = harness.requestId();

    harness.dispatch(buildQrScannerScanMessage(requestId, 'scan-before-finish-recovery', receiptUrl(1)));
    await flushPromises();
    expect(mockAddQrScannerCandidates).toHaveBeenCalledTimes(2);

    harness.dispatch(buildQrScannerFinishMessage(requestId, 'legacy-finish-recovery'));
    await flushPromises();

    expect(mockAddQrScannerCandidates).toHaveBeenCalledTimes(3);
    expect(mockAddQrScannerCandidates.mock.calls[2][1]).toEqual(mockAddQrScannerCandidates.mock.calls[0][1]);
    expect(harness.callbacks.onCommitted).toHaveBeenCalledTimes(1);
    expect(harness.callbacks.onSessionEnd).toHaveBeenCalledWith('committed');
    const postedCalls = (harness.popup.postMessage as jest.Mock).mock.calls.map(([message], index) => ({
      message,
      order: (harness.popup.postMessage as jest.Mock).mock.invocationCallOrder[index]
    }));
    const recoveredCandidate = postedCalls.find(
      entry =>
        entry.message?.type === QR_SCANNER_MESSAGE_TYPES.candidate &&
        entry.message?.scanId === 'scan-before-finish-recovery' &&
        entry.message?.status === 'accepted'
    );
    const committedAck = postedCalls.find(
      entry => entry.message?.type === QR_SCANNER_MESSAGE_TYPES.commit && entry.message?.status === 'committed'
    );
    expect(recoveredCandidate).toBeDefined();
    expect(committedAck).toBeDefined();
    expect(recoveredCandidate!.order).toBeLessThan(committedAck!.order);
    expect(committedAck!.message).toEqual(
      expect.objectContaining({ linkedCount: 1, message: '1 receipt added.' })
    );
    expectNoTerminalSessionRpc();
  });

  test('coalesces a pending Drive identity and reuses the accepted outcome locally for later detections', async () => {
    mockRedeemQrScannerSession.mockResolvedValue(batchedRedeemedSession);
    mockAddQrScannerCandidates.mockImplementation(async (_credentials, request) => batchResult(request.candidates));
    const harness = createHarness();
    expect(harness.hook.openScanner()).toBe(true);
    const requestId = harness.requestId();

    harness.dispatch(buildQrScannerScanMessage(requestId, 'scan-a', receiptUrl(1)));
    harness.dispatch(buildQrScannerScanMessage(requestId, 'scan-a-alias', receiptUrl(1)));
    harness.dispatch(buildQrScannerScanMessage(requestId, 'scan-b', receiptUrl(2)));
    await flushPromises();

    expect(mockAddQrScannerCandidates).toHaveBeenCalledTimes(1);
    expect(mockAddQrScannerCandidates.mock.calls[0][1].candidates).toEqual([
      { scanId: 'scan-a', rawValue: receiptUrl(1) },
      { scanId: 'scan-b', rawValue: receiptUrl(2) }
    ]);
    const firstStatuses = (harness.popup.postMessage as jest.Mock).mock.calls
      .map(([message]) => message)
      .filter(message => message?.type === QR_SCANNER_MESSAGE_TYPES.candidate)
      .map(message => [message.scanId, message.status]);
    expect(firstStatuses).toEqual([
      ['scan-a', 'accepted'],
      ['scan-a-alias', 'duplicate'],
      ['scan-b', 'accepted']
    ]);
    expect(harness.callbacks.onCommitted).toHaveBeenCalledTimes(1);

    harness.dispatch(buildQrScannerScanMessage(requestId, 'scan-a-later', receiptUrl(1)));
    await flushPromises();

    expect(mockAddQrScannerCandidates).toHaveBeenCalledTimes(1);
    expect(harness.callbacks.onCommitted).toHaveBeenCalledTimes(1);
    expect(harness.popup.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ scanId: 'scan-a-later', status: 'duplicate', code: 'DUPLICATE_SESSION' }),
      'https://scanner.example.test'
    );
  });

  test('single-flights a matching Drive identity that arrives while its batch RPC is in flight', async () => {
    const pendingBatch = deferred<ReturnType<typeof batchResult>>();
    mockRedeemQrScannerSession.mockResolvedValue(batchedRedeemedSession);
    mockAddQrScannerCandidates.mockReturnValueOnce(pendingBatch.promise);
    const harness = createHarness();
    expect(harness.hook.openScanner()).toBe(true);
    const requestId = harness.requestId();

    harness.dispatch(buildQrScannerScanMessage(requestId, 'scan-leader', receiptUrl(1)));
    await flushPromises();
    expect(mockAddQrScannerCandidates).toHaveBeenCalledTimes(1);

    harness.dispatch(buildQrScannerScanMessage(requestId, 'scan-follower', receiptUrl(1)));
    await flushPromises();
    expect(mockAddQrScannerCandidates).toHaveBeenCalledTimes(1);

    pendingBatch.resolve(batchResult([{ scanId: 'scan-leader', rawValue: receiptUrl(1) }]));
    await flushPromises();

    const statuses = (harness.popup.postMessage as jest.Mock).mock.calls
      .map(([message]) => message)
      .filter(message => message?.type === QR_SCANNER_MESSAGE_TYPES.candidate)
      .map(message => [message.scanId, message.status]);
    expect(statuses).toEqual([
      ['scan-leader', 'accepted'],
      ['scan-follower', 'duplicate']
    ]);
    expect(harness.callbacks.onCommitted).toHaveBeenCalledTimes(1);
    expect(harness.callbacks.onPendingWorkChange.mock.calls.map(([count]) => count)).toEqual([1, 2, 1, 0]);
  });

  test('uses the short idle window to collect two scans into one later batch', async () => {
    mockRedeemQrScannerSession.mockResolvedValue(batchedRedeemedSession);
    mockAddQrScannerCandidates.mockImplementation(async (_credentials, request) => batchResult(request.candidates));
    const harness = createHarness();
    expect(harness.hook.openScanner()).toBe(true);
    const requestId = harness.requestId();

    harness.dispatch(buildQrScannerScanMessage(requestId, 'scan-initial', receiptUrl(1)));
    await flushPromises();
    expect(mockAddQrScannerCandidates).toHaveBeenCalledTimes(1);

    harness.dispatch(buildQrScannerScanMessage(requestId, 'scan-later-2', receiptUrl(2)));
    harness.dispatch(buildQrScannerScanMessage(requestId, 'scan-later-3', receiptUrl(3)));
    await flushPromises();
    expect(mockAddQrScannerCandidates).toHaveBeenCalledTimes(1);

    harness.runAllTimers();
    await flushPromises();
    expect(mockAddQrScannerCandidates).toHaveBeenCalledTimes(2);
    expect(mockAddQrScannerCandidates.mock.calls[1][1].candidates).toEqual([
      { scanId: 'scan-later-2', rawValue: receiptUrl(2) },
      { scanId: 'scan-later-3', rawValue: receiptUrl(3) }
    ]);
  });

  test('does not cache a retryable result and permits the same Drive identity in a later batch', async () => {
    mockRedeemQrScannerSession.mockResolvedValue(batchedRedeemedSession);
    const retryableResult = {
      results: [
        {
          candidate: {
            id: 'candidate-retryable',
            status: 'RETRYABLE_ERROR' as const,
            code: 'TEMPORARY_ERROR',
            retryable: true
          }
        }
      ],
      session: batchedRedeemedSession.session,
      transport: 'batch' as const
    };
    mockAddQrScannerCandidates
      .mockResolvedValueOnce(retryableResult)
      .mockImplementationOnce(async (_credentials, request) => batchResult(request.candidates));
    const harness = createHarness();
    expect(harness.hook.openScanner()).toBe(true);
    const requestId = harness.requestId();

    harness.dispatch(buildQrScannerScanMessage(requestId, 'scan-retryable', receiptUrl(1)));
    await flushPromises();
    expect(mockAddQrScannerCandidates).toHaveBeenCalledTimes(1);

    harness.dispatch(buildQrScannerScanMessage(requestId, 'scan-retryable-later', receiptUrl(1)));
    harness.runAllTimers();
    await flushPromises();

    expect(mockAddQrScannerCandidates).toHaveBeenCalledTimes(2);
    expect(mockAddQrScannerCandidates.mock.calls[1][1].requestId).not.toBe(
      mockAddQrScannerCandidates.mock.calls[0][1].requestId
    );
    expect(harness.callbacks.onCommitted).toHaveBeenCalledTimes(1);
  });

  test('does not replay a mixed batch solely because one item is retryable', async () => {
    mockRedeemQrScannerSession.mockResolvedValue(batchedRedeemedSession);
    mockAddQrScannerCandidates.mockResolvedValueOnce({
      results: [
        { candidate: candidateResult('scan-accepted', 1).candidate },
        {
          candidate: {
            id: 'candidate-retryable',
            status: 'RETRYABLE_ERROR',
            code: 'TEMPORARY_ERROR',
            retryable: true
          }
        }
      ],
      session: batchedRedeemedSession.session,
      committed: batchResult([{ scanId: 'scan-accepted', rawValue: receiptUrl(1) }]).committed,
      transport: 'batch'
    });
    const harness = createHarness();
    expect(harness.hook.openScanner()).toBe(true);
    const requestId = harness.requestId();

    harness.dispatch(buildQrScannerScanMessage(requestId, 'scan-accepted', receiptUrl(1)));
    harness.dispatch(buildQrScannerScanMessage(requestId, 'scan-retryable', receiptUrl(2)));
    await flushPromises();

    expect(mockAddQrScannerCandidates).toHaveBeenCalledTimes(1);
    expect(harness.callbacks.onCommitted).toHaveBeenCalledTimes(1);
    expect(harness.callbacks.onCandidateOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ scanId: 'scan-retryable', status: 'error', code: 'TEMPORARY_ERROR' })
    );
  });

  test('reuses a permanent rejection locally without another server request', async () => {
    mockRedeemQrScannerSession.mockResolvedValue(batchedRedeemedSession);
    mockAddQrScannerCandidates.mockResolvedValue({
      results: [
        {
          candidate: {
            id: 'candidate-rejected',
            status: 'REJECTED',
            code: 'UNSUPPORTED_TYPE',
            fileId: '1AbCdEfGhIjKlMnOpQrStUvWxY1'
          }
        }
      ],
      session: batchedRedeemedSession.session,
      transport: 'batch'
    });
    const harness = createHarness();
    expect(harness.hook.openScanner()).toBe(true);
    const requestId = harness.requestId();

    harness.dispatch(buildQrScannerScanMessage(requestId, 'scan-rejected', receiptUrl(1)));
    await flushPromises();
    harness.dispatch(buildQrScannerScanMessage(requestId, 'scan-rejected-later', receiptUrl(1)));
    await flushPromises();

    expect(mockAddQrScannerCandidates).toHaveBeenCalledTimes(1);
    expect(harness.popup.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ scanId: 'scan-rejected-later', status: 'rejected', code: 'UNSUPPORTED_TYPE' }),
      'https://scanner.example.test'
    );
    expect(harness.callbacks.onCommitted).not.toHaveBeenCalled();
  });

  test('splits a five-scan backlog into stable ordered batches of three and two', async () => {
    mockRedeemQrScannerSession.mockResolvedValue(batchedRedeemedSession);
    mockAddQrScannerCandidates.mockImplementation(async (_credentials, request) => batchResult(request.candidates));
    const harness = createHarness();
    expect(harness.hook.openScanner()).toBe(true);
    const requestId = harness.requestId();

    [1, 2, 3, 4, 5].forEach(index => {
      harness.dispatch(buildQrScannerScanMessage(requestId, `scan-${index}`, receiptUrl(index)));
    });
    await flushPromises();

    expect(mockAddQrScannerCandidates).toHaveBeenCalledTimes(2);
    expect(mockAddQrScannerCandidates.mock.calls.map(call => call[1].candidates.map((entry: any) => entry.scanId))).toEqual([
      ['scan-1', 'scan-2', 'scan-3'],
      ['scan-4', 'scan-5']
    ]);
    expect(mockAddQrScannerCandidates.mock.calls[0][1].requestId).not.toBe(
      mockAddQrScannerCandidates.mock.calls[1][1].requestId
    );
    expect(harness.callbacks.onCommitted).toHaveBeenCalledTimes(2);
  });

  test('fails the batch safely when the ordered server result count does not match', async () => {
    mockRedeemQrScannerSession.mockResolvedValue(batchedRedeemedSession);
    mockAddQrScannerCandidates.mockResolvedValue({
      results: [],
      session: batchedRedeemedSession.session,
      transport: 'batch'
    });
    const harness = createHarness();
    expect(harness.hook.openScanner()).toBe(true);

    harness.dispatch(buildQrScannerScanMessage(harness.requestId(), 'scan-missing', receiptUrl(1)));
    await flushPromises();

    expect(harness.callbacks.onCommitted).not.toHaveBeenCalled();
    expect(harness.callbacks.onCandidateOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ scanId: 'scan-missing', status: 'error', code: 'INTERNAL_ERROR' })
    );
    expect(harness.callbacks.onPendingWorkChange.mock.calls.map(([count]) => count)).toEqual([1, 0]);
  });

  test('does not prepare a session when the popup is blocked', async () => {
    const prepareSession = jest.fn(async () => successfulLaunch);
    const harness = createHarness({
      args: { prepareSession },
      open: () => null
    });

    expect(harness.hook.openScanner()).toBe(false);
    await flushPromises();

    expect(prepareSession).not.toHaveBeenCalled();
    expect(mockRedeemQrScannerSession).not.toHaveBeenCalled();
    expect(mockAddQrScannerCandidate).not.toHaveBeenCalled();
    expect(harness.callbacks.onUnavailable).toHaveBeenCalledWith(
      'Could not open the scanner window. Allow popups and try again.'
    );
    expectNoTerminalSessionRpc();
  });

  test('rebinds only to a peer with the expected origin and request ID', async () => {
    const harness = createHarness();
    expect(harness.hook.openScanner()).toBe(true);
    const requestId = harness.requestId();
    const replacementPopup = {
      closed: false,
      postMessage: jest.fn()
    } as unknown as Window;

    harness.dispatch(buildQrScannerReadyMessage(requestId), {
      source: replacementPopup,
      origin: 'https://evil.example.test'
    });
    harness.dispatch(buildQrScannerReadyMessage('wrong-request'), {
      source: replacementPopup,
      origin: 'https://scanner.example.test'
    });
    harness.dispatch(buildQrScannerReadyMessage(requestId), {
      source: null,
      origin: 'https://scanner.example.test'
    });
    expect(replacementPopup.postMessage).not.toHaveBeenCalled();
    expect(harness.callbacks.onDiagnostic).not.toHaveBeenCalledWith(
      'upload.linkCapture.externalScanner.peerRebound',
      expect.anything()
    );
    expect(harness.prepareSession).not.toHaveBeenCalled();

    harness.dispatch(buildQrScannerReadyMessage(requestId), {
      source: replacementPopup,
      origin: 'https://scanner.example.test'
    });
    await flushPromises();

    expect(replacementPopup.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: QR_SCANNER_MESSAGE_TYPES.setup,
        requestId
      }),
      'https://scanner.example.test'
    );
    expect(harness.callbacks.onDiagnostic).toHaveBeenCalledWith(
      'upload.linkCapture.externalScanner.peerRebound',
      { fieldPath: 'ING_EVD', messageType: QR_SCANNER_MESSAGE_TYPES.ready }
    );
    expect(harness.prepareSession).not.toHaveBeenCalled();

    harness.dispatch(buildQrScannerScanMessage(requestId, 'scan-rebound', 'receipt-rebound'), {
      source: replacementPopup,
      origin: 'https://scanner.example.test'
    });
    await flushPromises();

    expect(mockAddQrScannerCandidate).toHaveBeenCalledTimes(1);
    expect(mockAddQrScannerCandidate).toHaveBeenCalledWith(redeemedSession.credentials, {
      scanId: 'scan-rebound',
      rawValue: 'receipt-rebound'
    });
    expect(replacementPopup.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: QR_SCANNER_MESSAGE_TYPES.candidate,
        scanId: 'scan-rebound',
        status: 'accepted'
      }),
      'https://scanner.example.test'
    );
    expectNoTerminalSessionRpc();
  });
});
