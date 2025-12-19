import React, { useState } from 'react';

export const AppHeader: React.FC<{
  title: string;
  buildMarker: string;
  isMobile: boolean;
  languages: string[];
  language: string;
  onLanguageChange: (nextLanguage: string) => void;
  onRefresh: () => void;
  onHome: () => void;
  onNew: () => void;
}> = ({ title, buildMarker, isMobile, languages, language, onLanguageChange, onRefresh, onHome, onNew }) => {
  const [actionsOpen, setActionsOpen] = useState(false);

  return (
    <header
      className="app-shell-header"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 10,
        background: '#fff',
        padding: '18px 20px',
        marginBottom: 16,
        borderRadius: 16,
        border: '1px solid #e5e7eb',
        boxShadow: '0 10px 30px rgba(15,23,42,0.08)'
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap'
        }}
      >
        <div style={{ fontSize: isMobile ? 52 : 32, fontWeight: 800, minWidth: 0 }}>{title || 'Form'}</div>
        <div className="muted" style={{ fontSize: isMobile ? 26 : 18, fontWeight: 700, whiteSpace: 'nowrap' }}>
          Build: {buildMarker}
        </div>
      </div>

      <div
        style={{
          marginTop: 12,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12
        }}
      >
        <div style={{ position: 'relative', flex: '0 0 auto' }}>
          <button
            type="button"
            onClick={() => setActionsOpen(open => !open)}
            aria-label="Menu"
            style={{
              border: '1px solid #475569',
              background: '#1e293b',
              color: '#fff',
              borderRadius: 12,
              padding: isMobile ? '16px 18px' : '13px 15px',
              cursor: 'pointer',
              fontWeight: 800,
              fontSize: isMobile ? 24 : 20,
              minWidth: isMobile ? 70 : 58
            }}
          >
            ☰
          </button>
          {actionsOpen && (
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: '100%',
                marginTop: 8,
                background: '#fff',
                border: '1px solid #e5e7eb',
                borderRadius: 12,
                boxShadow: '0 14px 36px rgba(15,23,42,0.16)',
                padding: 10,
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                minWidth: 180,
                zIndex: 8
              }}
            >
              <button
                type="button"
                onClick={() => {
                  setActionsOpen(false);
                  onRefresh();
                }}
                style={{
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: '1px solid #e5e7eb',
                  background: '#f8fafc',
                  fontWeight: 700,
                  textAlign: 'left',
                  color: '#0f172a'
                }}
              >
                ⟳ Refresh
              </button>
              <button
                type="button"
                onClick={() => {
                  setActionsOpen(false);
                  onHome();
                }}
                style={{
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: '1px solid #e5e7eb',
                  background: '#f8fafc',
                  fontWeight: 700,
                  textAlign: 'left',
                  color: '#0f172a'
                }}
              >
                Home
              </button>
              <button
                type="button"
                onClick={() => {
                  setActionsOpen(false);
                  onNew();
                }}
                style={{
                  padding: '10px 12px',
                  borderRadius: 10,
                  border: '1px solid #1d4ed8',
                  background: '#2563eb',
                  color: '#fff',
                  fontWeight: 700,
                  textAlign: 'left'
                }}
              >
                New
              </button>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'flex-end', whiteSpace: 'nowrap' }}>
          <label
            htmlFor="language-select"
            className="muted"
            style={{ fontWeight: 800, fontSize: isMobile ? 26 : 22, whiteSpace: 'nowrap' }}
          >
            Language:
          </label>
          <select id="language-select" value={language} onChange={e => onLanguageChange(e.target.value)}>
            {(languages.length ? languages : ['EN']).map(lang => (
              <option key={lang} value={lang}>
                {lang}
              </option>
            ))}
          </select>
        </div>
      </div>
    </header>
  );
};



