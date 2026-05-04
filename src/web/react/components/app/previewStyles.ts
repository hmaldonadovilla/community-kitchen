/**
 * Owner: app report preview UI.
 * CSS overrides for markdown and HTML report previews injected by App.
 * Keep this module style-only; preview generation remains in App services.
 */

export const MARKDOWN_PREVIEW_STYLES = `
  .ck-markdown-scroll {
    padding: 16px;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }
  .ck-markdown-body.markdown-body {
    /* Scale up GitHub defaults to match CK typography tokens */
    font-size: var(--ck-font-control);
    line-height: 1.5;
    color: var(--text);
    background: transparent;
  }
  .ck-markdown-body.markdown-body h1 {
    font-size: var(--ck-font-group-title);
    font-weight: 600;
  }
  .ck-markdown-body.markdown-body h2 {
    font-size: var(--ck-font-control);
    font-weight: 600;
  }
  .ck-markdown-body.markdown-body h3 {
    font-size: var(--ck-font-label);
    font-weight: 600;
  }
  .ck-markdown-body.markdown-body table {
    width: 100%;
    display: block;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
`;

export const HTML_PREVIEW_STYLES = `
  .ck-html-preview {
    padding: 16px;
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }
  .ck-html-preview__content {
    color: var(--text);
  }
  .ck-file-icon {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    padding: 12px 14px;
    border-radius: 16px;
    border: 1px solid var(--border);
    background: transparent;
    color: var(--text);
    font-weight: 600;
    font-size: var(--ck-font-control);
    cursor: pointer;
    box-shadow: none;
  }
  .ck-file-icon__badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 30px;
    height: 30px;
    padding: 0 9px;
    border-radius: 999px;
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text);
    font-weight: 600;
    font-size: calc(var(--ck-font-label) * 0.85);
    line-height: 1;
  }
`;
