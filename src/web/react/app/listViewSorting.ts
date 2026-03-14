import type { ListItem } from '../api';
import type { WebQuestionDefinition } from '../../types';

type SortKey = { fieldId: string; direction: 'asc' | 'desc' };

const parseYmdAsLocalMs = (raw: string): number | null => {
  const match = (raw || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const d = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 0, 0, 0, 0);
  return Number.isNaN(d.getTime()) ? null : d.getTime();
};

const normalizeSortValue = (raw: any, typeHint?: string): { kind: 'num' | 'str'; n: number; s: string } => {
  if (raw === undefined || raw === null || raw === '') return { kind: 'num', n: Number.NEGATIVE_INFINITY, s: '' };
  const t = (typeHint || '').toString().trim().toUpperCase();
  if (t === 'DATE' || t === 'DATETIME') {
    if (raw instanceof Date) return { kind: 'num', n: raw.getTime(), s: '' };
    if (typeof raw === 'number') return { kind: 'num', n: raw, s: '' };
    const str = raw?.toString?.() || '';
    const ymd = parseYmdAsLocalMs(str);
    if (ymd !== null) return { kind: 'num', n: ymd, s: '' };
    const d = new Date(str);
    return !Number.isNaN(d.getTime()) ? { kind: 'num', n: d.getTime(), s: '' } : { kind: 'str', n: 0, s: str.toLowerCase() };
  }
  if (typeof raw === 'number') return { kind: 'num', n: raw, s: '' };
  const str = raw?.toString?.() || '';
  const asNum = Number(str);
  if (str.trim() && Number.isFinite(asNum) && !Number.isNaN(asNum)) {
    return { kind: 'num', n: asNum, s: '' };
  }
  return { kind: 'str', n: 0, s: str.toLowerCase() };
};

const compareNormalized = (a: { kind: 'num' | 'str'; n: number; s: string }, b: { kind: 'num' | 'str'; n: number; s: string }): number => {
  if (a.kind === 'num' && b.kind === 'num') return a.n - b.n;
  if (a.kind === 'str' && b.kind === 'str') return a.s.localeCompare(b.s);
  return a.kind === 'num' ? -1 : 1;
};

const buildEffectiveSorts = (args: {
  sortField: string;
  sortDirection: 'asc' | 'desc';
  questions: WebQuestionDefinition[];
}): SortKey[] => {
  const listViewSorts = (args.questions || [])
    .filter(question => question && question.listViewSort)
    .map(question => {
      const priorityRaw = question.listViewSort?.priority;
      const priority =
        priorityRaw !== undefined && priorityRaw !== null && Number.isFinite(Number(priorityRaw))
          ? Number(priorityRaw)
          : Number.MAX_SAFE_INTEGER;
      return {
        fieldId: (question.id || '').toString().trim(),
        direction: (question.listViewSort?.direction === 'desc' ? 'desc' : 'asc') as 'asc' | 'desc',
        priority
      };
    })
    .filter(entry => Boolean(entry.fieldId))
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return a.fieldId.localeCompare(b.fieldId);
    });

  const out: SortKey[] = [];
  const primaryFieldId = (args.sortField || '').toString().trim();
  if (primaryFieldId) {
    out.push({ fieldId: primaryFieldId, direction: args.sortDirection === 'desc' ? 'desc' : 'asc' });
  }
  listViewSorts.forEach(entry => {
    if (!entry.fieldId) return;
    if (out.some(existing => existing.fieldId === entry.fieldId)) return;
    out.push({ fieldId: entry.fieldId, direction: entry.direction });
  });
  const ensure = (fieldId: string, direction: 'asc' | 'desc') => {
    if (out.some(entry => entry.fieldId === fieldId)) return;
    out.push({ fieldId, direction });
  };
  if (out.length) {
    ensure('updatedAt', 'desc');
    ensure('id', 'asc');
  }
  return out;
};

export const sortListItems = (args: {
  items: ListItem[];
  sortField: string;
  sortDirection: 'asc' | 'desc';
  questions: WebQuestionDefinition[];
  fieldTypeById: Record<string, string>;
}): ListItem[] => {
  const effectiveSorts = buildEffectiveSorts({
    sortField: args.sortField,
    sortDirection: args.sortDirection,
    questions: args.questions
  });
  if (!effectiveSorts.length) return [...args.items];

  const metaSortType = (fieldId: string): string => {
    if (fieldId === 'createdAt' || fieldId === 'updatedAt') return 'DATETIME';
    return (args.fieldTypeById[fieldId] || '').toString();
  };

  return [...args.items].sort((rowA, rowB) => {
    for (const sort of effectiveSorts) {
      const fieldId = (sort.fieldId || '').toString().trim();
      if (!fieldId) continue;
      const dirMul = sort.direction === 'desc' ? -1 : 1;
      const typeHint = metaSortType(fieldId);
      const av = normalizeSortValue((rowA as any)?.[fieldId], typeHint);
      const bv = normalizeSortValue((rowB as any)?.[fieldId], typeHint);
      const compared = compareNormalized(av, bv);
      if (compared !== 0) return compared * dirMul;
    }
    return 0;
  });
};
