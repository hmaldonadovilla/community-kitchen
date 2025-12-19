import React from 'react';

export type GroupCardProps = {
  className?: string;
  groupKey: string;
  title?: string | null;
  collapsible?: boolean;
  collapsed?: boolean;
  hasError?: boolean;
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
  onToggleCollapsed,
  children
}) => {
  const resolvedTitle = (title || '').toString().trim();
  const showHeader = !!resolvedTitle;

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
          className="ck-group-header"
          onClick={onToggleCollapsed}
          aria-expanded={!collapsed}
        >
          <div className="ck-group-title">{resolvedTitle}</div>
          <div className="ck-group-chevron">{collapsed ? '▸' : '▾'}</div>
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



