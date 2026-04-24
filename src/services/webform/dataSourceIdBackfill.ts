import {
  DataSourceConfig,
  FormConfig,
  LineItemFieldConfig,
  LineItemGroupConfig,
  PaginatedResult,
  QuestionConfig,
  SelectionEffect
} from '../../types';
import { CacheEtagManager } from './cache';
import { debugLog } from './debug';
import { ensureRecordIndexSheet } from './recordIndex';
import { SubmissionService } from './submissions';
import { HeaderColumns } from './types';

const DEFAULT_MAX_ROWS = 50;
const DEFAULT_SOURCE_MAX_ROWS = 10000;
const DEFAULT_AUDIT_SHEET = 'Data Source ID Backfill Log';
const DATA_SOURCE_ID_FIELD_RE = /_SOURCE_ID$/i;
const DATA_SOURCE_UPDATED_AT_FIELD_RE = /_SOURCE_UPDATED_AT$/i;

export interface DataSourceIdBackfillOptions {
  dryRun?: boolean;
  startRow?: number;
  maxRows?: number;
  sourceMaxRows?: number;
  sampleLimit?: number;
  logSheetName?: string;
  writeAuditLog?: boolean;
  honorStatusAllowList?: boolean;
}

export interface DataSourceIdBackfillLogEntry {
  timestamp: string;
  formKey: string;
  dryRun: boolean;
  rowNumber: number;
  recordId?: string;
  path: string;
  fieldId?: string;
  legacyValue?: string;
  matchedSourceId?: string;
  matchedSourceUpdatedAt?: string;
  status: string;
  message?: string;
}

export interface DataSourceIdBackfillResult {
  success: boolean;
  formKey: string;
  dryRun: boolean;
  startRow: number;
  endRow: number;
  nextStartRow?: number;
  done: boolean;
  scannedRows: number;
  changedRows: number;
  fieldUpdates: number;
  alreadyFilled: number;
  skippedNoLegacyValue: number;
  skippedNoMatch: number;
  skippedAmbiguous: number;
  skippedInvalidJson: number;
  skippedMissingSource: number;
  auditRows: number;
  logSheetName?: string;
  samples: DataSourceIdBackfillLogEntry[];
  message: string;
}

type FormContext = { form: FormConfig; questions: QuestionConfig[] };

type SourceLookupBucket = {
  rows: Record<string, any>[];
};

type SourceIndex = {
  byField: Record<string, Map<string, SourceLookupBucket>>;
};

type BackfillSpec = {
  rootGroupId?: string;
  groupPath: string[];
  fieldId: string;
  dataSource: DataSourceConfig;
  lookupSourceFieldId?: string;
  lookupFields: string[];
  targetMapping: Record<string, string>;
};

type ApplySpecResult =
  | { status: 'alreadyFilled' }
  | { status: 'noLegacyValue'; entry: DataSourceIdBackfillLogEntry }
  | { status: 'noMatch'; entry: DataSourceIdBackfillLogEntry }
  | { status: 'ambiguous'; entry: DataSourceIdBackfillLogEntry }
  | { status: 'missingSource'; entry: DataSourceIdBackfillLogEntry }
  | { status: 'updated'; updatedFields: number; entries: DataSourceIdBackfillLogEntry[] };

type ConstructorArgs = {
  ss: GoogleAppsScript.Spreadsheet.Spreadsheet;
  submissions: SubmissionService;
  cacheManager: CacheEtagManager;
  resolveFormContext: (formKey?: string) => FormContext;
  fetchDataSource: (
    source: any,
    locale?: string,
    projection?: string[],
    limit?: number,
    pageToken?: string
  ) => PaginatedResult<any>;
};

/**
 * Backfills missing datasource identity fields inside stored submissions without
 * replaying normal form save side effects.
 */
export class DataSourceIdBackfillService {
  private readonly ss: GoogleAppsScript.Spreadsheet.Spreadsheet;
  private readonly submissions: SubmissionService;
  private readonly cacheManager: CacheEtagManager;
  private readonly resolveFormContext: (formKey?: string) => FormContext;
  private readonly fetchDataSource: ConstructorArgs['fetchDataSource'];
  private readonly sourceIndexes = new Map<string, SourceIndex | null>();

  constructor(args: ConstructorArgs) {
    this.ss = args.ss;
    this.submissions = args.submissions;
    this.cacheManager = args.cacheManager;
    this.resolveFormContext = args.resolveFormContext;
    this.fetchDataSource = args.fetchDataSource;
  }

