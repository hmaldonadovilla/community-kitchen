import { FollowupActionResult, StepGeneratedRecordsDialogConfig, StepMilestoneActionConfig, SubmitEffectGeneratedRecord, WhenClause } from '../../../../../types';
import { matchesWhenClause } from '../../../../../web/rules/visibility';
import { VisibilityContext } from '../../../../../web/types';

const trimLower = (value: unknown): string => (value === undefined || value === null ? '' : value.toString().trim().toLowerCase());
const toText = (value: unknown): string => (value === undefined || value === null ? '' : value.toString().trim());
const EN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const selectMilestoneConfirmationDialog = (args: {
  action: StepMilestoneActionConfig;
  ctx: VisibilityContext;
  now?: Date;
}) => {
  return selectConditionalDialog({
    cases: args.action.confirmationDialogCases,
    fallback: args.action.confirmationDialog,
    ctx: args.ctx,
    now: args.now
  });
};

export const selectMilestoneProgressDialog = (args: {
  action: StepMilestoneActionConfig;
  ctx: VisibilityContext;
  now?: Date;
}) => {
  return selectConditionalDialog({
    cases: args.action.progressDialogCases,
    fallback: args.action.progressDialog,
    ctx: args.ctx,
    now: args.now
  });
};

export const selectConditionalDialog = (args: {
  cases:
    | Array<{
        when?: WhenClause;
        dialog?: any;
      }>
    | undefined;
  fallback?: any;
  ctx: VisibilityContext;
  now?: Date;
}) => {
  const cases = Array.isArray(args.cases) ? args.cases : [];
  for (const entry of cases) {
    const when = entry?.when as WhenClause | undefined;
    if (!entry?.dialog) continue;
    if (!when || matchesWhenClause(when, args.ctx, { now: args.now })) {
      return entry.dialog;
    }
  }
  return args.fallback;
};

export const getGeneratedRecordsFromFollowupResult = (result: FollowupActionResult | null | undefined): SubmitEffectGeneratedRecord[] => {
  const raw = Array.isArray(result?.submitEffects?.generatedRecords) ? result?.submitEffects?.generatedRecords : [];
  return raw.filter(
    (entry): entry is SubmitEffectGeneratedRecord =>
      Boolean(entry && typeof entry === 'object' && entry.recordId && entry.targetFormKey)
  );
};

export const GENERATED_SUBMIT_EFFECT_RECORDS_FIELD = '__CK_GENERATED_SUBMIT_EFFECT_RECORDS_JSON';

export const buildGeneratedSubmitEffectRecordsTemplateJson = (
  records: SubmitEffectGeneratedRecord[] | null | undefined
): string => {
  const byTargetFormKey: Record<string, SubmitEffectGeneratedRecord[]> = {};
  (Array.isArray(records) ? records : [])
    .filter(
      (entry): entry is SubmitEffectGeneratedRecord =>
        Boolean(entry && typeof entry === 'object' && entry.recordId && entry.targetFormKey)
    )
    .forEach(entry => {
      const targetFormKey = (entry.targetFormKey || '').toString().trim();
      if (!targetFormKey) return;
      byTargetFormKey[targetFormKey] = [
        ...(byTargetFormKey[targetFormKey] || []),
        {
          effectId: entry.effectId,
          targetFormKey,
          recordId: entry.recordId,
          values: entry.values && typeof entry.values === 'object' ? { ...entry.values } : {}
        }
      ];
    });
  if (!Object.keys(byTargetFormKey).length) return '';
  return JSON.stringify({ byTargetFormKey });
};

export const mergeGeneratedSubmitEffectRecordsIntoValues = (
  values: Record<string, any>,
  records: SubmitEffectGeneratedRecord[] | null | undefined
): Record<string, any> => {
  const json = buildGeneratedSubmitEffectRecordsTemplateJson(records);
  if (!json) return values;
  if ((values || {})[GENERATED_SUBMIT_EFFECT_RECORDS_FIELD] === json) return values;
  return {
    ...(values || {}),
    [GENERATED_SUBMIT_EFFECT_RECORDS_FIELD]: json
  };
};

export const filterGeneratedRecordsForDialog = (args: {
  config: StepGeneratedRecordsDialogConfig | undefined;
  records: SubmitEffectGeneratedRecord[];
}): SubmitEffectGeneratedRecord[] => {
  const records = Array.isArray(args.records) ? args.records : [];
  const config = args.config;
  if (!config) return [];
  const effectIds = new Set(
    (Array.isArray(config.submitEffectIds) ? config.submitEffectIds : [])
      .map(value => (value || '').toString().trim())
      .filter(Boolean)
  );
  const targetFormKey = (config.targetFormKey || '').toString().trim();
  return records.filter(record => {
    if (effectIds.size > 0 && !effectIds.has((record.effectId || '').toString().trim())) return false;
    if (targetFormKey && (record.targetFormKey || '').toString().trim() !== targetFormKey) return false;
    return true;
  });
};

