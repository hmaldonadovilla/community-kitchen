import React, { useEffect, useMemo, useState } from 'react';
import type { View } from '../../types';
import type { LangCode } from '../../../types';
import { tSystem } from '../../../systemStrings';

const IconWrap: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="ck-bottom-icon" aria-hidden="true">
    {children}
  </span>
);

const HomeIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" fill="none" style={{ width: '1.25em', height: '1.25em' }}>
    <path
      d="M3 10.5L12 3l9 7.5v9a1.5 1.5 0 0 1-1.5 1.5H4.5A1.5 1.5 0 0 1 3 19.5v-9Z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    />
    <path
      d="M9.5 21v-7a1.5 1.5 0 0 1 1.5-1.5h2a1.5 1.5 0 0 1 1.5 1.5v7"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    />
  </svg>
);

const PlusIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" fill="none" style={{ width: '1.25em', height: '1.25em' }}>
    <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
  </svg>
);

const SummaryIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" fill="none" style={{ width: '1.25em', height: '1.25em' }}>
    <path
      d="M7 3h7l3 3v15a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 6 21V4.5A1.5 1.5 0 0 1 7.5 3Z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    />
    <path d="M8.5 11h7M8.5 15h7M8.5 19h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    <path d="M14 3v3a1 1 0 0 0 1 1h3" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
  </svg>
);

const EditIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" fill="none" style={{ width: '1.25em', height: '1.25em' }}>
    <path
      d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0 0-3L16.5 4.5a2.1 2.1 0 0 0-3 0L3 15v5Z"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    />
    <path d="M12.5 5.5l6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const CheckIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" fill="none" style={{ width: '1.25em', height: '1.25em' }}>
    <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const iconForCustomAction = (action?: string): JSX.Element => {
  if (action === 'createRecordPreset') return <PlusIcon />;
  if (action === 'updateRecord') return <EditIcon />;
  return <SummaryIcon />;
};

