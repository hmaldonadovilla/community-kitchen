import { QuestionConfig, WebFormSubmission } from '../../../types';
import { escapeRegExp } from './utils';
import { resolveSubgroupKey } from './utils';

const looksLikeUrl = (s: string) => /^https?:\/\/\S+$/i.test((s || '').trim());

const resolveLocalizedValue = (value: any, language?: string): string => {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value !== 'object') return '';
  const langKey = (language || 'EN').toString().trim().toUpperCase();
  const lower = (language || 'EN').toString().trim().toLowerCase();
  return (value as any)[lower] || (value as any)[langKey] || (value as any).en || (value as any).EN || '';
};

const formatTemplate = (value: string, vars?: Record<string, string | number | boolean | null | undefined>): string => {
  if (!vars) return value;
  return value.replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, key) => {
    const raw = (vars as any)[key];
    return raw === undefined || raw === null ? '' : String(raw);
  });
};

export const extractUploadUrls = (value: any): string[] => {
  const urls: string[] = [];
  const push = (raw: any) => {
    const u = String(raw ?? '').trim();
    if (!u) return;
    // Stored format is typically "url1, url2" but allow commas/newlines.
    u.split(/[,\n]+/g)
      .map(p => p.trim())
      .filter(Boolean)
      .forEach(part => {
        if (!looksLikeUrl(part)) return;
        urls.push(part);
      });
  };

  if (Array.isArray(value)) {
    value.forEach(v => {
      if (!v) return;
      if (typeof v === 'string') return push(v);
      if (typeof v === 'object' && typeof (v as any).url === 'string') return push((v as any).url);
    });
  } else if (typeof value === 'string') {
    push(value);
  } else if (typeof value === 'object' && value && typeof (value as any).url === 'string') {
    push((value as any).url);
  }

  // de-dupe while preserving order
  const seen = new Set<string>();
  return urls.filter(u => {
    if (!u) return false;
    if (seen.has(u)) return false;
    seen.add(u);
    return true;
  });
};

export const formatFileLinkLabel = (n: number, language?: string, linkLabel?: any): string => {
  // Optional per-field label template override: e.g., { en: "Photo {n}", fr: "Photo {n}", nl: "Foto {n}" }.
  const template = resolveLocalizedValue(linkLabel, language);
  if (template) return formatTemplate(template, { n });

  const lang = (language || 'EN').toString().trim().toUpperCase();
  const base = lang.startsWith('FR') ? 'Fichier' : lang.startsWith('NL') ? 'Bestand' : 'File';
  return `${base} ${n}`;
};

