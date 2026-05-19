import {
  shouldClearOptionStateAfterDataSourceCacheClear
} from '../../../src/web/react/app/dataSourceOptionState';

describe('data source option state cache events', () => {
  it('preserves visible option state when only in-memory data source cache is cleared', () => {
    const event = new CustomEvent('ck:datasourcecachecleared', {
      detail: { includePersisted: false }
    });

    expect(shouldClearOptionStateAfterDataSourceCacheClear(event)).toBe(false);
  });

  it('clears visible option state when persisted data source cache is cleared', () => {
    const event = new CustomEvent('ck:datasourcecachecleared', {
      detail: { includePersisted: true }
    });

    expect(shouldClearOptionStateAfterDataSourceCacheClear(event)).toBe(true);
  });
});
