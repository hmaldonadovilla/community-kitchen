import React, { useCallback, useMemo, useRef } from 'react';

const toNumberOrNull = (raw: unknown): number | null => {
  if (raw === undefined || raw === null) return null;
  const s = raw.toString().trim();
  if (!s) return null;
  const normalized = s.includes(',') && !s.includes('.') ? s.replace(',', '.') : s;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
};

export const NumberStepper: React.FC<{
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  readOnly?: boolean;
  step?: number;
  ariaLabel?: string;
}> = ({ value, onChange, disabled, readOnly, step, ariaLabel }) => {
  const effectiveStep = typeof step === 'number' && Number.isFinite(step) && step > 0 ? step : 1;
  const inputRef = useRef<HTMLInputElement | null>(null);

  const currentNum = useMemo(() => toNumberOrNull(value), [value]);

  const applyDelta = useCallback(
    (delta: number) => {
      if (disabled || readOnly) return;
      const base = currentNum ?? 0;
      const next = base + delta;
      // Preserve "integer-like" display when step is an integer.
      const nextText =
        Number.isInteger(effectiveStep) && Number.isInteger(next) ? next.toString() : next.toString();
      onChange(nextText);
      // Keep focus in the input so the onBlur-derived recompute doesn't fire while tapping +/−.
      inputRef.current?.focus?.();
    },
    [currentNum, disabled, effectiveStep, onChange, readOnly]
  );

  const preventStealFocus = (e: React.SyntheticEvent) => {
    // Prevent the button from taking focus away from the input (mobile-friendly).
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div className="ck-number-stepper" data-number-stepper="true">
      <button
        type="button"
        className="ck-number-stepper-btn minus"
        aria-label="Decrease"
        disabled={!!disabled || !!readOnly}
        onMouseDown={preventStealFocus}
        onTouchStart={preventStealFocus}
        onPointerDown={preventStealFocus}
        onClick={() => applyDelta(-effectiveStep)}
      >
        −
      </button>
      <input
        ref={el => {
          inputRef.current = el;
        }}
        type="number"
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        readOnly={readOnly}
        aria-label={ariaLabel}
      />
      <button
        type="button"
        className="ck-number-stepper-btn plus"
        aria-label="Increase"
        disabled={!!disabled || !!readOnly}
        onMouseDown={preventStealFocus}
        onTouchStart={preventStealFocus}
        onPointerDown={preventStealFocus}
        onClick={() => applyDelta(effectiveStep)}
      >
        +
      </button>
    </div>
  );
};