const escapeHtml = (value: string): string => {
  const s = (value || '').toString();
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

const escapeHtmlAttr = (value: string): string => escapeHtml(value);

/**
 * Build a URL -> label map for all FILE_UPLOAD fields in a record (top-level + line items).
 * Used by:
 * - PDF/Doc rendering (convert raw URLs into labelled hyperlinks)
 * - HTML template rendering (same UX as Summary view: labelled links, not full URLs)
 */
export const buildUploadedFileUrlToLabelMap = (
  questions: QuestionConfig[],
  record: WebFormSubmission
): Record<string, string> => {
  const urlToLabel: Record<string, string> = {};

  const addValue = (raw: any, linkLabel?: any) => {
    const urls = extractUploadUrls(raw);
    urls.forEach((u, idx) => {
      const url = (u || '').toString().trim();
      if (!url) return;
      if (urlToLabel[url]) return;
      urlToLabel[url] = formatFileLinkLabel(idx + 1, record.language, linkLabel);
    });
  };

  // Top-level FILE_UPLOAD questions
  (questions || []).forEach(q => {
    if (!q || q.type !== 'FILE_UPLOAD') return;
    addValue((record.values as any)?.[q.id], (q as any)?.uploadConfig?.linkLabel);
  });

  // Line item groups + subgroups
  (questions || [])
    .filter(q => q && q.type === 'LINE_ITEM_GROUP')
    .forEach(groupQ => {
      const rows = Array.isArray((record.values as any)?.[groupQ.id]) ? (((record.values as any)[groupQ.id] as any[]) || []) : [];
      if (!rows.length) return;

      const groupFields = (groupQ.lineItemConfig?.fields || []) as any[];
      groupFields.forEach(f => {
        if (((f as any)?.type || '').toString().toUpperCase() !== 'FILE_UPLOAD') return;
        rows.forEach(row => addValue((row || {})[f.id], (f as any)?.uploadConfig?.linkLabel));
      });

      const subs = (groupQ.lineItemConfig?.subGroups || []) as any[];
      subs.forEach(sub => {
        const subKey = resolveSubgroupKey(sub as any);
        if (!subKey) return;
        const subFields = (sub.fields || []) as any[];
        subFields.forEach(f => {
          if (((f as any)?.type || '').toString().toUpperCase() !== 'FILE_UPLOAD') return;
          rows.forEach(row => {
            const children = Array.isArray((row || {})[subKey]) ? (((row as any)[subKey] as any[]) || []) : [];
            children.forEach(child => addValue((child || {})[f.id], (f as any)?.uploadConfig?.linkLabel));
          });
        });
      });
    });

  return urlToLabel;
};

/**
 * Replace plain file-upload URLs in an HTML string with labelled hyperlinks.
 *
 * Why:
 * - FILE_UPLOAD values are stored as Drive URLs.
 * - In HTML templates, a placeholder like {{FIELD_ID}} would otherwise render as the full URL.
 * - This function converts those URLs to readable labels (e.g. "File 1") with clickable links.
 *
 * Safety:
 * - Only replaces in text nodes (not inside tags/attributes) to avoid breaking markup.
 * - Skips text inside existing <a>...</a> to avoid nested anchors.
 */
export const linkifyUploadedFileUrlsInHtml = (
  html: string,
  questions: QuestionConfig[],
  record: WebFormSubmission
): string => {
  const raw = (html || '').toString();
  if (!raw.trim()) return raw;

  const urlToLabel = buildUploadedFileUrlToLabelMap(questions, record);
  const entries = Object.entries(urlToLabel).filter(([u, l]) => Boolean(u) && Boolean(l));
  if (!entries.length) return raw;

  const markers = entries.map(([url, label], idx) => ({
    url,
    label,
    marker: `__CK_FILE_URL__${idx}__`
  }));

  // First pass: insert markers only in text segments outside tags and outside existing anchors.
  let out = '';
  let textBuf = '';
  let tagBuf = '';
  let inTag = false;
  let quote: string | null = null;
  let inAnchor = false;

  const flushText = () => {
    if (!textBuf) return;
    let t = textBuf;
    if (!inAnchor) {
      markers.forEach(m => {
        const re = new RegExp(escapeRegExp(m.url), 'g');
        t = t.replace(re, m.marker);
      });
    }
    out += t;
    textBuf = '';
  };

  const finishTag = (tag: string) => {
    // Update anchor state based on the tag we just closed.
    // Note: we keep this intentionally simple and robust for well-formed HTML.
    if (/^<\s*\/\s*a\b/i.test(tag)) {
      inAnchor = false;
    } else if (/^<\s*a\b/i.test(tag) && !/\/\s*>$/.test(tag)) {
      inAnchor = true;
    }
    out += tag;
  };

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (!inTag) {
      if (ch === '<') {
        flushText();
        inTag = true;
        quote = null;
        tagBuf = '<';
      } else {
        textBuf += ch;
      }
      continue;
    }

    // inside tag
    tagBuf += ch;
    if (quote) {
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === '>') {
      // tag finished
      finishTag(tagBuf);
      tagBuf = '';
      inTag = false;
      quote = null;
    }
  }

  // Flush any trailing buffer(s)
  if (inTag && tagBuf) out += tagBuf;
  flushText();

  // Second pass: replace markers with <a> tags (safe because we don't do URL replacements anymore).
  let finalHtml = out;
  markers.forEach(m => {
    const href = escapeHtmlAttr(m.url);
    const label = escapeHtml(m.label);
    const anchor = `<a class="ck-file-link" href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`;
    const re = new RegExp(escapeRegExp(m.marker), 'g');
    finalHtml = finalHtml.replace(re, anchor);
  });

  return finalHtml;
};

/**
 * FILE_UPLOAD fields are stored as Drive URLs (comma-separated). In the rendered PDF we want:
 * - correct links (each file URL is clickable)
 * - readable labels instead of the full URL (same UX as Summary view)
 */
export const linkifyUploadedFileUrls = (
  doc: GoogleAppsScript.Document.Document,
  questions: QuestionConfig[],
  record: WebFormSubmission
): void => {
  try {
    const body = doc.getBody();
    const header = doc.getHeader();
    const footer = doc.getFooter();
    const targets: any[] = [];
    if (body) targets.push(body);
    if (header) targets.push(header as any);
    if (footer) targets.push(footer as any);
    if (!targets.length) return;

    const urlToLabel = buildUploadedFileUrlToLabelMap(questions, record);

    const entries = Object.entries(urlToLabel);
    if (!entries.length) return;

    entries.forEach(([url, label]) => {
      if (!url || !label) return;
      const pattern = escapeRegExp(url);
      targets.forEach(t => {
        let guard = 0;
        let found = t.findText ? t.findText(pattern) : null;
        while (found && guard < 500) {
          guard++;
          try {
            const el = found.getElement && found.getElement();
            if (!el || !el.getType || el.getType() !== DocumentApp.ElementType.TEXT) {
              found = t.findText(pattern);
              continue;
            }
            const text = el.asText();
            const start = found.getStartOffset();
            const end = found.getEndOffsetInclusive();
            if (typeof start !== 'number' || typeof end !== 'number' || end < start) {
              found = t.findText(pattern);
              continue;
            }
            text.deleteText(start, end);
            text.insertText(start, label);
            try {
              text.setLinkUrl(start, start + label.length - 1, url);
            } catch (_) {
              // best effort
            }
          } catch (_) {
            // ignore
          }
          found = t.findText(pattern);
        }
      });
    });
  } catch (_) {
    // best-effort; never fail report generation because of link formatting
  }
};


