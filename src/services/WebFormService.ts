import { Dashboard } from '../config/Dashboard';
import { ConfigSheet } from '../config/ConfigSheet';
import { buildWebFormHtml } from './WebFormTemplate';
import {
  DedupRule,
  PaginatedResult,
  RecordMetadata,
  SubmissionBatchResult,
  FormConfig,
  QuestionConfig,
  WebFormDefinition,
  WebFormSubmission,
  WebQuestionDefinition,
  ListViewConfig
} from '../types';
import { evaluateDedupConflict, ExistingRecord } from './dedup';

const DEBUG_PROPERTY_KEY = 'CK_DEBUG';
const CACHE_TTL_SECONDS = 300;
const CACHE_PREFIX = 'CK_CACHE';
const ETAG_PROPERTY_PREFIX = 'CK_ETAG_';

const debugLog = (message: string, payload?: Record<string, any>): void => {
  if (!isDebugEnabled()) return;
  const serialized = payload ? ` ${JSON.stringify(payload)}` : '';
  const entry = `[WebFormService] ${message}${serialized}`;
  if (typeof Logger !== 'undefined' && Logger.log) {
    try {
      Logger.log(entry);
    } catch (_) {
      // ignore
    }
  }
  if (typeof console !== 'undefined' && console.log) {
    try {
      console.log(entry);
    } catch (_) {
      // ignore
    }
  }
};

let cachedDebugFlag: boolean | null = null;
const isDebugEnabled = (): boolean => {
  if (cachedDebugFlag !== null) return cachedDebugFlag;
  try {
    const props = (typeof PropertiesService !== 'undefined' && PropertiesService.getScriptProperties)
      ? PropertiesService.getScriptProperties()
      : undefined;
    const flag = props?.getProperty(DEBUG_PROPERTY_KEY);
    cachedDebugFlag = !!flag && (flag === '1' || flag.toLowerCase() === 'true');
    return cachedDebugFlag;
  } catch (_) {
    cachedDebugFlag = false;
    return false;
  }
};

/**
 * WebFormService generates a custom HTML web form (Apps Script Web App)
 * from the same spreadsheet configuration used for Google Forms.
 * It also handles submissions and writes responses directly into the destination tab.
 */
export class WebFormService {
  private ss: GoogleAppsScript.Spreadsheet.Spreadsheet;
  private dashboard: Dashboard;
  private cache: GoogleAppsScript.Cache.Cache | null;
  private docProps: GoogleAppsScript.Properties.Properties | null;

  constructor(ss: GoogleAppsScript.Spreadsheet.Spreadsheet) {
    this.ss = ss;
    this.dashboard = new Dashboard(ss);
    this.cache = this.resolveCache();
    this.docProps = this.resolveDocumentProperties();
  }

  public buildDefinition(formKey?: string): WebFormDefinition {
    const form = this.findForm(formKey);
    debugLog('buildDefinition.formSelected', { requestedKey: formKey, formTitle: form.title, configSheet: form.configSheet });
    const questions = ConfigSheet.getQuestions(this.ss, form.configSheet).filter(q => q.status === 'Active');
    const languages: Array<'EN' | 'FR' | 'NL'> = this.computeLanguages(questions);
    debugLog('buildDefinition.questionsLoaded', { questionCount: questions.length, languages });

    const webQuestions: WebQuestionDefinition[] = questions.map(q => ({
      id: q.id,
      type: q.type,
      label: {
        en: q.qEn,
        fr: q.qFr,
        nl: q.qNl
      },
      required: q.required,
      listView: q.listView,
      dataSource: q.dataSource,
      options: q.options.length || q.optionsFr.length || q.optionsNl.length
        ? {
            en: q.options,
            fr: q.optionsFr,
            nl: q.optionsNl
          }
        : undefined,
      lineItemConfig: q.lineItemConfig,
      uploadConfig: q.uploadConfig,
      optionFilter: q.optionFilter,
      validationRules: q.validationRules,
      visibility: q.visibility,
      clearOnChange: q.clearOnChange
    }));

    const listView = this.buildListViewConfig(webQuestions);

    return {
      title: form.title,
      description: form.description,
      destinationTab: form.destinationTab || `${form.title} Responses`,
      languages,
      questions: webQuestions,
      dataSources: [],
      listView,
      dedupRules: this.getDedupRules(form.configSheet),
      startRoute: listView ? 'list' : 'form'
    };
  }

