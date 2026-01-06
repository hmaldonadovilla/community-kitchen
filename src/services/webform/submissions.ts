import {
  AutoIncrementConfig,
  DedupRule,
  FormConfig,
  QuestionConfig,
  RecordMetadata,
  WebFormSubmission
} from '../../types';
import { evaluateDedupConflict, ExistingRecord, findDedupConflict, DedupConflict } from '../dedup';
import { CacheEtagManager } from './cache';
import { buildResponsesRecordSchema, normalizeHeaderToken, parseHeaderKey, sanitizeHeaderCellText } from './recordSchema';
import { HeaderColumns, RecordContext } from './types';
import { UploadService } from './uploads';

const AUTO_INCREMENT_PROPERTY_PREFIX = 'CK_AUTO_';

const resolveSubgroupKey = (sub?: any): string => {
  if (!sub) return '';
  if (sub.id) return sub.id;
  // Phase 3 (Option A): subgroup IDs are required; label fallback is intentionally removed.
  return '';
};

export class SubmissionService {
  private ss: GoogleAppsScript.Spreadsheet.Spreadsheet;
  private uploadService: UploadService;
  private cacheManager: CacheEtagManager;
  private docProps: GoogleAppsScript.Properties.Properties | null;
  private autoIncrementState: Record<string, number>;

  constructor(
    ss: GoogleAppsScript.Spreadsheet.Spreadsheet,
    uploadService: UploadService,
    cacheManager: CacheEtagManager,
    docProps: GoogleAppsScript.Properties.Properties | null
  ) {
    this.ss = ss;
    this.uploadService = uploadService;
    this.cacheManager = cacheManager;
    this.docProps = docProps;
    this.autoIncrementState = {};
  }

  private applyUploadsToLineItemRows(rows: any, cfg: any): any {
    if (!rows || !Array.isArray(rows) || !cfg) return rows;
    const fields = Array.isArray(cfg.fields) ? cfg.fields : [];
    const fileFields = fields.filter((f: any) => f && f.type === 'FILE_UPLOAD');
    const subGroups = Array.isArray(cfg.subGroups) ? cfg.subGroups : [];

    return rows.map((row: any) => {
      if (!row || typeof row !== 'object') return row;
      const next: any = { ...row };

      // Upload FILE_UPLOAD fields at this level
      fileFields.forEach((field: any) => {
        const fieldId = (field.id || '').toString();
        if (!fieldId) return;
        next[fieldId] = this.uploadService.saveFiles(next[fieldId], field.uploadConfig);
      });

      // Recurse into subgroups (stored under their subgroup key)
      subGroups.forEach((sub: any) => {
        const key = resolveSubgroupKey(sub);
        if (!key) return;
        if (Array.isArray(next[key])) {
          next[key] = this.applyUploadsToLineItemRows(next[key], sub);
        }
      });

      return next;
    });
  }

