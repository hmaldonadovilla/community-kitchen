import { resolveLocalizedString } from '../../../../i18n';
import { tSystem } from '../../../../systemStrings';
import type { FieldValue, LangCode, LineItemRowState } from '../../../../types';
import type { LineItemState } from '../../../types';
import { filterSourceFirstAllocationRows } from '../../../app/sourceFirstAllocations';
import { matchesDataSourceRowToParent } from './dataSourceRowMatching';

export type SourceFirstPresentationEntry = {
  config: any;
  loading: boolean;
  sourceRows: any[];
  visibleSourceRows: Array<{
    sourceRow: Record<string, any>;
    eligibleParents: LineItemRowState[];
  }>;
  emptyStateMessage: string;
};

/**
 * Owner: source-first line-item presentation.
 * Projects source rows into parent-row eligibility groups and localized empty
 * state text without depending on React rendering state.
 */
export const buildSourceFirstPresentationEntries = (args: {
  sourceFirstDataSourceRows: any[];
  stepDataSourceDrafts: unknown;
  parentRows: LineItemRowState[];
  values: Record<string, FieldValue>;
  lineItems: LineItemState;
  language: LangCode;
  isStepDataSourceLoading: (config: any) => boolean;
  resolveStepDataSourceRows: (config: any) => any[];
  decorateStepDataSourceRowForVisibility: (
    config: any,
    sourceRow: Record<string, any>,
    parentRowId?: string
  ) => Record<string, any>;
}): SourceFirstPresentationEntry[] => {
  const {
    sourceFirstDataSourceRows,
    stepDataSourceDrafts,
    parentRows,
    values,
    lineItems,
    language,
    isStepDataSourceLoading,
    resolveStepDataSourceRows,
    decorateStepDataSourceRowForVisibility
  } = args;
  void stepDataSourceDrafts;
  return sourceFirstDataSourceRows.map((config: any) => {
    const loading = isStepDataSourceLoading(config);
    const sourceRows = resolveStepDataSourceRows(config);
    const visibleSourceRows = sourceRows
      .map((sourceRow: Record<string, any>) => {
        const eligibleParents = parentRows.filter(parentRow => {
          const scopedSourceRow = decorateStepDataSourceRowForVisibility(config, sourceRow, parentRow.id);
          const parentScopedRows = filterSourceFirstAllocationRows({
            rows: [scopedSourceRow],
            sourceRowsConfig: config?.sourceRows,
            parentValues: (parentRow.values || {}) as Record<string, FieldValue>,
            topValues: values,
            lineItems
          });
          if (!parentScopedRows.length) return false;
          const parentMatchFieldId = `${config?.parentMatchFieldId || ''}`.trim();
          const sourceMatchFieldId = `${config?.sourceMatchFieldId || ''}`.trim();
          const sourceMatchFieldIds = Array.isArray(config?.sourceMatchFieldIds)
            ? (config.sourceMatchFieldIds as any[]).map(value => `${value || ''}`.trim()).filter(Boolean)
            : [];
          if (!parentMatchFieldId || (!sourceMatchFieldId && !sourceMatchFieldIds.length)) return true;
          return matchesDataSourceRowToParent({
            item: scopedSourceRow,
            sourceMatchFieldId,
            sourceMatchFieldIds,
            parentValue: (parentRow.values as any)?.[parentMatchFieldId],
            mode: `${config?.sourceMatchMode || 'equals'}`.trim(),
            delimiter: `${config?.sourceMatchDelimiter || ''}`.trim()
          });
        });
        if (!eligibleParents.length) return null;
        return { sourceRow, eligibleParents };
      })
      .filter(Boolean) as Array<{ sourceRow: Record<string, any>; eligibleParents: LineItemRowState[] }>;
    const uiCfg = config?.ui && typeof config.ui === 'object' ? config.ui : {};
    const emptyStateMessage = loading
      ? tSystem('common.loading', language, 'Loading…').trim()
      : sourceRows.length
        ? resolveLocalizedString((uiCfg as any)?.emptyStateMessage, language, '').trim()
        : resolveLocalizedString(
            (uiCfg as any)?.noSourceRowsMessage,
            language,
            tSystem('datasource.empty', language, 'No records are available.')
          ).trim();
    return {
      config,
      loading,
      sourceRows,
      visibleSourceRows,
      emptyStateMessage
    };
  });
};
