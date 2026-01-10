import React from 'react';
import type { LangCode } from '../../../types';
import { tSystem } from '../../../systemStrings';

export type TopActionBarButton = { id: string; label: string; action?: string };

const IconWrap: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="ck-bottom-icon" aria-hidden="true">
    {children}
  </span>
);

const PlusIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" fill="none" style={{ width: '1.25em', height: '1.25em' }}>
    <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
  </svg>
);

const SummaryIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" fill="none" style={{ width: '1.25em', height: '1.25em' }}>
    <path
      d="M7 3h7l3 3v15a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 6 21V4.5A1.5 1.5 0 0 1 7.5 3Z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    />
    <path d="M8.5 11h7M8.5 15h7M8.5 19h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <path d="M14 3v3a1 1 0 0 0 1 1h3" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
  </svg>
);

const EditIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" fill="none" style={{ width: '1.25em', height: '1.25em' }}>
    <path
      d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0 0-3L16.5 4.5a2.1 2.1 0 0 0-3 0L3 15v5Z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    />
    <path d="M12.5 5.5l6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const iconForCustomAction = (action?: string): JSX.Element => {
  if (action === 'createRecordPreset') return <PlusIcon />;
  if (action === 'updateRecord') return <EditIcon />;
  return <SummaryIcon />;
};

export const TopActionBar: React.FC<{
  language: LangCode;
  buttons: TopActionBarButton[];
  disabled?: boolean;
  onButton: (buttonId: string) => void;
}> = ({ language, buttons, disabled, onButton }) => {
  if (!buttons || !buttons.length) return null;

  return (
    <nav className="ck-top-action-bar" aria-label={tSystem('app.topActions', language, 'Actions')}>
      <div className="ck-bottom-bar-inner">
        <div className="ck-bottom-capsule" aria-label={tSystem('app.topActions', language, 'Actions')}>
          {buttons.map(btn => {
            const icon = iconForCustomAction(btn.action);
            return (
              <button
                key={btn.id}
                type="button"
                className="ck-bottom-item"
                disabled={disabled}
                onClick={() => onButton(btn.id)}
              >
                <IconWrap>{icon}</IconWrap>
                {btn.label}
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
};


