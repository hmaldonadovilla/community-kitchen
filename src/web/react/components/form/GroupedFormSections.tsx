import React from 'react';

import type { LangCode, VisibilityContext, WebQuestionDefinition } from '../../../types';
import { tSystem } from '../../../systemStrings';
import { shouldHideField } from '../../../core';
import type { FormErrors } from '../../types';
import { CheckIcon } from './ui';
import { PairedRowGrid } from './PairedRowGrid';
import { PageSection } from './PageSection';
import type { PageSectionCapable, PageSectionRenderBlock } from './grouping';

/**
 * Owner: form renderer.
 * Renders the non-guided grouped form sections. It receives precomputed group
 * blocks and render callbacks from FormView and must not own form mutation,
 * transport, or validation side effects.
 */

export type GroupedFormSection = PageSectionCapable & {
  key: string;
  title?: string;
  collapsible: boolean;
  questions: WebQuestionDefinition[];
};

export type GroupedFormSectionProgress = {
  key: string;
  totalRequired: number;
  requiredComplete: number;
  complete?: boolean;
};

export const GroupedFormSections: React.FC<{
  blocks: PageSectionRenderBlock<GroupedFormSection>[];
  topVisibilityCtx: VisibilityContext;
  collapsedGroups: Record<string, boolean>;
  errors: FormErrors;
  topLevelGroupProgress: GroupedFormSectionProgress[];
  language: LangCode;
  onToggleGroupCollapsed: (groupKey: string) => void;
  renderQuestion: (q: WebQuestionDefinition, renderOpts?: { inGrid?: boolean }) => React.ReactNode;
}> = ({
  blocks,
  topVisibilityCtx,
  collapsedGroups,
  errors,
  topLevelGroupProgress,
  language,
  onToggleGroupCollapsed,
  renderQuestion
}) => {
  const renderGroupSection = (section: GroupedFormSection): React.ReactNode => {
    const visible = (section.questions || []).filter(q => !shouldHideField(q.visibility, topVisibilityCtx));
    if (!visible.length) return null;

    const isCollapsed = section.collapsible ? !!collapsedGroups[section.key] : false;

    const sectionHasError = (() => {
      const keys = Object.keys(errors || {});
      if (!keys.length) return false;
      for (const q of section.questions) {
        if (keys.includes(q.id)) return true;
        const prefix1 = `${q.id}__`;
        const prefix2 = `${q.id}::`;
        if (keys.some(k => k.startsWith(prefix1) || k.startsWith(prefix2))) return true;
      }
      return false;
    })();

    const groupProgress = topLevelGroupProgress.find(g => g.key === section.key);
    const totalRequired = groupProgress?.totalRequired ?? 0;
    const requiredComplete = groupProgress?.requiredComplete ?? 0;
    let requiredProgressClass =
      totalRequired > 0
        ? requiredComplete >= totalRequired
          ? 'ck-progress-good'
          : 'ck-progress-bad'
        : 'ck-progress-neutral';
    if (sectionHasError) requiredProgressClass = 'ck-progress-bad';
    const tapExpandLabel = tSystem('common.tapToExpand', language, 'Tap to expand');
    const tapCollapseLabel = tSystem('common.tapToCollapse', language, 'Tap to collapse');
    const pillActionLabel = isCollapsed ? tapExpandLabel : tapCollapseLabel;

    const isPairable = (q: WebQuestionDefinition): boolean => {
      if (!q.pair) return false;
      if (q.type === 'LINE_ITEM_GROUP') return false;
      if (q.type === 'PARAGRAPH') return false;
      if (q.type === 'BUTTON') return false;
      return true;
    };

    const used = new Set<string>();
    const rows: WebQuestionDefinition[][] = [];
    for (let i = 0; i < visible.length; i += 1) {
      const q = visible[i];
      if (used.has(q.id)) continue;
      const pairKey = q.pair ? q.pair.toString() : '';
      if (!pairKey || !isPairable(q)) {
        used.add(q.id);
        rows.push([q]);
        continue;
      }

      const group: WebQuestionDefinition[] = [q];
      for (let j = i + 1; j < visible.length; j += 1) {
        const cand = visible[j];
        if (used.has(cand.id)) continue;
        if ((cand.pair ? cand.pair.toString() : '') === pairKey && isPairable(cand)) {
          group.push(cand);
        }
      }

      group.forEach(it => used.add(it.id));
      const maxPerRow = 3;
      for (let k = 0; k < group.length; k += maxPerRow) {
        rows.push(group.slice(k, k + maxPerRow));
      }
    }

    return (
      <div
        key={section.key}
        className="card form-card ck-group-card"
        data-group-key={section.key}
        data-has-error={sectionHasError ? 'true' : undefined}
      >
        {section.title ? (
          section.collapsible ? (
            <button
              type="button"
              className="ck-group-header ck-group-header--clickable"
              onClick={() => onToggleGroupCollapsed(section.key)}
              aria-expanded={!isCollapsed}
              aria-label={`${pillActionLabel} section ${section.title}`}
            >
              <div className="ck-group-title">{section.title}</div>
              <span
                className={`ck-progress-pill ck-progress-pill--primary ${requiredProgressClass}`}
                title={pillActionLabel}
                aria-hidden="true"
              >
                {requiredProgressClass === 'ck-progress-good' ? (
                  <CheckIcon style={{ width: '1.05em', height: '1.05em' }} />
                ) : null}
                <span className="ck-progress-label">{pillActionLabel}</span>
                <span className="ck-progress-caret">{isCollapsed ? '▸' : '▾'}</span>
              </span>
            </button>
          ) : (
            <div className="ck-group-header">
              <div className="ck-group-title">{section.title}</div>
            </div>
          )
        ) : null}

        {!isCollapsed && (
          <div className="ck-group-body">
            <div className="ck-form-grid">
              {rows.map(row => {
                if (row.length > 1) {
                  const hasDate = row.some(q => q.type === 'DATE');
                  const colsClass = row.length === 3 ? ' ck-pair-grid--3' : '';
                  return (
                    <PairedRowGrid
                      key={row.map(q => q.id).join('__')}
                      className={`ck-pair-grid${colsClass}${hasDate ? ' ck-pair-has-date' : ''}`}
                    >
                      {row.map(q => renderQuestion(q, { inGrid: true }))}
                    </PairedRowGrid>
                  );
                }
                return renderQuestion(row[0], { inGrid: false });
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      {blocks.map((block, idx) => {
        if (block.kind === 'group') return renderGroupSection(block.group);

        const rendered = (block.groups || []).map(g => renderGroupSection(g)).filter(Boolean) as React.ReactNode[];
        if (!rendered.length) return null;

        return (
          <PageSection
            key={`page-section-${block.key}-${idx}`}
            title={block.title}
            infoText={block.infoText}
            infoDisplay={block.infoDisplay}
          >
            <div className="ck-group-stack">{rendered}</div>
          </PageSection>
        );
      })}
    </>
  );
};
