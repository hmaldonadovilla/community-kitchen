import React from 'react';

import type { LangCode } from '../../../types';
import type { FormErrors } from '../../types';
import { tSystem } from '../../../systemStrings';

/**
 * Owner: form renderer.
 * Renders the top-of-form status, warning, and record-state notices. Navigation
 * and validation state remain injected from FormView.
 */

type StatusTone = 'info' | 'success' | 'error';

export const FormStatusNotices: React.FC<{
  language: LangCode;
  recordStatusText?: string;
  recordStatusKey?: string | null;
  hideRecordStatus?: boolean;
  showWarningsBanner?: boolean;
  warningTop?: Array<{ message: string; fieldPath: string }>;
  status?: string | null;
  statusTone?: StatusTone | null;
  statusRef: React.Ref<HTMLDivElement>;
  errors: FormErrors;
  onNavigateToField: (fieldPath: string) => void;
}> = ({
  language,
  recordStatusText,
  recordStatusKey,
  hideRecordStatus,
  showWarningsBanner,
  warningTop,
  status,
  statusTone,
  statusRef,
  errors,
  onNavigateToField
}) => (
  <>
    {recordStatusText && !hideRecordStatus ? (
      <div className="ck-record-status-row">
        <span className="ck-record-status-label">{tSystem('list.meta.status', language, 'Status')}</span>
        <span
          className="ck-status-pill"
          title={recordStatusText}
          aria-label={`Status: ${recordStatusText}`}
          data-status-key={recordStatusKey || undefined}
        >
          {recordStatusText}
        </span>
      </div>
    ) : null}
    {showWarningsBanner && warningTop && warningTop.length ? (
      <div
        role="status"
        style={{
          scrollMarginTop: 'calc(var(--safe-top) + 140px)',
          padding: '14px 16px',
          borderRadius: 14,
          border: '1px solid var(--border)',
          background: 'transparent',
          color: 'var(--text)',
          fontWeight: 600,
          display: 'flex',
          flexDirection: 'column',
          gap: 8
        }}
      >
        <div>{tSystem('validation.warningsTitle', language, 'Warnings')}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontWeight: 500 }}>
          {warningTop.map((w, idx) => (
            <button
              key={`${idx}-${w.fieldPath}-${w.message}`}
              type="button"
              onClick={() => onNavigateToField(w.fieldPath)}
              style={{
                border: 'none',
                background: 'transparent',
                padding: 0,
                textAlign: 'left',
                font: 'inherit',
                color: 'inherit',
                cursor: 'pointer'
              }}
            >
              {w.message}
            </button>
          ))}
        </div>
      </div>
    ) : null}

    {status ? (
      <div
        ref={statusRef}
        role={statusTone === 'error' ? 'alert' : 'status'}
        tabIndex={-1}
        onClick={() => {
          if (statusTone !== 'error') return;
          const keys = Object.keys(errors || {});
          if (!keys.length) return;
          onNavigateToField(keys[0]);
        }}
        style={{
          scrollMarginTop: 'calc(var(--safe-top) + 140px)',
          padding: '14px 16px',
          borderRadius: 14,
          border: statusTone === 'error' ? '1px solid var(--danger)' : '1px solid var(--border)',
          background: 'transparent',
          color: statusTone === 'error' ? 'var(--danger)' : 'var(--text)',
          fontWeight: 600,
          cursor: statusTone === 'error' && Object.keys(errors || {}).length ? 'pointer' : undefined
        }}
      >
        {status}
      </div>
    ) : null}
  </>
);
