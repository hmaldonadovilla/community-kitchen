const { SubmitEffectsRepository } = require('../cloud-run/api/repositories/submitEffectsRepository');

const createDeferred = () => {
  let resolve!: (value: any) => void;
  const promise = new Promise<any>(next => {
    resolve = next;
  });
  return { promise, resolve };
};

describe('Cloud Run SubmitEffectsRepository', () => {
  test('saveSubmissionWithId runs embedded utilisation plan and draft save in parallel', async () => {
    const events: string[] = [];
    const draftSave = createDeferred();
    const utilisationApply = createDeferred();
    const saveSubmissionWithId = jest.fn(() => {
      events.push('draftSave.start');
      return draftSave.promise;
    });
    const applyPlan = jest.fn(() => {
      events.push('utilisationApply.start');
      return utilisationApply.promise;
    });
    const repository = new SubmitEffectsRepository({
      submissionRepository: {
        getFormContext: jest.fn(() => ({
          formKey: 'Config: Meal Production',
          form: {},
          questions: []
        })),
        saveSubmissionWithId
      },
      bankUtilisationRepository: {
        applyPlan
      }
    });

    const resultPromise = repository.saveSubmissionWithId({
      formKey: 'Config: Meal Production',
      language: 'EN',
      id: 'meal-1',
      values: { status: 'In progress' },
      __ckSaveMode: 'draft',
      __ckMutationPlan: {
        utilisationPlan: {
          sourceFormKey: 'Config: Meal Production',
          sourceRecordId: 'meal-1',
          managedScopes: [],
          utilisations: [],
          refreshMode: 'revisionOnly'
        }
      }
    });

    await Promise.resolve();
    expect(events).toEqual(['draftSave.start', 'utilisationApply.start']);
    expect(saveSubmissionWithId).toHaveBeenCalledWith(
      expect.not.objectContaining({
        __ckMutationPlan: expect.anything()
      })
    );
    expect(applyPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceFormKey: 'Config: Meal Production',
        sourceRecordId: 'meal-1',
        refreshMode: 'none'
      })
    );

    utilisationApply.resolve({
      success: true,
      message: 'Bank utilisations updated.',
      utilisationsApplied: 1,
      utilisationsReleased: 0,
      availability: [{ resourceRecordId: 'leftover-1' }]
    });
    draftSave.resolve({
      success: true,
      message: 'Saved to sheet.',
      meta: { id: 'meal-1', operation: 'update' }
    });

    await expect(resultPromise).resolves.toMatchObject({
      success: true,
      utilisationResult: {
        success: true,
        utilisationsApplied: 1
      },
      availability: [{ resourceRecordId: 'leftover-1' }],
      meta: {
        utilisationPlan: {
          success: true,
          utilisationsApplied: 1
        }
      }
    });
  });

  test('status-only close updates status without saving source payload and uses saved record for submit effects', async () => {
    const saveStatusOnlyWithId = jest.fn(async () => ({
      success: true,
      message: 'Record closed.',
      meta: {
        id: 'meal-1',
        updatedAt: '2026-05-06T10:00:00.000Z',
        dataVersion: 3,
        rowNumber: 12,
        operation: 'update'
      }
    }));
    const saveSubmissionWithId = jest.fn(async payload => ({
      success: true,
      message: 'Saved to sheet',
      meta: {
        id: payload.id || 'leftover-1',
        operation: 'create'
      }
    }));
    const sourceContext = {
      formKey: 'Config: Meal Production',
      form: {
        followupConfig: {
          statusTransitions: { onClose: 'Closed' },
          submitEffects: [
            {
              id: 'captureLeftover',
              type: 'createRecord',
              targetFormKey: 'Config: Leftover Bank',
              runOn: 'update',
              recordId: 'leftover::{{source.id}}',
              when: { fieldId: 'status', equals: ['Closed'] },
              values: {
                SOURCE_RECORD_ID: '{{source.id}}',
                SOURCE_NAME: '{{source.Q1}}'
              }
            }
          ]
        }
      },
      questions: [{ id: 'Q1', type: 'TEXT' }]
    };
    const targetContext = {
      formKey: 'Config: Leftover Bank',
      form: {},
      questions: [
        { id: 'SOURCE_RECORD_ID', type: 'TEXT' },
        { id: 'SOURCE_NAME', type: 'TEXT' }
      ]
    };
    const repository = new SubmitEffectsRepository({
      submissionRepository: {
        getFormContext: jest.fn(formKey => (formKey === 'Config: Leftover Bank' ? targetContext : sourceContext)),
        fetchSubmissionById: jest.fn(async () => ({
          id: 'meal-1',
          formKey: 'Config: Meal Production',
          language: 'EN',
          status: 'Final report emailed',
          dataVersion: 2,
          values: {
            Q1: 'Alice'
          }
        })),
        saveStatusOnlyWithId,
        saveSubmissionWithId
      }
    });

    const result = await repository.saveSubmissionWithId({
      formKey: 'Config: Meal Production',
      language: 'EN',
      id: 'meal-1',
      values: { status: 'Closed' },
      status: 'Closed',
      __ckStatus: 'Closed',
      __ckStatusOnlyClose: '1',
      __ckClientDataVersion: 2
    });

    expect(result.success).toBe(true);
    expect(saveStatusOnlyWithId).toHaveBeenCalledTimes(1);
    expect((saveStatusOnlyWithId.mock.calls[0] as any[])[0]).toEqual(expect.objectContaining({
      id: 'meal-1',
      __ckStatusOnlyClose: '1',
      __ckSkipSubmitEffects: '1'
    }));
    expect(saveSubmissionWithId).toHaveBeenCalledTimes(1);
    expect((saveSubmissionWithId.mock.calls[0] as any[])[0]).toEqual(expect.objectContaining({
      formKey: 'Config: Leftover Bank',
      id: 'leftover::meal-1',
      SOURCE_RECORD_ID: 'meal-1',
      SOURCE_NAME: 'Alice'
    }));
    expect(result.meta).toEqual(expect.objectContaining({
      status: 'Closed',
      statusOnlyClose: true,
      submitEffects: expect.objectContaining({
        configured: 1,
        executed: 1,
        created: 1
      })
    }));
  });

  test('scaleCollection derives produced leftovers from the Cook row ingredient list only', async () => {
    const repository = new SubmitEffectsRepository({});
    const result = await repository.resolveComputedValue(
      {
        op: 'scaleCollection',
        collectionPath: 'row.MP_INGREDIENTS_LI',
        pickFields: ['ING', 'QTY', 'UNIT', 'CAT', 'ALLERGEN'],
        scaleNumericFields: ['QTY'],
        multiplierPath: 'parent.MP_LEFTOVER_PORTIONS_CAPTURE',
        divisorPath: 'row.PREP_QTY'
      },
      {
        parent: {
          MP_LEFTOVER_PORTIONS_CAPTURE: 3,
          MP_TYPE_LI: [
            {
              PREP_TYPE: 'Single-ingredient',
              MP_INGREDIENTS_LI: [{ ING: 'Couscous', QTY: 4, UNIT: 'kg', CAT: 'Dry carbohydrates', ALLERGEN: 'Gluten' }]
            }
          ]
        },
        row: {
          PREP_TYPE: 'Cook',
          PREP_QTY: 12,
          MP_INGREDIENTS_LI: [
            { ING: 'Couscous', QTY: 8, UNIT: 'kg', CAT: 'Dry carbohydrates', ALLERGEN: 'Gluten' },
            { ING: 'Carrot', QTY: 4, UNIT: 'kg', CAT: 'Vegetables', ALLERGEN: 'None' }
          ]
        }
      }
    );

    expect(result).toEqual([
      { ING: 'Couscous', QTY: 2, UNIT: 'kg', CAT: 'Dry carbohydrates', ALLERGEN: 'Gluten' },
      { ING: 'Carrot', QTY: 1, UNIT: 'kg', CAT: 'Vegetables', ALLERGEN: 'None' }
    ]);
  });
});
