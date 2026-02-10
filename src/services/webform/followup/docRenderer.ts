import { FollowupConfig, FormConfig, QuestionConfig, TemplateIdMap, WebFormSubmission } from '../../../types';
import { DataSourceService } from '../dataSources';
import { debugLog } from '../debug';
import {
  exportPdfBlobFromDoc,
  renderDocCopyFromTemplate,
  resolveOutputTarget,
  resolveRecordFileLabel,
  resolveRootOutputTarget,
  trashFileById
} from './docRenderer.copy';
import { exportDocFileToHtml } from './docRenderer.exportHtml';
import { renderHtmlFromHtmlTemplate } from './htmlRenderer';
import { buildMealProductionPdfPlaceholders } from './mealProductionPdfContent';
import { parseBundledHtmlTemplateId } from './bundledHtmlTemplates';
import { resolveTemplateId } from './recipients';

function isBundledHtmlPdfTemplate(templateId: string | undefined | null): boolean {
  const key = parseBundledHtmlTemplateId(templateId || '');
  return Boolean(key && key.toLowerCase().endsWith('.pdf.html'));
}

const wrapHtmlForPdf = (rawHtml: string): string => {
  const input = (rawHtml || '').toString().trim();
  if (!input) return '<!doctype html><html><head><meta charset="UTF-8"></head><body></body></html>';

  const supportStyle =
    '<style>' +
    'html,body{margin:0;padding:0;}' +
    '*{-webkit-print-color-adjust:exact;print-color-adjust:exact;}' +
    '</style>';

  if (/<html[\s>]/i.test(input)) {
    if (/<head[\s>]/i.test(input)) {
      return input.replace(/<\/head>/i, `${supportStyle}</head>`);
    }
    return input.replace(/<html([^>]*)>/i, `<html$1><head><meta charset="UTF-8">${supportStyle}</head>`);
  }

  const leadingStyles: string[] = [];
  const bodyHtml = input.replace(/^\s*(<style[\s\S]*?<\/style>\s*)+/i, styles => {
    leadingStyles.push(styles);
    return '';
  });

  return (
    '<!doctype html>' +
    '<html>' +
    '<head>' +
    '<meta charset="UTF-8">' +
    supportStyle +
    leadingStyles.join('') +
    '</head>' +
    '<body>' +
    bodyHtml +
    '</body>' +
    '</html>'
  );
};

function renderHtmlPdfArtifactFromTemplate(args: {
  ss: GoogleAppsScript.Spreadsheet.Spreadsheet;
  dataSources: DataSourceService;
  form: FormConfig;
  questions: QuestionConfig[];
  record: WebFormSubmission;
  templateIdMap: TemplateIdMap;
  folderId?: string;
  namePrefix?: string;
}): { success: boolean; message?: string; url?: string; fileId?: string; blob?: GoogleAppsScript.Base.Blob } {
  const { ss, dataSources, form, questions, record, templateIdMap, folderId, namePrefix } = args;
  try {
    const placeholders = buildMealProductionPdfPlaceholders({ form, questions, record });
    const htmlResult = renderHtmlFromHtmlTemplate({
      dataSources,
      form,
      questions,
      record,
      templateIdMap,
      namePrefix,
      extraPlaceholders: placeholders
    });
    if (!htmlResult.success || !htmlResult.html) {
      return { success: false, message: htmlResult.message || 'Failed to render template.' };
    }
    const htmlOutput = HtmlService.createHtmlOutput(wrapHtmlForPdf(htmlResult.html));
    const pdfBlob = htmlOutput.getAs('application/pdf');
    const recordLabel = resolveRecordFileLabel(form, record);
    const copyName = `${namePrefix || form.title || 'Form'} - ${recordLabel || 'Record'}`;
    pdfBlob.setName(`${copyName}.pdf`);
    const outputTarget = resolveOutputTarget(ss, folderId, form.followupConfig);
    const created = outputTarget.createFile(pdfBlob);
    return { success: true, url: created.url, fileId: created.fileId, blob: pdfBlob };
  } catch (err) {
    debugLog('followup.htmlPdf.failed', { error: err ? err.toString() : 'unknown' });
    return { success: false, message: 'Failed to generate PDF from HTML template.' };
  }
}

/**
 * Google Doc template rendering + artifact generation for follow-up flows.
 *
 * Responsibility:
 * - Copy Doc templates, apply placeholders, render line-item table directives
 * - Generate PDF artifacts / in-memory PDF bytes / preview Doc URLs / HTML exports
 *
 * Dependencies are passed in (ss + dataSources) to keep FollowupService small.
 */

export const renderPdfArtifactFromTemplate = (args: {
  ss: GoogleAppsScript.Spreadsheet.Spreadsheet;
  dataSources: DataSourceService;
  form: FormConfig;
  questions: QuestionConfig[];
  record: WebFormSubmission;
  templateIdMap: TemplateIdMap;
  folderId?: string;
  namePrefix?: string;
}): { success: boolean; message?: string; url?: string; fileId?: string; blob?: GoogleAppsScript.Base.Blob } => {
  const { ss, dataSources, form, questions, record, templateIdMap, folderId, namePrefix } = args;
  const resolvedTemplateId = resolveTemplateId(templateIdMap, record);
  if (!resolvedTemplateId) {
    return { success: false, message: 'No template matched the record values/language.' };
  }
  if (isBundledHtmlPdfTemplate(resolvedTemplateId)) {
    return renderHtmlPdfArtifactFromTemplate({
      ss,
      dataSources,
      form,
      questions,
      record,
      templateIdMap,
      folderId,
      namePrefix
    });
  }
  try {
    const outputTarget = resolveOutputTarget(ss, folderId, form.followupConfig);
    const rendered = renderDocCopyFromTemplate({
      dataSources,
      form,
      questions,
      record,
      templateIdMap,
      namePrefix,
      outputTarget
    });
    if (!rendered.success || !rendered.copyId || !rendered.copyName) {
      return { success: false, message: rendered.message || 'Failed to render template.' };
    }
    const pdfBlob = exportPdfBlobFromDoc(rendered.copyId);
    const copyName = rendered.copyName;
    pdfBlob.setName(`${copyName}.pdf`);
    const pdfFile = outputTarget.createFile(pdfBlob);
    trashFileById(rendered.copyId);
    return { success: true, url: pdfFile.url, fileId: pdfFile.fileId, blob: pdfBlob };
  } catch (err) {
    debugLog('followup.pdf.failed', { error: err ? err.toString() : 'unknown' });
    return { success: false, message: 'Failed to generate PDF.' };
  }
};

