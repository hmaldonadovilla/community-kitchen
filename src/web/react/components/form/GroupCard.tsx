import React from 'react';

export type GroupCardProps = {
  className?: string;
  groupKey: string;
  title?: string | null;
  collapsible?: boolean;
  collapsed?: boolean;
  hasError?: boolean;
  progress?: { complete: number; total: number } | null;
  onToggleCollapsed?: () => void;
  children: React.ReactNode;
};

export const GroupCard: React.FC<GroupCardProps> = ({
  className = 'card ck-group-card',
  groupKey,
  title,
  collapsible = false,
  collapsed = false,
  hasError = false,
  progress = null,
  onToggleCollapsed,
  children
}) => {
  const resolvedTitle = (title || '').toString().trim();
  const showHeader = !!resolvedTitle;
  const showProgress = !!progress && typeof progress.complete === 'number' && typeof progress.total === 'number';
  const complete = showProgress ? progress.complete : 0;
  const total = showProgress ? progress.total : 0;
  const progressClass =
    showProgress && total > 0 ? (complete >= total ? 'ck-progress-good' : 'ck-progress-bad') : 'ck-progress-neutral';

  if (!showHeader) {
    return (
      <div key={groupKey} data-group-key={groupKey} data-has-error={hasError ? 'true' : undefined}>
        {children}
      </div>
    );
  }

  return (
    <div className={className} data-group-key={groupKey} data-has-error={hasError ? 'true' : undefined}>
      {collapsible ? (
        <button
          type="button"
          className="ck-group-header ck-group-header--clickable"
          onClick={onToggleCollapsed}
          aria-expanded={!collapsed}
          aria-label={`${collapsed ? 'Expand' : 'Collapse'} section ${resolvedTitle}${showProgress && total > 0 ? ` (${complete}/${total} required complete)` : ''}`}
        >
          <div className="ck-group-title">{resolvedTitle}</div>
          <span
            className={`ck-progress-pill ${progressClass}`}
            title={showProgress && total > 0 ? `${complete}/${total} required complete` : `${collapsed ? 'Expand' : 'Collapse'} ${resolvedTitle}`}
            aria-hidden="true"
          >
            {showProgress && total > 0 ? (
              <span>
                {complete}/{total}
              </span>
            ) : null}
            <span className="ck-progress-label">{collapsed ? 'Expand' : 'Collapse'}</span>
            <span className="ck-progress-caret">{collapsed ? '▸' : '▾'}</span>
          </span>
        </button>
      ) : (
        <div className="ck-group-header">
          <div className="ck-group-title">{resolvedTitle}</div>
        </div>
      )}
      {!collapsed && <div className="ck-group-body">{children}</div>}
    </div>
  );
};



