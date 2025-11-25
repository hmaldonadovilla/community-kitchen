import { FieldValue, FormState, LineItemRowState } from '../types';

type Listener = (next: FormState, prev: FormState) => void;

let state: FormState = {
  language: 'EN',
  values: {},
  lineItems: {},
  submitting: false
};

const listeners: Set<Listener> = new Set();

export function getState(): FormState {
  return state;
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setState(next: Partial<FormState>): FormState {
  const prev = state;
  state = {
    ...state,
    ...next,
    values: next.values ? { ...prev.values, ...next.values } : prev.values,
    lineItems: next.lineItems ? { ...prev.lineItems, ...next.lineItems } : prev.lineItems
  };
  listeners.forEach(l => l(state, prev));
  return state;
}

export function updateValue(fieldId: string, value: FieldValue): FormState {
  return setState({ values: { ...state.values, [fieldId]: value } });
}

export function updateLineItems(groupId: string, rows: LineItemRowState[]): FormState {
  return setState({ lineItems: { ...state.lineItems, [groupId]: rows } });
}

export function resetState(partial?: Partial<FormState>): FormState {
  const base: FormState = {
    language: 'EN',
    values: {},
    lineItems: {},
    submitting: false
  };
  return setState({ ...base, ...partial });
}
