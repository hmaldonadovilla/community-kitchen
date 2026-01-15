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
  color: '#b91c1c'
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
  border: 'none',
  padding: '12px 20px',
  fontSize: 18,
  fontWeight: 800,
  cursor: 'pointer',
  background: '#0ea5e9',
  color: '#ffffff',
  boxShadow: '0 1px 0 rgba(15, 23, 42, 0.2)'
};

export const LoadingScreen: React.FC<LoadingScreenProps> = ({
  showSlowMessage,
  allowRetry,
  onRetry,
  errorMessage
}) => {
  return (
    <div className="page">
      <header className="ck-app-header">
        <button className="ck-app-avatar-btn" type="button" disabled>
          <span className="ck-app-avatar">CK</span>
        </button>
        <div className="ck-app-title-row">
          <div className="ck-app-title">Loading…</div>
          <div className="ck-app-title-right">
            <span data-tone="info">Starting Community Kitchen form…</span>
          </div>
        </div>
      </header>
      <main className="card form-card">
        <h1>Loading…</h1>
        <p>Please keep this page open. This may take a few seconds.</p>
        <p
          className="muted"
          data-boot-copy="slow"
          style={{ ...hintStyle, opacity: showSlowMessage ? 1 : 0.6 }}
        >
          Still loading… your connection may be slow. Don’t close the page.
        </p>
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
