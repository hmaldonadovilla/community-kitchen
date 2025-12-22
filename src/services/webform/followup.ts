import {
  EmailRecipientDataSourceConfig,
  EmailRecipientEntry,
  FollowupActionResult,
  FollowupConfig,
  FormConfig,
  LineItemGroupConfig,
  LocalizedString,
  QuestionConfig,
  TemplateIdMap,
  WebFormSubmission
} from '../../types';
import { DataSourceService } from './dataSources';
import { debugLog } from './debug';
import { SubmissionService } from './submissions';
import { RecordContext } from './types';
import { validateRules } from '../../web/rules/validation';

type SubGroupConfig = LineItemGroupConfig;

const resolveLocalizedValue = (value?: LocalizedString, fallback: string = ''): string => {
  if (!value) return fallback;
  if (typeof value === 'string') return value;
  return value.en || value.fr || value.nl || fallback;
};

const resolveSubgroupKey = (sub?: SubGroupConfig): string => {
  if (!sub) return '';
  if (sub.id) return sub.id;
  return resolveLocalizedValue(sub.label, '');
};

export class FollowupService {
  private ss: GoogleAppsScript.Spreadsheet.Spreadsheet;
  private submissionService: SubmissionService;
  private dataSources: DataSourceService;

  constructor(
    ss: GoogleAppsScript.Spreadsheet.Spreadsheet,
    submissionService: SubmissionService,
    dataSources: DataSourceService
  ) {
    this.ss = ss;
    this.submissionService = submissionService;
    this.dataSources = dataSources;
  }

  triggerFollowupAction(
    form: FormConfig,
    questions: QuestionConfig[],
    recordId: string,
    action: string
  ): FollowupActionResult {
    if (!recordId) {
      return { success: false, message: 'Record ID is required.' };
    }
    const normalizedAction = (action || '').toString().toUpperCase();
    const followup = form.followupConfig;
    if (!followup) {
      return { success: false, message: 'Follow-up actions are not configured for this form.' };
    }
    const context = this.getRecordContext(form, questions, recordId);
    if (!context || !context.record) {
      return { success: false, message: 'Record not found.' };
    }
    const validationErrors = this.validateFollowupRequirements(questions, context.record);
    if (validationErrors.length) {
      return { success: false, message: `Validation failed: ${validationErrors.join('; ')}` };
    }
    switch (normalizedAction) {
      case 'CREATE_PDF':
        return this.handleCreatePdfAction(form, questions, recordId, followup, context);
      case 'SEND_EMAIL':
        return this.handleSendEmailAction(form, questions, recordId, followup, context);
      case 'CLOSE_RECORD':
        return this.handleCloseRecordAction(form, questions, recordId, followup, context);
      default:
        return { success: false, message: `Unsupported follow-up action "${action}".` };
    }
  }

  private handleCreatePdfAction(
    form: FormConfig,
    questions: QuestionConfig[],
    recordId: string,
    followup: FollowupConfig,
    context?: RecordContext
  ): FollowupActionResult {
    if (!followup.pdfTemplateId) {
      return { success: false, message: 'PDF template ID missing in follow-up config.' };
    }
    const ctx = context || this.getRecordContext(form, questions, recordId);
    if (!ctx || !ctx.record) {
      return { success: false, message: 'Record not found.' };
    }
    const pdfArtifact = this.generatePdfArtifact(form, questions, ctx.record, followup);
    if (!pdfArtifact.success) {
      return { success: false, message: pdfArtifact.message || 'Failed to generate PDF.' };
    }
    if (ctx.columns.pdfUrl && pdfArtifact.url) {
      ctx.sheet.getRange(ctx.rowIndex, ctx.columns.pdfUrl, 1, 1).setValue(pdfArtifact.url);
    }
    const statusValue = followup.statusTransitions?.onPdf;
    let updatedAt = statusValue
      ? this.submissionService.writeStatus(ctx.sheet, ctx.columns, ctx.rowIndex, statusValue, followup.statusFieldId)
      : null;
    if (!updatedAt) {
      updatedAt = this.submissionService.touchUpdatedAt(ctx.sheet, ctx.columns, ctx.rowIndex);
    }
    this.submissionService.refreshRecordCache(form.configSheet, questions, ctx);
    return {
      success: true,
      status: statusValue || ctx.record.status,
      pdfUrl: pdfArtifact.url,
      fileId: pdfArtifact.fileId,
      updatedAt: updatedAt ? updatedAt.toISOString() : ctx.record.updatedAt
    };
  }

  private handleSendEmailAction(
    form: FormConfig,
    questions: QuestionConfig[],
    recordId: string,
    followup: FollowupConfig,
    context?: RecordContext
  ): FollowupActionResult {
    if (!followup.emailTemplateId) {
      return { success: false, message: 'Email template ID missing in follow-up config.' };
    }
    if (!followup.emailRecipients || !followup.emailRecipients.length) {
      return { success: false, message: 'Email recipients not configured.' };
    }
    const ctx = context || this.getRecordContext(form, questions, recordId);
    if (!ctx || !ctx.record) {
      return { success: false, message: 'Record not found.' };
    }
    const lineItemRows = this.collectLineItemRows(ctx.record, questions);
    const placeholders = this.buildPlaceholderMap(ctx.record, questions, lineItemRows);
    const pdfArtifact = this.generatePdfArtifact(form, questions, ctx.record, followup);
    if (!pdfArtifact.success) {
      return { success: false, message: pdfArtifact.message || 'Failed to generate PDF.' };
    }
    if (ctx.columns.pdfUrl && pdfArtifact.url) {
      ctx.sheet.getRange(ctx.rowIndex, ctx.columns.pdfUrl, 1, 1).setValue(pdfArtifact.url);
    }
    const toRecipients = this.resolveRecipients(followup.emailRecipients, placeholders, ctx.record);
    if (!toRecipients.length) {
      return { success: false, message: 'Resolved email recipients are empty.' };
    }
    const ccRecipients = this.resolveRecipients(followup.emailCc, placeholders, ctx.record);
    const bccRecipients = this.resolveRecipients(followup.emailBcc, placeholders, ctx.record);
    const templateId = this.resolveTemplateId(followup.emailTemplateId, ctx.record.language);
    if (!templateId) {
      return { success: false, message: 'No email template matched the submission language.' };
    }
    try {
      const templateDoc = DocumentApp.openById(templateId);
      const templateBody = templateDoc.getBody().getText();
      const body = this.applyPlaceholders(templateBody, placeholders);
      const htmlBody = body.replace(/\n/g, '<br/>');
      const subject =
        this.resolveLocalizedStringValue(followup.emailSubject, ctx.record.language) ||
        `${form.title || 'Form'} submission ${ctx.record.id}`;
      GmailApp.sendEmail(toRecipients.join(','), subject || 'Form submission', body || 'See attached PDF.', {
        htmlBody,
        attachments: pdfArtifact.blob ? [pdfArtifact.blob] : undefined,
        cc: ccRecipients.length ? ccRecipients.join(',') : undefined,
        bcc: bccRecipients.length ? bccRecipients.join(',') : undefined
      });
    } catch (err) {
      debugLog('followup.email.failed', { error: err ? err.toString() : 'unknown' });
      return { success: false, message: 'Failed to send follow-up email.' };
    }
    const statusValue = followup.statusTransitions?.onEmail;
    let updatedAt = statusValue
      ? this.submissionService.writeStatus(ctx.sheet, ctx.columns, ctx.rowIndex, statusValue, followup.statusFieldId)
      : null;
    if (!updatedAt) {
      updatedAt = this.submissionService.touchUpdatedAt(ctx.sheet, ctx.columns, ctx.rowIndex);
    }
    this.submissionService.refreshRecordCache(form.configSheet, questions, ctx);
    return {
      success: true,
      status: statusValue || ctx.record.status,
      pdfUrl: pdfArtifact.url,
      fileId: pdfArtifact.fileId,
      updatedAt: updatedAt ? updatedAt.toISOString() : ctx.record.updatedAt
    };
  }

  private handleCloseRecordAction(
    form: FormConfig,
    questions: QuestionConfig[],
    recordId: string,
    followup: FollowupConfig,
    context?: RecordContext
  ): FollowupActionResult {
    const ctx = context || this.getRecordContext(form, questions, recordId);
    if (!ctx) {
      return { success: false, message: 'Record not found.' };
    }
    const statusValue = followup.statusTransitions?.onClose || 'Closed';
    const updatedAt = this.submissionService.writeStatus(ctx.sheet, ctx.columns, ctx.rowIndex, statusValue, followup.statusFieldId)
      || this.submissionService.touchUpdatedAt(ctx.sheet, ctx.columns, ctx.rowIndex);
    this.submissionService.refreshRecordCache(form.configSheet, questions, ctx);
    return {
      success: true,
      status: statusValue,
      updatedAt: updatedAt ? updatedAt.toISOString() : ctx.record?.updatedAt
    };
  }