export const BottomActionBar: React.FC<{
  language: LangCode;
  view: View;
  submitting: boolean;
  readOnly?: boolean;
  canCopy: boolean;
  summaryEnabled?: boolean;
  copyEnabled?: boolean;
  customButtonsFormMenu?: Array<{ id: string; label: string; action?: string }>;
  customButtonsSummaryBar?: Array<{ id: string; label: string; action?: string }>;
  customButtonsListBar?: Array<{ id: string; label: string; action?: string }>;
  onHome: () => void;
  onCreateNew: () => void;
  onCreateCopy: () => void;
  onEdit: () => void;
  onSummary: () => void;
  onSubmit: () => void;
  onButton?: (buttonId: string) => void;
}> = ({
  language,
  view,
  submitting,
  readOnly,
  canCopy,
  summaryEnabled = true,
  copyEnabled = true,
  customButtonsFormMenu,
  customButtonsSummaryBar,
  customButtonsListBar,
  onHome,
  onCreateNew,
  onCreateCopy,
  onEdit,
  onSummary,
  onSubmit,
  onButton
}) => {
  const [menu, setMenu] = useState<'create' | 'summary' | 'actions' | null>(null);
  const createOpen = menu === 'create';
  const summaryOpen = menu === 'summary';
  const actionsOpen = menu === 'actions';

  const showCreateMenu = useMemo(() => (view === 'summary' || view === 'form') && copyEnabled, [copyEnabled, view]);
  const showEdit = useMemo(() => view === 'summary' && summaryEnabled, [summaryEnabled, view]);
  const showSummary = useMemo(() => view === 'form' && summaryEnabled, [summaryEnabled, view]);
  const showSubmit = useMemo(() => view === 'form' && !readOnly, [readOnly, view]);
  const hasSummaryMenu = useMemo(() => (customButtonsFormMenu || []).length > 0, [customButtonsFormMenu]);
  const hasSummaryBarButtons = useMemo(() => (customButtonsSummaryBar || []).length > 0, [customButtonsSummaryBar]);
  const hasListBarButtons = useMemo(() => (customButtonsListBar || []).length > 0, [customButtonsListBar]);

  useEffect(() => {
    // Close transient UI when navigating between views.
    setMenu(null);
  }, [view]);

  useEffect(() => {
    if (!menu) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(null);
    };
    globalThis.addEventListener?.('keydown', onKeyDown as any);
    return () => globalThis.removeEventListener?.('keydown', onKeyDown as any);
  }, [menu]);

  const homeActive = view === 'list';

  const handleCreatePress = () => {
    if (submitting) return;
    if (showCreateMenu) {
      setMenu(current => (current === 'create' ? null : 'create'));
      return;
    }
    onCreateNew();
  };

  const handleSummaryPress = () => {
    if (submitting) return;
    if (view === 'form' && hasSummaryMenu) {
      setMenu(current => (current === 'summary' ? null : 'summary'));
      return;
    }
    onSummary();
  };

  return (
    <>
      {createOpen && showCreateMenu && (
        <div className="ck-bottom-menu-overlay open" aria-hidden={false}>
          <button
            type="button"
            className="ck-bottom-menu-backdrop"
            aria-label={tSystem('actions.closeCreateMenu', language, 'Close create menu')}
            onClick={() => setMenu(null)}
          />
          <div
            className="ck-bottom-menu"
            aria-label={tSystem('actions.createMenu', language, 'Create menu')}
          >
            <button
              type="button"
              className="ck-bottom-menu-item ck-bottom-menu-item--primary"
              disabled={submitting}
              onClick={() => {
                setMenu(null);
                onCreateNew();
              }}
            >
              <IconWrap>
                <PlusIcon />
              </IconWrap>
              {tSystem('actions.newRecord', language, 'New record')}
            </button>
            {copyEnabled && (
              <button
                type="button"
                className="ck-bottom-menu-item"
                disabled={submitting || !canCopy}
                onClick={() => {
                  setMenu(null);
                  onCreateCopy();
                }}
              >
                <IconWrap>
                  <SummaryIcon />
                </IconWrap>
                {tSystem('actions.copyCurrentRecord', language, 'Copy current record')}
              </button>
            )}
          </div>
        </div>
      )}

      {summaryOpen && view === 'form' && hasSummaryMenu && (
        <div className="ck-bottom-menu-overlay open" aria-hidden={false}>
          <button
            type="button"
            className="ck-bottom-menu-backdrop"
            aria-label={tSystem('actions.closeSummaryMenu', language, 'Close summary menu')}
            onClick={() => setMenu(null)}
          />
          <div className="ck-bottom-menu" aria-label={tSystem('actions.summaryMenu', language, 'Summary menu')}>
            {summaryEnabled && (
              <button
                type="button"
                className="ck-bottom-menu-item ck-bottom-menu-item--primary"
                disabled={submitting}
                onClick={() => {
                  setMenu(null);
                  onSummary();
                }}
              >
                <IconWrap>
                  <SummaryIcon />
                </IconWrap>
                {tSystem('actions.viewSummary', language, 'View summary')}
              </button>
            )}
            {(customButtonsFormMenu || []).map(btn => (
              <button
                key={btn.id}
                type="button"
                className="ck-bottom-menu-item"
                disabled={submitting || !onButton}
                onClick={() => {
                  setMenu(null);
                  onButton?.(btn.id);
                }}
              >
                <IconWrap>
                  {iconForCustomAction(btn.action)}
                </IconWrap>
                {btn.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {actionsOpen && (view === 'summary' || view === 'list') && (
        <div className="ck-bottom-menu-overlay open" aria-hidden={false}>
          <button
            type="button"
            className="ck-bottom-menu-backdrop"
            aria-label={tSystem('actions.closeActionsMenu', language, 'Close actions menu')}
            onClick={() => setMenu(null)}
          />
          <div className="ck-bottom-menu" aria-label={tSystem('actions.actionsMenu', language, 'Actions menu')}>
            {((view === 'summary' ? customButtonsSummaryBar : customButtonsListBar) || []).map(btn => (
              <button
                key={btn.id}
                type="button"
                className="ck-bottom-menu-item ck-bottom-menu-item--primary"
                disabled={submitting || !onButton}
                onClick={() => {
                  setMenu(null);
                  onButton?.(btn.id);
                }}
              >
                <IconWrap>
                  {iconForCustomAction(btn.action)}
                </IconWrap>
                {btn.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <nav className="ck-bottom-bar" aria-label={tSystem('app.bottomActions', language, 'Bottom actions')}>
        <div className="ck-bottom-bar-inner">
          <div className="ck-bottom-capsule" aria-label={tSystem('app.navigation', language, 'Navigation')}>
            <button
              type="button"
              className={`ck-bottom-item ck-bottom-item--icon${homeActive ? ' active' : ''}`}
              onClick={onHome}
              disabled={submitting}
              aria-label={tSystem('actions.home', language, 'Home')}
              title={tSystem('actions.home', language, 'Home')}
            >
              <IconWrap>
                <HomeIcon />
              </IconWrap>
            </button>
            <button
              type="button"
              className={`ck-bottom-item${createOpen ? ' active' : ''}`}
              onClick={handleCreatePress}
              disabled={submitting}
              aria-haspopup={showCreateMenu ? 'dialog' : undefined}
              aria-expanded={showCreateMenu ? createOpen : undefined}
            >
              <IconWrap>
                <PlusIcon />
              </IconWrap>
              {tSystem('actions.create', language, 'Create')}
            </button>
            {showEdit && (
              <button type="button" className="ck-bottom-item" onClick={onEdit} disabled={submitting}>
                <IconWrap>
                  <EditIcon />
                </IconWrap>
                {tSystem('actions.edit', language, 'Edit')}
              </button>
            )}
            {showSummary && (
              <button
                type="button"
                className={`ck-bottom-item${summaryOpen ? ' active' : ''}`}
                onClick={handleSummaryPress}
                disabled={submitting}
                aria-haspopup={hasSummaryMenu ? 'dialog' : undefined}
                aria-expanded={hasSummaryMenu ? summaryOpen : undefined}
              >
                <IconWrap>
                  <SummaryIcon />
                </IconWrap>
                {tSystem('actions.summary', language, 'Summary')}
              </button>
            )}

            {!summaryEnabled && view === 'form' && hasSummaryMenu && (
              <button
                type="button"
                className={`ck-bottom-item${summaryOpen ? ' active' : ''}`}
                onClick={handleSummaryPress}
                disabled={submitting}
                aria-haspopup="dialog"
                aria-expanded={summaryOpen}
              >
                <IconWrap>
                  <SummaryIcon />
                </IconWrap>
                {tSystem('actions.actions', language, 'Actions')}
              </button>
            )}

            {view === 'summary' && hasSummaryBarButtons && (customButtonsSummaryBar || []).length === 1 && (
              <button
                type="button"
                className="ck-bottom-item"
                onClick={() => onButton?.((customButtonsSummaryBar || [])[0].id)}
                disabled={submitting || !onButton}
              >
                <IconWrap>
                  {iconForCustomAction((customButtonsSummaryBar || [])[0].action)}
                </IconWrap>
                {(customButtonsSummaryBar || [])[0].label}
              </button>
            )}

            {view === 'summary' && (customButtonsSummaryBar || []).length > 1 && (
              <button
                type="button"
                className={`ck-bottom-item${actionsOpen ? ' active' : ''}`}
                onClick={() => setMenu(current => (current === 'actions' ? null : 'actions'))}
                disabled={submitting || !onButton}
                aria-haspopup="dialog"
                aria-expanded={actionsOpen}
              >
                <IconWrap>
                  <SummaryIcon />
                </IconWrap>
                {tSystem('actions.actions', language, 'Actions')}
              </button>
            )}

            {view === 'list' && hasListBarButtons && (customButtonsListBar || []).length === 1 && (
              <button
                type="button"
                className="ck-bottom-item"
                onClick={() => onButton?.((customButtonsListBar || [])[0].id)}
                disabled={submitting || !onButton}
              >
                <IconWrap>
                  {iconForCustomAction((customButtonsListBar || [])[0].action)}
                </IconWrap>
                {(customButtonsListBar || [])[0].label}
              </button>
            )}

            {view === 'list' && (customButtonsListBar || []).length > 1 && (
              <button
                type="button"
                className={`ck-bottom-item${actionsOpen ? ' active' : ''}`}
                onClick={() => setMenu(current => (current === 'actions' ? null : 'actions'))}
                disabled={submitting || !onButton}
                aria-haspopup="dialog"
                aria-expanded={actionsOpen}
              >
                <IconWrap>
                  <SummaryIcon />
                </IconWrap>
                {tSystem('actions.actions', language, 'Actions')}
              </button>
            )}
          </div>
          {showSubmit && (
            <button type="button" className="ck-bottom-submit" onClick={onSubmit} disabled={submitting}>
              <IconWrap>
                <CheckIcon />
              </IconWrap>
              {submitting ? tSystem('actions.submitting', language, 'Submitting…') : tSystem('actions.submit', language, 'Submit')}
            </button>
          )}
        </div>
      </nav>
    </>
  );
};


