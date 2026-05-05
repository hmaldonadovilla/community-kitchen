import { collectFormWhenFieldIds } from '../../conditions/domain/conditionDependencies';
import type { WebFormDefinition } from '../../../../types';

export const isBlurDerivedValue = (derived?: any): boolean => {
  if (!derived) return false;
  const raw = (derived.applyOn || '').toString().trim().toLowerCase();
  if (raw === 'blur') return true;
  if (raw === 'change') return false;
  return (derived.op || '').toString() === 'copy';
};

export const normalizeDerivedTokenToFieldId = (token: string): string => {
  const raw = (token || '').toString().trim();
  if (!raw) return '';
  const parts = raw.replace(/\s+/g, '').split('.').filter(Boolean);
  return (parts[parts.length - 1] || raw).toString().trim();
};

export const collectExpressionFieldIds = (expression: any, out: Set<string>) => {
  const expr = expression !== undefined && expression !== null ? expression.toString() : '';
  if (!expr) return;
  expr.replace(/\{([^}]+)\}/g, (_match: string, raw: string) => {
    const fid = normalizeDerivedTokenToFieldId(raw);
    if (fid) out.add(fid);
    return '';
  });
  expr.replace(/SUM\s*\(([^)]+)\)/gi, (_match: string, raw: string) => {
    const fid = normalizeDerivedTokenToFieldId(raw);
    if (fid) out.add(fid);
    return '';
  });
};

export const collectDerivedBlurDependencies = (derived: any, out: Set<string>) => {
  if (!derived || !isBlurDerivedValue(derived)) return;
  const dependsOn = derived.dependsOn !== undefined && derived.dependsOn !== null ? derived.dependsOn.toString().trim() : '';
  if (dependsOn) {
    out.add(normalizeDerivedTokenToFieldId(dependsOn));
  }
  collectExpressionFieldIds(derived.expression ?? derived.formula ?? derived.expr, out);
  const filters = derived.lineItemFilters ?? derived.aggregateFilters ?? derived.filters;
  if (Array.isArray(filters)) {
    filters.forEach(filter => {
      if (!filter || typeof filter !== 'object') return;
      const ref = filter.ref ?? filter.path ?? filter.target;
      if (ref !== undefined && ref !== null) {
        const fid = normalizeDerivedTokenToFieldId(ref.toString());
        if (fid) out.add(fid);
      }
      collectFormWhenFieldIds((filter as any).when, out);
    });
  }
};

const hasBlurDerivedInFields = (fields: any[]): boolean =>
  Array.isArray(fields) && fields.some(field => Boolean(field?.derivedValue && isBlurDerivedValue(field.derivedValue)));

const hasBlurDerivedInSubGroups = (subGroups: any[]): boolean => {
  for (const subGroup of subGroups || []) {
    if (hasBlurDerivedInFields((subGroup as any)?.fields || [])) return true;
    if (hasBlurDerivedInSubGroups((subGroup as any)?.subGroups || [])) return true;
  }
  return false;
};

export const hasDefinitionBlurDerivedValues = (definition: Pick<WebFormDefinition, 'questions'>): boolean =>
  (definition.questions || []).some(question => {
    if ((question as any).derivedValue && isBlurDerivedValue((question as any).derivedValue)) return true;
    if (question.type !== 'LINE_ITEM_GROUP') return false;
    if (hasBlurDerivedInFields((question as any).lineItemConfig?.fields || [])) return true;
    return hasBlurDerivedInSubGroups((question as any).lineItemConfig?.subGroups || []);
  });

export const collectDefinitionBlurDerivedDependencyIds = (
  definition: Pick<WebFormDefinition, 'questions'>
): Set<string> => {
  const deps = new Set<string>();

  const collectFromFields = (fields: any[]) => {
    (fields || []).forEach(field => {
      if (field?.id && isBlurDerivedValue(field?.derivedValue)) {
        deps.add(field.id.toString().trim());
      }
      collectDerivedBlurDependencies(field?.derivedValue, deps);
    });
  };

  const walkSubGroups = (subGroups: any[]) => {
    (subGroups || []).forEach(subGroup => {
      collectFromFields((subGroup as any)?.fields || []);
      if (Array.isArray((subGroup as any)?.subGroups) && (subGroup as any).subGroups.length) {
        walkSubGroups((subGroup as any).subGroups);
      }
    });
  };

  (definition.questions || []).forEach(question => {
    if (question.id && isBlurDerivedValue((question as any).derivedValue)) {
      deps.add(question.id.toString().trim());
    }
    collectDerivedBlurDependencies((question as any).derivedValue, deps);
    if (question.type !== 'LINE_ITEM_GROUP') return;
    collectFromFields((question as any).lineItemConfig?.fields || []);
    walkSubGroups((question as any).lineItemConfig?.subGroups || []);
  });

  return deps;
};
