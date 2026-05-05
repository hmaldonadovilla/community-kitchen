import React from 'react';

import { matchesWhenClause } from '../../../../core';
import { resolveLocalizedString } from '../../../../i18n';
import { tSystem } from '../../../../systemStrings';
import type {
  FieldValue,
  LangCode,
  LineItemGroupConfigOverride,
  LineItemRowState,
  VisibilityContext,
  WebQuestionDefinition
} from '../../../../types';
import { ROW_HIDE_REMOVE_KEY, ROW_SOURCE_AUTO, ROW_SOURCE_KEY } from '../../../app/lineItems';
import { buttonStyles } from '../../../components/form/ui';
import type { LineItemState } from '../../../types';
import { isEmptyValue } from '../../../utils/values';

type SourceFirstDataSourceActionsProps = {
  rules: any[];
  config: any;
  configIndex: number;
  row: LineItemRowState;
  sourceRow: Record<string, any>;
  sourceKey: string;
  virtualValues: Record<string, FieldValue>;
  language: LangCode;
  resolveVirtualRowWhenContext: (args: {
    rowValues: Record<string, FieldValue>;
    parentValues?: Record<string, FieldValue>;
  }) => VisibilityContext;
  resolveVirtualValue: (virtualValues: Record<string, FieldValue>, fieldId: string) => FieldValue | undefined;
  setLineItems: React.Dispatch<React.SetStateAction<LineItemState>>;
  openInfoOverlay: (title: string, text: string) => void;
  openLineItemGroupOverlay: (
    groupOrId: string | WebQuestionDefinition,
    options?: {
      hideInlineSubgroups?: boolean;
      source?: 'user' | 'system' | 'autoscroll' | 'navigate' | 'overlayOpenAction';
      hideCloseButton?: boolean;
      closeButtonLabel?: string;
      label?: string;
      contextHeader?: string;
    }
  ) => void;
};

const coerceDataSourceItemsCollection = (payload: any): any[] => {
  if (Array.isArray(payload)) return payload.filter(Boolean);
  if (typeof payload === 'string') {
    const trimmed = payload.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch {
      return [];
    }
  }
  return [];
};

const mapDataSourceActionEntries = (entries: any[], action: any): Record<string, any>[] => {
  const mapping = action?.lineItemMapping && typeof action.lineItemMapping === 'object'
    ? (action.lineItemMapping as Record<string, string>)
    : {};
  const mapped = entries
    .map(entry => {
      const next: Record<string, any> = {};
      Object.entries(mapping).forEach(([targetFieldId, sourceFieldId]) => {
        next[targetFieldId] = entry?.[sourceFieldId];
      });
      return next;
    })
    .filter(entry => Object.values(entry).some(value => !isEmptyValue(value as any)));
  const aggregateBy = Array.isArray(action?.aggregateBy) ? (action.aggregateBy as string[]) : [];
  const aggregateNumericFields = Array.isArray(action?.aggregateNumericFields)
    ? (action.aggregateNumericFields as string[])
    : [];
  if (!aggregateBy.length || !aggregateNumericFields.length) return mapped;
  const grouped = new Map<string, Record<string, any>>();
  mapped.forEach(entry => {
    const key = aggregateBy.map(fieldId => `${entry[fieldId] ?? ''}`).join('::');
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, { ...entry });
      return;
    }
    aggregateNumericFields.forEach(fieldId => {
      const current = Number(existing[fieldId] ?? 0);
      const next = Number(entry[fieldId] ?? 0);
      existing[fieldId] = Number.isFinite(current + next) ? current + next : existing[fieldId];
    });
  });
  return Array.from(grouped.values());
};