  run(formKey: string, options?: DataSourceIdBackfillOptions): DataSourceIdBackfillResult {
    const dryRun = options?.dryRun !== false;
    const startRow = this.normalizeStartRow(options?.startRow);
    const maxRows = this.normalizePositiveInt(options?.maxRows, DEFAULT_MAX_ROWS, 500);
    const sampleLimit = this.normalizePositiveInt(options?.sampleLimit, 25, 200);
    const sourceMaxRows = this.normalizePositiveInt(options?.sourceMaxRows, DEFAULT_SOURCE_MAX_ROWS, 50000);
    const logSheetName = (options?.logSheetName || DEFAULT_AUDIT_SHEET).toString().trim() || DEFAULT_AUDIT_SHEET;
    const writeAuditLog = options?.writeAuditLog === true || (!dryRun && options?.writeAuditLog !== false);
    const context = this.resolveFormContext(formKey);
    const canonicalFormKey = (context.form.configSheet || context.form.title || formKey || '').toString();
    const specs = this.collectBackfillSpecs(context.questions);
    const destinationName = context.form.destinationTab || `${context.form.title} Responses`;
    const { sheet, headers, columns } = this.submissions.ensureDestination(destinationName, context.questions);
    const lastRow = Math.max(1, sheet.getLastRow());
    const emptyResult = this.buildBaseResult({
      formKey: canonicalFormKey,
      dryRun,
      startRow,
      endRow: Math.min(lastRow, Math.max(startRow, startRow + maxRows - 1)),
      logSheetName,
      writeAuditLog
    });

    if (!specs.length) {
      return {
        ...emptyResult,
        done: true,
        message: 'No datasource source-id mappings were found for this form.'
      };
    }
    if (startRow > lastRow) {
      return {
        ...emptyResult,
        endRow: lastRow,
        done: true,
        message: 'No rows to scan.'
      };
    }

    const endRow = Math.min(lastRow, startRow + maxRows - 1);
    const rowCount = Math.max(0, endRow - startRow + 1);
    const rows = rowCount > 0 ? sheet.getRange(startRow, 1, rowCount, headers.length).getValues() : [];
    const auditEntries: DataSourceIdBackfillLogEntry[] = [];
    const samples: DataSourceIdBackfillLogEntry[] = [];
    const changedRowNumbers = new Set<number>();
    const now = new Date();
    const updatedAtIso = now.toISOString();
    const stats = {
      scannedRows: rows.length,
      changedRows: 0,
      fieldUpdates: 0,
      alreadyFilled: 0,
      skippedNoLegacyValue: 0,
      skippedNoMatch: 0,
      skippedAmbiguous: 0,
      skippedInvalidJson: 0,
      skippedMissingSource: 0
    };

    rows.forEach((rowValues, offset) => {
      const rowNumber = startRow + offset;
      const recordId = columns.recordId ? this.stringifyCell(rowValues[columns.recordId - 1]).trim() : '';
      const rowChanged = this.backfillRow({
        rowValues,
        rowNumber,
        recordId,
        specs,
        columns,
        context,
        dryRun,
        sourceMaxRows,
        honorStatusAllowList: options?.honorStatusAllowList === true,
        updatedAt: now,
        updatedAtIso,
        stats,
        auditEntries,
        samples,
        sampleLimit,
        formKey: canonicalFormKey
      });
      if (rowChanged) {
        changedRowNumbers.add(rowNumber);
      }
    });

    if (!dryRun && changedRowNumbers.size) {
      this.writeChangedRows({
        sheet,
        rows,
        startRow,
        changedRowNumbers
      });
      this.cacheManager.bumpSheetEtag(sheet, columns, 'backfillDataSourceIds');
      this.bumpRecordIndexBaseRows({
        destinationName,
        rows,
        startRow,
        changedRowNumbers,
        columns
      });
    }

    const auditRows = writeAuditLog ? this.appendAuditEntries(logSheetName, auditEntries) : 0;
    const nextStartRow = endRow < lastRow ? endRow + 1 : undefined;
    const result: DataSourceIdBackfillResult = {
      success: true,
      formKey: canonicalFormKey,
      dryRun,
      startRow,
      endRow,
      nextStartRow,
      done: !nextStartRow,
      scannedRows: stats.scannedRows,
      changedRows: changedRowNumbers.size,
      fieldUpdates: stats.fieldUpdates,
      alreadyFilled: stats.alreadyFilled,
      skippedNoLegacyValue: stats.skippedNoLegacyValue,
      skippedNoMatch: stats.skippedNoMatch,
      skippedAmbiguous: stats.skippedAmbiguous,
      skippedInvalidJson: stats.skippedInvalidJson,
      skippedMissingSource: stats.skippedMissingSource,
      auditRows,
      logSheetName: writeAuditLog ? logSheetName : undefined,
      samples,
      message: this.buildSummaryMessage({
        dryRun,
        changedRows: changedRowNumbers.size,
        fieldUpdates: stats.fieldUpdates,
        nextStartRow
      })
    };

    debugLog('datasourceIdBackfill.completed', {
      formKey: canonicalFormKey,
      dryRun,
      startRow,
      endRow,
      changedRows: result.changedRows,
      fieldUpdates: result.fieldUpdates,
      skippedNoMatch: result.skippedNoMatch,
      skippedAmbiguous: result.skippedAmbiguous,
      nextStartRow: nextStartRow || null
    });
    return result;
  }

