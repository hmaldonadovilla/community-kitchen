import React from 'react';

export const SourceFirstSelectionCheckbox: React.FC<{
  checked: boolean;
  onChange: (checked: boolean) => void;
  variant?: 'allocation' | 'row';
}> = ({ checked, onChange, variant = 'row' }) => (
  <label
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 44,
      minWidth: 44,
      flex: '0 0 auto',
      paddingTop: variant === 'row' ? 2 : 0,
      ...(variant === 'row' ? { paddingRight: 0 } : {})
    }}
  >
    <input
      type="checkbox"
      checked={checked}
      onChange={event => onChange(event.target.checked)}
      style={{
        width: 36,
        height: 36,
        margin: 0,
        accentColor: 'var(--accent)',
        transform: 'scale(1.36)',
        transformOrigin: 'center'
      }}
    />
  </label>
);
