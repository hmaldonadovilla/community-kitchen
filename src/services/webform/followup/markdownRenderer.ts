import { FormConfig, QuestionConfig, TemplateIdMap, WebFormSubmission } from '../../../types';
import { DataSourceService } from '../dataSources';
import { debugLog } from '../debug';
import { resolveTemplateId } from './recipients';
import { addConsolidatedPlaceholders, buildPlaceholderMap, collectLineItemRows } from './placeholders';
import { collectValidationWarnings } from './validation';
import { addPlaceholderVariants, applyPlaceholders, formatTemplateValueForMarkdown } from './utils';
import {
  getCachedMarkdownTemplate,
  readMarkdownTemplateRawFromDrive,
  setCachedMarkdownTemplate
} from './markdownTemplateCache';
import { applyMarkdownLineItemBlocks } from './markdownLineItemBlocks';

/**
 * Render a Markdown (text) template stored in Drive using the same placeholder rules as Doc templates.
 *
 * This is used by web app BUTTON actions for a single-click in-app preview flow.
 */
export const renderMarkdownFromTemplate = (args: {
  dataSources: DataSourceService;
  form: FormConfig;
  questions: QuestionConfig[];
  record: WebFormSubmission;
  templateIdMap: TemplateIdMap;
  namePrefix?: string;
}): { success: boolean; message?: string; markdown?: string; fileName?: string } => {
  const { dataSources, form, questions, record, templateIdMap, namePrefix } = args;
  const templateId = resolveTemplateId(templateIdMap, record);
  if (!templateId) {
    return { success: false, message: 'No template matched the record values/language.' };
  }

  try {
    const cached = getCachedMarkdownTemplate(templateId);
    let raw = (cached || '').toString();
    let mimeType = 'text/plain';
    const hasCached = raw.trim().length > 0;
    if (hasCached) {
      debugLog('followup.markdown.cacheHit', { templateId });
    } else {
      const res = readMarkdownTemplateRawFromDrive(templateId);
      if (!res.success || !res.raw) {
        return { success: false, message: res.message || 'Template file is empty (or could not be read).' };
      }
      raw = res.raw;
      mimeType = (res.mimeType || 'text/plain').toString();
      setCachedMarkdownTemplate(templateId, raw, form.templateCacheTtlSeconds);
      debugLog('followup.markdown.cacheMiss', { templateId, mimeType, cached: false });
    }

    const lineItemRows = collectLineItemRows(record, questions);
    const placeholders = buildPlaceholderMap({
      record,
      questions,
      lineItemRows,
      dataSources,
      formatValue: formatTemplateValueForMarkdown
    });
    addConsolidatedPlaceholders(placeholders, questions, lineItemRows);
    const validationWarnings = collectValidationWarnings(questions, record);
    addPlaceholderVariants(
      placeholders,
      'VALIDATION_WARNINGS',
      validationWarnings.join('\n'),
      'PARAGRAPH',
      formatTemplateValueForMarkdown
    );

    // Apply Doc-like line-item directives (ORDER_BY / EXCLUDE_WHEN / CONSOLIDATED_TABLE) for markdown blocks,
    // then apply normal placeholder replacement across the full document.
    const withLineItems = applyMarkdownLineItemBlocks({
      markdown: raw,
      questions,
      lineItemRows,
      dataSources,
      language: record.language
    });
    const markdown = applyPlaceholders(withLineItems, placeholders);
    const fileName = `${namePrefix || form.title || 'Form'} - ${record.id || 'Preview'}.md`;
    debugLog('followup.markdown.ok', { templateId, mimeType, fileName });
    return { success: true, markdown, fileName };
  } catch (err: any) {
    const msg = (err?.message || err?.toString?.() || 'Failed to render Markdown.').toString();
    debugLog('followup.markdown.failed', { templateId, message: msg });
    return { success: false, message: msg };
  }
};


