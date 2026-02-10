import {
  FollowupActionResult,
  FollowupConfig,
  FormConfig,
  QuestionConfig,
  WebFormSubmission
} from '../../../types';
import { DataSourceService } from '../dataSources';
import { SubmissionService } from '../submissions';
import { RecordContext } from '../types';
import { debugLog } from '../debug';
import { addPlaceholderVariants, applyPlaceholders } from './utils';
import { addLabelPlaceholders, buildPlaceholderMap, collectLineItemRows } from './placeholders';
import { collectValidationWarnings } from './validation';
import { resolveLocalizedStringValue, resolveRecipients, resolveTemplateId } from './recipients';
import { resolveStatusTransitionValue } from '../../../domain/statusTransitions';
import { fetchDriveFileBlob, findDriveFileByNameInFolder } from '../driveApi';
import { resolveOutputTarget, resolveRecordFileLabel, trashFileById } from './docRenderer.copy';

const extractDriveFileId = (value: string): string => {
  const text = (value || '').toString().trim();
  if (!text) return '';
  const idParamMatch = text.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idParamMatch) return idParamMatch[1];
  const pathMatch = text.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (pathMatch) return pathMatch[1];
  if (/^[a-zA-Z0-9_-]{10,}$/.test(text)) return text;
  return '';
};

const resolveExpectedPdfFileName = (form: FormConfig, record: WebFormSubmission): string => {
  const namePrefix = (form.title || 'Form').toString().trim() || 'Form';
  const recordLabel = resolveRecordFileLabel(form, record);
  if (!recordLabel) return '';
  return `${namePrefix} - ${recordLabel}.pdf`;
};

const isBundledHtmlPdfTemplate = (templateId: string | undefined | null): boolean => {
  const normalized = (templateId || '').toString().trim().toLowerCase();
  if (!normalized) return false;
  return normalized.startsWith('bundle:') && normalized.endsWith('.pdf.html');
};

const shouldReuseExistingPdf = (followup: FollowupConfig, record: WebFormSubmission): boolean => {
  const templateId = resolveTemplateId(followup.pdfTemplateId, record);
  return !isBundledHtmlPdfTemplate(templateId);
};

const resolveExistingPdfFile = (
  form: FormConfig,
  followup: FollowupConfig,
  ctx: RecordContext
): { fileId: string; url?: string } | null => {
  if (!ctx.record) return null;
  const existingUrl = (ctx.record?.pdfUrl || '').toString().trim();
  const existingFileId = extractDriveFileId(existingUrl);
  if (existingFileId) return { fileId: existingFileId, url: existingUrl };
  try {
    const ss = ctx.sheet.getParent();
    const outputTarget = resolveOutputTarget(ss, followup.pdfFolderId, followup);
    const fileName = resolveExpectedPdfFileName(form, ctx.record);
    if (!fileName) return null;
    return findDriveFileByNameInFolder(outputTarget.folderId, fileName, 'followup.pdf.find');
  } catch (err) {
    debugLog('followup.pdf.findFailed', { error: err ? err.toString() : 'unknown' });
    return null;
  }
};

