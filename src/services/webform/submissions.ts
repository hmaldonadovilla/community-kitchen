import {
  AutoIncrementConfig,
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

    const lock = (() => {
      try {
        return (typeof LockService !== 'undefined' && (LockService as any).getDocumentLock)
          ? (LockService as any).getDocumentLock()
          : null;
      } catch (_) {
        return null;
      }
    })();
    try {
      try {
        if (lock && typeof lock.tryLock === 'function') {
          // Best-effort: keep short to avoid blocking the UI too long.
          lock.tryLock(8000);
        }
      } catch (_) {
        // ignore lock failures
      }

      const { sheet, headers, columns } = this.ensureDestination(form.destinationTab || `${form.title} Responses`, questions);

    const now = new Date();
    const incomingId = ((formObject as any).id && (formObject as any).id.trim)
      ? ((formObject as any).id as any).trim()
      : (formObject as any).id;
    const recordId = incomingId || this.generateUuid();

    // Find existing row by id
    let existingRowIdx = -1;
    const destinationName = sheet.getName ? sheet.getName() : (form.destinationTab || `${form.title} Responses`);
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

    // DataVersion: monotonic server-owned integer
    const previousVersion = (() => {
      if (existingRowIdx < 0) return 0;
      if (!columns.dataVersion) return 0;
      try {
        const raw = sheet.getRange(2 + existingRowIdx, columns.dataVersion, 1, 1).getValues()[0][0];
        const n = Number(raw);
        return Number.isFinite(n) && n > 0 ? n : 0;
      } catch (_) {
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
          if (!columns.updatedAt) return undefined;
          try {
            const raw = sheet.getRange(2 + existingRowIdx, columns.updatedAt, 1, 1).getValues()[0][0];
            return this.asIso(raw);
          } catch (_) {
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

    // Dedup check (indexed): search dedup signatures in the record index sheet.
    const effectiveDedupRules = (dedupRules || []).filter(r => r && (r.onConflict || 'reject') === 'reject' && (r.scope || 'form') === 'form');
    if (effectiveDedupRules.length) {
      try {
        const idx = ensureRecordIndexSheet(this.ss, destinationName, effectiveDedupRules);
        const lastRow = idx.sheet.getLastRow();
        const dataRows = Math.max(0, lastRow - 1);

        // Safety: if the index has not been rebuilt for an existing dataset, signature lookups can miss duplicates.
        // In that case, block writes and instruct the operator to run the rebuild menu action.
        const destLastRow = sheet.getLastRow();
        if (destLastRow >= 2) {
          try {
            const destTopId = (sheet.getRange(2, columns.recordId || 1, 1, 1).getValues()[0][0] || '').toString().trim();
            const idxTopId = (idx.sheet.getRange(2, idx.columns.recordId, 1, 1).getValues()[0][0] || '').toString().trim();
            const destLastId = (sheet.getRange(destLastRow, columns.recordId || 1, 1, 1).getValues()[0][0] || '').toString().trim();
            const idxLastId = (idx.sheet.getRange(destLastRow, idx.columns.recordId, 1, 1).getValues()[0][0] || '').toString().trim();
            const looksUnbuilt = (destTopId && !idxTopId) || (destLastId && !idxLastId);
            if (looksUnbuilt && destLastRow > 2) {
              return {
                success: false,
                message:
                  'Dedup index is not built for this form yet. Run "Community Kitchen → Rebuild Indexes (Data Version + Dedup)" and try again.',
                meta: { id: recordId, createdAt: createdAtVal, updatedAt: undefined }
              };
            }
          } catch (_) {
            // ignore; proceed
          }
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
      } catch (_) {
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

    const destinationRowNumber = existingRowIdx >= 0 ? (2 + existingRowIdx) : (sheet.getLastRow() + 1);
    if (existingRowIdx >= 0) {
      sheet.getRange(destinationRowNumber, 1, 1, headers.length).setValues([valuesArray]);
    } else {
      sheet.appendRow(valuesArray);
    }

    const meta: RecordMetadata = {
      id: recordId,
      createdAt: createdAtVal instanceof Date ? createdAtVal.toISOString() : createdAtVal,
      updatedAt: updatedAtVal instanceof Date ? updatedAtVal.toISOString() : updatedAtVal,
      dataVersion: nextVersion,
      rowNumber: destinationRowNumber
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
    } catch (_) {
      // ignore
    }

    return { success: true, message: 'Saved to sheet', meta };
    } finally {
      try {
        if (lock && typeof lock.releaseLock === 'function') {
          lock.releaseLock();
        }
      } catch (_) {
        // ignore
      }
    }
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

        // Safety: block indexed dedup checks when indexes have not been rebuilt for an existing dataset.
        const destLastRow = sheet.getLastRow();
        if (destLastRow >= 2) {
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
            const looksUnbuilt = (destTopId && !idxTopId) || (destLastId && !idxLastId);
            if (looksUnbuilt && destLastRow > 2) {
              return {
                success: false,
                message:
                  'Dedup index is not built for this form yet. Run "Community Kitchen → Rebuild Indexes (Data Version + Dedup)" and try again.'
              };
            }
          } catch (_) {
            // ignore
          }
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
