import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Responsibility:
 * - Render inline-safe markdown (bold/italic/links/code) for compact UI surfaces.
 * - Avoid block elements that would break layout (lists, headings, tables, etc.).
 */
export const InlineMarkdown: React.FC<{ markdown?: string; className?: string }> = ({ markdown, className }) => {
  const text = (markdown || '').toString();
  const components = useMemo(
    () => ({
      p: (props: any) => <span>{props?.children}</span>,
      a: (props: any) => {
        const href = (props?.href || '').toString();
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
    <span className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={components}
        disallowedElements={[
          'h1',
          'h2',
          'h3',
          'h4',
          'h5',
          'h6',
          'ul',
          'ol',
          'li',
          'pre',
          'table',
          'thead',
          'tbody',
          'tr',
          'td',
          'th',
          'blockquote',
          'hr'
        ]}
        unwrapDisallowed
      >
        {text}
      </ReactMarkdown>
    </span>
  );
};
