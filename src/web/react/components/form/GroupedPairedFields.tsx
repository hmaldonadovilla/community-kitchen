import React from 'react';
import { resolveLocalizedString } from '../../../i18n';
import { LangCode, QuestionGroupConfig } from '../../../types';
import { GroupCard } from './GroupCard';
import { PairedRowGrid } from './PairedRowGrid';
import { PageSection } from './PageSection';
import { buildPageSectionBlocks, resolveGroupSectionKey, resolvePageSectionKey } from './grouping';

export type GroupedPairedFieldsProps = {
  contextPrefix: string;
  fields: any[];
  language: LangCode;
  collapsedGroups: Record<string, boolean>;
  toggleGroupCollapsed: (groupKey: string) => void;
  renderField: (field: any, opts?: { inGrid?: boolean }) => React.ReactNode;
  hasError: (field: any) => boolean;
  isComplete?: (field: any) => boolean;
};

export const GroupedPairedFields: React.FC<GroupedPairedFieldsProps> = ({
  contextPrefix,
  fields,
  language,
  collapsedGroups,
  toggleGroupCollapsed,
  renderField,
  hasError,
  isComplete
}) => {
  if (!fields || !fields.length) return null;

  type Section = {
    key: string;
    title?: string;
    collapsible: boolean;
    defaultCollapsed: boolean;
    pageSectionKey?: string;
    pageSectionTitle?: string;
    pageSectionInfoText?: string;
    pageSectionInfoDisplay?: 'pill' | 'belowTitle' | 'hidden';
    fields: any[];
    order: number;
  };

  const map = new Map<string, Section>();
  let order = 0;

  fields.forEach(field => {
    const group: QuestionGroupConfig | undefined = (field as any)?.group;
    const sectionKey = resolveGroupSectionKey(group);
    const title = group?.title ? resolveLocalizedString(group.title as any, language, '') : undefined;
    const collapsible = group?.collapsible !== undefined ? !!group.collapsible : !!title;
    const defaultCollapsed = group?.defaultCollapsed !== undefined ? !!group.defaultCollapsed : false;
    const pageSectionKey = resolvePageSectionKey(group);
    const pageSectionTitle = group?.pageSection?.title ? resolveLocalizedString(group.pageSection.title as any, language, '') : undefined;
    const pageSectionInfoText =
      group?.pageSection?.infoText ? resolveLocalizedString(group.pageSection.infoText as any, language, '') : undefined;
    const pageSectionInfoDisplayRaw = (group as any)?.pageSection?.infoDisplay;
    const pageSectionInfoDisplay =
      pageSectionInfoDisplayRaw === 'belowTitle' || pageSectionInfoDisplayRaw === 'hidden' || pageSectionInfoDisplayRaw === 'pill'
        ? (pageSectionInfoDisplayRaw as 'pill' | 'belowTitle' | 'hidden')
        : undefined;

    const existing = map.get(sectionKey);
    if (!existing) {
      map.set(sectionKey, {
        key: sectionKey,
        title,
        collapsible,
        defaultCollapsed,
        pageSectionKey,
        pageSectionTitle,
        pageSectionInfoText,
        pageSectionInfoDisplay,
        fields: [field],
        order: order++
      });
    } else {
      existing.fields.push(field);
      if (!existing.title && title) existing.title = title;
      existing.collapsible = existing.collapsible || collapsible;
      existing.defaultCollapsed = existing.defaultCollapsed || defaultCollapsed;
      if (!existing.pageSectionKey && pageSectionKey) existing.pageSectionKey = pageSectionKey;
      if (!existing.pageSectionTitle && pageSectionTitle) existing.pageSectionTitle = pageSectionTitle;
      if (!existing.pageSectionInfoText && pageSectionInfoText) existing.pageSectionInfoText = pageSectionInfoText;
      if (!existing.pageSectionInfoDisplay && pageSectionInfoDisplay) existing.pageSectionInfoDisplay = pageSectionInfoDisplay;
    }
  });

  const sections = Array.from(map.values()).sort((a, b) => a.order - b.order);
  const blocks = buildPageSectionBlocks(sections);

  const isPairable = (field: any): boolean => {
    if (!(field as any)?.pair) return false;
    if (field.type === 'PARAGRAPH') return false;
    return true;
  };

  const buildRows = (sectionFields: any[]): any[][] => {
    const used = new Set<string>();
    const rows: any[][] = [];
    for (let i = 0; i < sectionFields.length; i++) {
      const f = sectionFields[i];
      const id = (f?.id ?? '').toString();
      if (!id || used.has(id)) continue;
      const pairKey = f?.pair ? f.pair.toString() : '';
      if (!pairKey || !isPairable(f)) {
        used.add(id);
        rows.push([f]);
        continue;
      }

      // Group all pairable fields sharing the same pairKey onto the same row where possible.
      const group: any[] = [f];
      for (let j = i + 1; j < sectionFields.length; j++) {
        const cand = sectionFields[j];
        const candId = (cand?.id ?? '').toString();
        if (!candId || used.has(candId)) continue;
        if ((cand?.pair ? cand.pair.toString() : '') === pairKey && isPairable(cand)) {
          group.push(cand);
        }
      }

      group.forEach(g => used.add((g?.id ?? '').toString()));

      // UI constraint: keep rows compact; support 3-up for common "MEAL_TYPE + QTY + FINAL_QTY" patterns.
      const maxPerRow = 3;
      for (let k = 0; k < group.length; k += maxPerRow) {
        rows.push(group.slice(k, k + maxPerRow));
      }
    }
    return rows;
  };

  return (
    <div className="ck-form-sections">
      {blocks.map((block, idx) => {
        const renderSection = (section: Section) => {
        const instanceKey = `${contextPrefix}:${section.key}`;
        const collapsed = section.collapsible ? !!collapsedGroups[instanceKey] : false;
        const sectionHasError = section.fields.some(f => hasError(f));
        // PARAGRAPH is a textarea input in this app, so it should count toward progress like any other field.
        const requiredFields = section.fields.filter(f => !!(f as any)?.required);
        const totalRequired = requiredFields.length;
        const requiredComplete =
          typeof isComplete === 'function'
            ? requiredFields.reduce((acc, f) => (isComplete(f) ? acc + 1 : acc), 0)
            : 0;
        const optionalFields = section.fields.filter(f => !(f as any)?.required);
        const optionalComplete =
          typeof isComplete === 'function' && totalRequired > 0 && requiredComplete >= totalRequired
            ? optionalFields.reduce((acc, f) => (isComplete(f) ? acc + 1 : acc), 0)
            : 0;
        const numerator = requiredComplete + optionalComplete;
        const rows = buildRows(section.fields);

        const body = (
          <div className="ck-form-grid">
            {rows.map(row => {
              if (row.length > 1) {
                const hasDate = row.some((f: any) => (f?.type || '').toString() === 'DATE');
                const colsClass = row.length === 3 ? ' ck-pair-grid--3' : '';
                return (
                  <PairedRowGrid
                    key={row.map((f: any) => (f?.id ?? '').toString()).filter(Boolean).join('__')}
                    className={`ck-pair-grid${colsClass}${hasDate ? ' ck-pair-has-date' : ''}`}
                  >
                    {row.map((f: any) => renderField(f, { inGrid: true }))}
                  </PairedRowGrid>
                );
              }
              return renderField(row[0], { inGrid: false });
            })}
          </div>
        );

        return (
          <GroupCard
            key={instanceKey}
            groupKey={instanceKey}
            title={section.title}
              language={language}
            collapsible={section.collapsible}
            collapsed={collapsed}
            hasError={sectionHasError}
            onToggleCollapsed={section.collapsible ? () => toggleGroupCollapsed(instanceKey) : undefined}
            progress={typeof isComplete === 'function' ? { complete: numerator, total: totalRequired } : null}
          >
            {body}
          </GroupCard>
          );
        };

        if (block.kind === 'group') return renderSection(block.group as any);
        return (
          <PageSection key={`page-section-${block.key}-${idx}`} title={block.title} infoText={block.infoText} infoDisplay={block.infoDisplay}>
            <div className="ck-group-stack ck-group-stack--compact">{block.groups.map(g => renderSection(g as any))}</div>
          </PageSection>
        );
      })}
    </div>
  );
};