export const handleCreatePdfAction = (args: {
  form: FormConfig;
  questions: QuestionConfig[];
  recordId: string;
  followup: FollowupConfig;
  context: RecordContext;
  submissionService: SubmissionService;
  generatePdfArtifact: (
    form: FormConfig,
    questions: QuestionConfig[],
    record: WebFormSubmission,
    followup: FollowupConfig
  ) => { success: boolean; message?: string; url?: string; fileId?: string; blob?: GoogleAppsScript.Base.Blob };
}): FollowupActionResult => {
  const { form, questions, followup, context: ctx, submissionService, generatePdfArtifact } = args;
  if (!followup.pdfTemplateId) {
    return { success: false, message: 'PDF template ID missing in follow-up config.' };
  }
  if (!ctx || !ctx.record) {
    return { success: false, message: 'Record not found.' };
  }
  const allowReuse = shouldReuseExistingPdf(followup, ctx.record);
  const existing = resolveExistingPdfFile(form, followup, ctx);
  if (allowReuse && existing?.fileId) {
    if (ctx.columns.pdfUrl && existing.url) {
      ctx.sheet.getRange(ctx.rowIndex, ctx.columns.pdfUrl, 1, 1).setValue(existing.url);
    }
    const statusValue = resolveStatusTransitionValue(followup.statusTransitions, 'onPdf', ctx.record?.language);
    let updatedAt = statusValue
      ? submissionService.writeStatus(ctx.sheet, ctx.columns, ctx.rowIndex, statusValue, followup.statusFieldId)
      : null;
    if (!updatedAt) {
      updatedAt = submissionService.touchUpdatedAt(ctx.sheet, ctx.columns, ctx.rowIndex);
    }
    submissionService.refreshRecordCache(form.configSheet, questions, ctx);
    return {
      success: true,
      status: statusValue || ctx.record.status,
      pdfUrl: existing.url,
      fileId: existing.fileId,
      updatedAt: updatedAt ? updatedAt.toISOString() : ctx.record.updatedAt
    };
  }
  if (!allowReuse) {
    debugLog('followup.pdf.reuseSkippedForHtmlTemplate', {
      recordId: ctx.record.id || '',
      existingFileId: existing?.fileId || ''
    });
  }
  const pdfArtifact = generatePdfArtifact(form, questions, ctx.record, followup);
  if (!pdfArtifact.success) {
    return { success: false, message: pdfArtifact.message || 'Failed to generate PDF.' };
  }
  if (ctx.columns.pdfUrl && pdfArtifact.url) {
    ctx.sheet.getRange(ctx.rowIndex, ctx.columns.pdfUrl, 1, 1).setValue(pdfArtifact.url);
  }
  const statusValue = resolveStatusTransitionValue(followup.statusTransitions, 'onPdf', ctx.record?.language);
  let updatedAt = statusValue
    ? submissionService.writeStatus(ctx.sheet, ctx.columns, ctx.rowIndex, statusValue, followup.statusFieldId)
    : null;
  if (!updatedAt) {
    updatedAt = submissionService.touchUpdatedAt(ctx.sheet, ctx.columns, ctx.rowIndex);
  }
  // For bundled HTML PDF templates we intentionally regenerate to pick up template/style updates.
  // Cleanup the prior artifact to avoid accumulating stale copies with the same logical record.
  if (!allowReuse && existing?.fileId && existing.fileId !== pdfArtifact.fileId) {
    trashFileById(existing.fileId);
  }
  submissionService.refreshRecordCache(form.configSheet, questions, ctx);
  return {
    success: true,
    status: statusValue || ctx.record.status,
    pdfUrl: pdfArtifact.url,
    fileId: pdfArtifact.fileId,
    updatedAt: updatedAt ? updatedAt.toISOString() : ctx.record.updatedAt
  };
};

