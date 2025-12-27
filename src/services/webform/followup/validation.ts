import { QuestionConfig, WebFormSubmission } from '../../../types';
import { evaluateRules, validateRules } from '../../../web/rules/validation';
import { resolveSubgroupKey } from './utils';

/**
 * Follow-up-side validation helpers.
 *
 * Responsibility:
 * - Validate "error" rules for follow-up actions (block the action)
 * - Collect warning messages for placeholders (non-blocking)
 */

export const validateFollowupRequirements = (questions: QuestionConfig[], record: WebFormSubmission): string[] => {
  const values = { ...(record.values || {}) } as Record<string, any>;
  const lineItems: Record<string, { id: string; values: Record<string, any> }[]> = {};
  const buildSubgroupKey = (groupId: string, rowId: string, subId: string) => `${groupId}::${rowId}::${subId}`;

  questions
    .filter(q => q.type === 'LINE_ITEM_GROUP')
    .forEach(q => {
      const rows = Array.isArray(values[q.id]) ? values[q.id] : [];
      const normalized = rows.map((row: any, idx: number) => ({
        id: `${q.id}_${idx}`,
        values: row || {}
      }));
      lineItems[q.id] = normalized;
      if (q.lineItemConfig?.subGroups?.length) {
        normalized.forEach((row: { id: string; values: Record<string, any> }) => {
          q.lineItemConfig?.subGroups?.forEach(sub => {
            const subId = resolveSubgroupKey(sub as any);
            if (!subId) return;
            const children = Array.isArray(row.values[subId]) ? row.values[subId] : [];
            const childKey = buildSubgroupKey(q.id, row.id, subId);
            lineItems[childKey] = children.map((c: any, cIdx: number) => ({
              id: `${row.id}_${subId}_${cIdx}`,
              values: c || {}
            }));
          });
        });
      }
    });

  const errors: string[] = [];
  const lang = (record.language as any) || 'EN';
  const ctxBase = {
    language: lang,
    phase: 'followup' as const,
    getValue: (fid: string) => values[fid],
    getLineValue: (_rowId: string, fid: string) => values[fid]
  };

  questions.forEach(q => {
    if (q.validationRules?.length) {
      const errs = validateRules(q.validationRules, { ...ctxBase, isHidden: () => false } as any);
      errs.forEach(e => errors.push(e.message));
    }
    if (q.type === 'LINE_ITEM_GROUP' && q.lineItemConfig?.fields) {
      const rows = lineItems[q.id] || [];
      rows.forEach(row => {
        q.lineItemConfig?.fields.forEach(field => {
          if (field.validationRules?.length) {
            const fieldErrs = validateRules(field.validationRules, {
              language: lang,
              phase: 'followup',
              getValue: (fid: string) => ((row.values as any).hasOwnProperty(fid) ? (row.values as any)[fid] : values[fid]),
              getLineValue: () => undefined,
              isHidden: () => false
            } as any);
            fieldErrs.forEach(e => errors.push(e.message));
          }
        });

        if (q.lineItemConfig?.subGroups?.length) {
          q.lineItemConfig.subGroups.forEach(sub => {
            const subId = resolveSubgroupKey(sub as any);
            if (!subId) return;
            const subKey = buildSubgroupKey(q.id, row.id, subId);
            const childRows = lineItems[subKey] || [];
            childRows.forEach(child => {
              (sub.fields || []).forEach(field => {
                if (field.validationRules?.length) {
                  const childErrs = validateRules(field.validationRules, {
                    language: lang,
                    phase: 'followup',
                    getValue: (fid: string) =>
                      ((child.values as any).hasOwnProperty(fid) ? (child.values as any)[fid] : values[fid]),
                    getLineValue: () => undefined,
                    isHidden: () => false
                  } as any);
                  childErrs.forEach(e => errors.push(e.message));
                }
              });
            });
          });
        }
      });
    }
  });

  return errors;
};

