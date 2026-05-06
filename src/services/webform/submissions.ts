import {
  AutoIncrementConfig,
  AuditLoggingConfig,
  DedupRule,
  FormConfig,
  QuestionConfig,
  RecordMetadata,
  WebFormSubmission
} from '../../types';
import { evaluateDedupConflict, ExistingRecord, findDedupConflict, DedupConflict, computeDedupSignature } from '../dedup';
import { CacheEtagManager } from './cache';
import { buildResponsesRecordSchema, normalizeHeaderToken, parseHeaderKey, sanitizeHeaderCellText } from './recordSchema';
import { HeaderColumns, RecordContext } from './types';
import { UploadService } from './uploads';
import {
  ensureRecordIndexSheet,
  getRecordIndexSheetName,
  findRowNumberInRecordIndex,
  readDataVersionFromRecordIndex,
  writeRecordIndexRow
} from './recordIndex';
import { normalizeToIsoDate } from './followup/utils';
import { matchesStatusTransition, resolveStatusTransitionValue } from '../../domain/statusTransitions';
import { DOCUMENT_LOCK_BUSY_MESSAGE, withSharedDocumentLock } from './documentLock';

const AUTO_INCREMENT_PROPERTY_PREFIX = 'CK_AUTO_';

const resolveSubgroupKey = (sub?: any): string => {
  if (!sub) return '';
  if (sub.id) return sub.id;
  // Phase 3 (Option A): subgroup IDs are required; label fallback is intentionally removed.
  return '';
};

const ROW_ID_KEY = '__ckRowId';

