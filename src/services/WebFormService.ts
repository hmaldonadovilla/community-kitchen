import { Dashboard } from '../config/Dashboard';
import { ConfigSheet } from '../config/ConfigSheet';
import { buildWebFormHtml } from './WebFormTemplate';
import { buildReactWebFormHtml } from './WebFormReactTemplate';
import {
  AutoIncrementConfig,
  DataSourceConfig,
  DedupRule,
  PaginatedResult,
  RecordMetadata,
  SubmissionBatchResult,
  FormConfig,
  QuestionConfig,
  WebFormDefinition,
  WebFormSubmission,
  WebQuestionDefinition,
  ListViewConfig,
  FollowupActionResult,
  FollowupConfig,
  EmailRecipientDataSourceConfig,
  EmailRecipientEntry,
  TemplateIdMap,
  LocalizedString
} from '../types';
import { evaluateDedupConflict, ExistingRecord } from './dedup';

const DEBUG_PROPERTY_KEY = 'CK_DEBUG';
const CACHE_TTL_SECONDS = 300;
const CACHE_PREFIX = 'CK_CACHE';
const CACHE_VERSION_PROPERTY_KEY = 'CK_CACHE_VERSION';
const DEFAULT_CACHE_VERSION = 'v1';
const ETAG_PROPERTY_PREFIX = 'CK_ETAG_';
const AUTO_INCREMENT_PROPERTY_PREFIX = 'CK_AUTO_';

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
  private cachePrefix: string;
  private autoIncrementState: Record<string, number>;
  private dataSourceCache: Record<string, PaginatedResult<any>>;

  constructor(ss: GoogleAppsScript.Spreadsheet.Spreadsheet) {
    this.ss = ss;
    this.dashboard = new Dashboard(ss);
    this.cache = this.resolveCache();
    this.docProps = this.resolveDocumentProperties();
    this.cachePrefix = this.computeCachePrefix();
    this.autoIncrementState = {};
    this.dataSourceCache = {};
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
      clearOnChange: q.clearOnChange,
      selectionEffects: q.selectionEffects,
      listViewSort: q.listViewSort,
      autoIncrement: q.autoIncrement
    }));

    const listView = this.buildListViewConfig(webQuestions, form.listViewMetaColumns);

    return {
      title: form.title,
      description: form.description,
      destinationTab: form.destinationTab || `${form.title} Responses`,
      languages,
      questions: webQuestions,
      dataSources: [],
      listView,
      dedupRules: this.getDedupRules(form.configSheet),
      startRoute: listView ? 'list' : 'form',
      followup: form.followupConfig
    };
  }

  public renderForm(formKey?: string, params?: Record<string, any>): GoogleAppsScript.HTML.HtmlOutput {
    const useReact = this.shouldUseReact(params);
    debugLog('renderForm.start', { requestedKey: formKey, mode: useReact ? 'react' : 'legacy' });
    const def = this.buildDefinition(formKey);
    const targetKey = formKey || def.title;
    const html = useReact ? this.buildReactTemplate(def, targetKey) : this.buildTemplate(def, targetKey);
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

  public static invalidateServerCache(reason?: string): void {
    const props = WebFormService.getDocumentProperties();
    if (!props) {
      debugLog('cache.invalidate.skipped', { reason: reason || 'manual', cause: 'missingDocProps' });
      return;
    }
    const version = WebFormService.generateCacheVersion();
    WebFormService.persistCacheVersion(props, version);
    debugLog('cache.invalidated', { reason: reason || 'manual', version });
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

  public triggerFollowupAction(
    formKey: string,
    recordId: string,
    action: string
  ): FollowupActionResult {
    if (!recordId) {
      return { success: false, message: 'Record ID is required.' };
    }
    const normalizedAction = (action || '').toString().toUpperCase();
    const form = this.findForm(formKey);
    const followup = form.followupConfig;
    if (!followup) {
      return { success: false, message: 'Follow-up actions are not configured for this form.' };
    }
    const questions = ConfigSheet.getQuestions(this.ss, form.configSheet).filter(q => q.status === 'Active');
    switch (normalizedAction) {
      case 'CREATE_PDF':
        return this.handleCreatePdfAction(form, questions, recordId, followup);
      case 'SEND_EMAIL':
        return this.handleSendEmailAction(form, questions, recordId, followup);
      case 'CLOSE_RECORD':
        return this.handleCloseRecordAction(form, questions, recordId, followup);
      default:
        return { success: false, message: `Unsupported follow-up action "${action}".` };
    }
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
      item.status = columns.status ? row[columns.status - 1] : undefined;
      item.pdfUrl = columns.pdfUrl ? row[columns.pdfUrl - 1] : undefined;
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
    const updatedAtVal = existingRowIdx >= 0 ? now : createdAtVal;
    setIf(columns.createdAt, createdAtVal);
    setIf(columns.updatedAt, updatedAtVal);

    const candidateValues: Record<string, any> = {};
    questions.forEach(q => {
      if (q.type === 'TEXT' && q.autoIncrement) {
        const currentVal = (formObject as any)[q.id];
        if (!currentVal) {
          const generated = this.generateAutoIncrementValue(formKey, q.id, q.autoIncrement);
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
      updatedAt: updatedAtVal instanceof Date ? updatedAtVal.toISOString() : updatedAtVal
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

  private buildReactTemplate(def: WebFormDefinition, formKey: string): string {
    return buildReactWebFormHtml(def, formKey);
  }

  private shouldUseReact(params?: Record<string, any>): boolean {
    if (!params) return false;
    const value = params.react || params.view || params.ui;
    const normalized = Array.isArray(value) ? value[0] : value;
    if (!normalized) return false;
    const text = normalized.toString().toLowerCase();
    return text === 'react' || text === '1' || text === 'true';
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

  private buildListViewConfig(
    questions: WebQuestionDefinition[],
    metaColumns?: string[]
  ): ListViewConfig | undefined {
    const listQuestions = questions.filter(q => q.listView);
    if (!listQuestions.length) return undefined;
    const questionColumns = listQuestions.map(q => ({ fieldId: q.id, label: q.label, kind: 'question' as const }));
    const resolvedMetaColumns = this.normalizeMetaColumnList(metaColumns);
    const metaColumnDefs = resolvedMetaColumns.map(fieldId => ({
      fieldId,
      label: this.buildMetaColumnLabel(fieldId),
      kind: 'meta' as const
    }));
    const columns = [...questionColumns, ...metaColumnDefs];
    const sortCandidate = listQuestions
      .filter(q => !!q.listViewSort)
      .sort((a, b) => {
        const aPriority = a.listViewSort?.priority ?? Number.MAX_SAFE_INTEGER;
        const bPriority = b.listViewSort?.priority ?? Number.MAX_SAFE_INTEGER;
        return aPriority - bPriority;
      })[0];
    const normalizeDirection = (value?: string): 'asc' | 'desc' | undefined => {
      if (!value) return undefined;
      const lower = value.toLowerCase();
      if (lower === 'asc' || lower === 'desc') {
        return lower as 'asc' | 'desc';
      }
      return undefined;
    };
    const defaultSort = sortCandidate
      ? {
          fieldId: sortCandidate.id,
          direction: normalizeDirection(sortCandidate.listViewSort?.direction) || 'asc'
        }
      : {
          fieldId: resolvedMetaColumns[0] || (questionColumns[0]?.fieldId ?? 'updatedAt'),
          direction: 'desc' as const
        };
    return { columns, metaColumns: resolvedMetaColumns, defaultSort };
  }

  private normalizeMetaColumnList(metaColumns?: string[]): string[] {
    const allowedMap: Record<string, string> = {
      createdat: 'createdAt',
      created_at: 'createdAt',
      created: 'createdAt',
      updatedat: 'updatedAt',
      updated_at: 'updatedAt',
      updated: 'updatedAt',
      status: 'status',
      pdfurl: 'pdfUrl',
      pdf_url: 'pdfUrl',
      pdf: 'pdfUrl'
    };
    if (!metaColumns || !metaColumns.length) return ['updatedAt'];
    const normalized = metaColumns
      .map(value => value && value.toString().trim().toLowerCase())
      .filter(Boolean)
      .map(key => allowedMap[key!] || '')
      .filter(Boolean);
    const unique = Array.from(new Set(normalized));
    return unique.length ? unique : ['updatedAt'];
  }

  private buildMetaColumnLabel(fieldId: string): LocalizedString {
    switch (fieldId) {
      case 'createdAt':
        return { en: 'Created', fr: 'Créé', nl: 'Aangemaakt' };
      case 'status':
        return { en: 'Status', fr: 'Statut', nl: 'Status' };
      case 'pdfUrl':
        return { en: 'PDF URL', fr: 'Lien PDF', nl: 'PDF-link' };
      case 'updatedAt':
      default:
        return { en: 'Updated', fr: 'Mis à jour', nl: 'Bijgewerkt' };
    }
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
    return WebFormService.getDocumentProperties();
  }

  private static getDocumentProperties(): GoogleAppsScript.Properties.Properties | null {
    try {
      return (typeof PropertiesService !== 'undefined' && PropertiesService.getDocumentProperties)
        ? PropertiesService.getDocumentProperties()
        : null;
    } catch (_) {
      return null;
    }
  }

  private computeCachePrefix(): string {
    const version = WebFormService.getOrCreateCacheVersion(this.docProps);
    return `${CACHE_PREFIX}:${version}`;
  }

  private static getOrCreateCacheVersion(props: GoogleAppsScript.Properties.Properties | null): string {
    if (!props) return DEFAULT_CACHE_VERSION;
    try {
      const existing = props.getProperty(CACHE_VERSION_PROPERTY_KEY);
      if (existing) return existing;
      const fresh = WebFormService.generateCacheVersion();
      props.setProperty(CACHE_VERSION_PROPERTY_KEY, fresh);
      return fresh;
    } catch (_) {
      return DEFAULT_CACHE_VERSION;
    }
  }

  private static generateCacheVersion(): string {
    return `v${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  }

  private static persistCacheVersion(
    props: GoogleAppsScript.Properties.Properties | null,
    version: string
  ): void {
    if (!props) return;
    try {
      props.setProperty(CACHE_VERSION_PROPERTY_KEY, version);
    } catch (_) {
      // ignore
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
    const prefix = this.cachePrefix || `${CACHE_PREFIX}:${DEFAULT_CACHE_VERSION}`;
    const key = `${prefix}:${namespace}:${digest}`;
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
    const updatedDigest = this.computeColumnDigest(sheet, columns.updatedAt);
    const recordDigest = this.computeColumnDigest(sheet, columns.recordId);
    const raw = [sheetId, lastRow, lastCol, marker, updatedDigest, recordDigest].join(':');
    return this.digestKey(raw);
  }

  private computeColumnDigest(sheet: GoogleAppsScript.Spreadsheet.Sheet, columnIndex?: number): string {
    if (!columnIndex) return '';
    const totalRows = Math.max(sheet.getLastRow() - 1, 0);
    if (totalRows <= 0) return '';
    try {
      const values = sheet.getRange(2, columnIndex, totalRows, 1).getValues();
      const tokens = values.map(row => {
        const cell = row[0];
        if (cell instanceof Date) return cell.toISOString();
        return cell !== undefined && cell !== null ? cell.toString() : '';
      });
      return this.digestKey(tokens.join('|'));
    } catch (_) {
      return '';
    }
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

  private handleCreatePdfAction(
    form: FormConfig,
    questions: QuestionConfig[],
    recordId: string,
    followup: FollowupConfig
  ): FollowupActionResult {
    if (!followup.pdfTemplateId) {
      return { success: false, message: 'PDF template ID missing in follow-up config.' };
    }
    const context = this.getRecordContext(form, questions, recordId);
    if (!context || !context.record) {
      return { success: false, message: 'Record not found.' };
    }
    const pdfArtifact = this.generatePdfArtifact(form, questions, context.record, followup);
    if (!pdfArtifact.success) {
      return { success: false, message: pdfArtifact.message || 'Failed to generate PDF.' };
    }
    if (context.columns.pdfUrl && pdfArtifact.url) {
      context.sheet.getRange(context.rowIndex, context.columns.pdfUrl, 1, 1).setValue(pdfArtifact.url);
    }
    const statusValue = followup.statusTransitions?.onPdf;
    if (statusValue) {
      this.writeStatus(context.sheet, context.columns, context.rowIndex, statusValue, followup.statusFieldId);
    }
    this.refreshRecordCache(form.configSheet, questions, context);
    return {
      success: true,
      status: statusValue || context.record.status,
      pdfUrl: pdfArtifact.url,
      fileId: pdfArtifact.fileId
    };
  }

  private handleSendEmailAction(
    form: FormConfig,
    questions: QuestionConfig[],
    recordId: string,
    followup: FollowupConfig
  ): FollowupActionResult {
    if (!followup.emailTemplateId) {
      return { success: false, message: 'Email template ID missing in follow-up config.' };
    }
    if (!followup.emailRecipients || !followup.emailRecipients.length) {
      return { success: false, message: 'Email recipients not configured.' };
    }
    const context = this.getRecordContext(form, questions, recordId);
    if (!context || !context.record) {
      return { success: false, message: 'Record not found.' };
    }
    const lineItemRows = this.collectLineItemRows(context.record, questions);
    const placeholders = this.buildPlaceholderMap(context.record, questions, lineItemRows);
    const pdfArtifact = this.generatePdfArtifact(form, questions, context.record, followup);
    if (!pdfArtifact.success) {
      return { success: false, message: pdfArtifact.message || 'Failed to generate PDF.' };
    }
    if (context.columns.pdfUrl && pdfArtifact.url) {
      context.sheet.getRange(context.rowIndex, context.columns.pdfUrl, 1, 1).setValue(pdfArtifact.url);
    }
    const toRecipients = this.resolveRecipients(followup.emailRecipients, placeholders, context.record);
    if (!toRecipients.length) {
      return { success: false, message: 'Resolved email recipients are empty.' };
    }
    const ccRecipients = this.resolveRecipients(followup.emailCc, placeholders, context.record);
    const bccRecipients = this.resolveRecipients(followup.emailBcc, placeholders, context.record);
    const templateId = this.resolveTemplateId(followup.emailTemplateId, context.record.language);
    if (!templateId) {
      return { success: false, message: 'No email template matched the submission language.' };
    }
    try {
      const templateDoc = DocumentApp.openById(templateId);
      const templateBody = templateDoc.getBody().getText();
      const body = this.applyPlaceholders(templateBody, placeholders);
      const htmlBody = body.replace(/\n/g, '<br/>');
      const subject =
        this.resolveLocalizedStringValue(followup.emailSubject, context.record.language) ||
        `${form.title || 'Form'} submission ${context.record.id}`;
      GmailApp.sendEmail(toRecipients.join(','), subject || 'Form submission', body || 'See attached PDF.', {
        htmlBody,
        attachments: pdfArtifact.blob ? [pdfArtifact.blob] : undefined,
        cc: ccRecipients.length ? ccRecipients.join(',') : undefined,
        bcc: bccRecipients.length ? bccRecipients.join(',') : undefined
      });
    } catch (err) {
      debugLog('followup.email.failed', { error: err ? err.toString() : 'unknown' });
      return { success: false, message: 'Failed to send follow-up email.' };
    }
    const statusValue = followup.statusTransitions?.onEmail;
    if (statusValue) {
      this.writeStatus(context.sheet, context.columns, context.rowIndex, statusValue, followup.statusFieldId);
    }
    this.refreshRecordCache(form.configSheet, questions, context);
    return {
      success: true,
      status: statusValue || context.record.status,
      pdfUrl: pdfArtifact.url,
      fileId: pdfArtifact.fileId
    };
  }

  private handleCloseRecordAction(
    form: FormConfig,
    questions: QuestionConfig[],
    recordId: string,
    followup: FollowupConfig
  ): FollowupActionResult {
    const context = this.getRecordContext(form, questions, recordId);
    if (!context) {
      return { success: false, message: 'Record not found.' };
    }
    const statusValue = followup.statusTransitions?.onClose || 'Closed';
    this.writeStatus(context.sheet, context.columns, context.rowIndex, statusValue, followup.statusFieldId);
    this.refreshRecordCache(form.configSheet, questions, context);
    return { success: true, status: statusValue };
  }

  private getRecordContext(
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

  private writeStatus(
    sheet: GoogleAppsScript.Spreadsheet.Sheet,
    columns: HeaderColumns,
    rowIndex: number,
    value: string | undefined,
    statusFieldId?: string
  ): void {
    if (!value) return;
    if (statusFieldId && columns.fields[statusFieldId]) {
      sheet.getRange(rowIndex, columns.fields[statusFieldId] as number, 1, 1).setValue(value);
      return;
    }
    if (columns.status) {
      sheet.getRange(rowIndex, columns.status, 1, 1).setValue(value);
    }
  }

  private refreshRecordCache(
    formKey: string,
    questions: QuestionConfig[],
    context: RecordContext
  ): void {
    const rowValues = context.sheet.getRange(context.rowIndex, 1, 1, context.headers.length).getValues()[0];
    const record = this.buildSubmissionRecord(formKey, questions, context.columns, rowValues, context.record?.id);
    if (record) {
      const etag = this.getSheetEtag(context.sheet, context.columns);
      this.cacheRecord(formKey, etag, record);
    }
  }

  private generatePdfArtifact(
    form: FormConfig,
    questions: QuestionConfig[],
    record: WebFormSubmission,
    followup: FollowupConfig
  ): { success: boolean; message?: string; url?: string; fileId?: string; blob?: GoogleAppsScript.Base.Blob } {
    if (!followup.pdfTemplateId) {
      return { success: false, message: 'PDF template ID missing.' };
    }
    const templateId = this.resolveTemplateId(followup.pdfTemplateId, record.language);
    if (!templateId) {
      return { success: false, message: 'No PDF template matched the submission language.' };
    }
    try {
      const templateFile = DriveApp.getFileById(templateId);
      const folder = this.resolveFollowupFolder(followup);
      const copyName = `${form.title || 'Form'} - ${record.id || this.generateUuid()}`;
      const copy = templateFile.makeCopy(copyName, folder);
      const doc = DocumentApp.openById(copy.getId());
      const lineItemRows = this.collectLineItemRows(record, questions);
      const placeholders = this.buildPlaceholderMap(record, questions, lineItemRows);
      this.addConsolidatedPlaceholders(placeholders, questions, lineItemRows);
      this.renderLineItemTables(doc, questions, lineItemRows);
      const body = doc.getBody();
      Object.entries(placeholders).forEach(([token, value]) => {
        body.replaceText(this.escapeRegExp(token), value ?? '');
      });
      doc.saveAndClose();
      const pdfBlob = copy.getAs('application/pdf');
      const pdfFile = folder.createFile(pdfBlob).setName(`${copyName}.pdf`);
      copy.setTrashed(true);
      return { success: true, url: pdfFile.getUrl(), fileId: pdfFile.getId(), blob: pdfBlob };
    } catch (err) {
      debugLog('followup.pdf.failed', { error: err ? err.toString() : 'unknown' });
      return { success: false, message: 'Failed to generate PDF.' };
    }
  }

  private resolveFollowupFolder(followup: FollowupConfig): GoogleAppsScript.Drive.Folder {
    if (followup.pdfFolderId) {
      try {
        return DriveApp.getFolderById(followup.pdfFolderId);
      } catch (_) {
        // fall through to default
      }
    }
    try {
      const file = DriveApp.getFileById(this.ss.getId());
      const parents = file.getParents();
      if (parents && parents.hasNext()) {
        return parents.next();
      }
    } catch (_) {
      // ignore
    }
    return DriveApp.getRootFolder();
  }

  private buildPlaceholderMap(
    record: WebFormSubmission,
    questions: QuestionConfig[],
    lineItemRows: Record<string, any[]>
  ): Record<string, string> {
    const map: Record<string, string> = {};
    this.addPlaceholderVariants(map, 'RECORD_ID', record.id || '');
    this.addPlaceholderVariants(map, 'FORM_KEY', record.formKey || '');
    this.addPlaceholderVariants(map, 'CREATED_AT', record.createdAt || '');
    this.addPlaceholderVariants(map, 'UPDATED_AT', record.updatedAt || '');
    this.addPlaceholderVariants(map, 'STATUS', record.status || '');
    this.addPlaceholderVariants(map, 'PDF_URL', record.pdfUrl || '');
    this.addPlaceholderVariants(map, 'LANGUAGE', record.language || '');
    questions.forEach(q => {
      const value = record.values ? record.values[q.id] : '';
      const formatted = this.formatTemplateValue(value);
      this.addPlaceholderVariants(map, q.id, formatted);
      const labelToken = this.slugifyPlaceholder(q.qEn || q.id);
      this.addPlaceholderVariants(map, labelToken, formatted);
      if (q.type === 'LINE_ITEM_GROUP') {
        const rows = lineItemRows[q.id] || [];
        (q.lineItemConfig?.fields || []).forEach(field => {
          const values = rows
            .map(row => row[field.id])
            .filter(val => val !== undefined && val !== null && val !== '')
            .map(val => this.formatTemplateValue(val));
          if (!values.length) return;
          const joined = values.join('\n');
          this.addPlaceholderVariants(map, `${q.id}.${field.id}`, joined);
          const fieldSlug = this.slugifyPlaceholder(field.labelEn || field.id);
          this.addPlaceholderVariants(map, `${q.id}.${fieldSlug}`, joined);
        });
      } else if (q.dataSource && typeof value === 'string' && value) {
        const dsDetails = this.lookupDataSourceDetails(q, value, record.language);
        if (dsDetails) {
          Object.entries(dsDetails).forEach(([key, val]) => {
            this.addPlaceholderVariants(map, `${q.id}.${key}`, val);
          });
        }
      }
    });
    return map;
  }

  private collectLineItemRows(
    record: WebFormSubmission,
    questions: QuestionConfig[]
  ): Record<string, any[]> {
    const map: Record<string, any[]> = {};
    questions.forEach(q => {
      if (q.type !== 'LINE_ITEM_GROUP') return;
      const value = record.values ? record.values[q.id] : undefined;
      if (Array.isArray(value)) {
        map[q.id] = value.map(row => (row && typeof row === 'object' ? row : {}));
      }
    });
    return map;
  }

  private addConsolidatedPlaceholders(
    placeholders: Record<string, string>,
    questions: QuestionConfig[],
    lineItemRows: Record<string, any[]>
  ): void {
    questions.forEach(q => {
      if (q.type !== 'LINE_ITEM_GROUP') return;
      const rows = lineItemRows[q.id];
      if (!rows || !rows.length) return;
      (q.lineItemConfig?.fields || []).forEach(field => {
        const unique = Array.from(
          new Set(
            rows
              .map(row => row[field.id])
              .filter(val => val !== undefined && val !== null && val !== '')
              .map(val => this.formatTemplateValue(val))
          )
        );
        if (!unique.length) return;
        const text = unique.join(', ');
        placeholders[`{{CONSOLIDATED(${q.id}.${field.id})}}`] = text;
        const slug = this.slugifyPlaceholder(field.labelEn || field.id);
        placeholders[`{{CONSOLIDATED(${q.id}.${slug})}}`] = text;
      });
    });
  }

  private renderLineItemTables(
    doc: GoogleAppsScript.Document.Document,
    questions: QuestionConfig[],
    lineItemRows: Record<string, any[]>
  ): void {
    const body = doc.getBody();
    if (!body) return;
    const groupLookup: Record<string, QuestionConfig> = {};
    questions
      .filter(q => q.type === 'LINE_ITEM_GROUP')
      .forEach(q => {
        groupLookup[q.id.toUpperCase()] = q;
      });

    let childIndex = 0;
    while (childIndex < body.getNumChildren()) {
      const element = body.getChild(childIndex);
      if (!element || element.getType() !== DocumentApp.ElementType.TABLE) {
        childIndex++;
        continue;
      }
      const table = element.asTable();
      const directive = this.extractTableGroupDirective(table);
      if (directive) {
        const inserted = this.renderGroupedLineItemTables(
          body,
          childIndex,
          table,
          directive,
          groupLookup,
          lineItemRows
        );
        childIndex += inserted;
        continue;
      }
      this.renderTableRows(table, groupLookup, lineItemRows);
      childIndex++;
    }
  }

  private renderGroupedLineItemTables(
    body: GoogleAppsScript.Document.Body,
    childIndex: number,
    templateTable: GoogleAppsScript.Document.Table,
    directive: { groupId: string; fieldId: string },
    groupLookup: Record<string, QuestionConfig>,
    lineItemRows: Record<string, any[]>
  ): number {
    const group = groupLookup[directive.groupId];
    if (!group) {
      body.removeChild(templateTable);
      return 0;
    }
    const rows = lineItemRows[group.id] || [];
    const groupedValues = this.collectGroupFieldValues(rows, directive.fieldId);
    const preservedTemplate = templateTable.copy();
    body.removeChild(templateTable);
    if (!groupedValues.length) {
      return 0;
    }
    groupedValues.forEach((groupValue, idx) => {
      const newTable = body.insertTable(childIndex + idx, preservedTemplate.copy());
      this.replaceGroupDirectivePlaceholders(newTable, directive, groupValue);
      const filteredRows = rows.filter(row => {
        const raw = row?.[directive.fieldId] ?? '';
        return this.normalizeText(raw) === this.normalizeText(groupValue);
      });
      this.renderTableRows(
        newTable,
        groupLookup,
        lineItemRows,
        { groupId: group.id, rows: filteredRows }
      );
    });
    return groupedValues.length;
  }

  private collectGroupFieldValues(rows: any[], fieldId: string): string[] {
    if (!rows || !rows.length) return [];
    const seen = new Set<string>();
    const order: string[] = [];
    rows.forEach(row => {
      const raw = row?.[fieldId];
      const normalized = this.normalizeText(raw);
      if (!normalized || seen.has(normalized)) return;
      seen.add(normalized);
      order.push(raw ?? '');
    });
    return order;
  }

  private replaceGroupDirectivePlaceholders(
    table: GoogleAppsScript.Document.Table,
    directive: { groupId: string; fieldId: string },
    groupValue: string
  ): void {
    const pattern = `(?i){{GROUP_TABLE(${directive.groupId}.${directive.fieldId})}}`;
    for (let r = 0; r < table.getNumRows(); r++) {
      const tableRow = table.getRow(r);
      for (let c = 0; c < tableRow.getNumCells(); c++) {
        tableRow.getCell(c).replaceText(pattern, groupValue || '');
      }
    }
  }

  private normalizeText(value: any): string {
    if (value === undefined || value === null) return '';
    return value.toString().trim();
  }

  private extractTableGroupDirective(
    table: GoogleAppsScript.Document.Table
  ): { groupId: string; fieldId: string } | null {
    const text = table.getText && table.getText();
    if (!text) return null;
    const match = text.match(/{{GROUP_TABLE\(([A-Z0-9_]+)\.([A-Z0-9_]+)\)}}/i);
    if (!match) return null;
    return {
      groupId: match[1].toUpperCase(),
      fieldId: match[2].toUpperCase()
    };
  }

  private renderTableRows(
    table: GoogleAppsScript.Document.Table,
    groupLookup: Record<string, QuestionConfig>,
    lineItemRows: Record<string, any[]>,
    override?: { groupId: string; rows: any[] }
  ): void {
    for (let r = 0; r < table.getNumRows(); r++) {
      const row = table.getRow(r);
      const placeholders = this.extractLineItemPlaceholders(row.getText());
      if (!placeholders.length) continue;
      const distinctGroups = Array.from(new Set(placeholders.map(p => p.groupId)));
      if (distinctGroups.length !== 1) continue;
      const groupId = distinctGroups[0];
      const group = groupLookup[groupId];
      if (!group) continue;
      const rows = override && override.groupId === group.id
        ? override.rows
        : lineItemRows[group.id];
      if (!rows || !rows.length) {
        this.clearTableRow(row);
        continue;
      }
      const templateCells: string[] = [];
      for (let c = 0; c < row.getNumCells(); c++) {
        templateCells.push(row.getCell(c).getText());
      }
      rows.forEach((dataRow, idx) => {
        let targetRow = row;
        if (idx > 0) {
          targetRow = table.insertTableRow(r + idx);
          while (targetRow.getNumCells() < templateCells.length) {
            targetRow.appendTableCell('');
          }
        }
        for (let c = 0; c < templateCells.length; c++) {
          const template = templateCells[c];
          const text = this.replaceLineItemPlaceholders(template, group, dataRow);
          const cell = targetRow.getCell(c);
          cell.clear();
          cell.appendParagraph(text || '');
        }
      });
      r += rows.length - 1;
    }
  }

  private extractLineItemPlaceholders(text: string): Array<{ groupId: string; fieldId: string }> {
    const matches: Array<{ groupId: string; fieldId: string }> = [];
    if (!text) return matches;
    const pattern = /{{([A-Z0-9_]+)\.([A-Z0-9_]+)}}/gi;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      matches.push({ groupId: match[1].toUpperCase(), fieldId: match[2].toUpperCase() });
    }
    return matches;
  }

  private clearTableRow(row: GoogleAppsScript.Document.TableRow): void {
    if (!row) return;
    for (let c = 0; c < row.getNumCells(); c++) {
      const cell = row.getCell(c);
      cell.clear();
    }
  }

  private replaceLineItemPlaceholders(
    template: string,
    group: QuestionConfig,
    rowData: Record<string, any>
  ): string {
    if (!template) return '';
    const normalizedGroupId = group.id.toUpperCase();
    const replacements: Record<string, string> = {};
    (group.lineItemConfig?.fields || []).forEach(field => {
      const text = this.formatTemplateValue(rowData ? rowData[field.id] : '');
      const tokens = [
        `${normalizedGroupId}.${field.id.toUpperCase()}`,
        `${normalizedGroupId}.${this.slugifyPlaceholder(field.labelEn || field.id)}`
      ];
      tokens.forEach(token => {
        replacements[token] = text;
      });
    });
    return template.replace(/{{([A-Z0-9_]+)\.([A-Z0-9_]+)}}/gi, (_, groupId, fieldKey) => {
      if (groupId.toUpperCase() !== normalizedGroupId) return '';
      const token = `${normalizedGroupId}.${fieldKey.toUpperCase()}`;
      return replacements[token] ?? '';
    });
  }

  private formatTemplateValue(value: any): string {
    if (value === undefined || value === null) return '';
    if (Array.isArray(value)) {
      if (value.length && typeof value[0] === 'object') {
        return value
          .map(entry =>
            Object.entries(entry)
              .map(([key, val]) => `${key}: ${val ?? ''}`)
              .join(', ')
          )
          .join('\n');
      }
      return value.map(v => (v ?? '').toString()).join(', ');
    }
    if (typeof value === 'object') {
      return Object.entries(value)
        .map(([key, val]) => `${key}: ${val ?? ''}`)
        .join(', ');
    }
    if (value instanceof Date) {
      return value.toISOString();
    }
    return value.toString();
  }

  private addPlaceholderVariants(map: Record<string, string>, key: string, value: any): void {
    if (!key) return;
    const keys = this.buildPlaceholderKeys(key);
    const text = this.formatTemplateValue(value);
    keys.forEach(token => {
      map[`{{${token}}}`] = text;
    });
  }

  private buildPlaceholderKeys(raw: string): string[] {
    const sanitized = raw || '';
    const segments = sanitized.split('.').map(seg => seg.trim());
    const upper = segments.map(seg => seg.toUpperCase()).join('.');
    const lower = segments.map(seg => seg.toLowerCase()).join('.');
    const title = segments
      .map(seg =>
        seg
          .toLowerCase()
          .split('_')
          .map(word => (word ? word.charAt(0).toUpperCase() + word.slice(1) : ''))
          .join('_')
      )
      .join('.');
    return Array.from(new Set([upper, lower, title]));
  }

  private resolveTemplateId(template: TemplateIdMap | undefined, language: string): string | undefined {
    if (!template) return undefined;
    if (typeof template === 'string') {
      const trimmed = template.trim();
      return trimmed || undefined;
    }
    const langKey = (language || 'EN').toUpperCase();
    if (template[langKey]) return template[langKey];
    const lower = (language || 'en').toLowerCase();
    if (template[lower]) return template[lower];
    if (template.EN) return template.EN;
    const firstKey = Object.keys(template)[0];
    return firstKey ? template[firstKey] : undefined;
  }

  private lookupRecipientFromDataSource(
    entry: EmailRecipientDataSourceConfig,
    lookupValue: any,
    language: string
  ): string | undefined {
    if (!lookupValue) return undefined;
    try {
      const projection = entry.dataSource?.projection || [entry.lookupField, entry.valueField];
      const limit = entry.dataSource?.limit || 200;
      const response = this.fetchDataSource(entry.dataSource, language, projection, limit);
      const items = Array.isArray(response.items) ? response.items : [];
      const normalizedLookup = lookupValue.toString().trim().toLowerCase();
      for (const item of items) {
        if (!item || typeof item !== 'object') continue;
        const matchValue = (item as any)[entry.lookupField];
        if (matchValue === undefined || matchValue === null) continue;
        const normalizedMatch = matchValue.toString().trim().toLowerCase();
        if (normalizedMatch === normalizedLookup) {
          const emailValue = (item as any)[entry.valueField];
          if (emailValue && emailValue.toString().trim()) {
            return emailValue.toString().trim();
          }
        }
      }
    } catch (err) {
      debugLog('followup.recipient.lookup.failed', {
        error: err ? err.toString() : 'lookup error',
        dataSource: entry.dataSource?.id || entry.dataSource
      });
    }
    return undefined;
  }

  private lookupDataSourceDetails(
    question: QuestionConfig,
    selectedValue: string,
    language: string
  ): Record<string, string> | null {
    if (!selectedValue || !question.dataSource) return null;
    const ds = question.dataSource;
    const normalized = selectedValue.toString().trim().toLowerCase();
    if (!normalized) return null;
    const cacheKey = JSON.stringify({
      id: ds.id,
      tabName: ds.tabName,
      sheetId: ds.sheetId,
      projection: ds.projection
    });
    if (!this.dataSourceCache[cacheKey]) {
      this.dataSourceCache[cacheKey] = this.fetchDataSource(ds, language, ds.projection, ds.limit);
    }
    const response = this.dataSourceCache[cacheKey];
    const items = Array.isArray(response.items) ? response.items : [];
    const lookupFields = this.buildDataSourceLookupFields(ds);
    for (const item of items) {
      if (!item || typeof item !== 'object') continue;
      const matchField = lookupFields.find(field => item[field] !== undefined);
      if (!matchField) continue;
      const candidate = item[matchField];
      if (!candidate) continue;
      if (candidate.toString().trim().toLowerCase() === normalized) {
        const result: Record<string, string> = {};
        Object.entries(item).forEach(([key, val]) => {
          if (val === undefined || val === null) return;
          const text = val instanceof Date ? val.toISOString() : val.toString();
          const sanitizedKey = key.replace(/\s+/g, '_').toUpperCase();
          result[sanitizedKey] = text;
        });
        return result;
      }
    }
    return null;
  }

  private buildDataSourceLookupFields(ds: DataSourceConfig): string[] {
    const fields: string[] = [];
    if (ds.mapping) {
      Object.entries(ds.mapping).forEach(([source, target]) => {
        if (target === 'value' || target === 'id') {
          fields.push(source);
        }
      });
    }
    if (ds.projection && ds.projection.length) {
      fields.push(ds.projection[0]);
    }
    fields.push('value');
    return Array.from(new Set(fields.filter(Boolean).map(f => f.toString())));
  }

  private slugifyPlaceholder(label: string): string {
    return (label || '').toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  }

  private applyPlaceholders(template: string, placeholders: Record<string, string>): string {
    if (!template) return '';
    let output = template;
    Object.entries(placeholders).forEach(([token, value]) => {
      output = output.replace(new RegExp(this.escapeRegExp(token), 'g'), value ?? '');
    });
    return output;
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private resolveRecipients(
    entries: EmailRecipientEntry[] | undefined,
    placeholders: Record<string, string>,
    record: WebFormSubmission
  ): string[] {
    if (!entries || !entries.length) return [];
    const resolved: string[] = [];
    entries.forEach(entry => {
      if (typeof entry === 'string') {
        const address = this.applyPlaceholders(entry, placeholders).trim();
        if (address) resolved.push(address);
        return;
      }
      if (entry && entry.type === 'dataSource') {
        const lookupValue = (record.values && record.values[entry.recordFieldId]) || '';
        const address = this.lookupRecipientFromDataSource(entry, lookupValue, record.language);
        if (address) {
          resolved.push(address);
        } else if (entry.fallbackEmail) {
          resolved.push(entry.fallbackEmail);
        }
      }
    });
    return resolved.filter(Boolean);
  }

  private resolveLocalizedStringValue(value: any, language?: string): string {
    if (!value) return '';
    if (typeof value === 'string') return value;
    const langKey = (language || 'EN').toLowerCase();
    return value[langKey] || value.en || value.EN || '';
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
    return `${AUTO_INCREMENT_PROPERTY_PREFIX}${this.digestKey(base)}`;
  }
}

interface HeaderColumns {
  timestamp?: number;
  language?: number;
  recordId?: number;
  createdAt?: number;
  updatedAt?: number;
  status?: number;
  pdfUrl?: number;
  fields: Record<string, number>;
}

interface CachedListPage {
  list: PaginatedResult<Record<string, any>>;
  records: Record<string, WebFormSubmission>;
}

interface ListPageResult extends CachedListPage {
  etag: string;
}

interface RecordContext {
  sheet: GoogleAppsScript.Spreadsheet.Sheet;
  headers: string[];
  columns: HeaderColumns;
  rowIndex: number;
  rowValues: any[];
  record: WebFormSubmission | null;
}
