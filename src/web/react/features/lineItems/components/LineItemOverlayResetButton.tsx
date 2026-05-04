import React from 'react';

import type { LangCode } from '../../../../types';
import { tSystem } from '../../../../systemStrings';
import { TrashIcon, withDisabled } from '../../../components/form/ui';

/**
 * Owner: line item overlay action UI.
 * Reset companion for overlay-open controls. The caller owns the reset action
 * and base style so this component stays presentational.
 */
export const LineItemOverlayResetButton: React.FC<{
  language: LangCode;
  onReset: () => void;
  disabled?: boolean;
  baseStyle: React.CSSProperties;
}> = ({ language, onReset, disabled, baseStyle }) => (
  <button
    type="button"
    onClick={onReset}
    disabled={disabled}
    aria-label={tSystem('lineItems.remove', language, 'Remove')}
    style={withDisabled(
      {
        ...baseStyle,
        borderTopLeftRadius: 0,
        borderBottomLeftRadius: 0,
        padding: '0 14px',
        minWidth: 44
      },
      disabled
    )}
  >
    <TrashIcon size={18} />
  </button>
);
