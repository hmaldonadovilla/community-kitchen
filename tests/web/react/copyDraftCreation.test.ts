import { hasInvalidRejectDedupKeyValues, shouldDeferCopiedDraftCreation } from '../../../src/web/react/app/copyDraftCreation';

describe('copyDraftCreation', () => {
  const dedupRules = [{ keys: ['MP_DISTRIBUTOR', 'MP_PREP_DATE', 'MP_SERVICE'], onConflict: 'reject' }];
  const questions = [
    {
      id: 'MP_PREP_DATE',
      validationRules: [
        {
          when: {
            fieldId: 'MP_PREP_DATE',
            isInPast: true
          },
          message: {
            en: 'Dates in the past are not allowed.'
          }
        }
      ]
    }
  ] as any;

  test('defers creating a copied draft while dedup keys are incomplete', () => {
    expect(
      shouldDeferCopiedDraftCreation({
        dedupRules,
        values: {
          MP_DISTRIBUTOR: 'Belliard',
          MP_PREP_DATE: '',
          MP_SERVICE: 'Dinner'
        }
      })
    ).toBe(true);
  });

  test('allows creating a copied draft once dedup keys are complete', () => {
    expect(
      shouldDeferCopiedDraftCreation({
        dedupRules,
        values: {
          MP_DISTRIBUTOR: 'Belliard',
          MP_PREP_DATE: '2999-05-02',
          MP_SERVICE: 'Dinner'
        }
      })
    ).toBe(false);
  });

  test('detects invalid reject dedup key values from field validation rules', () => {
    expect(
      hasInvalidRejectDedupKeyValues({
        dedupRules,
        questions,
        values: {
          MP_DISTRIBUTOR: 'Belliard',
          MP_PREP_DATE: '2000-05-02',
          MP_SERVICE: 'Dinner'
        },
        lineItems: {},
        language: 'en'
      })
    ).toBe(true);
  });

  test('defers copied draft creation while reject dedup keys are invalid', () => {
    expect(
      shouldDeferCopiedDraftCreation({
        dedupRules,
        questions,
        values: {
          MP_DISTRIBUTOR: 'Belliard',
          MP_PREP_DATE: '2000-05-02',
          MP_SERVICE: 'Dinner'
        },
        lineItems: {},
        language: 'en'
      })
    ).toBe(true);
  });

  test('allows copied draft creation when reject dedup keys pass validation', () => {
    expect(
      shouldDeferCopiedDraftCreation({
        dedupRules,
        questions,
        values: {
          MP_DISTRIBUTOR: 'Belliard',
          MP_PREP_DATE: '2999-05-02',
          MP_SERVICE: 'Dinner'
        },
        lineItems: {},
        language: 'en'
      })
    ).toBe(false);
  });

  test('does not defer when an existing draft record id is already present', () => {
    expect(
      shouldDeferCopiedDraftCreation({
        dedupRules,
        existingRecordId: 'draft-1',
        values: {
          MP_DISTRIBUTOR: 'Belliard',
          MP_PREP_DATE: '',
          MP_SERVICE: 'Dinner'
        }
      })
    ).toBe(false);
  });
});
