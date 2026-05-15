import React, { useEffect, useMemo } from 'react';

import type { LangCode, WebFormDefinition } from '../../../types';
import type { View } from '../../types';
import { buildListViewLegendItems } from '../../app/listViewLegend';
import { AppNoticeStack } from './AppNotices';
import { ListViewLegend } from './ListViewLegend';

export const useAppActionNotices = (args: {
  definition: WebFormDefinition;
  language: LangCode;
  view: View;
  guidedStepsTopSlot: React.ReactNode;
  dedupCheckingNotice: React.ReactNode;
  dedupTopNotice: React.ReactNode;
  validationTopNotice: React.ReactNode;
  precreateDedupChecking: boolean;
  onDiagnostic?: (event: string, payload?: Record<string, unknown>) => void;
}) => {
  const {
    definition,
    language,
    view,
    guidedStepsTopSlot,
    dedupCheckingNotice,
    dedupTopNotice,
    validationTopNotice,
    precreateDedupChecking,
    onDiagnostic
  } = args;

  const topBarNotice =
    guidedStepsTopSlot || dedupCheckingNotice || dedupTopNotice || validationTopNotice ? (
      <AppNoticeStack>
        {guidedStepsTopSlot}
        {dedupCheckingNotice}
        {dedupTopNotice}
        {validationTopNotice}
      </AppNoticeStack>
    ) : null;

  const listLegendItems = useMemo(() => {
    const configuredLegend =
      (Array.isArray(definition.listView?.legend) && definition.listView?.legend.length
        ? definition.listView?.legend
        : ((definition as any)?.listViewLegend as any[] | undefined)) || [];
    return buildListViewLegendItems(configuredLegend as any, language);
  }, [definition, language]);

  const listLegendColumns = useMemo(() => {
    const raw = Number((definition.listView as any)?.legendColumns ?? (definition as any)?.listViewLegendColumns);
    if (!Number.isFinite(raw) || raw <= 1) return 1;
    return Math.max(1, Math.min(2, Math.round(raw)));
  }, [definition]);

  const listLegendColumnWidths = useMemo(() => {
    const raw = (definition.listView as any)?.legendColumnWidths ?? (definition as any)?.listViewLegendColumnWidths;
    if (!Array.isArray(raw) || raw.length < 2) return null;
    const first = Number(raw[0]);
    const second = Number(raw[1]);
    if (!Number.isFinite(first) || !Number.isFinite(second) || first <= 0 || second <= 0) return null;
    const total = first + second;
    if (!(total > 0)) return null;
    const normalizedFirst = Number(((first / total) * 100).toFixed(2));
    const normalizedSecond = Number((100 - normalizedFirst).toFixed(2));
    return [normalizedFirst, normalizedSecond] as [number, number];
  }, [definition]);

  useEffect(() => {
    if (view !== 'list') return;
    if (!listLegendItems.length) return;
    onDiagnostic?.('list.legend.enabled', {
      count: listLegendItems.length,
      icons: listLegendItems.map(i => i.icon).filter(Boolean)
    });
  }, [listLegendItems, onDiagnostic, view]);

  const bottomBarNotice =
    view === 'list' && (listLegendItems.length || precreateDedupChecking) ? (
      <AppNoticeStack>
        {precreateDedupChecking ? dedupCheckingNotice : null}
        {listLegendItems.length ? (
          <ListViewLegend
            items={listLegendItems}
            language={language}
            columns={listLegendColumns}
            columnWidths={listLegendColumnWidths}
            className="ck-list-legend--bottomBar"
          />
        ) : null}
      </AppNoticeStack>
    ) : null;

  return {
    topBarNotice,
    bottomBarNotice,
    listLegendItems,
    listLegendColumns,
    listLegendColumnWidths
  };
};
