import React from 'react';

import type { WebQuestionDefinition } from '../../../../types';
import { PairedRowGrid } from '../../../components/form/PairedRowGrid';

type TargetItem =
  | { type: 'question'; q: WebQuestionDefinition; key: string }
  | { type: 'node'; node: React.ReactNode; key: string };

const isPairableGuidedQuestion = (q: WebQuestionDefinition): boolean => {
  if (!q.pair) return false;
  if (q.type === 'LINE_ITEM_GROUP') return false;
  if (q.type === 'PARAGRAPH') return false;
  return true;
};

/**
 * Owner: guided steps UI.
 * Groups pairable question targets into row grids while delegating all
 * question/line-group rendering back to FormView.
 */
export const renderGuidedTargetsWithPairing = (args: {
  targets: any[];
  keyPrefix: string;
  resolveTargetQuestion: (target: any) => WebQuestionDefinition | null;
  renderTarget: (target: any, keyPrefix: string) => React.ReactNode;
  renderQuestion: (q: WebQuestionDefinition, opts?: { inGrid?: boolean }) => React.ReactNode;
  isQuestionVisible: (q: WebQuestionDefinition) => boolean;
}): React.ReactNode[] => {
  const { targets, keyPrefix, resolveTargetQuestion, renderTarget, renderQuestion, isQuestionVisible } = args;
  const items = targets
    .map((target, idx): TargetItem | null => {
      if (!target || typeof target !== 'object') return null;
      const kind = (target.kind || '').toString().trim();
      const id = (target.id || '').toString().trim();
      if (!kind || !id) return null;
      if (kind === 'question') {
        const q = resolveTargetQuestion(target);
        if (!q) return null;
        if (!isQuestionVisible(q)) return null;
        return { type: 'question', q, key: `${keyPrefix}:q:${q.id}:${idx}` };
      }
      const node = renderTarget(target, `${keyPrefix}:${idx}`);
      if (!node) return null;
      return { type: 'node', node, key: `${keyPrefix}:node:${id}:${idx}` };
    })
    .filter(Boolean) as TargetItem[];

  const used = new Set<string>();
  const rows: React.ReactNode[] = [];

  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    if (item.type === 'node') {
      rows.push(<React.Fragment key={item.key}>{item.node}</React.Fragment>);
      continue;
    }
    if (used.has(item.key)) continue;
    const pairKey = item.q.pair ? item.q.pair.toString() : '';
    if (!pairKey || !isPairableGuidedQuestion(item.q)) {
      used.add(item.key);
      rows.push(<React.Fragment key={item.key}>{renderQuestion(item.q)}</React.Fragment>);
      continue;
    }
    const group: Array<TargetItem & { type: 'question' }> = [item];
    for (let j = i + 1; j < items.length; j += 1) {
      const cand = items[j];
      if (cand.type !== 'question') continue;
      if (used.has(cand.key)) continue;
      if ((cand.q.pair ? cand.q.pair.toString() : '') === pairKey && isPairableGuidedQuestion(cand.q)) {
        group.push(cand);
      }
    }
    group.forEach(entry => used.add(entry.key));
    const maxPerRow = 3;
    for (let k = 0; k < group.length; k += maxPerRow) {
      const slice = group.slice(k, k + maxPerRow);
      if (slice.length === 1) {
        rows.push(<React.Fragment key={`${item.key}:${k}`}>{renderQuestion(slice[0].q)}</React.Fragment>);
        continue;
      }
      const hasDate = slice.some(entry => entry.q.type === 'DATE');
      const colsClass = slice.length === 3 ? ' ck-pair-grid--3' : '';
      rows.push(
        <PairedRowGrid key={`${item.key}:${k}`} className={`ck-pair-grid${colsClass}${hasDate ? ' ck-pair-has-date' : ''}`}>
          {slice.map(entry => (
            <React.Fragment key={entry.key}>{renderQuestion(entry.q, { inGrid: true })}</React.Fragment>
          ))}
        </PairedRowGrid>
      );
    }
  }

  return rows;
};