  public renderForm(formKey?: string): GoogleAppsScript.HTML.HtmlOutput {
    debugLog('renderForm.start', { requestedKey: formKey });
    const def = this.buildDefinition(formKey);
    const targetKey = formKey || def.title;
    const html = this.buildTemplate(def, targetKey);
    debugLog('renderForm.htmlBuilt', {
      formKey: targetKey,
      questionCount: def.questions.length,
      languages: def.languages,
      htmlLength: html.length,
      hasInitCall: html.includes('init();'),
      scriptCloseCount: (html.match(/<\/script/gi) || []).length
    });
    const output = HtmlService.createHtmlOutput(html);
    output.setTitle(def.title || 'Form');
    return output;
  }

  public submitWebForm(formObject: any): { success: boolean; message: string } {
    const result = this.saveSubmissionWithId(formObject as WebFormSubmission);
    return { success: result.success, message: result.message };
  }

  /**
   * Fetch rows from an external tab or submissions (tab name == dataSourceId). Supports projection and pagination.
   */
  public fetchDataSource(
    source: any,
    locale?: string,
    projection?: string[],
    limit?: number,
    pageToken?: string
  ): PaginatedResult<any> {
    const config = typeof source === 'string' ? { id: source, projection } : (source || {});
    const dataSourceId = config.id || source;
    if (!dataSourceId) return { items: [], nextPageToken: undefined, totalCount: 0 };

    const { sheetId, tabName } = this.parseDataSourceId(dataSourceId, config.tabName, config.sheetId);
    const sheet = sheetId
      ? ((): GoogleAppsScript.Spreadsheet.Sheet | null => {
          try {
            const external = SpreadsheetApp.openById(sheetId);
            return tabName ? external.getSheetByName(tabName) : external.getSheets()[0] || null;
          } catch (_) {
            return null;
          }
        })()
      : this.ss.getSheetByName(tabName || dataSourceId);
    if (!sheet) return { items: [], nextPageToken: undefined, totalCount: 0 };

    const headerRow = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const headers = headerRow.map(h => (h || '').toString().trim());
    if (!headers.length) return { items: [], nextPageToken: undefined, totalCount: 0 };

    const columns = this.buildHeaderIndex(headers);
    const localeKey = (config.localeKey || '').toString().trim().toLowerCase() || undefined;
    const effectiveProjection = (config.projection && config.projection.length) ? config.projection : (projection && projection.length ? projection : headers);

    const offset = this.decodePageToken(pageToken);
    const maxRows = Math.max(0, sheet.getLastRow() - 1);
    const cappedTotal = Math.min(maxRows, 200);
    if (offset >= cappedTotal) return { items: [], totalCount: cappedTotal };

    const size = Math.max(1, Math.min(limit || config.limit || 50, 50));
    const readCount = Math.min(size, cappedTotal - offset);
    const rawData = readCount > 0 ? sheet.getRange(2 + offset, 1, readCount, headers.length).getValues() : [];

    // Apply locale filter if localeKey present
    const filtered = !localeKey || !locale
      ? rawData
      : rawData.filter(row => {
          const idx = columns[localeKey];
          if (idx === undefined) return true;
          const cell = (row[idx] || '').toString().toLowerCase();
          return cell === locale.toLowerCase();
        });

    const items = filtered.map(row => {
      if (effectiveProjection.length === 1 && !config.mapping) {
        const fid = effectiveProjection[0];
        const idx = columns[fid.toLowerCase()];
        return idx !== undefined ? row[idx] : '';
      }
      const obj: Record<string, any> = {};
      effectiveProjection.forEach((fid: string) => {
        const idx = columns[fid.toLowerCase()];
        const target = (config.mapping && config.mapping[fid]) || fid;
        if (idx !== undefined) {
          obj[target] = row[idx];
        }
      });
      return obj;
    });

    const nextOffset = offset + rawData.length;
    const hasMore = nextOffset < cappedTotal;
    const nextPageToken = hasMore ? this.encodePageToken(nextOffset) : undefined;

    return { items, nextPageToken, totalCount: cappedTotal };
  }

