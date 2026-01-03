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

export const CameraIcon: React.FC<{ size?: number; style?: React.CSSProperties; className?: string }> = ({
  size = 28,
  style,
  className
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    focusable="false"
    className={className}
    style={{ width: size, height: size, ...(style as React.CSSProperties) }}
  >
    <path
      d="M4 7h3l2-2h6l2 2h3a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    />
    <circle cx="12" cy="14" r="3.5" stroke="currentColor" strokeWidth="2" />
  </svg>
);

export const EyeIcon: React.FC<{ size?: number; style?: React.CSSProperties; className?: string }> = ({
  size = 24,
  style,
  className
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    focusable="false"
    className={className}
    style={{ width: size, height: size, ...(style as React.CSSProperties) }}
  >
    <path
      d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    />
    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2" />
  </svg>
);

export const CheckIcon: React.FC<{ size?: number; style?: React.CSSProperties; className?: string }> = ({
  size = 22,
  style,
  className
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    focusable="false"
    className={className}
    style={{ width: size, height: size, ...(style as React.CSSProperties) }}
  >
    <path
      d="M20 6L9 17l-5-5"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const XIcon: React.FC<{ size?: number; style?: React.CSSProperties; className?: string }> = ({
  size = 22,
  style,
  className
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    focusable="false"
    className={className}
    style={{ width: size, height: size, ...(style as React.CSSProperties) }}
  >
    <path d="M18 6L6 18" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M6 6l12 12" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const PaperclipIcon: React.FC<{ size?: number; style?: React.CSSProperties; className?: string }> = ({
  size = 24,
  style,
  className
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    focusable="false"
    className={className}
    style={{ width: size, height: size, ...(style as React.CSSProperties) }}
  >
    <path
      d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.19 9.19a2 2 0 0 1-2.83-2.83l8.48-8.48"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const PlusIcon: React.FC<{ size?: number }> = ({ size = 28 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    focusable="false"
  >
    <path d="M12 5v14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M5 12h14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
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
    background: 'var(--ck-secondary-bg)',
    borderColor: 'var(--ck-secondary-border)',
    color: 'var(--ck-secondary-text)'
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


