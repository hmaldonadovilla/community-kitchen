import { SYSTEM_FONT_STACK } from '../../../constants/typography';

const escapeHtml = (raw: string): string => {
  return (raw || '')
    .toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

const renderInline = (escapedText: string): string => {
  let text = (escapedText || '').toString();

  // Inline code spans first (avoid formatting inside code).
  const codeSpans: string[] = [];
  text = text.replace(/`([^`]+)`/g, (_m, code) => {
    const idx = codeSpans.length;
    codeSpans.push(`<code>${code}</code>`);
    return `@@CODESPAN_${idx}@@`;
  });

  // Links: [label](url)
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label, url) => {
    const href = (url || '').toString().trim();
    const safeHref = href && !/^javascript:/i.test(href) ? href : '#';
    return `<a href="${escapeHtml(safeHref)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  });

  // Bold / italic (simple, best-effort).
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');

  // Restore code spans.
  codeSpans.forEach((html, idx) => {
    text = text.replace(new RegExp(`@@CODESPAN_${idx}@@`, 'g'), html);
  });
  return text;
};

export const markdownToHtmlDocument = (rawMarkdown: string, opts?: { title?: string }): string => {
  const title = (opts?.title || 'Preview').toString();

  // Extract fenced code blocks first.
  const codeBlocks: string[] = [];
  const withPlaceholders = (rawMarkdown || '')
    .toString()
    .replace(/```([^\n]*)\n([\s\S]*?)```/g, (_m, langRaw, codeRaw) => {
      const idx = codeBlocks.length;
      const lang = (langRaw || '').toString().trim();
      const codeEscaped = escapeHtml(codeRaw || '');
      codeBlocks.push(
        `<pre class="md-code"><code${lang ? ` data-lang="${escapeHtml(lang)}"` : ''}>${codeEscaped}</code></pre>`
      );
      return `\n@@CODEBLOCK_${idx}@@\n`;
    });

  const markdownEscaped = escapeHtml(withPlaceholders);
  const topLines = markdownEscaped.split(/\r?\n/);

  const isCodePlaceholder = (line: string): number | null => {
    const m = (line || '').trim().match(/^@@CODEBLOCK_(\d+)@@$/);
    if (!m) return null;
    const idx = Number.parseInt(m[1], 10);
    return Number.isFinite(idx) ? idx : null;
  };

  const leadingSpaces = (line: string): number => {
    const m = (line || '').match(/^\s*/);
    return m ? m[0].length : 0;
  };

  const listItemMatch = (
    line: string
  ): { indent: number; type: 'ul' | 'ol'; text: string } | null => {
    const m = (line || '').match(/^(\s*)([-*]|\d+\.)\s+(.+)$/);
    if (!m) return null;
    const indent = m[1].length;
    const marker = m[2];
    const text = m[3] || '';
    const type: 'ul' | 'ol' = marker.endsWith('.') ? 'ol' : 'ul';
    return { indent, type, text };
  };

  const splitTableRow = (line: string): string[] => {
    let s = (line || '').trim();
    if (s.startsWith('|')) s = s.slice(1);
    if (s.endsWith('|')) s = s.slice(0, -1);
    return s
      .split('|')
      .map(c => (c || '').trim());
  };

  const isTableDelimiterRow = (line: string): boolean => {
    if (!(line || '').includes('|')) return false;
    const cells = splitTableRow(line);
    if (cells.length < 2) return false;
    return cells.every(c => /^\s*:?-+:?\s*$/.test(c));
  };

  const tableAlignFromCell = (cell: string): 'left' | 'right' | 'center' | undefined => {
    const raw = (cell || '').replace(/\s+/g, '');
    if (!/^:?-+:?$/.test(raw)) return undefined;
    const left = raw.startsWith(':');
    const right = raw.endsWith(':');
    if (left && right) return 'center';
    if (right) return 'right';
    if (left) return 'left';
    return undefined;
  };

  const dedentLines = (lines: string[], count: number): string[] => {
    return (lines || []).map(l => {
      if (!l) return '';
      const n = leadingSpaces(l);
      const remove = Math.min(count, n);
      return l.slice(remove);
    });
  };

  function renderLinesToHtml(lines: string[]): string {
    const out: string[] = [];
    let i = 0;

    const readUntilBlank = (start: number): { lines: string[]; next: number } => {
      const collected: string[] = [];
      let j = start;
      while (j < lines.length) {
        const l = lines[j] || '';
        if (!l.trim()) break;
        collected.push(l);
        j += 1;
      }
      return { lines: collected, next: j };
    };

    const tryParseTableAt = (start: number): { html: string; next: number } | null => {
      if (start + 1 >= lines.length) return null;
      const header = lines[start] || '';
      const delimiter = lines[start + 1] || '';
      if (!header.includes('|')) return null;
      if (!isTableDelimiterRow(delimiter)) return null;
      if (isCodePlaceholder(header) !== null) return null;
      if (isCodePlaceholder(delimiter) !== null) return null;

      const headCells = splitTableRow(header);
      const delimCells = splitTableRow(delimiter);
      const colCount = Math.max(headCells.length, delimCells.length);
      const aligns = new Array(colCount).fill(undefined).map((_, idx) => tableAlignFromCell(delimCells[idx] || ''));

      const ths = new Array(colCount).fill('').map((_, idx) => {
        const cell = headCells[idx] || '';
        const align = aligns[idx];
        const alignAttr = align ? ` style="text-align:${align};"` : '';
        return `<th${alignAttr}>${renderInline(cell)}</th>`;
      });

      const rows: string[] = [];
      let j = start + 2;
      while (j < lines.length) {
        const l = lines[j] || '';
        if (!l.trim()) break;
        if (!l.includes('|')) break;
        if (isCodePlaceholder(l) !== null) break;
        const cells = splitTableRow(l);
        const tds = new Array(colCount).fill('').map((_, idx) => {
          const cell = cells[idx] || '';
          const align = aligns[idx];
          const alignAttr = align ? ` style="text-align:${align};"` : '';
          return `<td${alignAttr}>${renderInline(cell)}</td>`;
        });
        rows.push(`<tr>${tds.join('')}</tr>`);
        j += 1;
      }

      const html = `<div class="md-table-wrap"><table class="md-table"><thead><tr>${ths.join(
        ''
      )}</tr></thead>${rows.length ? `<tbody>${rows.join('')}</tbody>` : ''}</table></div>`;
      return { html, next: j };
    };

    const parseListAt = (start: number): { html: string; next: number } | null => {
      const first = listItemMatch(lines[start] || '');
      if (!first) return null;
      const baseIndent = first.indent;
      const listType = first.type;
      const items: string[] = [];
      let j = start;

      const isSiblingItem = (idx: number): boolean => {
        const m = listItemMatch(lines[idx] || '');
        return Boolean(m && m.indent === baseIndent && m.type === listType);
      };

      while (j < lines.length) {
        const m = listItemMatch(lines[j] || '');
        if (!m || m.indent !== baseIndent || m.type !== listType) break;
        const headText = m.text || '';
        j += 1;

        const child: string[] = [];
        while (j < lines.length) {
          const l = lines[j] || '';
          if (!l.trim()) {
            // Blank lines: keep them only if the next non-blank line is indented (still inside this item).
            let k = j + 1;
            while (k < lines.length && !(lines[k] || '').trim()) k += 1;
            if (k >= lines.length) {
              j = k;
              break;
            }
            if (isSiblingItem(k)) {
              j = k;
              break;
            }
            const nextIndent = leadingSpaces(lines[k] || '');
            if (nextIndent <= baseIndent) {
              j = k;
              break;
            }
            child.push('');
            j += 1;
            continue;
          }

          if (isSiblingItem(j)) break;
          const indent = leadingSpaces(l);
          if (indent <= baseIndent) break;
          child.push(l);
          j += 1;
        }

        const childHtml = child.length ? renderLinesToHtml(dedentLines(child, baseIndent + 2)) : '';
        const inner = childHtml ? `${renderInline(headText)}\n${childHtml}` : renderInline(headText);
        items.push(`<li>${inner}</li>`);
      }

      const html = listType === 'ul' ? `<ul>${items.join('')}</ul>` : `<ol>${items.join('')}</ol>`;
      return { html, next: j };
    };

    while (i < lines.length) {
      const line = lines[i] || '';
      if (!line.trim()) {
        i += 1;
        continue;
      }

      const codeIdx = isCodePlaceholder(line);
      if (codeIdx !== null) {
        out.push(codeBlocks[codeIdx] || '');
        i += 1;
        continue;
      }

      // Headings: # .. ######
      const heading = line.match(/^(#{1,6})\s+(.+)$/);
      if (heading) {
        const level = heading[1].length;
        const content = renderInline(heading[2] || '');
        out.push(`<h${level}>${content}</h${level}>`);
        i += 1;
        continue;
      }

      // Blockquote: > ...
      if (/^\s*>\s?/.test(line)) {
        const collected: string[] = [];
        let j = i;
        while (j < lines.length && /^\s*>\s?/.test(lines[j] || '')) {
          collected.push((lines[j] || '').replace(/^\s*>\s?/, ''));
          j += 1;
        }
        const inner = renderInline(collected.join('<br/>'));
        out.push(`<blockquote>${inner}</blockquote>`);
        i = j;
        continue;
      }

      // Tables (GFM)
      const table = tryParseTableAt(i);
      if (table) {
        out.push(table.html);
        i = table.next;
        continue;
      }

      // Lists (supports nesting by indent)
      const list = parseListAt(i);
      if (list) {
        out.push(list.html);
        i = list.next;
        continue;
      }

      // Paragraph: read until blank.
      const para = readUntilBlank(i);
      const content = renderInline(para.lines.join('<br/>'));
      out.push(`<p>${content}</p>`);
      i = para.next;
    }

    return out.join('\n');
  }

  const body = renderLinesToHtml(topLines);
  const doc = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root {
        color-scheme: light;
      }
      body {
        margin: 0;
        padding: 18px;
        font-family: ${SYSTEM_FONT_STACK};
        color: var(--text);
        background: var(--card);
        line-height: 1.45;
      }
      h1, h2, h3, h4, h5, h6 {
        margin: 18px 0 10px;
        line-height: 1.2;
        letter-spacing: 0;
      }
      p {
        margin: 10px 0;
      }
      ul, ol {
        margin: 10px 0 10px 22px;
        padding: 0;
      }
      li {
        margin: 6px 0;
      }
      .md-table-wrap {
        width: 100%;
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
        margin: 12px 0;
      }
      table.md-table {
        width: 100%;
        border-collapse: collapse;
        border-spacing: 0;
      }
      table.md-table th,
      table.md-table td {
        border: 1px solid var(--border);
        padding: 10px 12px;
        vertical-align: top;
        word-break: break-word;
      }
      table.md-table th {
        background: transparent;
        font-weight: 600;
      }
      table.md-table tr:nth-child(even) td {
        background: transparent;
      }
      blockquote {
        margin: 12px 0;
        padding: 10px 12px;
        border-left: 4px solid var(--border);
        background: transparent;
        border-radius: 12px;
      }
      a {
        color: var(--accent);
        text-decoration: underline;
      }
      code {
        font-family: inherit;
        background: transparent;
        padding: 2px 6px;
        border-radius: 8px;
      }
      pre.md-code {
        overflow: auto;
        background: transparent;
        color: var(--text);
        padding: 14px 16px;
        border-radius: 16px;
        border: 1px solid var(--border);
      }
      pre.md-code code {
        background: transparent;
        padding: 0;
        border-radius: 0;
        color: inherit;
      }
    </style>
  </head>
  <body>
    ${body}
  </body>
</html>`;

  return doc;
};
