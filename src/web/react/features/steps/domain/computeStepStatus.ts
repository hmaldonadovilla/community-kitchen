import { FieldValue, LangCode, WebFormDefinition, WebQuestionDefinition } from '../../../../types';
import { shouldHideField, matchesWhenClause } from '../../../../rules/visibility';
import { validateRules } from '../../../../rules/validation';
import { LineItemState } from '../../../types';
import { isEmptyValue } from '../../../utils/values';

// Step completion should block when step-visible fields are "unset", even if not marked required in the base definition.
// Important: this differs from `isEmptyValue` (which treats boolean false as empty).
const isUnsetForStep = (value: FieldValue | undefined): boolean => {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  try {
    if (typeof FileList !== 'undefined' && value instanceof FileList) return value.length === 0;
  } catch (_) {
    // ignore
  }
  return false;
};

export type GuidedStepStatus = {
  id: string;
  index: number;
  complete: boolean;
  valid: boolean;
  /**
   * Missing count for "completion" semantics (step-visible fields must be explicitly set).
   * NOTE: This is intentionally stricter than base required-ness.
   */
  missingRequiredCount: number;
  /**
   * Missing count for "validity" semantics (base required fields only).
   * This is what `forwardGate: whenValid` uses.
   */
  missingValidCount: number;
  errorCount: number;
};

export type GuidedStepsStatus = {
  steps: GuidedStepStatus[];
  /**
   * Highest contiguous step index that is complete, starting from step 0.
   * -1 when step 0 is not complete.
   */
  maxCompleteIndex: number;
  /**
   * Highest contiguous step index that is valid, starting from step 0.
   * -1 when step 0 is not valid.
   */
  maxValidIndex: number;
};

const resolveSubgroupId = (sub?: { id?: string; label?: any }): string => {
  if (!sub) return '';
  if (sub.id) return sub.id;
  if (typeof sub.label === 'string') return sub.label;
  return sub.label?.en || sub.label?.fr || sub.label?.nl || '';
};

const buildSubgroupKey = (parentGroupId: string, parentRowId: string, subGroupId: string) =>
  `${parentGroupId}::${parentRowId}::${subGroupId}`;

const isIncludedByRowFilter = (rowValues: Record<string, FieldValue>, filter?: any): boolean => {
  if (!filter) return true;
  const includeWhen = filter?.includeWhen;
  const excludeWhen = filter?.excludeWhen;
  const rowCtx: any = { getValue: (fid: string) => (rowValues as any)[fid] };
  const includeOk = includeWhen ? matchesWhenClause(includeWhen as any, rowCtx) : true;
  const excludeMatch = excludeWhen ? matchesWhenClause(excludeWhen as any, rowCtx) : false;
  return includeOk && !excludeMatch;
};

