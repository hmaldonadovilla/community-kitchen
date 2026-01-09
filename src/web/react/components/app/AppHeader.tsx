import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { LangCode } from '../../../types';
import { tSystem } from '../../../systemStrings';

export const AppHeader: React.FC<{
  title: string;
  /**
   * Optional content rendered on the right side of the title row (e.g. autosave status).
   */
  titleRight?: React.ReactNode;
  logoUrl?: string;
  buildMarker: string;
  isMobile: boolean;
  languages: string[];
  language: LangCode;
  onLanguageChange: (nextLanguage: string) => void;
  onRefresh: () => void;
  onDiagnostic?: (event: string, payload?: Record<string, unknown>) => void;
}> = ({ title, titleRight, logoUrl, buildMarker, isMobile, languages, language, onLanguageChange, onRefresh, onDiagnostic }) => {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
  const [logoLoaded, setLogoLoaded] = useState(false);
  const [logoCandidateIndex, setLogoCandidateIndex] = useState(0);
  const lastErroredSrcRef = useRef<string | null>(null);

  const avatarText = useMemo(() => {
    const trimmed = (title || '').trim();
    if (!trimmed) return 'CK';
    const parts = trimmed.split(/\s+/g).filter(Boolean);
    const first = parts[0]?.[0] || trimmed[0] || 'C';
    const second = parts.length > 1 ? parts[1]?.[0] : parts[0]?.[1];
    const joined = `${first || ''}${second || ''}`.toUpperCase();
    return joined.trim() || first.toUpperCase();
  }, [title]);

  const logoCandidates = useMemo(() => {
    const raw = (logoUrl || '').toString().trim();
    if (!raw) return [];

    const candidates: string[] = [];
    const push = (value?: string) => {
      const v = (value || '').toString().trim();
      if (!v) return;
      if (candidates.includes(v)) return;
      candidates.push(v);
    };

    const extractDriveId = (value: string): string | undefined => {
      const byPath = value.match(/\/file\/d\/([a-zA-Z0-9_-]{10,})/);
      if (byPath && byPath[1]) return byPath[1];
      const byQuery = value.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
      if (byQuery && byQuery[1]) return byQuery[1];
      // Some Googleusercontent formats:
      // - https://lh3.googleusercontent.com/d/<ID>=w...
      const byGUser = value.match(/googleusercontent\.com\/d\/([a-zA-Z0-9_-]{10,})/);
      if (byGUser && byGUser[1]) return byGUser[1];
      // If it looks like a bare file id, accept it.
      if (/^[a-zA-Z0-9_-]{10,}$/.test(value)) return value;
      return undefined;
    };

    push(raw);

    const id = extractDriveId(raw);
    if (id) {
      const enc = encodeURIComponent(id);
      // Prefer thumbnail endpoints for cross-browser compatibility (and to avoid HTML "view" wrappers).
      // Users must still share the file as "Anyone with the link can view" for public access.
      push(`https://drive.google.com/thumbnail?id=${enc}&sz=w256`);
      push(`https://drive.google.com/thumbnail?id=${enc}&sz=w512`);
      push(`https://drive.google.com/uc?export=view&id=${enc}`);
      push(`https://drive.google.com/uc?export=download&id=${enc}`);
      push(`https://lh3.googleusercontent.com/d/${enc}=w256`);
      push(`https://lh3.googleusercontent.com/d/${enc}=w512`);
    }

    return candidates;
  }, [logoUrl]);

  const logoSrc = logoCandidates[logoCandidateIndex] || undefined;

  useEffect(() => {
    // Reset failure state when logo changes.
    setLogoFailed(false);
    setLogoLoaded(false);
    setLogoCandidateIndex(0);
    lastErroredSrcRef.current = null;
    if (logoCandidates.length) {
      const raw = (logoUrl || '').toString().trim();
      onDiagnostic?.('ui.header.logo.configured', { enabled: true, candidateCount: logoCandidates.length, raw });
    } else {
      onDiagnostic?.('ui.header.logo.configured', { enabled: false });
    }
  }, [logoUrl, logoCandidates.length, onDiagnostic]);

  useEffect(() => {
    if (!logoSrc) return;
    onDiagnostic?.('ui.header.logo.attempt', {
      index: logoCandidateIndex,
      total: logoCandidates.length,
      src: logoSrc
    });
  }, [logoCandidateIndex, logoCandidates.length, logoSrc, onDiagnostic]);

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

  const showLogo = !!logoSrc && !logoFailed;

  const renderAvatar = (size: 'header' | 'drawer') => {
    if (showLogo && logoSrc) {
      const className = size === 'drawer' ? 'ck-app-avatar ck-app-avatar--drawer ck-app-avatar--img' : 'ck-app-avatar ck-app-avatar--img';
      return (
        <img
          className={className}
          src={logoSrc}
          alt=""
          aria-hidden="true"
          onLoad={() => {
            if (!logoLoaded) {
              setLogoLoaded(true);
              onDiagnostic?.('ui.header.logo.loaded', { target: size, src: logoSrc });
            }
          }}
          onError={() => {
            if (!logoSrc) return;
            if (lastErroredSrcRef.current === logoSrc) return;
            lastErroredSrcRef.current = logoSrc;

            const nextIndex = logoCandidateIndex + 1;
            if (nextIndex < logoCandidates.length) {
              const nextSrc = logoCandidates[nextIndex];
              onDiagnostic?.('ui.header.logo.fallback', {
                target: size,
                from: logoSrc,
                to: nextSrc,
                index: nextIndex,
                total: logoCandidates.length
              });
              setLogoCandidateIndex(nextIndex);
              return;
            }

            setLogoFailed(true);
            onDiagnostic?.('ui.header.logo.failed', { target: size, src: logoSrc });
          }}
        />
      );
    }
    const className = size === 'drawer' ? 'ck-app-avatar ck-app-avatar--drawer' : 'ck-app-avatar';
    return (
      <span className={className} aria-hidden="true">
        {avatarText}
      </span>
    );
  };

  return (
    <>
      <header className="ck-app-header" data-mobile={isMobile ? '1' : '0'}>
        <button
          type="button"
          className="ck-app-avatar-btn"
          onClick={() => setDrawerOpen(true)}
          aria-label={tSystem('app.openMenu', language, 'Open menu')}
        >
          {renderAvatar('header')}
        </button>
        <div className="ck-app-title-row">
          <div className="ck-app-title">{title || 'Form'}</div>
          {titleRight ? <div className="ck-app-title-right">{titleRight}</div> : null}
        </div>
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
              {renderAvatar('drawer')}
              <div className="ck-app-drawer-brand-text">
                <div className="ck-app-drawer-brand-title">{title || 'Form'}</div>
            <div className="ck-app-drawer-brand-subtitle muted">{tSystem('app.menu', language, 'Menu')}</div>
              </div>
            </div>
            <button
              type="button"
              className="ck-app-drawer-close"
              onClick={() => setDrawerOpen(false)}
          aria-label={tSystem('app.closeMenu', language, 'Close menu')}
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
          ⟳ {tSystem('app.refresh', language, 'Refresh')}
            </button>
          </div>

      {languages.length > 1 ? (
        <div className="ck-app-drawer-section">
          <div className="ck-app-drawer-section-title muted">{tSystem('app.language', language, 'Language')}</div>
          <select
            className="ck-app-drawer-select"
            value={language}
            onChange={e => onLanguageChange(e.target.value)}
            aria-label={tSystem('app.selectLanguage', language, 'Select language')}
          >
            {(languages.length ? languages : ['EN']).map(lang => (
              <option key={lang} value={lang}>
                {lang}
              </option>
            ))}
          </select>
        </div>
      ) : null}

          <div className="ck-app-drawer-section">
        <div className="ck-app-drawer-section-title muted">{tSystem('app.build', language, 'Build')}</div>
            <div className="ck-app-drawer-build">{buildMarker}</div>
          </div>
        </div>
      </div>
    </>
  );
};