  private validateFollowupRequirements(questions: QuestionConfig[], record: WebFormSubmission): string[] {
    const values = { ...(record.values || {}) };
    const lineItems: Record<string, { id: string; values: Record<string, any> }[]> = {};
    const buildSubgroupKey = (groupId: string, rowId: string, subId: string) => `${groupId}::${rowId}::${subId}`;

    questions
      .filter(q => q.type === 'LINE_ITEM_GROUP')
      .forEach(q => {
        const rows = Array.isArray(values[q.id]) ? values[q.id] : [];
        const normalized = rows.map((row: any, idx: number) => ({
          id: `${q.id}_${idx}`,
          values: row || {}
        }));
        lineItems[q.id] = normalized;
        if (q.lineItemConfig?.subGroups?.length) {
          normalized.forEach((row: { id: string; values: Record<string, any> }, rowIdx: number) => {
            q.lineItemConfig?.subGroups?.forEach(sub => {
              const subId = resolveSubgroupKey(sub);
              if (!subId) return;
              const children = Array.isArray(row.values[subId]) ? row.values[subId] : [];
              const childKey = buildSubgroupKey(q.id, row.id, subId);
              lineItems[childKey] = children.map((c: any, cIdx: number) => ({
                id: `${row.id}_${subId}_${cIdx}`,
                values: c || {}
              }));
            });
          });
        }
      });

    const errors: string[] = [];
    const lang = (record.language as any) || 'EN';
    const ctxBase = {
      language: lang,
      phase: 'followup' as const,
      getValue: (fid: string) => values[fid],
      getLineValue: (_rowId: string, fid: string) => values[fid]
    };

    questions.forEach(q => {
      if (q.validationRules?.length) {
        const errs = validateRules(q.validationRules, { ...ctxBase, isHidden: () => false });
        errs.forEach(e => errors.push(e.message));
      }
      if (q.type === 'LINE_ITEM_GROUP' && q.lineItemConfig?.fields) {
        const rows = lineItems[q.id] || [];
        rows.forEach((row, idx) => {
          q.lineItemConfig?.fields.forEach(field => {
            if (field.validationRules?.length) {
              const fieldErrs = validateRules(field.validationRules, {
                language: lang,
                phase: 'followup',
                getValue: (fid: string) => (row.values.hasOwnProperty(fid) ? row.values[fid] : values[fid]),
                getLineValue: () => undefined,
                isHidden: () => false
              });
              fieldErrs.forEach(e => errors.push(e.message));
            }
          });

          if (q.lineItemConfig?.subGroups?.length) {
            q.lineItemConfig.subGroups.forEach(sub => {
              const subId = resolveSubgroupKey(sub);
              if (!subId) return;
              const subKey = buildSubgroupKey(q.id, row.id, subId);
              const childRows = lineItems[subKey] || [];
              childRows.forEach((child, cIdx) => {
                (sub.fields || []).forEach(field => {
                  if (field.validationRules?.length) {
                    const childErrs = validateRules(field.validationRules, {
                      language: lang,
                      phase: 'followup',
                      getValue: (fid: string) => (child.values.hasOwnProperty(fid) ? child.values[fid] : values[fid]),
                      getLineValue: () => undefined,
                      isHidden: () => false
                    });
                    childErrs.forEach(e => errors.push(e.message));
                  }
                });
              });
            });
          }
        });
      }
    });

    return errors;
  }

  private getRecordContext(
    form: FormConfig,
    questions: QuestionConfig[],
    recordId: string
  ): RecordContext | null {
    return this.submissionService.getRecordContext(form, questions, recordId);
  }

  private generatePdfArtifact(
    form: FormConfig,
    questions: QuestionConfig[],
    record: WebFormSubmission,
    followup: FollowupConfig
  ): { success: boolean; message?: string; url?: string; fileId?: string; blob?: GoogleAppsScript.Base.Blob } {
    if (!followup.pdfTemplateId) {
      return { success: false, message: 'PDF template ID missing.' };
    }
    return this.renderPdfArtifactFromTemplate({
      form,
      questions,
      record,
      templateIdMap: followup.pdfTemplateId,
      folderId: followup.pdfFolderId,
      namePrefix: form.title || 'Form'
    });
  }

  /**
   * Render a Google Doc template (with placeholders + line-item table directives) into a PDF.
   * Used by follow-up actions and by the web app's report BUTTON field previews.
   */
  public renderPdfFromTemplate(args: {
    form: FormConfig;
    questions: QuestionConfig[];
    record: WebFormSubmission;
    templateIdMap: TemplateIdMap;
    folderId?: string;
    namePrefix?: string;
  }): { success: boolean; message?: string; url?: string; fileId?: string } {
    const artifact = this.renderPdfArtifactFromTemplate(args);
    return { success: artifact.success, message: artifact.message, url: artifact.url, fileId: artifact.fileId };
  }

