import React from 'react';
import { shouldHideField, validateRules } from '../../../../core';
import type {
  FieldValue,
  LangCode,
  VisibilityContext
} from '../../../../types';
import {
  buildSubgroupKey,
  resolveSubgroupKey
} from '../../../app/lineItems';
import { resolveValueMapValue } from '../../../components/form/valueMaps';
import { CheckIcon } from '../../../components/form/ui';
import {
  isUploadValueComplete
} from '../../../components/form/utils';
import { tSystem } from '../../../../systemStrings';
import { isEmptyValue } from '../../../utils/values';
import { toOptionSet } from '../../../../core';

export type SubgroupOpenStackRendererProps = {
  parentGroupId: string;
  parentRow: { id: string; values: Record<string, FieldValue> };
  subIdsToRender: string[];
  subIdToLabel: Record<string, string>;
  subGroups: any[];
  lineItems: Record<string, any[]>;
  values: Record<string, FieldValue>;
  collapsedRows: Record<string, boolean>;
  errorIndex: { subgroupErrors: Set<string> };
  language: LangCode;
  sourceFieldId?: string;
  variant?: 'stack' | 'inline';
  resolveTopValue: (fieldId: string) => FieldValue;
  openSubgroupOverlay: (key: string, options?: any) => void;
  onDiagnostic?: (event: string, payload?: Record<string, unknown>) => void;
};