  private backfillRow(args: {
    rowValues: any[];
    rowNumber: number;
    recordId: string;
    specs: BackfillSpec[];
    columns: HeaderColumns;
    context: FormContext;
    dryRun: boolean;
    sourceMaxRows: number;
    honorStatusAllowList: boolean;
    updatedAt: Date;
    updatedAtIso: string;
    stats: {
      fieldUpdates: number;
      alreadyFilled: number;
      skippedNoLegacyValue: number;
      skippedNoMatch: number;
      skippedAmbiguous: number;
      skippedInvalidJson: number;
      skippedMissingSource: number;
    };
    auditEntries: DataSourceIdBackfillLogEntry[];
    samples: DataSourceIdBackfillLogEntry[];
    sampleLimit: number;
    formKey: string;
  }): boolean {
    let rowChanged = false;
    const specsByRoot = new Map<string, BackfillSpec[]>();
    const topLevelSpecs: BackfillSpec[] = [];
    args.specs.forEach(spec => {
      if (spec.rootGroupId) {
        const existing = specsByRoot.get(spec.rootGroupId) || [];
        existing.push(spec);
        specsByRoot.set(spec.rootGroupId, existing);
        return;
      }
      topLevelSpecs.push(spec);
    });

    if (topLevelSpecs.length) {
      const values = this.buildTopLevelValues(args.context.questions, args.columns, args.rowValues);
      topLevelSpecs.forEach(spec => {
        const result = this.applySpec({
          row: values,
          spec,
          rowNumber: args.rowNumber,
          recordId: args.recordId,
          path: spec.fieldId,
          dryRun: args.dryRun,
          sourceMaxRows: args.sourceMaxRows,
          honorStatusAllowList: args.honorStatusAllowList,
          formKey: args.formKey
        });
        rowChanged = this.applySpecResult(result, args.stats, args.auditEntries, args.samples, args.sampleLimit) || rowChanged;
      });
      if (rowChanged) {
        this.writeTopLevelValues(args.context.questions, args.columns, args.rowValues, values);
      }
    }

    specsByRoot.forEach((rootSpecs, rootGroupId) => {
      const colIdx = args.columns.fields[rootGroupId];
      if (!colIdx) return;
      const raw = args.rowValues[colIdx - 1];
      const parsed = this.parseLineItemJson(raw);
      if (!parsed.ok) {
        args.stats.skippedInvalidJson += 1;
        const entry = this.buildLogEntry({
          formKey: args.formKey,
          dryRun: args.dryRun,
          rowNumber: args.rowNumber,
          recordId: args.recordId,
          path: rootGroupId,
          status: 'skipped_invalid_json',
          message: 'Line-item JSON could not be parsed.'
        });
        this.captureLog(entry, args.auditEntries, args.samples, args.sampleLimit);
        return;
      }
      const rootRows = parsed.rows;
      const changed = this.backfillLineItemRows({
        rows: rootRows,
        specs: rootSpecs,
        groupPath: [rootGroupId],
        rowNumber: args.rowNumber,
        recordId: args.recordId,
        dryRun: args.dryRun,
        sourceMaxRows: args.sourceMaxRows,
        honorStatusAllowList: args.honorStatusAllowList,
        stats: args.stats,
        auditEntries: args.auditEntries,
        samples: args.samples,
        sampleLimit: args.sampleLimit,
        formKey: args.formKey,
        basePath: rootGroupId
      });
      if (!changed) return;
      rowChanged = true;
      args.rowValues[colIdx - 1] = JSON.stringify(rootRows);
    });

    if (rowChanged && !args.dryRun) {
      this.touchRowMetadata(args.rowValues, args.columns, args.updatedAt, args.updatedAtIso);
    }
    return rowChanged;
  }

  private backfillLineItemRows(args: {
    rows: any[];
    specs: BackfillSpec[];
    groupPath: string[];
    rowNumber: number;
    recordId: string;
    dryRun: boolean;
    sourceMaxRows: number;
    honorStatusAllowList: boolean;
    stats: {
      fieldUpdates: number;
      alreadyFilled: number;
      skippedNoLegacyValue: number;
      skippedNoMatch: number;
      skippedAmbiguous: number;
      skippedMissingSource: number;
    };
    auditEntries: DataSourceIdBackfillLogEntry[];
    samples: DataSourceIdBackfillLogEntry[];
    sampleLimit: number;
    formKey: string;
    basePath: string;
  }): boolean {
    let changed = false;
    if (!Array.isArray(args.rows)) return false;
    args.rows.forEach((row, rowIndex) => {
      if (!row || typeof row !== 'object') return;
      const rowPath = `${args.basePath}[${rowIndex + 1}]`;
      args.specs
        .filter(spec => this.pathsEqual(spec.groupPath, args.groupPath))
        .forEach(spec => {
          const result = this.applySpec({
            row,
            spec,
            rowNumber: args.rowNumber,
            recordId: args.recordId,
            path: `${rowPath}.${spec.fieldId}`,
            dryRun: args.dryRun,
            sourceMaxRows: args.sourceMaxRows,
            honorStatusAllowList: args.honorStatusAllowList,
            formKey: args.formKey
          });
          changed = this.applySpecResult(result, args.stats, args.auditEntries, args.samples, args.sampleLimit) || changed;
        });

      const childGroupIds = Array.from(
        new Set(
          args.specs
            .filter(spec => spec.groupPath.length > args.groupPath.length && this.pathStartsWith(spec.groupPath, args.groupPath))
            .map(spec => spec.groupPath[args.groupPath.length])
            .filter(Boolean)
        )
      );
      childGroupIds.forEach(childGroupId => {
        const childRows = Array.isArray(row[childGroupId]) ? row[childGroupId] : [];
        const childChanged = this.backfillLineItemRows({
          ...args,
          rows: childRows,
          groupPath: [...args.groupPath, childGroupId],
          basePath: `${rowPath}.${childGroupId}`
        });
        changed = childChanged || changed;
      });
    });
    return changed;
  }

