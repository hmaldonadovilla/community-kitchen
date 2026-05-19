import type { WebFormDefinition, WebQuestionDefinition } from '../../types';

const normalizeId = (value: unknown): string => {
  if (value === undefined || value === null) return '';
  return value.toString().trim();
};

const collectFieldIdsForDataSource = (question: WebQuestionDefinition | any, dataSourceId: string, out: Set<string>): void => {
  if (!question || typeof question !== 'object') return;
  const fieldId = normalizeId(question.id);
  const sourceId = normalizeId(question.dataSource?.id || question.dataSourceId);
  if (fieldId && sourceId === dataSourceId) out.add(fieldId);

  const config = question.lineItemConfig && typeof question.lineItemConfig === 'object' ? question.lineItemConfig : null;
  const fields = Array.isArray(config?.fields) ? config.fields : [];
  fields.forEach((field: any) => collectFieldIdsForDataSource(field, dataSourceId, out));

  const subGroups = Array.isArray(config?.subGroups) ? config.subGroups : [];
  subGroups.forEach((subGroup: any) => {
    const subFields = Array.isArray(subGroup?.fields) ? subGroup.fields : [];
    subFields.forEach((field: any) => collectFieldIdsForDataSource(field, dataSourceId, out));
  });
};

const optionStateKeyMatchesFieldId = (key: string, fieldId: string): boolean => key === fieldId || key.endsWith(`.${fieldId}`);

export const pruneOptionStateForDataSource = <T extends Record<string, any>>(args: {
  definition: WebFormDefinition;
  state: T;
  dataSourceId: string;
}): { state: T; removedKeys: string[] } => {
  const dataSourceId = normalizeId(args.dataSourceId);
  if (!dataSourceId) return { state: args.state, removedKeys: [] };
  const fieldIds = new Set<string>();
  (args.definition.questions || []).forEach(question => collectFieldIdsForDataSource(question, dataSourceId, fieldIds));
  if (!fieldIds.size) return { state: args.state, removedKeys: [] };

  const removedKeys: string[] = [];
  const next: Record<string, any> = {};
  Object.entries(args.state || {}).forEach(([key, value]) => {
    const shouldRemove = Array.from(fieldIds).some(fieldId => optionStateKeyMatchesFieldId(key, fieldId));
    if (shouldRemove) {
      removedKeys.push(key);
      return;
    }
    next[key] = value;
  });

  return removedKeys.length ? { state: next as T, removedKeys } : { state: args.state, removedKeys: [] };
};

export const shouldClearOptionStateAfterDataSourceCacheClear = (event: Event): boolean => {
  const detail = ((event as CustomEvent)?.detail || {}) as { includePersisted?: unknown };
  return detail.includePersisted !== false;
};
