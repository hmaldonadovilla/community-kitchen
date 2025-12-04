import {
  AutoIncrementConfig,
  DedupRule,
  FormConfig,
  QuestionConfig,
  RecordMetadata,
  WebFormSubmission
} from '../../types';
import { evaluateDedupConflict, ExistingRecord } from '../dedup';
import { CacheEtagManager } from './cache';
import { HeaderColumns, RecordContext } from './types';
import { UploadService } from './uploads';

const AUTO_INCREMENT_PROPERTY_PREFIX = 'CK_AUTO_';

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

    const candidateValues: Record<string, any> = {};
    questions.forEach(q => {
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

    questions.forEach(q => {
      const colIdx = columns.fields[q.id];
      if (!colIdx) return;
      let value: any = '';

      if (q.type === 'LINE_ITEM_GROUP') {
        const rawLineItems = (formObject as any)[`${q.id}_json`] || (formObject as any)[q.id];
        if (rawLineItems && typeof rawLineItems === 'string') {
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

      candidateValues[q.id] = value ?? '';
      setIf(colIdx, value ?? '');
    });

    // Dedup check against existing rows (form scope only)
    if (dedupRules && dedupRules.length) {
      const existingRows = Math.max(0, sheet.getLastRow() - 1);
      if (existingRows > 0) {
        const data = sheet.getRange(2, 1, existingRows, headers.length).getValues();
        const existing: ExistingRecord[] = data.map(row => {
          const vals: Record<string, any> = {};
          Object.entries(columns.fields).forEach(([fid, idx]) => {
            vals[fid] = row[(idx as number) - 1];
          });
          return {
            id: columns.recordId ? row[columns.recordId - 1] : '',
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

    const newEtag = this.cacheManager.getSheetEtag(sheet, columns);
    const cachedRecord = this.buildSubmissionRecord(form.configSheet, questions, columns, valuesArray, recordId);
    if (cachedRecord) {
      this.cacheManager.cacheRecord(form.configSheet, newEtag, cachedRecord);
    }

    return { success: true, message: 'Saved to sheet', meta };
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
    const rawHeaderRow = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0];
    const existingHeaders = rawHeaderRow.map(h => (h ? h.toString().trim() : '')).filter(Boolean);
    const hasTimestamp = existingHeaders.some(h => h.toLowerCase() === 'timestamp');
    const baseHeaders = [
      ...(hasTimestamp ? ['Timestamp'] : []),
      'Language',
      ...questions.map(q => q.qEn || q.id),
      ...metaHeaders
    ];

    const headers: string[] = existingHeaders.length ? [...existingHeaders] : [];
    baseHeaders.forEach(label => {
      if (!headers.some(h => h.toLowerCase() === label.toLowerCase())) {
        headers.push(label);
      }
    });

    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');

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

    questions.forEach(q => {
      const idx = this.findHeader(headers, [q.qEn, q.id].filter(Boolean) as string[]);
      if (idx) columns.fields[q.id] = idx;
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
    questions.forEach(q => {
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
    if (!columns.updatedAt) return null;
    const timestamp = value instanceof Date ? value : new Date();
    sheet.getRange(rowIndex, columns.updatedAt, 1, 1).setValue(timestamp);
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
      return this.touchUpdatedAt(sheet, columns, rowIndex);
    }
    if (columns.status) {
      sheet.getRange(rowIndex, columns.status, 1, 1).setValue(value);
      return this.touchUpdatedAt(sheet, columns, rowIndex);
    }
    return null;
  }

  private findHeader(headers: string[], labels: string[]): number | undefined {
    if (!labels.length) return undefined;
    const lowered = headers.map(h => h.toLowerCase());
    for (const label of labels) {
      if (!label) continue;
      const idx = lowered.findIndex(h => h === label.toLowerCase() || h.startsWith(label.toLowerCase()));
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
