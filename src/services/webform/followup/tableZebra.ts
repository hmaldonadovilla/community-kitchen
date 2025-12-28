/**
 * Zebra striping helpers for rendered Google Doc tables.
 *
 * We intentionally apply shading at the cell level (not row), since TableRow
 * doesn't reliably expose background APIs across Apps Script runtimes.
 */

export const DEFAULT_ZEBRA_STRIPE_COLOR = '#f1f5f9'; // slate-100

export const applyZebraStripeToRow = (
  row: GoogleAppsScript.Document.TableRow,
  opts?: { stripe: boolean; color?: string }
): void => {
  if (!row || !opts?.stripe) return;
  const color = (opts.color || DEFAULT_ZEBRA_STRIPE_COLOR).toString();
  if (!color) return;
  for (let c = 0; c < row.getNumCells(); c++) {
    try {
      row.getCell(c).setBackgroundColor(color);
    } catch (_) {
      // Best-effort: if background isn't supported in some contexts, skip.
    }
  }
};