  saveSubmissionWithId(
    formObject: WebFormSubmission,
    form: FormConfig,
    questions: QuestionConfig[],
    dedupRules: DedupRule[]
  ): { success: boolean; message: string; meta: RecordMetadata } {
    const formKey = (formObject.formKey || (formObject as any).form || '').toString();
    const langValue = Array.isArray((formObject as any).language)
      ? ((formObject as any).language[(formObject as any).language.length - 1] || (formObject as any).language[0])
      : (formObject as any).language;
    const languageRaw = (langValue || 'EN').toString().toUpperCase();
    const language = (['EN', 'FR', 'NL'].includes(languageRaw) ? languageRaw : 'EN') as 'EN' | 'FR' | 'NL';

    const { sheet, headers, columns } = this.ensureDestination(form.destinationTab || `${form.title} Responses`, questions);

    const now = new Date();
    const incomingId = ((formObject as any).id && (formObject as any).id.trim)
      ? ((formObject as any).id as any).trim()
      : (formObject as any).id;
    const recordId = incomingId || this.generateUuid();

    // Find existing row by id
    let existingRowIdx = -1;
    if (columns.recordId) {
      const dataRows = Math.max(0, sheet.getLastRow() - 1);
      const idRange =
        dataRows > 0 ? sheet.getRange(2, columns.recordId, dataRows, 1).getValues() : [];
      existingRowIdx = idRange.findIndex(r => (r[0] || '').toString() === recordId);
    }

    const valuesArray = new Array(headers.length).fill('');
    const setIf = (idx: number | undefined, value: any) => {
      if (!idx) return;
      valuesArray[idx - 1] = value ?? '';
    };

    setIf(columns.timestamp, now);
    setIf(columns.language, language);
    setIf(columns.recordId, recordId);

    // Preserve createdAt if updating
    let createdAtVal: any = now;
    if (existingRowIdx >= 0 && columns.createdAt) {
      const existing = sheet.getRange(2 + existingRowIdx, columns.createdAt, 1, 1).getValues()[0][0];
      createdAtVal = existing || now;
    }
    const updatedAtVal = existingRowIdx >= 0 ? now : createdAtVal;
    setIf(columns.createdAt, createdAtVal);
    setIf(columns.updatedAt, updatedAtVal);

    // Draft autosave: write status + protect closed records from background saves.
    const saveMode = ((formObject as any).__ckSaveMode || '').toString().trim().toLowerCase();
    if (saveMode === 'draft') {
      const statusValueRaw =
        ((formObject as any).__ckStatus || form.autoSave?.status || 'In progress')?.toString?.() || 'In progress';
      const statusValue = statusValueRaw.toString().trim() || 'In progress';

      // Determine the "status" column to write to (either a configured statusFieldId, or the default Status meta column).
      const statusFieldId = form.followupConfig?.statusFieldId;
      const statusFieldIdx =
        statusFieldId && columns.fields[statusFieldId] ? (columns.fields[statusFieldId] as number) : undefined;
      const metaStatusIdx = columns.status;
      const statusIdx = statusFieldIdx || metaStatusIdx;

      const readCellText = (colIdx?: number): string => {
        if (!colIdx || existingRowIdx < 0) return '';
        try {
          const raw = sheet.getRange(2 + existingRowIdx, colIdx, 1, 1).getValues()[0][0];
          return raw === undefined || raw === null ? '' : raw.toString();
        } catch (_) {
          return '';
        }
      };

      const existingStatusText = (() => {
        const fromField = statusFieldIdx ? readCellText(statusFieldIdx).trim() : '';
        const fromMeta = metaStatusIdx ? readCellText(metaStatusIdx).trim() : '';
        return (fromField || fromMeta || '').toString();
      })();
      const isClosed = existingStatusText.trim().toLowerCase() === 'closed';
      if (existingRowIdx >= 0 && isClosed) {
        return {
          success: false,
          message: 'Record is Closed and read-only.',
          meta: {
            id: recordId
          }
        };
      }

      setIf(statusIdx, statusValue);
    }

    const candidateValues: Record<string, any> = {};
    questions.filter(q => q.type !== 'BUTTON').forEach(q => {
      if (q.type === 'TEXT' && q.autoIncrement) {
        const currentVal = (formObject as any)[q.id];
        if (!currentVal) {
          const generated = this.generateAutoIncrementValue(form.configSheet, q.id, q.autoIncrement);
          if (generated) {
            (formObject as any)[q.id] = generated;
          }
        }
      }
    });

    questions.filter(q => q.type !== 'BUTTON').forEach(q => {
      const colIdx = columns.fields[q.id];
      if (!colIdx) return;
      let value: any = '';

      if (q.type === 'LINE_ITEM_GROUP') {
        const rawLineItems = (formObject as any)[`${q.id}_json`] || (formObject as any)[q.id];
        let parsed: any = null;
        if (rawLineItems && typeof rawLineItems === 'string') {
          try {
            parsed = JSON.parse(rawLineItems);
          } catch (_) {
            parsed = null;
          }
        } else if (Array.isArray(rawLineItems)) {
          parsed = rawLineItems;
        }

        if (parsed && q.lineItemConfig) {
          try {
            const processed = this.applyUploadsToLineItemRows(parsed, q.lineItemConfig);
            value = JSON.stringify(processed);
          } catch (_) {
            try {
              value = JSON.stringify(parsed);
            } catch (_) {
              value = '';
            }
          }
        } else if (rawLineItems && typeof rawLineItems === 'string') {
          value = rawLineItems;
        } else if (rawLineItems) {
          try {
            value = JSON.stringify(rawLineItems);
          } catch (_) {
            value = '';
          }
        }
      } else if (q.type === 'FILE_UPLOAD') {
        value = this.uploadService.saveFiles((formObject as any)[q.id], q.uploadConfig);
      } else {
        value = (formObject as any)[q.id];
        if (Array.isArray(value)) {
          value = value.join(', ');
        }
      }

      // Ensure DATE fields are stored as "date-only" values in Sheets (midnight local time).
      if (q.type === 'DATE') {
        value = this.normalizeDateOnlyCell(value);
      }

      candidateValues[q.id] = value ?? '';
      setIf(colIdx, value ?? '');
    });

    // Dedup check against existing rows (form scope only).
    // We enforce this for drafts and submits so duplicates cannot be created via autosave races.
    const shouldDedupCheck = Boolean(dedupRules && dedupRules.length);
    if (shouldDedupCheck) {
      const existingRows = Math.max(0, sheet.getLastRow() - 1);
      if (existingRows > 0) {
        const data = sheet.getRange(2, 1, existingRows, headers.length).getValues();
        const existing: ExistingRecord[] = data.map((row, idx) => {
          const vals: Record<string, any> = {};
          Object.entries(columns.fields).forEach(([fid, idx]) => {
            vals[fid] = row[(idx as number) - 1];
          });
          return {
            id: columns.recordId ? row[columns.recordId - 1] : '',
            rowNumber: 2 + idx,
            values: vals
          };
        });
        const conflict = evaluateDedupConflict(dedupRules, { id: recordId, values: candidateValues }, existing, language);
        if (conflict) {
          return { success: false, message: conflict, meta: { id: recordId, createdAt: createdAtVal, updatedAt: undefined } };
        }
      }
    }

    if (existingRowIdx >= 0) {
      sheet.getRange(2 + existingRowIdx, 1, 1, headers.length).setValues([valuesArray]);
    } else {
      sheet.appendRow(valuesArray);
    }

    const meta: RecordMetadata = {
      id: recordId,
      createdAt: createdAtVal instanceof Date ? createdAtVal.toISOString() : createdAtVal,
      updatedAt: updatedAtVal instanceof Date ? updatedAtVal.toISOString() : updatedAtVal
    };

    const newEtag = this.cacheManager.bumpSheetEtag(
      sheet,
      columns,
      existingRowIdx >= 0 ? 'saveSubmission.update' : 'saveSubmission.create'
    );
    const cachedRecord = this.buildSubmissionRecord(form.configSheet, questions, columns, valuesArray, recordId);
    if (cachedRecord) {
      this.cacheManager.cacheRecord(form.configSheet, newEtag, cachedRecord);
    }

    return { success: true, message: 'Saved to sheet', meta };
  }

