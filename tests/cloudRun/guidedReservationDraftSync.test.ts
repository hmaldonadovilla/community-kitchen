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
  test('runs draft save and reservation apply in parallel', async () => {
    const events: string[] = [];
    const draftSave = createDeferred();
    const reservationApply = createDeferred();
    const timing = {
      measure: jest.fn((step: string, fn: () => Promise<any>) => fn()),
      log: jest.fn((extra: any) => ({ totalMs: 12, steps: {}, counts: {}, ...extra }))
    };
    const repositories = {
      submitEffectsRepository: {
        saveSubmissionWithId: jest.fn(() => {
          events.push('draftSave.start');
          return draftSave.promise;
        })
      },
      inventoryReservationRepository: {
        applyPlan: jest.fn(() => {
          events.push('reservationApply.start');
          return reservationApply.promise;
        })
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
    expect(events).toEqual(['draftSave.start', 'reservationApply.start']);
    expect(repositories.inventoryReservationRepository.applyPlan).toHaveBeenCalledWith(
      expect.objectContaining({ refreshMode: 'none' })
    );

    reservationApply.resolve({
      success: true,
      message: 'Inventory reservations updated.',
      availability: [{ resourceRecordId: 'leftover-1' }]
    });
    draftSave.resolve({
      success: true,
      message: 'Draft saved.',
      meta: { id: 'meal-1', dataVersion: 12 }
    });

    await expect(resultPromise).resolves.toMatchObject({
      success: true,
      stepId: 'leftoverForm',
      clientMutationSeq: 2,
      meta: { id: 'meal-1', dataVersion: 12 },
      availability: [{ resourceRecordId: 'leftover-1' }]
    });
    expect(timing.measure).toHaveBeenCalledWith('draftSave', expect.any(Function));
    expect(timing.measure).toHaveBeenCalledWith('reservationApply', expect.any(Function));
  });
});
