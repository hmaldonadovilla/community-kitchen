import React from 'react';
import { buttonStyles } from '../ui';
import { FullPageOverlay } from './FullPageOverlay';

export type InfoOverlayProps = {
  open: boolean;
  title: string;
  text: string;
  onClose: () => void;
};

export const InfoOverlay: React.FC<InfoOverlayProps> = ({ open, title, text, onClose }) => {
  if (!open) return null;
  if (!text) return null;

  return (
    <FullPageOverlay
      open={open}
      zIndex={10020}
      title={title || 'Info'}
      rightAction={
        <button type="button" onClick={onClose} style={buttonStyles.secondary}>
          Close
        </button>
      }
    >
      <div style={{ padding: 16, overflowY: 'auto', flex: 1, whiteSpace: 'pre-wrap', lineHeight: 1.75 }}>
        {text}
      </div>
    </FullPageOverlay>
  );
};