export const renderPdfFromTemplate = (args: {
  ss: GoogleAppsScript.Spreadsheet.Spreadsheet;
  dataSources: DataSourceService;
  form: FormConfig;
  questions: QuestionConfig[];
  record: WebFormSubmission;
  templateIdMap: TemplateIdMap;
  folderId?: string;
  namePrefix?: string;
}): { success: boolean; message?: string; url?: string; fileId?: string } => {
  const artifact = renderPdfArtifactFromTemplate(args);
  return { success: artifact.success, message: artifact.message, url: artifact.url, fileId: artifact.fileId };
};

export const renderPdfBytesFromTemplate = (args: {
  dataSources: DataSourceService;
  form: FormConfig;
  questions: QuestionConfig[];
  record: WebFormSubmission;
  templateIdMap: TemplateIdMap;
  namePrefix?: string;
}): { success: boolean; message?: string; pdfBase64?: string; mimeType?: string; fileName?: string } => {
  const { dataSources, form, questions, record, templateIdMap, namePrefix } = args;
  try {
    const outputTarget = resolveRootOutputTarget();
    const rendered = renderDocCopyFromTemplate({
      dataSources,
      form,
      questions,
      record,
      templateIdMap,
      namePrefix: `${namePrefix || form.title || 'Form'} - Preview`,
      outputTarget
    });
    if (!rendered.success || !rendered.copyId || !rendered.copyName) {
      return { success: false, message: rendered.message || 'Failed to render template.' };
    }
    const pdfBlob = exportPdfBlobFromDoc(rendered.copyId);
    const bytes = pdfBlob.getBytes();
    const pdfBase64 = Utilities.base64Encode(bytes);
    const fileName = `${rendered.copyName}.pdf`;
    trashFileById(rendered.copyId);
    return { success: true, pdfBase64, mimeType: 'application/pdf', fileName };
  } catch (err) {
    debugLog('followup.pdfBytes.failed', { error: err ? err.toString() : 'unknown' });
    return { success: false, message: 'Failed to generate PDF preview.' };
  }
};

export const renderDocPreviewFromTemplate = (args: {
  ss: GoogleAppsScript.Spreadsheet.Spreadsheet;
  dataSources: DataSourceService;
  form: FormConfig;
  questions: QuestionConfig[];
  record: WebFormSubmission;
  templateIdMap: TemplateIdMap;
  folderId?: string;
  namePrefix?: string;
}): { success: boolean; message?: string; fileId?: string; previewUrl?: string } => {
  const { ss, dataSources, form, questions, record, templateIdMap, folderId, namePrefix } = args;
  try {
    const outputTarget = resolveOutputTarget(ss, folderId, form.followupConfig);
    const rendered = renderDocCopyFromTemplate({
      dataSources,
      form,
      questions,
      record,
      templateIdMap,
      namePrefix: `${namePrefix || form.title || 'Form'} - Preview`,
      outputTarget
    });
    if (!rendered.success || !rendered.copyId) {
      return { success: false, message: rendered.message || 'Failed to render template.' };
    }
    const fileId = rendered.copyId;
    const previewUrl = `https://docs.google.com/document/d/${fileId}/preview`;
    return { success: true, fileId, previewUrl };
  } catch (err) {
    const errText = (err as any)?.message?.toString?.() || (err as any)?.toString?.() || 'Failed to render preview.';
    debugLog('followup.docPreview.failed', { error: errText });
    return { success: false, message: errText };
  }
};

export const renderHtmlFromTemplate = (args: {
  dataSources: DataSourceService;
  form: FormConfig;
  questions: QuestionConfig[];
  record: WebFormSubmission;
  templateIdMap: TemplateIdMap;
  namePrefix?: string;
}): { success: boolean; message?: string; html?: string } => {
  const outputTarget = resolveRootOutputTarget();
  const rendered = renderDocCopyFromTemplate({
    dataSources: args.dataSources,
    form: args.form,
    questions: args.questions,
    record: args.record,
    templateIdMap: args.templateIdMap,
    namePrefix: args.namePrefix,
    outputTarget
  });
  if (!rendered.success || !rendered.copyId) {
    return { success: false, message: rendered.message || 'Failed to render template.' };
  }

  try {
    const html = exportDocFileToHtml(rendered.copyId);
    trashFileById(rendered.copyId);
    return { success: true, html };
  } catch (err) {
    try {
      if (rendered.copyId) trashFileById(rendered.copyId);
    } catch (_) {
      // ignore
    }
    const errText = (err as any)?.message?.toString?.() || (err as any)?.toString?.() || 'Failed to export HTML.';
    debugLog('followup.html.failed', { error: errText });
    return { success: false, message: errText };
  }
};