  private applySpec(args: {
    row: Record<string, any>;
    spec: BackfillSpec;
    rowNumber: number;
    recordId: string;
    path: string;
    dryRun: boolean;
    sourceMaxRows: number;
    honorStatusAllowList: boolean;
    formKey: string;
  }): ApplySpecResult {
    const missingTargets = Object.keys(args.spec.targetMapping).filter(fieldId => this.isBlank(args.row[fieldId]));
    if (!missingTargets.length) {
      return { status: 'alreadyFilled' };
    }

    const sourceIndex = this.getSourceIndex(args.spec, args.sourceMaxRows, args.honorStatusAllowList);
    if (!sourceIndex) {
      return {
        status: 'missingSource',
        entry: this.buildLogEntry({
          formKey: args.formKey,
          dryRun: args.dryRun,
          rowNumber: args.rowNumber,
          recordId: args.recordId,
          path: args.path,
          status: 'skipped_missing_source',
          message: `Datasource "${args.spec.dataSource.id}" could not be read.`
        })
      };
    }

    const candidates = this.resolveLookupCandidates(args.row, args.spec);
    if (!candidates.length) {
      return {
        status: 'noLegacyValue',
        entry: this.buildLogEntry({
          formKey: args.formKey,
          dryRun: args.dryRun,
          rowNumber: args.rowNumber,
          recordId: args.recordId,
          path: args.path,
          status: 'skipped_no_legacy_value',
          message: 'No source id or legacy display value was present.'
        })
      };
    }

    const match = this.findUniqueSourceMatch(sourceIndex, args.spec.lookupFields, candidates);
    if (match.status === 'ambiguous') {
      return {
        status: 'ambiguous',
        entry: this.buildLogEntry({
          formKey: args.formKey,
          dryRun: args.dryRun,
          rowNumber: args.rowNumber,
          recordId: args.recordId,
          path: args.path,
          legacyValue: match.legacyValue,
          status: 'skipped_ambiguous',
          message: `Multiple datasource rows matched "${match.legacyValue}".`
        })
      };
    }
    if (match.status === 'none') {
      return {
        status: 'noMatch',
        entry: this.buildLogEntry({
          formKey: args.formKey,
          dryRun: args.dryRun,
          rowNumber: args.rowNumber,
          recordId: args.recordId,
          path: args.path,
          legacyValue: candidates[0],
          status: 'skipped_no_match',
          message: `No datasource row matched "${candidates[0]}".`
        })
      };
    }

    const sourceRow = match.row;
    const sourceId = this.stringifyCell(sourceRow.id).trim();
    const sourceUpdatedAt = this.stringifyCell(sourceRow.updatedAt).trim();
    const entries: DataSourceIdBackfillLogEntry[] = [];
    let updatedFields = 0;
    missingTargets.forEach(targetFieldId => {
      const sourceFieldId = args.spec.targetMapping[targetFieldId];
      const sourceValue = this.resolveSourceFieldValue(sourceRow, sourceFieldId);
      if (this.isBlank(sourceValue)) return;
      updatedFields += 1;
      if (!args.dryRun) {
        args.row[targetFieldId] = sourceValue;
      }
      entries.push(
        this.buildLogEntry({
          formKey: args.formKey,
          dryRun: args.dryRun,
          rowNumber: args.rowNumber,
          recordId: args.recordId,
          path: args.path,
          fieldId: targetFieldId,
          legacyValue: match.legacyValue,
          matchedSourceId: sourceId,
          matchedSourceUpdatedAt: sourceUpdatedAt,
          status: args.dryRun ? 'would_update' : 'updated',
          message: `${targetFieldId} matched from datasource field ${sourceFieldId}.`
        })
      );
    });

    if (!updatedFields) {
      return {
        status: 'noMatch',
        entry: this.buildLogEntry({
          formKey: args.formKey,
          dryRun: args.dryRun,
          rowNumber: args.rowNumber,
          recordId: args.recordId,
          path: args.path,
          legacyValue: match.legacyValue,
          matchedSourceId: sourceId,
          matchedSourceUpdatedAt: sourceUpdatedAt,
          status: 'skipped_no_source_value',
          message: 'The matched datasource row did not contain the missing source-id values.'
        })
      };
    }

    return { status: 'updated', updatedFields, entries };
  }

  private applySpecResult(
    result: ApplySpecResult,
    stats: {
      fieldUpdates: number;
      alreadyFilled: number;
      skippedNoLegacyValue: number;
      skippedNoMatch: number;
      skippedAmbiguous: number;
      skippedMissingSource: number;
    },
    auditEntries: DataSourceIdBackfillLogEntry[],
    samples: DataSourceIdBackfillLogEntry[],
    sampleLimit: number
  ): boolean {
    if (result.status === 'alreadyFilled') {
      stats.alreadyFilled += 1;
      return false;
    }
    if (result.status === 'noLegacyValue') {
      stats.skippedNoLegacyValue += 1;
      this.captureLog(result.entry, auditEntries, samples, sampleLimit);
      return false;
    }
    if (result.status === 'noMatch') {
      stats.skippedNoMatch += 1;
      this.captureLog(result.entry, auditEntries, samples, sampleLimit);
      return false;
    }
    if (result.status === 'ambiguous') {
      stats.skippedAmbiguous += 1;
      this.captureLog(result.entry, auditEntries, samples, sampleLimit);
      return false;
    }
    if (result.status === 'missingSource') {
      stats.skippedMissingSource += 1;
      this.captureLog(result.entry, auditEntries, samples, sampleLimit);
      return false;
    }
    stats.fieldUpdates += result.updatedFields;
    result.entries.forEach(entry => this.captureLog(entry, auditEntries, samples, sampleLimit));
    return true;
  }

