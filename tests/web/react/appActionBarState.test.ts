import { useAppActionBarState } from '../../../src/web/react/components/app/useAppActionBarState';

const gates = {
  submit: { hidden: false, disabled: false },
  summary: { hidden: false, disabled: false },
  edit: { hidden: false, disabled: false },
  copyCurrentRecord: { hidden: false, disabled: false },
  create: { hidden: false, disabled: false },
  home: { hidden: false, disabled: false }
};

describe('useAppActionBarState', () => {
  it('disables guided Next when the active step forward gate is not satisfied', () => {
    const state = useAppActionBarState({
      view: 'form',
      language: 'EN',
      guidedUiState: {
        isFinal: false,
        backVisible: true,
        backLabel: 'Back',
        backAllowed: true,
        forwardGateSatisfied: false
      },
      orderedEntryEnabled: false,
      formIsValid: true,
      dedupNavigationBlocked: false,
      systemActionGateState: gates,
      isClosedRecord: false,
      summaryViewEnabled: true,
      copyCurrentRecordEnabled: true,
      selectedRecordId: 'record-1'
    });

    expect(state.orderedSubmitDisabled).toBe(true);
    expect(state.guidedNextWouldEnable).toBe(false);
  });

  it('keeps guided Next enabled when the active step forward gate is satisfied', () => {
    const state = useAppActionBarState({
      view: 'form',
      language: 'EN',
      guidedUiState: {
        isFinal: false,
        backVisible: true,
        backLabel: 'Back',
        backAllowed: true,
        forwardGateSatisfied: true
      },
      orderedEntryEnabled: false,
      formIsValid: true,
      dedupNavigationBlocked: false,
      systemActionGateState: gates,
      isClosedRecord: false,
      summaryViewEnabled: true,
      copyCurrentRecordEnabled: true,
      selectedRecordId: 'record-1'
    });

    expect(state.orderedSubmitDisabled).toBe(false);
    expect(state.guidedNextWouldEnable).toBe(true);
  });
});
