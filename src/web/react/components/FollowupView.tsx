import React from 'react';
import { WebFormDefinition } from '../../types';

interface FollowupViewProps {
  recordId: string;
  onRun: (action: string) => Promise<void>;
  followupConfig?: WebFormDefinition['followup'];
  resultMessage?: string | null;
  runningAction?: string | null;
  recordStatus?: string | null;
  lastUpdated?: string | null;
  pdfUrl?: string | null;
}

const FollowupView: React.FC<FollowupViewProps> = ({
  recordId,
  onRun,
  followupConfig,
  resultMessage,
  runningAction,
  recordStatus,
  lastUpdated,
  pdfUrl
}) => {
  if (!followupConfig) return <div className="card">No follow-up configured.</div>;
  const hasRecord = Boolean(recordId);
  const actions = [
    { key: 'CREATE_PDF', label: 'Create PDF', visible: Boolean(followupConfig.pdfTemplateId) },
    { key: 'SEND_EMAIL', label: 'Send Email', visible: Boolean(followupConfig.emailTemplateId && followupConfig.emailRecipients) },
    { key: 'CLOSE_RECORD', label: 'Close Record', visible: true }
  ].filter(action => action.visible);
  const formatDate = (value?: string | null) => {
    if (!value) return '—';
    try {
      const parsed = new Date(value);
      if (Number.isNaN(parsed.getTime())) return value;
      return parsed.toLocaleString();
    } catch (_) {
      return value;
    }
  };

  return (
    <div className="card">
      <h3>Follow-up</h3>
      <div className="muted" style={{ marginTop: -4 }}>
        Record ID: {recordId || 'Select a record from the list or submit the form.'}
      </div>
      <div
        style={{
          display: 'grid',
          gap: 12,
          gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
          margin: '16px 0'
        }}
      >
        <div>
          <div className="muted">Status</div>
          <div style={{ marginTop: 4, fontWeight: 600 }}>{recordStatus || '—'}</div>
        </div>
        <div>
          <div className="muted">Last updated</div>
          <div style={{ marginTop: 4, fontWeight: 600 }}>{formatDate(lastUpdated)}</div>
        </div>
        <div>
          <div className="muted">PDF</div>
          {pdfUrl ? (
            <a
              href={pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-link"
              style={{ marginTop: 4, display: 'inline-block' }}
            >
              View PDF
            </a>
          ) : (
            <div style={{ marginTop: 4, fontWeight: 600 }}>Not available</div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        {actions.length ? (
          actions.map(action => (
            <button
              key={action.key}
              type="button"
              disabled={!hasRecord || Boolean(runningAction)}
              onClick={() => onRun(action.key)}
            >
              {runningAction === action.key ? 'Working…' : action.label}
            </button>
          ))
        ) : (
          <div className="muted">No follow-up actions configured.</div>
        )}
      </div>

      {!hasRecord && (
        <div className="error" style={{ marginTop: 12 }}>
          Select a record from the list (or wait for a successful submission) before running follow-up actions.
        </div>
      )}

      {followupConfig.statusTransitions && (
        <div className="muted" style={{ fontSize: 12, marginTop: 16 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Status transitions</div>
          <ul style={{ paddingLeft: 18, margin: 0 }}>
            {Object.entries(followupConfig.statusTransitions).map(([key, value]) => (
              <li key={key}>
                {key}: <strong>{value || '—'}</strong>
              </li>
            ))}
          </ul>
        </div>
      )}

      {resultMessage && (
        <div className="status" role="status" aria-live="polite" style={{ marginTop: 16 }}>
          {resultMessage}
        </div>
      )}
    </div>
  );
};

export default FollowupView;

