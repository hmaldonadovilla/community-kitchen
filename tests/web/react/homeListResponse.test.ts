import { annotateListResponseWithInitialDateFilter } from '../../../src/web/react/app/homeListResponse';

describe('homeListResponse', () => {
  it('annotates date-filter metadata from the initial date search value', () => {
    const response = {
      items: [{ id: 'meal-1' }],
      totalCount: 1
    } as any;

    expect(
      annotateListResponseWithInitialDateFilter(response, {
        search: {
          mode: 'date',
          dateFieldId: 'MP_PREP_DATE',
          initialValue: '2026-05-04'
        }
      })
    ).toEqual({
      items: [{ id: 'meal-1' }],
      totalCount: 1,
      dateFilterFieldId: 'MP_PREP_DATE',
      dateFilterEquals: '2026-05-04'
    });
  });

  it('preserves responses that already include date-filter metadata', () => {
    const response = {
      items: [{ id: 'meal-1' }],
      totalCount: 1,
      dateFilterFieldId: 'EXISTING_DATE',
      dateFilterEquals: '2026-05-03'
    } as any;

    expect(annotateListResponseWithInitialDateFilter(response, { search: { mode: 'date' } })).toBe(response);
  });

  it('does not annotate non-date searches or invalid responses', () => {
    const textResponse = { items: [], totalCount: 0 } as any;
    const malformedResponse = { totalCount: 0 } as any;
    expect(annotateListResponseWithInitialDateFilter(textResponse, { search: { mode: 'text' } })).toBe(textResponse);
    expect(annotateListResponseWithInitialDateFilter(malformedResponse, { search: { mode: 'date' } })).toBe(malformedResponse);
    expect(annotateListResponseWithInitialDateFilter(null, { search: { mode: 'date' } })).toBeNull();
  });
});
