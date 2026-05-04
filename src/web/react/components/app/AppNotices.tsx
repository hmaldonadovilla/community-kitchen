import React from 'react';

import type { LangCode } from '../../../types';
import { tSystem } from '../../../systemStrings';

/**
 * Owner: app shell notices.
 * Presentational notices used by App action bars. State resets, navigation, and
 * record loading are injected as callbacks from App.
 */

export const AppNoticeStack: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const items = React.Children.toArray(children).filter(Boolean);
  if (!items.length) return null;
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{items}</div>;
};

export const DedupCheckingNotice: React.FC<{ language: LangCode }> = ({ language }) => (
  <div
    role="status"
    aria-live="polite"
    style={{
      padding: '12px 14px',
      borderRadius: 14,
      border: '1px solid var(--border)',
      background: 'transparent',
      color: 'var(--text)',
      fontWeight: 600
    }}
  >
    {tSystem('dedup.checking', language, 'Checking duplicates…')}
  </div>
);

export const DedupDuplicateNotice: React.FC<{
  language: LangCode;
  message?: string;
  canOpenExisting?: boolean;
  onOpenExisting: () => void;
}> = ({ language, message, canOpenExisting, onOpenExisting }) => (
  <div
    role="status"
    aria-live="polite"
    style={{
      padding: '12px 14px',
      borderRadius: 14,
      border: '1px solid var(--border)',
      background: 'transparent',
      color: 'var(--text)',
      fontWeight: 600,
      display: 'flex',
      flexDirection: 'column',
      gap: 10
    }}
  >
    <div>{message || tSystem('dedup.duplicate', language, 'Duplicate record.')}</div>
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
      {canOpenExisting ? (
        <button
          type="button"
          onClick={onOpenExisting}
          style={{
            padding: '10px 12px',
            borderRadius: 12,
            border: '1px solid var(--border)',
            background: 'transparent',
            color: 'var(--text)',
            fontWeight: 600
          }}
        >
          {tSystem('dedup.openExisting', language, 'Open existing')}
        </button>
      ) : null}
    </div>
  </div>
);
