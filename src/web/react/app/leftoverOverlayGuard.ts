import { resolveLocalizedString } from '../../i18n';
import type { FieldValue, LangCode } from '../../types';

type LeftoverRowLike = {
  id?: string;
  values?: Record<string, FieldValue>;
};

type IncompleteEntireLeftoverOptions = {
  prepTypeFieldId?: string;
  prepTypeValue?: string;
  quantityFieldId?: string;
  minQuantity?: number;
};

export type IncompleteEntireLeftoverOverlayDialogCopy = {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  showCancel: boolean;
  showCloseButton: boolean;
  dismissOnBackdrop: boolean;
};

const DEFAULT_PREP_TYPE_FIELD_ID = 'PREP_TYPE';
const DEFAULT_PREP_TYPE_VALUE = 'Entire dish';
const DEFAULT_QUANTITY_FIELD_ID = 'PREP_QTY';
const DEFAULT_MIN_QUANTITY = 0;

const normalizeString = (raw: unknown): string => {
  if (raw === undefined || raw === null) return '';
  try {
    return raw.toString().trim();
  } catch (_) {
    return '';
  }
};

const normalizeNumber = (raw: unknown): number | null => {
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  const normalized = normalizeString(raw).replace(',', '.');
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

export const collectIncompleteEntireLeftoverRowIds = (
  rows: LeftoverRowLike[],
  options?: IncompleteEntireLeftoverOptions
): string[] => {
  const prepTypeFieldId = normalizeString(options?.prepTypeFieldId || DEFAULT_PREP_TYPE_FIELD_ID);
  const prepTypeValue = normalizeString(options?.prepTypeValue || DEFAULT_PREP_TYPE_VALUE).toLowerCase();
  const quantityFieldId = normalizeString(options?.quantityFieldId || DEFAULT_QUANTITY_FIELD_ID);
  const minQuantityRaw = normalizeNumber(options?.minQuantity);
  const minQuantity = minQuantityRaw === null ? DEFAULT_MIN_QUANTITY : minQuantityRaw;
  const out: string[] = [];
  const seen = new Set<string>();

  (Array.isArray(rows) ? rows : []).forEach(row => {
    const rowId = normalizeString((row as any)?.id);
    if (!rowId || seen.has(rowId)) return;
    const rowValues = ((row as any)?.values || {}) as Record<string, FieldValue>;
    const prepType = normalizeString((rowValues as any)[prepTypeFieldId]).toLowerCase();
    if (!prepType || prepType !== prepTypeValue) return;
    const quantity = normalizeNumber((rowValues as any)[quantityFieldId]);
    if (quantity !== null && quantity >= minQuantity) return;
    seen.add(rowId);
    out.push(rowId);
  });

  return out;
};

export const resolveIncompleteEntireLeftoverOverlayDialogCopy = (
  language: LangCode
): IncompleteEntireLeftoverOverlayDialogCopy => {
  return {
    title: resolveLocalizedString(
      {
        en: 'Missing Entire leftover number of portions.',
        fr: 'Missing Entire leftover number of portions.',
        nl: 'Missing Entire leftover number of portions.'
      },
      language,
      'Missing Entire leftover number of portions.'
    ),
    message: resolveLocalizedString(
      {
        en:
          "Enter the number of portion this leftover dish will yield.\n\nEnter 0 if the dish will be fully combined with today's dish in which case its ingredients will be added to today's dish ingredients on the Report.\n\nIf value > 0, the leftover will be shown as an entire dish with its recipe and ingredients.\n\nIf no value is entered, this incomplete record will be removed permanently.",
        fr:
          "Enter the number of portion this leftover dish will yield.\n\nEnter 0 if the dish will be fully combined with today's dish in which case its ingredients will be added to today's dish ingredients on the Report.\n\nIf value > 0, the leftover will be shown as an entire dish with its recipe and ingredients.\n\nIf no value is entered, this incomplete record will be removed permanently.",
        nl:
          "Enter the number of portion this leftover dish will yield.\n\nEnter 0 if the dish will be fully combined with today's dish in which case its ingredients will be added to today's dish ingredients on the Report.\n\nIf value > 0, the leftover will be shown as an entire dish with its recipe and ingredients.\n\nIf no value is entered, this incomplete record will be removed permanently."
      },
      language,
      ''
    ),
    confirmLabel: resolveLocalizedString(
      {
        en: 'Discard incomplete leftover record.',
        fr: 'Discard incomplete leftover record.',
        nl: 'Discard incomplete leftover record.'
      },
      language,
      'Discard incomplete leftover record.'
    ),
    cancelLabel: resolveLocalizedString(
      {
        en: 'Continue editing',
        fr: 'Continue editing',
        nl: 'Continue editing'
      },
      language,
      'Continue editing'
    ),
    showCancel: true,
    showCloseButton: false,
    dismissOnBackdrop: false
  };
};
