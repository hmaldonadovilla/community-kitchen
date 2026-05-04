/**
 * Reads a monotonic browser clock for client-side diagnostics.
 *
 * Boundary: this module only abstracts the clock source. It does not mark,
 * measure, log, or interpret performance events.
 */
export const getPerfNow = (): number => {
  try {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
      return performance.now();
    }
  } catch {
    // ignore performance access failures
  }
  return Date.now();
};
