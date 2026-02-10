/**
 * List view search helpers (pure functions).
 *
 * Keep this logic outside React components so it is easy to unit test.
 */
export const normalizeToIsoDateLocal = (value: any): string | null => {
  if (value === undefined || value === null || value === '') return null;

  // Apps Script often returns actual Date objects for DATE cells.
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const year = value.getFullYear();
    const month = (value.getMonth() + 1).toString().padStart(2, '0');
    const day = value.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  const raw = value.toString ? value.toString().trim() : `${value}`.trim();
  if (!raw) return null;

  // Canonical date-only string: YYYY-MM-DD (treat as local date to avoid timezone shifts).
  const ymd = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`;

  // Fall back to parsing arbitrary date strings.
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  const year = parsed.getFullYear();
  const month = (parsed.getMonth() + 1).toString().padStart(2, '0');
  const day = parsed.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * The list search clear icon is used to clear text entry only in text/advanced modes.
 * For date mode, it must also clear the applied filter so the list resets immediately.
 */
export const shouldClearAppliedQueryOnInputClear = (mode: string | null | undefined): boolean => {
  return (mode || '').toString().trim().toLowerCase() === 'date';
};

