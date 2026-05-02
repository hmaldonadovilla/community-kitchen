import { shouldDeferCopiedDraftCreation } from '../../../src/web/react/app/copyDraftCreation';

describe('copyDraftCreation', () => {
  const dedupRules = [{ keys: ['MP_DISTRIBUTOR', 'MP_PREP_DATE', 'MP_SERVICE'], onConflict: 'reject' }];

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
          MP_PREP_DATE: '2026-05-02',
          MP_SERVICE: 'Dinner'
        }
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
