let mockEffectCleanup: (() => void) | undefined;
let mockRefValues: Array<{ current: unknown }> = [];
let mockRefIndex = 0;
const mockRedeemQrScannerSession = jest.fn();
const mockAddQrScannerCandidate = jest.fn();
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
    commitQrScannerSession: (...args: unknown[]) => mockCommitQrScannerSession(...args),
    cancelQrScannerSession: (...args: unknown[]) => mockCancelQrScannerSession(...args),
    getQrScannerSession: (...args: unknown[]) => mockGetQrScannerSession(...args)
  };
});

import {
  buildQrScannerCancelMessage,
  buildQrScannerClosedMessage,
  buildQrScannerFinishMessage,
  buildQrScannerScanMessage,
  QR_SCANNER_MESSAGE_TYPES
} from '../../../src/web/qrScanner/openerProtocol';
import { useExternalQrScannerSession } from '../../../src/web/react/features/uploads/hooks/useExternalQrScannerSession';

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
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
    status: 'ACTIVE'
  }
};

const candidateResult = (id: string) => ({
  candidate: {
    id: `candidate-${id}`,
    status: 'AUTHORISED' as const,
    code: 'ACCEPTED',
    fileId: `1AbCdEfGhIjKlMnOpQrStUvWxY${id}`,
    canonicalUrl: `https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxY${id}/view`,
    displayName: `Receipt ${id}.jpg`
  },
  session: redeemedSession.session
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
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
};

type HookArgs = Parameters<typeof useExternalQrScannerSession>[0];

const createHarness = (options?: {
  args?: Partial<HookArgs>;
  open?: (url: string, target: string, features: string) => Window | null;
}) => {
  const eventListeners = new Map<string, Set<(event: any) => void>>();
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
    setTimeout: jest.fn(() => 101),
    clearTimeout: jest.fn(),
    setInterval: jest.fn(() => 202),
    clearInterval: jest.fn()
  };
  Object.defineProperty(globalThis, 'window', { configurable: true, value: fakeWindow });

  const prepareSession = options?.args?.prepareSession || jest.fn(async () => successfulLaunch);
  const callbacks = {
    onSessionReady: jest.fn(),
    onSessionEnd: jest.fn(),
    onCommitted: jest.fn(),
    onUnavailable: jest.fn(),
    onDiagnostic: jest.fn()
  };
  const baseArgs: HookArgs = {
    assetBaseUrl: 'https://scanner.example.test',
    enabled: true,
    fieldId: 'ING_EVD',
    fieldPath: 'ING_EVD',
    instruction: 'Configured instruction',
    hideCloseOnIos: true,
    prepareSession,
    ...callbacks,
    ...options?.args
  };
  const render = (updates?: Partial<HookArgs>) => {
    mockRefIndex = 0;
    return useExternalQrScannerSession({ ...baseArgs, ...updates });
  };
  const hook = render();

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
  const dispatchWindowEvent = (type: 'focus' | 'pageshow'): void => {
    eventListeners.get(type)?.forEach(listener => listener({ type }));
  };

  return { hook, popup, openMock, prepareSession, callbacks, requestId, dispatch, dispatchWindowEvent, render };
};

