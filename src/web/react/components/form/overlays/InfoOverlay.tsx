import React from 'react';
import { buttonStyles } from '../ui';
import { FullPageOverlay } from './FullPageOverlay';
import type { LangCode } from '../../../../types';
import { tSystem } from '../../../../systemStrings';

export type InfoOverlayProps = {
  open: boolean;
  language: LangCode;
  title: string;
  text: string;
  onClose: () => void;
};

export const InfoOverlay: React.FC<InfoOverlayProps> = ({ open, language, title, text, onClose }) => {
  if (!open) return null;
  if (!text) return null;

  return (
    <FullPageOverlay
      open={open}
      zIndex={10020}
      title={title || tSystem('common.info', language, 'Info')}
      rightAction={
        <button type="button" onClick={onClose} style={buttonStyles.primary}>
          {tSystem('common.close', language, 'Close')}
        </button>
      }
    >
      <div style={{ padding: 16, overflowY: 'auto', flex: 1, whiteSpace: 'pre-wrap', lineHeight: 1.75 }}>
        {text}
      </div>
    </FullPageOverlay>
  );
};