export function computeGuidedStepsStatus(args: {
  definition: WebFormDefinition;
  language: LangCode;
  values: Record<string, FieldValue>;
  lineItems: LineItemState;
}): GuidedStepsStatus {
  const { definition, language, values, lineItems } = args;
  const stepsCfg = (definition as any)?.steps as NonNullable<WebFormDefinition['steps']> | undefined;
  if (!stepsCfg || stepsCfg.mode !== 'guided' || !Array.isArray(stepsCfg.items) || stepsCfg.items.length === 0) {
    return { steps: [], maxCompleteIndex: -1, maxValidIndex: -1 };
  }

  const questionById = new Map<string, WebQuestionDefinition>();
  (definition.questions || []).forEach(q => {
    if (q?.id) questionById.set(q.id, q);
  });

  const topCtx = {
    getValue: (fieldId: string) => (values as any)[fieldId],
    getLineItems: (groupId: string) => (lineItems as any)[groupId] || [],
    getLineItemKeys: () => Object.keys(lineItems || {})
  };

  const headerTargets: any[] = Array.isArray(stepsCfg.header?.include) ? stepsCfg.header!.include : [];

  const evaluateTopQuestion = (q: WebQuestionDefinition): { missingComplete: number; missingValid: number; errors: number } => {
    const hidden = shouldHideField(q.visibility, topCtx as any);
    if (hidden) return { missingComplete: 0, missingValid: 0, errors: 0 };
    let missingComplete = 0;
    let missingValid = 0;
    const raw = (values as any)[q.id] as FieldValue | undefined;
    if ((q as any).required) {
      // Preserve "required checkbox must be checked" semantics.
      if (isEmptyValue(raw as any)) {
        missingValid += 1;
        missingComplete += 1;
      }
    } else {
      // Guided step completion: step-visible fields must be explicitly set.
      if (isUnsetForStep(raw)) missingComplete += 1;
    }
    let errors = 0;
    const rules = Array.isArray((q as any).validationRules) ? ((q as any).validationRules as any[]) : [];
    if (rules.length) {
      const errs = validateRules(rules as any, {
        ...(topCtx as any),
        language,
        phase: 'submit',
        isHidden: (fieldId: string) => {
          const target = questionById.get(fieldId);
          if (!target) return false;
          return shouldHideField(target.visibility, topCtx as any);
        }
      } as any);
      errors = errs.filter(e => (e as any)?.fieldId === q.id).length;
    }
    return { missingComplete, missingValid, errors };
  };

  const evaluateLineGroup = (target: any): { missingComplete: number; missingValid: number; errors: number } => {
    const groupId = (target?.id || '').toString().trim();
    const q = questionById.get(groupId);
    if (!q || q.type !== 'LINE_ITEM_GROUP') return { missingComplete: 0, missingValid: 0, errors: 0 };
    const groupHidden = shouldHideField((q as any).visibility, topCtx as any);
    if (groupHidden) return { missingComplete: 0, missingValid: 0, errors: 0 };

    const rows = (lineItems as any)[groupId] || [];
    const fieldsCfg: any[] = ((q as any).lineItemConfig?.fields || []) as any[];
    const fieldById = new Map<string, any>();
    fieldsCfg.forEach(f => {
      const fid = f?.id !== undefined && f?.id !== null ? f.id.toString() : '';
      if (fid) fieldById.set(fid, f);
    });

    const normalizeLineFieldId = (rawId: string): string => {
      const s = rawId !== undefined && rawId !== null ? rawId.toString() : '';
      const prefix = `${groupId}__`;
      return s.startsWith(prefix) ? s.slice(prefix.length) : s;
    };

    const normalizeStepFieldEntry = (entry: any): string => {
      if (entry === undefined || entry === null) return '';
      if (typeof entry === 'object') {
        return normalizeLineFieldId((entry as any).id ?? (entry as any).fieldId ?? (entry as any).field);
      }
      return normalizeLineFieldId(entry);
    };

    const ui = ((q as any).lineItemConfig?.ui || {}) as any;
    const isProgressive =
      ui?.mode === 'progressive' && Array.isArray(ui?.collapsedFields) && (ui?.collapsedFields || []).length > 0;
    const collapsedFieldConfigs = isProgressive ? (ui?.collapsedFields || []) : [];
    const collapsedFieldIds: string[] = (collapsedFieldConfigs || [])
      .map((cfg: any) => (cfg?.fieldId !== undefined && cfg?.fieldId !== null ? cfg.fieldId.toString().trim() : ''))
      .filter(Boolean);
    const expandGateRaw = (ui?.expandGate || 'collapsedFieldsValid').toString().trim().toLowerCase();
    const expandGate: 'collapsedFieldsValid' | 'always' = expandGateRaw === 'always' ? 'always' : 'collapsedFieldsValid';

    const allowedFieldIds: string[] = (() => {
      const raw = target?.fields;
      if (Array.isArray(raw)) return raw.map((v: any) => normalizeStepFieldEntry(v)).filter(Boolean);
      if (typeof raw === 'string') return raw.split(',').map(s => normalizeLineFieldId(s.trim())).filter(Boolean);
      // Default: include all fields in the group
      return Array.from(fieldById.keys());
    })();

    // Mirror UI semantics: when a progressive row's collapsed fields are not valid, the row can't expand.
    // In guided steps, this only matters when the step targets any expanded content (expanded fields or subgroups).
    // If a step only targets collapsed fields, we should still validate them normally.
    const collapsedIdSet = new Set(collapsedFieldIds);
    const applyExpandGate = isProgressive && expandGate === 'collapsedFieldsValid' && collapsedFieldIds.length > 0;
    const stepTargetsExpandedContent = (() => {
      const expandedFieldIds = allowedFieldIds.filter(fid => !collapsedIdSet.has(fid));
      const subCfg = target?.subGroups;
      const includedSubs: any[] = Array.isArray(subCfg?.include) ? subCfg.include : [];
      return expandedFieldIds.length > 0 || includedSubs.length > 0;
    })();

    let missingComplete = 0;
    let missingValid = 0;
    let errors = 0;
    let hasAnyCompleteRow = false;
    let hasAnyValidRow = false;
    let includedCompleteRowCount = 0;
    let includedValidRowCount = 0;

    rows.forEach((row: any) => {
      if (!row || !row.id) return;
      const rowValues = (row.values || {}) as Record<string, FieldValue>;
      const completeRowFilter = (target as any)?.rows;
      const validationRowFilter = (target as any)?.validationRows ?? (target as any)?.rows;
      const includedForComplete = isIncludedByRowFilter(rowValues, completeRowFilter);
      const includedForValid = isIncludedByRowFilter(rowValues, validationRowFilter);
      if (!includedForComplete && !includedForValid) return;
      if (includedForComplete) includedCompleteRowCount += 1;
      if (includedForValid) includedValidRowCount += 1;

      const groupCtx = {
        getValue: (fieldId: string) => (values as any)[fieldId],
        getLineValue: (_rowId: string, fieldId: string) => (rowValues as any)[fieldId]
      };

      const getRowValue = (fieldId: string): FieldValue => {
        const localId = normalizeLineFieldId(fieldId);
        if (Object.prototype.hasOwnProperty.call(rowValues || {}, localId)) return (rowValues as any)[localId];
        if (Object.prototype.hasOwnProperty.call(rowValues || {}, fieldId)) return (rowValues as any)[fieldId];
        return (values as any)[fieldId];
      };

      const isRowLockedByExpandGate = (() => {
        if (!applyExpandGate) return false;
        // In step status computation, we treat progressive rows as "collapsed by default" (stable across reloads),
        // and only apply expandGate to decide whether expanded fields/subgroups should contribute validation.
        const blocked: string[] = [];
        collapsedFieldIds.forEach(fid => {
          const field = fieldById.get(fid);
          if (!field) return;
          const hideField = shouldHideField(field.visibility, groupCtx as any, { rowId: row.id, linePrefix: groupId });
          if (hideField) return;

          const raw = (rowValues as any)[fid] as FieldValue | undefined;
          if (field.required && isEmptyValue(raw as any)) {
            blocked.push(fid);
            return;
          }
          const rules = Array.isArray(field.validationRules)
            ? (field.validationRules as any[]).filter((r: any) => r?.then?.fieldId === field.id)
            : [];
          if (!rules.length) return;
          const errs = validateRules(rules as any, {
            ...(groupCtx as any),
            getValue: getRowValue,
            language,
            phase: 'submit',
            isHidden: (fieldId: string) => {
              const localId = normalizeLineFieldId(fieldId);
              const targetField = fieldById.get(localId);
              if (!targetField) return false;
              return shouldHideField(targetField.visibility, groupCtx as any, { rowId: row.id, linePrefix: groupId });
            }
          } as any);
          if (errs.length) blocked.push(fid);
        });
        return Array.from(new Set(blocked)).length > 0;
      })();

      const rowLocked = stepTargetsExpandedContent && isRowLockedByExpandGate;
      const effectiveAllowedFieldIds = rowLocked ? allowedFieldIds.filter(fid => collapsedIdSet.has(fid)) : allowedFieldIds;
      // If the row is locked and this step only targets expanded content (no collapsed fields), ignore the row entirely.
      if (rowLocked && effectiveAllowedFieldIds.length === 0) return;

      let rowMissingComplete = 0;
      let rowMissingValid = 0;
      let rowErrors = 0;

      effectiveAllowedFieldIds.forEach(fidRaw => {
        const fid = normalizeLineFieldId(fidRaw);
        if (!fid) return;
        const field = fieldById.get(fid);
        if (!field) return;

        const hideField = shouldHideField(field.visibility, groupCtx as any, { rowId: row.id, linePrefix: groupId });
        if (hideField) return;

        const raw = (rowValues as any)[fid] as FieldValue | undefined;
        if (includedForComplete) {
          if (field.required) {
            // Preserve existing required semantics (e.g., required checkbox must be checked).
            if (isEmptyValue(raw as any)) {
              missingComplete += 1;
              rowMissingComplete += 1;
            }
          } else {
            // Guided step completion: step-visible fields must be explicitly set.
            if (isUnsetForStep(raw)) {
              missingComplete += 1;
              rowMissingComplete += 1;
            }
          }
        }
        if (includedForValid && field.required && isEmptyValue(raw as any)) {
          missingValid += 1;
          rowMissingValid += 1;
        }

        const rules = Array.isArray(field.validationRules) ? (field.validationRules as any[]) : [];
        if (includedForValid && rules.length) {
          const errs = validateRules(rules as any, {
            ...(groupCtx as any),
            getValue: getRowValue,
            language,
            phase: 'submit',
            isHidden: (fieldId: string) => {
              const localId = normalizeLineFieldId(fieldId);
              const targetField = fieldById.get(localId);
              if (!targetField) return false;
              return shouldHideField(targetField.visibility, groupCtx as any, { rowId: row.id, linePrefix: groupId });
            }
          } as any);
          const fieldErrCount = errs.filter(e => normalizeLineFieldId((e as any)?.fieldId) === fid).length;
          errors += fieldErrCount;
          rowErrors += fieldErrCount;
        }
      });

      if (includedForComplete && rowMissingComplete === 0) hasAnyCompleteRow = true;
      if (includedForValid && rowMissingValid === 0 && rowErrors === 0) hasAnyValidRow = true;

      // When the row is locked by expandGate, expanded content (subgroups) isn't reachable yet.
      if (rowLocked) return;

      const subCfg = target?.subGroups;
      const includedSubs: any[] = Array.isArray(subCfg?.include) ? subCfg.include : [];
      if (!includedSubs.length) return;

      const subGroups: any[] = (((q as any).lineItemConfig?.subGroups || []) as any[]).map(sg => ({
        raw: sg,
        id: resolveSubgroupId(sg as any)
      }));

      includedSubs.forEach(subTarget => {
        const subId = (subTarget?.id || '').toString().trim();
        if (!subId) return;
        if (!subGroups.some(sg => sg.id === subId)) return;

        const subKey = buildSubgroupKey(groupId, row.id, subId);
        const subRows = (lineItems as any)[subKey] || [];
        const subDef = subGroups.find(sg => sg.id === subId)?.raw;
        const subFieldsCfg: any[] = ((subDef as any)?.fields || []) as any[];
        const subFieldById = new Map<string, any>();
        subFieldsCfg.forEach(f => {
          const fid = f?.id !== undefined && f?.id !== null ? f.id.toString() : '';
          if (fid) subFieldById.set(fid, f);
        });

        const normalizeSubFieldId = (rawId: string): string => {
          const s = rawId !== undefined && rawId !== null ? rawId.toString() : '';
          const subPrefix = `${subKey}__`;
          const linePrefix = `${groupId}__`;
          if (s.startsWith(subPrefix)) return s.slice(subPrefix.length);
          if (s.startsWith(linePrefix)) return s.slice(linePrefix.length);
          return s;
        };

        const normalizeStepSubFieldEntry = (entry: any): string => {
          if (entry === undefined || entry === null) return '';
          if (typeof entry === 'object') {
            return normalizeSubFieldId((entry as any).id ?? (entry as any).fieldId ?? (entry as any).field);
          }
          return normalizeSubFieldId(entry);
        };

        const allowedSubFieldIds: string[] = (() => {
          const raw = subTarget?.fields;
          if (Array.isArray(raw)) return raw.map((v: any) => normalizeStepSubFieldEntry(v)).filter(Boolean);
          if (typeof raw === 'string') return raw.split(',').map(s => normalizeSubFieldId(s.trim())).filter(Boolean);
          return Array.from(subFieldById.keys());
        })();

        subRows.forEach((subRow: any) => {
          if (!subRow || !subRow.id) return;
          const subRowValues = (subRow.values || {}) as Record<string, FieldValue>;
          const completeSubRowFilter = (subTarget as any)?.rows;
          const validationSubRowFilter = (subTarget as any)?.validationRows ?? (subTarget as any)?.rows;
          const includedSubForComplete = isIncludedByRowFilter(subRowValues, completeSubRowFilter);
          const includedSubForValid = isIncludedByRowFilter(subRowValues, validationSubRowFilter);
          if (!includedSubForComplete && !includedSubForValid) return;

          const subCtx = {
            getValue: (fieldId: string) => (values as any)[fieldId],
            getLineValue: (_rowId: string, fieldId: string) => (subRowValues as any)[fieldId]
          };

          const getSubValue = (fieldId: string): FieldValue => {
            const localId = normalizeSubFieldId(fieldId);
            if (Object.prototype.hasOwnProperty.call(subRowValues || {}, localId)) return (subRowValues as any)[localId];
            if (Object.prototype.hasOwnProperty.call(subRowValues || {}, fieldId)) return (subRowValues as any)[fieldId];
            if (Object.prototype.hasOwnProperty.call(rowValues || {}, localId)) return (rowValues as any)[localId];
            if (Object.prototype.hasOwnProperty.call(rowValues || {}, fieldId)) return (rowValues as any)[fieldId];
            return (values as any)[fieldId];
          };

          allowedSubFieldIds.forEach(fidRaw => {
            const fid = normalizeSubFieldId(fidRaw);
            if (!fid) return;
            const field = subFieldById.get(fid);
            if (!field) return;

            const hideField = shouldHideField(field.visibility, subCtx as any, { rowId: subRow.id, linePrefix: subKey });
            if (hideField) return;

            const raw = (subRowValues as any)[fid] as FieldValue | undefined;
            if (includedSubForComplete) {
              if (field.required) {
                if (isEmptyValue(raw as any)) {
                  missingComplete += 1;
                  rowMissingComplete += 1;
                }
              } else {
                if (isUnsetForStep(raw)) {
                  missingComplete += 1;
                  rowMissingComplete += 1;
                }
              }
            }
            if (includedSubForValid && field.required && isEmptyValue(raw as any)) {
              missingValid += 1;
              rowMissingValid += 1;
            }

            const rules = Array.isArray(field.validationRules) ? (field.validationRules as any[]) : [];
            if (includedSubForValid && rules.length) {
              const errs = validateRules(rules as any, {
                ...(subCtx as any),
                getValue: getSubValue,
                language,
                phase: 'submit',
                isHidden: (fieldId: string) => {
                  const localId = normalizeSubFieldId(fieldId);
                  const targetField = subFieldById.get(localId);
                  if (!targetField) return false;
                  return shouldHideField(targetField.visibility, subCtx as any, { rowId: subRow.id, linePrefix: subKey });
                }
              } as any);
              const fieldErrCount = errs.filter(e => normalizeSubFieldId((e as any)?.fieldId) === fid).length;
              errors += fieldErrCount;
              rowErrors += fieldErrCount;
            }
          });
        });
      });

      if (includedForComplete && rowMissingComplete === 0) hasAnyCompleteRow = true;
      if (includedForValid && rowMissingValid === 0 && rowErrors === 0) hasAnyValidRow = true;
    });

    // Validity should not be vacuously true when a step declares a row filter (rows/validationRows) and no rows match it.
    // Completion, however, is driven by step-visible fields and should not be forced incomplete by a validation-only filter.
    const hasValidRowFilter = !!(target as any)?.validationRows || !!(target as any)?.rows;
    if (hasValidRowFilter && includedValidRowCount === 0) {
      missingValid += 1;
    }
    // Required LINE_ITEM_GROUPs should be considered "incomplete" and "invalid" until at least one enabled row is
    // complete/valid within the fields included by this step (not the whole form).
    if ((q as any).required) {
      if (includedCompleteRowCount === 0) missingComplete += 1;
      if (includedValidRowCount === 0) missingValid += 1;
      if (includedCompleteRowCount > 0 && !hasAnyCompleteRow) missingComplete += 1;
      if (includedValidRowCount > 0 && !hasAnyValidRow) missingValid += 1;
    }

    return { missingComplete, missingValid, errors };
  };

  const steps: GuidedStepStatus[] = (stepsCfg.items || []).map((step: any, index: number) => {
    const seen = new Set<string>();
    const combinedTargets: any[] = [];
    [...headerTargets, ...(Array.isArray(step.include) ? step.include : [])].forEach(t => {
      if (!t) return;
      const kind = (t.kind || '').toString().trim();
      const id = (t.id || '').toString().trim();
      if (!kind || !id) return;
      const key = `${kind}:${id}`;
      if (seen.has(key)) return;
      seen.add(key);
      combinedTargets.push(t);
    });

    let missingRequiredCount = 0;
    let missingValidCount = 0;
    let errorCount = 0;

    combinedTargets.forEach(t => {
      if (t.kind === 'question') {
        const q = questionById.get(t.id);
        if (!q) return;
        const { missingComplete, missingValid, errors } = evaluateTopQuestion(q);
        missingRequiredCount += missingComplete;
        missingValidCount += missingValid;
        errorCount += errors;
        return;
      }
      if (t.kind === 'lineGroup') {
        const { missingComplete, missingValid, errors } = evaluateLineGroup(t);
        missingRequiredCount += missingComplete;
        missingValidCount += missingValid;
        errorCount += errors;
      }
    });

    const complete = missingRequiredCount === 0;
    const valid = missingValidCount === 0 && errorCount === 0;

    return {
      id: (step?.id || '').toString(),
      index,
      complete,
      valid,
      missingRequiredCount,
      missingValidCount,
      errorCount
    };
  });

  let maxCompleteIndex = -1;
  for (const s of steps) {
    if (!s.complete) break;
    maxCompleteIndex = s.index;
  }
  let maxValidIndex = -1;
  for (const s of steps) {
    if (!s.valid) break;
    maxValidIndex = s.index;
  }

  return { steps, maxCompleteIndex, maxValidIndex };
}

