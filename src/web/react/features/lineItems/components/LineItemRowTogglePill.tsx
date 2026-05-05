import React from 'react';

import { shouldHideField, toOptionSet } from '../../../../core';
import { tSystem } from '../../../../systemStrings';
import type { FieldValue, LangCode, VisibilityContext } from '../../../../types';
import { buildSubgroupKey, resolveSubgroupKey } from '../../../app/lineItems';
import { CheckIcon } from '../../../components/form/ui';
import { isUploadValueComplete } from '../../../components/form/utils';
import { resolveValueMapValue } from '../../../components/form/valueMaps';
import type { LineItemState } from '../../../types';
import { isEmptyValue } from '../../../utils/values';

type RowTogglePillProps = {
  hidden?: boolean;
  groupId: string;
  row: { id: string; values: Record<string, FieldValue> };
  fields: any[];
  subGroups: any[];
  lineItems: LineItemState;
  groupCtx: VisibilityContext;
  language: LangCode;
  rowHasError: boolean;
  rowLocked: boolean;
  rowCollapsed: boolean;
  canExpand: boolean;
  gateReason: string;
  resolveTopValue: (fieldId: string) => FieldValue;
  onBlockedExpand?: (reason: string) => void;
  onToggle?: (nextCollapsed: boolean) => void;
};

const resolveRequiredRowProgress = ({
  groupId,
  row,
  fields,
  subGroups,
  lineItems,
  groupCtx,
  language,
  resolveTopValue
}: Pick<
  RowTogglePillProps,
  'groupId' | 'row' | 'fields' | 'subGroups' | 'lineItems' | 'groupCtx' | 'language' | 'resolveTopValue'
>): { hasAnyRequired: boolean; allRequiredComplete: boolean } => {
  let hasAnyRequired = false;
  let allRequiredComplete = true;

  const isFilled = (field: any, raw: any): boolean => {
    if (field?.type === 'FILE_UPLOAD') {
      return isUploadValueComplete({
        value: raw as any,
        uploadConfig: (field as any).uploadConfig,
        required: !!field.required
      });
    }
    return !isEmptyValue(raw as any);
  };

  (fields || []).forEach((field: any) => {
    const hideField = shouldHideField(field.visibility, groupCtx, { rowId: row.id, linePrefix: groupId });
    if (hideField) return;
    if (!field?.required) return;
    hasAnyRequired = true;

    const mapped = field.valueMap
      ? resolveValueMapValue(
          field.valueMap,
          (fieldId: string) => {
            if ((row.values || {}).hasOwnProperty(fieldId)) return (row.values || {})[fieldId];
            return resolveTopValue(fieldId);
          },
          { language, targetOptions: toOptionSet(field) }
        )
      : undefined;
    const raw = field.valueMap ? mapped : (row.values || {})[field.id];
    if (!isFilled(field, raw)) allRequiredComplete = false;
  });

  (subGroups || []).forEach(subGroup => {
    const subId = resolveSubgroupKey(subGroup);
    if (!subId) return;
    const subKey = buildSubgroupKey(groupId, row.id, subId);
    const subRows = (lineItems[subKey] || []) as any[];
    if (!subRows.length) return;
    const subFields = ((subGroup as any)?.fields || []) as any[];
    subRows.forEach(subRow => {
      const subCtx: VisibilityContext = {
        getValue: fieldId => resolveTopValue(fieldId),
        getLineValue: (_rowId, fieldId) => (subRow?.values || {})[fieldId],
        getLineItems: targetGroupId => lineItems?.[targetGroupId] || [],
        getLineItemKeys: () => Object.keys(lineItems || {})
      };
      subFields.forEach((field: any) => {
        const hide = shouldHideField(field.visibility, subCtx, { rowId: subRow.id, linePrefix: subKey });
        if (hide) return;
        if (!field?.required) return;
        hasAnyRequired = true;

        const mapped = field.valueMap
          ? resolveValueMapValue(
              field.valueMap,
              (fieldId: string) => {
                if ((subRow?.values || {}).hasOwnProperty(fieldId)) return (subRow?.values || {})[fieldId];
                if ((row.values || {}).hasOwnProperty(fieldId)) return (row.values || {})[fieldId];
                return resolveTopValue(fieldId);
              },
              { language, targetOptions: toOptionSet(field) }
            )
          : undefined;
        const raw = field.valueMap ? mapped : (subRow?.values || {})[field.id];
        if (!isFilled(field, raw)) allRequiredComplete = false;
      });
    });
  });

  return { hasAnyRequired, allRequiredComplete };
};

export const LineItemRowTogglePill: React.FC<RowTogglePillProps> = ({
  hidden,
  groupId,
  row,
  fields,
  subGroups,
  lineItems,
  groupCtx,
  language,
  rowHasError,
  rowLocked,
  rowCollapsed,
  canExpand,
  gateReason,
  resolveTopValue,
  onBlockedExpand,
  onToggle
}) => {
  if (hidden) return null;

  const requiredRowProgress = resolveRequiredRowProgress({
    groupId,
    row,
    fields,
    subGroups,
    lineItems,
    groupCtx,
    language,
    resolveTopValue
  });
  let requiredRowProgressClass = requiredRowProgress.hasAnyRequired
    ? requiredRowProgress.allRequiredComplete
      ? 'ck-progress-good'
      : 'ck-progress-bad'
    : 'ck-progress-neutral';
  if (rowHasError) requiredRowProgressClass = 'ck-progress-bad';

  const tapExpandLabel = tSystem('common.tapToExpand', language, 'Tap to expand');
  const tapCollapseLabel = tSystem('common.tapToCollapse', language, 'Tap to collapse');
  const lockedLabel = tSystem('lineItems.locked', language, 'Locked');
  const pillActionLabel = rowLocked ? lockedLabel : rowCollapsed ? tapExpandLabel : tapCollapseLabel;

  return (
    <button
      type="button"
      className="ck-row-toggle"
      aria-label={pillActionLabel}
      aria-expanded={!rowCollapsed}
      aria-disabled={rowCollapsed && !canExpand}
      title={rowCollapsed && !canExpand ? gateReason : pillActionLabel}
      onClick={() => {
        if (rowCollapsed && !canExpand) {
          onBlockedExpand?.(gateReason);
          return;
        }
        onToggle?.(!rowCollapsed);
      }}
    >
      {(() => {
        const parts: string[] = [];
        if (rowHasError) parts.push(tSystem('lineItems.needsAttention', language, 'Needs attention'));
        if (rowLocked) parts.push(tSystem('lineItems.locked', language, 'Locked'));
        const text = parts.join(' · ');
        if (!text) return null;
        return (
          <span
            className="muted"
            style={{ fontSize: 'var(--ck-font-control)', fontWeight: 600, color: rowHasError ? 'var(--danger)' : undefined }}
          >
            {text}
          </span>
        );
      })()}
      <span
        className={`ck-progress-pill ${requiredRowProgressClass}`}
        data-has-error={rowHasError ? 'true' : undefined}
        aria-disabled={rowCollapsed && !canExpand ? 'true' : undefined}
      >
        {requiredRowProgressClass === 'ck-progress-good' ? (
          <CheckIcon style={{ width: '1.05em', height: '1.05em' }} />
        ) : null}
        <span className="ck-progress-label">{pillActionLabel}</span>
        <span className="ck-progress-caret">{rowCollapsed ? '\u25b8' : '\u25be'}</span>
      </span>
    </button>
  );
};
