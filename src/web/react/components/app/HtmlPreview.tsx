import React, { useCallback, useEffect, useMemo, useRef } from 'react';

export const HtmlPreview: React.FC<{
  html: string;
  /**
   * Only enable for trusted, bundled (bundle:...) templates.
   * Drive-sourced templates must never execute scripts.
   */
  allowScripts?: boolean;
  /**
   * Called when the user clicks a FILE_UPLOAD icon placeholder rendered in the HTML.
   */
  onOpenFiles?: (fieldId: string) => void;
  onDiagnostic?: (event: string, payload?: Record<string, unknown>) => void;
}> = ({ html, allowScripts, onOpenFiles, onDiagnostic }) => {
  const htmlText = useMemo(() => (html || '').toString(), [html]);
  const contentRef = useRef<HTMLDivElement | null>(null);

  // React's innerHTML does not execute <script> tags.
  // For trusted bundled templates we intentionally support small inline scripts, so we manually execute them.
  useEffect(() => {
    if (!allowScripts) return;
    const root = contentRef.current;
    if (!root) return;
    const nodes = Array.from(root.querySelectorAll('script')) as HTMLScriptElement[];
    if (!nodes.length) return;

    onDiagnostic?.('htmlPreview.scripts.execute.start', { count: nodes.length });
    nodes.forEach((node, idx) => {
      try {
        const src = (node.getAttribute('src') || '').toString().trim();
        // Keep this strictly inline-only; bundled templates should not pull remote JS.
        if (src) {
          onDiagnostic?.('htmlPreview.scripts.execute.blockedExternal', { index: idx, src });
          node.parentNode?.removeChild(node);
          return;
        }
        const code = (node.textContent || '').toString();
        node.parentNode?.removeChild(node);
        if (!code.trim()) return;
        const s = globalThis.document?.createElement?.('script');
        if (!s) return;
        // Preserve explicit type if present.
        const type = (node.getAttribute('type') || '').toString().trim();
        if (type) s.setAttribute('type', type);
        (s as any).text = code;
        root.appendChild(s);
        // Remove immediately to keep the DOM tidy; code has already executed.
        root.removeChild(s);
      } catch (err: any) {
        const msg = (err?.message || err?.toString?.() || 'Failed to execute template script.').toString();
        onDiagnostic?.('htmlPreview.scripts.execute.error', { index: idx, message: msg });
      }
    });
    onDiagnostic?.('htmlPreview.scripts.execute.done', { count: nodes.length });
  }, [allowScripts, htmlText, onDiagnostic]);

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
        ref={contentRef}
        // Security note:
        // - Drive templates: scripts are rejected server-side.
        // - Bundled templates: scripts may be present and can be executed (allowScripts=true).
        dangerouslySetInnerHTML={{ __html: htmlText }}
      />
    </div>
  );
};


