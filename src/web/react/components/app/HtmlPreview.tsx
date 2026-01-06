import React, { useCallback } from 'react';

export const HtmlPreview: React.FC<{
  html: string;
  /**
   * Called when the user clicks a FILE_UPLOAD icon placeholder rendered in the HTML.
   */
  onOpenFiles?: (fieldId: string) => void;
  onDiagnostic?: (event: string, payload?: Record<string, unknown>) => void;
}> = ({ html, onOpenFiles, onDiagnostic }) => {
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      try {
        const target = e.target as HTMLElement | null;
        if (!target) return;
        const fileBtn = target.closest?.('[data-ck-file-field]') as HTMLElement | null;
        if (fileBtn) {
          e.preventDefault();
          e.stopPropagation();
          const fieldId = (fileBtn.getAttribute('data-ck-file-field') || '').toString().trim();
          if (!fieldId) return;
          onDiagnostic?.('htmlPreview.filesIcon.click', {
            fieldId,
            count: fileBtn.getAttribute('data-ck-file-count') || null
          });
          onOpenFiles?.(fieldId);
          return;
        }

        // Prevent HTML templates from navigating this tab away (common footgun).
        const link = target.closest?.('a[href]') as HTMLAnchorElement | null;
        const href = (link?.getAttribute('href') || '').toString().trim();
        if (link && href && /^https?:\/\//i.test(href)) {
          e.preventDefault();
          e.stopPropagation();
          onDiagnostic?.('htmlPreview.link.open', { href });
          try {
            globalThis.open?.(href, '_blank', 'noopener,noreferrer');
          } catch (_) {
            // ignore
          }
        }
      } catch (_) {
        // ignore
      }
    },
    [onDiagnostic, onOpenFiles]
  );

  return (
    <div
      className="ck-html-preview"
      onClick={handleClick}
      style={{ padding: 16, overflowY: 'auto', flex: 1, minHeight: 0 }}
    >
      <div
        className="ck-html-preview__content"
        // HTML templates are form-owner controlled; scripts are stripped server-side as a basic mitigation.
        dangerouslySetInnerHTML={{ __html: (html || '').toString() }}
      />
    </div>
  );
};