export const handleSendEmailAction = (args: {
  form: FormConfig;
  questions: QuestionConfig[];
  recordId: string;
  followup: FollowupConfig;
  context: RecordContext;
  submissionService: SubmissionService;
  dataSources: DataSourceService;
  generatePdfArtifact: (
    form: FormConfig,
    questions: QuestionConfig[],
    record: WebFormSubmission,
    followup: FollowupConfig
  ) => { success: boolean; message?: string; url?: string; fileId?: string; blob?: GoogleAppsScript.Base.Blob };
}): FollowupActionResult => {
  const { form, questions, followup, context: ctx, submissionService, dataSources, generatePdfArtifact } = args;
  if (!followup.emailTemplateId) {
    return { success: false, message: 'Email template ID missing in follow-up config.' };
  }
  if (!followup.emailRecipients || !followup.emailRecipients.length) {
    return { success: false, message: 'Email recipients not configured.' };
  }
  if (!ctx || !ctx.record) {
    return { success: false, message: 'Record not found.' };
  }

  const lineItemRows = collectLineItemRows(ctx.record, questions);
  const placeholders = buildPlaceholderMap({ record: ctx.record, questions, lineItemRows, dataSources });
  addLabelPlaceholders(placeholders, questions, ctx.record.language);
  const validationWarnings = collectValidationWarnings(questions, ctx.record);
  addPlaceholderVariants(placeholders, 'VALIDATION_WARNINGS', validationWarnings.join('\n'));

  let pdfArtifact: { success: boolean; message?: string; url?: string; fileId?: string; blob?: GoogleAppsScript.Base.Blob } | null = null;
  const allowReuse = shouldReuseExistingPdf(followup, ctx.record);
  if (followup.pdfTemplateId) {
    const existing = allowReuse ? resolveExistingPdfFile(form, followup, ctx) : null;
    if (existing?.fileId) {
      const blob = fetchDriveFileBlob(existing.fileId, 'followup.email.existingPdf');
      if (blob) {
        pdfArtifact = { success: true, url: existing.url, fileId: existing.fileId, blob };
        debugLog('followup.email.reusePdf', { fileId: existing.fileId });
      }
    }
    if (!pdfArtifact) {
      pdfArtifact = generatePdfArtifact(form, questions, ctx.record, followup);
    }
    if (!pdfArtifact || !pdfArtifact.success) {
      return { success: false, message: pdfArtifact?.message || 'Failed to generate PDF.' };
    }
  }
  if (ctx.columns.pdfUrl && pdfArtifact?.url) {
    ctx.sheet.getRange(ctx.rowIndex, ctx.columns.pdfUrl, 1, 1).setValue(pdfArtifact.url);
  }

  const toRecipients = resolveRecipients(dataSources, followup.emailRecipients, placeholders, ctx.record);
  if (!toRecipients.length) {
    return { success: false, message: 'Resolved email recipients are empty.' };
  }
  const ccRecipients = resolveRecipients(dataSources, followup.emailCc, placeholders, ctx.record);
  const bccRecipients = resolveRecipients(dataSources, followup.emailBcc, placeholders, ctx.record);
  const templateId = resolveTemplateId(followup.emailTemplateId, ctx.record);
  if (!templateId) {
    return { success: false, message: 'No email template matched the record values/language.' };
  }
  try {
    const templateDoc = DocumentApp.openById(templateId);
    const templateBody = templateDoc.getBody().getText();
    const body = applyPlaceholders(templateBody, placeholders);
    const htmlBody = body.replace(/\n/g, '<br/>');
    const subject =
      resolveLocalizedStringValue(followup.emailSubject, ctx.record.language) ||
      `${form.title || 'Form'} submission ${ctx.record.id}`;
    const from = followup.emailFrom ? applyPlaceholders(followup.emailFrom, placeholders).toString().trim() : '';
    const name = followup.emailFromName ? applyPlaceholders(followup.emailFromName, placeholders).toString().trim() : '';
    debugLog('followup.email.send', {
      templateId,
      toCount: toRecipients.length,
      ccCount: ccRecipients.length,
      bccCount: bccRecipients.length,
      hasAttachment: Boolean(pdfArtifact?.blob),
      from: from || undefined,
      name: name || undefined
    });
    GmailApp.sendEmail(toRecipients.join(','), subject || 'Form submission', body || 'See attached PDF.', {
      htmlBody,
      attachments: pdfArtifact?.blob ? [pdfArtifact.blob] : undefined,
      cc: ccRecipients.length ? ccRecipients.join(',') : undefined,
      bcc: bccRecipients.length ? bccRecipients.join(',') : undefined,
      from: from || undefined,
      name: name || undefined
    });
  } catch (err) {
    debugLog('followup.email.failed', { error: err ? err.toString() : 'unknown' });
    return { success: false, message: 'Failed to send follow-up email.' };
  }
  const statusValue = resolveStatusTransitionValue(followup.statusTransitions, 'onEmail', ctx.record?.language);
  let updatedAt = statusValue
    ? submissionService.writeStatus(ctx.sheet, ctx.columns, ctx.rowIndex, statusValue, followup.statusFieldId)
    : null;
  if (!updatedAt) {
    updatedAt = submissionService.touchUpdatedAt(ctx.sheet, ctx.columns, ctx.rowIndex);
  }
  submissionService.refreshRecordCache(form.configSheet, questions, ctx);
  return {
    success: true,
    status: statusValue || ctx.record.status,
    pdfUrl: pdfArtifact?.url,
    fileId: pdfArtifact?.fileId,
    updatedAt: updatedAt ? updatedAt.toISOString() : ctx.record.updatedAt
  };
};

export const handleCloseRecordAction = (args: {
  form: FormConfig;
  questions: QuestionConfig[];
  recordId: string;
  followup: FollowupConfig;
  context: RecordContext;
  submissionService: SubmissionService;
}): FollowupActionResult => {
  const { form, questions, followup, context: ctx, submissionService } = args;
  if (!ctx) {
    return { success: false, message: 'Record not found.' };
  }
  const statusValue = resolveStatusTransitionValue(followup.statusTransitions, 'onClose', ctx.record?.language, {
    includeDefaultOnClose: true
  });
  const updatedAt =
    submissionService.writeStatus(ctx.sheet, ctx.columns, ctx.rowIndex, statusValue, followup.statusFieldId) ||
    submissionService.touchUpdatedAt(ctx.sheet, ctx.columns, ctx.rowIndex);
  submissionService.refreshRecordCache(form.configSheet, questions, ctx);
  return {
    success: true,
    status: statusValue,
    updatedAt: updatedAt ? updatedAt.toISOString() : ctx.record?.updatedAt
  };
};
