import { ValidationRule } from '../../types';
import { resolveLocalizedString } from '../i18n';
import { FieldValue, LangCode, LocalizedString, ThenConfig, ValidationError, VisibilityContext } from '../types';
import { matchesWhen } from './visibility';

const validationDebugEnabled = (): boolean => Boolean((globalThis as any)?.__WEB_FORM_DEBUG__);

const validationLog = (event: string, payload?: Record<string, unknown>) => {
  if (!validationDebugEnabled() || typeof console === 'undefined' || typeof console.info !== 'function') return;
  try {
    console.info('[ReactForm][Validation]', event, payload || {});
  } catch (_) {
    // ignore
  }
};

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

const toFiniteNumber = (raw: unknown): number | null => {
  if (raw === undefined || raw === null) return null;
  const scalar = Array.isArray(raw)
    ? raw.find(v => v !== undefined && v !== null && (typeof v !== 'string' || v.trim() !== '')) ?? raw[0]
    : raw;
  if (scalar === undefined || scalar === null) return null;
  if (typeof scalar === 'boolean') return null;
  if (scalar instanceof Date) return null;
  if (typeof scalar === 'string') {
    const s = scalar.trim();
    if (!s) return null;
    const normalized = s.includes(',') && !s.includes('.') ? s.replace(',', '.') : s;
    const n = Number(normalized);
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(scalar);
  return Number.isFinite(n) ? n : null;
};

export interface ValidationContext extends VisibilityContext {
  language: LangCode;
  /**
   * Optional phase indicator so rules can scope themselves
   * (e.g., submit vs followup). Defaults to "submit".
   */
  phase?: 'submit' | 'followup';
  isHidden?: (fieldId: string, rowId?: string) => boolean;
}

export type ValidationLevel = 'error' | 'warning';

export function checkRule(
  value: FieldValue,
  thenCfg: ThenConfig,
  language: LangCode,
  message?: LocalizedString,
  getValue?: (fieldId: string) => FieldValue
): string {
  const values = Array.isArray(value) ? value : [value];
  const customMessage = message ? resolveLocalizedString(message, language, '') : '';

  if (thenCfg?.required) {
    const hasValue = values.some(v => {
      if (v === undefined || v === null) return false;
      if (typeof v === 'string') return v.trim() !== '';
      if (typeof v === 'boolean') return v === true;
      return true;
    });
    if (!hasValue) {
      return customMessage || resolveLocalizedString(defaultRuleMessages.required, language, 'This field is required.');
    }
  }

  const numVals = values.map(v => toFiniteNumber(v)).filter((v): v is number => typeof v === 'number');

  const resolveMinSpec = (): { limit: number; label: number | string; source?: string } | null => {
    if (thenCfg?.min !== undefined) {
      const n = toFiniteNumber(thenCfg.min);
      if (n === null) return null;
      return { limit: n, label: thenCfg.min as any, source: 'min' };
    }
    const minFieldId = (thenCfg as any)?.minFieldId;
    if (minFieldId && typeof minFieldId === 'string' && minFieldId.trim() && typeof getValue === 'function') {
      const raw = getValue(minFieldId.trim());
      const n = toFiniteNumber(raw);
      if (n === null) return null;
      return { limit: n, label: n, source: `minFieldId:${minFieldId.trim()}` };
    }
    return null;
  };

  const resolveMaxSpec = (): { limit: number; label: number | string; source?: string } | null => {
    if (thenCfg?.max !== undefined) {
      const n = toFiniteNumber(thenCfg.max);
      if (n === null) return null;
      return { limit: n, label: thenCfg.max as any, source: 'max' };
    }
    const maxFieldId = (thenCfg as any)?.maxFieldId;
    if (maxFieldId && typeof maxFieldId === 'string' && maxFieldId.trim() && typeof getValue === 'function') {
      const raw = getValue(maxFieldId.trim());
      const n = toFiniteNumber(raw);
      if (n === null) return null;
      return { limit: n, label: n, source: `maxFieldId:${maxFieldId.trim()}` };
    }
    return null;
  };

  const minSpec = resolveMinSpec();
  if (minSpec && numVals.length && numVals.some(v => v < minSpec.limit)) {
    if (minSpec.source && minSpec.source.startsWith('minFieldId:')) {
      validationLog('minFieldId.fail', { minSpec, value });
    }
    return (
      customMessage ||
      resolveLocalizedString(withLimitMessage('Value must be >=', minSpec.label), language, 'Value must be >= ' + minSpec.label + '.')
    );
  }

  const maxSpec = resolveMaxSpec();
  if (maxSpec && numVals.length && numVals.some(v => v > maxSpec.limit)) {
    if (maxSpec.source && maxSpec.source.startsWith('maxFieldId:')) {
      validationLog('maxFieldId.fail', { maxSpec, value });
    }
    return (
      customMessage ||
      resolveLocalizedString(withLimitMessage('Value must be <=', maxSpec.label), language, 'Value must be <= ' + maxSpec.label + '.')
    );
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
  return evaluateRules(rules, ctx).filter(i => (i.level || 'error') === 'error');
}

export function evaluateRules(rules: ValidationRule[], ctx: ValidationContext): ValidationError[] {
  const issues: ValidationError[] = [];
  const phase = ctx.phase || 'submit';

  rules.forEach(rule => {
    try {
      const rulePhase = rule.phase || 'both';
      if (rulePhase !== 'both' && rulePhase !== phase) return;

      const levelRaw = (rule as any)?.level;
      const levelStr = typeof levelRaw === 'string' ? levelRaw.trim().toLowerCase() : '';
      const level: ValidationLevel = levelStr === 'warning' || levelStr === 'warn' ? 'warning' : 'error';

      const warningDisplayRaw = (rule as any)?.warningDisplay;
      const warningDisplayStr = typeof warningDisplayRaw === 'string' ? warningDisplayRaw.trim().toLowerCase() : '';
      const warningDisplay: 'top' | 'field' | 'both' =
        warningDisplayStr === 'field' || warningDisplayStr === 'both' ? (warningDisplayStr as any) : 'top';

      const warningViewRaw = (rule as any)?.warningView;
      const warningViewStr = typeof warningViewRaw === 'string' ? warningViewRaw.trim().toLowerCase() : '';
      const warningView: 'edit' | 'summary' | 'both' =
        warningViewStr === 'edit' || warningViewStr === 'form'
          ? 'edit'
          : warningViewStr === 'summary'
          ? 'summary'
          : 'both';
      if (warningViewStr && warningView !== warningViewStr) {
        validationLog('warningView.normalized', { raw: warningViewRaw, normalized: warningView });
      }

      const whenFieldId = (rule as any)?.when?.fieldId;
      if (!whenFieldId) return;
      const whenValue = ctx.getValue(whenFieldId);
      if (!matchesWhen(whenValue, (rule as any).when)) return;

      // "Message-only" rules: allow rules that don't specify `then` and simply emit a message when `when` matches.
      // This is especially useful for non-blocking warnings.
      const thenFieldId = (rule as any)?.then?.fieldId;
      if (!thenFieldId) {
        if (ctx.isHidden && ctx.isHidden(whenFieldId)) return;
        const msg = resolveLocalizedString((rule as any)?.message, ctx.language, '');
        if (!msg) return;
        issues.push({
          fieldId: whenFieldId,
          message: msg,
          scope: 'main',
          level,
          warningDisplay: level === 'warning' ? warningDisplay : undefined,
          warningView: level === 'warning' ? warningView : undefined
        });
        return;
      }

      if (ctx.isHidden && ctx.isHidden(thenFieldId)) return;
      const targetVal = ctx.getValue(thenFieldId);
      const msg = checkRule(targetVal, (rule as any).then, ctx.language, (rule as any).message, ctx.getValue);
      if (!msg) return;
      issues.push({
        fieldId: thenFieldId,
        message: msg,
        scope: 'main',
        level,
        warningDisplay: level === 'warning' ? warningDisplay : undefined,
        warningView: level === 'warning' ? warningView : undefined
      });
    } catch (err) {
      validationLog('rule.eval.failed', { error: err ? err.toString() : 'unknown' });
      return;
    }
  });

  return issues;
}
