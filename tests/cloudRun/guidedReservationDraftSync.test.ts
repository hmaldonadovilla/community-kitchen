const {
  syncGuidedStepReservationDraft
} = require('../../cloud-run/api/services/guidedReservationDraftSync');

const createDeferred = () => {
  let resolve!: (value: any) => void;
  const promise = new Promise<any>(next => {
    resolve = next;
  });
  return { promise, resolve };
};

describe('syncGuidedStepReservationDraft Cloud Run service', () => {
  test('routes compatibility endpoint through saveSubmissionWithId mutation plan', async () => {
    const draftSave = createDeferred();
    const timing = {
      measure: jest.fn((step: string, fn: () => Promise<any>) => fn()),
      log: jest.fn((extra: any) => ({ totalMs: 12, steps: {}, counts: {}, ...extra }))
    };
    const repositories = {
      submitEffectsRepository: {
        saveSubmissionWithId: jest.fn(() => draftSave.promise)
      }
    };

    const resultPromise = syncGuidedStepReservationDraft({
      request: {
        stepId: 'leftoverForm',
        clientMutationSeq: 2,
        reservationPlan: {
          sourceFormKey: 'Config: Meal Production',
          sourceRecordId: 'meal-1',
          refreshMode: 'revisionOnly',
          managedScopes: [],
          reservations: []
        },
        draftPayload: {
          formKey: 'Config: Meal Production',
          id: 'meal-1',
          values: { status: 'In progress' }
        }
      },
      repositories,
      timing
    });

    await Promise.resolve();
    expect(repositories.submitEffectsRepository.saveSubmissionWithId).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'meal-1',
        __ckMutationPlan: expect.objectContaining({
          reservationPlan: expect.objectContaining({
            sourceFormKey: 'Config: Meal Production',
            sourceRecordId: 'meal-1',
            refreshMode: 'none'
          }),
          guidedReservationDraftSync: {
            stepId: 'leftoverForm',
            clientMutationSeq: 2
          }
        })
      })
    );

    draftSave.resolve({
      success: true,
      message: 'Draft saved.',
      meta: { id: 'meal-1', dataVersion: 12 },
      reservationResult: {
        success: true,
        message: 'Inventory reservations updated.',
        availability: [{ resourceRecordId: 'leftover-1' }]
      },
      availability: [{ resourceRecordId: 'leftover-1' }]
    });

    await expect(resultPromise).resolves.toMatchObject({
      success: true,
      stepId: 'leftoverForm',
      clientMutationSeq: 2,
      meta: { id: 'meal-1', dataVersion: 12 },
      availability: [{ resourceRecordId: 'leftover-1' }]
    });
    expect(timing.measure).toHaveBeenCalledWith('saveSubmissionWithId', expect.any(Function));
  });
});