  /**
   * Fetch paginated submissions for list view (max 10/page, 200 total).
   */
  public fetchSubmissions(
    formKey: string,
    projection?: string[],
    pageSize: number = 10,
    pageToken?: string
  ): PaginatedResult<Record<string, any>> {
    const result = this.fetchSubmissionsPageInternal(formKey, projection, pageSize, pageToken);
    return result.list;
  }

  public fetchSubmissionsBatch(
    formKey: string,
    projection?: string[],
    pageSize: number = 10,
    pageToken?: string,
    includePageRecords: boolean = true,
    recordIds?: string[]
  ): SubmissionBatchResult<Record<string, any>> {
    const page = this.fetchSubmissionsPageInternal(formKey, projection, pageSize, pageToken);
    const records: Record<string, WebFormSubmission> = includePageRecords ? { ...page.records } : {};
    if (recordIds && recordIds.length) {
      recordIds.forEach(id => {
        const key = (id || '').toString();
        if (!key || records[key]) return;
        const fetched = this.fetchSubmissionById(formKey, key);
        if (fetched) {
          records[key] = fetched;
        }
      });
    }
    return { list: page.list, records };
  }

  /**
   * Fetch a single submission by id for edit prefill.
   */
  public fetchSubmissionById(formKey: string, id: string): WebFormSubmission | null {
    if (!id) return null;
    const form = this.findForm(formKey);
    const questions = ConfigSheet.getQuestions(this.ss, form.configSheet).filter(q => q.status === 'Active');
    const { sheet, headers, columns } = this.ensureDestination(form.destinationTab || `${form.title} Responses`, questions);
    const etag = this.getSheetEtag(sheet, columns);
    const cached = this.getCachedRecord(formKey, etag, id);
    if (cached) return cached;
    if (!columns.recordId) return null;
    const rows = sheet.getRange(2, columns.recordId, Math.max(0, sheet.getLastRow() - 1), 1).getValues();
    const matchIndex = rows.findIndex(r => (r[0] || '').toString() === id);
    if (matchIndex < 0) return null;
    const rowNumber = 2 + matchIndex;
    const data = sheet.getRange(rowNumber, 1, 1, headers.length).getValues()[0];
    const record = this.buildSubmissionRecord(formKey, questions, columns, data, id);
    if (record) {
      this.cacheRecord(formKey, etag, record);
    }
    return record;
  }

