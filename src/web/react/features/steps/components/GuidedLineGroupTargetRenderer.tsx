import React from 'react';
import { resolveLocalizedString } from '../../../../i18n';
import { tSystem } from '../../../../systemStrings';
import type { LangCode, WebQuestionDefinition } from '../../../../types';
import { LineItemGroupQuestion } from '../../../components/form/LineItemGroupQuestion';
import { SectionInstruction } from '../../../components/form/SectionInstruction';
import { RequiredStar, srOnly } from '../../../components/form/ui';
import { resolveLabel } from '../../../utils/labels';
import { buildGuidedLineGroupConfig } from '../domain/guidedLineGroupConfig';

export type GuidedLineGroupTargetRendererProps = {
  target: any;
  keyPrefix: string;
  groupQ: WebQuestionDefinition;
  activeGuidedStepId: string;
  language: LangCode;
  stepLineGroupsDefaultMode: 'inline' | 'overlay' | '';
  stepSubGroupsDefaultMode: 'inline' | 'overlay' | '';
  submitting: boolean;
  errors: Record<string, string>;
  hasWarning: (fieldPath: string) => boolean;
  renderWarnings: (fieldPath: string) => React.ReactNode;
  isFieldLockedByDedup: (fieldPath: string) => boolean;
  openLineItemGroupOverlay: (groupOrId: WebQuestionDefinition | string, options?: any) => void;
  buildLineItemGroupQuestionContext: (overrides?: Record<string, any>) => any;
  onGroupOverrideApplied?: (groupId: string, keys: string[]) => void;
};

export const GuidedLineGroupTargetRenderer: React.FC<GuidedLineGroupTargetRendererProps> = ({
  target,
  keyPrefix,
  groupQ,
  activeGuidedStepId,
  language,
  stepLineGroupsDefaultMode,
  stepSubGroupsDefaultMode,
  submitting,
  errors,
  hasWarning,
  renderWarnings,
  isFieldLockedByDedup,
  openLineItemGroupOverlay,
  buildLineItemGroupQuestionContext,
  onGroupOverrideApplied
}) => {
  const id = (target?.id || '').toString().trim();
  if (!id) return null;

  const targetLabel =
    target.label !== undefined && target.label !== null
      ? resolveLocalizedString(target.label, language, '').trim()
      : '';
  const targetHelperText =
    target.helperText !== undefined && target.helperText !== null
      ? resolveLocalizedString(target.helperText, language, '').trim()
      : '';
  const {
    presentation,
    groupOverride,
    rowFilter,
    effectiveLineMode,
    hideInlineSubgroups,
    delegateTargetHelperText,
    stepLineCfg
  } = buildGuidedLineGroupConfig({
    target,
    groupQ,
    targetHelperText,
    stepLineGroupsDefaultMode,
    stepSubGroupsDefaultMode
  });

  if (groupOverride) {
    onGroupOverrideApplied?.(id, Object.keys(groupOverride || {}));
  }

  const wrapLineGroupContent = (content: React.ReactNode): React.ReactNode => {
    const wrapperHelperText = delegateTargetHelperText ? '' : targetHelperText;
    if (!targetLabel && !wrapperHelperText) return content;
    return (
      <div
        key={`${keyPrefix}:lg:${id}:section`}
        style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'stretch' }}
      >
        {targetLabel ? (
          <div style={{ fontWeight: 600, fontSize: 'var(--ck-font-group-title)', lineHeight: 1.3 }}>{targetLabel}</div>
        ) : null}
        {wrapperHelperText ? (
          <SectionInstruction
            id={`ck-linegroup-instruction-${activeGuidedStepId}-${id}`}
            language={language}
            text={wrapperHelperText}
          />
        ) : null}
        {content}
      </div>
    );
  };

  const stepGroup: WebQuestionDefinition = {
    ...(groupQ as any),
    ...(presentation === 'liftedRowFields' ? { ui: { ...((groupQ as any).ui || {}), hideLabel: true } } : {}),
    lineItemConfig: stepLineCfg
  };

  if (effectiveLineMode === 'overlay') {
    const label = resolveLabel(stepGroup, language);
    const openLabel = tSystem('common.open', language, 'Open');
    return wrapLineGroupContent(
      <div
        key={`${keyPrefix}:lg:${stepGroup.id}`}
        className="field inline-field ck-full-width"
        data-field-path={stepGroup.id}
        data-has-error={errors[stepGroup.id] ? 'true' : undefined}
        data-has-warning={hasWarning(stepGroup.id) ? 'true' : undefined}
      >
        <label style={stepGroup.ui?.hideLabel === true ? srOnly : undefined}>
          {label}
          {(stepGroup as any).required && <RequiredStar />}
        </label>
        <button
          type="button"
          className="ck-progress-pill ck-upload-pill-btn ck-open-overlay-pill"
          aria-disabled={submitting ? 'true' : undefined}
          onClick={() => {
            if (submitting) return;
            openLineItemGroupOverlay(stepGroup, { rowFilter, hideInlineSubgroups });
          }}
        >
          <span>{label}</span>
          <span className="ck-progress-label">{openLabel}</span>
          <span className="ck-progress-caret">{'\u25b8'}</span>
        </button>
        {renderWarnings(stepGroup.id)}
        {errors[stepGroup.id] ? <div className="error">{errors[stepGroup.id]}</div> : null}
      </div>
    );
  }

  const locked = submitting || isFieldLockedByDedup(stepGroup.id);
  return wrapLineGroupContent(
    <LineItemGroupQuestion
      key={`${keyPrefix}:lg:${stepGroup.id}:${activeGuidedStepId}`}
      q={stepGroup as any}
      rowFlow={target.rowFlow}
      rowFilter={rowFilter}
      dataSourceRows={Array.isArray(target.dataSourceRows) ? (target.dataSourceRows as any[]) : undefined}
      dataSourceBootstrap={target.dataSourceBootstrap || undefined}
      hideInlineSubgroups={hideInlineSubgroups}
      supplementalHelperText={delegateTargetHelperText ? targetHelperText : undefined}
      hideSupplementalHelperWhenNoSourceRows={delegateTargetHelperText}
      ctx={buildLineItemGroupQuestionContext({ submitting: locked })}
    />
  );
};
