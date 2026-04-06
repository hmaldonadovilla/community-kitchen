import type { WebQuestionDefinition } from '../../types';

const getSelectionEffects = (field: any): any[] =>
  Array.isArray(field?.selectionEffects) ? field.selectionEffects : [];

const extractCalcExpressionDeps = (expression?: string): string[] => {
  if (!expression) return [];
  const matches = expression.match(/\{([^}]+)\}/g);
  if (!matches) return [];
  const seen = new Set<string>();
  return matches
    .map(raw => raw.replace(/[{}]/g, '').trim())
    .filter(token => {
      if (!token || token.includes('.')) return false;
      if (seen.has(token)) return false;
      seen.add(token);
      return true;
    });
};

export const whenClauseDependsOnField = (when: any, targetFieldId: string): boolean => {
  if (!when) return false;
  if (Array.isArray(when)) return when.some(entry => whenClauseDependsOnField(entry, targetFieldId));
  if (typeof when !== 'object') return false;
  const allRaw = (when as any).all ?? (when as any).and;
  if (Array.isArray(allRaw)) return allRaw.some(entry => whenClauseDependsOnField(entry, targetFieldId));
  const anyRaw = (when as any).any ?? (when as any).or;
  if (Array.isArray(anyRaw)) return anyRaw.some(entry => whenClauseDependsOnField(entry, targetFieldId));
  if (Object.prototype.hasOwnProperty.call(when as any, 'not')) {
    return whenClauseDependsOnField((when as any).not, targetFieldId);
  }
  const lineItems = (when as any).lineItems ?? (when as any).lineItem;
  if (lineItems && typeof lineItems === 'object') {
    if (whenClauseDependsOnField((lineItems as any).when, targetFieldId)) return true;
    if (whenClauseDependsOnField((lineItems as any).parentWhen, targetFieldId)) return true;
  }
  const fidRaw = (when as any).fieldId ?? (when as any).field ?? (when as any).id;
  const fid = fidRaw !== undefined && fidRaw !== null ? fidRaw.toString().trim() : '';
  return fid === targetFieldId;
};

export const selectionEffectDependsOnField = (field: WebQuestionDefinition | any, targetFieldId: string): boolean => {
  const derived = field?.derivedValue;
  if (derived) {
    const dependsOnRaw = derived.dependsOn;
    const dependsOn = Array.isArray(dependsOnRaw) ? dependsOnRaw : dependsOnRaw ? [dependsOnRaw] : [];
    if (dependsOn.some((dep: any) => dep !== undefined && dep !== null && dep.toString().trim() === targetFieldId)) {
      return true;
    }
    if (derived.op === 'calc') {
      const deps = extractCalcExpressionDeps(derived.expression);
      if (deps.includes(targetFieldId)) return true;
    }
  }
  return getSelectionEffects(field).some(effect => {
    if (!effect) return false;
    if (effect.when && whenClauseDependsOnField(effect.when, targetFieldId)) {
      return true;
    }
    if (effect.rowMultiplierFieldId && effect.rowMultiplierFieldId === targetFieldId) {
      return true;
    }
    if (effect.lineItemMapping) {
      return Object.values(effect.lineItemMapping).some(value => {
        if (typeof value !== 'string' || !value.startsWith('$row.')) return false;
        const referencedField = value.slice(5).split('.')[0];
        return referencedField === targetFieldId;
      });
    }
    return false;
  });
};
