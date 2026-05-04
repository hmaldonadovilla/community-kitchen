import React from 'react';

import type { LangCode } from '../../../../types';
import { resolveLocalizedString } from '../../../../i18n';
import { buttonStyles, PencilIcon, PlusIcon, TrashIcon, withDisabled, XIcon } from '../../../components/form/ui';
import { withListRowActionButtonStyle } from './lineItemActionButtonStyle';

/**
 * Owner: line item row-flow renderer.
 * Renders a configured row-flow action control. It is presentational; action
 * planning and row mutation stay in LineItemGroupQuestion and are injected.
 */
export const RowFlowActionControl: React.FC<{
  action: any;
  language: LangCode;
  disabled?: boolean;
  onRun: () => void;
}> = ({ action, language, disabled, onRun }) => {
  if (!action) return null;
  const label = resolveLocalizedString(action.label, language, action.id);
  const iconKey = (action.icon || '').toString().trim().toLowerCase();
  const variant = (action.variant || (iconKey ? 'icon' : 'button')).toString().trim().toLowerCase();
  const tone = (action.tone || 'primary').toString().trim().toLowerCase() === 'secondary' ? 'secondary' : 'primary';
  const toneStyle = tone === 'secondary' ? buttonStyles.secondary : buttonStyles.primary;
  const actionLabel = label || action.id;
  const handleClick = () => {
    if (disabled) return;
    onRun();
  };

  if (variant === 'icon' || iconKey) {
    const iconNode =
      iconKey === 'remove' ? (
        <TrashIcon size={40} />
      ) : iconKey === 'add' ? (
        <PlusIcon size={40} />
      ) : iconKey === 'back' ? (
        <XIcon size={40} />
      ) : (
        <PencilIcon size={40} />
      );
    return (
      <button
        key={action.id}
        type="button"
        aria-label={actionLabel}
        title={actionLabel}
        onClick={handleClick}
        disabled={disabled}
        style={withDisabled(toneStyle, disabled)}
      >
        {iconNode}
      </button>
    );
  }

  return (
    <button
      key={action.id}
      type="button"
      className="ck-list-row-action-btn"
      onClick={handleClick}
      disabled={disabled}
      style={withListRowActionButtonStyle(disabled, undefined, toneStyle)}
    >
      {actionLabel}
    </button>
  );
};
