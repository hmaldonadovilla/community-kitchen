import { resolveLocalizedString } from '../../../i18n';
import { LangCode, QuestionGroupConfig, WebQuestionDefinition } from '../../../types';

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

export type FormGroupSection = PageSectionCapable & {
  key: string;
  title?: string;
  collapsible: boolean;
  defaultCollapsed: boolean;
  isHeader: boolean;
  questions: WebQuestionDefinition[];
  order: number;
};

/**
 * Builds render-ready form group sections from question configuration. This is pure
 * form layout logic; component state, DOM behavior, and validation remain in FormView.
 */
export const buildFormGroupSections = (
  questions: WebQuestionDefinition[] | undefined,
  language: LangCode
): FormGroupSection[] => {
  const map = new Map<string, FormGroupSection>();
  let order = 0;

  (questions || []).forEach(q => {
    const legacyHeader = !!(q as any).header;
    const group: QuestionGroupConfig | undefined =
      (q as any).group ||
      (legacyHeader
        ? {
            header: true,
            title: { en: 'Header', fr: 'Header', nl: 'Header' },
            collapsible: true
          }
        : undefined);

    const isHeader = !!group?.header;
    const key = resolveGroupSectionKey(group);
    const title = group?.title ? resolveLocalizedString(group.title as any, language, isHeader ? 'Header' : '') : undefined;
    const collapsible = group?.collapsible !== undefined ? !!group.collapsible : !!title;
    const defaultCollapsed = group?.defaultCollapsed !== undefined ? !!group.defaultCollapsed : false;
    const pageSectionKey = !isHeader ? resolvePageSectionKey(group) : '__none__';
    const pageSectionTitle =
      !isHeader && group?.pageSection?.title ? resolveLocalizedString(group.pageSection.title as any, language, '') : undefined;
    const pageSectionInfoText =
      !isHeader && group?.pageSection?.infoText ? resolveLocalizedString(group.pageSection.infoText as any, language, '') : undefined;
    const pageSectionInfoDisplayRaw = !isHeader ? (group as any)?.pageSection?.infoDisplay : undefined;
    const pageSectionInfoDisplay =
      pageSectionInfoDisplayRaw === 'belowTitle' || pageSectionInfoDisplayRaw === 'hidden' || pageSectionInfoDisplayRaw === 'pill'
        ? (pageSectionInfoDisplayRaw as 'pill' | 'belowTitle' | 'hidden')
        : undefined;

    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        key,
        title,
        collapsible,
        defaultCollapsed,
        isHeader,
        pageSectionKey,
        pageSectionTitle,
        pageSectionInfoText,
        pageSectionInfoDisplay,
        questions: [q],
        order: order++
      });
      return;
    }

    existing.questions.push(q);
    if (!existing.title && title) existing.title = title;
    existing.isHeader = existing.isHeader || isHeader;
    existing.collapsible = existing.collapsible || collapsible;
    existing.defaultCollapsed = existing.defaultCollapsed || defaultCollapsed;
    if (!existing.pageSectionKey && pageSectionKey) existing.pageSectionKey = pageSectionKey;
    if (!existing.pageSectionTitle && pageSectionTitle) existing.pageSectionTitle = pageSectionTitle;
    if (!existing.pageSectionInfoText && pageSectionInfoText) existing.pageSectionInfoText = pageSectionInfoText;
    if (!existing.pageSectionInfoDisplay && pageSectionInfoDisplay) existing.pageSectionInfoDisplay = pageSectionInfoDisplay;
  });

  return Array.from(map.values()).sort((a, b) => {
    if (a.isHeader !== b.isHeader) return a.isHeader ? -1 : 1;
    return a.order - b.order;
  });
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

