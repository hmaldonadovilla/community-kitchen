/**
 * Runs async work over a list while capping the number of concurrent tasks.
 *
 * Owner: WebForm UI (React)
 */
export const runWithConcurrencyLimit = async <T, R>(
  items: T[],
  limitRaw: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> => {
  const list = Array.isArray(items) ? items : [];
  if (!list.length) return [];
  const limit = Math.max(1, Math.floor(limitRaw || 1));
  const results: R[] = new Array(list.length);
  let nextIndex = 0;

  const runWorker = async () => {
    while (nextIndex < list.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await worker(list[currentIndex], currentIndex);
    }
  };

  const workerCount = Math.min(limit, list.length);
  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
  return results;
};
