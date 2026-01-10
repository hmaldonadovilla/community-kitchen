import React from 'react';
import { LangCode } from '../../../types';
import { tSystem } from '../../../systemStrings';

export type GroupCardProps = {
  className?: string;
  groupKey: string;
  title?: string | null;
  collapsible?: boolean;
  collapsed?: boolean;
  hasError?: boolean;
  progress?: { complete: number; total: number } | null;
  language?: LangCode;
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
  language = 'EN',
  onToggleCollapsed,
  children
}) => {
  const resolvedTitle = (title || '').toString().trim();
  const showHeader = !!resolvedTitle;
  const showProgress = !!progress && typeof progress.complete === 'number' && typeof progress.total === 'number';
  const complete = showProgress ? progress.complete : 0;
  const total = showProgress ? progress.total : 0;
  let progressClass = showProgress && total > 0 ? (complete >= total ? 'ck-progress-good' : 'ck-progress-bad') : 'ck-progress-neutral';
  if (hasError) progressClass = 'ck-progress-bad';
  const tapExpandLabel = tSystem('common.tapToExpand', language, 'Tap to expand');
  const tapCollapseLabel = tSystem('common.tapToCollapse', language, 'Tap to collapse');

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
          aria-label={`${collapsed ? tapExpandLabel : tapCollapseLabel} section ${resolvedTitle}`}
        >
          <div className="ck-group-title">{resolvedTitle}</div>
          <span
            className={`ck-progress-pill ${progressClass}`}
            title={collapsed ? tapExpandLabel : tapCollapseLabel}
            aria-hidden="true"
          >
            <span className="ck-progress-label">{collapsed ? tapExpandLabel : tapCollapseLabel}</span>
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



