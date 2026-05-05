import type {
  LineItemGroupConfigOverride,
  WebFormDefinition,
  WebQuestionDefinition
} from '../../../../types';
import { applyLineItemGroupOverride } from '../../../app/lineItemTree';
import { resolveSubgroupKey } from '../../../app/lineItems';
import {
  normalizeGuidedLineFieldId,
  parseGuidedTargetFieldEntries
} from './guidedTargetFields';

export type GuidedLineGroupOverrideAppliedEvent = {
  stepId: string;
  groupId: string;
  groupOverride: LineItemGroupConfigOverride;
};

const resolveStepId = (step: any): string => (step?.id || '').toString().trim();

const applyReadOnlyLabels = (
  groupId: string,
  fields: any[],
  readOnlyRaw: any,
  renderAsLabelFromFields: Set<string>
): any[] => {
  const parsedReadOnly = parseGuidedTargetFieldEntries(groupId, readOnlyRaw);
  const ids = parsedReadOnly.allowed ? Array.from(parsedReadOnly.allowed) : [];
  const readOnlyFieldIds = new Set<string>([...ids, ...Array.from(renderAsLabelFromFields)]);
  if (!readOnlyFieldIds.size) return fields;

  return fields.map((field: any) => {
    const fieldId = normalizeGuidedLineFieldId(groupId, field?.id);
    if (fieldId && readOnlyFieldIds.has(fieldId)) {
      return { ...(field as any), readOnly: true, ui: { ...((field as any).ui || {}), renderAsLabel: true } };
    }
    return field;
  });
};

/**
 * Owner: guided steps domain.
 * Builds the scoped form definition used for guided-step validation/rendering.
 */