  /**
   * Render a Google Doc template (with placeholders + line-item table directives) into an in-memory PDF (base64).
   * This avoids embedding Drive/Docs preview pages (which can be blocked by CSP) and does not persist a PDF file.
   *
   * NOTE: This still creates a temporary Doc copy to safely apply placeholders/directives, then trashes it.
   */
  public renderPdfBytesFromTemplate(args: {
    form: FormConfig;
    questions: QuestionConfig[];
    record: WebFormSubmission;
    templateIdMap: TemplateIdMap;
    namePrefix?: string;
  }): { success: boolean; message?: string; pdfBase64?: string; mimeType?: string; fileName?: string } {
    const { form, questions, record, templateIdMap, namePrefix } = args;
    try {
      const rendered = this.renderDocCopyFromTemplate({
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
  }

  /**
   * Render a Google Doc template (with placeholders + line-item table directives) into a temporary Doc copy
   * and return a preview URL for embedding in the web app.
   *
   * Why this exists:
   * - Drive export does NOT support converting Google Docs to HTML/ZIP via API.
   * - Using the Google Docs/Drive preview iframe gives perfect fidelity with the template formatting.
   *
   * IMPORTANT: This method does create a temporary Doc file. Callers should clean it up when done.
   */
  public renderDocPreviewFromTemplate(args: {
    form: FormConfig;
    questions: QuestionConfig[];
    record: WebFormSubmission;
    templateIdMap: TemplateIdMap;
    folderId?: string;
    namePrefix?: string;
  }): { success: boolean; message?: string; fileId?: string; previewUrl?: string } {
    const { form, questions, record, templateIdMap, folderId, namePrefix } = args;
    try {
      const folder = this.resolveOutputFolder(folderId, form.followupConfig);
      const rendered = this.renderDocCopyFromTemplate({
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
      // Use Google Docs' preview URL for iframe embedding.
      // Drive preview pages may set CSP frame-ancestors restrictions that block embedding from Apps Script web apps.
      const previewUrl = `https://docs.google.com/document/d/${fileId}/preview`;
      return { success: true, fileId, previewUrl };
    } catch (err) {
      const errText = (err as any)?.message?.toString?.() || (err as any)?.toString?.() || 'Failed to render preview.';
      debugLog('followup.docPreview.failed', { error: errText });
      return { success: false, message: errText };
    }
  }

  /**
   * Render a Google Doc template (with placeholders + line-item table directives) into a self-contained HTML string.
   *
   * Notes:
   * - This does NOT create any Drive artifacts (no PDF files).
   * - Internally it still makes a temporary Doc copy in Drive (required to safely mutate the template),
   *   exports it to HTML, inlines any zipped assets (e.g., images), and then trashes the temporary copy.
   */
  public renderHtmlFromTemplate(args: {
    form: FormConfig;
    questions: QuestionConfig[];
    record: WebFormSubmission;
    templateIdMap: TemplateIdMap;
    namePrefix?: string;
  }): { success: boolean; message?: string; html?: string } {
    const rendered = this.renderDocCopyFromTemplate({
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
      const html = this.exportDocFileToHtml(rendered.copy);
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
  }

  private renderPdfArtifactFromTemplate(args: {
    form: FormConfig;
    questions: QuestionConfig[];
    record: WebFormSubmission;
    templateIdMap: TemplateIdMap;
    folderId?: string;
    namePrefix?: string;
  }): { success: boolean; message?: string; url?: string; fileId?: string; blob?: GoogleAppsScript.Base.Blob } {
    const { form, questions, record, templateIdMap, folderId, namePrefix } = args;
    try {
      const folder = this.resolveOutputFolder(folderId, form.followupConfig);
      const rendered = this.renderDocCopyFromTemplate({
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
  }

  private renderDocCopyFromTemplate(args: {
    form: FormConfig;
    questions: QuestionConfig[];
    record: WebFormSubmission;
    templateIdMap: TemplateIdMap;
    namePrefix?: string;
    copyFolder: GoogleAppsScript.Drive.Folder;
  }): { success: boolean; message?: string; copy?: GoogleAppsScript.Drive.File; copyName?: string } {
    const { form, questions, record, templateIdMap, namePrefix, copyFolder } = args;
    const templateId = this.resolveTemplateId(templateIdMap, record.language);
    if (!templateId) {
      return { success: false, message: 'No template matched the submission language.' };
    }
    try {
      const templateFile = DriveApp.getFileById(templateId);
      const copyName = `${namePrefix || form.title || 'Form'} - ${record.id || this.generateUuid()}`;
      const copy = templateFile.makeCopy(copyName, copyFolder);
      const doc = DocumentApp.openById(copy.getId());
      const lineItemRows = this.collectLineItemRows(record, questions);
      const placeholders = this.buildPlaceholderMap(record, questions, lineItemRows);
      this.addConsolidatedPlaceholders(placeholders, questions, lineItemRows);
      this.renderLineItemTables(doc, questions, lineItemRows);
      const body = doc.getBody();
      const header = doc.getHeader();
      const footer = doc.getFooter();
      const targets: any[] = [body];
      if (header) targets.push(header as any);
      if (footer) targets.push(footer as any);

      // Replace placeholders across the full document, including header/footer (common for distributor/address blocks).
      Object.entries(placeholders).forEach(([token, value]) => {
        const pattern = this.escapeRegExp(token);
        targets.forEach(t => {
          try {
            if (t && typeof t.replaceText === 'function') {
              t.replaceText(pattern, value ?? '');
            } else if (t && typeof t.editAsText === 'function') {
              t.editAsText().replaceText(pattern, value ?? '');
            }
          } catch (_) {
            // ignore best-effort replacement errors in non-text containers
          }
        });
      });
      doc.saveAndClose();
      return { success: true, copy, copyName };
    } catch (err) {
      debugLog('followup.renderDocCopy.failed', { error: err ? err.toString() : 'unknown' });
      return { success: false, message: 'Failed to render template.' };
    }
  }

  private exportDocFileToHtml(file: GoogleAppsScript.Drive.File): string {
    // Prefer Drive export API (DriveApp.getAs('text/html') is not reliably supported for Google Docs).
    const fileId = file.getId();
    try {
      // Google Docs "web page" export is delivered as a ZIP containing index.html + assets.
      // Drive does NOT support converting Docs directly to text/html.
      const res = this.fetchDriveExport(fileId, 'application/zip');
      const blob = res.getBlob();
      const contentType = (blob.getContentType() || '').toString().toLowerCase();
      if (contentType.includes('zip')) {
        return this.exportHtmlZipToSelfContainedHtml(blob);
      }
      const html = (res.getContentText ? res.getContentText() : '') || blob.getDataAsString();
      return this.stripUnsafeHtml(html);
    } catch (err) {
      // Fallback attempt (may still work for some deployments/templates).
      try {
        const blob = file.getAs('application/zip');
        const contentType = (blob.getContentType() || '').toString().toLowerCase();
        if (contentType.includes('zip')) {
          return this.exportHtmlZipToSelfContainedHtml(blob);
        }
        return this.stripUnsafeHtml(blob.getDataAsString());
      } catch (err2) {
        const errText =
          (err2 as any)?.message?.toString?.() ||
          (err2 as any)?.toString?.() ||
          (err as any)?.message?.toString?.() ||
          (err as any)?.toString?.() ||
          'Failed to export HTML.';
        throw new Error(errText);
      }
    }
  }

  private fetchDriveExport(fileId: string, mimeType: string): GoogleAppsScript.URL_Fetch.HTTPResponse {
    const url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=${encodeURIComponent(
      mimeType
    )}`;
    const res = UrlFetchApp.fetch(url, {
      method: 'get',
      muteHttpExceptions: true,
      headers: {
        Authorization: `Bearer ${ScriptApp.getOAuthToken()}`
      }
    });
    const code = res.getResponseCode();
    if (code < 200 || code >= 300) {
      const body = (res.getContentText ? res.getContentText() : '').toString();
      const snippet = body.length > 600 ? body.slice(0, 600) + '…' : body;
      throw new Error(`Drive export failed (${code}). ${snippet || ''}`.trim());
    }
    return res;
  }

  private exportHtmlZipToSelfContainedHtml(zipBlob: GoogleAppsScript.Base.Blob): string {
    const parts = Utilities.unzip(zipBlob);
    const htmlBlob =
      parts.find(p => (p.getName() || '').toString().toLowerCase().endsWith('.html')) ||
      parts.find(p => (p.getContentType() || '').toString().toLowerCase().includes('html')) ||
      parts[0];
    if (!htmlBlob) return '';
    let html = htmlBlob.getDataAsString();
    const assetBlobs = parts.filter(p => p !== htmlBlob);
    if (assetBlobs.length) {
      html = this.inlineZipAssetsAsDataUris(html, assetBlobs);
    }
    return this.stripUnsafeHtml(html);
  }

  private inlineZipAssetsAsDataUris(html: string, assets: GoogleAppsScript.Base.Blob[]): string {
    let out = html || '';
    const mapping: Record<string, string> = {};
    assets.forEach(b => {
      const nameRaw = (b.getName() || '').toString();
      const name = nameRaw.trim();
      if (!name) return;
      const mime = (b.getContentType() || 'application/octet-stream').toString();
      const b64 = Utilities.base64Encode(b.getBytes());
      const dataUri = `data:${mime};base64,${b64}`;
      mapping[name] = dataUri;
      const base = name.split('/').pop() || name.split('\\').pop() || name;
      mapping[base] = dataUri;
    });

    Object.entries(mapping).forEach(([assetName, dataUri]) => {
      if (!assetName) return;
      const token = this.escapeRegExp(assetName);
      // Replace common relative path references (src/href) with data URIs.
      out = out.replace(new RegExp(`(["'])\\.?\\/?${token}\\1`, 'g'), `$1${dataUri}$1`);
      out = out.replace(new RegExp(`(["'])images\\/${token}\\1`, 'g'), `$1${dataUri}$1`);
    });
    return out;
  }

  private stripUnsafeHtml(html: string): string {
    const raw = (html || '').toString();
    if (!raw) return '';
    // Defensive: Docs export should already be safe, but never allow script tags in the embedded preview.
    return raw.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');
  }

  private resolveOutputFolder(folderId?: string, followup?: FollowupConfig): GoogleAppsScript.Drive.Folder {
    if (folderId) {
      try {
        return DriveApp.getFolderById(folderId);
      } catch (_) {
        // fall through to follow-up/default folder
      }
    }
    return this.resolveFollowupFolder(followup || {});
  }

  private resolveFollowupFolder(followup: FollowupConfig): GoogleAppsScript.Drive.Folder {
    if (followup.pdfFolderId) {
      try {
        return DriveApp.getFolderById(followup.pdfFolderId);
      } catch (_) {
        // fall through to default
      }
    }
    try {
      const file = DriveApp.getFileById(this.ss.getId());
      const parents = file.getParents();
      if (parents && parents.hasNext()) {
        return parents.next();
      }
    } catch (_) {
      // ignore
    }
    return DriveApp.getRootFolder();
  }

  private buildPlaceholderMap(
    record: WebFormSubmission,
    questions: QuestionConfig[],
    lineItemRows: Record<string, any[]>
  ): Record<string, string> {
    const map: Record<string, string> = {};
    this.addPlaceholderVariants(map, 'RECORD_ID', record.id || '');
    this.addPlaceholderVariants(map, 'FORM_KEY', record.formKey || '');
    this.addPlaceholderVariants(map, 'CREATED_AT', record.createdAt || '');
    this.addPlaceholderVariants(map, 'UPDATED_AT', record.updatedAt || '');
    this.addPlaceholderVariants(map, 'STATUS', record.status || '');
    this.addPlaceholderVariants(map, 'PDF_URL', record.pdfUrl || '');
    this.addPlaceholderVariants(map, 'LANGUAGE', record.language || '');
    questions.forEach(q => {
      if (q.type === 'BUTTON') return;
      const value = record.values ? record.values[q.id] : '';
      this.addPlaceholderVariants(map, q.id, value, q.type);
      const labelToken = this.slugifyPlaceholder(q.qEn || q.id);
      this.addPlaceholderVariants(map, labelToken, value, q.type);
      if (q.type === 'LINE_ITEM_GROUP') {
        const rows = lineItemRows[q.id] || [];
        (q.lineItemConfig?.fields || []).forEach(field => {
          const values = rows
            .map(row => row[field.id])
            .filter(val => val !== undefined && val !== null && val !== '')
            .map(val => this.formatTemplateValue(val, (field as any).type));
          if (!values.length) return;
          const joined = values.join('\n');
          this.addPlaceholderVariants(map, `${q.id}.${field.id}`, joined);
          const fieldSlug = this.slugifyPlaceholder(field.labelEn || field.id);
          this.addPlaceholderVariants(map, `${q.id}.${fieldSlug}`, joined);
        });

        (q.lineItemConfig?.subGroups || []).forEach(sub => {
          const subKey =
            sub.id ||
            (typeof sub.label === 'string' ? sub.label : sub.label?.en || sub.label?.fr || sub.label?.nl) ||
            '';
          if (!subKey) return;
          rows.forEach(row => {
            const subRows = Array.isArray((row || {})[subKey]) ? (row as any)[subKey] : [];
            subRows.forEach((subRow: any) => {
              (sub.fields || []).forEach(field => {
                const raw = subRow?.[field.id];
                if (raw === undefined || raw === null || raw === '') return;
                this.addPlaceholderVariants(map, `${q.id}.${subKey}.${field.id}`, raw, (field as any).type);
                const slug = this.slugifyPlaceholder(field.labelEn || field.id);
                this.addPlaceholderVariants(map, `${q.id}.${subKey}.${slug}`, raw, (field as any).type);
              });
            });
          });
        });
      } else if (q.dataSource && typeof value === 'string' && value) {
        const dsDetails = this.dataSources.lookupDataSourceDetails(q, value, record.language);
        if (dsDetails) {
          Object.entries(dsDetails).forEach(([key, val]) => {
            this.addPlaceholderVariants(map, `${q.id}.${key}`, val);
          });
        }
      }
    });

    // Fallback: include any raw record.values entries not already populated (helps when a header/id mismatch prevented mapping)
    Object.entries(record.values || {}).forEach(([key, rawVal]) => {
      const formatted = this.formatTemplateValue(rawVal);
      const tokens = this.buildPlaceholderKeys(key);
      tokens.forEach(t => {
        const ph = `{{${t}}}`;
        if (map[ph] === undefined || map[ph] === '') {
          map[ph] = formatted;
        }
      });
    });
    return map;
  }

  private collectLineItemRows(
    record: WebFormSubmission,
    questions: QuestionConfig[]
  ): Record<string, any[]> {
    const map: Record<string, any[]> = {};
    questions.forEach(q => {
      if (q.type !== 'LINE_ITEM_GROUP') return;
      const value = record.values ? record.values[q.id] : undefined;
      if (Array.isArray(value)) {
        const normalized = value.map(row => (row && typeof row === 'object' ? row : {}));
        map[q.id] = normalized;
        (q.lineItemConfig?.subGroups || []).forEach(sub => {
          const subKey = resolveSubgroupKey(sub as SubGroupConfig);
          if (!subKey) return;
          const collected: any[] = [];
          normalized.forEach(parentRow => {
            const children = Array.isArray((parentRow as any)[subKey]) ? (parentRow as any)[subKey] : [];
            children.forEach((child: any) => {
              collected.push({
                ...(child || {}),
                __parent: parentRow
              });
            });
          });
          map[`${q.id}.${subKey}`] = collected;
        });
      }
    });
    return map;
  }

  private addConsolidatedPlaceholders(
    placeholders: Record<string, string>,
    questions: QuestionConfig[],
    lineItemRows: Record<string, any[]>
  ): void {
    questions.forEach(q => {
      if (q.type !== 'LINE_ITEM_GROUP') return;
      const rows = lineItemRows[q.id];
      if (!rows || !rows.length) return;
      (q.lineItemConfig?.fields || []).forEach(field => {
        const unique = Array.from(
          new Set(
            rows
              .map(row => row[field.id])
              .filter(val => val !== undefined && val !== null && val !== '')
                .map(val => this.formatTemplateValue(val, (field as any).type))
          )
        );
        if (!unique.length) return;
        const text = unique.join(', ');
        placeholders[`{{CONSOLIDATED(${q.id}.${field.id})}}`] = text;
        const slug = this.slugifyPlaceholder(field.labelEn || field.id);
        placeholders[`{{CONSOLIDATED(${q.id}.${slug})}}`] = text;
      });

      // nested sub groups
      (q.lineItemConfig?.subGroups || []).forEach(sub => {
        const subKey = resolveSubgroupKey(sub as SubGroupConfig);
        if (!subKey) return;
        const collected: Record<string, Set<string>> = {};
        rows.forEach(row => {
          const subRows = Array.isArray((row as any)[subKey]) ? (row as any)[subKey] : [];
          subRows.forEach((subRow: any) => {
            (sub.fields || []).forEach(field => {
              const raw = subRow?.[field.id];
              if (raw === undefined || raw === null || raw === '') return;
              const text = this.formatTemplateValue(raw, (field as any).type);
              if (!collected[field.id]) collected[field.id] = new Set<string>();
              collected[field.id].add(text);
              const slug = this.slugifyPlaceholder(field.labelEn || field.id);
              if (!collected[slug]) collected[slug] = new Set<string>();
              collected[slug].add(text);
            });
          });
        });
        Object.entries(collected).forEach(([fieldId, set]) => {
          const text = Array.from(set).join(', ');
          placeholders[`{{CONSOLIDATED(${q.id}.${subKey}.${fieldId})}}`] = text;
          const subSlug = this.slugifyPlaceholder(subKey);
          placeholders[`{{CONSOLIDATED(${q.id}.${subSlug}.${fieldId})}}`] = text;
        });
      });
    });
  }

  private renderLineItemTables(
    doc: GoogleAppsScript.Document.Document,
    questions: QuestionConfig[],
    lineItemRows: Record<string, any[]>
  ): void {
    const body = doc.getBody();
    if (!body) return;
    const groupLookup: Record<string, QuestionConfig> = {};
    questions
      .filter(q => q.type === 'LINE_ITEM_GROUP')
      .forEach(q => {
        groupLookup[q.id.toUpperCase()] = q;
      });

    let childIndex = 0;
    while (childIndex < body.getNumChildren()) {
      const element = body.getChild(childIndex);
      if (!element || element.getType() !== DocumentApp.ElementType.TABLE) {
        childIndex++;
        continue;
      }
      const table = element.asTable();
      const directive = this.extractTableRepeatDirective(table);
      if (directive) {
        const inserted =
          directive.kind === 'ROW_TABLE'
            ? this.renderRowLineItemTables(body, childIndex, table, directive, groupLookup, lineItemRows)
            : this.renderGroupedLineItemTables(body, childIndex, table, directive, groupLookup, lineItemRows);
        childIndex += inserted;
        continue;
      }

      // By default, tables containing subgroup placeholders are rendered per parent row.
      // However, if a CONSOLIDATED_TABLE directive is present, we treat it as a single consolidated table
      // (handled by renderTableRows) rather than inserting a table per parent row.
      const consolidatedDirective = this.extractConsolidatedTableDirective(table);
      const subDirective = consolidatedDirective ? null : this.extractSubGroupDirective(table);
      if (subDirective) {
        const inserted = this.renderSubGroupTables(body, childIndex, table, subDirective, groupLookup, lineItemRows);
        childIndex += inserted;
        continue;
      }
      this.renderTableRows(table, groupLookup, lineItemRows);
      childIndex++;
    }
  }

  private renderGroupedLineItemTables(
    body: GoogleAppsScript.Document.Body,
    childIndex: number,
    templateTable: GoogleAppsScript.Document.Table,
    directive: { kind: 'GROUP_TABLE' | 'ROW_TABLE'; groupId: string; fieldId: string },
    groupLookup: Record<string, QuestionConfig>,
    lineItemRows: Record<string, any[]>
  ): number {
    const group = groupLookup[directive.groupId];
    if (!group) {
      body.removeChild(templateTable);
      return 0;
    }
    const rows = lineItemRows[group.id] || [];
    const groupedValues = this.collectGroupFieldValues(rows, directive.fieldId);
    const preservedTemplate = templateTable.copy();
    body.removeChild(templateTable);
    if (!groupedValues.length) {
      return 0;
    }
    groupedValues.forEach((groupValue, idx) => {
      const newTable = body.insertTable(childIndex + idx, preservedTemplate.copy());
      this.replaceTableRepeatDirectivePlaceholders(newTable, directive, groupValue, 'GROUP_TABLE');
      const filteredRows = rows.filter(row => {
        const raw = row?.[directive.fieldId] ?? '';
        return this.normalizeText(raw) === this.normalizeText(groupValue);
      });
      this.renderTableRows(
        newTable,
        groupLookup,
        lineItemRows,
        { groupId: group.id, rows: filteredRows }
      );
    });
    return groupedValues.length;
  }

  private renderRowLineItemTables(
    body: GoogleAppsScript.Document.Body,
    childIndex: number,
    templateTable: GoogleAppsScript.Document.Table,
    directive: { kind: 'GROUP_TABLE' | 'ROW_TABLE'; groupId: string; fieldId: string },
    groupLookup: Record<string, QuestionConfig>,
    lineItemRows: Record<string, any[]>
  ): number {
    const group = groupLookup[directive.groupId];
    if (!group) {
      body.removeChild(templateTable);
      return 0;
    }
    const rows = lineItemRows[group.id] || [];
    const orderBy = this.extractOrderByDirective(templateTable);
    const preservedTemplate = templateTable.copy();
    body.removeChild(templateTable);
    if (!rows.length) {
      return 0;
    }
    const orderedRows =
      orderBy && orderBy.keys.length ? this.applyOrderBy(rows, orderBy, group, { subConfig: undefined, subToken: undefined }) : rows;
    orderedRows.forEach((rowData, idx) => {
      const newTable = body.insertTable(childIndex + idx, preservedTemplate.copy());
      const titleFieldCfg = (group.lineItemConfig?.fields || []).find(
        f => ((f as any)?.id || '').toString().toUpperCase() === (directive.fieldId || '').toString().toUpperCase()
      ) as any;
      const title = this.formatTemplateValue(rowData?.[directive.fieldId] ?? '', titleFieldCfg?.type);
      this.replaceTableRepeatDirectivePlaceholders(newTable, directive, title, 'ROW_TABLE');
      // Render this table for exactly one parent row (so the key/value rows don't duplicate when titles repeat).
      this.renderTableRows(newTable, groupLookup, lineItemRows, { groupId: group.id, rows: [rowData] });
    });
    return orderedRows.length;
  }

  private collectGroupFieldValues(rows: any[], fieldId: string): string[] {
    if (!rows || !rows.length) return [];
    const seen = new Set<string>();
    const order: string[] = [];
    rows.forEach(row => {
      const raw = row?.[fieldId];
      const normalized = this.normalizeText(raw);
      if (!normalized || seen.has(normalized)) return;
      seen.add(normalized);
      order.push(raw ?? '');
    });
    return order;
  }

  private replaceTableRepeatDirectivePlaceholders(
    table: GoogleAppsScript.Document.Table,
    directive: { groupId: string; fieldId: string },
    replacementValue: string,
    directiveType: 'GROUP_TABLE' | 'ROW_TABLE'
  ): void {
    // IMPORTANT: replaceText() uses regex. We must escape literal "(" / ")" / "." in the directive token.
    const pattern = `(?i){{${directiveType}\\(${directive.groupId}\\.${directive.fieldId}\\)}}`;
    for (let r = 0; r < table.getNumRows(); r++) {
      const tableRow = table.getRow(r);
      for (let c = 0; c < tableRow.getNumCells(); c++) {
        tableRow.getCell(c).replaceText(pattern, replacementValue || '');
      }
    }
  }

  private normalizeText(value: any): string {
    if (value === undefined || value === null) return '';
    return value.toString().trim();
  }

  private extractTableRepeatDirective(
    table: GoogleAppsScript.Document.Table
  ): { kind: 'GROUP_TABLE' | 'ROW_TABLE'; groupId: string; fieldId: string } | null {
    const text = table.getText && table.getText();
    if (!text) return null;
    const match = text.match(/{{(GROUP_TABLE|ROW_TABLE)\(([A-Z0-9_]+)\.([A-Z0-9_]+)\)}}/i);
    if (!match) return null;
    return {
      kind: (match[1] || '').toUpperCase() as 'GROUP_TABLE' | 'ROW_TABLE',
      groupId: match[2].toUpperCase(),
      fieldId: match[3].toUpperCase()
    };
  }

  private extractConsolidatedTableDirective(
    table: GoogleAppsScript.Document.Table
  ): { groupId: string; subGroupId: string } | null {
    const text = table.getText && table.getText();
    if (!text) return null;
    const match = text.match(/{{CONSOLIDATED_TABLE\(([A-Z0-9_]+)\.([A-Z0-9_]+)\)}}/i);
    if (!match) return null;
    return {
      groupId: match[1].toUpperCase(),
      subGroupId: match[2].toUpperCase()
    };
  }

  private extractOrderByDirective(
    table: GoogleAppsScript.Document.Table
  ): { keys: Array<{ key: string; direction: 'asc' | 'desc' }> } | null {
    const text = table.getText && table.getText();
    if (!text) return null;
    const match = text.match(/{{ORDER_BY\(([^)]*)\)}}/i);
    if (!match) return null;
    const raw = (match[1] || '').toString();
    const keys = this.parseOrderByKeys(raw);
    return keys.length ? { keys } : null;
  }

  private parseOrderByKeys(raw: string): Array<{ key: string; direction: 'asc' | 'desc' }> {
    const clause = (raw || '').toString().trim();
    if (!clause) return [];
    const out: Array<{ key: string; direction: 'asc' | 'desc' }> = [];
    clause
      .split(',')
      .map(part => (part || '').toString().trim())
      .filter(Boolean)
      .forEach(part => {
        let token = part.trim();
        let direction: 'asc' | 'desc' = 'asc';

        // Prefix "-" means DESC
        if (token.startsWith('-')) {
          direction = 'desc';
          token = token.slice(1).trim();
        }

        // Suffix "ASC"/"DESC"
        const suffix = token.match(/\s+(ASC|DESC)$/i);
        if (suffix) {
          direction = suffix[1].toString().toLowerCase() === 'desc' ? 'desc' : 'asc';
          token = token.slice(0, token.length - suffix[0].length).trim();
        }

        // Inline delimiter "FIELD:ASC" / "FIELD:DESC"
        const colon = token.match(/^(.*):\s*(ASC|DESC)$/i);
        if (colon) {
          direction = colon[2].toString().toLowerCase() === 'desc' ? 'desc' : 'asc';
          token = (colon[1] || '').toString().trim();
        }

        const normalized = token.toUpperCase().replace(/\s+/g, '');
        // Allow FIELD, GROUP.FIELD, or GROUP.SUBGROUP.FIELD
        if (!/^[A-Z0-9_]+(\.[A-Z0-9_]+){0,2}$/.test(normalized)) return;
        out.push({ key: normalized, direction });
      });
    return out;
  }

  private stripOrderByDirectivePlaceholders(table: GoogleAppsScript.Document.Table): void {
    if (!table) return;
    // IMPORTANT: replaceText() uses regex.
    const pattern = `(?i){{ORDER_BY\\([^)]*\\)}}`;
    for (let r = 0; r < table.getNumRows(); r++) {
      const tableRow = table.getRow(r);
      for (let c = 0; c < tableRow.getNumCells(); c++) {
        tableRow.getCell(c).replaceText(pattern, '');
      }
    }
  }

  private stripConsolidatedTableDirectivePlaceholders(
    table: GoogleAppsScript.Document.Table,
    directive: { groupId: string; subGroupId: string }
  ): void {
    if (!table) return;
    const pattern = `(?i){{CONSOLIDATED_TABLE\\(${directive.groupId}\\.${directive.subGroupId}\\)}}`;
    for (let r = 0; r < table.getNumRows(); r++) {
      const tableRow = table.getRow(r);
      for (let c = 0; c < tableRow.getNumCells(); c++) {
        tableRow.getCell(c).replaceText(pattern, '');
      }
    }
  }

  private extractSubGroupDirective(
    table: GoogleAppsScript.Document.Table
  ): { groupId: string; subGroupId: string } | null {
    const text = table.getText && table.getText();
    if (!text) return null;
    const match = text.match(/{{([A-Z0-9_]+)\.([A-Z0-9_]+)\.[A-Z0-9_]+}}/i);
    if (!match) return null;
    return {
      groupId: match[1].toUpperCase(),
      subGroupId: match[2].toUpperCase()
    };
  }

  private renderSubGroupTables(
    body: GoogleAppsScript.Document.Body,
    childIndex: number,
    templateTable: GoogleAppsScript.Document.Table,
    directive: { groupId: string; subGroupId: string },
    groupLookup: Record<string, QuestionConfig>,
    lineItemRows: Record<string, any[]>
  ): number {
    const group = groupLookup[directive.groupId];
    if (!group || !group.lineItemConfig?.subGroups?.length) {
      body.removeChild(templateTable);
      return 0;
    }
    const subConfig = group.lineItemConfig.subGroups.find(sub => {
      const key = resolveSubgroupKey(sub as SubGroupConfig);
      const normalizedKey = (key || '').toUpperCase();
      const slugKey = this.slugifyPlaceholder(key || '');
      return normalizedKey === directive.subGroupId || slugKey === directive.subGroupId;
    });
    if (!subConfig) {
      body.removeChild(templateTable);
      return 0;
    }
    const subKey = resolveSubgroupKey(subConfig);
    const parentRows = lineItemRows[group.id] || [];
    const orderBy = this.extractOrderByDirective(templateTable);
    const preserved = templateTable.copy();
    body.removeChild(templateTable);
    let inserted = 0;

    parentRows.forEach((parentRow, idx) => {
      const children = Array.isArray((parentRow || {})[subKey]) ? (parentRow as any)[subKey] : [];
      if (!children.length) return;
      const newTable = body.insertTable(childIndex + inserted, preserved.copy());
      if (orderBy && orderBy.keys.length) {
        this.stripOrderByDirectivePlaceholders(newTable);
      }

      let r = 0;
      while (r < newTable.getNumRows()) {
        const row = newTable.getRow(r);
        const rowTextParts: string[] = [];
        for (let c = 0; c < row.getNumCells(); c++) {
          rowTextParts.push(row.getCell(c).getText() || '');
        }
        const placeholders = this.extractLineItemPlaceholders(rowTextParts.join(' '));
        const hasSubPlaceholders = placeholders.some(
          p => p.subGroupId && p.subGroupId.toUpperCase() === directive.subGroupId
        );

        if (!hasSubPlaceholders) {
          // Parent-level row: replace placeholders once with parent data, keep formatting
          for (let c = 0; c < row.getNumCells(); c++) {
            const cell = row.getCell(c);
            const text = cell.getText();
            const filled = this.replaceLineItemPlaceholders(text, group, parentRow || {}, {
              subGroup: undefined,
              subGroupToken: undefined
            });
            cell.clear();
            cell.appendParagraph(filled || '');
          }
          r += 1;
          continue;
        }

        if (!children.length) {
          this.clearTableRow(row);
          r += 1;
          continue;
        }

        // Duplicate this row for each child using a pristine template copy
        const templateRow = row.copy().asTableRow();
        const insertAt = r;
        newTable.removeRow(r);
        const orderedChildren =
          orderBy && orderBy.keys.length
            ? this.applyOrderBy(
                children,
                orderBy,
                group,
                { subConfig, subToken: directive.subGroupId }
              )
            : children;
        orderedChildren.forEach((child: any, childIdx: number) => {
          const dataRow = { __parent: parentRow, ...(parentRow || {}), ...(child || {}) };
          const targetRow = newTable.insertTableRow(insertAt + childIdx, templateRow.copy().asTableRow());
          for (let c = 0; c < targetRow.getNumCells(); c++) {
            const cell = targetRow.getCell(c);
            const text = cell.getText();
            const filled = this.replaceLineItemPlaceholders(text, group, dataRow, {
              subGroup: subConfig,
              subGroupToken: directive.subGroupId
            });
            while (cell.getNumChildren() > 0) {
              cell.removeChild(cell.getChild(0));
            }
            cell.appendParagraph(filled || '');
          }
        });
        // Skip past inserted rows
        r = insertAt + orderedChildren.length;
      }
      inserted += 1;
    });

    return inserted;
  }

  private renderTableRows(
    table: GoogleAppsScript.Document.Table,
    groupLookup: Record<string, QuestionConfig>,
    lineItemRows: Record<string, any[]>,
    override?: { groupId: string; rows: any[] }
  ): void {
    const consolidatedDirective = this.extractConsolidatedTableDirective(table);
    if (consolidatedDirective) {
      this.stripConsolidatedTableDirectivePlaceholders(table, consolidatedDirective);
    }
    const orderBy = this.extractOrderByDirective(table);
    if (orderBy && orderBy.keys.length) {
      this.stripOrderByDirectivePlaceholders(table);
    }

    for (let r = 0; r < table.getNumRows(); r++) {
      const row = table.getRow(r);
      const placeholders = this.extractLineItemPlaceholders(row.getText());
      if (!placeholders.length) continue;
      const distinctGroups = Array.from(new Set(placeholders.map(p => p.groupId)));
      if (distinctGroups.length !== 1) continue;
      const groupId = distinctGroups[0];
      const group = groupLookup[groupId];
      if (!group) continue;
      const subGroups = Array.from(new Set(placeholders.map(p => p.subGroupId).filter(Boolean))) as string[];
      if (subGroups.length > 1) continue;
      const targetSubGroupId = subGroups[0];

      const sourceRows = override && override.groupId === group.id
        ? override.rows
        : lineItemRows[group.id];

      let rows: any[] = sourceRows || [];
      let subConfig: SubGroupConfig | undefined;

      if (targetSubGroupId && group.lineItemConfig?.subGroups?.length) {
        subConfig = group.lineItemConfig.subGroups.find(sub => {
          const key = resolveSubgroupKey(sub as SubGroupConfig);
          const normalizedKey = (key || '').toUpperCase();
          const slugKey = this.slugifyPlaceholder(key || '');
          return normalizedKey === targetSubGroupId || slugKey === targetSubGroupId;
        });
        if (subConfig) {
          const subKey = resolveSubgroupKey(subConfig);
          rows = [];
          (sourceRows || []).forEach(parentRow => {
            const children = Array.isArray((parentRow || {})[subKey]) ? (parentRow as any)[subKey] : [];
            children.forEach((child: any) => {
              rows.push({ __parent: parentRow, ...(parentRow || {}), ...(child || {}) });
            });
          });
        }
      }

      // Consolidated subgroup tables: dedupe rows by the placeholder combination in the template row.
      if (consolidatedDirective && targetSubGroupId && groupId === consolidatedDirective.groupId) {
        const wantsSub = consolidatedDirective.subGroupId;
        const matchesSub =
          wantsSub === targetSubGroupId ||
          (subConfig
            ? (() => {
                const key = resolveSubgroupKey(subConfig as any);
                const normalizedKey = (key || '').toUpperCase();
                const slugKey = this.slugifyPlaceholder(key || '');
                return wantsSub === normalizedKey || wantsSub === slugKey;
              })()
            : false);
        if (matchesSub && rows && rows.length) {
          rows = this.consolidateConsolidatedTableRows(rows, placeholders, group, subConfig, targetSubGroupId);
        }
      }

      if (orderBy && orderBy.keys.length && rows && rows.length > 1) {
        rows = this.applyOrderBy(rows, orderBy, group, { subConfig, subToken: targetSubGroupId });
      }

      if (!rows || !rows.length) {
        this.clearTableRow(row);
        continue;
      }
      const templateCells: string[] = [];
      for (let c = 0; c < row.getNumCells(); c++) {
        templateCells.push(row.getCell(c).getText());
      }
      rows.forEach((dataRow, idx) => {
        let targetRow = row;
        if (idx > 0) {
          targetRow = table.insertTableRow(r + idx);
          while (targetRow.getNumCells() < templateCells.length) {
            targetRow.appendTableCell('');
          }
        }
        for (let c = 0; c < templateCells.length; c++) {
          const template = templateCells[c];
          const text = this.replaceLineItemPlaceholders(template, group, dataRow, {
            subGroup: subConfig,
            subGroupToken: targetSubGroupId
          });
          const cell = targetRow.getCell(c);
          cell.clear();
          cell.appendParagraph(text || '');
        }
      });
      r += rows.length - 1;
    }
  }

  private consolidateConsolidatedTableRows(
    rows: any[],
    placeholders: Array<{ groupId: string; subGroupId?: string; fieldId: string }>,
    group: QuestionConfig,
    subConfig: SubGroupConfig | undefined,
    targetSubGroupId: string
  ): any[] {
    const source = rows || [];
    if (!source.length) return [];
    const normalizedGroupId = (group?.id || '').toString().toUpperCase();

    const groupFields = (group?.lineItemConfig?.fields || []) as any[];
    const subFields = ((subConfig as any)?.fields || []) as any[];

    const resolveFieldCfg = (fieldToken: string, scope: 'group' | 'sub'): any | undefined => {
      const list = scope === 'sub' ? subFields : groupFields;
      const tokenUpper = (fieldToken || '').toString().toUpperCase();
      return (list || []).find((f: any) => {
        const id = (f?.id || '').toString().toUpperCase();
        const slug = this.slugifyPlaceholder((f?.labelEn || f?.id || '').toString());
        return id === tokenUpper || slug === tokenUpper;
      });
    };

    const describe = (p: { subGroupId?: string; fieldId: string }) => {
      const isSub = !!p.subGroupId;
      const fieldToken = (p.fieldId || '').toString().toUpperCase();
      const cfg = isSub ? resolveFieldCfg(fieldToken, 'sub') : resolveFieldCfg(fieldToken, 'group');
      const type = (cfg as any)?.type ? (cfg as any).type.toString().toUpperCase() : '';
      const id = (cfg as any)?.id ? (cfg as any).id.toString() : fieldToken;
      return { isSub, fieldToken, cfg, type, id };
    };

    const resolved = placeholders.map(p => ({ p, meta: describe(p) }));
    const numeric = resolved.filter(x => x.meta.type === 'NUMBER' && x.meta.id);
    const nonNumeric = resolved.filter(x => x.meta.type !== 'NUMBER');

    // Default: no numeric fields -> preserve existing behavior (dedupe by full placeholder combination).
    if (!numeric.length) {
      const keyTemplate = placeholders
        .map(p => {
          const token = p.subGroupId
            ? `${normalizedGroupId}.${(p.subGroupId || '').toUpperCase()}.${(p.fieldId || '').toUpperCase()}`
            : `${normalizedGroupId}.${(p.fieldId || '').toUpperCase()}`;
          return `{{${token}}}`;
        })
        .join('||');
      const seen = new Set<string>();
      const uniqueRows: any[] = [];
      source.forEach(dataRow => {
        const key = this.normalizeText(
          this.replaceLineItemPlaceholders(keyTemplate, group, dataRow, {
            subGroup: subConfig,
            subGroupToken: targetSubGroupId
          })
        );
        if (!key || seen.has(key)) return;
        seen.add(key);
        uniqueRows.push(dataRow);
      });
      return uniqueRows;
    }

    // With numeric fields present, consolidate by *non-numeric* placeholder values and sum the numeric fields.
    const keyTemplate = nonNumeric.length
      ? nonNumeric
          .map(x => {
            const p = x.p;
            const token = p.subGroupId
              ? `${normalizedGroupId}.${(p.subGroupId || '').toUpperCase()}.${(p.fieldId || '').toUpperCase()}`
              : `${normalizedGroupId}.${(p.fieldId || '').toUpperCase()}`;
            return `{{${token}}}`;
          })
          .join('||')
      : '';

    const groups = new Map<string, any>();
    const sums = new Map<string, Record<string, number>>();

    const toNumber = (raw: any): number | null => {
      if (raw === undefined || raw === null || raw === '') return null;
      if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
      const s = raw.toString().trim();
      if (!s) return null;
      // Support commas as decimal separators in inputs like "1,25"
      const normalized = s.replace(',', '.');
      const n = Number.parseFloat(normalized);
      return Number.isNaN(n) ? null : n;
    };
    const round2 = (n: number): number => {
      if (!Number.isFinite(n)) return n;
      // Round to 2 decimals (avoid long floating tails like 0.30000000000000004).
      return Math.round((n + Math.sign(n) * Number.EPSILON) * 100) / 100;
    };

    source.forEach(dataRow => {
      const keyRaw = keyTemplate
        ? this.normalizeText(
            this.replaceLineItemPlaceholders(keyTemplate, group, dataRow, {
              subGroup: subConfig,
              subGroupToken: targetSubGroupId
            })
          )
        : 'ALL';
      if (!keyRaw) return;

      if (!groups.has(keyRaw)) {
        groups.set(keyRaw, { ...(dataRow || {}) });
        sums.set(keyRaw, {});
      }
      const sumRec = sums.get(keyRaw) || {};

      numeric.forEach(x => {
        const fid = x.meta.id;
        if (!fid) return;
        const n = toNumber((dataRow || {})[fid]);
        if (n === null) return;
        sumRec[fid] = (sumRec[fid] || 0) + n;
      });
      sums.set(keyRaw, sumRec);
    });

    const aggregated: any[] = [];
    groups.forEach((baseRow, key) => {
      const sumRec = sums.get(key) || {};
      Object.entries(sumRec).forEach(([fid, sum]) => {
        (baseRow as any)[fid] = round2(sum);
      });
      aggregated.push(baseRow);
    });
    return aggregated;
  }

  private applyOrderBy(
    rows: any[],
    orderBy: { keys: Array<{ key: string; direction: 'asc' | 'desc' }> },
    group: QuestionConfig,
    opts?: { subConfig?: SubGroupConfig; subToken?: string }
  ): any[] {
    const keys = orderBy?.keys || [];
    if (!rows || rows.length <= 1 || !keys.length) return rows || [];

    const enriched = rows.map((row, idx) => ({ row, idx }));
    const normalizedGroupId = (group?.id || '').toString().toUpperCase();
    const subToken = (opts?.subToken || '').toString().toUpperCase();
    const subConfig = opts?.subConfig;

    const resolveFieldCfg = (fieldToken: string, scope: 'group' | 'sub'): any | undefined => {
      const list = scope === 'sub' ? (subConfig as any)?.fields || [] : (group as any)?.lineItemConfig?.fields || [];
      const tokenUpper = (fieldToken || '').toString().toUpperCase();
      return (list || []).find((f: any) => {
        const id = (f?.id || '').toString().toUpperCase();
        const slug = this.slugifyPlaceholder((f?.labelEn || f?.id || '').toString());
        return id === tokenUpper || slug === tokenUpper;
      });
    };

    const getComparable = (rowData: any, key: string): { empty: boolean; num?: number; str?: string } => {
      const rawKey = (key || '').toString().toUpperCase();
      const segs = rawKey.split('.').filter(Boolean);

      let scope: 'group' | 'sub' = subConfig ? 'sub' : 'group';
      let fieldToken = '';
      let fieldCfg: any | undefined;

      if (segs.length === 1) {
        fieldToken = segs[0];
        if (subConfig) {
          fieldCfg = resolveFieldCfg(fieldToken, 'sub') || resolveFieldCfg(fieldToken, 'group');
          scope = resolveFieldCfg(fieldToken, 'sub') ? 'sub' : 'group';
        } else {
          fieldCfg = resolveFieldCfg(fieldToken, 'group');
          scope = 'group';
        }
      } else if (segs.length === 2) {
        const g = segs[0];
        const f = segs[1];
        if (g !== normalizedGroupId) {
          fieldToken = f;
          fieldCfg = subConfig ? resolveFieldCfg(fieldToken, 'sub') || resolveFieldCfg(fieldToken, 'group') : resolveFieldCfg(fieldToken, 'group');
          scope = subConfig && resolveFieldCfg(fieldToken, 'sub') ? 'sub' : 'group';
        } else {
          fieldToken = f;
          fieldCfg = resolveFieldCfg(fieldToken, 'group');
          scope = 'group';
        }
      } else if (segs.length >= 3) {
        const g = segs[0];
        const s = segs[1];
        const f = segs[2];
        if (g === normalizedGroupId && subConfig && (s === subToken || s === this.slugifyPlaceholder(resolveSubgroupKey(subConfig as any) || ''))) {
          fieldToken = f;
          fieldCfg = resolveFieldCfg(fieldToken, 'sub');
          scope = 'sub';
        } else if (g === normalizedGroupId) {
          fieldToken = f;
          fieldCfg = resolveFieldCfg(fieldToken, 'group');
          scope = 'group';
        } else {
          fieldToken = f;
          fieldCfg = subConfig ? resolveFieldCfg(fieldToken, 'sub') || resolveFieldCfg(fieldToken, 'group') : resolveFieldCfg(fieldToken, 'group');
          scope = subConfig && resolveFieldCfg(fieldToken, 'sub') ? 'sub' : 'group';
        }
      }

      const rawVal = rowData ? rowData[fieldCfg?.id || fieldToken] : undefined;
      if (rawVal === undefined || rawVal === null || rawVal === '') return { empty: true };
      const fieldType = (fieldCfg as any)?.type || undefined;

      // Dates: compare using ISO date when possible.
      if (fieldType === 'DATE') {
        const iso = this.normalizeToIsoDate(rawVal);
        if (!iso) return { empty: true };
        return { empty: false, str: iso };
      }

      // Numbers: numeric compare if possible
      if (fieldType === 'NUMBER') {
        const n = typeof rawVal === 'number' ? rawVal : Number.parseFloat(rawVal.toString());
        if (Number.isNaN(n)) return { empty: true };
        return { empty: false, num: n };
      }

      // Fallback: string compare
      const text = Array.isArray(rawVal) ? rawVal.map(v => (v ?? '').toString()).join(', ') : rawVal.toString();
      const trimmed = (text || '').toString().trim();
      if (!trimmed) return { empty: true };
      return { empty: false, str: trimmed.toLowerCase() };
    };

    const cmp = (a: { row: any; idx: number }, b: { row: any; idx: number }): number => {
      for (const k of keys) {
        const dir = k.direction === 'desc' ? -1 : 1;
        const av = getComparable(a.row, k.key);
        const bv = getComparable(b.row, k.key);
        if (av.empty && bv.empty) continue;
        if (av.empty && !bv.empty) return 1;
        if (!av.empty && bv.empty) return -1;
        if (av.num !== undefined && bv.num !== undefined) {
          if (av.num < bv.num) return -1 * dir;
          if (av.num > bv.num) return 1 * dir;
          continue;
        }
        const as = (av.str || '').toString();
        const bs = (bv.str || '').toString();
        const sCmp = as.localeCompare(bs, undefined, { numeric: true, sensitivity: 'base' });
        if (sCmp !== 0) return sCmp * dir;
      }
      return a.idx - b.idx;
    };

    enriched.sort(cmp);
    return enriched.map(e => e.row);
  }

  private extractLineItemPlaceholders(text: string): Array<{ groupId: string; subGroupId?: string; fieldId: string }> {
    const matches: Array<{ groupId: string; subGroupId?: string; fieldId: string }> = [];
    if (!text) return matches;
    const pattern = /{{([A-Z0-9_]+)(?:\.([A-Z0-9_]+))?\.([A-Z0-9_]+)}}/gi;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      matches.push({
        groupId: match[1].toUpperCase(),
        subGroupId: match[2] ? match[2].toUpperCase() : undefined,
        fieldId: (match[3] || match[2] || '').toUpperCase()
      });
    }

    // Row-scoped consolidated placeholders should still cause the row to be processed by the table renderer,
    // even when they are the only tokens present in the row.
    // We treat them as "group-only" placeholders so they do NOT trigger subgroup (child-row) rendering.
    const consolidatedRowPattern = /{{CONSOLIDATED_ROW\(([A-Z0-9_]+)\.([A-Z0-9_]+)\.([A-Z0-9_]+)\)}}/gi;
    let cm: RegExpExecArray | null;
    while ((cm = consolidatedRowPattern.exec(text)) !== null) {
      matches.push({
        groupId: (cm[1] || '').toString().toUpperCase(),
        subGroupId: undefined,
        fieldId: (cm[3] || '').toString().toUpperCase()
      });
    }

    return matches;
  }

  private clearTableRow(row: GoogleAppsScript.Document.TableRow): void {
    if (!row) return;
    for (let c = 0; c < row.getNumCells(); c++) {
      const cell = row.getCell(c);
      cell.clear();
    }
  }

  private replaceLineItemPlaceholders(
    template: string,
    group: QuestionConfig,
    rowData: Record<string, any>,
    opts?: { subGroup?: SubGroupConfig; subGroupToken?: string }
  ): string {
    if (!template) return '';
    const normalizedGroupId = group.id.toUpperCase();
    const replacements: Record<string, string> = {};
    (group.lineItemConfig?.fields || []).forEach(field => {
      const text = this.formatTemplateValue(rowData ? rowData[field.id] : '', (field as any).type);
      const tokens = [
        `${normalizedGroupId}.${field.id.toUpperCase()}`,
        `${normalizedGroupId}.${this.slugifyPlaceholder(field.labelEn || field.id)}`
      ];
      tokens.forEach(token => {
        replacements[token] = text;
      });
    });
    if (opts?.subGroup) {
      const subKeyRaw = resolveSubgroupKey(opts.subGroup);
      const subToken = opts.subGroupToken || this.slugifyPlaceholder(subKeyRaw);
      const normalizedSubKey = subToken.toUpperCase();
      (opts.subGroup.fields || []).forEach((field: any) => {
        const text = this.formatTemplateValue(rowData ? rowData[field.id] : '', (field as any).type);
        const tokens = [
          `${normalizedGroupId}.${normalizedSubKey}.${field.id.toUpperCase()}`,
          `${normalizedGroupId}.${normalizedSubKey}.${this.slugifyPlaceholder(field.labelEn || field.id)}`
        ];
        tokens.forEach(token => {
          replacements[token] = text;
        });
      });
    }
    const replaced = template.replace(/{{([A-Z0-9_]+)(?:\.([A-Z0-9_]+))?\.([A-Z0-9_]+)}}/gi, (_, groupId, maybeSub, fieldKey) => {
      if (groupId.toUpperCase() !== normalizedGroupId) return '';
      const token = maybeSub
        ? `${normalizedGroupId}.${maybeSub.toUpperCase()}.${fieldKey.toUpperCase()}`
        : `${normalizedGroupId}.${fieldKey.toUpperCase()}`;
      return replacements[token] ?? '';
    });

    // Row-scoped consolidated values for nested subgroups (useful inside GROUP_TABLE blocks).
    // Example: {{CONSOLIDATED_ROW(MP_DISHES.INGREDIENTS.ALLERGEN)}}
    return replaced.replace(
      /{{CONSOLIDATED_ROW\(([A-Z0-9_]+)\.([A-Z0-9_]+)\.([A-Z0-9_]+)\)}}/gi,
      (_m, groupIdRaw: string, subGroupIdRaw: string, fieldIdRaw: string) => {
        const groupId = (groupIdRaw || '').toString().toUpperCase();
        if (groupId !== normalizedGroupId) return '';
        const subToken = (subGroupIdRaw || '').toString().toUpperCase();
        const fieldToken = (fieldIdRaw || '').toString().toUpperCase();
        if (!subToken || !fieldToken) return '';

        const parentRow = (rowData as any)?.__parent || rowData || {};
        const subGroups = group.lineItemConfig?.subGroups || [];
        const subConfig = subGroups.find(sub => {
          const key = resolveSubgroupKey(sub as SubGroupConfig);
          const normalizedKey = (key || '').toUpperCase();
          const slugKey = this.slugifyPlaceholder(key || '');
          return normalizedKey === subToken || slugKey === subToken;
        });
        if (!subConfig) return '';
        const subKey = resolveSubgroupKey(subConfig as SubGroupConfig);
        if (!subKey) return '';

        const children = Array.isArray((parentRow as any)[subKey]) ? (parentRow as any)[subKey] : [];
        if (!children.length) return '';

        const fields = (subConfig as any).fields || [];
        const fieldCfg = fields.find((f: any) => {
          const id = (f?.id || '').toString().toUpperCase();
          const slug = this.slugifyPlaceholder((f?.labelEn || f?.id || '').toString());
          return id === fieldToken || slug === fieldToken;
        });
        if (!fieldCfg) return '';

        const seen = new Set<string>();
        const ordered: string[] = [];
        children.forEach((child: any) => {
          const raw = child?.[fieldCfg.id];
          if (raw === undefined || raw === null || raw === '') return;
          const text = this.formatTemplateValue(raw, (fieldCfg as any).type).trim();
          if (!text || seen.has(text)) return;
          seen.add(text);
          ordered.push(text);
        });
        return ordered.join(', ');
      }
    );
  }

  private formatTemplateValue(value: any, fieldType?: string): string {
    if (value === undefined || value === null) return '';
    if (fieldType === 'DATE') {
      const iso = this.normalizeToIsoDate(value);
      if (!iso) return '';
      return this.formatIsoDateLabel(iso);
    }
    if (Array.isArray(value)) {
      if (value.length && typeof value[0] === 'object') {
        return value
          .map(entry =>
            Object.entries(entry)
              .map(([key, val]) => `${key}: ${val ?? ''}`)
              .join(', ')
          )
          .join('\n');
      }
      return value.map(v => (v ?? '').toString()).join(', ');
    }
    if (typeof value === 'object') {
      return Object.entries(value)
        .map(([key, val]) => `${key}: ${val ?? ''}`)
        .join(', ');
    }
    const asIsoDate = this.normalizeToIsoDate(value);
    if (asIsoDate) return asIsoDate;
    return value.toString();
  }

  private normalizeToIsoDate(value: any): string | undefined {
    if (value === undefined || value === null) return undefined;
    // Google Sheets numeric serial dates (roughly 1900 epoch)
    if (typeof value === 'number') {
      const days = Number(value);
      if (days > 30000 && days < 90000) {
        const millis = (days - 25569) * 86400 * 1000; // Excel/Sheets serial to epoch
        return new Date(millis).toISOString().slice(0, 10);
      }
      return undefined;
    }
    if (value instanceof Date) {
      return value.toISOString().slice(0, 10);
    }
    // Handle date-like strings from Sheets without coercing plain numbers
    if (typeof value === 'string') {
      const trimmed = value.trim();
      // ISO date only: keep as-is to avoid TZ shifts
      if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        return trimmed;
      }
      // ISO with time
      const isoWithTime = /^\d{4}-\d{2}-\d{2}[T\s].*/.test(trimmed);
      // Common d/m/y or m/d/y with separators
      const dmMatch = /^\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}$/.test(trimmed);
      // Pure numeric serial stored as string
      const numericSerial = /^\d{4,}$/.test(trimmed) ? Number(trimmed) : NaN;
      if (isoWithTime) {
        const parsed = Date.parse(trimmed);
        if (!Number.isNaN(parsed)) return new Date(parsed).toISOString().slice(0, 10);
      }
      if (dmMatch) {
        const [a, b, c] = trimmed.split(/[\/-]/);
        const dayFirst = a.length <= 2 && b.length <= 2;
        const day = dayFirst ? Number(a) : Number(b);
        const month = dayFirst ? Number(b) : Number(a);
        const year = c.length === 2 ? Number(`20${c}`) : Number(c);
        if (!Number.isNaN(day) && !Number.isNaN(month) && !Number.isNaN(year)) {
          const utc = Date.UTC(year, month - 1, day);
          return new Date(utc).toISOString().slice(0, 10);
        }
      }
      if (!Number.isNaN(numericSerial) && numericSerial > 30000 && numericSerial < 90000) {
        const millis = (numericSerial - 25569) * 86400 * 1000;
        return new Date(millis).toISOString().slice(0, 10);
      }
    }
    return undefined;
  }

  private formatIsoDateLabel(iso: string): string {
    const trimmed = (iso || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed || '';
    const [y, m, d] = trimmed.split('-').map(n => Number(n));
    if (!y || !m || !d) return trimmed;
    const date = new Date(Date.UTC(y, m - 1, d));
    if (Number.isNaN(date.getTime())) return trimmed;
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const pad2 = (n: number) => n.toString().padStart(2, '0');
    const dow = days[date.getUTCDay()] || '';
    const mon = months[m - 1] || '';
    return `${dow}, ${pad2(d)}-${mon}-${y}`;
  }

  private addPlaceholderVariants(map: Record<string, string>, key: string, value: any, fieldType?: string): void {
    if (!key) return;
    const keys = this.buildPlaceholderKeys(key);
    const text = this.formatTemplateValue(value, fieldType);
    keys.forEach(token => {
      map[`{{${token}}}`] = text;
    });
  }

  private buildPlaceholderKeys(raw: string): string[] {
    const sanitized = raw || '';
    const segments = sanitized.split('.').map(seg => seg.trim());
    const upper = segments.map(seg => seg.toUpperCase()).join('.');
    const lower = segments.map(seg => seg.toLowerCase()).join('.');
    const title = segments
      .map(seg =>
        seg
          .toLowerCase()
          .split('_')
          .map(word => (word ? word.charAt(0).toUpperCase() + word.slice(1) : ''))
          .join('_')
      )
      .join('.');
    return Array.from(new Set([upper, lower, title]));
  }

  private resolveTemplateId(template: TemplateIdMap | undefined, language: string): string | undefined {
    if (!template) return undefined;
    if (typeof template === 'string') {
      const trimmed = template.trim();
      return trimmed || undefined;
    }
    const langKey = (language || 'EN').toUpperCase();
    if ((template as any)[langKey]) return (template as any)[langKey];
    const lower = (language || 'en').toLowerCase();
    if ((template as any)[lower]) return (template as any)[lower];
    if ((template as any).EN) return (template as any).EN;
    const firstKey = Object.keys(template)[0];
    return firstKey ? (template as any)[firstKey] : undefined;
  }

  private lookupRecipientFromDataSource(
    entry: EmailRecipientDataSourceConfig,
    lookupValue: any,
    language: string
  ): string | undefined {
    if (!lookupValue) return undefined;
    try {
      const projection = entry.dataSource?.projection || [entry.lookupField, entry.valueField];
      const limit = entry.dataSource?.limit || 200;
      const response = this.dataSources.fetchDataSource(entry.dataSource, language, projection, limit);
      const items = Array.isArray(response.items) ? response.items : [];
      const normalizedLookup = lookupValue.toString().trim().toLowerCase();
      for (const item of items) {
        if (!item || typeof item !== 'object') continue;
        const matchValue = (item as any)[entry.lookupField];
        if (matchValue === undefined || matchValue === null) continue;
        const normalizedMatch = matchValue.toString().trim().toLowerCase();
        if (normalizedMatch === normalizedLookup) {
          const emailValue = (item as any)[entry.valueField];
          if (emailValue && emailValue.toString().trim()) {
            return emailValue.toString().trim();
          }
        }
      }
    } catch (err) {
      debugLog('followup.recipient.lookup.failed', {
        error: err ? err.toString() : 'lookup error',
        dataSource: entry.dataSource?.id || (entry as any).dataSource
      });
    }
    return undefined;
  }

  private slugifyPlaceholder(label: string): string {
    return (label || '').toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  }

  private applyPlaceholders(template: string, placeholders: Record<string, string>): string {
    if (!template) return '';
    let output = template;
    Object.entries(placeholders).forEach(([token, value]) => {
      output = output.replace(new RegExp(this.escapeRegExp(token), 'g'), value ?? '');
      // Relaxed matcher to tolerate incidental spaces around tokens in the Doc
      if (token.startsWith('{{') && token.endsWith('}}')) {
        const inner = token.slice(2, -2);
        const relaxed = new RegExp(`{{\\s*${this.escapeRegExp(inner)}\\s*}}`, 'g');
        output = output.replace(relaxed, value ?? '');
      }
    });
    return output;
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private resolveRecipients(
    entries: EmailRecipientEntry[] | undefined,
    placeholders: Record<string, string>,
    record: WebFormSubmission
  ): string[] {
    if (!entries || !entries.length) return [];
    const resolved: string[] = [];
    entries.forEach(entry => {
      if (typeof entry === 'string') {
        const address = this.applyPlaceholders(entry, placeholders).trim();
        if (address) resolved.push(address);
        return;
      }
      if (entry && entry.type === 'dataSource') {
        const lookupValue = (record.values && (record.values as any)[entry.recordFieldId]) || '';
        const address = this.lookupRecipientFromDataSource(entry, lookupValue, record.language);
        if (address) {
          resolved.push(address);
        } else if (entry.fallbackEmail) {
          resolved.push(entry.fallbackEmail);
        }
      }
    });
    return resolved.filter(Boolean);
  }

  private resolveLocalizedStringValue(value: any, language?: string): string {
    if (!value) return '';
    if (typeof value === 'string') return value;
    const langKey = (language || 'EN').toLowerCase();
    return (value as any)[langKey] || (value as any).en || (value as any).EN || '';
  }

  private generateUuid(): string {
    try {
      if (typeof Utilities !== 'undefined' && (Utilities as any).getUuid) {
        return (Utilities as any).getUuid();
      }
    } catch (_) {
      // ignore
    }
    return 'uuid-' + Math.random().toString(16).slice(2);
  }
}
