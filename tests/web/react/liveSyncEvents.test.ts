import {
  consumeGuidedStepUtilisationAvailabilityEvents,
  forgetGuidedStepUtilisationAvailabilityEvent,
  markGuidedStepUtilisationAvailabilityEventHandled,
  scheduleGuidedStepUtilisationAvailabilityEvent
} from '../../../src/web/react/features/utilisations/liveSyncEvents';

const installWindowMock = () => {
  const previousWindow = (global as any).window;
  const previousCustomEvent = (global as any).CustomEvent;
  const dispatchEvent = jest.fn(() => true);
  (global as any).CustomEvent = class CustomEventMock<T> {
    type: string;
    detail: T;

    constructor(type: string, init?: { detail?: T }) {
      this.type = type;
      this.detail = init?.detail as T;
    }
  };
  (global as any).window = {
    dispatchEvent,
    setTimeout: (callback: () => void) => {
      callback();
      return 0;
    }
  };
  return () => {
    consumeGuidedStepUtilisationAvailabilityEvents(() => true);
    (global as any).window = previousWindow;
    (global as any).CustomEvent = previousCustomEvent;
  };
};

describe('guided step utilisation live sync events', () => {
  afterEach(() => {
    consumeGuidedStepUtilisationAvailabilityEvents(() => true);
    jest.restoreAllMocks();
  });

  test('keeps scheduled availability events pending until the matching step consumes them', () => {
    const restore = installWindowMock();
    const detail = {
      stepId: 'leftoverForm',
      recordId: 'record-1',
      availability: [
        {
          resourceFormKey: 'Config: Leftover Bank',
          resourceRecordId: 'bank-row-1',
          resourceItemId: 'LE-1',
          quantityFieldId: 'LEFTOVER_PORTIONS',
          remainingQuantity: 0,
          freeQuantity: 0,
          currentRecordUtilisedQuantity: 0
        } as any
      ]
    };

    expect(scheduleGuidedStepUtilisationAvailabilityEvent(detail)).toBe(true);
    expect(consumeGuidedStepUtilisationAvailabilityEvents(candidate => candidate.stepId === 'production')).toEqual([]);
    expect(consumeGuidedStepUtilisationAvailabilityEvents(candidate => candidate.stepId === 'leftoverForm')).toEqual([
      detail
    ]);
    expect(consumeGuidedStepUtilisationAvailabilityEvents(() => true)).toEqual([]);

    restore();
  });

  test('removes pending events after an immediate listener handles them', () => {
    const restore = installWindowMock();
    const handledDetail = {
      stepId: 'leftoverForm',
      recordId: 'record-1',
      availability: [{ resourceRecordId: 'bank-row-1' } as any]
    };
    const pendingDetail = {
      stepId: 'leftoverForm',
      recordId: 'record-2',
      availability: [{ resourceRecordId: 'bank-row-2' } as any]
    };

    expect(scheduleGuidedStepUtilisationAvailabilityEvent(handledDetail)).toBe(true);
    expect(scheduleGuidedStepUtilisationAvailabilityEvent(pendingDetail)).toBe(true);
    forgetGuidedStepUtilisationAvailabilityEvent(handledDetail);

    expect(consumeGuidedStepUtilisationAvailabilityEvents(() => true)).toEqual([pendingDetail]);

    restore();
  });

  test('does not replay pending events once they have already been handled', () => {
    const restore = installWindowMock();
    const detail = {
      stepId: 'leftoverForm',
      recordId: 'record-1',
      availability: [{ resourceRecordId: 'bank-row-1' } as any]
    };

    expect(scheduleGuidedStepUtilisationAvailabilityEvent(detail)).toBe(true);
    markGuidedStepUtilisationAvailabilityEventHandled(detail);

    expect(consumeGuidedStepUtilisationAvailabilityEvents(() => true)).toEqual([]);

    restore();
  });
});
