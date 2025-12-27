import { FollowupConfig, FormConfig, QuestionConfig, TemplateIdMap, WebFormSubmission } from '../../../types';
import { DataSourceService } from '../dataSources';
import { debugLog } from '../debug';
import { renderDocCopyFromTemplate, resolveOutputFolder } from './docRenderer.copy';
import { exportDocFileToHtml } from './docRenderer.exportHtml';

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
  try {
    const folder = resolveOutputFolder(ss, folderId, form.followupConfig);
    const rendered = renderDocCopyFromTemplate({
      dataSources,
      form,
      questions,
      record,
      templateIdMap,
      namePrefix,
      copyFolder: folder
    });
    if (!rendered.success || !rendered.copy || !rendered.copyName) {
      return { success: false, message: rendered.message || 'Failed to render template.' };
    }
    const pdfBlob = rendered.copy.getAs('application/pdf');
    const copyName = rendered.copyName;
    const pdfFile = folder.createFile(pdfBlob).setName(`${copyName}.pdf`);
    rendered.copy.setTrashed(true);
    return { success: true, url: pdfFile.getUrl(), fileId: pdfFile.getId(), blob: pdfBlob };
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
    const rendered = renderDocCopyFromTemplate({
      dataSources,
      form,
      questions,
      record,
      templateIdMap,
      namePrefix: `${namePrefix || form.title || 'Form'} - Preview`,
      copyFolder: DriveApp.getRootFolder()
    });
    if (!rendered.success || !rendered.copy || !rendered.copyName) {
      return { success: false, message: rendered.message || 'Failed to render template.' };
    }
    const pdfBlob = rendered.copy.getAs('application/pdf');
    const bytes = pdfBlob.getBytes();
    const pdfBase64 = Utilities.base64Encode(bytes);
    const fileName = `${rendered.copyName}.pdf`;
    rendered.copy.setTrashed(true);
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
    const folder = resolveOutputFolder(ss, folderId, form.followupConfig);
    const rendered = renderDocCopyFromTemplate({
      dataSources,
      form,
      questions,
      record,
      templateIdMap,
      namePrefix: `${namePrefix || form.title || 'Form'} - Preview`,
      copyFolder: folder
    });
    if (!rendered.success || !rendered.copy) {
      return { success: false, message: rendered.message || 'Failed to render template.' };
    }
    const fileId = rendered.copy.getId();
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
  const rendered = renderDocCopyFromTemplate({
    dataSources: args.dataSources,
    form: args.form,
    questions: args.questions,
    record: args.record,
    templateIdMap: args.templateIdMap,
    namePrefix: args.namePrefix,
    copyFolder: DriveApp.getRootFolder()
  });
  if (!rendered.success || !rendered.copy) {
    return { success: false, message: rendered.message || 'Failed to render template.' };
  }

  try {
    const html = exportDocFileToHtml(rendered.copy);
    rendered.copy.setTrashed(true);
    return { success: true, html };
  } catch (err) {
    try {
      rendered.copy.setTrashed(true);
    } catch (_) {
      // ignore
    }
    const errText = (err as any)?.message?.toString?.() || (err as any)?.toString?.() || 'Failed to export HTML.';
    debugLog('followup.html.failed', { error: errText });
    return { success: false, message: errText };
  }
};
