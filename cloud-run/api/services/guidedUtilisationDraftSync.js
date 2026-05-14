const toString = value => (value === undefined || value === null ? '' : value.toString());

const syncGuidedStepUtilisationDraft = async ({ request, repositories, timing }) => {
  const safeRequest = request && typeof request === 'object' ? request : {};
  const utilisationPlan = safeRequest.utilisationPlan || {};
  const draftPayload = safeRequest.draftPayload || {};
  const sourceFormKey = toString(utilisationPlan.sourceFormKey).trim();
  const sourceRecordId = toString(utilisationPlan.sourceRecordId).trim();
  const draftFormKey = toString(draftPayload.formKey || draftPayload.form).trim();
  const draftRecordId = toString(draftPayload.id).trim();
  if (!sourceFormKey || !sourceRecordId || !draftFormKey || !draftRecordId) {
    return {
      success: false,
      message: 'utilisationPlan.sourceFormKey, utilisationPlan.sourceRecordId, draftPayload.formKey, and draftPayload.id are required.',
      stepId: safeRequest.stepId,
      clientMutationSeq: safeRequest.clientMutationSeq
    };
  }
  if (sourceFormKey !== draftFormKey || sourceRecordId !== draftRecordId) {
    return {
      success: false,
      message: 'Utilisation plan source and draft payload must refer to the same record.',
      stepId: safeRequest.stepId,
      clientMutationSeq: safeRequest.clientMutationSeq
    };
  }

  const savePayload = {
    ...draftPayload,
    __ckMutationPlan: {
      ...((draftPayload && draftPayload.__ckMutationPlan) || {}),
      utilisationPlan: {
        ...utilisationPlan,
        refreshMode: 'none'
      },
      guidedUtilisationDraftSync: {
        stepId: safeRequest.stepId,
        clientMutationSeq: safeRequest.clientMutationSeq
      }
    }
  };
  const saveResult = await timing.measure('saveSubmissionWithId', () =>
    repositories.submitEffectsRepository.saveSubmissionWithId(savePayload)
  );
  const utilisationResult = saveResult && saveResult.utilisationResult;
  const success = Boolean(saveResult && saveResult.success) && Boolean(utilisationResult && utilisationResult.success);
  const timingSummary = timing.log({ success, sourceFormKey, sourceRecordId });
  return {
    success,
    message: success
      ? (saveResult.message || utilisationResult.message || 'Utilisation and draft synchronized.')
      : ((utilisationResult && !utilisationResult.success && utilisationResult.message) ||
          (saveResult && saveResult.message) ||
          'Could not synchronize utilisation and draft changes.'),
    stepId: safeRequest.stepId,
    clientMutationSeq: safeRequest.clientMutationSeq,
    utilisationResult,
    saveResult,
    meta: saveResult && saveResult.meta,
    availability: utilisationResult && utilisationResult.availability,
    timing: timingSummary
  };
};

module.exports = {
  syncGuidedStepUtilisationDraft
};
