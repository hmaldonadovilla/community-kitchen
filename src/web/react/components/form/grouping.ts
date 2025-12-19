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



