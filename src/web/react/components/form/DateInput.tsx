import React, { useMemo, useState } from 'react';
import type { LangCode } from '../../../types';
import { formatDateEeeDdMmmYyyy } from '../../utils/valueDisplay';

/**
 * DATE input wrapper that keeps the native calendar, but overlays a formatted display value
 * (EEE, dd-MMM-yyyy) when the control is not focused.
 */
export const DateInput: React.FC<{
  id?: string;
  value: string;
  onChange: (value: string) => void;
  language: LangCode;
  readOnly?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
}> = ({ id, value, onChange, language, readOnly, disabled, ariaLabel }) => {
  const [focused, setFocused] = useState(false);
  const [typing, setTyping] = useState(false);
  const isDisabled = Boolean(disabled || readOnly);

  const isValidYmd = /^\d{4}-\d{2}-\d{2}$/.test((value || '').trim());
  // Show overlay when:
  // - there's a valid value AND
  // - the user is not actively typing (date pickers don't trigger keydown)
  const showOverlay = Boolean(isValidYmd && (!focused || !typing));

  const display = useMemo(() => {
    if (!showOverlay) return '';
    return formatDateEeeDdMmmYyyy(value, language);
  }, [language, showOverlay, value]);

  return (
    <div className="ck-date-input-wrap">
      <input
        id={id}
        type="date"
        className={`ck-date-input${showOverlay ? ' ck-date-input--overlay' : ''}`}
        value={value}
        onChange={e => {
          if (isDisabled) return;
          onChange(e.target.value);
        }}
        readOnly={readOnly}
        disabled={isDisabled}
        aria-label={ariaLabel}
        onFocus={() => {
          if (isDisabled) return;
          setFocused(true);
          setTyping(false);
        }}
        onBlur={() => {
          setFocused(false);
          setTyping(false);
        }}
        onKeyDown={() => {
          if (isDisabled) return;
          setTyping(true);
        }}
      />
      {showOverlay && display ? (
        <div className="ck-date-overlay" aria-hidden="true">
          {display}
        </div>
      ) : null}
    </div>
  );
};