  private fetchSubmissionsPageInternal(
    formKey: string,
    projection?: string[],
    pageSize: number = 10,
    pageToken?: string
  ): ListPageResult {
    const form = this.findForm(formKey);
    const questions = ConfigSheet.getQuestions(this.ss, form.configSheet).filter(q => q.status === 'Active');
    const { sheet, headers, columns } = this.ensureDestination(form.destinationTab || `${form.title} Responses`, questions);
    const etag = this.getSheetEtag(sheet, columns);
    const maxRows = Math.max(0, sheet.getLastRow() - 1);
    const cappedTotal = Math.min(maxRows, 200);
    const size = Math.max(1, Math.min(pageSize || 10, 10));
    const offset = this.decodePageToken(pageToken);
    if (offset >= cappedTotal) {
      const emptyList: PaginatedResult<Record<string, any>> = { items: [], totalCount: cappedTotal };
      return { list: emptyList, records: {}, etag };
    }

    const fieldIds = (projection && projection.length) ? projection : questions.map(q => q.id);
    const cacheKey = this.makeListCacheKey(formKey, etag, fieldIds, size, pageToken);
    const cached = this.cacheGet<CachedListPage>(cacheKey);
    if (cached) {
      return { list: cached.list, records: cached.records || {}, etag };
    }

    const readCount = Math.min(size, cappedTotal - offset);
    const data = readCount > 0 ? sheet.getRange(2 + offset, 1, readCount, headers.length).getValues() : [];
    const records: Record<string, WebFormSubmission> = {};
    const items = data.map(row => {
      const item: Record<string, any> = {};
      const rowIdValue = columns.recordId ? row[columns.recordId - 1] : '';
      const rowId = rowIdValue ? rowIdValue.toString() : '';
      item.id = rowId;
      item.createdAt = columns.createdAt ? this.asIso(row[columns.createdAt - 1]) : undefined;
      item.updatedAt = columns.updatedAt ? this.asIso(row[columns.updatedAt - 1]) : undefined;
      fieldIds.forEach(fid => {
        const key = (fid || '').toString();
        const colIdx = columns.fields[key];
        if (!colIdx) return;
        item[key] = row[colIdx - 1];
      });
      if (rowId) {
        const record = this.buildSubmissionRecord(formKey, questions, columns, row, rowId);
        if (record) {
          records[rowId] = record;
          this.cacheRecord(formKey, etag, record);
        }
      }
      return item;
    });

    const nextOffset = offset + readCount;
    const hasMore = nextOffset < cappedTotal;
    const nextPageTokenValue = hasMore ? this.encodePageToken(nextOffset) : undefined;
    const listResult: PaginatedResult<Record<string, any>> = {
      items,
      nextPageToken: nextPageTokenValue,
      totalCount: cappedTotal
    };

    this.cachePut(cacheKey, { list: listResult, records });
    return { list: listResult, records, etag };
  }

  /**
   * Save with explicit id/metadata, updating when id exists.
   */
  public saveSubmissionWithId(formObject: WebFormSubmission): { success: boolean; message: string; meta: RecordMetadata } {
    const formKey = (formObject.formKey || (formObject as any).form || '').toString();
    const langValue = Array.isArray(formObject.language)
      ? (formObject.language[formObject.language.length - 1] || formObject.language[0])
      : formObject.language;
    const languageRaw = (langValue || 'EN').toString().toUpperCase();
    const language = (['EN', 'FR', 'NL'].includes(languageRaw) ? languageRaw : 'EN') as 'EN' | 'FR' | 'NL';

    const form = this.findForm(formKey);
    const dedupRules = this.getDedupRules(form.configSheet);
    const questions = ConfigSheet.getQuestions(this.ss, form.configSheet).filter(q => q.status === 'Active');
    const { sheet, headers, columns } = this.ensureDestination(form.destinationTab || `${form.title} Responses`, questions);

    const now = new Date();
    const incomingId = (formObject.id && (formObject.id as any).trim) ? (formObject.id as any).trim() : formObject.id;
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
    setIf(columns.createdAt, createdAtVal);
    setIf(columns.updatedAt, existingRowIdx >= 0 ? now : '');

    const candidateValues: Record<string, any> = {};
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
        value = this.saveFiles((formObject as any)[q.id], q.uploadConfig);
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
      updatedAt: existingRowIdx >= 0 ? now.toISOString() : undefined
    };

    const newEtag = this.getSheetEtag(sheet, columns);
    const cachedRecord = this.buildSubmissionRecord(formKey, questions, columns, valuesArray, recordId);
    if (cachedRecord) {
      this.cacheRecord(formKey, newEtag, cachedRecord);
    }

