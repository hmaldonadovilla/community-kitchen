import React from 'react';

export type PageSectionProps = {
  className?: string;
  title?: string | null;
  infoText?: string | null;
  children: React.ReactNode;
};

/**
 * Visual-only page section wrapper for grouping multiple group cards in the edit (form) view.
 * This does not affect validation, submission payloads, or collapsible group behavior.
 */
export const PageSection: React.FC<PageSectionProps> = ({ className = 'ck-page-section', title, infoText, children }) => {
  const resolvedTitle = (title || '').toString().trim();
  const resolvedInfo = (infoText || '').toString().trim();
  const showHeader = !!resolvedTitle || !!resolvedInfo;

  if (!showHeader) return <>{children}</>;

  return (
    <section className={className} data-has-info={resolvedInfo ? 'true' : undefined}>
      <header className="ck-page-section__header">
        {resolvedTitle ? <div className="ck-page-section__title">{resolvedTitle}</div> : <div />}
        {resolvedInfo ? <div className="ck-page-section__info">{resolvedInfo}</div> : null}
      </header>
      <div className="ck-page-section__body">{children}</div>
    </section>
  );
};

