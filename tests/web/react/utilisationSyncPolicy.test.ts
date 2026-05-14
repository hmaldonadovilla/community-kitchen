import {
  buildUtilisationFieldPatch,
  buildUtilisationFailureMessage,
  getUtilisationCommitMode,
  resolveStepUtilisationDraftStateDecision,
  shouldBlockDataSourceFreshnessForInvalidStepUtilisation,
  shouldImmediatelySyncStepUtilisationChange,
  shouldDeferUtilisationSync
} from '../../../src/web/react/components/form/utilisationSyncPolicy';
import { normalizeBankAvailabilitySnapshotForDisplay } from '../../../src/web/react/features/utilisations/availabilitySnapshots';

describe('utilisationSyncPolicy', () => {
  test('defers utilisation sync for quantity-only patches', () => {
    expect(
      shouldDeferUtilisationSync({
        patch: {
          LEFTOVER_USE_QTY: '5'
        },
        selectedFieldId: 'LEFTOVER_SELECTED',
        quantityFieldId: 'LEFTOVER_USE_QTY'
      })
    ).toBe(true);
  });

  test('builds quantity-only patches for already-selected utilisations', () => {
    const patch = buildUtilisationFieldPatch({
      fieldId: 'LEFTOVER_USE_QTY',
      value: '5',
      selectedFieldId: 'LEFTOVER_SELECTED',
      selectedValue: true,
      quantityFieldId: 'LEFTOVER_USE_QTY'
    });

    expect(patch).toEqual({ LEFTOVER_USE_QTY: '5' });
    expect(
      shouldDeferUtilisationSync({
        patch,
        selectedFieldId: 'LEFTOVER_SELECTED',
        quantityFieldId: 'LEFTOVER_USE_QTY'
      })
    ).toBe(true);
  });

  test('keeps non-quantity utilisation field patches selection-aware', () => {
    expect(
      buildUtilisationFieldPatch({
        fieldId: 'LEFTOVER_USAGE_MODE',
        value: 'Combine',
        selectedFieldId: 'LEFTOVER_SELECTED',
        selectedValue: true,
        quantityFieldId: 'LEFTOVER_USE_QTY'
      })
    ).toEqual({
      LEFTOVER_SELECTED: true,
      LEFTOVER_USAGE_MODE: 'Combine'
    });
  });

  test('selects the utilisation when quantity is edited before selection state exists', () => {
    expect(
      buildUtilisationFieldPatch({
        fieldId: 'LEFTOVER_USE_QTY',
        value: '5',
        selectedFieldId: 'LEFTOVER_SELECTED',
        selectedValue: false,
        quantityFieldId: 'LEFTOVER_USE_QTY'
      })
    ).toEqual({
      LEFTOVER_SELECTED: true,
      LEFTOVER_USE_QTY: '5'
    });
  });

  test('does not defer utilisation sync when the selection state is part of the patch', () => {
    expect(
      shouldDeferUtilisationSync({
        patch: {
          LEFTOVER_SELECTED: true,
          LEFTOVER_USE_QTY: '5'
        },
        selectedFieldId: 'LEFTOVER_SELECTED',
        quantityFieldId: 'LEFTOVER_USE_QTY'
      })
    ).toBe(false);
  });

  test('immediately syncs step utilisations when a valid quantity change is present', () => {
    expect(
      shouldImmediatelySyncStepUtilisationChange({
        patch: {
          LEFTOVER_USE_QTY: '5'
        },
        selectedFieldId: 'LEFTOVER_SELECTED',
        quantityFieldId: 'LEFTOVER_USE_QTY',
        selectedValue: true,
        quantityValue: '5'
      })
    ).toBe(true);
  });

  test('immediately syncs step utilisations for other valid line changes once the utilisation state is complete', () => {
    expect(
      shouldImmediatelySyncStepUtilisationChange({
        patch: {
          LEFTOVER_USAGE_MODE: 'Combine'
        },
        selectedFieldId: 'LEFTOVER_SELECTED',
        quantityFieldId: 'LEFTOVER_USE_QTY',
        selectedValue: true,
        quantityValue: '5'
      })
    ).toBe(true);
  });

  test('immediately syncs step utilisations when a line is deselected', () => {
    expect(
      shouldImmediatelySyncStepUtilisationChange({
        patch: {
          LEFTOVER_SELECTED: false
        },
        selectedFieldId: 'LEFTOVER_SELECTED',
        quantityFieldId: 'LEFTOVER_USE_QTY',
        selectedValue: false,
        quantityValue: '5'
      })
    ).toBe(true);
  });

  test('does not immediately sync step utilisations when the edited line has invalid non-empty values', () => {
    expect(
      shouldImmediatelySyncStepUtilisationChange({
        patch: {
          LEFTOVER_USE_QTY: '5'
        },
        selectedFieldId: 'LEFTOVER_SELECTED',
        quantityFieldId: 'LEFTOVER_USE_QTY',
        selectedValue: true,
        quantityValue: '5',
        hasValidationErrors: true
      })
    ).toBe(false);
  });

  test('blocks datasource freshness while a selected step utilisation is invalid and unsynced', () => {
    expect(
      shouldBlockDataSourceFreshnessForInvalidStepUtilisation({
        patch: {
          LEFTOVER_SELECTED: true
        },
        selectedFieldId: 'LEFTOVER_SELECTED',
        quantityFieldId: 'LEFTOVER_USE_QTY',
        selectedValue: true,
        quantityValue: '5',
        hasValidationErrors: true
      })
    ).toBe(true);
  });

  test('reports invalid deferred step utilisation quantity drafts', () => {
    expect(
      resolveStepUtilisationDraftStateDecision({
        patch: {
          LEFTOVER_USE_QTY: '51'
        },
        selectedFieldId: 'LEFTOVER_SELECTED',
        quantityFieldId: 'LEFTOVER_USE_QTY',
        selectedValue: true,
        quantityValue: '51',
        hasValidationErrors: true
      })
    ).toEqual({ pendingInvalid: true, reason: 'invalidUtilisationDraft' });
  });

  test('reports corrected deferred step utilisation quantity drafts as valid', () => {
    expect(
      resolveStepUtilisationDraftStateDecision({
        patch: {
          LEFTOVER_USE_QTY: '50'
        },
        selectedFieldId: 'LEFTOVER_SELECTED',
        quantityFieldId: 'LEFTOVER_USE_QTY',
        selectedValue: true,
        quantityValue: '50',
        hasValidationErrors: false,
        notifyWhenValid: true,
        validReason: 'utilisationDraftValid'
      })
    ).toEqual({ pendingInvalid: false, reason: 'utilisationDraftValid' });
  });

  test('does not block datasource freshness for invalid utilisation edits that still sync a release', () => {
    expect(
      shouldBlockDataSourceFreshnessForInvalidStepUtilisation({
        patch: {
          LEFTOVER_SELECTED: false,
          LEFTOVER_USE_QTY: null
        },
        selectedFieldId: 'LEFTOVER_SELECTED',
        quantityFieldId: 'LEFTOVER_USE_QTY',
        selectedValue: false,
        quantityValue: null,
        hasValidationErrors: true
      })
    ).toBe(false);
  });

  test('immediately syncs step utilisations when a quantity is cleared for release', () => {
    expect(
      shouldImmediatelySyncStepUtilisationChange({
        patch: {
          LEFTOVER_SELECTED: false,
          LEFTOVER_USE_QTY: null
        },
        selectedFieldId: 'LEFTOVER_SELECTED',
        quantityFieldId: 'LEFTOVER_USE_QTY',
        selectedValue: false,
        quantityValue: null,
        hasValidationErrors: true
      })
    ).toBe(true);
  });

  test('maps transient utilisation lock failures to the user-facing recovery message', () => {
    expect(
      buildUtilisationFailureMessage(
        'Could not acquire the utilisation transaction lock. Please retry.',
        "We couldn't update the utilisation.",
        "We couldn't update the utilisation properly. Please try again."
      )
    ).toBe("We couldn't update the utilisation properly. Please try again.");
  });

  test('keeps non-lock failures unchanged', () => {
    expect(
      buildUtilisationFailureMessage(
        'The selected utilisation is no longer available.',
        "We couldn't update the utilisation."
      )
    ).toBe('The selected utilisation is no longer available.');
  });

  test('formats availability conflicts with the leftover item and remaining quantity', () => {
    expect(
      buildUtilisationFailureMessage(
        'Only 0',
        "We couldn't update the utilisation.",
        undefined,
        {
          itemId: 'LE-95',
          itemLabel: 'Bulgur & vegetable sauce',
          availability: {
            resourceFormKey: 'Config: Leftover Bank',
            resourceRecordId: 'leftover-1',
            resourceItemId: 'LE-95',
            quantityFieldId: 'LEFTOVER_PORTIONS',
            remainingQuantity: 5,
            freeQuantity: 0,
            currentUtilisationQuantity: 5,
            currentRecordUtilisedQuantity: 5,
            unit: 'portions',
            status: 'available'
          }
        }
      )
    ).toBe(
      'Bulgur & vegetable sauce | LE-95 has only 10 portions available. Adjust the quantity or choose another leftover item.'
    );
  });

  test('formats unavailable utilisation items with the leftover item and remaining quantity', () => {
    expect(
      buildUtilisationFailureMessage(
        'This bank item is not available for utilisation (used).',
        "We couldn't update the utilisation.",
        undefined,
        {
          itemId: 'LP-22',
          itemLabel: 'Broccoli mix - frozen',
          availability: {
            resourceFormKey: 'Config: Leftover Bank',
            resourceRecordId: 'leftover-2',
            resourceItemId: 'LP-22',
            quantityFieldId: 'LEFTOVER_QTY',
            remainingQuantity: 500,
            freeQuantity: 500,
            currentUtilisationQuantity: 0,
            currentRecordUtilisedQuantity: 0,
            unit: 'gr',
            status: 'used'
          }
        }
      )
    ).toBe(
      'Broccoli mix - frozen | LP-22 is no longer available for utilisation. Current remaining quantity: 500 gr. Adjust the quantity or choose another leftover item.'
    );
  });

  test('detects step-commit utilisation mode', () => {
    expect(getUtilisationCommitMode({ commitMode: 'step' })).toBe('step');
    expect(getUtilisationCommitMode({})).toBe('immediate');
  });

  test('preserves current-record utilisations in step-sync availability snapshots', () => {
    expect(
      normalizeBankAvailabilitySnapshotForDisplay({
        resourceFormKey: 'Config: Leftover Bank',
        resourceRecordId: 'leftover-1',
        resourceItemId: 'LE-43',
        currentRecordUtilisedQuantity: 2,
        freeQuantity: 3
      } as any)
    ).toEqual(
      expect.objectContaining({
        resourceRecordId: 'leftover-1',
        resourceItemId: 'LE-43',
        currentRecordUtilisedQuantity: 2,
        freeQuantity: 3
      })
    );
  });
});
