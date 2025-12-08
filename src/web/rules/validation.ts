import { ValidationRule } from '../../types';
import { resolveLocalizedString } from '../i18n';
import { FieldValue, LangCode, LocalizedString, ThenConfig, ValidationError, VisibilityContext } from '../types';
import { matchesWhen } from './visibility';

const defaultRuleMessages = {
  required: {
    en: 'This field is required.',
    fr: 'Ce champ est obligatoire.',
    nl: 'Dit veld is verplicht.'
  },
  allowed: {
    en: 'Please use an allowed value.',
    fr: 'Veuillez utiliser une valeur autorisée.',
    nl: 'Gebruik een toegestane waarde.'
  },
  disallowed: {
    en: 'This combination is not allowed.',
    fr: "Cette combinaison n'est pas autorisée.",
    nl: 'Deze combinatie is niet toegestaan.'
  }
};

const withLimitMessage = (prefix: string, limit: number | string) => ({
  en: `${prefix} ${limit}.`,
  fr: `${prefix} ${limit}.`,
  nl: `${prefix} ${limit}.`
});

export interface ValidationContext extends VisibilityContext {
  language: LangCode;
  /**
   * Optional phase indicator so rules can scope themselves
   * (e.g., submit vs followup). Defaults to "submit".
   */
  phase?: 'submit' | 'followup';
  isHidden?: (fieldId: string, rowId?: string) => boolean;
}

export function checkRule(
  value: FieldValue,
  thenCfg: ThenConfig,
  language: LangCode,
  message?: LocalizedString
): string {
  const values = Array.isArray(value) ? value : [value];
  const customMessage = message ? resolveLocalizedString(message, language, '') : '';

  if (thenCfg?.required) {
    const hasValue = values.some(v => {
      if (v === undefined || v === null) return false;
      if (typeof v === 'string') return v.trim() !== '';
      return true;
    });
    if (!hasValue) {
      return customMessage || resolveLocalizedString(defaultRuleMessages.required, language, 'This field is required.');
    }
  }

  if (thenCfg?.min !== undefined) {
    const minVal = Number(thenCfg.min);
    const numVals = values.map(v => Number(v)).filter(v => !isNaN(v));
    if (numVals.some(v => v < minVal)) {
      return (
        customMessage ||
        resolveLocalizedString(withLimitMessage('Value must be >=', thenCfg.min), language, 'Value must be >= ' + thenCfg.min + '.')
      );
    }
  }

  if (thenCfg?.max !== undefined) {
    const maxVal = Number(thenCfg.max);
    const numVals = values.map(v => Number(v)).filter(v => !isNaN(v));
    if (numVals.some(v => v > maxVal)) {
      return (
        customMessage ||
        resolveLocalizedString(withLimitMessage('Value must be <=', thenCfg.max), language, 'Value must be <= ' + thenCfg.max + '.')
      );
    }
  }

  if (thenCfg?.allowed?.length && !values.every(v => thenCfg.allowed?.includes(v as string))) {
    return customMessage || resolveLocalizedString(defaultRuleMessages.allowed, language, 'Please use an allowed value.');
  }

  if (thenCfg?.disallowed?.length && values.some(v => thenCfg.disallowed?.includes(v as string))) {
    return customMessage || resolveLocalizedString(defaultRuleMessages.disallowed, language, 'This combination is not allowed.');
  }

  return '';
}

export function validateRules(rules: ValidationRule[], ctx: ValidationContext): ValidationError[] {
  const errors: ValidationError[] = [];
  const phase = ctx.phase || 'submit';

  rules.forEach(rule => {
    const rulePhase = rule.phase || 'both';
    if (rulePhase !== 'both' && rulePhase !== phase) return;
    const whenValue = ctx.getValue(rule.when.fieldId);
    if (!matchesWhen(whenValue, rule.when)) return;
    if (ctx.isHidden && ctx.isHidden(rule.then.fieldId)) return;
    const targetVal = ctx.getValue(rule.then.fieldId);
    const msg = checkRule(targetVal, rule.then, ctx.language, rule.message);
    if (msg) {
      errors.push({
        fieldId: rule.then.fieldId,
        message: msg,
        scope: 'main'
      });
    }
  });

  return errors;
}
