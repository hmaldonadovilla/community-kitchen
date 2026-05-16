import React from 'react';

export type LinkableCustomButton = {
  href?: string;
  label: string;
  disabled?: boolean;
};

export const shouldRenderCustomButtonAsLink = (button: LinkableCustomButton): button is LinkableCustomButton & { href: string } =>
  !!button.href && !button.disabled;

export const CustomActionLink: React.FC<{
  button: LinkableCustomButton & { href: string };
  className: string;
  children: React.ReactNode;
  onNavigate?: () => void;
}> = ({ button, className, children, onNavigate }) => (
  <a
    href={button.href}
    target="_blank"
    rel="noopener noreferrer"
    className={className}
    aria-label={button.label}
    onClick={onNavigate}
  >
    {children}
  </a>
);
