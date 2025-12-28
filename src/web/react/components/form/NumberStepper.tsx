import React, { useRef } from 'react';

export const NumberStepper: React.FC<{
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  readOnly?: boolean;
  step?: number;
  ariaLabel?: string;
}> = ({ value, onChange, disabled, readOnly, step, ariaLabel }) => {
  const effectiveStep = typeof step === 'number' && Number.isFinite(step) && step > 0 ? step : undefined;
  const inputRef = useRef<HTMLInputElement | null>(null);

  return (
    <div className="ck-number-stepper" data-number-stepper="true">
      <input
        ref={el => {
          inputRef.current = el;
        }}
        type="number"
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        readOnly={readOnly}
        step={effectiveStep}
        aria-label={ariaLabel}
      />
    </div>
  );
};


