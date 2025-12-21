import React, { useEffect, useMemo, useState } from 'react';
import type { View } from '../../types';

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

export const BottomActionBar: React.FC<{
  view: View;
  submitting: boolean;
  readOnly?: boolean;
  canCopy: boolean;
  onHome: () => void;
  onCreateNew: () => void;
  onCreateCopy: () => void;
  onEdit: () => void;
  onSummary: () => void;
  onSubmit: () => void;
}> = ({ view, submitting, readOnly, canCopy, onHome, onCreateNew, onCreateCopy, onEdit, onSummary, onSubmit }) => {
  const [createOpen, setCreateOpen] = useState(false);

  const showCreateMenu = useMemo(() => view === 'summary' || view === 'form', [view]);
  const showEdit = useMemo(() => view === 'summary', [view]);
  const showSummary = useMemo(() => view === 'form', [view]);
  const showSubmit = useMemo(() => view === 'form' && !readOnly, [readOnly, view]);

  useEffect(() => {
    // Close transient UI when navigating between views.
    setCreateOpen(false);
  }, [view]);

  useEffect(() => {
    if (!createOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCreateOpen(false);
    };
    globalThis.addEventListener?.('keydown', onKeyDown as any);
    return () => globalThis.removeEventListener?.('keydown', onKeyDown as any);
  }, [createOpen]);

  const homeActive = view === 'list';

  const handleCreatePress = () => {
    if (submitting) return;
    if (showCreateMenu) {
      setCreateOpen(open => !open);
      return;
    }
    onCreateNew();
  };

  return (
    <>
      {createOpen && showCreateMenu && (
        <div className="ck-bottom-menu-overlay open" aria-hidden={false}>
          <button
            type="button"
            className="ck-bottom-menu-backdrop"
            aria-label="Close create menu"
            onClick={() => setCreateOpen(false)}
          />
          <div
            className="ck-bottom-menu"
            aria-label="Create menu"
          >
            <button
              type="button"
              className="ck-bottom-menu-item ck-bottom-menu-item--primary"
              disabled={submitting}
              onClick={() => {
                setCreateOpen(false);
                onCreateNew();
              }}
            >
              <IconWrap>
                <PlusIcon />
              </IconWrap>
              New record
            </button>
            <button
              type="button"
              className="ck-bottom-menu-item"
              disabled={submitting || !canCopy}
              onClick={() => {
                setCreateOpen(false);
                onCreateCopy();
              }}
            >
              <IconWrap>
                <SummaryIcon />
              </IconWrap>
              Copy current record
            </button>
          </div>
        </div>
      )}

      <nav className="ck-bottom-bar" aria-label="Bottom actions">
        <div className="ck-bottom-bar-inner">
          <div className="ck-bottom-capsule" aria-label="Navigation">
            <button
              type="button"
              className={`ck-bottom-item ck-bottom-item--icon${homeActive ? ' active' : ''}`}
              onClick={onHome}
              disabled={submitting}
              aria-label="Home"
              title="Home"
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
              Create
            </button>
            {showEdit && (
              <button type="button" className="ck-bottom-item" onClick={onEdit} disabled={submitting}>
                <IconWrap>
                  <EditIcon />
                </IconWrap>
                Edit
              </button>
            )}
            {showSummary && (
              <button type="button" className="ck-bottom-item" onClick={onSummary} disabled={submitting}>
                <IconWrap>
                  <SummaryIcon />
                </IconWrap>
                Summary
              </button>
            )}
          </div>
          {showSubmit && (
            <button type="button" className="ck-bottom-submit" onClick={onSubmit} disabled={submitting}>
              <IconWrap>
                <CheckIcon />
              </IconWrap>
              {submitting ? 'Submitting…' : 'Submit'}
            </button>
          )}
        </div>
      </nav>
    </>
  );
};


