import React from 'react';

export const InfoTooltip: React.FC<{
  text?: string;
  label?: string;
  onOpen?: (title: string, text: string) => void;
}> = ({ text, label, onOpen }) => {
  if (!text) return null;
  const normalizedLabel = (label || '').trim();
  const title = normalizedLabel || 'Info';
  const buttonText = normalizedLabel || 'i';
  return (
    <button
      type="button"
      className="info-button"
      onClick={() => onOpen?.(title, text)}
      aria-label={`${title}`}
    >
      {buttonText}
    </button>
  );
};



