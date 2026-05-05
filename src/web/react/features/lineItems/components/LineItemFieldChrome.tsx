import React from 'react';

import type { LangCode } from '../../../../types';
import { resolveFieldLabel } from '../../../utils/labels';
import { PairedRowGrid } from '../../../components/form/PairedRowGrid';
import { RequiredStar, srOnly } from '../../../components/form/ui';
import { LineItemOverlayResetButton } from './LineItemOverlayResetButton';
import { withListRowActionButtonStyle } from './lineItemActionButtonStyle';

type FlattenPlacement = 'left' | 'right' | 'below';

export const LineItemReadOnlyField: React.FC<{
  field: any;
  fieldPath: string;
  language: LangCode;
  forceStackedLabel: boolean;
  fieldIsStacked: boolean;
  labelStyle?: React.CSSProperties;
  error?: React.ReactNode;
  hasWarning?: boolean;
  renderWarnings: () => React.ReactNode;
  nonMatchWarningNode?: React.ReactNode;
  display: React.ReactNode;
  subgroupOpenInline?: React.ReactNode;
  subgroupOpenStack?: React.ReactNode;
  stackedInlinePlacement?: 'afterValue' | 'labelRow';
}> = ({
  field,
  fieldPath,
  language,
  forceStackedLabel,
  fieldIsStacked,
  labelStyle,
  error,
  hasWarning,
  renderWarnings,
  nonMatchWarningNode,
  display,
  subgroupOpenInline,
  subgroupOpenStack,
  stackedInlinePlacement = 'afterValue'
}) => {
  const cls = `${field.type === 'PARAGRAPH' ? 'field inline-field ck-full-width' : 'field inline-field'}${
    forceStackedLabel ? ' ck-label-stacked' : ''
  } ck-readonly-field`;
  const label = (
    <label style={labelStyle}>
      {resolveFieldLabel(field, language, field.id)}
      {field.required && <RequiredStar />}
    </label>
  );
  const showInlineInLabelRow = fieldIsStacked && stackedInlinePlacement === 'labelRow';
  const inlineAfterValue = fieldIsStacked && stackedInlinePlacement === 'afterValue' ? subgroupOpenInline : null;
  const stackAfterValue = fieldIsStacked ? null : subgroupOpenStack;

  return (
    <div
      className={cls}
      data-field-path={fieldPath}
      data-has-error={error ? 'true' : undefined}
      data-has-warning={hasWarning ? 'true' : undefined}
    >
      {showInlineInLabelRow ? (
        <div className="ck-label-row">
          {label}
          {subgroupOpenInline}
        </div>
      ) : (
        label
      )}
      <div className="ck-readonly-value">{display ?? <span className="muted">—</span>}</div>
      {inlineAfterValue}
      {stackAfterValue}
      {error ? <div className="error">{error}</div> : null}
      {renderWarnings()}
      {nonMatchWarningNode}
    </div>
  );
};

