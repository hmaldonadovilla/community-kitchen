import {
  FormConfig,
  QuestionConfig,
  ScheduledRecordAlertConfig,
  ScheduledRecordAlertFilterConfig
} from '../../types';
import { formatIsoDateLabel, normalizeToIsoDate } from './followup/utils';
import { resolveLocalizedStringValue } from './followup/recipients';
import { HeaderColumns } from './types';

const normalizeToken = (value: unknown): string => (value === undefined || value === null ? '' : value.toString().trim().toLowerCase());

const toText = (value: unknown): string => (value === undefined || value === null ? '' : value.toString().trim());

const asList = (value: unknown): string[] =>
  (Array.isArray(value) ? value : value === undefined || value === null || value === '' ? [] : [value])
    .map(entry => toText(entry))
    .filter(Boolean);

const normalizePlaceholderKey = (value: string): string =>
  (value || '')
    .toString()
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

const readColumn = (rowValues: any[], oneBasedColumn?: number): any => {
  const index = Number(oneBasedColumn || 0) - 1;
  if (index < 0) return undefined;
  return rowValues[index];
};

const resolveFieldColumn = (columns: HeaderColumns, fieldId?: string): number | undefined => {
  const id = (fieldId || '').toString().trim();
  return id ? Number(columns.fields?.[id] || 0) || undefined : undefined;
};

export const resolveScheduledAlertStatusColumn = (
  form: FormConfig,
  alert: ScheduledRecordAlertConfig,
  columns: HeaderColumns
): number | undefined => {
  const explicitFieldId = (alert.statusFieldId || '').toString().trim();
  if (explicitFieldId && columns.fields?.[explicitFieldId]) {
    return Number(columns.fields[explicitFieldId]) || undefined;
  }
  const followupFieldId = (form.followupConfig?.statusFieldId || '').toString().trim();
  if (followupFieldId && columns.fields?.[followupFieldId]) {
    return Number(columns.fields[followupFieldId]) || undefined;
  }
  return Number(columns.status) || undefined;
};

const filterMatches = (filter: ScheduledRecordAlertFilterConfig, rawValue: any): boolean => {
  const value = normalizeToken(rawValue);
  const equals = asList(filter.equals).map(normalizeToken).filter(Boolean);
  if (equals.length && !equals.includes(value)) return false;
  const notEquals = asList(filter.notEquals).map(normalizeToken).filter(Boolean);
  if (notEquals.length && notEquals.includes(value)) return false;
  return true;
};

export interface ScheduledRecordAlertMatch {
  rowNumber: number;
  recordId: string;
  status: string;
  values: Record<string, any>;
}

export interface ScheduledRecordAlertEvaluation {
  matches: ScheduledRecordAlertMatch[];
  errors: string[];
}

export const findScheduledRecordAlertMatches = (args: {
  alert: ScheduledRecordAlertConfig;
  form: FormConfig;
  rows: any[][];
  columns: HeaderColumns;
  todayIso: string;
}): ScheduledRecordAlertEvaluation => {
  const { alert, form, rows, columns, todayIso } = args;
  const errors: string[] = [];
  const dateCol = resolveFieldColumn(columns, alert.dateFieldId);
  const statusCol = resolveScheduledAlertStatusColumn(form, alert, columns);
  if (!dateCol) errors.push(`missing date column for ${alert.dateFieldId}`);
  if (!statusCol) errors.push(`missing status column${alert.statusFieldId ? ` for ${alert.statusFieldId}` : ''}`);
  const filters = Array.isArray(alert.filters) ? alert.filters : [];
  filters.forEach(filter => {
    if (!resolveFieldColumn(columns, filter.fieldId)) {
      errors.push(`missing filter column for ${filter.fieldId}`);
    }
  });
  if (errors.length) return { matches: [], errors };

  const statusValues = (Array.isArray(alert.statusValues) && alert.statusValues.length ? alert.statusValues : ['Incomplete'])
    .map(normalizeToken)
    .filter(Boolean);
  const fieldIds = new Set<string>([
    alert.dateFieldId,
    alert.statusFieldId || '',
    ...(filters.map(filter => filter.fieldId)),
    ...Object.values(alert.fields || {})
  ].filter(Boolean));

  const matches = rows.reduce<ScheduledRecordAlertMatch[]>((acc, rowValues, index) => {
    const recordDate = normalizeToIsoDate(readColumn(rowValues, dateCol));
    if (!recordDate || recordDate !== todayIso) return acc;
    const status = toText(readColumn(rowValues, statusCol));
    if (statusValues.length && !statusValues.includes(normalizeToken(status))) return acc;
    for (const filter of filters) {
      const col = resolveFieldColumn(columns, filter.fieldId);
      if (!filterMatches(filter, readColumn(rowValues, col))) return acc;
    }
    const values: Record<string, any> = {};
    fieldIds.forEach(fieldId => {
      const col = resolveFieldColumn(columns, fieldId);
      if (col) values[fieldId] = readColumn(rowValues, col);
    });
    acc.push({
      rowNumber: index + 2,
      recordId: toText(readColumn(rowValues, columns.recordId)),
      status,
      values
    });
    return acc;
  }, []);

  return { matches, errors };
};