  /**
   * Check whether the given (possibly new) record would violate any dedup rule.
   *
   * This is used by the React client to block creating new records from preset buttons
   * (and to pause draft autosave) once all dedup keys are populated.
   */
  checkDedupConflict(
    formObject: WebFormSubmission,
    form: FormConfig,
    questions: QuestionConfig[],
    dedupRules: DedupRule[]
  ): { success: boolean; conflict?: DedupConflict; message?: string } {
    try {
      const langValue = Array.isArray((formObject as any).language)
        ? ((formObject as any).language[(formObject as any).language.length - 1] || (formObject as any).language[0])
        : (formObject as any).language;
      const languageRaw = (langValue || 'EN').toString().toUpperCase();
      const language = (['EN', 'FR', 'NL'].includes(languageRaw) ? languageRaw : 'EN') as 'EN' | 'FR' | 'NL';

      if (!dedupRules || !dedupRules.length) return { success: true };

      const { sheet, headers, columns } = this.ensureDestination(form.destinationTab || `${form.title} Responses`, questions);

      const incomingId = ((formObject as any).id && (formObject as any).id.trim)
        ? ((formObject as any).id as any).trim()
        : (formObject as any).id;
      const recordId = incomingId ? incomingId.toString() : '';

      // Build candidate values (best-effort) without mutating the sheet (no uploads / no auto-increment).
      const candidateValues: Record<string, any> = {};
      questions
        .filter(q => q && q.type !== 'BUTTON')
        .forEach(q => {
          let value: any = '';
          if (q.type === 'LINE_ITEM_GROUP') {
            const rawLineItems = (formObject as any)[`${q.id}_json`] || (formObject as any)[q.id];
            value = rawLineItems ?? '';
          } else if (q.type === 'FILE_UPLOAD') {
            // Dedup rules should not rely on FILE_UPLOAD; treat as raw value.
            value = (formObject as any)[q.id];
          } else {
            value = (formObject as any)[q.id];
            if (Array.isArray(value)) value = value.join(', ');
          }
          // Match `saveSubmissionWithId` behavior: normalize DATE fields to date-only so dedup comparisons
          // are consistent whether the client sends "YYYY-MM-DD", a Date instance, or a serialized date string.
          if (q.type === 'DATE') {
            value = this.normalizeDateOnlyCell(value);
          }
          candidateValues[q.id] = value ?? '';
        });

      const existingRows = Math.max(0, sheet.getLastRow() - 1);
      if (existingRows <= 0) return { success: true };

      const data = sheet.getRange(2, 1, existingRows, headers.length).getValues();
      const existing: ExistingRecord[] = data.map((row, idx) => {
        const vals: Record<string, any> = {};
        Object.entries(columns.fields).forEach(([fid, idx]) => {
          vals[fid] = row[(idx as number) - 1];
        });
        return {
          id: columns.recordId ? row[columns.recordId - 1] : '',
          rowNumber: 2 + idx,
          values: vals
        };
      });

      const conflict = findDedupConflict(dedupRules, { id: recordId, values: candidateValues }, existing, language);
      if (!conflict) return { success: true };
      return { success: true, conflict };
    } catch (err: any) {
      return {
        success: false,
        message: (err?.message || err?.toString?.() || 'Failed to check dedup.').toString()
      };
    }
  }

