import { useMemo } from 'react';

import {
  DATA_SOURCE_COUNT_FIELD_PREFIX,
  normalizeDataSourceVisibilityKey
} from '../../app/dataSourceVisibility';
import { getCachedDataSourceItemCount } from '../../../data/dataSources';
import { resolveGuidedListProjection } from '../../features/steps/domain/guidedListProjection';
import { resolveVirtualStepField } from '../../features/steps/domain/resolveVirtualStepField';
import type { FieldValue, LangCode, WebFormDefinition } from '../../../types';
import type { LineItemState } from '../../types';
import { resolveLabel } from '../../utils/labels';
import { getSystemFieldValue } from '../../../rules/systemFields';
import { shouldHideField } from '../../../rules/visibility';
import {
  readOpenUrlRuntimeEnvironment,
  resolveOpenUrlFieldPresentation,
  type OpenUrlFieldMode
} from '../../app/openUrlField';

export type AppCustomButton = {
  id: string;
  label: string;
  placements: any[];
  action: any;
  disabled: boolean;
  href?: string;
  openUrlFieldId?: string;
  openUrlMode?: OpenUrlFieldMode;
};

export const useAppCustomButtons = (args: {
  definition: WebFormDefinition;
  language: LangCode;
  values: Record<string, FieldValue>;
  lineItems: LineItemState;
  view: string;
  selectedRecordId?: string | null;
  selectedRecordSnapshot?: any;
  lastSubmissionMeta?: any;
  guidedDataSourceConfigMap: {
    byExact: Map<string, any>;
    byNormalized: Map<string, any>;
  };
  encodeButtonRef: (id: string, qIdx?: number) => string;
  resolveOpenUrlFieldHref: (fieldIdRaw: string) => string;
}) => {
  const {
    definition,
    language,
    values,
    lineItems,
    view,
    selectedRecordId,
    selectedRecordSnapshot,
    lastSubmissionMeta,
    guidedDataSourceConfigMap,
    encodeButtonRef,
    resolveOpenUrlFieldHref
  } = args;

  return useMemo(() => {
    const createPresetEnabled = definition.createRecordPresetButtonsEnabled !== false;
    const applyVisibility = view !== 'list';
    const resolveBaseVisibilityValue = (fieldId: string): FieldValue | undefined => {
      if (fieldId.startsWith(DATA_SOURCE_COUNT_FIELD_PREFIX)) {
        const key = fieldId.slice(DATA_SOURCE_COUNT_FIELD_PREFIX.length).trim();
        const config =
          guidedDataSourceConfigMap.byExact.get(key) ||
          guidedDataSourceConfigMap.byNormalized.get(normalizeDataSourceVisibilityKey(key));
        if (config) {
          const count = getCachedDataSourceItemCount(config, language);
          if (count !== null) return count as FieldValue;
        }
      }
      const direct = values[fieldId];
      if (direct !== undefined && direct !== null && direct !== '') return direct as FieldValue;
      const meta: any = {
        id: selectedRecordId || selectedRecordSnapshot?.id || lastSubmissionMeta?.id,
        createdAt: selectedRecordSnapshot?.createdAt || lastSubmissionMeta?.createdAt,
        updatedAt: selectedRecordSnapshot?.updatedAt || lastSubmissionMeta?.updatedAt,
        status: selectedRecordSnapshot?.status || lastSubmissionMeta?.status || null,
        pdfUrl: selectedRecordSnapshot?.pdfUrl || undefined
      };
      const sys = getSystemFieldValue(fieldId, meta);
      if (sys !== undefined) return sys as FieldValue;
      for (const rows of Object.values(lineItems)) {
        if (!Array.isArray(rows)) continue;
        for (const row of rows as any[]) {
          const v = (row as any)?.values?.[fieldId];
          if (v !== undefined && v !== null && v !== '') return v as FieldValue;
        }
      }
      return undefined;
    };
    const guidedProjection = resolveGuidedListProjection({
      definition: definition as any,
      language: language as any,
      values: values as any,
      lineItems: lineItems as any,
      applyVisibility,
      getVisibilityValue: resolveBaseVisibilityValue
    });
    const guidedVirtualState = guidedProjection.virtualState;
    const resolveButtonVisibilityValue = (fieldId: string): FieldValue | undefined => {
      if (guidedVirtualState) {
        const virtual = resolveVirtualStepField(fieldId, guidedVirtualState);
        if (virtual !== undefined) return virtual as FieldValue;
      }
      return resolveBaseVisibilityValue(fieldId);
    };
    const visibilityCtx = {
      getValue: (fieldId: string) => resolveButtonVisibilityValue(fieldId),
      getLineItems: (groupId: string) => lineItems[groupId] || [],
      getLineItemKeys: () => Object.keys(lineItems)
    } as any;
    return definition.questions
      .map((q, idx) => ({ q, idx }))
      .filter(({ q }) => q.type === 'BUTTON')
      .map(({ q, idx }) => {
        if (applyVisibility && shouldHideField((q as any)?.visibility, visibilityCtx)) {
          return null;
        }
        const cfg: any = (q as any)?.button;
        if (!cfg || typeof cfg !== 'object') return null;
        const action = (cfg.action || '').toString().trim();
        if (action === 'renderDocTemplate' || action === 'renderMarkdownTemplate' || action === 'renderHtmlTemplate') {
          if (!cfg.templateId) return null;
        } else if (action === 'createRecordPreset') {
          if (!createPresetEnabled) return null;
          if (!cfg.presetValues || typeof cfg.presetValues !== 'object') return null;
        } else if (action === 'updateRecord') {
          const setObj = cfg.set || cfg.patch || cfg.update || null;
          if (!setObj || typeof setObj !== 'object') return null;
          const hasStatus = (setObj as any).status !== undefined;
          const valuesObj = (setObj as any).values;
          const hasValues = valuesObj && typeof valuesObj === 'object';
          if (!hasStatus && !hasValues) return null;
        } else if (action === 'openUrlField') {
          if (!cfg.fieldId) return null;
        } else {
          return null;
        }

        const placementsRaw = cfg.placements;
        const placements = Array.isArray(placementsRaw) && placementsRaw.length ? placementsRaw : (['form'] as const);
        const id = encodeButtonRef(q.id, idx);
        const openUrlFieldId = action === 'openUrlField' ? (cfg.fieldId || '').toString().trim() : '';
        const href = openUrlFieldId ? resolveOpenUrlFieldHref(openUrlFieldId) : '';
        const openUrlPresentation =
          action === 'openUrlField'
            ? resolveOpenUrlFieldPresentation({
                action,
                fieldId: openUrlFieldId,
                href,
                env: readOpenUrlRuntimeEnvironment()
              })
            : null;
        const disabled = action === 'openUrlField' && cfg.disableWhenValueMissing === true ? !href : false;
        return {
          id,
          label: resolveLabel(q, language),
          placements: placements as any,
          action: action as any,
          disabled,
          ...(openUrlPresentation?.mode === 'externalLink' ? { href: openUrlPresentation.href } : {}),
          ...(openUrlFieldId ? { openUrlFieldId } : {}),
          ...(openUrlPresentation ? { openUrlMode: openUrlPresentation.mode } : {})
        };
      })
      .filter((button): button is AppCustomButton => !!button);
  }, [
    definition,
    encodeButtonRef,
    guidedDataSourceConfigMap,
    language,
    lastSubmissionMeta,
    lineItems,
    resolveOpenUrlFieldHref,
    selectedRecordId,
    selectedRecordSnapshot,
    values,
    view
  ]);
};