  private collectBackfillSpecs(questions: QuestionConfig[]): BackfillSpec[] {
    const specs: BackfillSpec[] = [];
    const addSpecsForField = (
      fieldId: string,
      fieldDataSource: DataSourceConfig | undefined,
      effects: SelectionEffect[] | undefined,
      rootGroupId: string | undefined,
      groupPath: string[]
    ) => {
      (effects || []).forEach(effect => {
        const source = effect.dataSource || fieldDataSource;
        if (!source?.id) return;
        const rawMapping =
          effect.type === 'setValuesFromDataSource'
            ? effect.fieldMapping
            : effect.type === 'addLineItemsFromDataSource'
              ? effect.parentFieldMapping
              : undefined;
        if (!rawMapping || !Object.keys(rawMapping).length) return;
        const targetMapping = this.filterSourceIdMapping(rawMapping, effect.lookupSourceFieldId);
        if (!Object.keys(targetMapping).length) return;
        const lookupFields = this.resolveLookupFields(effect);
        if (!lookupFields.length) return;
        specs.push({
          rootGroupId,
          groupPath,
          fieldId,
          dataSource: source,
          lookupSourceFieldId: effect.lookupSourceFieldId,
          lookupFields,
          targetMapping
        });
      });
    };

    (questions || []).forEach(question => {
      addSpecsForField(question.id, question.dataSource, question.selectionEffects, undefined, []);
      if (question.type !== 'LINE_ITEM_GROUP' || !question.lineItemConfig) return;
      const rootGroupId = question.id;
      this.walkLineItemGroup(question.lineItemConfig, [rootGroupId], field => {
        addSpecsForField(field.id, field.dataSource, field.selectionEffects, rootGroupId, field.groupPath);
      });
    });
    const seen = new Set<string>();
    return specs.filter(spec => {
      const key = JSON.stringify({
        rootGroupId: spec.rootGroupId || '',
        groupPath: spec.groupPath,
        fieldId: spec.fieldId,
        source: spec.dataSource,
        targets: spec.targetMapping
      });
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private walkLineItemGroup(
    group: LineItemGroupConfig,
    groupPath: string[],
    visit: (field: LineItemFieldConfig & { groupPath: string[] }) => void
  ): void {
    (group.fields || []).forEach(field => {
      if (!field?.id) return;
      visit({ ...field, groupPath });
    });
    (group.subGroups || []).forEach(subGroup => {
      const id = (subGroup?.id || '').toString().trim();
      if (!id) return;
      this.walkLineItemGroup(subGroup, [...groupPath, id], visit);
    });
  }

  private filterSourceIdMapping(mapping: Record<string, string>, lookupSourceFieldId?: string): Record<string, string> {
    const out: Record<string, string> = {};
    Object.entries(mapping || {}).forEach(([targetFieldIdRaw, sourceFieldIdRaw]) => {
      const targetFieldId = (targetFieldIdRaw || '').toString().trim();
      const sourceFieldId = (sourceFieldIdRaw || '').toString().trim();
      if (!targetFieldId || !sourceFieldId) return;
      const isIdentityTarget =
        (lookupSourceFieldId && targetFieldId === lookupSourceFieldId) ||
        DATA_SOURCE_ID_FIELD_RE.test(targetFieldId) ||
        DATA_SOURCE_UPDATED_AT_FIELD_RE.test(targetFieldId);
      const isIdentitySource = sourceFieldId === 'id' || sourceFieldId === 'updatedAt';
      if (!isIdentityTarget && !isIdentitySource) return;
      out[targetFieldId] = sourceFieldId;
    });
    return out;
  }

  private resolveLookupFields(effect: SelectionEffect): string[] {
    const fields = Array.isArray(effect.lookupFields) && effect.lookupFields.length
      ? effect.lookupFields
      : [effect.lookupField || 'id'];
    return Array.from(
      new Set(
        fields
          .map(field => (field || '').toString().trim())
          .filter(Boolean)
      )
    );
  }

  private getSourceIndex(spec: BackfillSpec, sourceMaxRows: number, honorStatusAllowList: boolean): SourceIndex | null {
    const projection = this.buildSourceProjection(spec);
    const key = JSON.stringify({
      dataSource: spec.dataSource,
      projection,
      sourceMaxRows,
      honorStatusAllowList
    });
    if (this.sourceIndexes.has(key)) {
      return this.sourceIndexes.get(key) || null;
    }
    const rows = this.loadSourceRows(spec.dataSource, projection, sourceMaxRows, honorStatusAllowList);
    if (!rows.length) {
      this.sourceIndexes.set(key, null);
      return null;
    }
    const lookupFields = Array.from(new Set([...spec.lookupFields, ...projection])).filter(Boolean);
    const byField: Record<string, Map<string, SourceLookupBucket>> = {};
    lookupFields.forEach(field => {
      byField[field] = new Map<string, SourceLookupBucket>();
    });
    rows.forEach(row => {
      lookupFields.forEach(field => {
        const raw = this.resolveSourceFieldValue(row, field);
        const normalized = this.normalizeLookupValue(raw);
        if (!normalized) return;
        const fieldMap = byField[field];
        if (!fieldMap) return;
        const bucket = fieldMap.get(normalized) || { rows: [] };
        bucket.rows.push(row);
        fieldMap.set(normalized, bucket);
      });
    });
    const index: SourceIndex = { byField };
    this.sourceIndexes.set(key, index);
    return index;
  }

  private buildSourceProjection(spec: BackfillSpec): string[] {
    const projection = new Set<string>();
    spec.lookupFields.forEach(field => {
      if (field) projection.add(field);
    });
    Object.values(spec.targetMapping || {}).forEach(field => {
      if (field) projection.add(field);
    });
    if (spec.dataSource.statusFieldId) projection.add(spec.dataSource.statusFieldId);
    (spec.dataSource.projection || []).forEach(field => {
      if (field) projection.add(field);
    });
    projection.add('id');
    projection.add('updatedAt');
    projection.add('status');
    return Array.from(projection);
  }

  private loadSourceRows(
    dataSource: DataSourceConfig,
    projection: string[],
    sourceMaxRows: number,
    honorStatusAllowList: boolean
  ): Record<string, any>[] {
    if (dataSource.formKey) {
      return this.loadFormBackedSourceRows(dataSource, projection, sourceMaxRows, honorStatusAllowList);
    }
    const rows: Record<string, any>[] = [];
    let pageToken: string | undefined;
    const sourceConfig = {
      ...dataSource,
      projection,
      statusAllowList: honorStatusAllowList ? dataSource.statusAllowList : undefined
    };
    do {
      const response = this.fetchDataSource(sourceConfig, 'EN', projection, 500, pageToken);
      const items = Array.isArray(response.items) ? response.items : [];
      items.forEach(item => {
        if (item && typeof item === 'object' && rows.length < sourceMaxRows) {
          rows.push(item as Record<string, any>);
        }
      });
      pageToken = response.nextPageToken;
    } while (pageToken && rows.length < sourceMaxRows);
    return rows;
  }

  private loadFormBackedSourceRows(
    dataSource: DataSourceConfig,
    projection: string[],
    sourceMaxRows: number,
    honorStatusAllowList: boolean
  ): Record<string, any>[] {
    const sourceContext = this.resolveFormContext(dataSource.formKey);
    const destinationName = sourceContext.form.destinationTab || `${sourceContext.form.title} Responses`;
    const { sheet, headers, columns } = this.submissions.ensureDestination(destinationName, sourceContext.questions);
    const maxRows = Math.min(Math.max(0, sheet.getLastRow() - 1), sourceMaxRows);
    if (maxRows <= 0) return [];
    const data = sheet.getRange(2, 1, maxRows, headers.length).getValues() || [];
    const statusAllowSet = this.buildStatusAllowSet(dataSource.statusAllowList);
    const statusFieldId = (dataSource.statusFieldId || 'status').toString().trim() || 'status';

    return data
      .map(row => this.buildSourceItemFromFormRow(row, columns, projection))
      .filter(item => {
        if (!honorStatusAllowList || !statusAllowSet.size) return true;
        const rawStatus = statusFieldId === 'status' ? item.status : item[statusFieldId];
        const status = this.normalizeLookupValue(rawStatus);
        return !!status && statusAllowSet.has(status);
      });
  }

  private buildSourceItemFromFormRow(row: any[], columns: HeaderColumns, projection: string[]): Record<string, any> {
    const item: Record<string, any> = {};
    const setMeta = (key: string, columnIndex?: number) => {
      if (!columnIndex) return;
      const raw = row[columnIndex - 1];
      item[key] = key === 'updatedAt' || key === 'createdAt' ? this.asIso(raw) || this.stringifyCell(raw) : raw;
    };
    setMeta('id', columns.recordId);
    setMeta('createdAt', columns.createdAt);
    setMeta('updatedAt', columns.updatedAt);
    setMeta('status', columns.status);
    setMeta('pdfUrl', columns.pdfUrl);
    projection.forEach(fieldIdRaw => {
      const fieldId = (fieldIdRaw || '').toString().trim();
      if (!fieldId || item[fieldId] !== undefined) return;
      const colIdx = columns.fields[fieldId];
      if (!colIdx) return;
      item[fieldId] = row[colIdx - 1];
    });
    return item;
  }

  private buildStatusAllowSet(values: string[] | undefined): Set<string> {
    return new Set(
      (Array.isArray(values) ? values : [])
        .map(value => this.normalizeLookupValue(value))
        .filter(Boolean)
    );
  }

  private resolveLookupCandidates(row: Record<string, any>, spec: BackfillSpec): string[] {
    const candidates: string[] = [];
    const add = (value: any) => {
      const text = this.stringifyCell(value).trim();
      if (!text) return;
      if (candidates.some(existing => this.normalizeLookupValue(existing) === this.normalizeLookupValue(text))) return;
      candidates.push(text);
    };
    if (spec.lookupSourceFieldId) add(row[spec.lookupSourceFieldId]);
    add(row[spec.fieldId]);
    Object.entries(spec.targetMapping).forEach(([targetFieldId, sourceFieldId]) => {
      if (sourceFieldId === 'id' || sourceFieldId === 'updatedAt') return;
      add(row[targetFieldId]);
    });
    return candidates;
  }

  private findUniqueSourceMatch(
    sourceIndex: SourceIndex,
    lookupFields: string[],
    candidates: string[]
  ):
    | { status: 'unique'; row: Record<string, any>; legacyValue: string }
    | { status: 'ambiguous'; legacyValue: string }
    | { status: 'none' } {
    for (const candidate of candidates) {
      const normalized = this.normalizeLookupValue(candidate);
      if (!normalized) continue;
      for (const field of lookupFields) {
        const bucket = sourceIndex.byField[field]?.get(normalized);
        if (!bucket || !bucket.rows.length) continue;
        if (bucket.rows.length === 1) {
          return { status: 'unique', row: bucket.rows[0], legacyValue: candidate };
        }
        return { status: 'ambiguous', legacyValue: candidate };
      }
    }
    return { status: 'none' };
  }

  private resolveSourceFieldValue(row: Record<string, any>, fieldId: string): any {
    const key = (fieldId || '').toString().trim();
    if (!key) return '';
    if (Object.prototype.hasOwnProperty.call(row, key)) return row[key];
    if (key === 'id') return row.id;
    if (key === 'updatedAt') return row.updatedAt;
    if (key === 'createdAt') return row.createdAt;
    if (key === 'status') return row.status;
    return '';
  }

  private parseLineItemJson(value: any): { ok: true; rows: any[] } | { ok: false } {
    if (Array.isArray(value)) return { ok: true, rows: value };
    if (this.isBlank(value)) return { ok: true, rows: [] };
    if (typeof value !== 'string') return { ok: false };
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? { ok: true, rows: parsed } : { ok: false };
    } catch {
      return { ok: false };
    }
  }

  private buildTopLevelValues(questions: QuestionConfig[], columns: HeaderColumns, rowValues: any[]): Record<string, any> {
    const values: Record<string, any> = {};
    questions.forEach(question => {
      const colIdx = columns.fields[question.id];
      if (!colIdx) return;
      values[question.id] = rowValues[colIdx - 1];
    });
    return values;
  }

  private writeTopLevelValues(questions: QuestionConfig[], columns: HeaderColumns, rowValues: any[], values: Record<string, any>): void {
    questions.forEach(question => {
      const colIdx = columns.fields[question.id];
      if (!colIdx) return;
      rowValues[colIdx - 1] = values[question.id] ?? '';
    });
  }

  private touchRowMetadata(rowValues: any[], columns: HeaderColumns, updatedAt: Date, updatedAtIso: string): void {
    if (columns.updatedAt) {
      rowValues[columns.updatedAt - 1] = updatedAt;
    }
    if (columns.dataVersion) {
      const previous = Number(rowValues[columns.dataVersion - 1]);
      rowValues[columns.dataVersion - 1] = Number.isFinite(previous) && previous > 0 ? previous + 1 : 1;
    }
    if (columns.createdAt && this.isBlank(rowValues[columns.createdAt - 1])) {
      rowValues[columns.createdAt - 1] = updatedAt;
    }
    if (!columns.updatedAt && !columns.dataVersion) {
      debugLog('datasourceIdBackfill.metadata.skipped', { updatedAtIso });
    }
  }

  private writeChangedRows(args: {
    sheet: GoogleAppsScript.Spreadsheet.Sheet;
    rows: any[][];
    startRow: number;
    changedRowNumbers: Set<number>;
  }): void {
    const rowNumbers = Array.from(args.changedRowNumbers).sort((a, b) => a - b);
    if (!rowNumbers.length) return;
    let chunkStart = rowNumbers[0];
    let previous = rowNumbers[0];
    const flush = (start: number, end: number) => {
      const offset = start - args.startRow;
      const count = end - start + 1;
      const chunk = args.rows.slice(offset, offset + count);
      args.sheet.getRange(start, 1, count, chunk[0]?.length || 1).setValues(chunk);
    };
    for (let index = 1; index < rowNumbers.length; index += 1) {
      const rowNumber = rowNumbers[index];
      if (rowNumber === previous + 1) {
        previous = rowNumber;
        continue;
      }
      flush(chunkStart, previous);
      chunkStart = rowNumber;
      previous = rowNumber;
    }
    flush(chunkStart, previous);
  }

  private bumpRecordIndexBaseRows(args: {
    destinationName: string;
    rows: any[][];
    startRow: number;
    changedRowNumbers: Set<number>;
    columns: HeaderColumns;
  }): void {
    if (!args.changedRowNumbers.size || !args.columns.recordId) return;
    try {
      const idx = ensureRecordIndexSheet(this.ss, args.destinationName, []);
      const rowsToWrite: any[][] = [];
      const rowNumbers = Array.from(args.changedRowNumbers).sort((a, b) => a - b);
      rowNumbers.forEach(rowNumber => {
        const row = args.rows[rowNumber - args.startRow] || [];
        const recordId = this.stringifyCell(row[args.columns.recordId! - 1]).trim();
        if (!recordId) return;
        const dataVersion = args.columns.dataVersion ? Number(row[args.columns.dataVersion - 1]) : 1;
        const updatedAtIso = args.columns.updatedAt ? this.asIso(row[args.columns.updatedAt - 1]) || '' : '';
        const createdAtIso = args.columns.createdAt ? this.asIso(row[args.columns.createdAt - 1]) || '' : '';
        rowsToWrite.push([rowNumber, recordId, Number.isFinite(dataVersion) && dataVersion > 0 ? dataVersion : 1, updatedAtIso, createdAtIso]);
      });
      rowsToWrite.forEach(([rowNumber, recordId, dataVersion, updatedAtIso, createdAtIso]) => {
        idx.sheet
          .getRange(Number(rowNumber), idx.columns.recordId, 1, 5)
          .setValues([[recordId, rowNumber, dataVersion, updatedAtIso, createdAtIso]]);
      });
    } catch (err: any) {
      debugLog('datasourceIdBackfill.indexUpdate.error', {
        destinationName: args.destinationName,
        message: err?.message || err?.toString?.() || 'unknown'
      });
    }
  }

  private appendAuditEntries(sheetName: string, entries: DataSourceIdBackfillLogEntry[]): number {
    if (!entries.length) return 0;
    let sheet = this.ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = this.ss.insertSheet(sheetName);
    }
    const headers = [
      'Timestamp',
      'Form Key',
      'Dry Run',
      'Row Number',
      'Record ID',
      'Path',
      'Field ID',
      'Legacy Value',
      'Matched Source ID',
      'Matched Source Updated At',
      'Status',
      'Message'
    ];
    const existingHeaders = sheet.getRange(1, 1, 1, headers.length).getValues()[0] || [];
    const hasHeaders = existingHeaders.some(value => !this.isBlank(value));
    if (!hasHeaders) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    }
    const values = entries.map(entry => [
      entry.timestamp,
      entry.formKey,
      entry.dryRun ? 'TRUE' : 'FALSE',
      entry.rowNumber,
      entry.recordId || '',
      entry.path,
      entry.fieldId || '',
      entry.legacyValue || '',
      entry.matchedSourceId || '',
      entry.matchedSourceUpdatedAt || '',
      entry.status,
      entry.message || ''
    ]);
    const startRow = Math.max(2, sheet.getLastRow() + 1);
    sheet.getRange(startRow, 1, values.length, headers.length).setValues(values);
    return values.length;
  }

