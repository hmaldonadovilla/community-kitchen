import React, { useMemo } from 'react';

const ensureBaseTargetBlank = (rawHtml: string): string => {
  const html = (rawHtml || '').toString();
  if (!html.trim()) return '<!doctype html><html><head></head><body></body></html>';
  // If a <base> tag is already present, don't add one.
  if (/<base\b/i.test(html)) return html;
  // Insert into <head> when possible.
  const headMatch = html.match(/<head\b[^>]*>/i);
  if (headMatch && headMatch.index !== undefined) {
    const idx = headMatch.index + headMatch[0].length;
    return `${html.slice(0, idx)}<base target="_blank" />${html.slice(idx)}`;
  }
  return html;
};

export const DocHtmlPreview: React.FC<{
  html?: string;
  srcUrl?: string;
  title?: string;
  height?: string | number;
}> = ({ html, srcUrl, title, height }) => {
  const srcDoc = useMemo(() => ensureBaseTargetBlank(html || ''), [html]);
  const iframeHeight = height !== undefined ? height : '80vh';

  return (
    <iframe
      title={title || 'Document preview'}
      src={srcUrl || undefined}
      srcDoc={!srcUrl ? srcDoc : undefined}
      // Only sandbox when rendering srcDoc HTML. For Google Docs/Drive previews, sandboxing can break the viewer.
      sandbox={!srcUrl ? 'allow-popups' : undefined}
      style={{
        width: '100%',
        height: iframeHeight,
        border: 'none',
        borderRadius: 0,
        background: 'transparent'
      }}
    />
  );
};
