const mockScannerHook = jest.fn((_args: unknown) => ({ available: true, openScanner: jest.fn() }));
const mockScannerPendingStateSetter = jest.fn();

jest.mock('react', () => {
  const actual = jest.requireActual('react') as typeof import('react');
  const useRef = (value: unknown) => ({ current: value });
  const useState = (value: unknown) => [value, mockScannerPendingStateSetter];
  return {
    ...actual,
    useRef,
    useState,
    default: { ...actual, useRef, useState }
  };
});

jest.mock('../../../src/web/react/features/uploads/hooks/useExternalQrScannerSession', () => ({
  useExternalQrScannerSession: (args: unknown) => mockScannerHook(args)
}));

const { FormFileOverlay } = require('../../../src/web/react/features/uploads/components/FormFileOverlay') as {
  FormFileOverlay: typeof import('../../../src/web/react/features/uploads/components/FormFileOverlay').FormFileOverlay;
};

describe('FormFileOverlay QR scanner capability and pending work', () => {
  beforeEach(() => {
    mockScannerHook.mockClear();
    mockScannerPendingStateSetter.mockClear();
  });

  const makeOverlay = (fieldId = 'ING_EVD') => ({
    open: true,
    scope: 'top' as const,
    question: {
      id: fieldId,
      type: 'FILE_UPLOAD',
      readOnly: true,
      uploadConfig: { linkCapture: { enabled: true } }
    },
    saving: true
  });

  test('keeps scanner capability available while the overlay is temporarily locked', () => {
    FormFileOverlay({
      fileOverlay: makeOverlay(),
      setFileOverlay: jest.fn(),
      language: 'EN',
      submitting: true,
      prepareQrScannerLaunch: jest.fn()
    } as any);

    expect(mockScannerHook).toHaveBeenCalledWith(
      expect.objectContaining({
        enabled: true,
        fieldId: 'ING_EVD',
        fieldPath: 'ING_EVD'
      })
    );
  });

  test('locks only the matching field until its pending scan count reaches zero', () => {
    const setFileOverlay = jest.fn();
    FormFileOverlay({
      fileOverlay: makeOverlay(),
      setFileOverlay,
      language: 'EN',
      submitting: false,
      prepareQrScannerLaunch: jest.fn()
    } as any);

    const scannerArgs = mockScannerHook.mock.calls[0][0] as {
      onPendingWorkChange: (pendingCount: number) => void;
    };
    scannerArgs.onPendingWorkChange(2);

    const addPending = mockScannerPendingStateSetter.mock.calls[0][0] as (
      previous: Record<string, number>
    ) => Record<string, number>;
    expect(addPending({})).toEqual({ ING_EVD: 2 });

    const lockMatchingOverlay = setFileOverlay.mock.calls[0][0] as (previous: any) => any;
    expect(lockMatchingOverlay(makeOverlay())).toEqual(expect.objectContaining({ saving: true }));
    const otherOverlay = makeOverlay('OTHER_FIELD');
    expect(lockMatchingOverlay(otherOverlay)).toBe(otherOverlay);

    scannerArgs.onPendingWorkChange(0);
    const clearPending = mockScannerPendingStateSetter.mock.calls[1][0] as (
      previous: Record<string, number>
    ) => Record<string, number>;
    expect(clearPending({ ING_EVD: 2 })).toEqual({});

    const unlockMatchingOverlay = setFileOverlay.mock.calls[1][0] as (previous: any) => any;
    expect(unlockMatchingOverlay(makeOverlay())).toEqual(expect.objectContaining({ saving: false }));
  });
});
