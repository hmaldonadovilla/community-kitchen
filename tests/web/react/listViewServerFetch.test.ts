import { fetchFilteredSortedPages } from '../../../src/web/react/app/listViewServerFetch';

describe('listViewServerFetch', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('retries transient invalid filtered batch payloads before succeeding', async () => {
    const fetchSortedBatchImpl = jest
      .fn()
      .mockResolvedValueOnce({ list: null, records: {} })
      .mockResolvedValueOnce({
        list: {
          items: [{ id: 'meal-1', MP_PREP_DATE: '2026-04-23' }],
          totalCount: 1
        },
        records: {
          'meal-1': { id: 'meal-1' }
        }
      });
    const onRetry = jest.fn();

    const promise = fetchFilteredSortedPages({
      formKey: 'Config: Meal Production',
      projection: ['MP_PREP_DATE'],
      pageSize: 25,
      includePageRecords: true,
      sortField: 'updatedAt',
      sortDirection: 'desc',
      dateFieldId: 'MP_PREP_DATE',
      dateFrom: '2026-04-17',
      dateTo: '2026-04-23',
      maxAttempts: 2,
      failureMessage: 'Failed to load preset results.',
      fetchSortedBatchImpl,
      onRetry
    });

    await Promise.resolve();
    expect(fetchSortedBatchImpl).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(250);

    await expect(promise).resolves.toMatchObject({
      aborted: false,
      pages: 1,
      items: [{ id: 'meal-1', MP_PREP_DATE: '2026-04-23' }],
      records: {
        'meal-1': { id: 'meal-1' }
      }
    });
    expect(fetchSortedBatchImpl).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledWith(
      expect.objectContaining({
        attempt: 1,
        maxAttempts: 2
      })
    );
  });

  it('fails with the provided message after exhausting invalid payload retries', async () => {
    const fetchSortedBatchImpl = jest.fn().mockResolvedValue({ list: null, records: {} });

    const promise = fetchFilteredSortedPages({
      formKey: 'Config: Meal Production',
      projection: ['MP_PREP_DATE'],
      pageSize: 25,
      includePageRecords: false,
      sortField: 'updatedAt',
      sortDirection: 'desc',
      dateFieldId: 'MP_PREP_DATE',
      dateFrom: '2026-04-17',
      dateTo: '2026-04-23',
      maxAttempts: 3,
      failureMessage: 'Failed to load preset results.',
      fetchSortedBatchImpl
    });
    const expectation = expect(promise).rejects.toThrow('Failed to load preset results.');

    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(750);

    await expectation;
    expect(fetchSortedBatchImpl).toHaveBeenCalledTimes(3);
  });
});
