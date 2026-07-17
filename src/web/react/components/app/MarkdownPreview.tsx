import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfmIos15 from '../../app/remarkGfmIos15';

/**
 * Responsibility:
 * - Render Markdown as React elements (no HTML string building)
 * - Apply iOS 15-compatible GFM extensions (footnotes, tables, task lists, strikethrough)
 * - Ensure links open in a new tab
 *
 * Styling is provided via the scoped `.markdown-body` CSS (github-markdown-css) plus CK overrides.
 */
export const MarkdownPreview: React.FC<{
  markdown?: string;
}> = ({ markdown }) => {
  const text = (markdown || '').toString();
  const components = useMemo(
    () => ({
      a: (props: any) => {
        const href = (props?.href || '').toString();
        // Disallow javascript: links just in case.
        const safeHref = href && !/^javascript:/i.test(href) ? href : '#';
        return (
          <a href={safeHref} target="_blank" rel="noopener noreferrer">
            {props?.children}
          </a>
        );
      }
    }),
    []
  );

  return (
    <div className="ck-markdown-scroll">
      <div className="markdown-body ck-markdown-body">
        <ReactMarkdown remarkPlugins={[remarkGfmIos15]} components={components}>
          {text}
        </ReactMarkdown>
      </div>
    </div>
  );
};

