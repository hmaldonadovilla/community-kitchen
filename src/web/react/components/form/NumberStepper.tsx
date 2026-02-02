import React, { useRef } from 'react';
import { isAllowedNumberInputKey, isAllowedNumberInputText } from './numberInput';

export const NumberStepper: React.FC<{
  value: string;
  onChange: (next: string) => void;
  onInvalidInput?: (args: { reason: 'key' | 'paste'; value: string }) => void;
  disabled?: boolean;
  readOnly?: boolean;
  step?: number;
  ariaLabel?: string;
  ariaDescribedBy?: string;
  placeholder?: string;
}> = ({ value, onChange, onInvalidInput, disabled, readOnly, step, ariaLabel, ariaDescribedBy, placeholder }) => {
  const effectiveStep = typeof step === 'number' && Number.isFinite(step) && step > 0 ? step : undefined;
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleInvalidText = (args: { reason: 'key' | 'paste'; value: string }) => {
    if (!onInvalidInput) return;
    const valueText = (args.value || '').toString();
    if (!valueText.trim()) return;
    onInvalidInput({ reason: args.reason, value: valueText });
  };

  return (
    <div className="ck-number-stepper" data-number-stepper="true">
      <input
        ref={el => {
          inputRef.current = el;
        }}
        type="number"
        value={value}
        onChange={e => onChange(e.target.value)}
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
      />
    </div>
  );
};