const buildSubgroupKey = (parentGroupId: string, parentRowId: string, subGroupId: string): string =>
  `${parentGroupId}::${parentRowId}::${subGroupId}`;

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

  private readSubmissionFieldValue(formObject: WebFormSubmission | Record<string, any>, fieldId: string): any {
    if ((formObject as any)?.values && typeof (formObject as any).values === 'object') {
      const values = (formObject as any).values as Record<string, any>;
      if (Object.prototype.hasOwnProperty.call(values, fieldId)) {
        return values[fieldId];
      }
    }
    if (Object.prototype.hasOwnProperty.call(formObject || {}, fieldId)) {
      return (formObject as any)[fieldId];
    }
    return undefined;
  }

  private writeSubmissionFieldValue(formObject: WebFormSubmission | Record<string, any>, fieldId: string, value: any): void {
    const key = (fieldId || '').toString().trim();
    if (!key) return;
    if ((formObject as any)?.values && typeof (formObject as any).values === 'object') {
      ((formObject as any).values as Record<string, any>)[key] = value;
    }
    (formObject as any)[key] = value;
  }

  private shouldReturnUploadValues(formObject: WebFormSubmission): boolean {
    const raw = (formObject as any).__ckReturnUploadValues;
    return raw === true || raw === 'true' || raw === '1' || raw === 1;
  }

  private shouldNoopIfUnchanged(formObject: WebFormSubmission): boolean {
    const raw = (formObject as any).__ckNoopIfUnchanged;
    return raw === true || raw === 'true' || raw === '1' || raw === 1;
  }

  private normalizeUploadValueForMeta(raw: any): string {
    if (raw === undefined || raw === null) return '';
    if (Array.isArray(raw)) {
      return raw
        .map(item => this.normalizeUploadValueForMeta(item))
        .map(part => part.trim())
        .filter(Boolean)
        .join(', ');
    }
    if (typeof raw === 'object' && typeof raw.url === 'string') return raw.url.trim();
    try {
      return raw.toString().trim();
    } catch {
      return '';
    }
  }

  private buildUploadValuesMeta(
    questions: QuestionConfig[],
    candidateValues: Record<string, any>
  ): {
    top: Record<string, string>;
    line: Array<{ groupId: string; rowId: string; fieldId: string; value: string }>;
  } {
    const top: Record<string, string> = {};
    const line: Array<{ groupId: string; rowId: string; fieldId: string; value: string }> = [];

    const collectRows = (groupKey: string, groupCfg: any, rows: any[]) => {
      const fields = Array.isArray(groupCfg?.fields) ? groupCfg.fields : [];
      const fileFields = fields.filter((field: any) => field && field.type === 'FILE_UPLOAD' && field.id);
      const subGroups = Array.isArray(groupCfg?.subGroups) ? groupCfg.subGroups : [];

      (Array.isArray(rows) ? rows : []).forEach(row => {
        if (!row || typeof row !== 'object') return;
        const rowId = ((row as any)[ROW_ID_KEY] || (row as any).id || '').toString().trim();
        if (rowId) {
          fileFields.forEach((field: any) => {
            line.push({
              groupId: groupKey,
              rowId,
              fieldId: field.id.toString(),
              value: this.normalizeUploadValueForMeta((row as any)[field.id])
            });
          });
        }

        subGroups.forEach((sub: any) => {
          const subId = resolveSubgroupKey(sub);
          if (!subId || !Array.isArray((row as any)[subId])) return;
          collectRows(buildSubgroupKey(groupKey, rowId, subId), sub, (row as any)[subId]);
        });
      });
    };

    questions.filter(q => q.type !== 'BUTTON').forEach(q => {
      if (q.type === 'FILE_UPLOAD') {
        top[q.id] = this.normalizeUploadValueForMeta(candidateValues[q.id]);
        return;
      }
      if (q.type !== 'LINE_ITEM_GROUP' || !q.lineItemConfig) return;
      const rawRows = candidateValues[q.id];
      const rows = (() => {
        if (Array.isArray(rawRows)) return rawRows;
        if (typeof rawRows === 'string' && rawRows.trim()) {
          try {
            const parsed = JSON.parse(rawRows);
            return Array.isArray(parsed) ? parsed : [];
          } catch {
            return [];
          }
        }
        return [];
      })();
      collectRows(q.id, q.lineItemConfig, rows);
    });

    return { top, line };
  }

  private readSubmissionLineItemGroupValue(formObject: WebFormSubmission | Record<string, any>, fieldId: string): any {
    const jsonKey = `${fieldId}_json`;
    const jsonValue = this.readSubmissionFieldValue(formObject, jsonKey);
    if (jsonValue !== undefined) return jsonValue;
    return this.readSubmissionFieldValue(formObject, fieldId);
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
    const deleteRecordIdRaw = ((formObject as any).__ckDeleteRecordId || '').toString().trim();
    const dedupDeleteOnKeyChange =
      form.dedupDeleteOnKeyChange === true || (form as any).dedupRecreateOnKeyChange === true;
    const deleteRecordId = dedupDeleteOnKeyChange ? deleteRecordIdRaw : '';

    try {
      return withSharedDocumentLock('submissions.saveSubmissionWithId', 8000, () => {
        const { sheet, headers, columns } = this.ensureDestination(form.destinationTab || `${form.title} Responses`, questions);
        const destinationName = sheet.getName ? sheet.getName() : (form.destinationTab || `${form.title} Responses`);

      if (deleteRecordId) {
        const deleted = this.deleteRecordById(sheet, columns, destinationName, dedupRules, deleteRecordId);
        if (!deleted.deleted) {
          return {
            success: false,
            message: 'Failed to delete previous record.',
            meta: { id: deleteRecordId }
          } as any;
        }
        this.cacheManager.bumpSheetEtag(sheet, columns, 'saveSubmission.deleteOnly');
        return {
          success: true,
          message: 'Deleted previous record.',
          meta: {
            id: deleteRecordId,
            rowNumber: deleted.rowNumber,
            updatedAt: new Date().toISOString()
          }
        } as any;
      }

    const now = new Date();
    const incomingId =
      ((formObject as any).id && (formObject as any).id.trim)
        ? ((formObject as any).id as any).trim()
        : (formObject as any).id;
    const recordId = incomingId || this.generateUuid();

    // Find existing row by id
    let existingRowIdx = -1;
    // Prefer the record index (fast, avoids scanning 100k ids).
    try {
      const idx = ensureRecordIndexSheet(this.ss, destinationName, dedupRules);
      const rowNumber = findRowNumberInRecordIndex(idx.sheet, recordId);
      if (rowNumber >= 2) {
        existingRowIdx = rowNumber - 2;
      }
    } catch (_) {
      existingRowIdx = -1;
    }
    // Fallback: scan using TextFinder / getValues (tests)
    if (existingRowIdx < 0 && columns.recordId) {
      const rowIndex = this.findRowIndexById(sheet, columns, recordId);
      existingRowIdx = rowIndex >= 2 ? rowIndex - 2 : -1;
    }

    const existingRowValues =
      existingRowIdx >= 0
        ? this.normalizeRowValues(
            sheet.getRange(2 + existingRowIdx, 1, 1, headers.length).getValues()[0] || [],
            headers.length
          )
        : undefined;
    const valuesArray = existingRowValues ? [...existingRowValues] : new Array(headers.length).fill('');
    const setIf = (idx: number | undefined, value: any) => {
      if (!idx) return;
      valuesArray[idx - 1] = value ?? '';
    };

    setIf(columns.timestamp, now);
    setIf(columns.language, language);
    setIf(columns.recordId, recordId);

    // Preserve createdAt if updating
    let createdAtVal: any = now;
    if (existingRowValues && columns.createdAt) {
      const existing = existingRowValues[columns.createdAt - 1];
      createdAtVal = existing || now;
    }
    const updatedAtVal = existingRowIdx >= 0 ? now : createdAtVal;
    setIf(columns.createdAt, createdAtVal);
    setIf(columns.updatedAt, updatedAtVal);

    // DataVersion: monotonic server-owned integer
    const previousVersion = (() => {
      if (!existingRowValues) return 0;
      if (!columns.dataVersion) return 0;
      try {
        const raw = existingRowValues[columns.dataVersion - 1];
        const n = Number(raw);
        return Number.isFinite(n) && n > 0 ? n : 0;
      } catch {
        return 0;
      }
    })();

    // Optimistic locking (best-effort):
    // - The client includes __ckClientDataVersion (the version it last loaded/saw).
    // - If the sheet already has a higher version, the record was modified elsewhere; reject to avoid overwriting.
    try {
      const clientRaw = (formObject as any).__ckClientDataVersion;
      const clientVersion = clientRaw === undefined || clientRaw === null ? Number.NaN : Number(clientRaw);
      if (
        existingRowIdx >= 0 &&
        columns.dataVersion &&
        Number.isFinite(clientVersion) &&
        clientVersion > 0 &&
        previousVersion > 0 &&
        clientVersion < previousVersion
      ) {
        const existingUpdatedAt = (() => {
          if (!columns.updatedAt || !existingRowValues) return undefined;
          try {
            const raw = existingRowValues[columns.updatedAt - 1];
            return this.asIso(raw);
          } catch {
            return undefined;
          }
        })();
        return {
          success: false,
          message: 'This record was modified by another user. Please refresh.',
          meta: {
            id: recordId.toString(),
            dataVersion: previousVersion || undefined,
            updatedAt: existingUpdatedAt,
            rowNumber: existingRowIdx >= 0 ? 2 + existingRowIdx : undefined
          }
        };
      }
    } catch (_) {
      // ignore optimistic lock failures; fall back to last-write-wins
    }
    const nextVersion = previousVersion + 1;
    setIf(columns.dataVersion, nextVersion);

    const saveMode = ((formObject as any).__ckSaveMode || '').toString().trim().toLowerCase();
    const transitions = form.followupConfig?.statusTransitions;
    const statusFieldId = form.followupConfig?.statusFieldId;
    const statusFieldIdx =
      statusFieldId && columns.fields[statusFieldId] ? (columns.fields[statusFieldId] as number) : undefined;
    const metaStatusIdx = columns.status;
    const statusIdx = statusFieldIdx || metaStatusIdx;
    const readCellText = (colIdx?: number): string => {
      if (!colIdx || !existingRowValues) return '';
      try {
        const raw = existingRowValues[colIdx - 1];
        return raw === undefined || raw === null ? '' : raw.toString();
      } catch {
        return '';
      }
    };
    const explicitStatusValue = ((formObject as any).__ckStatus || '').toString().trim();

    // Draft autosave: write status + protect closed records from background saves.
    if (saveMode === 'draft') {
      const inProgressFallback =
        resolveStatusTransitionValue(transitions, 'inProgress', language) ||
        (form.autoSave?.status ? form.autoSave.status.toString() : '') ||
        'In progress';
      const statusValue = explicitStatusValue || inProgressFallback || 'In progress';

      const existingStatusText = (() => {
        const fromField = statusFieldIdx ? readCellText(statusFieldIdx).trim() : '';
        const fromMeta = metaStatusIdx ? readCellText(metaStatusIdx).trim() : '';
        return (fromField || fromMeta || '').toString();
      })();
      const isClosed = matchesStatusTransition(existingStatusText, transitions, 'onClose', { includeDefaultOnClose: true });
      // Allow an explicit user-initiated "re-open" (or other status change) for records matching statusTransitions.onClose.
      // This must NOT enable background autosave to mutate closed records by accident, so it is gated behind
      // a dedicated flag (set by the web app only for explicit actions).
      const allowClosedUpdateRaw = (formObject as any).__ckAllowClosedUpdate;
      const allowClosedUpdate =
        allowClosedUpdateRaw === true ||
        allowClosedUpdateRaw === 'true' ||
        allowClosedUpdateRaw === '1' ||
        allowClosedUpdateRaw === 1;
      const nextStatusIsClosed = matchesStatusTransition(statusValue, transitions, 'onClose', { includeDefaultOnClose: true });
      const allowReopen = allowClosedUpdate && !nextStatusIsClosed;

      if (existingRowIdx >= 0 && isClosed && !allowReopen) {
        const closedLabel =
          resolveStatusTransitionValue(transitions, 'onClose', language, { includeDefaultOnClose: true }) || 'Closed';
        return {
          success: false,
          message: `Record is ${closedLabel} and read-only.`,
          meta: {
            id: recordId
          }
        };
      }

      setIf(statusIdx, statusValue);
    } else if (explicitStatusValue) {
      setIf(statusIdx, explicitStatusValue);
      if (statusFieldId) {
        (formObject as any)[statusFieldId] = explicitStatusValue;
      }
    }

    const candidateValues: Record<string, any> = {};
    const autoIncrementValues: Record<string, string> = {};
    questions.filter(q => q.type !== 'BUTTON').forEach(q => {
      if (q.type === 'TEXT' && q.autoIncrement) {
        const currentVal = this.readSubmissionFieldValue(formObject, q.id);
        if (!currentVal) {
          const existingAutoIncrementValue = (() => {
            if (existingRowIdx < 0) return '';
            const colIdx = columns.fields[q.id];
            if (!colIdx || !existingRowValues) return '';
            const raw = existingRowValues[colIdx - 1];
            return raw === undefined || raw === null ? '' : raw.toString();
          })();
          if (existingAutoIncrementValue) {
            this.writeSubmissionFieldValue(formObject, q.id, existingAutoIncrementValue);
          } else {
            const generated = this.generateAutoIncrementValue(form.configSheet, q.id, q.autoIncrement, formObject);
            if (generated) {
              this.writeSubmissionFieldValue(formObject, q.id, generated);
            }
          }
        }
        const resolvedVal = this.readSubmissionFieldValue(formObject, q.id);
        if (resolvedVal !== undefined && resolvedVal !== null && resolvedVal.toString().trim()) {
          autoIncrementValues[q.id] = resolvedVal.toString().trim();
        }
      }
    });

    questions.filter(q => q.type !== 'BUTTON').forEach(q => {
      const colIdx = columns.fields[q.id];
      if (!colIdx) return;
      let value: any = '';

      if (q.type === 'LINE_ITEM_GROUP') {
        const rawLineItems = this.readSubmissionLineItemGroupValue(formObject, q.id);
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
          } catch {
            try {
              value = JSON.stringify(parsed);
            } catch {
              value = '';
            }
          }
        } else if (rawLineItems && typeof rawLineItems === 'string') {
          value = rawLineItems;
        } else if (rawLineItems) {
          try {
            value = JSON.stringify(rawLineItems);
          } catch {
            value = '';
          }
        }
      } else if (q.type === 'FILE_UPLOAD') {
        value = this.uploadService.saveFiles(this.readSubmissionFieldValue(formObject, q.id), q.uploadConfig);
      } else {
        value = this.readSubmissionFieldValue(formObject, q.id);
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

    const destinationRowNumber = existingRowIdx >= 0 ? (2 + existingRowIdx) : (sheet.getLastRow() + 1);
    const hasMeaningfulChanges =
      existingRowIdx < 0
        ? true
        : this.hasMeaningfulRowChanges(existingRowValues || [], valuesArray, columns);
    if (existingRowIdx >= 0 && !hasMeaningfulChanges && this.shouldNoopIfUnchanged(formObject)) {
      const meta: Record<string, any> = {
        id: recordId,
        createdAt: this.readRecordMetadataIso(existingRowValues, columns.createdAt),
        updatedAt:
          this.readRecordMetadataIso(existingRowValues, columns.updatedAt) ||
          this.readRecordMetadataIso(existingRowValues, columns.createdAt),
        dataVersion: previousVersion || undefined,
        rowNumber: destinationRowNumber,
        operation: 'noop',
        noop: true,
        noopReason: 'unchanged'
      };
      if (this.shouldReturnUploadValues(formObject)) {
        meta.uploadValues = this.buildUploadValuesMeta(questions, candidateValues);
      }
      return {
        success: true,
        message: 'No changes to save.',
        meta: meta as RecordMetadata
      };
    }

    // Dedup check (indexed): search dedup signatures in the record index sheet.
    const effectiveDedupRules = (dedupRules || []).filter(r => r && (r.onConflict || 'reject') === 'reject' && (r.scope || 'form') === 'form');
    if (effectiveDedupRules.length) {
      try {
        const idx = ensureRecordIndexSheet(this.ss, destinationName, effectiveDedupRules);
        const lastRow = idx.sheet.getLastRow();
        const dataRows = Math.max(0, lastRow - 1);

        // Safety: if the index appears incomplete, use the slower sheet scan instead of
        // showing an operator-only rebuild message to frontline users.
        const destLastRow = sheet.getLastRow();
        if (destLastRow >= 2) {
          let indexAppearsIncomplete = false;
          try {
            const destTopId = (sheet.getRange(2, columns.recordId || 1, 1, 1).getValues()[0][0] || '').toString().trim();
            const idxTopId = (idx.sheet.getRange(2, idx.columns.recordId, 1, 1).getValues()[0][0] || '').toString().trim();
            const destLastId = (sheet.getRange(destLastRow, columns.recordId || 1, 1, 1).getValues()[0][0] || '').toString().trim();
            const idxLastId = (idx.sheet.getRange(destLastRow, idx.columns.recordId, 1, 1).getValues()[0][0] || '').toString().trim();
            indexAppearsIncomplete = Boolean(((destTopId && !idxTopId) || (destLastId && !idxLastId)) && destLastRow > 2);
          } catch {
            // ignore; proceed with indexed lookup
          }
          if (indexAppearsIncomplete) throw new Error('Record index appears incomplete; falling back to sheet scan.');
        }
        for (const rule of effectiveDedupRules) {
          const sig = computeDedupSignature(rule, candidateValues);
          if (!sig) continue;
          const ruleId = (rule.id || '').toString().trim().replace(/\s+/g, '_');
          const col = (idx.columns.dedupByRuleId as any)[ruleId] as number | undefined;
          if (!col || dataRows <= 0) continue;
          let matchRow = -1;
          try {
            const range = idx.sheet.getRange(2, col, dataRows, 1);
            const finder = (range as any).createTextFinder ? (range as any).createTextFinder(sig) : null;
            if (finder && typeof finder.matchEntireCell === 'function') {
              const match = finder.matchEntireCell(true).findNext();
              if (match && typeof match.getRow === 'function') {
                matchRow = match.getRow();
              }
            }
          } catch (_) {
            matchRow = -1;
          }
          if (matchRow >= 2) {
            // Ignore self when updating (same destination row).
            const selfRow = existingRowIdx >= 0 ? 2 + existingRowIdx : -1;
            if (selfRow >= 2 && matchRow === selfRow) continue;
            // Read existing record id from index row.
            let existingId = '';
            try {
              existingId = (idx.sheet.getRange(matchRow, idx.columns.recordId, 1, 1).getValues()[0][0] || '').toString();
            } catch (_) {
              existingId = '';
            }
            const conflict = findDedupConflict([rule], { id: recordId, values: candidateValues }, [{ id: existingId, rowNumber: matchRow, values: candidateValues }], language);
            // If we couldn't resolve message via findDedupConflict (because we didn't load actual values), fall back:
            const message = conflict?.message || (rule.message ? (typeof rule.message === 'string' ? rule.message : (rule.message as any)[language.toLowerCase()] || (rule.message as any).en) : 'Duplicate record.');
            return {
              success: false,
              message: message || 'Duplicate record.',
              meta: { id: recordId, createdAt: createdAtVal, updatedAt: undefined }
            };
          }
        }
      } catch {
        // If index is unavailable, fall back to the legacy scan-based approach (small sheets / tests).
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
    }

    if (existingRowIdx >= 0) {
      this.writeRowAtomicDelta(sheet, destinationRowNumber, existingRowValues || new Array(headers.length).fill(''), valuesArray);
    } else {
      sheet.appendRow(valuesArray);
    }

    const meta: RecordMetadata = {
      id: recordId,
      createdAt: createdAtVal instanceof Date ? createdAtVal.toISOString() : createdAtVal,
      updatedAt: updatedAtVal instanceof Date ? updatedAtVal.toISOString() : updatedAtVal,
      dataVersion: nextVersion,
      rowNumber: destinationRowNumber,
      operation: existingRowIdx >= 0 ? 'update' : 'create'
    };
    if (Object.keys(autoIncrementValues).length) {
      meta.autoIncrementValues = autoIncrementValues;
    }
    if (this.shouldReturnUploadValues(formObject)) {
      (meta as any).uploadValues = this.buildUploadValuesMeta(questions, candidateValues);
    }

    let newEtag = this.cacheManager.bumpSheetEtag(
      sheet,
      columns,
      existingRowIdx >= 0 ? 'saveSubmission.update' : 'saveSubmission.create'
    );
    const cachedRecord = this.buildSubmissionRecord(form.configSheet, questions, columns, valuesArray, recordId);
    if (cachedRecord) {
      this.cacheManager.cacheRecord(form.configSheet, newEtag, cachedRecord);
    }

    // Update record index row (best-effort).
    try {
      const idx = ensureRecordIndexSheet(this.ss, destinationName, effectiveDedupRules);
      const dedupSignatures: Record<string, string> = {};
      effectiveDedupRules.forEach(rule => {
        const sig = computeDedupSignature(rule, candidateValues);
        if (!sig) return;
        dedupSignatures[(rule.id || '').toString()] = sig;
      });
      writeRecordIndexRow({
        indexSheet: idx.sheet,
        columns: idx.columns,
        rowNumber: destinationRowNumber,
        recordId,
        dataVersion: nextVersion,
        updatedAtIso: meta.updatedAt ? meta.updatedAt.toString() : '',
        createdAtIso: meta.createdAt ? meta.createdAt.toString() : '',
        dedupSignatures
      });
    } catch {
      // ignore
    }

    // Best-effort: write audit rows to the dedicated audit sheet when enabled for this form.
    try {
      this.writeAuditRows({
        form,
        questions,
        columns,
        destinationName,
        recordId,
        beforeRowValues: existingRowValues,
        afterRowValues: valuesArray,
        changedAt: now,
        deviceInfo: (formObject as any).__ckDeviceInfo,
        auditAction: (formObject as any).__ckAuditAction
      });
    } catch {
      // ignore audit logging failures so primary saves are not blocked
    }

        return { success: true, message: 'Saved to sheet', meta };
      }, DOCUMENT_LOCK_BUSY_MESSAGE);
    } catch (err: any) {
      return {
        success: false,
        message: (err?.message || DOCUMENT_LOCK_BUSY_MESSAGE).toString(),
        meta: {}
      };
    }
  }

  saveTrustedSubmissionWithId(
    formObject: WebFormSubmission,
    form: FormConfig,
    questions: QuestionConfig[],
    dedupRules: DedupRule[]
  ): { success: boolean; message: string; meta: RecordMetadata } {
    const langValue = Array.isArray((formObject as any).language)
      ? ((formObject as any).language[(formObject as any).language.length - 1] || (formObject as any).language[0])
      : (formObject as any).language;
    const languageRaw = (langValue || 'EN').toString().toUpperCase();
    const language = (['EN', 'FR', 'NL'].includes(languageRaw) ? languageRaw : 'EN') as 'EN' | 'FR' | 'NL';
    const now = new Date();
    const incomingId =
      ((formObject as any).id && (formObject as any).id.trim)
        ? ((formObject as any).id as any).trim()
        : (formObject as any).id;
    const recordId = incomingId || this.generateUuid();

    try {
      const { sheet, headers, columns } = this.ensureDestination(form.destinationTab || `${form.title} Responses`, questions);
      const destinationName = sheet.getName ? sheet.getName() : (form.destinationTab || `${form.title} Responses`);

      let existingRowIdx = -1;
      try {
        const idx = ensureRecordIndexSheet(this.ss, destinationName, dedupRules);
        const rowNumber = findRowNumberInRecordIndex(idx.sheet, recordId);
        if (rowNumber >= 2) {
          existingRowIdx = rowNumber - 2;
        }
      } catch {
        existingRowIdx = -1;
      }
      if (existingRowIdx < 0 && columns.recordId) {
        const rowIndex = this.findRowIndexById(sheet, columns, recordId);
        existingRowIdx = rowIndex >= 2 ? rowIndex - 2 : -1;
      }

      const existingRowValues =
        existingRowIdx >= 0
          ? this.normalizeRowValues(
              sheet.getRange(2 + existingRowIdx, 1, 1, headers.length).getValues()[0] || [],
              headers.length
            )
          : undefined;
      const valuesArray = existingRowValues ? [...existingRowValues] : new Array(headers.length).fill('');
      const setIf = (idx: number | undefined, value: any) => {
        if (!idx) return;
        valuesArray[idx - 1] = value ?? '';
      };

      setIf(columns.timestamp, now);
      setIf(columns.language, language);
      setIf(columns.recordId, recordId);

      const createdAtVal =
        existingRowValues && columns.createdAt ? existingRowValues[columns.createdAt - 1] || now : now;
      const updatedAtVal = existingRowIdx >= 0 ? now : createdAtVal;
      setIf(columns.createdAt, createdAtVal);
      setIf(columns.updatedAt, updatedAtVal);

      const previousVersion = (() => {
        if (!existingRowValues || !columns.dataVersion) return 0;
        const raw = existingRowValues[columns.dataVersion - 1];
        const n = Number(raw);
        return Number.isFinite(n) && n > 0 ? n : 0;
      })();
      const nextVersion = previousVersion + 1;
      setIf(columns.dataVersion, nextVersion);

      const explicitStatusValue = ((formObject as any).__ckStatus || formObject.status || '').toString().trim();
      if (explicitStatusValue) {
        setIf(columns.status, explicitStatusValue);
      }

      const candidateValues: Record<string, any> = {};
      questions.filter(q => q.type !== 'BUTTON').forEach(q => {
        const colIdx = columns.fields[q.id];
        if (!colIdx) return;
        let value = (formObject.values || {})[q.id];
        if (value === undefined) {
          value = (formObject as any)[q.id];
        }
        if (q.type === 'LINE_ITEM_GROUP' && value && typeof value !== 'string') {
          try {
            value = JSON.stringify(value);
          } catch {
            value = '';
          }
        } else if (Array.isArray(value)) {
          value = value.join(', ');
        }
        if (q.type === 'DATE') {
          value = this.normalizeDateOnlyCell(value);
        }
        candidateValues[q.id] = value ?? '';
        setIf(colIdx, value ?? '');
      });

      const destinationRowNumber = existingRowIdx >= 0 ? 2 + existingRowIdx : sheet.getLastRow() + 1;
      const hasMeaningfulChanges =
        existingRowIdx < 0
          ? true
          : this.hasMeaningfulRowChanges(existingRowValues || [], valuesArray, columns);
      if (existingRowIdx >= 0 && !hasMeaningfulChanges && this.shouldNoopIfUnchanged(formObject)) {
        return {
          success: true,
          message: 'No changes to save.',
          meta: {
            id: recordId,
            createdAt: this.readRecordMetadataIso(existingRowValues, columns.createdAt),
            updatedAt:
              this.readRecordMetadataIso(existingRowValues, columns.updatedAt) ||
              this.readRecordMetadataIso(existingRowValues, columns.createdAt),
            dataVersion: previousVersion || undefined,
            rowNumber: destinationRowNumber,
            operation: 'noop',
            noop: true,
            noopReason: 'unchanged'
          }
        };
      }

      if (existingRowIdx >= 0) {
        this.writeRowAtomicDelta(sheet, destinationRowNumber, existingRowValues || new Array(headers.length).fill(''), valuesArray);
      } else {
        sheet.appendRow(valuesArray);
      }

      const meta: RecordMetadata = {
        id: recordId,
        createdAt: createdAtVal instanceof Date ? createdAtVal.toISOString() : this.asIso(createdAtVal),
        updatedAt: updatedAtVal instanceof Date ? updatedAtVal.toISOString() : this.asIso(updatedAtVal),
        dataVersion: nextVersion,
        rowNumber: destinationRowNumber,
        operation: existingRowIdx >= 0 ? 'update' : 'create'
      };

      const newEtag = this.cacheManager.bumpSheetEtag(
        sheet,
        columns,
        existingRowIdx >= 0 ? 'saveTrustedSubmission.update' : 'saveTrustedSubmission.create'
      );
      const cachedRecord = this.buildSubmissionRecord(form.configSheet, questions, columns, valuesArray, recordId);
      if (cachedRecord) {
        this.cacheManager.cacheRecord(form.configSheet, newEtag, cachedRecord);
      }

      try {
        const idx = ensureRecordIndexSheet(this.ss, destinationName, dedupRules);
        const effectiveDedupRules = (dedupRules || []).filter(
          r => r && (r.onConflict || 'reject') === 'reject' && (r.scope || 'form') === 'form'
        );
        const dedupSignatures: Record<string, string> = {};
        effectiveDedupRules.forEach(rule => {
          const sig = computeDedupSignature(rule, candidateValues);
          if (!sig) return;
          dedupSignatures[(rule.id || '').toString()] = sig;
        });
        writeRecordIndexRow({
          indexSheet: idx.sheet,
          columns: idx.columns,
          rowNumber: destinationRowNumber,
          recordId,
          dataVersion: nextVersion,
          updatedAtIso: meta.updatedAt ? meta.updatedAt.toString() : '',
          createdAtIso: meta.createdAt ? meta.createdAt.toString() : '',
          dedupSignatures
        });
      } catch {
        // ignore
      }

      return { success: true, message: 'Saved to sheet', meta };
    } catch (err: any) {
      return {
        success: false,
        message: (err?.message || DOCUMENT_LOCK_BUSY_MESSAGE).toString(),
        meta: {}
      };
    }
  }

  saveTrustedSubmissionBatch(
    formObjects: WebFormSubmission[],
    form: FormConfig,
    questions: QuestionConfig[],
    dedupRules: DedupRule[]
  ): { success: boolean; message: string; metaById: Record<string, RecordMetadata> } {
    const records = Array.isArray(formObjects) ? formObjects.filter(Boolean) : [];
    if (!records.length) {
      return { success: true, message: 'No records to save.', metaById: {} };
    }

    try {
      const { sheet, headers, columns } = this.ensureDestination(form.destinationTab || `${form.title} Responses`, questions);
      const destinationName = sheet.getName ? sheet.getName() : (form.destinationTab || `${form.title} Responses`);
      const effectiveDedupRules = (dedupRules || []).filter(
        r => r && (r.onConflict || 'reject') === 'reject' && (r.scope || 'form') === 'form'
      );
      const idx = ensureRecordIndexSheet(this.ss, destinationName, effectiveDedupRules);
      const rowNumberById = new Map<string, number>();

      records.forEach(formObject => {
        const incomingId =
          ((formObject as any).id && (formObject as any).id.trim)
            ? ((formObject as any).id as any).trim()
            : (formObject as any).id;
        const recordId = (incomingId || '').toString().trim();
        if (!recordId) return;
        let rowNumber = -1;
        try {
          rowNumber = findRowNumberInRecordIndex(idx.sheet, recordId);
        } catch {
          rowNumber = -1;
        }
        if (rowNumber < 2 && columns.recordId) {
          rowNumber = this.findRowIndexById(sheet, columns, recordId);
        }
        if (rowNumber >= 2) {
          rowNumberById.set(recordId, rowNumber);
        }
      });

      const existingRowsByNumber = this.readRowsByNumber(
        sheet,
        headers.length,
        Array.from(new Set(Array.from(rowNumberById.values()))).sort((a, b) => a - b)
      );

      const metaById: Record<string, RecordMetadata> = {};
      const changedRowsByNumber = new Map<number, any[]>();
      const indexRowsByNumber = new Map<number, any[]>();
      const changedRecords: Array<{ recordId: string; rowValues: any[] }> = [];
      const appendRows: any[][] = [];
      let nextAppendRowNumber = sheet.getLastRow() + 1;

      records.forEach(formObject => {
        const langValue = Array.isArray((formObject as any).language)
          ? ((formObject as any).language[(formObject as any).language.length - 1] || (formObject as any).language[0])
          : (formObject as any).language;
        const languageRaw = (langValue || 'EN').toString().toUpperCase();
        const language = (['EN', 'FR', 'NL'].includes(languageRaw) ? languageRaw : 'EN') as 'EN' | 'FR' | 'NL';
        const now = new Date();
        const incomingId =
          ((formObject as any).id && (formObject as any).id.trim)
            ? ((formObject as any).id as any).trim()
            : (formObject as any).id;
        const recordId = (incomingId || this.generateUuid()).toString().trim();
        const existingRowNumber = rowNumberById.get(recordId) || -1;
        const existingRowValues = existingRowNumber >= 2 ? existingRowsByNumber.get(existingRowNumber) : undefined;
        const valuesArray = existingRowValues ? [...existingRowValues] : new Array(headers.length).fill('');
        const setIf = (colIndex: number | undefined, value: any) => {
          if (!colIndex) return;
          valuesArray[colIndex - 1] = value ?? '';
        };

        setIf(columns.timestamp, now);
        setIf(columns.language, language);
        setIf(columns.recordId, recordId);

        const createdAtVal =
          existingRowValues && columns.createdAt ? existingRowValues[columns.createdAt - 1] || now : now;
        const updatedAtVal = existingRowNumber >= 2 ? now : createdAtVal;
        setIf(columns.createdAt, createdAtVal);
        setIf(columns.updatedAt, updatedAtVal);

        const previousVersion = (() => {
          if (!existingRowValues || !columns.dataVersion) return 0;
          const raw = existingRowValues[columns.dataVersion - 1];
          const n = Number(raw);
          return Number.isFinite(n) && n > 0 ? n : 0;
        })();
        const nextVersion = previousVersion + 1;
        setIf(columns.dataVersion, nextVersion);

        const explicitStatusValue = ((formObject as any).__ckStatus || formObject.status || '').toString().trim();
        if (explicitStatusValue) {
          setIf(columns.status, explicitStatusValue);
        }

        const candidateValues: Record<string, any> = {};
        const autoIncrementValues: Record<string, string> = {};
        questions.filter(q => q.type !== 'BUTTON').forEach(q => {
          if (q.type !== 'TEXT' || !q.autoIncrement) return;
          const currentVal = this.readSubmissionFieldValue(formObject, q.id);
          if (!currentVal) {
            const existingAutoIncrementValue = (() => {
              if (existingRowNumber < 2) return '';
              const colIdx = columns.fields[q.id];
              if (!colIdx || !existingRowValues) return '';
              const raw = existingRowValues[colIdx - 1];
              return raw === undefined || raw === null ? '' : raw.toString();
            })();
            if (existingAutoIncrementValue) {
              this.writeSubmissionFieldValue(formObject, q.id, existingAutoIncrementValue);
            } else {
              const generated = this.generateAutoIncrementValue(form.configSheet, q.id, q.autoIncrement, formObject);
              if (generated) {
                this.writeSubmissionFieldValue(formObject, q.id, generated);
              }
            }
          }
          const resolvedVal = this.readSubmissionFieldValue(formObject, q.id);
          if (resolvedVal !== undefined && resolvedVal !== null && resolvedVal.toString().trim()) {
            autoIncrementValues[q.id] = resolvedVal.toString().trim();
          }
        });

        questions.filter(q => q.type !== 'BUTTON').forEach(q => {
          const colIdx = columns.fields[q.id];
          if (!colIdx) return;
          let value = (formObject.values || {})[q.id];
          if (value === undefined) {
            value = (formObject as any)[q.id];
          }
          if (q.type === 'LINE_ITEM_GROUP' && value && typeof value !== 'string') {
            try {
              value = JSON.stringify(value);
            } catch {
              value = '';
            }
          } else if (Array.isArray(value)) {
            value = value.join(', ');
          }
          if (q.type === 'DATE') {
            value = this.normalizeDateOnlyCell(value);
          }
          candidateValues[q.id] = value ?? '';
          setIf(colIdx, value ?? '');
        });

        const destinationRowNumber = existingRowNumber >= 2 ? existingRowNumber : nextAppendRowNumber;
        const hasMeaningfulChanges =
          existingRowNumber < 2
            ? true
            : this.hasMeaningfulRowChanges(existingRowValues || [], valuesArray, columns);
        if (existingRowNumber >= 2 && !hasMeaningfulChanges && this.shouldNoopIfUnchanged(formObject)) {
          metaById[recordId] = {
            id: recordId,
            createdAt: this.readRecordMetadataIso(existingRowValues, columns.createdAt),
            updatedAt:
              this.readRecordMetadataIso(existingRowValues, columns.updatedAt) ||
              this.readRecordMetadataIso(existingRowValues, columns.createdAt),
            dataVersion: previousVersion || undefined,
            rowNumber: destinationRowNumber,
            operation: 'noop',
            noop: true,
            noopReason: 'unchanged'
          };
          return;
        }

        if (existingRowNumber >= 2) {
          changedRowsByNumber.set(destinationRowNumber, valuesArray);
        } else {
          appendRows.push(valuesArray);
          nextAppendRowNumber += 1;
        }

        const meta: RecordMetadata = {
          id: recordId,
          createdAt: createdAtVal instanceof Date ? createdAtVal.toISOString() : this.asIso(createdAtVal),
          updatedAt: updatedAtVal instanceof Date ? updatedAtVal.toISOString() : this.asIso(updatedAtVal),
          dataVersion: nextVersion,
          rowNumber: destinationRowNumber,
          operation: existingRowNumber >= 2 ? 'update' : 'create'
        };
        if (Object.keys(autoIncrementValues).length) {
          meta.autoIncrementValues = autoIncrementValues;
        }
        metaById[recordId] = meta;
        changedRecords.push({ recordId, rowValues: valuesArray });

        const dedupSignatures: Record<string, string> = {};
        effectiveDedupRules.forEach(rule => {
          const sig = computeDedupSignature(rule, candidateValues);
          if (!sig) return;
          dedupSignatures[(rule.id || '').toString()] = sig;
        });
        indexRowsByNumber.set(
          destinationRowNumber,
          this.buildRecordIndexRowValues({
            columns: idx.columns,
            rowNumber: destinationRowNumber,
            recordId,
            dataVersion: nextVersion,
            updatedAtIso: meta.updatedAt ? meta.updatedAt.toString() : '',
            createdAtIso: meta.createdAt ? meta.createdAt.toString() : '',
            dedupSignatures
          })
        );
      });

      if (changedRowsByNumber.size) {
        this.writeRowsByNumber(sheet, headers.length, changedRowsByNumber);
      }
      if (appendRows.length) {
        const appendStartRow = nextAppendRowNumber - appendRows.length;
        sheet.getRange(appendStartRow, 1, appendRows.length, headers.length).setValues(appendRows);
      }
      if (indexRowsByNumber.size) {
        this.writeRowsByNumber(idx.sheet, idx.columns.headerWidth, indexRowsByNumber);
      }

      if (changedRecords.length) {
        const newEtag = this.cacheManager.bumpSheetEtag(sheet, columns, 'saveTrustedSubmissionBatch');
        changedRecords.forEach(entry => {
          const cachedRecord = this.buildSubmissionRecord(form.configSheet, questions, columns, entry.rowValues, entry.recordId);
          if (cachedRecord) {
            this.cacheManager.cacheRecord(form.configSheet, newEtag, cachedRecord);
          }
        });
      }

      return {
        success: true,
        message: changedRecords.length ? 'Saved to sheet' : 'No changes to save.',
        metaById
      };
    } catch (err: any) {
      return {
        success: false,
        message: (err?.message || DOCUMENT_LOCK_BUSY_MESSAGE).toString(),
        metaById: {}
      };
    }
  }

  private deleteRecordById(
    destinationSheet: GoogleAppsScript.Spreadsheet.Sheet,
    destinationColumns: HeaderColumns,
    destinationName: string,
    dedupRules: DedupRule[],
    recordId: string
  ): { deleted: boolean; rowNumber?: number } {
    const targetId = (recordId || '').toString().trim();
    if (!targetId) return { deleted: false };

    let rowNumber = -1;
    let indexSheet: GoogleAppsScript.Spreadsheet.Sheet | null = null;
    try {
      const idx = ensureRecordIndexSheet(this.ss, destinationName, dedupRules);
      indexSheet = idx.sheet;
      const indexedRow = findRowNumberInRecordIndex(idx.sheet, targetId);
      if (indexedRow >= 2) {
        rowNumber = indexedRow;
      }
    } catch (_) {
      // ignore
    }

    if (rowNumber < 2) {
      const found = this.findRowIndexById(destinationSheet, destinationColumns, targetId);
      rowNumber = found >= 2 ? found : -1;
    }
    if (rowNumber < 2) return { deleted: false };

    try {
      destinationSheet.deleteRow(rowNumber);
    } catch (_) {
      return { deleted: false };
    }

    try {
      if (indexSheet) indexSheet.deleteRow(rowNumber);
    } catch (_) {
      // ignore
    }

    return { deleted: true, rowNumber };
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

      const effectiveDedupRules = (dedupRules || []).filter(
        r => r && (r.onConflict || 'reject') === 'reject' && (r.scope || 'form') === 'form'
      );
      if (!effectiveDedupRules.length) return { success: true };

      const destinationName = (form.destinationTab || `${form.title} Responses`).toString();
      const sheet = this.ss.getSheetByName(destinationName);
      // No destination sheet yet => nothing to dedup against.
      if (!sheet) return { success: true };

      const incomingId = ((formObject as any).id && (formObject as any).id.trim)
        ? ((formObject as any).id as any).trim()
        : (formObject as any).id;
      const recordId = incomingId ? incomingId.toString() : '';

      // Build candidate values for dedup keys only (best-effort) without mutating the sheet (no uploads / no auto-increment).
      const candidateValues: Record<string, any> = {};
      const dedupKeyIds = Array.from(
        new Set(
          effectiveDedupRules
            .flatMap(r => (Array.isArray(r.keys) ? r.keys : []))
            .map(k => (k || '').toString().trim())
            .filter(Boolean)
        )
      );
      dedupKeyIds.forEach(keyId => {
        let value: any = (formObject as any)[keyId];
        if ((value === undefined || value === null) && (formObject as any)?.values && typeof (formObject as any).values === 'object') {
          value = ((formObject as any).values || {})[keyId];
        }
        // Match `saveSubmissionWithId` behavior: arrays are stored as comma-separated strings.
        if (Array.isArray(value)) value = value.join(', ');
        // Best-effort: normalize date-like values so signatures match index semantics.
        value = this.normalizeDateOnlyCell(value);
        candidateValues[keyId] = value ?? '';
      });

      // Indexed lookup via record index sheet (preferred).
      try {
        const idx = ensureRecordIndexSheet(this.ss, destinationName, effectiveDedupRules);
        const lastRow = idx.sheet.getLastRow();
        const dataRows = Math.max(0, lastRow - 1);
        if (dataRows <= 0) return { success: true };

        // Safety: if the index appears incomplete, use the slower sheet scan instead of
        // showing an operator-only rebuild message to frontline users.
        const destLastRow = sheet.getLastRow();
        if (destLastRow >= 2) {
          let indexAppearsIncomplete = false;
          try {
            // Find the Record ID column without walking all questions/headers.
            const recordIdCol = (() => {
              try {
                const lastCol = Math.max(sheet.getLastColumn(), 1);
                const rawHeaderRow = sheet.getRange(1, 1, 1, lastCol).getValues()[0] || [];
                for (let i = 0; i < rawHeaderRow.length; i += 1) {
                  const raw = rawHeaderRow[i] ? rawHeaderRow[i].toString().trim() : '';
                  const header = sanitizeHeaderCellText(raw);
                  const norm = normalizeHeaderToken(header);
                  if (norm === 'record id' || norm === 'id') return i + 1;
                }
              } catch (_) {
                // ignore
              }
              return 1;
            })();
            const destTopId = (sheet.getRange(2, recordIdCol || 1, 1, 1).getValues()[0][0] || '').toString().trim();
            const idxTopId = (idx.sheet.getRange(2, idx.columns.recordId, 1, 1).getValues()[0][0] || '').toString().trim();
            const destLastId = (sheet.getRange(destLastRow, recordIdCol || 1, 1, 1).getValues()[0][0] || '').toString().trim();
            const idxLastId = (idx.sheet.getRange(destLastRow, idx.columns.recordId, 1, 1).getValues()[0][0] || '').toString().trim();
            indexAppearsIncomplete = Boolean(((destTopId && !idxTopId) || (destLastId && !idxLastId)) && destLastRow > 2);
          } catch (_) {
            // ignore
          }
          if (indexAppearsIncomplete) throw new Error('Record index appears incomplete; falling back to sheet scan.');
        }

        for (const rule of effectiveDedupRules) {
          const sig = computeDedupSignature(rule, candidateValues);
          if (!sig) continue;
          const ruleId = (rule.id || '').toString().trim().replace(/\s+/g, '_');
          const col = (idx.columns.dedupByRuleId as any)[ruleId] as number | undefined;
          if (!col) continue;

          let matchRow = -1;
          try {
            const range = idx.sheet.getRange(2, col, dataRows, 1);
            const finder = (range as any).createTextFinder ? (range as any).createTextFinder(sig) : null;
            if (finder && typeof finder.matchEntireCell === 'function') {
              const match = finder.matchEntireCell(true).findNext();
              if (match && typeof match.getRow === 'function') {
                matchRow = match.getRow();
              }
            }
          } catch (_) {
            matchRow = -1;
          }
          if (matchRow < 2) continue;

          let existingId = '';
          try {
            existingId = (idx.sheet.getRange(matchRow, idx.columns.recordId, 1, 1).getValues()[0][0] || '').toString();
          } catch (_) {
            existingId = '';
          }
          if (recordId && existingId && existingId === recordId) {
            // Self-match (editing an existing record).
            continue;
          }

          const conflict = findDedupConflict(
            [rule],
            { id: recordId, values: candidateValues },
            [{ id: existingId, rowNumber: matchRow, values: candidateValues }],
            language
          );
          if (conflict) {
            // Ensure rowNumber is surfaced even if the helper couldn't infer it.
            return {
              success: true,
              conflict: {
                ...conflict,
                existingRecordId: conflict.existingRecordId || existingId || undefined,
                existingRowNumber: conflict.existingRowNumber || matchRow
              }
            };
          }
        }

        return { success: true };
      } catch (_) {
        // Fall back to legacy scan-based approach (small sheets / tests).
        const { sheet: fullSheet, headers, columns } = this.ensureDestination(destinationName, questions);
        const existingRows = Math.max(0, fullSheet.getLastRow() - 1);
        if (existingRows <= 0) return { success: true };

        const data = fullSheet.getRange(2, 1, existingRows, headers.length).getValues();
        const existing: ExistingRecord[] = data.map((row, idx) => {
          const vals: Record<string, any> = {};
          Object.entries(columns.fields).forEach(([fid, colIdx]) => {
            vals[fid] = row[(colIdx as number) - 1];
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
      }
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

    const metaHeaders = ['Record ID', 'Data Version', 'Created At', 'Updated At', 'Status', 'PDF URL'];
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
      dataVersion: this.findHeader(headers, ['data version', 'data_version', 'dataversion']),
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
      // Ensure DATE fields are returned as canonical YYYY-MM-DD strings so the client never sees timezone-shifted Dates.
      if (q.type === 'DATE') {
        const iso = normalizeToIsoDate(value);
        value = iso || '';
      }
      values[q.id] = value ?? '';
    });
    const languageIdx = columns.language ? columns.language - 1 : 1;
    const languageRaw = (rowValues[languageIdx] || 'EN').toString().toUpperCase();
    const language = (['EN', 'FR', 'NL'].includes(languageRaw) ? languageRaw : 'EN') as 'EN' | 'FR' | 'NL';
    const statusValue = columns.status ? rowValues[columns.status - 1] : '';
    const pdfLinkValue = columns.pdfUrl ? rowValues[columns.pdfUrl - 1] : '';
    const dataVersionRaw = columns.dataVersion ? rowValues[columns.dataVersion - 1] : undefined;
    const dataVersion = (() => {
      const n = Number(dataVersionRaw);
      return Number.isFinite(n) && n > 0 ? n : undefined;
    })();
    return {
      formKey,
      language,
      values,
      id: recordId,
      createdAt: columns.createdAt ? this.asIso(rowValues[columns.createdAt - 1]) : undefined,
      updatedAt: columns.updatedAt ? this.asIso(rowValues[columns.updatedAt - 1]) : undefined,
      dataVersion,
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

  /**
   * Fetch the current server-owned dataVersion for a record (cheap), plus the rowNumber when resolvable.
   *
   * This is used by the web client to validate cached records (read-after-write consistency) without
   * downloading the entire record payload.
   */
  getRecordVersion(
    form: FormConfig,
    recordId: string,
    rowNumberHint?: number
  ): { success: boolean; id?: string; rowNumber?: number; dataVersion?: number; updatedAt?: string; message?: string } {
    const id = (recordId || '').toString().trim();
    if (!id) return { success: false, message: 'Record ID is required.' };

    try {
      const destinationName = (form.destinationTab || `${form.title} Responses`).toString();

      // Prefer record index sheet (fast, constant-time updates).
      // Index sheet rows align with destination row numbers, so rowNumberHint can be used directly.
      const idxSheetName = getRecordIndexSheetName(destinationName);
      const idxSheet = this.ss.getSheetByName(idxSheetName);
      if (idxSheet) {
        const readIdxRow = (row: number): { idAtRow: string; dv?: number; updatedAt?: string } | null => {
          if (!Number.isFinite(row) || row < 2) return null;
          try {
            // Base columns are stable:
            // 1 Record ID, 2 Row, 3 Data Version, 4 Updated At (ISO)
            const vals = idxSheet.getRange(row, 1, 1, 4).getValues()[0] || [];
            const idAtRow = (vals[0] || '').toString().trim();
            const dvRaw = vals[2];
            const dvNum = Number(dvRaw);
            const dv = Number.isFinite(dvNum) && dvNum > 0 ? dvNum : undefined;
            const updatedAt = (vals[3] || '').toString() || undefined;
            return { idAtRow, dv, updatedAt };
          } catch (_) {
            return null;
          }
        };

        const hintedRow = Number(rowNumberHint);
        if (Number.isFinite(hintedRow) && hintedRow >= 2) {
          const rowInfo = readIdxRow(hintedRow);
          if (rowInfo && rowInfo.idAtRow && rowInfo.idAtRow === id) {
            return { success: true, id, rowNumber: hintedRow, dataVersion: rowInfo.dv, updatedAt: rowInfo.updatedAt };
          }
        }

        const rowNumber = findRowNumberInRecordIndex(idxSheet, id);
        if (rowNumber >= 2) {
          const rowInfo = readIdxRow(rowNumber);
          if (rowInfo) {
            return { success: true, id, rowNumber, dataVersion: rowInfo.dv, updatedAt: rowInfo.updatedAt };
          }
          // Shouldn't happen, but keep legacy helpers as a fallback.
          const dv = readDataVersionFromRecordIndex(idxSheet, rowNumber, { recordId: 1, rowNumber: 2, dataVersion: 3, updatedAtIso: 4, createdAtIso: 5, dedupByRuleId: {}, headerWidth: 5 } as any) || undefined;
          return { success: true, id, rowNumber, dataVersion: dv || undefined };
        }
      }

      // Fallback: read destination sheet directly (slower).
      const sheet = this.ss.getSheetByName(destinationName);
      if (!sheet) return { success: true, id, dataVersion: undefined, rowNumber: undefined };

      const lastColumn = Math.max(sheet.getLastColumn(), 1);
      const rawHeaderRow = sheet.getRange(1, 1, 1, lastColumn).getValues()[0] || [];
      let recordIdCol = 0;
      let dataVersionCol = 0;
      let updatedAtCol = 0;
      for (let i = 0; i < rawHeaderRow.length; i += 1) {
        const raw = rawHeaderRow[i] ? rawHeaderRow[i].toString().trim() : '';
        const header = sanitizeHeaderCellText(raw);
        const norm = normalizeHeaderToken(header);
        if (!recordIdCol && norm === 'record id') recordIdCol = i + 1;
        else if (!dataVersionCol && norm === 'data version') dataVersionCol = i + 1;
        else if (!updatedAtCol && norm === 'updated at') updatedAtCol = i + 1;
      }
      if (!recordIdCol) return { success: true, id, dataVersion: undefined, rowNumber: undefined };

      const hintedRow = Number(rowNumberHint);
      if (Number.isFinite(hintedRow) && hintedRow >= 2) {
        try {
          const idAtRow = (sheet.getRange(hintedRow, recordIdCol, 1, 1).getValues()[0][0] || '').toString().trim();
          if (idAtRow && idAtRow === id) {
            const dvRaw = dataVersionCol ? sheet.getRange(hintedRow, dataVersionCol, 1, 1).getValues()[0][0] : undefined;
            const dvNum = Number(dvRaw);
            const dataVersion = Number.isFinite(dvNum) && dvNum > 0 ? dvNum : undefined;
            const updatedAt = updatedAtCol ? this.asIso(sheet.getRange(hintedRow, updatedAtCol, 1, 1).getValues()[0][0]) : undefined;
            return { success: true, id, rowNumber: hintedRow, dataVersion, updatedAt };
          }
        } catch (_) {
          // ignore hint mismatch
        }
      }

      try {
        const lastRow = sheet.getLastRow();
        const dataRows = Math.max(0, lastRow - 1);
        if (dataRows > 0) {
          const range = sheet.getRange(2, recordIdCol, dataRows, 1);
          const finder = (range as any).createTextFinder ? (range as any).createTextFinder(id) : null;
          if (finder && typeof finder.matchEntireCell === 'function') {
            const match = finder.matchEntireCell(true).findNext();
            if (match && typeof match.getRow === 'function') {
              const rowNumber = match.getRow();
              const dvRaw = dataVersionCol ? sheet.getRange(rowNumber, dataVersionCol, 1, 1).getValues()[0][0] : undefined;
              const dvNum = Number(dvRaw);
              const dataVersion = Number.isFinite(dvNum) && dvNum > 0 ? dvNum : undefined;
              const updatedAt = updatedAtCol ? this.asIso(sheet.getRange(rowNumber, updatedAtCol, 1, 1).getValues()[0][0]) : undefined;
              return { success: true, id, rowNumber, dataVersion, updatedAt };
            }
          }
        }
      } catch (_) {
        // ignore
      }

      return { success: true, id, dataVersion: undefined, rowNumber: undefined };
    } catch (err: any) {
      const msg = (err?.message || err?.toString?.() || 'Failed to read record version.').toString();
      return { success: false, message: msg };
    }
  }

  /**
   * Phase 0/1: keep "Data Version" + record indexes consistent when users manually edit the destination sheet.
   *
   * This is intended to be called from an installable `onEdit` trigger.
   * Script-driven writes (from this web app) do not fire onEdit, so this mainly covers direct sheet edits.
   */
  handleManualDestinationEdits(args: {
    form: FormConfig;
    questions: QuestionConfig[];
    dedupRules: DedupRule[];
    startRow: number;
    numRows: number;
  }): void {
    const { form, questions, dedupRules, startRow, numRows } = args;
    const fromRow = Math.max(2, Math.round(Number(startRow) || 0));
    const count = Math.max(0, Math.round(Number(numRows) || 0));
    if (count <= 0) return;

    const { sheet, columns } = this.ensureDestination(form.destinationTab || `${form.title} Responses`, questions);
    const lastRow = sheet.getLastRow();
    const toRow = Math.min(lastRow, fromRow + count - 1);
    if (toRow < 2 || fromRow > toRow) return;
    const rows = toRow - fromRow + 1;

    if (!columns.recordId || !columns.dataVersion) {
      // Without these columns we can't maintain the version/index guarantees.
      return;
    }

    const destinationName = sheet.getName ? sheet.getName() : (form.destinationTab || `${form.title} Responses`);
    const effectiveDedupRules = (dedupRules || []).filter(r => r && (r.onConflict || 'reject') === 'reject' && (r.scope || 'form') === 'form');
    const idx = ensureRecordIndexSheet(this.ss, destinationName, effectiveDedupRules);

    // Read current Record IDs and versions in bulk.
    const recordIds = sheet.getRange(fromRow, columns.recordId, rows, 1).getValues().map(r => (r[0] || '').toString());
    const versionsRaw = sheet.getRange(fromRow, columns.dataVersion, rows, 1).getValues().map(r => r[0]);
    const createdAtRaw = columns.createdAt ? sheet.getRange(fromRow, columns.createdAt, rows, 1).getValues().map(r => r[0]) : new Array(rows).fill(undefined);
    const now = new Date();

    const nextVersions: any[][] = [];
    const nextIds: any[][] = [];
    const updatedAtUpdates: any[][] = [];

    for (let i = 0; i < rows; i += 1) {
      let id = (recordIds[i] || '').toString().trim();
      if (!id) {
        id = this.generateUuid();
      }
      const prev = Number(versionsRaw[i]);
      const next = Number.isFinite(prev) && prev > 0 ? prev + 1 : 1;
      nextIds.push([id]);
      nextVersions.push([next]);
      updatedAtUpdates.push([now]);
    }

    // Write back any missing ids + bumped versions + updatedAt.
    sheet.getRange(fromRow, columns.recordId, rows, 1).setValues(nextIds);
    sheet.getRange(fromRow, columns.dataVersion, rows, 1).setValues(nextVersions);
    if (columns.updatedAt) {
      sheet.getRange(fromRow, columns.updatedAt, rows, 1).setValues(updatedAtUpdates);
    }

    // Build dedup key column reads (union of keys across rules).
    const keyIds = Array.from(
      new Set(
        effectiveDedupRules
          .flatMap(r => (Array.isArray(r.keys) ? r.keys : []))
          .map(k => (k || '').toString().trim())
          .filter(Boolean)
      )
    );
    const keyColMap: Record<string, number> = {};
    keyIds.forEach(k => {
      const colIdx = columns.fields[k];
      if (colIdx) keyColMap[k] = colIdx;
    });
    const keyValuesById: Record<string, any[]> = {};
    Object.entries(keyColMap).forEach(([keyId, colIdx]) => {
      keyValuesById[keyId] = sheet.getRange(fromRow, colIdx, rows, 1).getValues().map(r => r[0]);
    });

    // Build index rows and write in one batch.
    const width = idx.columns.headerWidth;
    const indexMatrix: any[][] = new Array(rows).fill(null).map(() => new Array(width).fill(''));
    for (let i = 0; i < rows; i += 1) {
      const rowNumber = fromRow + i;
      const recordId = (nextIds[i][0] || '').toString();
      const dataVersion = Number(nextVersions[i][0]) || 1;
      const createdIso = this.asIso(createdAtRaw[i]) || '';
      const updatedIso = now.toISOString();

      const dedupSignatures: Record<string, string> = {};
      if (effectiveDedupRules.length) {
        const valuesForKeys: Record<string, any> = {};
        Object.keys(keyColMap).forEach(k => {
          valuesForKeys[k] = keyValuesById[k] ? keyValuesById[k][i] : '';
        });
        effectiveDedupRules.forEach(rule => {
          const sig = computeDedupSignature(rule, valuesForKeys);
          if (!sig) return;
          dedupSignatures[(rule.id || '').toString()] = sig;
        });
      }

      const rowValues = indexMatrix[i];
      rowValues[idx.columns.recordId - 1] = recordId;
      rowValues[idx.columns.rowNumber - 1] = rowNumber;
      rowValues[idx.columns.dataVersion - 1] = dataVersion;
      rowValues[idx.columns.updatedAtIso - 1] = updatedIso;
      rowValues[idx.columns.createdAtIso - 1] = createdIso;
      Object.entries(dedupSignatures).forEach(([ruleIdRaw, sig]) => {
        const ruleId = (ruleIdRaw || '').toString().trim().replace(/\s+/g, '_');
        const col = (idx.columns.dedupByRuleId as any)[ruleId] as number | undefined;
        if (!col) return;
        rowValues[col - 1] = sig;
      });
    }
    idx.sheet.getRange(fromRow, 1, rows, width).setValues(indexMatrix);

    // Invalidate server caches for this destination sheet.
    this.cacheManager.bumpSheetEtag(sheet, columns, 'manualEdit.bumpDataVersion');
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

  bumpDirectMutationDataVersion(args: {
    sheet: GoogleAppsScript.Spreadsheet.Sheet;
    columns: HeaderColumns;
    rowIndex: number;
    recordId?: string;
    reason: string;
  }): { dataVersion?: number; rowNumber?: number; updatedAt?: string } {
    const rowIndex = Number(args.rowIndex);
    if (!Number.isFinite(rowIndex) || rowIndex < 2) {
      this.cacheManager.bumpSheetEtag(args.sheet, args.columns, args.reason || 'directMutation.invalidRow');
      return {};
    }

    const readCell = (col?: number): any => {
      if (!col) return undefined;
      try {
        return args.sheet.getRange(rowIndex, col, 1, 1).getValues()[0][0];
      } catch {
        return undefined;
      }
    };

    let nextDataVersion: number | undefined;
    if (args.columns.dataVersion) {
      const raw = readCell(args.columns.dataVersion);
      const currentDataVersion = Number(raw);
      nextDataVersion =
        Number.isFinite(currentDataVersion) && currentDataVersion > 0 ? currentDataVersion + 1 : 1;
      try {
        args.sheet.getRange(rowIndex, args.columns.dataVersion, 1, 1).setValue(nextDataVersion);
      } catch {
        nextDataVersion = undefined;
      }
    }

    const updatedAt = args.columns.updatedAt ? this.asIso(readCell(args.columns.updatedAt)) : undefined;
    const createdAt = args.columns.createdAt ? this.asIso(readCell(args.columns.createdAt)) : undefined;
    const recordId =
      (args.recordId || '').toString().trim() ||
      (args.columns.recordId ? (readCell(args.columns.recordId) || '').toString().trim() : '');

    if (recordId && nextDataVersion !== undefined) {
      try {
        const indexSheet = this.ss.getSheetByName(getRecordIndexSheetName(args.sheet.getName()));
        if (indexSheet) {
          indexSheet.getRange(rowIndex, 1, 1, 5).setValues([
            [recordId, rowIndex, nextDataVersion, updatedAt || '', createdAt || '']
          ]);
        }
      } catch {
        // ignore record-index refresh failures; the destination row is still authoritative
      }
    }

    this.cacheManager.bumpSheetEtag(args.sheet, args.columns, args.reason || 'directMutation.bumpDataVersion');

    return {
      dataVersion: nextDataVersion,
      rowNumber: rowIndex,
      updatedAt
    };
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

  private writeRowAtomicDelta(
    sheet: GoogleAppsScript.Spreadsheet.Sheet,
    rowNumber: number,
    previousRowValues: any[],
    nextRowValues: any[]
  ): void {
    const width = Math.max(nextRowValues.length, previousRowValues.length);
    if (width <= 0) return;
    const prev = this.normalizeRowValues(previousRowValues, width);
    const next = this.normalizeRowValues(nextRowValues, width);
    const changed: number[] = [];
    for (let i = 0; i < width; i += 1) {
      if (!this.cellValuesEqual(prev[i], next[i])) changed.push(i);
    }
    if (!changed.length) return;
    const start = changed[0];
    const end = changed[changed.length - 1];
    const patch = prev.slice(start, end + 1);
    changed.forEach(idx => {
      patch[idx - start] = next[idx];
    });
    sheet.getRange(rowNumber, start + 1, 1, patch.length).setValues([patch]);
  }

  private readRowsByNumber(
    sheet: GoogleAppsScript.Spreadsheet.Sheet,
    width: number,
    rowNumbers: number[]
  ): Map<number, any[]> {
    const rows = new Map<number, any[]>();
    const targets = Array.from(new Set((rowNumbers || []).filter(row => Number.isFinite(row) && row >= 2))).sort((a, b) => a - b);
    if (!targets.length || width <= 0) return rows;
    let start = targets[0];
    let prev = targets[0];
    const flush = () => {
      const count = prev - start + 1;
      const values = sheet.getRange(start, 1, count, width).getValues();
      values.forEach((row, idx) => {
        rows.set(start + idx, this.normalizeRowValues(row || [], width));
      });
    };
    for (let i = 1; i < targets.length; i += 1) {
      const rowNumber = targets[i];
      if (rowNumber === prev + 1) {
        prev = rowNumber;
        continue;
      }
      flush();
      start = rowNumber;
      prev = rowNumber;
    }
    flush();
    return rows;
  }

  private writeRowsByNumber(
    sheet: GoogleAppsScript.Spreadsheet.Sheet,
    width: number,
    rowsByNumber: Map<number, any[]>
  ): void {
    const rowNumbers = Array.from(rowsByNumber.keys()).filter(row => Number.isFinite(row) && row >= 2).sort((a, b) => a - b);
    if (!rowNumbers.length || width <= 0) return;
    let start = rowNumbers[0];
    let prev = rowNumbers[0];
    let chunk: any[][] = [this.normalizeRowValues(rowsByNumber.get(start) || [], width)];
    const flush = () => {
      sheet.getRange(start, 1, chunk.length, width).setValues(chunk);
    };
    for (let i = 1; i < rowNumbers.length; i += 1) {
      const rowNumber = rowNumbers[i];
      if (rowNumber === prev + 1) {
        chunk.push(this.normalizeRowValues(rowsByNumber.get(rowNumber) || [], width));
        prev = rowNumber;
        continue;
      }
      flush();
      start = rowNumber;
      prev = rowNumber;
      chunk = [this.normalizeRowValues(rowsByNumber.get(rowNumber) || [], width)];
    }
    flush();
  }

  private hasMeaningfulRowChanges(previousRowValues: any[], nextRowValues: any[], columns: HeaderColumns): boolean {
    const width = Math.max(previousRowValues.length, nextRowValues.length);
    if (width <= 0) return false;
    const ignoredColumnIndexes = new Set<number>();
    [columns.timestamp, columns.updatedAt, columns.dataVersion].forEach(idx => {
      if (idx && idx > 0) ignoredColumnIndexes.add(idx - 1);
    });
    const prev = this.normalizeRowValues(previousRowValues, width);
    const next = this.normalizeRowValues(nextRowValues, width);
    for (let i = 0; i < width; i += 1) {
      if (ignoredColumnIndexes.has(i)) continue;
      if (!this.cellValuesEqual(prev[i], next[i])) return true;
    }
    return false;
  }

  private readRecordMetadataIso(rowValues: any[] | undefined, columnIndex?: number): string | undefined {
    if (!rowValues || !columnIndex || columnIndex <= 0) return undefined;
    try {
      return this.asIso(rowValues[columnIndex - 1]);
    } catch {
      return undefined;
    }
  }

  private buildRecordIndexRowValues(args: {
    columns: ReturnType<typeof ensureRecordIndexSheet>['columns'];
    rowNumber: number;
    recordId: string;
    dataVersion: number;
    updatedAtIso?: string;
    createdAtIso?: string;
    dedupSignatures?: Record<string, string>;
  }): any[] {
    const rowValues = new Array(args.columns.headerWidth).fill('');
    rowValues[args.columns.recordId - 1] = (args.recordId || '').toString();
    rowValues[args.columns.rowNumber - 1] = args.rowNumber;
    rowValues[args.columns.dataVersion - 1] = Number.isFinite(Number(args.dataVersion)) ? Number(args.dataVersion) : '';
    rowValues[args.columns.updatedAtIso - 1] = (args.updatedAtIso || '').toString();
    rowValues[args.columns.createdAtIso - 1] = (args.createdAtIso || '').toString();
    Object.entries(args.dedupSignatures || {}).forEach(([ruleIdRaw, sig]) => {
      const ruleId = (ruleIdRaw || '').toString().trim().replace(/\s+/g, '_');
      const col = args.columns.dedupByRuleId[ruleId];
      if (!col) return;
      rowValues[col - 1] = (sig || '').toString();
    });
    return rowValues;
  }

  private writeAuditRows(args: {
    form: FormConfig;
    questions: QuestionConfig[];
    columns: HeaderColumns;
    destinationName: string;
    recordId: string;
    beforeRowValues?: any[];
    afterRowValues: any[];
    changedAt: Date;
    deviceInfo?: any;
    auditAction?: any;
  }): void {
    const { form, questions, columns, destinationName, recordId, beforeRowValues, afterRowValues, changedAt, deviceInfo, auditAction } = args;
    const cfg = this.resolveAuditLoggingConfig(form.auditLogging);
    if (!cfg) return;

    const shouldWriteChangeRows = this.shouldWriteChangeAuditRows(cfg, form, columns, beforeRowValues, afterRowValues);
    const auditRows: any[][] = [];
    const normalizedDeviceInfo = this.normalizeDeviceInfo(deviceInfo);

    if (shouldWriteChangeRows) {
      const changes = this.collectAuditChanges(questions, columns, beforeRowValues, afterRowValues);
      changes.forEach(change => {
        auditRows.push([
          changedAt,
          recordId,
          'change',
          change.fieldPath,
          this.serializeAuditValue(change.beforeValue),
          this.serializeAuditValue(change.afterValue),
          '',
          normalizedDeviceInfo
        ]);
      });
    }

    const actionId = auditAction === undefined || auditAction === null ? '' : auditAction.toString().trim();
    const snapshotButtonSet = new Set((cfg.snapshotButtons || []).map(v => v.toLowerCase()));
    if (actionId && snapshotButtonSet.has(actionId.toLowerCase())) {
      const snapshotRecord = this.buildSubmissionRecord(
        form.configSheet,
        questions,
        columns,
        this.normalizeRowValues(afterRowValues, Math.max(afterRowValues.length, 1)),
        recordId
      );
      const snapshotValue = snapshotRecord ? this.serializeAuditValue(snapshotRecord) : this.serializeAuditValue({ id: recordId });
      auditRows.push([
        changedAt,
        recordId,
        'snapshot',
        '',
        '',
        '',
        snapshotValue,
        normalizedDeviceInfo
      ]);
    }

    if (!auditRows.length) return;
    const auditSheet = this.ensureAuditSheet(destinationName, cfg.sheetName);
    const startRow = Math.max(2, auditSheet.getLastRow() + 1);
    const width = auditRows[0]?.length || 0;
    if (!width) return;
    auditSheet.getRange(startRow, 1, auditRows.length, width).setValues(auditRows);
  }

  private resolveAuditLoggingConfig(value?: AuditLoggingConfig): AuditLoggingConfig | undefined {
    if (!value) return undefined;
    if (value.enabled === false) return undefined;
    const out: AuditLoggingConfig = {};
    if (value.enabled !== undefined) out.enabled = Boolean(value.enabled);
    if (value.sheetName && value.sheetName.toString().trim()) out.sheetName = value.sheetName.toString().trim();
    if (Array.isArray(value.statuses) && value.statuses.length) {
      const statuses = Array.from(
        new Set(
          value.statuses
            .map(status => (status === undefined || status === null ? '' : status.toString().trim()))
            .filter(Boolean)
        )
      );
      if (statuses.length) out.statuses = statuses;
    }
    if (Array.isArray(value.snapshotButtons) && value.snapshotButtons.length) {
      const snapshotButtons = Array.from(
        new Set(
          value.snapshotButtons
            .map(buttonId => (buttonId === undefined || buttonId === null ? '' : buttonId.toString().trim()))
            .filter(Boolean)
        )
      );
      if (snapshotButtons.length) out.snapshotButtons = snapshotButtons;
    }
    return Object.keys(out).length ? out : { enabled: true };
  }

  private shouldWriteChangeAuditRows(
    cfg: AuditLoggingConfig,
    form: FormConfig,
    columns: HeaderColumns,
    beforeRowValues?: any[],
    afterRowValues?: any[]
  ): boolean {
    const statuses = (cfg.statuses || [])
      .map(status => (status === undefined || status === null ? '' : status.toString().trim().toLowerCase()))
      .filter(Boolean);
    if (!statuses.length) return true;
    const allowed = new Set(statuses);
    const before = this.readStatusValue(form, columns, beforeRowValues).toLowerCase();
    const after = this.readStatusValue(form, columns, afterRowValues).toLowerCase();
    if (before && allowed.has(before)) return true;
    if (after && allowed.has(after)) return true;
    return false;
  }

  private readStatusValue(form: FormConfig, columns: HeaderColumns, rowValues?: any[]): string {
    if (!rowValues || !rowValues.length) return '';
    const statusFieldId = form.followupConfig?.statusFieldId;
    const statusFieldIdx =
      statusFieldId && columns.fields[statusFieldId] ? (columns.fields[statusFieldId] as number) : undefined;
    const fieldValue = statusFieldIdx ? rowValues[statusFieldIdx - 1] : undefined;
    const metaValue = columns.status ? rowValues[columns.status - 1] : undefined;
    const resolved = fieldValue !== undefined && fieldValue !== null && fieldValue !== '' ? fieldValue : metaValue;
    return resolved === undefined || resolved === null ? '' : resolved.toString().trim();
  }

  private collectAuditChanges(
    questions: QuestionConfig[],
    columns: HeaderColumns,
    beforeRowValues?: any[],
    afterRowValues?: any[]
  ): Array<{ fieldPath: string; beforeValue: any; afterValue: any }> {
    const before = beforeRowValues ? this.normalizeRowValues(beforeRowValues, Math.max(beforeRowValues.length, afterRowValues?.length || 0)) : [];
    const after = afterRowValues ? this.normalizeRowValues(afterRowValues, Math.max(afterRowValues.length, before.length)) : [];
    const changes: Array<{ fieldPath: string; beforeValue: any; afterValue: any }> = [];

    const activeQuestions = (questions || []).filter(q => q && q.type !== 'BUTTON');
    activeQuestions.forEach(question => {
      const colIdx = columns.fields[question.id];
      if (!colIdx) return;
      const previous = before[colIdx - 1];
      const next = after[colIdx - 1];
      if (question.type === 'LINE_ITEM_GROUP') {
        const previousParsed = this.parseAuditJson(previous);
        const nextParsed = this.parseAuditJson(next);
        if (
          (previousParsed.parsed || nextParsed.parsed) &&
          !this.auditValuesEqual(previousParsed.value, nextParsed.value)
        ) {
          this.collectDeepAuditDiffs(question.id, previousParsed.value, nextParsed.value, changes);
          return;
        }
      }
      if (!this.cellValuesEqual(previous, next)) {
        changes.push({ fieldPath: question.id, beforeValue: previous, afterValue: next });
      }
    });

    return changes;
  }

  private collectDeepAuditDiffs(
    path: string,
    beforeValue: any,
    afterValue: any,
    out: Array<{ fieldPath: string; beforeValue: any; afterValue: any }>
  ): void {
    if (this.auditValuesEqual(beforeValue, afterValue)) return;

    const beforeIsArray = Array.isArray(beforeValue);
    const afterIsArray = Array.isArray(afterValue);
    if (beforeIsArray || afterIsArray) {
      const beforeArray = beforeIsArray ? (beforeValue as any[]) : [];
      const afterArray = afterIsArray ? (afterValue as any[]) : [];
      const max = Math.max(beforeArray.length, afterArray.length);
      for (let i = 0; i < max; i += 1) {
        this.collectDeepAuditDiffs(`${path}[${i}]`, beforeArray[i], afterArray[i], out);
      }
      return;
    }

    const beforeObj = this.isPlainAuditObject(beforeValue) ? (beforeValue as Record<string, any>) : null;
    const afterObj = this.isPlainAuditObject(afterValue) ? (afterValue as Record<string, any>) : null;
    if (beforeObj || afterObj) {
      const keys = Array.from(
        new Set([
          ...Object.keys(beforeObj || {}),
          ...Object.keys(afterObj || {})
        ])
      ).filter(key => key && !key.startsWith('__ck'));
      keys.forEach(key => {
        const nextPath = path ? `${path}.${key}` : key;
        this.collectDeepAuditDiffs(nextPath, beforeObj ? beforeObj[key] : undefined, afterObj ? afterObj[key] : undefined, out);
      });
      return;
    }

    out.push({ fieldPath: path, beforeValue, afterValue });
  }

  private ensureAuditSheet(destinationName: string, configuredName?: string): GoogleAppsScript.Spreadsheet.Sheet {
    const sheetName = (configuredName || `${destinationName} Audit`).toString().trim() || `${destinationName} Audit`;
    let sheet = this.ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = this.ss.insertSheet(sheetName);
    }
    const headers = ['date_time', 'recordId', 'auditType', 'fieldPath', 'beforeValue', 'afterValue', 'snapshot', 'deviceInfo'];
    const existing = this.normalizeRowValues(sheet.getRange(1, 1, 1, headers.length).getValues()[0] || [], headers.length).map(v =>
      v === undefined || v === null ? '' : v.toString()
    );
    const needsHeader = headers.some((header, idx) => existing[idx] !== header);
    if (needsHeader) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    }
    return sheet;
  }

  private normalizeDeviceInfo(raw: any): string {
    if (raw === undefined || raw === null || raw === '') return '';
    if (typeof raw === 'string') return raw.toString().trim();
    return this.serializeAuditValue(raw);
  }

  private parseAuditJson(value: any): { parsed: boolean; value: any } {
    if (typeof value !== 'string') return { parsed: false, value };
    const text = value.toString().trim();
    if (!text) return { parsed: false, value };
    if (!(text.startsWith('[') || text.startsWith('{'))) return { parsed: false, value };
    try {
      return { parsed: true, value: JSON.parse(text) };
    } catch (_) {
      return { parsed: false, value };
    }
  }

  private serializeAuditValue(value: any): string {
    if (value === undefined || value === null) return '';
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return value.toString();
    const normalized = this.normalizeAuditValue(value);
    try {
      return JSON.stringify(normalized);
    } catch (_) {
      try {
        return value.toString();
      } catch (_) {
        return '';
      }
    }
  }

  private normalizeAuditValue(value: any): any {
    if (value === undefined || value === null) return value;
    if (value instanceof Date) return value.toISOString();
    if (Array.isArray(value)) return value.map(entry => this.normalizeAuditValue(entry));
    if (this.isPlainAuditObject(value)) {
      const out: Record<string, any> = {};
      Object.keys(value)
        .filter(key => key && !key.startsWith('__ck'))
        .sort()
        .forEach(key => {
          out[key] = this.normalizeAuditValue((value as any)[key]);
        });
      return out;
    }
    return value;
  }

  private auditValuesEqual(a: any, b: any): boolean {
    const left = this.serializeAuditValue(this.normalizeAuditValue(a));
    const right = this.serializeAuditValue(this.normalizeAuditValue(b));
    return left === right;
  }

  private isPlainAuditObject(value: any): boolean {
    if (!value || typeof value !== 'object') return false;
    if (Array.isArray(value)) return false;
    if (value instanceof Date) return false;
    return true;
  }

  private normalizeRowValues(rowValues: any[], width: number): any[] {
    const normalized = Array.isArray(rowValues) ? [...rowValues] : [];
    if (normalized.length < width) {
      return normalized.concat(new Array(width - normalized.length).fill(''));
    }
    if (normalized.length > width) {
      return normalized.slice(0, width);
    }
    return normalized;
  }

  private cellValuesEqual(a: any, b: any): boolean {
    if (a === b) return true;
    if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
    if (a instanceof Date || b instanceof Date) {
      const aIso = this.asIso(a);
      const bIso = this.asIso(b);
      return aIso === bIso;
    }
    return this.serializeAuditValue(a) === this.serializeAuditValue(b);
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
    // Prefer TextFinder (fast, avoids getValues for 100k rows).
    try {
      const range = sheet.getRange(2, columns.recordId, dataRows, 1);
      const finder = (range as any).createTextFinder ? (range as any).createTextFinder(recordId) : null;
      if (finder && typeof finder.matchEntireCell === 'function') {
        const match = finder.matchEntireCell(true).findNext();
        if (match && typeof match.getRow === 'function') {
          return match.getRow();
        }
      }
    } catch (_) {
      // fall back below
    }
    // Fallback (tests): scan values
    const idRange = sheet.getRange(2, columns.recordId, dataRows, 1).getValues();
    const matchIndex = idRange.findIndex(r => (r[0] || '').toString() === recordId);
    return matchIndex < 0 ? -1 : (2 + matchIndex);
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
    config?: AutoIncrementConfig,
    formObject?: Record<string, any>
  ): string | undefined {
    const resolvedPrefix = this.resolveAutoIncrementPrefix(config, formObject);
    const key = this.getAutoIncrementPropertyKey(formKey, fieldId, config?.propertyKey, resolvedPrefix.propertyKeySuffix);
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
    const rawPadLength = config?.padLength;
    const padLength =
      rawPadLength === undefined || rawPadLength === null
        ? 6
        : Math.max(0, Math.min(20, Number.isFinite(Number(rawPadLength)) ? Number(rawPadLength) : 6));
    const prefix = resolvedPrefix.prefix;
    const formatted = `${prefix}${padLength > 0 ? next.toString().padStart(padLength, '0') : next.toString()}`;
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

  private resolveAutoIncrementPrefix(
    config?: AutoIncrementConfig,
    formObject?: Record<string, any>
  ): { prefix: string; propertyKeySuffix?: string } {
    const fallbackPrefix = config?.prefix || '';
    const prefixByValue = config?.prefixByValue;
    if (!prefixByValue?.fieldId || !prefixByValue.map || !formObject) {
      return { prefix: fallbackPrefix };
    }

    const rawValue =
      (formObject as any)[prefixByValue.fieldId] ??
      ((formObject as any).values && (formObject as any).values[prefixByValue.fieldId]);
    const normalizedValue = rawValue === undefined || rawValue === null ? '' : rawValue.toString().trim();
    const mappedPrefix =
      (normalizedValue && Object.prototype.hasOwnProperty.call(prefixByValue.map, normalizedValue)
        ? prefixByValue.map[normalizedValue]
        : undefined) ?? prefixByValue.defaultPrefix;

    if (!mappedPrefix) {
      return { prefix: fallbackPrefix };
    }

    return {
      prefix: mappedPrefix,
      propertyKeySuffix: mappedPrefix
    };
  }

  private getAutoIncrementPropertyKey(formKey: string, fieldId: string, override?: string, suffix?: string): string {
    const baseRaw = (override && override.trim()) || `${formKey || ''}::${fieldId}`;
    const base = suffix ? `${baseRaw}::${suffix}` : baseRaw;
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
