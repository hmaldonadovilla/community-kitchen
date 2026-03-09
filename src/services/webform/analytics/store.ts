import { AnalyticsSnapshot, AnalyticsSnapshotItem, FormConfig } from '../../../types';

const ANALYTICS_SHEET_PREFIX = '__CK_ANALYTICS__';
const SHEET_HEADERS = [
  'Metric ID',
  'Label JSON',
  'Value JSON',
  'Value Number',
  'Value Text',
  'Placements JSON',
  'Updated At (ISO)',
  'Revision',
  'Metadata JSON'
];

const normalizeSheetNamePart = (raw: string): string => {
  return (raw || '')
    .toString()
    .replace(/[:\\/?*\[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const digestShort = (raw: string): string => {
  try {
    if (
      typeof Utilities !== 'undefined' &&
      (Utilities as any).computeDigest &&
      (Utilities as any).base64Encode &&
      (Utilities as any).DigestAlgorithm
    ) {
      const bytes = (Utilities as any).computeDigest((Utilities as any).DigestAlgorithm.MD5, raw);
      return (Utilities as any).base64Encode(bytes).replace(/=+$/, '').slice(0, 10);
    }
  } catch (_) {
    // ignore
  }
  const text = (raw || '').toString();
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(16).slice(0, 10);
};

export const getAnalyticsSheetName = (form: FormConfig): string => {
  const destination = (form.destinationTab || `${form.title} Responses`).toString();
  const base = normalizeSheetNamePart(destination || form.configSheet || form.title || 'Responses') || 'Responses';
  const suffix = digestShort(`${form.configSheet || ''}|${destination}|${form.title || ''}`);
  const head = base.length > 34 ? base.slice(0, 34).trim() : base;
  return `${ANALYTICS_SHEET_PREFIX}${head}__${suffix}`;
};

const parseJsonCell = (raw: any): any => {
  if (raw === undefined || raw === null || raw === '') return undefined;
  if (typeof raw === 'object') return raw;
  const text = raw.toString();
  if (!text.trim()) return undefined;
  try {
    return JSON.parse(text);
  } catch (_) {
    return undefined;
  }
};

const ensureHeader = (sheet: GoogleAppsScript.Spreadsheet.Sheet): void => {
  const width = Math.max(sheet.getLastColumn(), SHEET_HEADERS.length, 1);
  const current = sheet.getRange(1, 1, 1, width).getValues()[0] || [];
  const normalized = current.map(cell => (cell || '').toString().trim());
  const needsWrite =
    normalized.length < SHEET_HEADERS.length ||
    SHEET_HEADERS.some((header, idx) => (normalized[idx] || '') !== header);
  if (!needsWrite) return;
  sheet.getRange(1, 1, 1, SHEET_HEADERS.length).setValues([SHEET_HEADERS]).setFontWeight('bold');
};

export const ensureAnalyticsSheet = (
  ss: GoogleAppsScript.Spreadsheet.Spreadsheet,
  form: FormConfig
): { sheet: GoogleAppsScript.Spreadsheet.Sheet; sheetName: string } => {
  const sheetName = getAnalyticsSheetName(form);
  let sheet = ss.getSheetByName(sheetName);
  let created = false;
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    created = true;
  }
  ensureHeader(sheet);
  try {
    if (created && typeof (sheet as any).hideSheet === 'function') {
      (sheet as any).hideSheet();
    }
  } catch (_) {
    // ignore
  }
  return { sheet, sheetName };
};

export const readAnalyticsSnapshot = (
  ss: GoogleAppsScript.Spreadsheet.Spreadsheet,
  form: FormConfig
): AnalyticsSnapshot => {
  const { sheet } = ensureAnalyticsSheet(ss, form);
  const formKey = (form.configSheet || form.title || '').toString().trim();
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    return {
      formKey,
      revision: 0,
      updatedAt: '',
      items: []
    };
  }
  const rowCount = Math.max(0, lastRow - 1);
  const values = sheet.getRange(2, 1, rowCount, SHEET_HEADERS.length).getValues() || [];
  const items: AnalyticsSnapshotItem[] = [];
  let revision = 0;
  let updatedAt = '';

  values.forEach(row => {
    const id = (row[0] || '').toString().trim();
    if (!id) return;
    const label = parseJsonCell(row[1]);
    const value = parseJsonCell(row[2]);
    const valueNumberRaw = Number(row[3]);
    const valueNumber = Number.isFinite(valueNumberRaw) ? valueNumberRaw : undefined;
    const valueText = row[4] !== undefined && row[4] !== null ? row[4].toString() : '';
    const placementsParsed = parseJsonCell(row[5]);
    const placements = Array.isArray(placementsParsed)
      ? placementsParsed
          .map(entry => (entry === undefined || entry === null ? '' : entry.toString().trim()))
          .filter(Boolean)
      : [];
    const itemUpdatedAt = (row[6] || '').toString().trim();
    const itemRevisionRaw = Number(row[7]);
    const itemRevision = Number.isFinite(itemRevisionRaw) && itemRevisionRaw > 0 ? itemRevisionRaw : 0;
    const metadata = parseJsonCell(row[8]);
    if (itemRevision > revision) revision = itemRevision;
    if (itemUpdatedAt && itemUpdatedAt > updatedAt) updatedAt = itemUpdatedAt;
    items.push({
      id,
      label,
      value,
      valueNumber,
      valueText,
      valueType: undefined,
      placements: placements.length ? (placements as any) : ['analyticsPage'],
      updatedAt: itemUpdatedAt,
      revision: itemRevision,
      metadata: metadata && typeof metadata === 'object' ? metadata : undefined
    });
  });

  return {
    formKey,
    revision,
    updatedAt,
    items
  };
};

export const writeAnalyticsSnapshot = (
  ss: GoogleAppsScript.Spreadsheet.Spreadsheet,
  form: FormConfig,
  items: Array<Omit<AnalyticsSnapshotItem, 'updatedAt' | 'revision'>>
): AnalyticsSnapshot => {
  const { sheet } = ensureAnalyticsSheet(ss, form);
  const current = readAnalyticsSnapshot(ss, form);
  const nextRevision = current.revision + 1;
  const updatedAt = new Date().toISOString();
  const nextItems: AnalyticsSnapshotItem[] = (items || []).map(item => ({
    ...item,
    updatedAt,
    revision: nextRevision
  }));

  const existingRows = Math.max(0, sheet.getLastRow() - 1);
  const rowCount = Math.max(existingRows, nextItems.length);
  if (rowCount > 0) {
    const rows = Array.from({ length: rowCount }, (_, idx) => {
      if (idx >= nextItems.length) return new Array(SHEET_HEADERS.length).fill('');
      const item = nextItems[idx];
      return [
        item.id || '',
        JSON.stringify(item.label ?? null),
        JSON.stringify(item.value ?? null),
        item.valueNumber !== undefined ? item.valueNumber : '',
        item.valueText || '',
        JSON.stringify(item.placements || []),
        item.updatedAt || '',
        item.revision || nextRevision,
        JSON.stringify(item.metadata || {})
      ];
    });
    sheet.getRange(2, 1, rowCount, SHEET_HEADERS.length).setValues(rows);
  }

  return {
    formKey: (form.configSheet || form.title || '').toString().trim(),
    revision: nextRevision,
    updatedAt,
    items: nextItems
  };
};

