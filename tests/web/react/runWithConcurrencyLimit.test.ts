import { runWithConcurrencyLimit } from '../../../src/web/react/utils/runWithConcurrencyLimit';

describe('runWithConcurrencyLimit', () => {
  test('preserves item order while respecting the concurrency cap', async () => {
    let inFlight = 0;
    let maxInFlight = 0;

    const results = await runWithConcurrencyLimit([30, 5, 20, 10], 2, async (delay, index) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise(resolve => setTimeout(resolve, delay));
      inFlight -= 1;
      return `item-${index}`;
    });

    expect(results).toEqual(['item-0', 'item-1', 'item-2', 'item-3']);
    expect(maxInFlight).toBeLessThanOrEqual(2);
  });

  test('runs all items when the requested limit exceeds the list size', async () => {
    const results = await runWithConcurrencyLimit(['a', 'b'], 10, async value => value.toUpperCase());
    expect(results).toEqual(['A', 'B']);
  });
});
