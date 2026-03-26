import React from 'react';

import { useAutoWidth } from './useAutoWidth';

export type AutoWidthSelectOption = {
  value: string;
  label: string;
};

export const AutoWidthSelect: React.FC<{
  value: string;
  options: AutoWidthSelectOption[];
  onChange: (nextValue: string) => void;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
  style?: React.CSSProperties;
  selectStyle?: React.CSSProperties;
  minWidth?: number;
  maxWidth?: number;
  extraWidth?: number;
  placeholder?: string;
  visible?: boolean;
}> = ({
  value,
  options,
  onChange,
  disabled,
  ariaLabel,
  className,
  style,
  selectStyle,
  minWidth,
  maxWidth,
  extraWidth,
  placeholder,
  visible
}) => {
  const selectedLabel = options.find(option => option.value === value)?.label || placeholder || 'Select…';
  const { width, rootRef, mirrorRef } = useAutoWidth(selectedLabel, {
    min: minWidth,
    max: maxWidth,
    extra: extraWidth,
    visible
  });
  const hasValue = options.some(option => option.value === value);

  return (
    <span
      ref={rootRef as React.RefObject<HTMLSpanElement>}
      className={className ? `ck-auto-width-control ck-auto-width-select-wrap ${className}` : 'ck-auto-width-control ck-auto-width-select-wrap'}
      style={{
        ...style,
        position: 'relative',
        display: 'inline-flex',
        alignItems: 'center',
        flex: '0 0 auto',
        minWidth: 0,
        width,
        inlineSize: width
      }}
    >
      <span ref={mirrorRef} className="ck-auto-width-measure">
        {selectedLabel}
      </span>
      <select
        value={hasValue ? value : ''}
        disabled={disabled}
        aria-label={ariaLabel}
        className="ck-auto-width-select"
        style={{
          ...selectStyle,
          boxSizing: 'border-box',
          flex: '0 0 auto',
          minWidth: 0,
          maxWidth: 'none',
          width,
          inlineSize: width
        }}
        onChange={e => onChange(e.target.value)}
      >
        {!hasValue ? <option value="">{selectedLabel}</option> : null}
        {options.map(option => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <span className="ck-auto-width-select__chevron" aria-hidden="true">
        ▾
      </span>
    </span>
  );
};