  ensureDestination(
    destinationTab: string,
    questions: QuestionConfig[]
  ): { sheet: GoogleAppsScript.Spreadsheet.Sheet; headers: string[]; columns: HeaderColumns } {
    let sheet = this.ss.getSheetByName(destinationTab);
    if (!sheet) {
      sheet = this.ss.insertSheet(destinationTab);
    }

    const metaHeaders = ['Record ID', 'Created At', 'Updated At', 'Status', 'PDF URL'];
    const lastColumn = Math.max(sheet.getLastColumn(), 1);
    const rawHeaderRow = sheet.getRange(1, 1, 1, lastColumn).getValues()[0] || [];
    const rawExistingHeaders = rawHeaderRow.map(h => (h ? h.toString().trim() : ''));
    const existingHeaders = rawExistingHeaders.map(h => sanitizeHeaderCellText(h));

    const normalizedExisting = existingHeaders.map(h => normalizeHeaderToken(h));
    const hasTimestamp = normalizedExisting.some(h => h === 'timestamp');
    const hasMeaningfulHeaders = normalizedExisting.some(h => !!h);

    // Canonical record schema for question fields: Label [ID]
    const schema = buildResponsesRecordSchema(questions);

    // Track question label collisions so we can migrate legacy label headers only when unambiguous.
    const labelCounts = (() => {
      const counts: Record<string, number> = {};
      questions
        .filter(q => q && q.type !== 'BUTTON')
        .forEach(q => {
          const key = normalizeHeaderToken((q.qEn || '').toString());
          if (!key) return;
          counts[key] = (counts[key] || 0) + 1;
        });
      return counts;
    })();

    // Work on a mutable header row.
    // - If the sheet is new/blank, start clean so we can create `Language`, fields, then meta in a predictable order.
    // - If the sheet already has content, preserve the existing order and migrate in-place when safe.
    const headers: string[] = hasMeaningfulHeaders ? [...existingHeaders] : [];

    const headerInfo = () =>
      headers.map(h => {
        const parsed = parseHeaderKey(h);
        const rawNorm = normalizeHeaderToken(parsed.raw);
        const keyNorm = parsed.key ? normalizeHeaderToken(parsed.key) : undefined;
        return { raw: parsed.raw, rawNorm, key: parsed.key, keyNorm };
      });

    const ensureHeader = (label: string) => {
      const target = normalizeHeaderToken(label);
      const infos = headerInfo();
      const idx = infos.findIndex(h => h.rawNorm === target);
      if (idx >= 0) return;
      headers.push(label);
    };

    // Ensure core non-question columns.
    if (hasTimestamp) ensureHeader('Timestamp');
    // Ensure Language exists before we start appending question fields (new sheets get a sensible order).
    if (!headers.length) {
      headers.push('Language');
    } else {
      ensureHeader('Language');
    }

    // Ensure each question has a stable column key and migrate legacy headers when safe.
    const fieldColumns: Record<string, number> = {};
    schema.forEach(field => {
      const desiredHeader = field.header;
      const idNorm = normalizeHeaderToken(field.id);
      const infos = headerInfo();

      // 1) Preferred: bracket key match (Label [ID]).
      const byKey = infos.findIndex(h => h.keyNorm === idNorm);
      if (byKey >= 0) {
        fieldColumns[field.id] = byKey + 1;
        return;
      }

      // 2) Legacy: header is the ID (ID-only).
      const byId = infos.findIndex(h => h.rawNorm === idNorm);
      if (byId >= 0) {
        // Migrate in-place to `Label [ID]` for readability + stability.
        headers[byId] = desiredHeader;
        fieldColumns[field.id] = byId + 1;
        return;
      }

      // 3) Legacy: header is the English label (label-only) – only safe when label is unique in config and sheet.
      const labelKey = normalizeHeaderToken(field.label);
      if (labelKey && labelCounts[labelKey] === 1) {
        const matches = infos
          .map((h, idx) => ({ h, idx }))
          .filter(entry => entry.h.rawNorm === labelKey)
          .map(entry => entry.idx);
        if (matches.length === 1) {
          const idx = matches[0];
          headers[idx] = desiredHeader;
          fieldColumns[field.id] = idx + 1;
          return;
        }
      }

      // 4) New: append a new column with the canonical header.
      headers.push(desiredHeader);
      fieldColumns[field.id] = headers.length;
    });

    // Ensure meta headers after the question field columns.
    metaHeaders.forEach(ensureHeader);

    const headersChanged =
      headers.length !== rawExistingHeaders.length ||
      headers.some((h, idx) => (h || '') !== (rawExistingHeaders[idx] || ''));
    if (headersChanged) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    }

