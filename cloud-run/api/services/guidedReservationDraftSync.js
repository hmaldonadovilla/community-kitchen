const toString = value => (value === undefined || value === null ? '' : value.toString());

const syncGuidedStepReservationDraft = async ({ request, repositories, timing }) => {
  const safeRequest = request && typeof request === 'object' ? request : {};
  const reservationPlan = safeRequest.reservationPlan || {};
  const draftPayload = safeRequest.draftPayload || {};
  const sourceFormKey = toString(reservationPlan.sourceFormKey).trim();
  const sourceRecordId = toString(reservationPlan.sourceRecordId).trim();
  const draftFormKey = toString(draftPayload.formKey || draftPayload.form).trim();
  const draftRecordId = toString(draftPayload.id).trim();
  if (!sourceFormKey || !sourceRecordId || !draftFormKey || !draftRecordId) {
    return {
      success: false,
      message: 'reservationPlan.sourceFormKey, reservationPlan.sourceRecordId, draftPayload.formKey, and draftPayload.id are required.',
      stepId: safeRequest.stepId,
      clientMutationSeq: safeRequest.clientMutationSeq
    };
  }
  if (sourceFormKey !== draftFormKey || sourceRecordId !== draftRecordId) {
    return {
      success: false,
      message: 'Reservation plan source and draft payload must refer to the same record.',
      stepId: safeRequest.stepId,
      clientMutationSeq: safeRequest.clientMutationSeq
    };
  }

  const savePayload = {
    ...draftPayload,
    __ckMutationPlan: {
      ...((draftPayload && draftPayload.__ckMutationPlan) || {}),
      reservationPlan: {
        ...reservationPlan,
        refreshMode: 'none'
      },
      guidedReservationDraftSync: {
        stepId: safeRequest.stepId,
        clientMutationSeq: safeRequest.clientMutationSeq
      }
    }
  };
  const saveResult = await timing.measure('saveSubmissionWithId', () =>
    repositories.submitEffectsRepository.saveSubmissionWithId(savePayload)
  );
  const reservationResult = saveResult && saveResult.reservationResult;
  const success = Boolean(saveResult && saveResult.success) && Boolean(reservationResult && reservationResult.success);
  const timingSummary = timing.log({ success, sourceFormKey, sourceRecordId });
  return {
    success,
    message: success
      ? (saveResult.message || reservationResult.message || 'Reservation and draft synchronized.')
      : ((reservationResult && !reservationResult.success && reservationResult.message) ||
          (saveResult && saveResult.message) ||
          'Could not synchronize reservation and draft changes.'),
    stepId: safeRequest.stepId,
    clientMutationSeq: safeRequest.clientMutationSeq,
    reservationResult,
    saveResult,
    meta: saveResult && saveResult.meta,
    availability: reservationResult && reservationResult.availability,
    timing: timingSummary
  };
};

module.exports = {
  syncGuidedStepReservationDraft
};
