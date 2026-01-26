import React, { useCallback, useEffect, useMemo, useRef } from 'react';

export const HtmlPreview: React.FC<{
  html: string;
  /**
   * Only enable for trusted, bundled (bundle:...) templates.
   * Drive-sourced templates must never execute scripts.
   */
  allowScripts?: boolean;
  /**
   * Optional list of tab targets to hide when the template uses data-tab-target/data-tab-panel.
   */
  hideTabTargets?: string[];
  /**
   * Called when the user clicks a FILE_UPLOAD icon placeholder rendered in the HTML.
   */
  onOpenFiles?: (fieldId: string) => void;
  /**
   * Called when a data-ck-action element is clicked inside the HTML.
   */
  onAction?: (actionId: string) => void;
  onDiagnostic?: (event: string, payload?: Record<string, unknown>) => void;
}> = ({ html, allowScripts, hideTabTargets, onOpenFiles, onAction, onDiagnostic }) => {
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

  useEffect(() => {
    if (!hideTabTargets || !hideTabTargets.length) return;
    const root = contentRef.current;
    if (!root) return;
    const targets = new Set(hideTabTargets.map(t => (t || '').toString().trim()).filter(Boolean));
    if (!targets.size) return;
    const tabs = Array.from(root.querySelectorAll('[data-tab-target]')) as HTMLElement[];
    const panels = Array.from(root.querySelectorAll('[data-tab-panel]')) as HTMLElement[];
    if (!tabs.length || !panels.length) return;
    tabs.forEach(tab => {
      const key = (tab.getAttribute('data-tab-target') || '').toString().trim();
      if (!key) return;
      if (targets.has(key)) {
        tab.setAttribute('hidden', 'true');
        tab.setAttribute('aria-hidden', 'true');
        tab.classList.remove('is-active');
      }
    });
    panels.forEach(panel => {
      const key = (panel.getAttribute('data-tab-panel') || '').toString().trim();
      if (!key) return;
      if (targets.has(key)) {
        panel.hidden = true;
        panel.classList.remove('is-active');
      }
    });
    const visibleTabs = tabs.filter(tab => !tab.hasAttribute('hidden'));
    if (!visibleTabs.length) return;
    const activeTab = visibleTabs.find(tab => tab.classList.contains('is-active')) || visibleTabs[0];
    const activeTarget = (activeTab.getAttribute('data-tab-target') || '').toString().trim();
    tabs.forEach(tab => {
      const isActive = tab === activeTab;
      tab.classList.toggle('is-active', isActive);
      tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
    panels.forEach(panel => {
      const isActive = (panel.getAttribute('data-tab-panel') || '').toString().trim() === activeTarget;
      panel.classList.toggle('is-active', isActive);
      panel.hidden = !isActive;
    });
  }, [hideTabTargets, htmlText]);

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

        const actionEl = target.closest?.('[data-ck-action]') as HTMLElement | null;
        if (actionEl) {
          e.preventDefault();
          e.stopPropagation();
          const actionId = (actionEl.getAttribute('data-ck-action') || '').toString().trim();
          if (!actionId) return;
          onDiagnostic?.('htmlPreview.action.click', { actionId });
          onAction?.(actionId);
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

