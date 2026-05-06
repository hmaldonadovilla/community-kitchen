import { resolveLocalizedString } from '../../../i18n';
import type { LangCode, RowFlowOutputSegmentConfig, WebQuestionDefinition } from '../../../types';
import { normalizeLineItemDedupRules } from '../../app/lineItems';
import { collectLineItemConfigEntries } from '../../features/lineItems/domain/formViewHelpers';
import { resolveRowFlowSegmentActionIds } from '../../features/steps/domain/rowFlow';

export type GuidedRowFlowTargetDiagnostic = {
  stepId: string;
  groupId: string;
  mode: string;
};

export type GuidedRowFlowSegmentActionDiagnostic = {
  stepId: string;
  groupId: string;
  segmentsWithActions: number;
  multiActionSegments: number;
};

export type FoodSafetyDiagnosticPayloads = {
  helperText: { stepId: string; enabled: boolean; length: number };
  fields: {
    groupId: string | null;
    leftoverField: boolean;
    tempFieldType: string | null;
    tempConsent: boolean;
  };
} | null;

export const collectSelectorOverlayGroups = (questions: WebQuestionDefinition[]): string[] =>
  (questions || [])
    .filter(q => q.type === 'LINE_ITEM_GROUP')
    .map(q => ({ id: q.id, addMode: (q.lineItemConfig as any)?.addMode }))
    .filter(entry => {
      const mode = (entry.addMode || '').toString().trim().toLowerCase();
      return mode === 'selectoroverlay' || mode === 'selector-overlay';
    })
    .map(entry => entry.id);

export const collectSelectorOverlayHelperGroups = (questions: WebQuestionDefinition[]): string[] =>
  collectLineItemConfigEntries(questions || [])
    .filter(entry => {
      const selector = entry.config?.sectionSelector;
      if (!selector) return false;
      return Boolean(selector.helperText || selector.helperTextEn || selector.helperTextFr || selector.helperTextNl);
    })
    .map(entry => entry.id);

export const collectAddOverlayCopyGroups = (questions: WebQuestionDefinition[]): string[] =>
  collectLineItemConfigEntries(questions || [])
    .filter(entry => {
      const cfg = entry.config?.addOverlay;
      return Boolean(cfg && (cfg.title || cfg.helperText || cfg.placeholder));
    })
    .map(entry => entry.id);

export const collectNonMatchWarningModeGroups = (
  questions: WebQuestionDefinition[]
): Array<{ id: string; mode: string }> =>
  (questions || [])
    .filter(q => q.type === 'LINE_ITEM_GROUP')
    .map(q => {
      const raw = (q.lineItemConfig?.ui as any)?.nonMatchWarningMode;
      if (raw === undefined || raw === null || raw === '') return null;
      const candidate = raw.toString().trim().toLowerCase();
      const mode =
        candidate === 'validation' || candidate === 'rules' || candidate === 'rule' || candidate === 'generic'
          ? 'validation'
          : candidate === 'both' || candidate === 'all'
            ? 'both'
            : 'descriptive';
      return { id: q.id, mode };
    })
    .filter(Boolean) as Array<{ id: string; mode: string }>;

export const collectLineItemDedupGroups = (
  questions: WebQuestionDefinition[]
): Array<{ id: string; rules: string[][] }> =>
  (questions || [])
    .filter(q => q.type === 'LINE_ITEM_GROUP')
    .map(q => {
      const rules = normalizeLineItemDedupRules((q.lineItemConfig as any)?.dedupRules);
      if (!rules.length) return null;
      return {
        id: q.id,
        rules: rules.map(rule => rule.fields)
      };
    })
    .filter(Boolean) as Array<{ id: string; rules: string[][] }>;

export const collectOverlayDetailGroups = (questions: WebQuestionDefinition[]): string[] =>
  (questions || [])
    .filter(q => q.type === 'LINE_ITEM_GROUP' && (q as any)?.lineItemConfig?.ui?.overlayDetail?.enabled === true)
    .map(q => q.id);

export const collectGuidedRowFlowTargets = (
  guidedVisibleSteps: any[]
): GuidedRowFlowTargetDiagnostic[] => {
  const targets: GuidedRowFlowTargetDiagnostic[] = [];
  (guidedVisibleSteps || []).forEach(step => {
    const stepId = (step?.id || '').toString();
    const includes = Array.isArray(step?.include) ? step.include : [];
    includes.forEach((target: any) => {
      if (!target || typeof target !== 'object') return;
      const kind = (target.kind || '').toString().trim();
      if (kind !== 'lineGroup') return;
      const groupId = (target.id || '').toString().trim();
      if (!groupId || !target.rowFlow) return;
      const mode = (target.rowFlow?.mode || 'progressive').toString();
      targets.push({ stepId, groupId, mode });
    });
  });
  return targets;
};

export const collectGuidedRowFlowSegmentActionTargets = (
  guidedVisibleSteps: any[]
): GuidedRowFlowSegmentActionDiagnostic[] => {
  const targets: GuidedRowFlowSegmentActionDiagnostic[] = [];
  (guidedVisibleSteps || []).forEach(step => {
    const stepId = (step?.id || '').toString();
    const includes = Array.isArray(step?.include) ? step.include : [];
    includes.forEach((target: any) => {
      if (!target || typeof target !== 'object') return;
      const kind = (target.kind || '').toString().trim();
      if (kind !== 'lineGroup') return;
      const groupId = (target.id || '').toString().trim();
      if (!groupId || !target.rowFlow) return;
      const segments = (target.rowFlow?.output?.segments || []) as RowFlowOutputSegmentConfig[];
      if (!segments.length) return;
      const segmentActions: string[][] = segments.map(segment => resolveRowFlowSegmentActionIds(segment));
      const segmentsWithActions = segmentActions.filter(ids => ids.length > 0);
      if (!segmentsWithActions.length) return;
      const multiActionSegments = segmentActions.filter(ids => ids.length > 1).length;
      targets.push({ stepId, groupId, segmentsWithActions: segmentsWithActions.length, multiActionSegments });
    });
  });
  return targets;
};

export const resolveFoodSafetyDiagnosticPayloads = (
  args: {
    questions: WebQuestionDefinition[];
    steps: any[];
    language: LangCode;
  }
): FoodSafetyDiagnosticPayloads => {
  const stepCfg = (args.steps || []).find(step => (step?.id || '').toString() === 'foodSafety');
  if (!stepCfg) return null;
  const group = (args.questions || []).find(q => q.id === 'MP_MEALS_REQUEST' && q.type === 'LINE_ITEM_GROUP');
  const fields = (group?.lineItemConfig?.fields || []) as any[];
  const tempField = fields.find(field => field?.id === 'MP_COOK_TEMP');
  const leftoverField = fields.find(field => field?.id === 'LEFTOVER_VAL');
  const hasConsentOptions = Array.isArray(tempField?.options) ? tempField.options.length > 0 : false;
  const isConsentCheckbox = tempField?.type === 'CHECKBOX' && !tempField?.dataSource && !hasConsentOptions;

  return {
    helperText: {
      stepId: stepCfg.id,
      enabled: Boolean(stepCfg.helpText),
      length: (stepCfg.helpText ? resolveLocalizedString(stepCfg.helpText, args.language, '') : '').length
    },
    fields: {
      groupId: group?.id || null,
      leftoverField: Boolean(leftoverField),
      tempFieldType: tempField?.type || null,
      tempConsent: isConsentCheckbox
    }
  };
};