export const SourceFirstDataSourceActions: React.FC<SourceFirstDataSourceActionsProps> = ({
  rules,
  config,
  configIndex,
  row,
  sourceRow,
  sourceKey,
  virtualValues,
  language,
  resolveVirtualRowWhenContext,
  resolveVirtualValue,
  setLineItems,
  openInfoOverlay,
  openLineItemGroupOverlay
}) => {
  if (!rules.length) return null;
  const parentValues = (row.values || {}) as Record<string, FieldValue>;
  const actionRule = rules.find(rule =>
    !rule?.when || matchesWhenClause(rule.when as any, resolveVirtualRowWhenContext({
      rowValues: virtualValues,
      parentValues
    }))
  );
  const actions = Array.isArray(actionRule?.actions) ? (actionRule.actions as any[]) : [];
  if (!actions.length) return null;

  const nodes = actions
    .map((action: any, actionIndex: number) => {
      if (!action || action.type !== 'openSubgroupOverlay') return null;
      if (action.showWhen && !matchesWhenClause(action.showWhen as any, resolveVirtualRowWhenContext({
        rowValues: virtualValues,
        parentValues
      }))) {
        return null;
      }
      const buttonLabel = resolveLocalizedString(action.label, language, '').trim();
      if (!buttonLabel) return null;
      const tone = ((action.tone || 'secondary').toString().trim().toLowerCase() === 'primary') ? 'primary' : 'secondary';
      return (
        <button
          key={`action:${sourceKey}:${actionIndex}`}
          type="button"
          style={{
            ...(tone === 'primary' ? buttonStyles.primary : buttonStyles.secondary),
            minHeight: 36,
            padding: '6px 12px',
            whiteSpace: 'nowrap',
            flex: '0 0 auto'
          }}
          onClick={() => {
            const sourcePath = (action.sourcePath || '').toString().trim();
            const targetSubGroupId = (action.subGroupId || '').toString().trim();
            const overlayKey = `__guidedDataSourceRows__::${config.id || configIndex}::${row.id}::${sourceKey}::${targetSubGroupId || 'overlay'}`;
            const sourceEntries = mapDataSourceActionEntries(
              coerceDataSourceItemsCollection(sourcePath ? sourceRow?.[sourcePath] : []),
              action
            );
            if (!sourceEntries.length) {
              const emptyMessage = resolveLocalizedString(action.emptyMessage, language, '').trim();
              if (emptyMessage) openInfoOverlay(buttonLabel, emptyMessage);
              return;
            }
            const fieldsOverride = Array.isArray(action?.groupOverride?.fields)
              ? action.groupOverride.fields
              : [];
            const groupOverride: LineItemGroupConfigOverride = {
              ...(action.groupOverride || {}),
              fields: fieldsOverride.length
                ? fieldsOverride.map((field: any) => ({ ...field, readOnly: true }))
                : undefined,
              ui: {
                ...((action.groupOverride as any)?.ui || {}),
                addButtonPlacement: 'hidden',
                hideRemoveColumn: true,
                allowRemoveAutoRows: false,
                showItemPill: false
              }
            };
            setLineItems(prev => ({
              ...prev,
              [overlayKey]: sourceEntries.map((entry, entryIndex) => ({
                id: `${overlayKey}::${entryIndex}`,
                values: {
                  ...entry,
                  [ROW_HIDE_REMOVE_KEY]: true,
                  [ROW_SOURCE_KEY]: ROW_SOURCE_AUTO
                },
                autoGenerated: true
              }))
            }));
            const overlayGroup: WebQuestionDefinition = {
              id: overlayKey,
              type: 'LINE_ITEM_GROUP',
              label: { en: '', fr: '', nl: '' },
              lineItemConfig: {
                fields: Array.isArray(groupOverride.fields) ? groupOverride.fields : [],
                subGroups: [],
                ui: groupOverride.ui || {}
              } as any
            } as WebQuestionDefinition;
            const contextHeaderFieldId = (action.contextHeaderFieldId || '').toString().trim();
            const contextHeader = contextHeaderFieldId
              ? `${resolveVirtualValue(virtualValues, contextHeaderFieldId) ?? ''}`.trim()
              : '';
            openLineItemGroupOverlay(overlayGroup, {
              source: 'user',
              hideInlineSubgroups: true,
              hideCloseButton: false,
              closeButtonLabel: resolveLocalizedString(
                action.closeButtonLabel,
                language,
                tSystem('actions.back', language, 'Back')
              ).trim(),
              label: resolveLocalizedString(action.overlayLabel, language, '').trim() || undefined,
              contextHeader: contextHeader || undefined
            });
          }}
        >
          {buttonLabel}
        </button>
      );
    })
    .filter(Boolean);
  if (!nodes.length) return null;
  return <div style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 8 }}>{nodes}</div>;
};