export const buildGuidedStepDefinitionAction = (args: {
  guidedEnabled: boolean;
  guidedStepsCfg: any;
  guidedStepIds: string[];
  guidedVisibleSteps: any[];
  activeGuidedStepId: string;
  stepId?: string;
  definition: WebFormDefinition;
  onLineGroupOverrideApplied?: (event: GuidedLineGroupOverrideAppliedEvent) => void;
}): WebFormDefinition | null => {
  if (!args.guidedEnabled || !args.guidedStepsCfg || !args.guidedStepIds.length) return null;
  const steps = args.guidedVisibleSteps;
  const resolvedStepId = (args.stepId || args.activeGuidedStepId || '').toString().trim();
  const stepCfg = (steps.find(step => resolveStepId(step) === resolvedStepId) || steps[0]) as any;
  if (!stepCfg) return null;

  const headerTargets: any[] = Array.isArray(args.guidedStepsCfg.header?.include)
    ? args.guidedStepsCfg.header.include
    : [];
  const stepTargets: any[] = Array.isArray(stepCfg?.include) ? stepCfg.include : [];

  const topQuestionIds = new Set<string>();
  const renderQuestionAsLabel = new Set<string>();
  const lineTargetsById = new Map<string, any>();
  const addTarget = (target: any): void => {
    if (!target || typeof target !== 'object') return;
    const kind = (target.kind || '').toString().trim();
    const id = (target.id || '').toString().trim();
    if (!kind || !id) return;
    if (kind === 'question') {
      topQuestionIds.add(id);
      if (target?.renderAsLabel === true) renderQuestionAsLabel.add(id);
      return;
    }
    if (kind === 'lineGroup' && !lineTargetsById.has(id)) {
      lineTargetsById.set(id, target);
    }
  };
  [...headerTargets, ...stepTargets].forEach(addTarget);

  const scopedQuestions: WebQuestionDefinition[] = [];
  (args.definition.questions || []).forEach(question => {
    if (!question) return;
    if (question.type !== 'LINE_ITEM_GROUP') {
      if (topQuestionIds.has(question.id)) {
        const asLabel = renderQuestionAsLabel.has(question.id);
        scopedQuestions.push(
          asLabel
            ? ({ ...(question as any), ui: { ...((question as any).ui || {}), renderAsLabel: true } } as WebQuestionDefinition)
            : question
        );
      }
      return;
    }

    if (topQuestionIds.has(question.id)) {
      scopedQuestions.push(question);
      return;
    }

    const target = lineTargetsById.get(question.id);
    if (!target) return;
    const groupId = question.id;
    const groupOverride = target.groupOverride as LineItemGroupConfigOverride | undefined;
    const baseLineConfig = (question as any).lineItemConfig || {};
    const lineConfig = groupOverride ? applyLineItemGroupOverride(baseLineConfig, groupOverride) : baseLineConfig;
    if (groupOverride) {
      args.onLineGroupOverrideApplied?.({
        stepId: resolvedStepId,
        groupId,
        groupOverride
      });
    }

    const {
      allowed: allowedFieldIds,
      renderAsLabel: renderAsLabelFieldIdsFromFields,
      explicit: hasExplicitFieldScope
    } = parseGuidedTargetFieldEntries(groupId, target.fields);
    const filteredFieldsBase = hasExplicitFieldScope
      ? ((lineConfig.fields || []) as any[]).filter((field: any) => {
          const fieldId = normalizeGuidedLineFieldId(groupId, field?.id);
          return fieldId && !!allowedFieldIds?.has(fieldId);
        })
      : lineConfig.fields || [];
    const filteredFields = applyReadOnlyLabels(
      groupId,
      filteredFieldsBase as any[],
      target.readOnlyFields,
      renderAsLabelFieldIdsFromFields
    );

    const presentationRaw = ((target.presentation || 'groupEditor') as any).toString().trim().toLowerCase();
    const presentation: 'groupEditor' | 'liftedRowFields' =
      presentationRaw === 'liftedrowfields' ? 'liftedRowFields' : 'groupEditor';
    const parentFieldsScoped = target.fields !== undefined && target.fields !== null;

    const subGroupsConfigPresent = !!target.subGroups && typeof target.subGroups === 'object';
    const subIncludeRaw = subGroupsConfigPresent ? target.subGroups?.include : undefined;
    const subIncludeList: any[] = Array.isArray(subIncludeRaw) ? subIncludeRaw : subIncludeRaw ? [subIncludeRaw] : [];
    const allowedSubIds = subIncludeList
      .map(sub => (sub?.id !== undefined && sub?.id !== null ? sub.id.toString().trim() : ''))
      .filter(Boolean);
    const allowedSubSet = allowedSubIds.length ? new Set(allowedSubIds) : null;
    const filteredSubGroups = (() => {
      const subGroups = (lineConfig.subGroups || []) as any[];
      if (!subGroups.length) return subGroups;
      // In guided steps, subgroup validation should be explicit whenever the step scopes parent fields.
      // This avoids blocking a step on subgroup fields that are not reachable from that step.
      if (!subGroupsConfigPresent && (presentation === 'liftedRowFields' || parentFieldsScoped)) return [];
      const kept = allowedSubSet
        ? subGroups.filter(subGroup => {
            const subGroupId = resolveSubgroupKey(subGroup as any);
            return subGroupId && allowedSubSet.has(subGroupId);
          })
        : subGroups;
      return kept.map(subGroup => {
        const subGroupId = resolveSubgroupKey(subGroup as any);
        const subTarget = subIncludeList.find(
          sub => (sub?.id !== undefined && sub?.id !== null ? sub.id.toString().trim() : '') === subGroupId
        );
        const {
          allowed: allowedSubFields,
          renderAsLabel: renderAsLabelSubFieldIdsFromFields,
          explicit: hasExplicitSubFieldScope
        } = parseGuidedTargetFieldEntries(subGroupId, subTarget?.fields);

        const nextSubGroup: any = { ...(subGroup as any) };
        // Guided-step validation needs row filters + expandGate metadata even when we filter fields.
        nextSubGroup._guidedRowFilter = subTarget?.validationRows ?? subTarget?.rows;
        nextSubGroup._expandGateFields = (subGroup as any).fields || [];

        if (hasExplicitSubFieldScope) {
          nextSubGroup.fields = ((subGroup as any).fields || []).filter((field: any) => {
            const fieldId = normalizeGuidedLineFieldId(subGroupId, field?.id);
            return fieldId && !!allowedSubFields?.has(fieldId);
          });
        }
        nextSubGroup.fields = applyReadOnlyLabels(
          subGroupId,
          nextSubGroup.fields || (subGroup as any).fields || [],
          subTarget?.readOnlyFields,
          renderAsLabelSubFieldIdsFromFields
        );
        return nextSubGroup;
      });
    })();

    const stepLineConfig: any = { ...(lineConfig as any), fields: filteredFields, subGroups: filteredSubGroups };
    // Guided-step validation needs row filters + expandGate metadata even when we filter fields.
    stepLineConfig._guidedRowFilter = target.validationRows ?? target.rows;
    stepLineConfig._expandGateFields = (lineConfig as any).fields || [];
    if (target.collapsedFieldsInHeader === true) {
      stepLineConfig.ui = { ...(stepLineConfig.ui || {}), guidedCollapsedFieldsInHeader: true };
    }
    scopedQuestions.push({ ...(question as any), lineItemConfig: stepLineConfig } as WebQuestionDefinition);
  });

  return { ...(args.definition as any), questions: scopedQuestions } as WebFormDefinition;
};