    const columns: HeaderColumns = {
      timestamp: this.findHeader(headers, ['timestamp']),
      language: this.findHeader(headers, ['language']),
      recordId: this.findHeader(headers, ['record id', 'id']),
      createdAt: this.findHeader(headers, ['created at']),
      updatedAt: this.findHeader(headers, ['updated at']),
      status: this.findHeader(headers, ['status']),
      pdfUrl: this.findHeader(headers, ['pdf url', 'pdf link']),
      fields: {}
    };

    Object.entries(fieldColumns).forEach(([fid, idx]) => {
      if (idx) columns.fields[fid] = idx;
    });

    return { sheet, headers, columns };
  }

  buildSubmissionRecord(
    formKey: string,
    questions: QuestionConfig[],
    columns: HeaderColumns,
    rowValues: any[],
    fallbackId?: string
  ): WebFormSubmission | null {
    const recordId = fallbackId || (columns.recordId ? (rowValues[columns.recordId - 1] || '').toString() : '');
    if (!recordId) return null;
    const values: Record<string, any> = {};
    questions.filter(q => q.type !== 'BUTTON').forEach(q => {
      const colIdx = columns.fields[q.id];
      if (!colIdx) return;
      let value = rowValues[colIdx - 1];
      if (q.type === 'LINE_ITEM_GROUP' && typeof value === 'string') {
        try {
          value = JSON.parse(value);
        } catch (_) {
          // keep raw string
        }
      }
      values[q.id] = value ?? '';
    });
    const languageIdx = columns.language ? columns.language - 1 : 1;
    const languageRaw = (rowValues[languageIdx] || 'EN').toString().toUpperCase();
    const language = (['EN', 'FR', 'NL'].includes(languageRaw) ? languageRaw : 'EN') as 'EN' | 'FR' | 'NL';
    const statusValue = columns.status ? rowValues[columns.status - 1] : '';
    const pdfLinkValue = columns.pdfUrl ? rowValues[columns.pdfUrl - 1] : '';
    return {
      formKey,
      language,
      values,
      id: recordId,
      createdAt: columns.createdAt ? this.asIso(rowValues[columns.createdAt - 1]) : undefined,
      updatedAt: columns.updatedAt ? this.asIso(rowValues[columns.updatedAt - 1]) : undefined,
      status: statusValue ? statusValue.toString() : undefined,
      pdfUrl: pdfLinkValue ? pdfLinkValue.toString() : undefined
    };
  }

  getRecordContext(
    form: FormConfig,
    questions: QuestionConfig[],
    recordId: string
  ): RecordContext | null {
    const { sheet, headers, columns } = this.ensureDestination(form.destinationTab || `${form.title} Responses`, questions);
    const rowIndex = this.findRowIndexById(sheet, columns, recordId);
    if (rowIndex < 0) return null;
    const rowValues = sheet.getRange(rowIndex, 1, 1, headers.length).getValues()[0];
    const record = this.buildSubmissionRecord(form.configSheet, questions, columns, rowValues, recordId);
    return { sheet, headers, columns, rowIndex, rowValues, record };
  }

  refreshRecordCache(
    formKey: string,
    questions: QuestionConfig[],
    context: RecordContext
  ): void {
    const rowValues = context.sheet.getRange(context.rowIndex, 1, 1, context.headers.length).getValues()[0];
    const record = this.buildSubmissionRecord(formKey, questions, context.columns, rowValues, context.record?.id);
    if (record) {
      const etag = this.cacheManager.getSheetEtag(context.sheet, context.columns);
      this.cacheManager.cacheRecord(formKey, etag, record);
    }
  }

  touchUpdatedAt(
    sheet: GoogleAppsScript.Spreadsheet.Sheet,
    columns: HeaderColumns,
    rowIndex: number,
    value?: Date
  ): Date | null {
    if (!columns.updatedAt) {
      // Still bump etag to invalidate list/record caches when callers mutate other columns (e.g., status/pdf URL).
      this.cacheManager.bumpSheetEtag(sheet, columns, 'touchUpdatedAt.noColumn');
      return null;
    }
    const timestamp = value instanceof Date ? value : new Date();
    sheet.getRange(rowIndex, columns.updatedAt, 1, 1).setValue(timestamp);
    this.cacheManager.bumpSheetEtag(sheet, columns, 'touchUpdatedAt');
    return timestamp;
  }

  writeStatus(
    sheet: GoogleAppsScript.Spreadsheet.Sheet,
    columns: HeaderColumns,
    rowIndex: number,
    value: string | undefined,
    statusFieldId?: string
  ): Date | null {
    if (!value) return null;
    if (statusFieldId && columns.fields[statusFieldId]) {
      sheet.getRange(rowIndex, columns.fields[statusFieldId] as number, 1, 1).setValue(value);
      const updated = this.touchUpdatedAt(sheet, columns, rowIndex);
      if (!updated) {
        this.cacheManager.bumpSheetEtag(sheet, columns, 'writeStatus.noUpdatedAt');
      }
      return updated;
    }
    if (columns.status) {
      sheet.getRange(rowIndex, columns.status, 1, 1).setValue(value);
      const updated = this.touchUpdatedAt(sheet, columns, rowIndex);
      if (!updated) {
        this.cacheManager.bumpSheetEtag(sheet, columns, 'writeStatus.noUpdatedAt');
      }
      return updated;
    }
    return null;
  }

  private findHeader(headers: string[], labels: string[]): number | undefined {
    if (!labels.length) return undefined;
    const lowered = headers.map(h => normalizeHeaderToken(h));
    for (const label of labels) {
      if (!label) continue;
      const target = normalizeHeaderToken(label);
      const idx = lowered.findIndex(h => h === target || (target && h.startsWith(target + ' [')));
      if (idx >= 0) return idx + 1; // 1-based
    }
    return undefined;
  }

  private findRowIndexById(
    sheet: GoogleAppsScript.Spreadsheet.Sheet,
    columns: HeaderColumns,
    recordId: string
  ): number {
    if (!columns.recordId) return -1;
    const dataRows = Math.max(0, sheet.getLastRow() - 1);
    if (dataRows <= 0) return -1;
    const idRange = sheet.getRange(2, columns.recordId, dataRows, 1).getValues();
    const matchIndex = idRange.findIndex(r => (r[0] || '').toString() === recordId);
    if (matchIndex < 0) return -1;
    return 2 + matchIndex;
  }

  private asIso(value: any): string | undefined {
    if (value instanceof Date) return value.toISOString();
    if (!value) return undefined;
    try {
      const d = new Date(value);
      if (!isNaN(d.getTime())) return d.toISOString();
    } catch (_) {
      // ignore
    }
    return value.toString();
  }

  private normalizeDateOnlyCell(value: any): any {
    if (value === undefined || value === null || value === '') return '';

    const toYmd = (d: Date): string => {
      try {
        if (typeof Utilities !== 'undefined' && Utilities?.formatDate && typeof Session !== 'undefined' && Session?.getScriptTimeZone) {
          return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
        }
      } catch (_) {
        // fall through
      }
      const y = d.getFullYear();
      const m = (d.getMonth() + 1).toString().padStart(2, '0');
      const day = d.getDate().toString().padStart(2, '0');
      return `${y}-${m}-${day}`;
    };

    const fromYmd = (ymd: string): Date | null => {
      const m = (ymd || '').toString().trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (!m) return null;
      const year = Number(m[1]);
      const month = Number(m[2]);
      const day = Number(m[3]);
      if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
      return new Date(year, month - 1, day);
    };

    if (value instanceof Date) {
      const ymd = toYmd(value);
      return fromYmd(ymd) || value;
    }

    if (typeof value === 'string') {
      const s = value.toString().trim();
      if (!s) return '';
      const direct = fromYmd(s);
      if (direct) return direct;
      try {
        const d = new Date(s);
        if (!isNaN(d.getTime())) {
          const ymd = toYmd(d);
          return fromYmd(ymd) || direct || s;
        }
      } catch (_) {
        // ignore
      }
      return s;
    }

    return value;
  }

  private generateAutoIncrementValue(
    formKey: string,
    fieldId: string,
    config?: AutoIncrementConfig
  ): string | undefined {
    const key = this.getAutoIncrementPropertyKey(formKey, fieldId, config?.propertyKey);
    let current = this.autoIncrementState[key] || 0;
    if (this.docProps) {
      try {
        const stored = this.docProps.getProperty(key);
        const parsed = stored ? parseInt(stored, 10) : NaN;
        if (!Number.isNaN(parsed)) {
          current = parsed;
        }
      } catch (_) {
        // ignore
      }
    }
    const next = current + 1;
    const padLength = Math.max(1, Math.min(20, config?.padLength || 6));
    const prefix = config?.prefix || '';
    const formatted = `${prefix}${next.toString().padStart(padLength, '0')}`;
    this.autoIncrementState[key] = next;
    if (this.docProps) {
      try {
        this.docProps.setProperty(key, next.toString());
      } catch (_) {
        // ignore
      }
    }
    return formatted;
  }

  private getAutoIncrementPropertyKey(formKey: string, fieldId: string, override?: string): string {
    const base = (override && override.trim()) || `${formKey || ''}::${fieldId}`;
    return `${AUTO_INCREMENT_PROPERTY_PREFIX}${this.cacheManager.digestKey(base)}`;
  }

  private generateUuid(): string {
    try {
      if (typeof Utilities !== 'undefined' && (Utilities as any).getUuid) {
        return (Utilities as any).getUuid();
      }
    } catch (_) {
      // ignore
    }
    return 'uuid-' + Math.random().toString(16).slice(2);
  }
}
