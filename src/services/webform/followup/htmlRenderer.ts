import { FormConfig, QuestionConfig, TemplateIdMap, WebFormSubmission } from '../../../types';
import { DataSourceService } from '../dataSources';
import { debugLog } from '../debug';
import { resolveTemplateId } from './recipients';
import { addConsolidatedPlaceholders, buildPlaceholderMap, collectLineItemRows } from './placeholders';
import { collectValidationWarnings } from './validation';
import { addPlaceholderVariants, applyPlaceholders } from './utils';
import {
  getCachedHtmlTemplate,
  readHtmlTemplateRawFromDrive,
  setCachedHtmlTemplate
} from './htmlTemplateCache';
import { applyHtmlLineItemBlocks } from './htmlLineItemBlocks';
import { linkifyUploadedFileUrlsInHtml } from './fileLinks';

const stripScripts = (html: string): string => {
  // Basic mitigation: drop <script> tags from user-provided templates.
  // Note: event-handler attributes (onclick, etc.) are not removed.
  return (html || '').toString().replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');
};

const escapeAttr = (value: string): string => {
  return (value || '')
    .toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

const splitUrlList = (raw: string): string[] => {
  const trimmed = (raw || '').toString().trim();
  if (!trimmed) return [];
  const commaParts = trimmed
    .split(',')
    .map(p => p.trim())
    .filter(Boolean);
  if (commaParts.length > 1) return commaParts;
  const matches = trimmed.match(/https?:\/\/[^\s,]+/gi);
  if (matches && matches.length > 1) return matches.map(m => m.trim()).filter(Boolean);
  return [trimmed];
};

const countUploadItems = (value: any): number => {
  if (value === undefined || value === null || value === '') return 0;
  if (typeof value === 'string') return splitUrlList(value).filter(Boolean).length;
  if (Array.isArray(value)) {
    let n = 0;
    value.forEach(item => {
      if (item === undefined || item === null) return;
      if (typeof item === 'string') {
        n += splitUrlList(item).filter(Boolean).length;
        return;
      }
      if (typeof item === 'object') {
        const url = ((item as any).url || '').toString().trim();
        if (url) n += splitUrlList(url).filter(Boolean).length;
      }
    });
    return n;
  }
  if (typeof value === 'object') {
    const url = ((value as any).url || '').toString().trim();
    if (url) return splitUrlList(url).filter(Boolean).length;
  }
  return 0;
};

const addFileIconPlaceholders = (placeholders: Record<string, string>, questions: QuestionConfig[], record: WebFormSubmission) => {
  (questions || [])
    .filter(q => q && q.type === 'FILE_UPLOAD' && q.id)
    .forEach(q => {
      const fieldId = (q.id || '').toString().trim();
      if (!fieldId) return;
      const raw = (record.values as any)?.[fieldId];
      const count = countUploadItems(raw);
      const slotIconType = (((q as any)?.uploadConfig?.ui?.slotIcon || 'camera') as string).toString().trim().toLowerCase();
      const icon = slotIconType === 'clip' ? '📎' : '📷';
      // If there are no files, render nothing so templates don't reserve right-side space.
      if (!count) {
        placeholders[`{{FILES_ICON(${fieldId})}}`] = '';
        return;
      }
      const badge = `<span class="ck-file-icon__badge">${count}</span>`;
      const snippet = `<button data-ck-file-field="${escapeAttr(fieldId)}" data-ck-file-count="${count}" type="button" class="ck-file-icon" aria-label="Open files">${icon}${badge}</button>`;
      placeholders[`{{FILES_ICON(${fieldId})}}`] = snippet;
    });
};

/**
 * Render an HTML (text) template stored in Drive using the same placeholder rules as Doc templates.
 *
 * This is used by web app BUTTON actions for a fast in-app preview flow.
 */
export const renderHtmlFromHtmlTemplate = (args: {
  dataSources: DataSourceService;
  form: FormConfig;
  questions: QuestionConfig[];
  record: WebFormSubmission;
  templateIdMap: TemplateIdMap;
  namePrefix?: string;
}): { success: boolean; message?: string; html?: string; fileName?: string } => {
  const { dataSources, form, questions, record, templateIdMap, namePrefix } = args;
  const templateId = resolveTemplateId(templateIdMap, record);
  if (!templateId) {
    return { success: false, message: 'No template matched the record values/language.' };
  }

  try {
    const cached = getCachedHtmlTemplate(templateId);
    let raw = (cached || '').toString();
    let mimeType = 'text/html';
    const hasCached = raw.trim().length > 0;
    if (hasCached) {
      debugLog('followup.htmlTemplate.cacheHit', { templateId });
    } else {
      const res = readHtmlTemplateRawFromDrive(templateId);
      if (!res.success || !res.raw) {
        return { success: false, message: res.message || 'Template file is empty (or could not be read).' };
      }
      raw = res.raw;
      mimeType = (res.mimeType || 'text/html').toString();
      setCachedHtmlTemplate(templateId, raw);
      debugLog('followup.htmlTemplate.cacheMiss', { templateId, mimeType, cached: false });
    }

    const lineItemRows = collectLineItemRows(record, questions);
    const placeholders = buildPlaceholderMap({ record, questions, lineItemRows, dataSources });
    addConsolidatedPlaceholders(placeholders, questions, lineItemRows);
    const validationWarnings = collectValidationWarnings(questions, record);
    addPlaceholderVariants(placeholders, 'VALIDATION_WARNINGS', validationWarnings.join('\n'));
    addFileIconPlaceholders(placeholders, questions, record);

    // Apply Doc-like line-item directives (ORDER_BY / EXCLUDE_WHEN / CONSOLIDATED_TABLE) for HTML blocks,
    // then apply normal placeholder replacement across the full document.
    const withLineItems = applyHtmlLineItemBlocks({ html: raw, questions, lineItemRows });
    const withPlaceholders = stripScripts(applyPlaceholders(withLineItems, placeholders));
    // For FILE_UPLOAD fields, render readable link labels instead of dumping raw Drive URLs.
    const html = linkifyUploadedFileUrlsInHtml(withPlaceholders, questions, record);
    const fileName = `${namePrefix || form.title || 'Form'} - ${record.id || 'Preview'}.html`;
    debugLog('followup.htmlTemplate.ok', { templateId, mimeType, fileName });
    return { success: true, html, fileName };
  } catch (err: any) {
    const msg = (err?.message || err?.toString?.() || 'Failed to render HTML.').toString();
    debugLog('followup.htmlTemplate.failed', { templateId, message: msg });
    return { success: false, message: msg };
  }
};


