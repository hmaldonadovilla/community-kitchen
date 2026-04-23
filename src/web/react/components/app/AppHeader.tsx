import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { LangCode } from '../../../types';
import { tSystem } from '../../../systemStrings';

type DrawerAction = {
  id: string;
  label: string;
  onClick: () => void;
  placement?: 'main' | 'secondary' | 'footer';
};

export const AppHeader: React.FC<{
  title: string;
  /**
   * Optional content rendered on the right side of the title row (e.g. autosave status).
   */
  titleRight?: React.ReactNode;
  backLabel: string;
  onBack: () => void;
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
  backLabel,
  onBack,
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
      enabled: drawerEnabled,
      languageCount,
      actionCount: drawerActionCount
    });
  }, [drawerActionCount, drawerEnabled, languageCount, onDiagnostic]);

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
    (source: 'title') => {
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

  return (
    <>
      <header className="ck-app-header" data-mobile={isMobile ? '1' : '0'}>
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