const resolveRecordToken = (record: SubmitEffectGeneratedRecord, path: string): string => {
  const trimmed = (path || '').toString().trim();
  if (!trimmed) return '';
  const values = record.values && typeof record.values === 'object' ? record.values : {};
  if (trimmed === 'id' || trimLower(trimmed) === 'record.id') return record.recordId || '';
  if (trimmed === 'recordId') return record.recordId || '';
  if (trimmed === 'effectId') return record.effectId || '';
  if (trimmed === 'targetFormKey') return record.targetFormKey || '';
  if (Object.prototype.hasOwnProperty.call(record, trimmed)) {
    const direct = (record as Record<string, any>)[trimmed];
    return direct === undefined || direct === null ? '' : direct.toString();
  }
  if (Object.prototype.hasOwnProperty.call(values, trimmed)) {
    const value = (values as Record<string, any>)[trimmed];
    return value === undefined || value === null ? '' : value.toString();
  }
  return '';
};

const resolveTemplateLiteral = (value: string): string | null => {
  const trimmed = (value || '').toString().trim();
  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length >= 2) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length >= 2)
  ) {
    return trimmed.slice(1, -1);
  }
  return null;
};

const resolveTemplateExpressionValue = (record: SubmitEffectGeneratedRecord, expression: string): string => {
  const literal = resolveTemplateLiteral(expression);
  if (literal !== null) return literal;
  return resolveRecordToken(record, expression);
};

const parseTemplateDateParts = (
  raw: string
):
  | {
      year: number;
      month: number;
      day: number;
    }
  | null => {
  const value = toText(raw);
  if (!value) return null;

  const alreadyFormatted = value.match(/^(\d{2})-([A-Za-z]{3})-(\d{4})$/);
  if (alreadyFormatted) {
    const month = EN_MONTHS.findIndex(label => label.toLowerCase() === alreadyFormatted[2].toLowerCase());
    if (month >= 0) {
      return {
        day: Number(alreadyFormatted[1]),
        month: month + 1,
        year: Number(alreadyFormatted[3])
      };
    }
  }

  const ymd = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T)/);
  if (ymd) {
    return {
      year: Number(ymd[1]),
      month: Number(ymd[2]),
      day: Number(ymd[3])
    };
  }

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return null;
  const date = new Date(parsed);
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate()
  };
};

const formatTemplateDate = (raw: string, pattern: string): string => {
  const value = toText(raw);
  if (!value) return '';
  const parts = parseTemplateDateParts(value);
  if (!parts) return value;
  const replacements: Record<string, string> = {
    yyyy: parts.year.toString().padStart(4, '0'),
    MMM: EN_MONTHS[parts.month - 1] || '',
    MM: parts.month.toString().padStart(2, '0'),
    M: parts.month.toString(),
    dd: parts.day.toString().padStart(2, '0'),
    d: parts.day.toString()
  };
  return (pattern || 'yyyy-MM-dd').replace(/yyyy|MMM|MM|M|dd|d/g, token => replacements[token] || token);
};

const applyGeneratedRecordFormatter = (args: {
  record: SubmitEffectGeneratedRecord;
  value: string;
  formatter: string;
}): string => {
  const raw = (args.formatter || '').toString();
  const [nameRaw, ...rawArgs] = raw.split(':');
  const name = trimLower(nameRaw);
  const argText = rawArgs.join(':').trim();

  if (!name) return args.value;
  if (!toText(args.value)) return '';

  if (name === 'prefix') return argText ? `${argText}${args.value}` : args.value;
  if (name === 'suffix') return argText ? `${args.value}${argText}` : args.value;
  if (name === 'label') return argText ? `${argText} ${args.value}` : args.value;

  if (name === 'appendfield') {
    const fieldId = rawArgs[0] ? rawArgs[0].trim() : '';
    const separator = rawArgs.length > 1 ? rawArgs.slice(1).join(':').trim() || ' ' : ' ';
    const appended = resolveTemplateExpressionValue(args.record, fieldId);
    return appended ? `${args.value}${separator}${appended}` : args.value;
  }

  if (name === 'pluralize') {
    const singular = rawArgs[0] ? rawArgs[0].trim() : '';
    const plural = rawArgs[1] ? rawArgs[1].trim() : singular ? `${singular}s` : '';
    const numericValue = Number(args.value.replace(/,/g, '.'));
    if (!singular && !plural) return args.value;
    return `${args.value} ${Number.isFinite(numericValue) && numericValue === 1 ? singular : plural}`.trim();
  }

  if (name === 'date') {
    return formatTemplateDate(args.value, argText || 'yyyy-MM-dd');
  }

  return args.value;
};

const renderGeneratedRecordExpression = (record: SubmitEffectGeneratedRecord, expression: string): string => {
  const alternatives = (expression || '')
    .split(/\s*\|\|\s*/g)
    .map(entry => entry.trim())
    .filter(Boolean);

  for (const alternative of alternatives) {
    const segments = alternative
      .split(/\s*\|\s*/g)
      .map(entry => entry.trim())
      .filter(Boolean);
    if (!segments.length) continue;
    let value = resolveTemplateExpressionValue(record, segments[0]);
    for (const formatter of segments.slice(1)) {
      value = applyGeneratedRecordFormatter({ record, value, formatter });
    }
    if (toText(value)) return value;
  }

  return '';
};

export const renderGeneratedRecordLine = (record: SubmitEffectGeneratedRecord, template: string): string =>
  (template || '')
    .replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, token) => renderGeneratedRecordExpression(record, token))
    .trim();
