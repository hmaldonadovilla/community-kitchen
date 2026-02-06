import React from 'react';

export type PageSectionProps = {
  className?: string;
  title?: string | null;
  infoText?: string | null;
  infoDisplay?: 'pill' | 'belowTitle' | 'hidden';
  children: React.ReactNode;
};

/**
 * Visual-only page section wrapper for grouping multiple group cards in the edit (form) view.
 * This does not affect validation, submission payloads, or collapsible group behavior.
 */
export const PageSection: React.FC<PageSectionProps> = ({
  className = 'ck-page-section',
  title,
  infoText,
  infoDisplay = 'pill',
  children
}) => {
  const resolvedTitle = (title || '').toString().trim();
  const resolvedInfo = (infoText || '').toString().trim();
  const showInfo = infoDisplay !== 'hidden' && !!resolvedInfo;
  const showHeader = !!resolvedTitle || showInfo;

  if (!showHeader) return <>{children}</>;

  return (
    <section className={className} data-has-info={showInfo ? 'true' : undefined} data-info-display={infoDisplay}>
      <header className="ck-page-section__header">
        {resolvedTitle || (showInfo && infoDisplay === 'belowTitle') ? (
          <div className="ck-page-section__title-wrap">
            {resolvedTitle ? <div className="ck-page-section__title">{resolvedTitle}</div> : null}
            {showInfo && infoDisplay === 'belowTitle' ? <div className="ck-page-section__notice">{resolvedInfo}</div> : null}
          </div>
        ) : (
          <div />
        )}
        {showInfo && infoDisplay === 'pill' ? <div className="ck-page-section__info">{resolvedInfo}</div> : null}
      </header>
      <div className="ck-page-section__body">{children}</div>
    </section>
  );
};
