import type { BankAvailabilitySnapshot } from '../../../../types';

export const GUIDED_STEP_RESERVATION_AVAILABILITY_EVENT = 'ck:guidedStepUtilisationAvailability';

export interface GuidedStepRejectedUtilisationDetail {
  sourceParentGroupId?: string;
  sourceParentRowId?: string;
  sourceOutputGroupId?: string;
  sourceOutputRowId?: string;
  sourceOutputKeyFieldId?: string;
  resourceRecordId: string;
  resourceItemId?: string;
}

export interface GuidedStepUtilisationAvailabilityEventDetail {
  stepId: string;
  recordId: string;
  availability: BankAvailabilitySnapshot[];
  rejectedUtilisations?: GuidedStepRejectedUtilisationDetail[];
}

const MAX_PENDING_AVAILABILITY_EVENTS = 20;

let pendingAvailabilityEvents: GuidedStepUtilisationAvailabilityEventDetail[] = [];
const handledAvailabilityEvents = new WeakSet<GuidedStepUtilisationAvailabilityEventDetail>();

const rememberGuidedStepUtilisationAvailabilityEvent = (
  detail: GuidedStepUtilisationAvailabilityEventDetail
): void => {
  pendingAvailabilityEvents = [
    ...pendingAvailabilityEvents.filter(candidate => candidate !== detail),
    detail
  ].slice(-MAX_PENDING_AVAILABILITY_EVENTS);
};

export const forgetGuidedStepUtilisationAvailabilityEvent = (
  detail: GuidedStepUtilisationAvailabilityEventDetail
): void => {
  pendingAvailabilityEvents = pendingAvailabilityEvents.filter(candidate => candidate !== detail);
};

export const hasHandledGuidedStepUtilisationAvailabilityEvent = (
  detail: GuidedStepUtilisationAvailabilityEventDetail
): boolean => handledAvailabilityEvents.has(detail);

export const markGuidedStepUtilisationAvailabilityEventHandled = (
  detail: GuidedStepUtilisationAvailabilityEventDetail
): void => {
  handledAvailabilityEvents.add(detail);
};

export const consumeGuidedStepUtilisationAvailabilityEvents = (
  predicate: (detail: GuidedStepUtilisationAvailabilityEventDetail) => boolean
): GuidedStepUtilisationAvailabilityEventDetail[] => {
  const consumed: GuidedStepUtilisationAvailabilityEventDetail[] = [];
  const retained: GuidedStepUtilisationAvailabilityEventDetail[] = [];
  pendingAvailabilityEvents.forEach(detail => {
    if (hasHandledGuidedStepUtilisationAvailabilityEvent(detail)) {
      return;
    }
    if (predicate(detail)) {
      consumed.push(detail);
      return;
    }
    retained.push(detail);
  });
  pendingAvailabilityEvents = retained;
  return consumed;
};

export const dispatchGuidedStepUtilisationAvailabilityEvent = (
  detail: GuidedStepUtilisationAvailabilityEventDetail
): boolean => {
  if (
    typeof window === 'undefined' ||
    typeof window.dispatchEvent !== 'function' ||
    typeof CustomEvent !== 'function'
  ) {
    return false;
  }
  window.dispatchEvent(
    new CustomEvent<GuidedStepUtilisationAvailabilityEventDetail>(
      GUIDED_STEP_RESERVATION_AVAILABILITY_EVENT,
      { detail }
    )
  );
  return true;
};

export const scheduleGuidedStepUtilisationAvailabilityEvent = (
  detail: GuidedStepUtilisationAvailabilityEventDetail
): boolean => {
  if (typeof window === 'undefined') return false;
  rememberGuidedStepUtilisationAvailabilityEvent(detail);
  const run = () => {
    dispatchGuidedStepUtilisationAvailabilityEvent(detail);
  };
  if (typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(() => window.requestAnimationFrame(run));
    return true;
  }
  if (typeof window.setTimeout === 'function') {
    window.setTimeout(run, 0);
    return true;
  }
  return dispatchGuidedStepUtilisationAvailabilityEvent(detail);
};
