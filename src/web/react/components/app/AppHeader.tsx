import React, { useEffect, useMemo, useState } from 'react';

export const AppHeader: React.FC<{
  title: string;
  buildMarker: string;
  isMobile: boolean;
  languages: string[];
  language: string;
  onLanguageChange: (nextLanguage: string) => void;
  onRefresh: () => void;
}> = ({ title, buildMarker, isMobile, languages, language, onLanguageChange, onRefresh }) => {
  const [drawerOpen, setDrawerOpen] = useState(false);

  const avatarText = useMemo(() => {
    const trimmed = (title || '').trim();
    if (!trimmed) return 'CK';
    const parts = trimmed.split(/\s+/g).filter(Boolean);
    const first = parts[0]?.[0] || trimmed[0] || 'C';
    const second = parts.length > 1 ? parts[1]?.[0] : parts[0]?.[1];
    const joined = `${first || ''}${second || ''}`.toUpperCase();
    return joined.trim() || first.toUpperCase();
  }, [title]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);

    // Prevent background scroll while the drawer is open.
    const root = document.documentElement;
    const prevOverflow = root.style.overflow;
    root.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      root.style.overflow = prevOverflow;
    };
  }, [drawerOpen]);

  return (
    <>
      <header className="ck-app-header" data-mobile={isMobile ? '1' : '0'}>
        <button
          type="button"
          className="ck-app-avatar-btn"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open menu"
        >
          <span className="ck-app-avatar" aria-hidden="true">
            {avatarText}
          </span>
        </button>
        <div className="ck-app-title">{title || 'Form'}</div>
      </header>

      <div
        className={`ck-app-drawer-overlay${drawerOpen ? ' open' : ''}`}
        aria-hidden={!drawerOpen}
        onClick={() => setDrawerOpen(false)}
      >
        <div
          className="ck-app-drawer"
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          onClick={e => e.stopPropagation()}
        >
          <div className="ck-app-drawer-top">
            <div className="ck-app-drawer-brand">
              <div className="ck-app-avatar ck-app-avatar--drawer" aria-hidden="true">
                {avatarText}
              </div>
              <div className="ck-app-drawer-brand-text">
                <div className="ck-app-drawer-brand-title">{title || 'Form'}</div>
                <div className="ck-app-drawer-brand-subtitle muted">Menu</div>
              </div>
            </div>
            <button
              type="button"
              className="ck-app-drawer-close"
              onClick={() => setDrawerOpen(false)}
              aria-label="Close menu"
            >
              ×
            </button>
          </div>

          <div className="ck-app-drawer-section">
            <button
              type="button"
              className="ck-app-drawer-item"
              onClick={() => {
                setDrawerOpen(false);
                onRefresh();
              }}
            >
              ⟳ Refresh
            </button>
          </div>

          <div className="ck-app-drawer-section">
            <div className="ck-app-drawer-section-title muted">Language</div>
            <select
              className="ck-app-drawer-select"
              value={language}
              onChange={e => onLanguageChange(e.target.value)}
              aria-label="Select language"
            >
              {(languages.length ? languages : ['EN']).map(lang => (
                <option key={lang} value={lang}>
                  {lang}
                </option>
              ))}
            </select>
          </div>

          <div className="ck-app-drawer-section">
            <div className="ck-app-drawer-section-title muted">Build</div>
            <div className="ck-app-drawer-build">{buildMarker}</div>
          </div>
        </div>
      </div>
    </>
  );
};



