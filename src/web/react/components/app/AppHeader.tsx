import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { LangCode } from '../../../types';
import { tSystem } from '../../../systemStrings';
import { buildAppLogoCandidates } from './appLogoCandidates';

type DrawerAction = {
  id: string;
  label: string;
  onClick: () => void;
  placement?: 'main' | 'secondary' | 'footer';
};

type HeaderLayout = 'home' | 'detail';

export const AppHeader: React.FC<{
  title: string;
  /**
   * Optional content rendered on the right side of the title row (e.g. autosave status).
   */
  titleRight?: React.ReactNode;
  layout?: HeaderLayout;
  backLabel: string;
  onBack: () => void;
  logoUrl?: string;
  drawerEnabled?: boolean;
  buildMarker: string;
  isMobile: boolean;
  languages: string[];
  language: LangCode;
  onLanguageChange: (nextLanguage: string) => void;
  onRefresh: () => void;
  drawerActions?: DrawerAction[];
  onDiagnostic?: (event: string, payload?: Record<string, unknown>) => void;
}> = ({
  title,
  titleRight,
  layout = 'home',
  backLabel,
  onBack,
  logoUrl,
  drawerEnabled = true,
  buildMarker,
  isMobile,
  languages,
  language,
  onLanguageChange,
  onRefresh,
  drawerActions,
  onDiagnostic
}) => {
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

  const logoCandidates = useMemo(() => buildAppLogoCandidates(logoUrl), [logoUrl]);

  const logoSrc = logoCandidates[logoCandidateIndex] || undefined;
  const showLogo = Boolean(logoSrc) && !logoFailed;

  const mainDrawerActions = useMemo(
    () => (Array.isArray(drawerActions) ? drawerActions.filter(action => action?.placement === 'main') : []),
    [drawerActions]
  );
  const secondaryDrawerActions = useMemo(
    () => (Array.isArray(drawerActions) ? drawerActions.filter(action => action?.placement === 'secondary') : []),
    [drawerActions]
  );
  const footerDrawerActions = useMemo(
    () => (Array.isArray(drawerActions) ? drawerActions.filter(action => action?.placement === 'footer') : []),
    [drawerActions]
  );
  const drawerActionCount = mainDrawerActions.length + secondaryDrawerActions.length + footerDrawerActions.length;
  const languageCount = Array.isArray(languages) ? languages.length : 0;

  useEffect(() => {
    onDiagnostic?.('ui.header.drawer.state', {
      layout,
      enabled: drawerEnabled,
      languageCount,
      actionCount: drawerActionCount
    });
  }, [drawerActionCount, drawerEnabled, languageCount, layout, onDiagnostic]);

  useEffect(() => {
    setLogoFailed(false);
    setLogoLoaded(false);
    setLogoCandidateIndex(0);
    lastErroredSrcRef.current = null;
    onDiagnostic?.('ui.header.logo.configured', {
      layout,
      enabled: logoCandidates.length > 0,
      candidateCount: logoCandidates.length,
      raw: (logoUrl || '').toString().trim() || null
    });
  }, [layout, logoCandidates.length, logoUrl, onDiagnostic]);

  useEffect(() => {
    if (!logoSrc) return;
    onDiagnostic?.('ui.header.logo.attempt', {
      index: logoCandidateIndex,
      total: logoCandidates.length,
      src: logoSrc
    });
  }, [logoCandidateIndex, logoCandidates.length, logoSrc, onDiagnostic]);

  useEffect(() => {
    if (drawerEnabled) return;
    setDrawerOpen(false);
  }, [drawerEnabled]);

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

  const openDrawer = useCallback(
    (source: 'title' | 'avatar') => {
      if (!drawerEnabled) return;
      onDiagnostic?.('ui.header.drawer.open', { source });
      setDrawerOpen(true);
    },
    [drawerEnabled, onDiagnostic]
  );

  const closeDrawer = useCallback(
    (source: 'backdrop' | 'close' | 'action') => {
      onDiagnostic?.('ui.header.drawer.close', { source });
      setDrawerOpen(false);
    },
    [onDiagnostic]
  );

  const titleNode = drawerEnabled ? (
    <button
      type="button"
      className="ck-app-title-btn"
      onClick={() => openDrawer('title')}
      aria-label={tSystem('app.openMenu', language, 'Open menu')}
    >
      <span className="ck-app-title">{title || 'Form'}</span>
    </button>
  ) : (
    <div className="ck-app-title">{title || 'Form'}</div>
  );

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
            if (logoLoaded) return;
            setLogoLoaded(true);
            onDiagnostic?.('ui.header.logo.loaded', { target: size, src: logoSrc });
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
      <header className="ck-app-header" data-mobile={isMobile ? '1' : '0'} data-layout={layout}>
        {layout === 'home' ? (
          <>
            <div className="ck-app-header-slot ck-app-header-slot--start">
              <button
                type="button"
                className="ck-app-back-btn"
                onClick={() => {
                  onDiagnostic?.('ui.header.back.click', {});
                  onBack();
                }}
              >
                {backLabel}
              </button>
            </div>
            <div className="ck-app-header-slot ck-app-header-slot--center">{titleNode}</div>
            <div className="ck-app-header-slot ck-app-header-slot--end">
              {titleRight ? <div className="ck-app-title-right">{titleRight}</div> : null}
            </div>
          </>
        ) : (
          <>
            {drawerEnabled ? (
              <button
                type="button"
                className="ck-app-avatar-btn"
                onClick={() => openDrawer('avatar')}
                aria-label={tSystem('app.openMenu', language, 'Open menu')}
              >
                {renderAvatar('header')}
              </button>
            ) : (
              renderAvatar('header')
            )}
            <div className="ck-app-title-row">
              <div className="ck-app-title">{title || 'Form'}</div>
              {titleRight ? <div className="ck-app-title-right">{titleRight}</div> : null}
            </div>
          </>
        )}
      </header>

      {drawerEnabled ? (
        <div className={`ck-app-drawer-overlay${drawerOpen ? ' open' : ''}`} aria-hidden={!drawerOpen} onClick={() => closeDrawer('backdrop')}>
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
                onClick={() => closeDrawer('close')}
                aria-label={tSystem('app.closeMenu', language, 'Close menu')}
              >
                ×
              </button>
            </div>

            <div className="ck-app-drawer-section">
              <button
                type="button"
                className="ck-app-drawer-item ck-app-drawer-item--primary"
                onClick={() => {
                  closeDrawer('action');
                  onRefresh();
                }}
              >
                ⟳ {tSystem('app.refresh', language, 'Refresh')}
              </button>
            </div>

            {mainDrawerActions.length ? (
              <div className="ck-app-drawer-section">
                {mainDrawerActions.map(action => (
                  <button
                    key={action.id}
                    type="button"
                    className="ck-app-drawer-item"
                    onClick={() => {
                      closeDrawer('action');
                      action.onClick();
                    }}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            ) : null}

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

            {secondaryDrawerActions.length ? (
              <div className="ck-app-drawer-section">
                {secondaryDrawerActions.map(action => (
                  <button
                    key={action.id}
                    type="button"
                    className="ck-app-drawer-item"
                    onClick={() => {
                      closeDrawer('action');
                      action.onClick();
                    }}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            ) : null}

            <div className="ck-app-drawer-section">
              <div className="ck-app-drawer-section-title muted">{tSystem('app.build', language, 'Build')}</div>
              <div className="ck-app-drawer-build">{buildMarker}</div>
            </div>

            <div className="ck-app-drawer-spacer" aria-hidden="true" />

            {footerDrawerActions.length ? (
              <div className="ck-app-drawer-section">
                {footerDrawerActions.map(action => (
                  <button
                    key={action.id}
                    type="button"
                    className="ck-app-drawer-item"
                    onClick={() => {
                      closeDrawer('action');
                      action.onClick();
                    }}
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
};
