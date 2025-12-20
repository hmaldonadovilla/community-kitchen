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
  isMobile?: boolean;
}

const FollowupView: React.FC<FollowupViewProps> = ({
  recordId,
  onRun,
  followupConfig,
  resultMessage,
  runningAction,
  recordStatus,
  lastUpdated,
  pdfUrl,
  isMobile
}) => {
  if (!followupConfig) return <div className="card">No follow-up configured.</div>;
  const hasRecord = Boolean(recordId);
  const actions = [
    { key: 'CREATE_PDF', label: 'Create PDF', visible: Boolean(followupConfig.pdfTemplateId) },
    { key: 'SEND_EMAIL', label: 'Send Email', visible: Boolean(followupConfig.emailTemplateId && followupConfig.emailRecipients) },
    { key: 'CLOSE_RECORD', label: 'Close Record', visible: true }
  ].filter(action => action.visible);
  const [actionsOpen, setActionsOpen] = React.useState(false);
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
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
          marginBottom: 8,
          position: 'relative'
        }}
      >
        <div>
          <h3 style={{ margin: 0, fontSize: isMobile ? 26 : 22 }}>Follow-up</h3>
          <div className="muted" style={{ marginTop: -2, fontSize: isMobile ? 16 : 15 }}>
            Record ID: {recordId || 'Select a record from the list or submit the form.'}
          </div>
        </div>
        {actions.length ? (
          isMobile ? (
            <div style={{ position: 'relative' }}>
              <button
                type="button"
                onClick={() => setActionsOpen(open => !open)}
                style={{
                  border: '1px solid var(--ck-secondary-border)',
                  background: 'var(--ck-secondary-bg)',
                  color: 'var(--ck-secondary-text)',
                  borderRadius: 14,
                  padding: '18px 22px',
                  cursor: 'pointer',
                  fontWeight: 900,
                  fontSize: 28,
                  minHeight: 'var(--control-height)'
                }}
              >
                ☰ Actions
              </button>
              {actionsOpen && (
                <div
                  style={{
                    position: 'absolute',
                    right: 0,
                    top: '100%',
                    marginTop: 8,
                    background: '#fff',
                    border: '1px solid #e5e7eb',
                    borderRadius: 16,
                    boxShadow: '0 14px 36px rgba(15,23,42,0.16)',
                    padding: 14,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                    zIndex: 5,
                    minWidth: 240
                  }}
                >
                  {actions.map(action => (
                    <button
                      key={action.key}
                      type="button"
                      disabled={!hasRecord || Boolean(runningAction)}
                      onClick={() => {
                        setActionsOpen(false);
                        onRun(action.key);
                      }}
                      style={{
                        padding: '14px 16px',
                        borderRadius: 12,
                        border: '1px solid var(--ck-secondary-border)',
                        background: 'var(--ck-secondary-bg)',
                        color: 'var(--ck-secondary-text)',
                        fontWeight: 900,
                        fontSize: 28,
                        textAlign: 'left',
                        minHeight: 'var(--control-height)'
                      }}
                    >
                      {runningAction === action.key ? 'Working…' : action.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {actions.map(action => (
                <button
                  key={action.key}
                  type="button"
                  disabled={!hasRecord || Boolean(runningAction)}
                  onClick={() => onRun(action.key)}
                >
                  {runningAction === action.key ? 'Working…' : action.label}
                </button>
              ))}
            </div>
          )
        ) : (
          <div className="muted">No follow-up actions configured.</div>
        )}
      </div>

      <div
        style={{
          display: 'grid',
          gap: 12,
          gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
          margin: '8px 0 16px'
        }}
      >
        <div>
          <div className="muted" style={{ fontSize: isMobile ? 16 : 15 }}>Status</div>
          <div style={{ marginTop: 4, fontWeight: 700, fontSize: isMobile ? 18 : 17 }}>{recordStatus || '—'}</div>
        </div>
        <div>
          <div className="muted" style={{ fontSize: isMobile ? 16 : 15 }}>Last updated</div>
          <div style={{ marginTop: 4, fontWeight: 700, fontSize: isMobile ? 18 : 17 }}>{formatDate(lastUpdated)}</div>
        </div>
        <div>
          <div className="muted" style={{ fontSize: isMobile ? 16 : 15 }}>PDF</div>
          {pdfUrl ? (
            <a
              href={pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-link"
              style={{ marginTop: 4, display: 'inline-block', fontSize: isMobile ? 18 : 17 }}
            >
              View PDF
            </a>
          ) : (
            <div style={{ marginTop: 4, fontWeight: 700, fontSize: isMobile ? 18 : 17 }}>Not available</div>
          )}
        </div>
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