export const isScheduledRecordAlertDue = (
  alert: ScheduledRecordAlertConfig,
  nowHour: number,
  nowMinute: number
): boolean => {
  if (alert.enabled === false) return false;
  const schedule = alert.schedule;
  if (!schedule) return false;
  const hour = Math.trunc(Number(schedule.hour));
  const minute = Math.trunc(Number(schedule.minute || 0));
  if (!Number.isFinite(hour) || hour < 0 || hour > 23) return false;
  if (!Number.isFinite(minute) || minute < 0 || minute > 59) return false;
  const windowMinutesRaw = Number(schedule.windowMinutes);
  const windowMinutes =
    Number.isFinite(windowMinutesRaw) && windowMinutesRaw >= 0 ? Math.min(1439, Math.trunc(windowMinutesRaw)) : 59 - minute;
  const start = hour * 60 + minute;
  const end = Math.min(1439, start + windowMinutes);
  const now = Math.trunc(Number(nowHour)) * 60 + Math.trunc(Number(nowMinute));
  return now >= start && now <= end;
};

export const collectScheduledRecordAlertTriggerSchedules = (
  forms: FormConfig[]
): Array<{ hour: number; minute: number }> => {
  const schedules = new Map<string, { hour: number; minute: number }>();
  (forms || []).forEach(form => {
    (form.scheduledAlerts || []).forEach(alert => {
      if (!alert || alert.enabled === false || !alert.schedule) return;
      const hour = Math.trunc(Number(alert.schedule.hour));
      const minute = Math.trunc(Number(alert.schedule.minute || 0));
      if (!Number.isFinite(hour) || hour < 0 || hour > 23) return;
      if (!Number.isFinite(minute) || minute < 0 || minute > 59) return;
      schedules.set(`${hour}:${minute}`, { hour, minute });
    });
  });
  return Array.from(schedules.values()).sort((a, b) => a.hour - b.hour || a.minute - b.minute);
};

const buildFieldTypeMap = (questions: QuestionConfig[]): Record<string, string> =>
  (questions || []).reduce<Record<string, string>>((acc, question) => {
    if (question?.id) acc[question.id] = (question.type || '').toString().trim().toUpperCase();
    return acc;
  }, {});

const formatFieldValue = (
  rawValue: any,
  fieldId: string,
  alert: ScheduledRecordAlertConfig,
  fieldTypes: Record<string, string>
): string => {
  const iso = normalizeToIsoDate(rawValue);
  if (iso && (fieldId === alert.dateFieldId || fieldTypes[fieldId] === 'DATE')) {
    return formatIsoDateLabel(iso);
  }
  return toText(rawValue);
};

export const replaceScheduledAlertTokens = (template: string, placeholders: Record<string, string>): string =>
  (template || '').replace(/{{\s*([A-Za-z0-9_]+)\s*}}/g, (_match, token) => {
    const key = normalizePlaceholderKey(token);
    return placeholders[key] ?? '';
  });

export const buildScheduledRecordAlertEmail = (args: {
  alert: ScheduledRecordAlertConfig;
  matches: ScheduledRecordAlertMatch[];
  questions: QuestionConfig[];
  todayIso: string;
}): { subject: string; body: string; htmlBody: string } => {
  const { alert, matches, questions, todayIso } = args;
  const fieldTypes = buildFieldTypeMap(questions);
  const lineTemplate =
    resolveLocalizedStringValue(alert.email.lineTemplate, 'EN') ||
    '- {{RECORD_ID}} is incomplete';

  const lines = matches
    .map(match => {
      const placeholders: Record<string, string> = {
        RECORD_ID: match.recordId,
        STATUS: match.status
      };
      Object.entries(alert.fields || {}).forEach(([token, fieldId]) => {
        const key = normalizePlaceholderKey(token);
        if (!key || !fieldId) return;
        placeholders[key] = formatFieldValue(match.values[fieldId], fieldId, alert, fieldTypes);
        const fieldKey = normalizePlaceholderKey(fieldId);
        if (fieldKey && placeholders[fieldKey] === undefined) placeholders[fieldKey] = placeholders[key];
      });
      return replaceScheduledAlertTokens(lineTemplate, placeholders).trim();
    })
    .filter(Boolean)
    .join('\n');

  const sharedPlaceholders: Record<string, string> = {
    RECORD_COUNT: matches.length.toString(),
    RECORD_LINES: lines,
    TODAY_DATE: formatIsoDateLabel(todayIso)
  };
  const subjectTemplate =
    resolveLocalizedStringValue(alert.email.subject, 'EN') ||
    'Scheduled record alert';
  const messageTemplate =
    resolveLocalizedStringValue(alert.email.message, 'EN') ||
    '{{RECORD_LINES}}';
  const subject = replaceScheduledAlertTokens(subjectTemplate, sharedPlaceholders).trim();
  const body = replaceScheduledAlertTokens(messageTemplate, sharedPlaceholders).trim();
  return {
    subject,
    body,
    htmlBody: (body || '').replace(/\n/g, '<br/>')
  };
};

