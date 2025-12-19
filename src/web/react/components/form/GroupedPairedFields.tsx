import React from 'react';
import { resolveLocalizedString } from '../../../i18n';
import { LangCode, QuestionGroupConfig } from '../../../types';
import { GroupCard } from './GroupCard';
import { resolveGroupSectionKey } from './grouping';

export type GroupedPairedFieldsProps = {
  contextPrefix: string;
  fields: any[];
  language: LangCode;
  collapsedGroups: Record<string, boolean>;
  toggleGroupCollapsed: (groupKey: string) => void;
  renderField: (field: any) => React.ReactNode;
  hasError: (field: any) => boolean;
};

export const GroupedPairedFields: React.FC<GroupedPairedFieldsProps> = ({
  contextPrefix,
  fields,
  language,
  collapsedGroups,
  toggleGroupCollapsed,
  renderField,
  hasError
}) => {
  if (!fields || !fields.length) return null;

  type Section = {
    key: string;
    title?: string;
    collapsible: boolean;
    defaultCollapsed: boolean;
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

    const existing = map.get(sectionKey);
    if (!existing) {
      map.set(sectionKey, {
        key: sectionKey,
        title,
        collapsible,
        defaultCollapsed,
        fields: [field],
        order: order++
      });
    } else {
      existing.fields.push(field);
      if (!existing.title && title) existing.title = title;
      existing.collapsible = existing.collapsible || collapsible;
      existing.defaultCollapsed = existing.defaultCollapsed || defaultCollapsed;
    }
  });

  const sections = Array.from(map.values()).sort((a, b) => a.order - b.order);

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
      let match: any | null = null;
      for (let j = i + 1; j < sectionFields.length; j++) {
        const cand = sectionFields[j];
        const candId = (cand?.id ?? '').toString();
        if (!candId || used.has(candId)) continue;
        if ((cand?.pair ? cand.pair.toString() : '') === pairKey && isPairable(cand)) {
          match = cand;
          break;
        }
      }
      if (match) {
        used.add(id);
        used.add((match.id ?? '').toString());
        rows.push([f, match]);
      } else {
        used.add(id);
        rows.push([f]);
      }
    }
    return rows;
  };

  return (
    <div className="ck-form-sections" style={{ gap: 12 }}>
      {sections.map(section => {
        const instanceKey = `${contextPrefix}:${section.key}`;
        const collapsed = section.collapsible ? !!collapsedGroups[instanceKey] : false;
        const sectionHasError = section.fields.some(f => hasError(f));
        const rows = buildRows(section.fields);

        const body = (
          <div className="ck-form-grid">
            {rows.map(row => {
              if (row.length === 2) {
                return (
                  <div key={`${row[0].id}__${row[1].id}`} className="ck-pair-grid">
                    {renderField(row[0])}
                    {renderField(row[1])}
                  </div>
                );
              }
              return renderField(row[0]);
            })}
          </div>
        );

        return (
          <GroupCard
            key={instanceKey}
            groupKey={instanceKey}
            title={section.title}
            collapsible={section.collapsible}
            collapsed={collapsed}
            hasError={sectionHasError}
            onToggleCollapsed={section.collapsible ? () => toggleGroupCollapsed(instanceKey) : undefined}
          >
            {body}
          </GroupCard>
        );
      })}
    </div>
  );
};