    return { success: true, message: 'Saved to sheet', meta };
  }

  private findForm(formKey?: string): FormConfig {
    const forms = this.dashboard.getForms();
    if (!forms.length) throw new Error('No forms configured. Run setup first.');
    if (!formKey) return forms[0];

    const match = forms.find(f => f.configSheet === formKey || f.title.toLowerCase() === formKey.toLowerCase());
    if (!match) {
      throw new Error(`Form "${formKey}" not found in dashboard.`);
    }
    return match;
  }

  private ensureDestination(
    destinationTab: string,
    questions: QuestionConfig[]
  ): { sheet: GoogleAppsScript.Spreadsheet.Sheet; headers: string[]; columns: HeaderColumns } {
    let sheet = this.ss.getSheetByName(destinationTab);
    if (!sheet) {
      sheet = this.ss.insertSheet(destinationTab);
    }

    const metaHeaders = ['Record ID', 'Created At', 'Updated At'];
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
      fields: {}
    };

    questions.forEach(q => {
      const idx = this.findHeader(headers, [q.qEn, q.id].filter(Boolean) as string[]);
      if (idx) columns.fields[q.id] = idx;
    });

    return { sheet, headers, columns };
  }

  private saveFiles(files: any, uploadConfig?: QuestionConfig['uploadConfig']): string {
    if (!files) return '';
    const fileArray = Array.isArray(files) ? files : [files];
    const limitedFiles = uploadConfig?.maxFiles ? fileArray.slice(0, uploadConfig.maxFiles) : fileArray;

    const toBlob = (file: any): GoogleAppsScript.Base.Blob | null => {
      if (!file) return null;
      if (typeof file.getBytes === 'function') return file as GoogleAppsScript.Base.Blob;

      const dataStr = (file.data || file.dataUrl || '').toString();
      if (!dataStr) return null;
      const parts = dataStr.split(',');
      const base64 = parts.length > 1 ? parts[1] : parts[0];
      const inferredMime = parts[0]?.match(/data:(.*);base64/)?.[1];
      const mime = file.type || inferredMime || 'application/octet-stream';
      const bytes = Utilities.base64Decode(base64);
      const name = file.name || 'upload';
      return Utilities.newBlob(bytes, mime, name);
    };

    const folder = this.getUploadFolder(uploadConfig);
    const urls: string[] = [];

    limitedFiles.forEach(file => {
      const blob = toBlob(file);
      if (!blob) return;

      const name = blob.getName();
      const bytes = blob.getBytes();
      const isEmpty = Array.isArray(bytes) && bytes.length === 0;
      if (isEmpty) return;

      if (uploadConfig?.allowedExtensions && name) {
        const lower = name.toLowerCase();
        const allowed = uploadConfig.allowedExtensions.map(ext => ext.toLowerCase().replace('.', ''));
        const isAllowed = allowed.some(ext => lower.endsWith(ext));
        if (!isAllowed) return;
      } else if (uploadConfig?.allowedExtensions && !name) {
        // Cannot validate extension without a name; skip to avoid trash files
        return;
      }

      if (uploadConfig?.maxFileSizeMb && bytes) {
        const sizeMb = bytes.length / (1024 * 1024);
        if (sizeMb > uploadConfig.maxFileSizeMb) return;
      }

      const created = folder.createFile(blob);
      urls.push(created.getUrl());
    });

    return urls.join(', ');
  }

  private getUploadFolder(uploadConfig?: QuestionConfig['uploadConfig']): GoogleAppsScript.Drive.Folder {
    if (uploadConfig?.destinationFolderId) {
      return DriveApp.getFolderById(uploadConfig.destinationFolderId);
    }

    const file = DriveApp.getFileById(this.ss.getId());
    const parents = file.getParents();
    if (parents.hasNext()) return parents.next();
    return DriveApp.getRootFolder();
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

  private encodePageToken(offset: number): string {
    return Utilities.base64Encode(offset.toString());
  }

  private decodePageToken(token?: string): number {
    if (!token) return 0;
    try {
      const decoded = Utilities.base64Decode(token);
      const asString = decoded ? String.fromCharCode(...decoded) : '0';
      const n = parseInt(asString, 10);
      return Number.isFinite(n) && n >= 0 ? n : 0;
    } catch (_) {
      return 0;
    }
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

  private buildHeaderIndex(headers: string[]): Record<string, number> {
    const index: Record<string, number> = {};
    headers.forEach((h, idx) => {
      const key = (h || '').toString().trim().toLowerCase();
      if (key && index[key] === undefined) index[key] = idx;
    });
    return index;
  }

  private parseDataSourceId(raw: string, tabNameOverride?: string, sheetIdOverride?: string): { sheetId?: string; tabName?: string } {
    if (sheetIdOverride || tabNameOverride) {
      return { sheetId: sheetIdOverride, tabName: tabNameOverride || raw };
    }
    const delim = raw.includes('::') ? '::' : raw.includes('|') ? '|' : null;
    if (!delim) return { tabName: raw };
    const [sheetId, tabName] = raw.split(delim);
    return { sheetId: sheetId || undefined, tabName: tabName || undefined };
  }

  private getDedupRules(configSheetName: string): DedupRule[] {
    const sheetName = `${configSheetName} Dedup`;
    const sheet = this.ss.getSheetByName(sheetName);
    if (!sheet) return [];
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return [];
    const data = sheet.getRange(2, 1, lastRow - 1, Math.max(6, sheet.getLastColumn())).getValues();
    return data
      .map(row => {
        const id = (row[0] || '').toString().trim();
        if (!id) return null;
        const scope = (row[1] || 'form').toString().trim() || 'form';
        const keysRaw = (row[2] || '').toString();
        const keys = keysRaw.split(',').map((s: string) => s.trim()).filter(Boolean);
        const matchMode = ((row[3] || 'exact').toString().toLowerCase() === 'caseinsensitive') ? 'caseInsensitive' : 'exact';
        const onConflictRaw = (row[4] || 'reject').toString().toLowerCase();
        const onConflict = onConflictRaw === 'ignore' || onConflictRaw === 'merge' ? onConflictRaw : 'reject';
        const message = row[5] || undefined;
        return {
          id,
          scope,
          keys,
          matchMode: matchMode as DedupRule['matchMode'],
          onConflict: onConflict as DedupRule['onConflict'],
          message
        };
      })
      .filter(Boolean) as DedupRule[];
  }

  private buildTemplate(def: WebFormDefinition, formKey: string): string {
    return buildWebFormHtml(def, formKey);
  }

  private generateUuid(): string {
    try {
      if (typeof Utilities !== 'undefined' && Utilities.getUuid) {
        return Utilities.getUuid();
      }
    } catch (_) {
      // ignore
    }
    return 'uuid-' + Math.random().toString(16).slice(2);
  }

  private buildListViewConfig(questions: WebQuestionDefinition[]): ListViewConfig | undefined {
    const columns = questions
      .filter(q => q.listView)
      .map(q => ({ fieldId: q.id, label: q.label }));
    return columns.length ? { columns } : undefined;
  }

  private computeLanguages(questions: QuestionConfig[]): Array<'EN' | 'FR' | 'NL'> {
    const langs: Array<'EN' | 'FR' | 'NL'> = [];
    if (questions.some(q => !!q.qEn)) langs.push('EN');
    if (questions.some(q => !!q.qFr)) langs.push('FR');
    if (questions.some(q => !!q.qNl)) langs.push('NL');
    return langs.length ? langs : ['EN'];
  }

  private resolveCache(): GoogleAppsScript.Cache.Cache | null {
    try {
      return (typeof CacheService !== 'undefined' && CacheService.getScriptCache)
        ? CacheService.getScriptCache()
        : null;
    } catch (_) {
      return null;
    }
  }

  private resolveDocumentProperties(): GoogleAppsScript.Properties.Properties | null {
    try {
      return (typeof PropertiesService !== 'undefined' && PropertiesService.getDocumentProperties)
        ? PropertiesService.getDocumentProperties()
        : null;
    } catch (_) {
      return null;
    }
  }

  private cacheGet<T>(key: string): T | null {
    if (!this.cache || !key) return null;
    try {
      const raw = this.cache.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch (_) {
      return null;
    }
  }

  private cachePut(key: string, value: any, ttlSeconds: number = CACHE_TTL_SECONDS): void {
    if (!this.cache || !key) return;
    try {
      this.cache.put(key, JSON.stringify(value), ttlSeconds);
    } catch (_) {
      // ignore cache failures
    }
  }

  private makeListCacheKey(
    formKey: string,
    etag: string,
    projection: string[],
    pageSize: number,
    pageToken?: string
  ): string {
    const projectionKey = (projection || []).map(id => id || '').join('|');
    return this.makeCacheKey('LIST', [formKey || '', etag || '', projectionKey, pageSize.toString(), pageToken || '']);
  }

  private cacheRecord(formKey: string, etag: string, record: WebFormSubmission): void {
    if (!record || !record.id) return;
    const key = this.makeCacheKey('RECORD', [formKey || '', etag || '', record.id]);
    this.cachePut(key, record);
  }

  private getCachedRecord(formKey: string, etag: string, id: string): WebFormSubmission | null {
    if (!id) return null;
    const key = this.makeCacheKey('RECORD', [formKey || '', etag || '', id]);
    return this.cacheGet<WebFormSubmission>(key);
  }

  private makeCacheKey(namespace: string, parts: string[]): string {
    const digest = this.digestKey(parts.join('::'));
    const key = `${CACHE_PREFIX}:${namespace}:${digest}`;
    return key.length > 250 ? key.slice(0, 250) : key;
  }

  private digestKey(input: string): string {
    try {
      if (
        typeof Utilities !== 'undefined' &&
        Utilities.computeDigest &&
        Utilities.base64Encode &&
        Utilities.DigestAlgorithm
      ) {
        const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, input);
        return Utilities.base64Encode(bytes).replace(/=+$/, '');
      }
    } catch (_) {
      // ignore
    }
    return input.length > 180 ? input.slice(0, 180) : input;
  }

  private getSheetEtag(sheet: GoogleAppsScript.Spreadsheet.Sheet, columns: HeaderColumns): string {
    const fingerprint = this.computeSheetFingerprint(sheet, columns);
    this.storeEtagMetadata(sheet, fingerprint);
    return fingerprint;
  }

  private storeEtagMetadata(sheet: GoogleAppsScript.Spreadsheet.Sheet, etag: string): void {
    if (!this.docProps) return;
    try {
      const payload = JSON.stringify({
        etag,
        lastRow: sheet.getLastRow(),
        updatedAt: new Date().toISOString()
      });
      this.docProps.setProperty(this.getEtagPropertyKey(sheet), payload);
    } catch (_) {
      // ignore
    }
  }

  private getEtagPropertyKey(sheet: GoogleAppsScript.Spreadsheet.Sheet): string {
    const id = typeof sheet.getSheetId === 'function' ? sheet.getSheetId() : sheet.getName();
    return `${ETAG_PROPERTY_PREFIX}${id}`;
  }

  private computeSheetFingerprint(sheet: GoogleAppsScript.Spreadsheet.Sheet, columns: HeaderColumns): string {
    const sheetId = typeof sheet.getSheetId === 'function' ? sheet.getSheetId() : sheet.getName();
    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();
    let marker = '';
    if (lastRow >= 2) {
      const width = Math.max(lastCol, 1);
      const rowValues = sheet.getRange(lastRow, 1, 1, width).getValues()[0] || [];
      const indexes = [columns.updatedAt, columns.createdAt, columns.recordId, columns.timestamp]
        .filter(Boolean) as number[];
      const tokens = indexes.map(idx => {
        const cell = rowValues[(idx as number) - 1];
        if (cell instanceof Date) return cell.toISOString();
        return cell !== undefined && cell !== null ? cell.toString() : '';
      });
      marker = tokens.join('|');
    }
    const raw = [sheetId, lastRow, lastCol, marker].join(':');
    return this.digestKey(raw);
  }

  private buildSubmissionRecord(
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
    return {
      formKey,
      language,
      values,
      id: recordId,
      createdAt: columns.createdAt ? this.asIso(rowValues[columns.createdAt - 1]) : undefined,
      updatedAt: columns.updatedAt ? this.asIso(rowValues[columns.updatedAt - 1]) : undefined
    };
  }
}

interface HeaderColumns {
  timestamp?: number;
  language?: number;
  recordId?: number;
  createdAt?: number;
  updatedAt?: number;
  fields: Record<string, number>;
}

interface CachedListPage {
  list: PaginatedResult<Record<string, any>>;
  records: Record<string, WebFormSubmission>;
}

interface ListPageResult extends CachedListPage {
  etag: string;
}
