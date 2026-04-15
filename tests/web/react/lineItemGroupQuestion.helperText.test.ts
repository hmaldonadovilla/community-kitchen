import { shouldHideSupplementalHelperTextForDataSourceRows } from '../../../src/web/react/components/form/lineItemGroupQuestionHelperText';

describe('shouldHideSupplementalHelperTextForDataSourceRows', () => {
  test('returns true when every active datasource row config has no source rows', () => {
    expect(
      shouldHideSupplementalHelperTextForDataSourceRows({
        hideWhenNoSourceRows: true,
        entries: [{ loading: false, sourceRows: [] }]
      })
    ).toBe(true);
  });

  test('returns false while datasource rows are still loading', () => {
    expect(
      shouldHideSupplementalHelperTextForDataSourceRows({
        hideWhenNoSourceRows: true,
        entries: [{ loading: true, sourceRows: [] }]
      })
    ).toBe(false);
  });

  test('returns false when any datasource config still has source rows', () => {
    expect(
      shouldHideSupplementalHelperTextForDataSourceRows({
        hideWhenNoSourceRows: true,
        entries: [
          { loading: false, sourceRows: [] },
          { loading: false, sourceRows: [{ id: 'row-1' }] }
        ]
      })
    ).toBe(false);
  });
});
