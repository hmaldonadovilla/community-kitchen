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
import { buildPlaceholderMap, collectLineItemRows } from './placeholders';
import { collectValidationWarnings } from './validation';
import { resolveLocalizedStringValue, resolveRecipients, resolveTemplateId } from './recipients';
import { resolveStatusTransitionValue } from '../../../domain/statusTransitions';

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
  const validationWarnings = collectValidationWarnings(questions, ctx.record);
  addPlaceholderVariants(placeholders, 'VALIDATION_WARNINGS', validationWarnings.join('\n'));

  const pdfArtifact = followup.pdfTemplateId ? generatePdfArtifact(form, questions, ctx.record, followup) : null;
  if (followup.pdfTemplateId && (!pdfArtifact || !pdfArtifact.success)) {
    return { success: false, message: pdfArtifact?.message || 'Failed to generate PDF.' };
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
    GmailApp.sendEmail(toRecipients.join(','), subject || 'Form submission', body || 'See attached PDF.', {
      htmlBody,
      attachments: pdfArtifact?.blob ? [pdfArtifact.blob] : undefined,
      cc: ccRecipients.length ? ccRecipients.join(',') : undefined,
      bcc: bccRecipients.length ? bccRecipients.join(',') : undefined
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


