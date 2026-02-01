import React from 'react';

export interface LoadingScreenProps {
  showSlowMessage: boolean;
  allowRetry: boolean;
  onRetry?: () => void;
  errorMessage?: string | null;
}

const hintStyle: React.CSSProperties = {
  marginTop: 10
};

const errorStyle: React.CSSProperties = {
  marginTop: 10,
  fontWeight: 600,
  color: 'var(--danger)'
};

const actionsStyle: React.CSSProperties = {
  marginTop: 16,
  display: 'flex',
  flexWrap: 'wrap',
  gap: 10,
  justifyContent: 'flex-end'
};

const retryButtonStyle: React.CSSProperties = {
  borderRadius: 999,
  border: '1px solid var(--accent)',
  padding: '12px 20px',
  fontSize: 'var(--ck-font-control)',
  fontWeight: 600,
  cursor: 'pointer',
  background: 'var(--accent)',
  color: 'var(--accentText)',
  boxShadow: 'none'
};

export const LoadingScreen: React.FC<LoadingScreenProps> = ({
  showSlowMessage,
  allowRetry,
  onRetry,
  errorMessage
}) => {
  return (
    <div className="page">
      <main className="card form-card">
        <h1>Loading…</h1>
        <p>Please keep this page open. This may take a few seconds.</p>
        {showSlowMessage ? (
          <p className="muted" data-boot-copy="slow" style={hintStyle}>
            Still loading… your connection may be slow. Don’t close the page.
          </p>
        ) : null}
        {errorMessage && (
          <p style={errorStyle}>{errorMessage}</p>
        )}
        {allowRetry && onRetry && (
          <div style={actionsStyle}>
            <button type="button" style={retryButtonStyle} onClick={onRetry}>
              Retry
            </button>
          </div>
        )}
      </main>
    </div>
  );
};

export default LoadingScreen;
