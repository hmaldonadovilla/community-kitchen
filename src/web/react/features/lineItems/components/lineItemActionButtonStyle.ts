import React from 'react';

import { buttonStyles, withDisabled } from '../../../components/form/ui';

/**
 * Owner: line item form renderer.
 * Centralizes the fixed-width action button style used by line-item rows and
 * overlay action controls. This module should stay UI-only.
 */

const LIST_ROW_ACTION_BUTTON_WIDTH = 'var(--ck-list-row-action-width)';

const listRowActionButtonWidthStyle: React.CSSProperties = {
  width: 'fit-content',
  minWidth: `min(${LIST_ROW_ACTION_BUTTON_WIDTH}, 100%)`,
  maxWidth: '100%'
};

const listRowActionButtonBaseStyle: React.CSSProperties = {
  ...buttonStyles.primary,
  ...listRowActionButtonWidthStyle
};

export const withListRowActionButtonStyle = (
  disabled?: boolean,
  overrides?: React.CSSProperties,
  baseStyle: React.CSSProperties = listRowActionButtonBaseStyle
): React.CSSProperties => withDisabled({ ...baseStyle, ...listRowActionButtonWidthStyle, ...(overrides || {}) }, disabled);