  private buildLogEntry(args: {
    formKey: string;
    dryRun: boolean;
    rowNumber: number;
    recordId?: string;
    path: string;
    fieldId?: string;
    legacyValue?: string;
    matchedSourceId?: string;
    matchedSourceUpdatedAt?: string;
    status: string;
    message?: string;
  }): DataSourceIdBackfillLogEntry {
    return {
      timestamp: new Date().toISOString(),
      formKey: args.formKey,
      dryRun: args.dryRun,
      rowNumber: args.rowNumber,
      recordId: args.recordId || undefined,
      path: args.path,
      fieldId: args.fieldId || undefined,
      legacyValue: args.legacyValue || undefined,
      matchedSourceId: args.matchedSourceId || undefined,
      matchedSourceUpdatedAt: args.matchedSourceUpdatedAt || undefined,
      status: args.status,
      message: args.message || undefined
    };
  }

  private captureLog(
    entry: DataSourceIdBackfillLogEntry,
    auditEntries: DataSourceIdBackfillLogEntry[],
    samples: DataSourceIdBackfillLogEntry[],
    sampleLimit: number
  ): void {
    auditEntries.push(entry);
    if (samples.length < sampleLimit) {
      samples.push(entry);
    }
  }

  private buildBaseResult(args: {
    formKey: string;
    dryRun: boolean;
    startRow: number;
    endRow: number;
    logSheetName: string;
    writeAuditLog: boolean;
  }): DataSourceIdBackfillResult {
    return {
      success: true,
      formKey: args.formKey,
      dryRun: args.dryRun,
      startRow: args.startRow,
      endRow: args.endRow,
      done: false,
      scannedRows: 0,
      changedRows: 0,
      fieldUpdates: 0,
      alreadyFilled: 0,
      skippedNoLegacyValue: 0,
      skippedNoMatch: 0,
      skippedAmbiguous: 0,
      skippedInvalidJson: 0,
      skippedMissingSource: 0,
      auditRows: 0,
      logSheetName: args.writeAuditLog ? args.logSheetName : undefined,
      samples: [],
      message: ''
    };
  }

