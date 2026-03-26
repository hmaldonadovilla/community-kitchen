import React, { useCallback, useRef } from 'react';
import { isAllowedNumberInputKey, isAllowedNumberInputText } from './numberInput';

export const NumberStepper: React.FC<{
  value: string;
  onChange: (next: string) => void;
  onInvalidInput?: (args: { reason: 'key' | 'paste'; value: string }) => void;
  disabled?: boolean;
  readOnly?: boolean;
  step?: number;
  inputType?: 'number' | 'text';
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode'];
  ariaLabel?: string;
  ariaDescribedBy?: string;
  placeholder?: string;
  style?: React.CSSProperties;
  inputStyle?: React.CSSProperties;
  className?: string;
  selectAllOnFocus?: boolean;
}> = ({
  value,
  onChange,
  onInvalidInput,
  disabled,
  readOnly,
  step,
  inputType,
  inputMode,
  ariaLabel,
  ariaDescribedBy,
  placeholder,
  style,
  inputStyle,
  className,
  selectAllOnFocus
}) => {
  const effectiveStep = typeof step === 'number' && Number.isFinite(step) && step > 0 ? step : undefined;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const focusSelectPendingRef = useRef(false);

  const selectInputValue = useCallback(() => {
    if (!selectAllOnFocus) return;
    const input = inputRef.current;
    if (!input) return;
    globalThis.setTimeout(() => {
      try {
        input.select();
      } catch (_) {}
    }, 0);
  }, [selectAllOnFocus]);

  const handleInvalidText = (args: { reason: 'key' | 'paste'; value: string }) => {
    if (!onInvalidInput) return;
    const valueText = (args.value || '').toString();
    if (!valueText.trim()) return;
    onInvalidInput({ reason: args.reason, value: valueText });
  };

  return (
    <div className={className ? `ck-number-stepper ${className}` : 'ck-number-stepper'} data-number-stepper="true" style={style}>
      <input
        ref={el => {
          inputRef.current = el;
        }}
        type={inputType || 'number'}
        inputMode={inputMode}
        value={value}
        onChange={e => onChange(e.target.value)}
        onFocus={e => {
          if (!selectAllOnFocus) return;
          focusSelectPendingRef.current = true;
          globalThis.setTimeout(() => {
            if (!focusSelectPendingRef.current) return;
            try {
              e.currentTarget.select();
            } catch (_) {}
          }, 0);
        }}
        onClick={() => {
          if (!selectAllOnFocus) return;
          selectInputValue();
        }}
        onBlur={() => {
          focusSelectPendingRef.current = false;
        }}
        onKeyDown={e => {
          if (!onInvalidInput) return;
          if (disabled || readOnly) return;
          if (e.defaultPrevented) return;
          if (e.ctrlKey || e.metaKey || e.altKey) return;
          const key = (e.key || '').toString();
          if (isAllowedNumberInputKey(key)) return;
          e.preventDefault();
          handleInvalidText({ reason: 'key', value: key });
        }}
        onPaste={e => {
          if (!onInvalidInput) return;
          if (disabled || readOnly) return;
          const text = e.clipboardData?.getData('text') || '';
          const trimmed = text.trim();
          if (!trimmed) return;
          if (isAllowedNumberInputText(trimmed)) return;
          e.preventDefault();
          handleInvalidText({ reason: 'paste', value: trimmed });
        }}
        disabled={disabled}
        readOnly={readOnly}
        step={effectiveStep}
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        placeholder={placeholder}
        style={inputStyle}
      />
    </div>
  );
};
