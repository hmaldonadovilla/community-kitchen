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
  const complete = progress?.complete ?? 0;
  const total = progress?.total ?? 0;
  const progressClass =
    total > 0 ? (complete >= total ? 'ck-progress-good' : 'ck-progress-bad') : 'ck-progress-neutral';

  if (!showHeader) {
    return (
      <div key={groupKey} data-group-key={groupKey} data-has-error={hasError ? 'true' : undefined}>
        {children}
      </div>
    );
  }

  return (
    <div className={className} data-group-key={groupKey} data-has-error={hasError ? 'true' : undefined}>
      <div className="ck-group-header">
        <div className="ck-group-title">{resolvedTitle}</div>
        {collapsible ? (
          <button
            type="button"
            className={`ck-progress-pill ${progressClass}`}
            onClick={onToggleCollapsed}
            aria-expanded={!collapsed}
            aria-label={`${collapsed ? 'Expand' : 'Collapse'} section ${resolvedTitle} (${complete}/${total} required complete)`}
            title={`${complete}/${total} required complete`}
          >
            <span>
              {complete}/{total}
            </span>
            <span className="ck-progress-caret">{collapsed ? '▸' : '▾'}</span>
          </button>
        ) : null}
      </div>
      {!collapsed && <div className="ck-group-body">{children}</div>}
    </div>
  );
};



