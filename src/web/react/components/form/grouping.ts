import { QuestionGroupConfig } from '../../../types';

export const resolveGroupSectionKey = (group?: QuestionGroupConfig): string => {
  if (!group) return '__default__';
  if (group.id) return group.id.toString();
  if (group.header) return '__header__';
  const rawTitle: any = (group as any).title;
  if (typeof rawTitle === 'string') {
    const t = rawTitle.trim();
    if (t) return `title:${t}`;
  }
  if (rawTitle && typeof rawTitle === 'object') {
    const t = (rawTitle.en || rawTitle.fr || rawTitle.nl || '').toString().trim();
    if (t) return `title:${t}`;
  }
  return '__default__';
};

export const resolvePageSectionKey = (group?: QuestionGroupConfig): string => {
  if (!group) return '__none__';
  // Header groups are already special-cased (rendered first); keep them out of visual page sections.
  if (group.header) return '__none__';
  const ps: any = (group as any).pageSection;
  if (!ps) return '__none__';
  if (ps.id !== undefined && ps.id !== null) {
    const id = ps.id.toString().trim();
    if (id) return `id:${id}`;
  }
  const rawTitle: any = ps.title;
  if (typeof rawTitle === 'string') {
    const t = rawTitle.trim();
    if (t) return `title:${t}`;
  }
  if (rawTitle && typeof rawTitle === 'object') {
    const t = (rawTitle.en || rawTitle.fr || rawTitle.nl || '').toString().trim();
    if (t) return `title:${t}`;
  }
  return '__none__';
};

export type PageSectionCapable = {
  isHeader?: boolean;
  pageSectionKey?: string;
  pageSectionTitle?: string;
  pageSectionInfoText?: string;
  pageSectionInfoDisplay?: 'pill' | 'belowTitle' | 'hidden';
};

export type PageSectionRenderBlock<T extends PageSectionCapable> =
  | { kind: 'group'; group: T }
  | { kind: 'pageSection'; key: string; title?: string; infoText?: string; infoDisplay?: 'pill' | 'belowTitle' | 'hidden'; groups: T[] };

/**
 * Groups consecutive group cards into a visual "page section" wrapper (edit view only),
 * while preserving overall order (no reordering across unrelated groups).
 */
export const buildPageSectionBlocks = <T extends PageSectionCapable>(groups: T[]): PageSectionRenderBlock<T>[] => {
  const blocks: PageSectionRenderBlock<T>[] = [];
  let current: { key: string; title?: string; infoText?: string; infoDisplay?: 'pill' | 'belowTitle' | 'hidden'; groups: T[] } | null =
    null;

  const flush = () => {
    if (!current) return;
    blocks.push({
      kind: 'pageSection',
      key: current.key,
      title: current.title,
      infoText: current.infoText,
      infoDisplay: current.infoDisplay,
      groups: current.groups
    });
    current = null;
  };

  (groups || []).forEach(group => {
    const key = (group.pageSectionKey || '').toString();
    const isHeader = !!group.isHeader;
    const isNone = !key || key === '__none__';

    if (isHeader || isNone) {
      flush();
      blocks.push({ kind: 'group', group });
      return;
    }

    if (!current || current.key !== key) {
      flush();
      current = {
        key,
        title: group.pageSectionTitle,
        infoText: group.pageSectionInfoText,
        infoDisplay: group.pageSectionInfoDisplay,
        groups: [group]
      };
      return;
    }

    current.groups.push(group);
    if (!current.title && group.pageSectionTitle) current.title = group.pageSectionTitle;
    if (!current.infoText && group.pageSectionInfoText) current.infoText = group.pageSectionInfoText;
    if (!current.infoDisplay && group.pageSectionInfoDisplay) current.infoDisplay = group.pageSectionInfoDisplay;
  });

  flush();
  return blocks;
};