export const LineItemOverlayOpenReplaceField: React.FC<{
  field: any;
  fieldPath: string;
  language: LangCode;
  forceStackedLabel: boolean;
  labelStyle?: React.CSSProperties;
  error?: React.ReactNode;
  hasWarning?: boolean;
  renderWarnings: () => React.ReactNode;
  nonMatchWarningNode?: React.ReactNode;
  buttonLabel: React.ReactNode;
  onOpen: () => void;
  openDisabled?: boolean;
  showResetButton: boolean;
  onReset: () => void;
  resetDisabled?: boolean;
  baseStyle: React.CSSProperties;
  flattenPlacement: FlattenPlacement;
  renderFlattenedFields: (
    placement: FlattenPlacement,
    options?: { asGridItems?: boolean; forceStackedLabel?: boolean }
  ) => React.ReactNode;
}> = ({
  field,
  fieldPath,
  language,
  forceStackedLabel,
  labelStyle,
  error,
  hasWarning,
  renderWarnings,
  nonMatchWarningNode,
  buttonLabel,
  onOpen,
  openDisabled,
  showResetButton,
  onReset,
  resetDisabled,
  baseStyle,
  flattenPlacement,
  renderFlattenedFields
}) => {
  const actionRow = (
    <div style={{ display: 'inline-flex', alignItems: 'stretch' }}>
      <button
        type="button"
        className="ck-list-row-action-btn"
        onClick={onOpen}
        disabled={openDisabled}
        style={withListRowActionButtonStyle(
          openDisabled,
          showResetButton ? { borderTopRightRadius: 0, borderBottomRightRadius: 0, borderRight: '0' } : undefined,
          baseStyle
        )}
      >
        {buttonLabel}
      </button>
      {showResetButton ? (
        <LineItemOverlayResetButton
          language={language}
          onReset={onReset}
          disabled={resetDisabled}
          baseStyle={baseStyle}
        />
      ) : null}
    </div>
  );

  const flattenedGridItems =
    flattenPlacement !== 'below'
      ? renderFlattenedFields(flattenPlacement, { asGridItems: true, forceStackedLabel: true })
      : null;
  const gridItems = Array.isArray(flattenedGridItems) ? flattenedGridItems : null;
  if (gridItems && gridItems.length) {
    const gridLabelStyle =
      labelStyle === srOnly ? ({ opacity: 0, pointerEvents: 'none' } as React.CSSProperties) : labelStyle;
    const actionField = (
      <div
        key={`${fieldPath}::overlayOpenAction`}
        className={`field inline-field${forceStackedLabel ? ' ck-label-stacked' : ''}`}
        data-field-path={fieldPath}
        data-has-error={error ? 'true' : undefined}
        data-has-warning={hasWarning ? 'true' : undefined}
      >
        <label style={gridLabelStyle}>
          {resolveFieldLabel(field, language, field.id)}
          {field.required && <RequiredStar />}
        </label>
        <div className="ck-control-row">{actionRow}</div>
        {error ? <div className="error">{error}</div> : null}
        {renderWarnings()}
        {nonMatchWarningNode}
      </div>
    );
    const items = flattenPlacement === 'left' ? [...gridItems, actionField] : [actionField, ...gridItems];
    const gridClassName = `ck-pair-grid${items.length >= 3 ? ' ck-pair-grid--3' : ''}`;
    return (
      <div
        className={`${field.type === 'PARAGRAPH' ? 'field inline-field ck-full-width' : 'field inline-field'}${
          forceStackedLabel ? ' ck-label-stacked' : ''
        }`}
      >
        <label style={srOnly} aria-hidden="true">
          {resolveFieldLabel(field, language, field.id)}
          {field.required && <RequiredStar />}
        </label>
        <PairedRowGrid className={gridClassName}>{items}</PairedRowGrid>
      </div>
    );
  }

  const flattenedFields = renderFlattenedFields(flattenPlacement, { forceStackedLabel });
  const actionBlock =
    flattenPlacement !== 'below' && flattenedFields ? (
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
          gap: 12,
          alignItems: 'start'
        }}
      >
        {flattenPlacement === 'left' ? flattenedFields : null}
        <div>{actionRow}</div>
        {flattenPlacement === 'right' ? flattenedFields : null}
      </div>
    ) : (
      <>
        {actionRow}
        {flattenedFields}
      </>
    );

  return (
    <div
      className={`${field.type === 'PARAGRAPH' ? 'field inline-field ck-full-width' : 'field inline-field'}${
        forceStackedLabel ? ' ck-label-stacked' : ''
      }`}
      data-field-path={fieldPath}
      data-has-error={error ? 'true' : undefined}
      data-has-warning={hasWarning ? 'true' : undefined}
    >
      <label style={labelStyle}>
        {resolveFieldLabel(field, language, field.id)}
        {field.required && <RequiredStar />}
      </label>
      {actionBlock}
      {error ? <div className="error">{error}</div> : null}
      {renderWarnings()}
      {nonMatchWarningNode}
    </div>
  );
};

export const LineItemOverlayOpenInlineButton: React.FC<{
  buttonLabel: React.ReactNode;
  onOpen: () => void;
  disabled?: boolean;
  baseStyle: React.CSSProperties;
}> = ({ buttonLabel, onOpen, disabled, baseStyle }) => (
  <div style={{ marginTop: 8 }}>
    <button
      type="button"
      className="ck-list-row-action-btn"
      onClick={onOpen}
      disabled={disabled}
      style={withListRowActionButtonStyle(disabled, undefined, baseStyle)}
    >
      {buttonLabel}
    </button>
  </div>
);