export const collectValidationWarnings = (questions: QuestionConfig[], record: WebFormSubmission): string[] => {
  const values = { ...(record.values || {}) } as Record<string, any>;
  const lineItems: Record<string, { id: string; values: Record<string, any> }[]> = {};
  const buildSubgroupKey = (groupId: string, rowId: string, subId: string) => `${groupId}::${rowId}::${subId}`;

  questions
    .filter(q => q.type === 'LINE_ITEM_GROUP')
    .forEach(q => {
      const rows = Array.isArray(values[q.id]) ? values[q.id] : [];
      const normalized = rows.map((row: any, idx: number) => ({
        id: `${q.id}_${idx}`,
        values: row || {}
      }));
      lineItems[q.id] = normalized;
      if (q.lineItemConfig?.subGroups?.length) {
        normalized.forEach((row: { id: string; values: Record<string, any> }) => {
          q.lineItemConfig?.subGroups?.forEach(sub => {
            const subId = resolveSubgroupKey(sub as any);
            if (!subId) return;
            const children = Array.isArray(row.values[subId]) ? row.values[subId] : [];
            const childKey = buildSubgroupKey(q.id, row.id, subId);
            lineItems[childKey] = children.map((c: any, cIdx: number) => ({
              id: `${row.id}_${subId}_${cIdx}`,
              values: c || {}
            }));
          });
        });
      }
    });

  const warnings: string[] = [];
  const seen = new Set<string>();
  const lang = (record.language as any) || 'EN';

  const push = (msg: string) => {
    const m = (msg || '').toString().trim();
    if (!m) return;
    if (seen.has(m)) return;
    seen.add(m);
    warnings.push(m);
  };

  const warningRulesOnly = (rules: any[] | undefined | null): any[] =>
    (Array.isArray(rules) ? rules : []).filter(r => {
      const raw = r?.level;
      const s = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
      return s === 'warning' || s === 'warn';
    });

  const phase: 'submit' = 'submit';
  const ctxBase = {
    language: lang,
    phase,
    getValue: (fid: string) => values[fid],
    getLineValue: (_rowId: string, fid: string) => values[fid],
    isHidden: () => false
  };

  questions.forEach(q => {
    const qRules = warningRulesOnly(q.validationRules);
    if (qRules.length) {
      const issues = evaluateRules(qRules as any, ctxBase as any);
      issues.filter((i: any) => i?.level === 'warning').forEach((i: any) => push(i.message));
    }

    if (q.type === 'LINE_ITEM_GROUP' && q.lineItemConfig?.fields) {
      const rows = lineItems[q.id] || [];
      rows.forEach(row => {
        q.lineItemConfig?.fields.forEach(field => {
          const rules = warningRulesOnly((field as any).validationRules);
          if (!rules.length) return;
          const issues = evaluateRules(rules as any, {
            language: lang,
            phase,
            getValue: (fid: string) => ((row.values as any).hasOwnProperty(fid) ? (row.values as any)[fid] : values[fid]),
            getLineValue: () => undefined,
            isHidden: () => false
          } as any);
          issues.filter((i: any) => i?.level === 'warning').forEach((i: any) => push(i.message));
        });
      });

      if (q.lineItemConfig?.subGroups?.length) {
        q.lineItemConfig.subGroups.forEach(sub => {
          const subId = resolveSubgroupKey(sub as any);
          if (!subId) return;
          rows.forEach(row => {
            const subKey = buildSubgroupKey(q.id, row.id, subId);
            const childRows = lineItems[subKey] || [];
            childRows.forEach(child => {
              (sub.fields || []).forEach(field => {
                const rules = warningRulesOnly((field as any).validationRules);
                if (!rules.length) return;
                const issues = evaluateRules(rules as any, {
                  language: lang,
                  phase,
                  getValue: (fid: string) =>
                    ((child.values as any).hasOwnProperty(fid) ? (child.values as any)[fid] : values[fid]),
                  getLineValue: () => undefined,
                  isHidden: () => false
                } as any);
                issues.filter((i: any) => i?.level === 'warning').forEach((i: any) => push(i.message));
              });
            });
          });
        });
      }
    }
  });

  return warnings;
};