describe('external QR scanner session hook', () => {
  let requestSequence = 0;

  beforeEach(() => {
    requestSequence = 0;
    mockEffectCleanup = undefined;
    mockRefValues = [];
    mockRefIndex = 0;
    mockRedeemQrScannerSession.mockReset().mockResolvedValue(redeemedSession);
    mockAddQrScannerCandidate.mockReset().mockImplementation((_credentials, request) =>
      Promise.resolve(candidateResult(request.scanId))
    );
    mockCommitQrScannerSession.mockReset().mockResolvedValue({
      status: 'COMPLETED',
      result: {
        linkedCount: 2,
        skippedCount: 0,
        recordId: 'record-1',
        dataVersion: 8,
        fieldValue: 'https://drive.google.com/file/d/file-1/view, https://drive.google.com/file/d/file-2/view',
        links: [
          'https://drive.google.com/file/d/file-1/view',
          'https://drive.google.com/file/d/file-2/view'
        ],
        summaryCode: 'COMMITTED'
      },
      session: { ...redeemedSession.session, status: 'COMPLETED' }
    });
    mockCancelQrScannerSession.mockReset().mockResolvedValue({
      status: 'CANCELLED',
      session: { ...redeemedSession.session, status: 'CANCELLED' }
    });
    mockGetQrScannerSession.mockReset().mockResolvedValue({ session: redeemedSession.session });
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
    if (originalCrypto) Object.defineProperty(globalThis, 'crypto', originalCrypto);
    else Reflect.deleteProperty(globalThis, 'crypto');
  });

  test('opens the popup synchronously before session preparation starts', async () => {
    const order: string[] = [];
    const prepareSession = jest.fn(async () => {
      order.push('prepare');
      return successfulLaunch;
    });
    const harness = createHarness({
      args: { prepareSession },
      open: () => {
        order.push('open');
        return { closed: false, postMessage: jest.fn() } as unknown as Window;
      }
    });

    expect(harness.hook.available).toBe(true);
    expect(prepareSession).not.toHaveBeenCalled();
    expect(harness.hook.openScanner()).toBe(true);
    expect(order).toEqual(['open']);

    await flushPromises();
    expect(order).toEqual(['open', 'prepare']);
  });

  test('rebinds to a replacement scanner peer only after matching origin and request', async () => {
    const harness = createHarness();
    expect(harness.hook.openScanner()).toBe(true);
    await flushPromises();
    const requestId = harness.requestId();
    const validScan = buildQrScannerScanMessage(requestId, 'scan-valid', 'https://drive.google.com/file/d/file-valid/view');
    const replacementPopup = {
      closed: false,
      postMessage: jest.fn()
    } as unknown as Window;

    harness.dispatch(validScan, {
      source: replacementPopup,
      origin: 'https://evil.example.test'
    });
    harness.dispatch(buildQrScannerScanMessage('wrong-request', 'scan-wrong', 'value'), {
      source: replacementPopup,
      origin: 'https://scanner.example.test'
    });
    expect(mockAddQrScannerCandidate).not.toHaveBeenCalled();
    expect(replacementPopup.postMessage).not.toHaveBeenCalled();

    harness.dispatch(validScan, {
      source: replacementPopup,
      origin: 'https://scanner.example.test'
    });
    await flushPromises();
    expect(mockAddQrScannerCandidate).toHaveBeenCalledTimes(1);
    expect(mockAddQrScannerCandidate).toHaveBeenCalledWith(redeemedSession.credentials, {
      scanId: 'scan-valid',
      rawValue: 'https://drive.google.com/file/d/file-valid/view'
    });
    expect(replacementPopup.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: QR_SCANNER_MESSAGE_TYPES.candidate,
        scanId: 'scan-valid',
        status: 'accepted'
      }),
      'https://scanner.example.test'
    );

    harness.dispatch(buildQrScannerFinishMessage(requestId, 'replacement-commit-request'), {
      source: replacementPopup,
      origin: 'https://scanner.example.test'
    });
    await flushPromises();

    expect(mockCommitQrScannerSession).toHaveBeenCalledTimes(1);
    expect(mockCommitQrScannerSession).toHaveBeenCalledWith(
      redeemedSession.credentials,
      'replacement-commit-request'
    );
    expect(replacementPopup.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: QR_SCANNER_MESSAGE_TYPES.commit,
        status: 'committed'
      }),
      'https://scanner.example.test'
    );
  });

  test('queues early scans until the session is ready and checks candidates sequentially', async () => {
    const launchDeferred = deferred<typeof successfulLaunch>();
    const firstCandidate = deferred<ReturnType<typeof candidateResult>>();
    mockAddQrScannerCandidate
      .mockReset()
      .mockImplementationOnce(() => firstCandidate.promise)
      .mockImplementationOnce((_credentials, request) => Promise.resolve(candidateResult(request.scanId)));
    const harness = createHarness({
      args: { prepareSession: jest.fn(() => launchDeferred.promise) }
    });
    expect(harness.hook.openScanner()).toBe(true);
    const requestId = harness.requestId();

    harness.dispatch(buildQrScannerScanMessage(requestId, 'scan-1', 'value-1'));
    harness.dispatch(buildQrScannerScanMessage(requestId, 'scan-2', 'value-2'));
    await flushPromises();
    expect(mockAddQrScannerCandidate).not.toHaveBeenCalled();

    launchDeferred.resolve(successfulLaunch);
    await flushPromises();
    expect(mockAddQrScannerCandidate).toHaveBeenCalledTimes(1);
    expect(mockAddQrScannerCandidate.mock.calls[0][1]).toEqual({ scanId: 'scan-1', rawValue: 'value-1' });

    firstCandidate.resolve(candidateResult('scan-1'));
    await flushPromises();
    expect(mockAddQrScannerCandidate).toHaveBeenCalledTimes(2);
    expect(mockAddQrScannerCandidate.mock.calls[1][1]).toEqual({ scanId: 'scan-2', rawValue: 'value-2' });
  });

  test('does not treat a mobile WindowProxy closed flag as a terminal scanner close', async () => {
    const candidateDeferred = deferred<ReturnType<typeof candidateResult>>();
    mockAddQrScannerCandidate.mockReset().mockImplementationOnce(() => candidateDeferred.promise);
    const harness = createHarness();
    expect(harness.hook.openScanner()).toBe(true);
    await flushPromises();

    harness.dispatch(
      buildQrScannerScanMessage(harness.requestId(), 'scan-mobile', 'https://drive.google.com/file/d/file-mobile/view')
    );
    await flushPromises();
    (harness.popup as unknown as { closed: boolean }).closed = true;
    candidateDeferred.resolve(candidateResult('scan-mobile'));
    await flushPromises();

    expect(harness.popup.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: QR_SCANNER_MESSAGE_TYPES.candidate,
        scanId: 'scan-mobile',
        status: 'accepted'
      }),
      'https://scanner.example.test'
    );
    harness.dispatch(buildQrScannerFinishMessage(harness.requestId(), 'mobile-commit-request'));
    await flushPromises();

    expect(mockCommitQrScannerSession).toHaveBeenCalledWith(redeemedSession.credentials, 'mobile-commit-request');
    expect(mockCancelQrScannerSession).not.toHaveBeenCalled();
    expect(harness.callbacks.onSessionEnd).toHaveBeenCalledWith('committed');
  });

  test('commits Finish once and applies the authoritative field update', async () => {
    const harness = createHarness();
    expect(harness.hook.openScanner()).toBe(true);
    await flushPromises();
    harness.render({ fieldId: 'OTHER_FIELD', fieldPath: 'OTHER_FIELD' });
    const finish = buildQrScannerFinishMessage(harness.requestId(), 'commit-request-1');

    harness.dispatch(finish);
    harness.dispatch(finish);
    await flushPromises();

    expect(mockCommitQrScannerSession).toHaveBeenCalledTimes(1);
    expect(mockCommitQrScannerSession).toHaveBeenCalledWith(redeemedSession.credentials, 'commit-request-1');
    expect(harness.callbacks.onCommitted).toHaveBeenCalledTimes(1);
    expect(harness.callbacks.onCommitted).toHaveBeenCalledWith({
      fieldId: 'ING_EVD',
      fieldPath: 'ING_EVD',
      recordId: 'record-1',
      fieldValue: 'https://drive.google.com/file/d/file-1/view, https://drive.google.com/file/d/file-2/view',
      links: [
        'https://drive.google.com/file/d/file-1/view',
        'https://drive.google.com/file/d/file-2/view'
      ],
      linkedCount: 2,
      dataVersion: 8
    });
    expect(harness.callbacks.onSessionEnd).toHaveBeenCalledWith('committed');
    expect(mockCancelQrScannerSession).not.toHaveBeenCalled();
  });

  test('acknowledges duplicate Finish while the commit RPC remains pending without committing twice', async () => {
    const commitDeferred = deferred<{
      status: 'COMPLETED';
      result: {
        linkedCount: number;
        skippedCount: number;
        recordId: string;
        dataVersion: number;
        fieldValue: string;
        links: string[];
        summaryCode: 'COMMITTED';
      };
      session: typeof redeemedSession.session;
    }>();
    mockCommitQrScannerSession.mockReset().mockReturnValueOnce(commitDeferred.promise);
    const harness = createHarness();
    expect(harness.hook.openScanner()).toBe(true);
    await flushPromises();
    const finish = buildQrScannerFinishMessage(harness.requestId(), 'pending-commit-request');

    harness.dispatch(finish);
    await flushPromises();
    expect(mockCommitQrScannerSession).toHaveBeenCalledTimes(1);

    harness.dispatch(finish);
    await flushPromises();

    expect(mockCommitQrScannerSession).toHaveBeenCalledTimes(1);
    expect(mockCommitQrScannerSession).toHaveBeenCalledWith(
      redeemedSession.credentials,
      'pending-commit-request'
    );
    const committingMessages = (harness.popup.postMessage as jest.Mock).mock.calls.filter(
      ([message]) =>
        message?.type === QR_SCANNER_MESSAGE_TYPES.commit &&
        message?.status === 'committing'
    );
    expect(committingMessages).toHaveLength(2);

    commitDeferred.resolve({
      status: 'COMPLETED',
      result: {
        linkedCount: 1,
        skippedCount: 0,
        recordId: 'record-1',
        dataVersion: 8,
        fieldValue: 'https://drive.google.com/file/d/file-1/view',
        links: ['https://drive.google.com/file/d/file-1/view'],
        summaryCode: 'COMMITTED'
      },
      session: { ...redeemedSession.session, status: 'COMPLETED' }
    });
    await flushPromises();

    expect(harness.callbacks.onSessionEnd).toHaveBeenCalledWith('committed');
  });

  test('replays the committed response to repeated Finish during terminal grace without another mutation', async () => {
    const harness = createHarness();
    expect(harness.hook.openScanner()).toBe(true);
    await flushPromises();
    const finish = buildQrScannerFinishMessage(harness.requestId(), 'terminal-commit-request');

    harness.dispatch(finish);
    await flushPromises();
    harness.dispatch(finish);
    await flushPromises();

    expect(mockCommitQrScannerSession).toHaveBeenCalledTimes(1);
    expect(mockCancelQrScannerSession).not.toHaveBeenCalled();
    expect(harness.callbacks.onCommitted).toHaveBeenCalledTimes(1);
    expect(harness.callbacks.onSessionEnd).toHaveBeenCalledTimes(1);
    expect(harness.callbacks.onSessionEnd).toHaveBeenCalledWith('committed');
    const committedMessages = (harness.popup.postMessage as jest.Mock).mock.calls.filter(
      ([message]) =>
        message?.type === QR_SCANNER_MESSAGE_TYPES.commit &&
        message?.status === 'committed'
    );
    expect(committedMessages).toHaveLength(2);
  });

  test('reconciles a completed session on focus into the immutable launch field', async () => {
    const commitResult = {
      linkedCount: 1,
      skippedCount: 0,
      recordId: 'record-1',
      dataVersion: 9,
      fieldValue: 'https://drive.google.com/file/d/file-3/view',
      links: ['https://drive.google.com/file/d/file-3/view'],
      summaryCode: 'COMMITTED' as const
    };
    mockGetQrScannerSession.mockResolvedValue({
      session: { ...redeemedSession.session, status: 'COMPLETED', commitResult }
    });
    const harness = createHarness();
    expect(harness.hook.openScanner()).toBe(true);
    await flushPromises();
    harness.render({ fieldId: 'OTHER_FIELD', fieldPath: 'OTHER_FIELD' });

    harness.dispatchWindowEvent('focus');
    await flushPromises();

    expect(mockGetQrScannerSession).toHaveBeenCalledWith(redeemedSession.credentials);
    expect(harness.callbacks.onCommitted).toHaveBeenCalledWith({
      fieldId: 'ING_EVD',
      fieldPath: 'ING_EVD',
      recordId: 'record-1',
      dataVersion: 9,
      fieldValue: 'https://drive.google.com/file/d/file-3/view',
      links: ['https://drive.google.com/file/d/file-3/view'],
      linkedCount: 1
    });
    expect(harness.callbacks.onSessionEnd).toHaveBeenCalledWith('committed');
  });

  test('reconciles a cancelled session on pageshow without cancelling it again', async () => {
    mockGetQrScannerSession.mockResolvedValue({
      session: { ...redeemedSession.session, status: 'CANCELLED' }
    });
    const harness = createHarness();
    expect(harness.hook.openScanner()).toBe(true);
    await flushPromises();

    harness.dispatchWindowEvent('pageshow');
    await flushPromises();

    expect(harness.callbacks.onSessionEnd).toHaveBeenCalledWith('cancelled');
    expect(mockCancelQrScannerSession).not.toHaveBeenCalled();
    expect(harness.callbacks.onCommitted).not.toHaveBeenCalled();
  });

  test('ends an expired session when resume reconciliation reports expiry', async () => {
    const { QrScannerSessionError } = jest.requireActual(
      '../../../src/web/react/features/uploads/services/qrScannerSessionClient'
    ) as typeof import('../../../src/web/react/features/uploads/services/qrScannerSessionClient');
    mockGetQrScannerSession.mockRejectedValue(
      new QrScannerSessionError('SESSION_EXPIRED', 'This scan session expired.', false)
    );
    const harness = createHarness();
    expect(harness.hook.openScanner()).toBe(true);
    await flushPromises();

    harness.dispatchWindowEvent('focus');
    await flushPromises();

    expect(harness.callbacks.onSessionEnd).toHaveBeenCalledWith('failed');
    expect(harness.callbacks.onCommitted).not.toHaveBeenCalled();
    expect(harness.popup.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: QR_SCANNER_MESSAGE_TYPES.error,
        code: 'SESSION_EXPIRED',
        retryable: false
      }),
      'https://scanner.example.test'
    );
  });

  test('recovers a lost commit response from the completed session snapshot', async () => {
    const { QrScannerSessionError } = jest.requireActual(
      '../../../src/web/react/features/uploads/services/qrScannerSessionClient'
    ) as typeof import('../../../src/web/react/features/uploads/services/qrScannerSessionClient');
    mockCommitQrScannerSession.mockRejectedValueOnce(
      new QrScannerSessionError('TEMPORARY_ERROR', 'The commit response was lost.', true)
    );
    mockGetQrScannerSession.mockResolvedValue({
      session: {
        ...redeemedSession.session,
        status: 'COMPLETED',
        commitResult: {
          linkedCount: 1,
          skippedCount: 0,
          recordId: 'record-1',
          dataVersion: 10,
          fieldValue: 'https://drive.google.com/file/d/file-recovered/view',
          links: ['https://drive.google.com/file/d/file-recovered/view'],
          summaryCode: 'COMMITTED'
        }
      }
    });
    const harness = createHarness();
    expect(harness.hook.openScanner()).toBe(true);
    await flushPromises();

    harness.dispatch(buildQrScannerFinishMessage(harness.requestId(), 'stable-commit-request'));
    await flushPromises();

    expect(mockGetQrScannerSession).toHaveBeenCalledWith(redeemedSession.credentials);
    expect(harness.callbacks.onCommitted).toHaveBeenCalledWith(
      expect.objectContaining({
        fieldId: 'ING_EVD',
        fieldPath: 'ING_EVD',
        dataVersion: 10,
        linkedCount: 1
      })
    );
    expect(harness.callbacks.onSessionEnd).toHaveBeenCalledWith('committed');
  });

  test('reissues the same commit request when the original response remains pending on resume', async () => {
    const pendingCommit = deferred<never>();
    mockCommitQrScannerSession.mockImplementationOnce(() => pendingCommit.promise);
    mockGetQrScannerSession.mockResolvedValue({
      session: { ...redeemedSession.session, status: 'COMMITTING' }
    });
    const harness = createHarness();
    expect(harness.hook.openScanner()).toBe(true);
    await flushPromises();

    harness.dispatch(buildQrScannerFinishMessage(harness.requestId(), 'stable-commit-request'));
    await flushPromises();
    expect(mockCommitQrScannerSession).toHaveBeenCalledTimes(1);

    harness.dispatchWindowEvent('focus');
    await flushPromises();

    expect(mockCommitQrScannerSession).toHaveBeenCalledTimes(2);
    expect(mockCommitQrScannerSession.mock.calls.map(call => call[1])).toEqual([
      'stable-commit-request',
      'stable-commit-request'
    ]);
    expect(harness.callbacks.onSessionEnd).toHaveBeenCalledWith('committed');
  });

  test('reuses the first commit request ID after an uncertain failure', async () => {
    const { QrScannerSessionError } = jest.requireActual(
      '../../../src/web/react/features/uploads/services/qrScannerSessionClient'
    ) as typeof import('../../../src/web/react/features/uploads/services/qrScannerSessionClient');
    mockCommitQrScannerSession.mockRejectedValueOnce(
      new QrScannerSessionError('TEMPORARY_ERROR', 'The commit response was lost.', true)
    );
    const harness = createHarness();
    expect(harness.hook.openScanner()).toBe(true);
    await flushPromises();

    harness.dispatch(buildQrScannerFinishMessage(harness.requestId(), 'first-commit-request'));
    await flushPromises();
    harness.dispatch(buildQrScannerFinishMessage(harness.requestId(), 'replacement-commit-request'));
    await flushPromises();

    expect(mockCommitQrScannerSession).toHaveBeenCalledTimes(2);
    expect(mockCommitQrScannerSession.mock.calls.map(call => call[1])).toEqual([
      'first-commit-request',
      'first-commit-request'
    ]);
    expect(harness.callbacks.onSessionEnd).toHaveBeenCalledWith('committed');
  });

  test('ends a one-shot preparation failure and tells the scanner to restart from the form', async () => {
    const prepareSession = jest.fn(async () => ({
      success: false as const,
      code: 'SERVICE_UNAVAILABLE' as const,
      message: 'Scanner setup is temporarily unavailable.',
      retryable: true
    }));
    const harness = createHarness({ args: { prepareSession } });
    expect(harness.hook.openScanner()).toBe(true);
    await flushPromises();

    expect(mockRedeemQrScannerSession).not.toHaveBeenCalled();
    expect(harness.popup.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: QR_SCANNER_MESSAGE_TYPES.error,
        code: 'SERVICE_UNAVAILABLE',
        retryable: false,
        message: expect.stringContaining('start again from the form')
      }),
      'https://scanner.example.test'
    );
    harness.dispatchWindowEvent('focus');
    await flushPromises();
    expect(mockGetQrScannerSession).not.toHaveBeenCalled();
  });

  test.each([
    ['cancelled', (requestId: string) => buildQrScannerCancelMessage(requestId)],
    ['closed', (requestId: string) => buildQrScannerClosedMessage(requestId)]
  ] as const)('%s exits cancel the prepared session without committing', async (reason, message) => {
    const harness = createHarness();
    expect(harness.hook.openScanner()).toBe(true);
    await flushPromises();

    harness.dispatch(message(harness.requestId()));
    await flushPromises();

    expect(mockCommitQrScannerSession).not.toHaveBeenCalled();
    expect(mockCancelQrScannerSession).toHaveBeenCalledTimes(1);
    expect(mockCancelQrScannerSession).toHaveBeenCalledWith(redeemedSession.credentials);
    expect(harness.callbacks.onSessionEnd).toHaveBeenCalledWith(reason);
    expect(harness.callbacks.onCommitted).not.toHaveBeenCalled();
  });

  test('cancels once when the scanner closes before preparation finishes', async () => {
    const launchDeferred = deferred<typeof successfulLaunch>();
    const harness = createHarness({
      args: { prepareSession: jest.fn(() => launchDeferred.promise) }
    });
    expect(harness.hook.openScanner()).toBe(true);
    harness.dispatch(buildQrScannerClosedMessage(harness.requestId()));

    launchDeferred.resolve(successfulLaunch);
    await flushPromises();

    expect(mockCancelQrScannerSession).toHaveBeenCalledTimes(1);
    expect(mockCancelQrScannerSession).toHaveBeenCalledWith(redeemedSession.credentials);
    expect(mockCommitQrScannerSession).not.toHaveBeenCalled();
  });

  test('does not prepare a session when the browser blocks the popup', async () => {
    const prepareSession = jest.fn(async () => successfulLaunch);
    const harness = createHarness({
      args: { prepareSession },
      open: () => null
    });

    expect(harness.hook.openScanner()).toBe(false);
    await flushPromises();

    expect(prepareSession).not.toHaveBeenCalled();
    expect(mockRedeemQrScannerSession).not.toHaveBeenCalled();
    expect(harness.callbacks.onUnavailable).toHaveBeenCalledWith(
      'Could not open the scanner window. Allow popups and try again.'
    );
  });
});