  private buildSummaryMessage(args: {
    dryRun: boolean;
    changedRows: number;
    fieldUpdates: number;
    nextStartRow?: number;
  }): string {
    const action = args.dryRun ? 'would update' : 'updated';
    const next = args.nextStartRow ? ` Next start row: ${args.nextStartRow}.` : '';
    return `Backfill ${action} ${args.fieldUpdates} field(s) across ${args.changedRows} row(s).${next}`;
  }

  private normalizeStartRow(value: any): number {
    const raw = Number(value);
    return Number.isFinite(raw) && raw >= 2 ? Math.floor(raw) : 2;
  }

  private normalizePositiveInt(value: any, fallback: number, max: number): number {
    const raw = Number(value);
    if (!Number.isFinite(raw) || raw <= 0) return fallback;
    return Math.max(1, Math.min(Math.floor(raw), max));
  }

  private pathsEqual(left: string[], right: string[]): boolean {
    return left.length === right.length && left.every((value, index) => value === right[index]);
  }

  private pathStartsWith(path: string[], prefix: string[]): boolean {
    return prefix.every((value, index) => path[index] === value);
  }

  private isBlank(value: any): boolean {
    if (value === undefined || value === null) return true;
    if (typeof value === 'string') return value.trim() === '';
    return false;
  }

  private stringifyCell(value: any): string {
    if (value === undefined || value === null) return '';
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return value.toString();
    try {
      return JSON.stringify(value);
    } catch {
      return value.toString();
    }
  }

  private normalizeLookupValue(value: any): string {
    return this.stringifyCell(value)
      .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  private asIso(value: any): string | undefined {
    if (value instanceof Date) return value.toISOString();
    if (value === undefined || value === null || value === '') return undefined;
    try {
      const parsed = new Date(value);
      if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
    } catch {
      // ignore
    }
    return value.toString();
  }
}
