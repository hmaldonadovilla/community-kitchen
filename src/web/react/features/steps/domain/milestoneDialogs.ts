import { FollowupActionResult, StepGeneratedRecordsDialogConfig, StepMilestoneActionConfig, SubmitEffectGeneratedRecord, WhenClause } from '../../../../../types';
import { matchesWhenClause } from '../../../../../web/rules/visibility';
import { VisibilityContext } from '../../../../../web/types';

const trimLower = (value: unknown): string => (value === undefined || value === null ? '' : value.toString().trim().toLowerCase());
const toText = (value: unknown): string => (value === undefined || value === null ? '' : value.toString().trim());
const LEFTOVER_INVENTORY_FORM_KEY = 'Config: Leftover Inventory';

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

export const renderGeneratedRecordLine = (record: SubmitEffectGeneratedRecord, template: string): string =>
  (template || '')
    .replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, token) => resolveRecordToken(record, token))
    .trim();

const formatPortionsLabel = (value: string): string => {
  if (!value) return '';
  const normalized = value.replace(/,/g, '.');
  const numericValue = Number(normalized);
  const unit = Number.isFinite(numericValue) && numericValue === 1 ? 'portion' : 'portions';
  return `${value} ${unit}`;
};

const formatGeneratedLeftoverQuantity = (values: Record<string, unknown>): string => {
  const portions = toText(values.LEFTOVER_PORTIONS || '');
  if (portions) return formatPortionsLabel(portions);
  const quantity = toText(values.LEFTOVER_QTY || '');
  if (!quantity) return '';
  const unit = toText(values.LEFTOVER_UNIT || '');
  return unit ? `${quantity} ${unit}` : quantity;
};

export const isGeneratedLeftoverRecord = (record: SubmitEffectGeneratedRecord): boolean =>
  toText(record.targetFormKey || '') === LEFTOVER_INVENTORY_FORM_KEY;

export const renderGeneratedLeftoverLine = (
  record: SubmitEffectGeneratedRecord,
  options?: {
    bullet?: boolean;
  }
): string => {
  const values = record.values && typeof record.values === 'object' ? (record.values as Record<string, unknown>) : {};
  const leftoverId = toText(values.LEFTOVER_ID || record.recordId || '');
  const kind = toText(values.LEFTOVER_KIND || '');
  const recipe = toText(values.LEFTOVER_RECIPE || '');
  const ingredient = toText(values.LEFTOVER_INGREDIENT || '');
  const quantity = formatGeneratedLeftoverQuantity(values);
  const segments = [leftoverId, kind, recipe || ingredient, quantity].filter(Boolean);
  const line = segments.join(' | ');
  return options?.bullet && line ? `• ${line}` : line;
};
