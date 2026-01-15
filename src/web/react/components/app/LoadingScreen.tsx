import React from 'react';

export interface LoadingScreenProps {
  showSlowMessage: boolean;
  allowRetry: boolean;
  onRetry?: () => void;
  errorMessage?: string | null;
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 120,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '16px',
  background: 'rgba(15, 23, 42, 0.45)'
};

const panelStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: 520,
  borderRadius: 24,
  border: '1px solid rgba(148, 163, 184, 0.75)',
  background: '#ffffff',
  boxShadow: '0 22px 60px rgba(15, 23, 42, 0.35)',
  padding: '22px 22px 20px',
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Inter", "Segoe UI", sans-serif',
  color: '#0f172a'
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontWeight: 900,
  fontSize: 26,
  letterSpacing: -0.4
};

const messageStyle: React.CSSProperties = {
  margin: '6px 0 0',
  fontSize: 18,
  lineHeight: 1.4
};

const hintStyle: React.CSSProperties = {
  margin: '10px 0 0',
  fontSize: 16,
  lineHeight: 1.4,
  color: '#4b5563'
};

const errorStyle: React.CSSProperties = {
  margin: '10px 0 0',
  fontSize: 16,
  lineHeight: 1.4,
  color: '#b91c1c',
  fontWeight: 600
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
    <div style={overlayStyle}>
      <div style={panelStyle}>
        <h1 style={titleStyle}>Loading…</h1>
        <p style={messageStyle}>Please keep this page open. This may take a few seconds.</p>
        {showSlowMessage && (
          <p style={hintStyle}>Still loading… your connection may be slow. Don’t close the page.</p>
        )}
        {errorMessage && <p style={errorStyle}>{errorMessage}</p>}
        {allowRetry && onRetry && (
          <div style={actionsStyle}>
            <button type="button" style={retryButtonStyle} onClick={onRetry}>
              Retry
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default LoadingScreen;
