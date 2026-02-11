import type { ListViewMetricConfig, ListViewRuleWhen } from '../../types';
import type { ListItem } from '../api';
import { matchesListViewRuleWhen } from './listViewRuleColumns';

const extractWhenFieldIds = (when: ListViewRuleWhen | undefined, out: Set<string>): void => {
  if (!when) return;
  if (Array.isArray(when)) {
    when.forEach(entry => extractWhenFieldIds(entry as any, out));
    return;
  }
  if (typeof when !== 'object') return;
  if (Array.isArray((when as any).all)) {
    ((when as any).all as any[]).forEach(entry => extractWhenFieldIds(entry as any, out));
    return;
  }
  if (Array.isArray((when as any).any)) {
    ((when as any).any as any[]).forEach(entry => extractWhenFieldIds(entry as any, out));
    return;
  }
  const fieldId = (when as any).fieldId !== undefined && (when as any).fieldId !== null ? (when as any).fieldId.toString().trim() : '';
  if (!fieldId) return;
  out.add(fieldId);
};

const parseLineItemRows = (raw: any): Record<string, any>[] => {
  if (Array.isArray(raw)) {
    return raw.filter(entry => entry && typeof entry === 'object') as Record<string, any>[];
  }
  if (typeof raw !== 'string') return [];
  const text = raw.trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(entry => entry && typeof entry === 'object') as Record<string, any>[];
  } catch (_) {
    return [];
  }
};

const readLineItemValue = (row: Record<string, any>, fieldId: string): any => {
  if (!row || typeof row !== 'object') return undefined;
  if ((row as any)[fieldId] !== undefined) return (row as any)[fieldId];
  const values = (row as any).values;
  if (values && typeof values === 'object') return values[fieldId];
  return undefined;
};

const toNumber = (raw: any): number | null => {
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw === 'boolean') return raw ? 1 : 0;
  const text = raw.toString().trim();
  if (!text) return null;
  const compact = text.replace(/\s+/g, '');
  const direct = Number(compact);
  if (Number.isFinite(direct)) return direct;
  if (compact.includes('.') && compact.includes(',')) {
    // Handle "1,234.56" style values.
    const withoutThousands = compact.replace(/,/g, '');
    const n = Number(withoutThousands);
    if (Number.isFinite(n)) return n;
  }
  if (compact.includes(',') && !compact.includes('.')) {
    // Handle "12,5" style decimal values.
    const n = Number(compact.replace(/,/g, '.'));
    if (Number.isFinite(n)) return n;
  }
  return null;
};

export const collectListViewMetricDependencies = (metric: ListViewMetricConfig | undefined): string[] => {
  if (!metric) return [];
  const deps = new Set<string>();
  const groupId = (metric.groupId || '').toString().trim();
  if (groupId) deps.add(groupId);
  extractWhenFieldIds(metric.when, deps);
  return Array.from(deps);
};

export const computeListViewMetricValue = (
  items: ListItem[],
  metric: ListViewMetricConfig | undefined,
  now: Date = new Date()
): { value: number; matchedRecords: number; matchedLineItems: number } => {
  if (!metric) return { value: 0, matchedRecords: 0, matchedLineItems: 0 };
  const groupId = (metric.groupId || '').toString().trim();
  const fieldId = (metric.fieldId || '').toString().trim();
  if (!groupId || !fieldId) return { value: 0, matchedRecords: 0, matchedLineItems: 0 };

  let value = 0;
  let matchedRecords = 0;
  let matchedLineItems = 0;

  (items || []).forEach(item => {
    const row = (item || {}) as Record<string, any>;
    if (!matchesListViewRuleWhen(metric.when, row, now)) return;
    matchedRecords += 1;
    const rows = parseLineItemRows((row as any)[groupId]);
    rows.forEach(lineItem => {
      const n = toNumber(readLineItemValue(lineItem, fieldId));
      if (n === null) return;
      value += n;
      matchedLineItems += 1;
    });
  });

  return { value, matchedRecords, matchedLineItems };
};
