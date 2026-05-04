import React from 'react';

import type { LangCode } from '../../../../types';
import { tSystem } from '../../../../systemStrings';
import { TrashIcon } from '../../../components/form/ui';

/**
 * Owner: line item UI.
 * Standard remove action for reversible line/subline removal.
 */
export const LineItemRemoveButton: React.FC<{
  language: LangCode;
  onRemove: () => void;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
  iconSize?: number;
}> = ({ language, onRemove, disabled, className = 'ck-line-item-table__remove-button', style, iconSize = 40 }) => {
  const label = tSystem('lineItems.remove', language, 'Remove');
  return (
    <button
      type="button"
      className={className}
      onClick={onRemove}
      disabled={disabled}
      aria-label={label}
      title={label}
      style={style}
    >
      <TrashIcon size={iconSize} />
    </button>
  );
};
