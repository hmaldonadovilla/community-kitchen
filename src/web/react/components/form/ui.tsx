import React from 'react';

export const srOnly: React.CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
  whiteSpace: 'nowrap',
  border: 0
};

export const RequiredStar = () => (
  <span className="required-star" aria-hidden="true" style={{ marginLeft: 4 }}>
    *
  </span>
);

export const UploadIcon: React.FC<{ size?: number }> = ({ size = 28 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    focusable="false"
  >
    <path d="M12 3v10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M8 7l4-4 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M4 13v6h16v-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const buttonBase: React.CSSProperties = {
  padding: '14px 22px',
  minHeight: 'var(--control-height)',
  borderRadius: 12,
  fontWeight: 800,
  border: '1px solid transparent',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  lineHeight: 1,
  gap: 10
};

export const buttonStyles = {
  primary: {
    ...buttonBase,
    background: 'var(--accent)',
    borderColor: 'transparent',
    color: '#ffffff'
  },
  secondary: {
    ...buttonBase,
    background: 'rgba(118, 118, 128, 0.12)',
    borderColor: 'var(--border)',
    color: 'var(--text)'
  },
  negative: {
    ...buttonBase,
    background: 'rgba(255, 59, 48, 0.08)',
    borderColor: 'rgba(255, 59, 48, 0.35)',
    color: 'var(--danger)'
  }
} as const;

export const withDisabled = (style: React.CSSProperties, disabled?: boolean): React.CSSProperties =>
  disabled
    ? {
        ...style,
        opacity: 0.6,
        cursor: 'not-allowed'
      }
    : style;