export const SubgroupOpenStackRenderer: React.FC<SubgroupOpenStackRendererProps> = ({
  parentGroupId,
  parentRow,
  subIdsToRender,
  subIdToLabel,
  subGroups,
  lineItems,
  values,
  collapsedRows,
  errorIndex,
  language,
  sourceFieldId,
  variant: variantProp = 'stack',
  resolveTopValue,
  openSubgroupOverlay,
  onDiagnostic
}) => {
  const variant = variantProp === 'inline' ? 'inline' : 'stack';
  const list = Array.isArray(subIdsToRender) ? Array.from(new Set(subIdsToRender.filter(Boolean))) : [];
  if (!list.length) return null;

  const tapToOpenLabel = tSystem('common.tapToOpen', language, 'Tap to open');
  const containerClass = variant === 'inline' ? 'ck-label-actions' : 'ck-subgroup-open-stack';

  return (
    <div className={containerClass}>
      {list.map(subId => {
        const fullSubKey = buildSubgroupKey(parentGroupId, parentRow.id, subId);
        const subHasError = errorIndex.subgroupErrors.has(fullSubKey);
        const subRows = (lineItems[fullSubKey] || []) as any[];
        const subCfg = (subGroups || []).find(sub => resolveSubgroupKey(sub) === subId) as any;
        const subFields = ((subCfg as any)?.fields || []) as any[];
        const label = subIdToLabel[subId] || subId;
        const subUi = (subCfg as any)?.ui as any;
        const isSubProgressive =
          subUi?.mode === 'progressive' &&
          Array.isArray(subUi?.collapsedFields) &&
          (subUi?.collapsedFields || []).length > 0;
        const subDefaultCollapsed = subUi?.defaultCollapsed !== undefined ? !!subUi.defaultCollapsed : true;
        const subCollapsedFieldConfigs = isSubProgressive ? (subUi?.collapsedFields || []) : [];
        const subExpandGate = (subUi?.expandGate || 'collapsedFieldsValid') as 'collapsedFieldsValid' | 'always';

        const isSubRowDisabledByExpandGate = (subRow: any): boolean => {
          if (!isSubProgressive) return false;
          if (subExpandGate === 'always') return false;
          if (!subCollapsedFieldConfigs.length) return false;
          const subCollapseKey = `${fullSubKey}::${subRow.id}`;
          const subRowCollapsed = collapsedRows[subCollapseKey] ?? subDefaultCollapsed;
          if (!subRowCollapsed) return false;

          const groupCtx: VisibilityContext = {
            getValue: fieldId => resolveTopValue(fieldId),
            getLineValue: (_rowId, fieldId) => (subRow?.values || {})[fieldId],
            getLineItems: groupId => lineItems?.[groupId] || [],
            getLineItemKeys: () => Object.keys(lineItems || {})
          };
          const isHidden = (fieldId: string) => {
            const target = (subFields || []).find((field: any) => field?.id === fieldId) as any;
            if (!target) return false;
            return shouldHideField(target.visibility, groupCtx, { rowId: subRow?.id, linePrefix: fullSubKey });
          };
          const blocked: string[] = [];
          (subCollapsedFieldConfigs || []).forEach((cfg: any) => {
            const fieldId = cfg?.fieldId ? cfg.fieldId.toString() : '';
            if (!fieldId) return;
            const field = (subFields || []).find((item: any) => item?.id === fieldId) as any;
            if (!field) return;
            const hideField = shouldHideField(field.visibility, groupCtx, { rowId: subRow?.id, linePrefix: fullSubKey });
            if (hideField) return;
            const val = (subRow?.values || {})[field.id];
            if (field.required && isEmptyValue(val as any)) {
              blocked.push(field.id);
              return;
            }
            const rules = Array.isArray(field.validationRules)
              ? field.validationRules.filter((rule: any) => rule?.then?.fieldId === field.id)
              : [];
            if (!rules.length) return;
            const rulesCtx: any = {
              ...groupCtx,
              getValue: (id: string) =>
                Object.prototype.hasOwnProperty.call(subRow?.values || {}, id)
                  ? (subRow?.values || {})[id]
                  : (Object.prototype.hasOwnProperty.call(parentRow.values || {}, id) ? (parentRow.values || {})[id] : values[id]),
              language,
              phase: 'submit',
              isHidden
            };
            const errs = validateRules(rules, rulesCtx);
            if (errs.length) blocked.push(field.id);
          });
          return Array.from(new Set(blocked)).length > 0;
        };

        const subgroupIsComplete = (() => {
          if (!subRows.length) return false;
          if (!subFields.length) return true;
          let hasAnyEnabledRow = false;
          for (const subRow of subRows) {
            if (isSubRowDisabledByExpandGate(subRow)) continue;
            hasAnyEnabledRow = true;
            const subCtx: VisibilityContext = {
              getValue: fieldId => resolveTopValue(fieldId),
              getLineValue: (_rowId, fieldId) => (subRow?.values || {})[fieldId],
              getLineItems: groupId => lineItems?.[groupId] || [],
              getLineItemKeys: () => Object.keys(lineItems || {})
            };
            for (const field of subFields) {
              if (!field?.required) continue;
              const hide = shouldHideField(field.visibility, subCtx, { rowId: subRow.id, linePrefix: fullSubKey });
              if (hide) continue;
              const mapped = field.valueMap
                ? resolveValueMapValue(
                    field.valueMap,
                    (fieldId: string) => {
                      if ((subRow?.values || {}).hasOwnProperty(fieldId)) return (subRow?.values || {})[fieldId];
                      if ((parentRow.values || {}).hasOwnProperty(fieldId)) return (parentRow.values || {})[fieldId];
                      return resolveTopValue(fieldId);
                    },
                    { language, targetOptions: toOptionSet(field) }
                  )
                : undefined;
              const raw = field.valueMap ? mapped : (subRow?.values || {})[field.id];
              const filled =
                field.type === 'FILE_UPLOAD'
                  ? isUploadValueComplete({
                      value: raw as any,
                      uploadConfig: (field as any).uploadConfig,
                      required: true
                    })
                  : !isEmptyValue(raw as any);
              if (!filled) return false;
            }
          }
          if (!hasAnyEnabledRow) return false;
          return true;
        })();

        const pillClass = subHasError
          ? 'ck-progress-bad'
          : subgroupIsComplete
            ? 'ck-progress-good'
            : subRows.length
              ? 'ck-progress-info'
              : 'ck-progress-neutral';

        const pillBaseClass =
          variant === 'inline'
            ? 'ck-progress-pill ck-subgroup-open-pill-inline'
            : 'ck-progress-pill ck-upload-pill-btn ck-subgroup-open-pill';

        return (
          <button
            key={`${fullSubKey}-open`}
            type="button"
            className={`${pillBaseClass} ck-list-row-action-btn ${pillClass}`}
            aria-label={`${tapToOpenLabel} ${label}`}
            onClick={() => {
              onDiagnostic?.('subgroup.open.tap', {
                groupId: parentGroupId,
                rowId: parentRow.id,
                subId,
                sourceFieldId: sourceFieldId || null
              });
              openSubgroupOverlay(fullSubKey);
            }}
          >
            {pillClass === 'ck-progress-good' ? (
              <CheckIcon style={{ width: '1.05em', height: '1.05em' }} />
            ) : null}
            <span>{label}</span>
            <span className="ck-progress-label">{tapToOpenLabel}</span>
            <span className="ck-progress-caret">{'\u25b8'}</span>
          </button>
        );
      })}
    </div>
  );
};
