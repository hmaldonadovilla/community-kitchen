import {
  FollowupActionResult,
  FollowupConfig,
  FormConfig,
  QuestionConfig,
  WebFormSubmission
} from '../../types';
import { DataSourceService } from './dataSources';
import { SubmissionService } from './submissions';
import { RecordContext } from './types';
import { validateFollowupRequirements } from './followup/validation';
import { handleCloseRecordAction, handleCreatePdfAction, handleSendEmailAction } from './followup/actionHandlers';
import {
  renderDocPreviewFromTemplate,
  renderHtmlFromTemplate,
  renderPdfArtifactFromTemplate,
  renderPdfBytesFromTemplate,
  renderPdfFromTemplate
} from './followup/docRenderer';
import { renderHtmlFromHtmlTemplate } from './followup/htmlRenderer';
import { renderMarkdownFromTemplate } from './followup/markdownRenderer';
import { hydrateMealProductionPrepIngredientsFromLeftovers } from './followup/mealProductionLeftoverIngredients';

/**
 * Follow-up actions + Doc template rendering (PDF/email/html).
 *
 * Responsibility:
 * - Orchestrate follow-up actions (create PDF, send email, close record)
 * - Delegate heavy template rendering to `src/services/webform/followup/*` modules
 */
export class FollowupService {
  private readonly ss: GoogleAppsScript.Spreadsheet.Spreadsheet;
  private readonly submissionService: SubmissionService;
  private readonly dataSources: DataSourceService;
  private readonly resolveLinkedRecord?: (formKey: string, recordId: string) => WebFormSubmission | null;

  constructor(
    ss: GoogleAppsScript.Spreadsheet.Spreadsheet,
    submissionService: SubmissionService,
    dataSources: DataSourceService,
    resolveLinkedRecord?: (formKey: string, recordId: string) => WebFormSubmission | null
  ) {
    this.ss = ss;
    this.submissionService = submissionService;
    this.dataSources = dataSources;
    this.resolveLinkedRecord = resolveLinkedRecord;
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
    const validationErrors = validateFollowupRequirements(questions, context.record);
    if (validationErrors.length) {
      return { success: false, message: `Validation failed: ${validationErrors.join('; ')}` };
    }
    switch (normalizedAction) {
      case 'CREATE_PDF':
        return handleCreatePdfAction({
          form,
          questions,
          recordId,
          followup,
          context,
          submissionService: this.submissionService,
          generatePdfArtifact: (...a) => this.generatePdfArtifact(...a)
        });
      case 'SEND_EMAIL':
        return handleSendEmailAction({
          form,
          questions,
          recordId,
          followup,
          context,
          submissionService: this.submissionService,
          dataSources: this.dataSources,
          generatePdfArtifact: (...a) => this.generatePdfArtifact(...a)
        });
      case 'CLOSE_RECORD':
        return handleCloseRecordAction({
          form,
          questions,
          recordId,
          followup,
          context,
          submissionService: this.submissionService
        });
      default:
        return { success: false, message: `Unsupported follow-up action "${action}".` };
    }
  }

  triggerFollowupActions(
    form: FormConfig,
    questions: QuestionConfig[],
    recordId: string,
    actions: string[]
  ): { success: boolean; results: Array<{ action: string; result: FollowupActionResult }> } {
    const normalizedActions = Array.isArray(actions)
      ? actions
          .map(a => (a || '').toString().trim())
          .filter(Boolean)
      : [];
    if (!normalizedActions.length) {
      return { success: false, results: [{ action: '', result: { success: false, message: 'No follow-up actions provided.' } }] };
    }

    const results: Array<{ action: string; result: FollowupActionResult }> = [];
    for (const action of normalizedActions) {
      const result = this.triggerFollowupAction(form, questions, recordId, action);
      results.push({ action, result });
    }
    const allOk = results.every(entry => !!entry.result?.success);
    return { success: allOk, results };
  }

  /**
   * Render a Google Doc template (with placeholders + line-item table directives) into a PDF.
   * Used by follow-up actions and by the web app's report BUTTON field previews.
   */
  public renderPdfFromTemplate(args: {
    form: FormConfig;
    questions: QuestionConfig[];
    record: WebFormSubmission;
    templateIdMap: any;
    folderId?: string;
    namePrefix?: string;
  }): { success: boolean; message?: string; url?: string; fileId?: string } {
    const record = this.prepareRecordForTemplateRender(args.form, args.record);
    return renderPdfFromTemplate({
      ss: this.ss,
      dataSources: this.dataSources,
      ...args,
      record
    });
  }

  /**
   * Render a Google Doc template (with placeholders + line-item table directives) into an in-memory PDF (base64).
   * This avoids embedding Drive/Docs preview pages (which can be blocked by CSP) and does not persist a PDF file.
   */
  public renderPdfBytesFromTemplate(args: {
    form: FormConfig;
    questions: QuestionConfig[];
    record: WebFormSubmission;
    templateIdMap: any;
    namePrefix?: string;
  }): { success: boolean; message?: string; pdfBase64?: string; mimeType?: string; fileName?: string } {
    const record = this.prepareRecordForTemplateRender(args.form, args.record);
    return renderPdfBytesFromTemplate({
      dataSources: this.dataSources,
      ...args,
      record
    });
  }

  /**
   * Render a Google Doc template (with placeholders + line-item table directives) into a temporary Doc copy
   * and return a preview URL for embedding in the web app.
   */
  public renderDocPreviewFromTemplate(args: {
    form: FormConfig;
    questions: QuestionConfig[];
    record: WebFormSubmission;
    templateIdMap: any;
    folderId?: string;
    namePrefix?: string;
  }): { success: boolean; message?: string; fileId?: string; previewUrl?: string } {
    const record = this.prepareRecordForTemplateRender(args.form, args.record);
    return renderDocPreviewFromTemplate({
      ss: this.ss,
      dataSources: this.dataSources,
      ...args,
      record
    });
  }

  /**
   * Render a Google Doc template (with placeholders + line-item table directives) into a self-contained HTML string.
   */
  public renderHtmlFromTemplate(args: {
    form: FormConfig;
    questions: QuestionConfig[];
    record: WebFormSubmission;
    templateIdMap: any;
    namePrefix?: string;
  }): { success: boolean; message?: string; html?: string } {
    const record = this.prepareRecordForTemplateRender(args.form, args.record);
    return renderHtmlFromTemplate({
      dataSources: this.dataSources,
      ...args,
      record
    });
  }

  /**
   * Render a Markdown (text) template stored in Drive using placeholder rules, returning the expanded Markdown.
   * The web client converts it to HTML for a fast in-app preview.
   */
  public renderMarkdownFromTemplate(args: {
    form: FormConfig;
    questions: QuestionConfig[];
    record: WebFormSubmission;
    templateIdMap: any;
    namePrefix?: string;
  }): { success: boolean; message?: string; markdown?: string; fileName?: string } {
    const record = this.prepareRecordForTemplateRender(args.form, args.record);
    return renderMarkdownFromTemplate({
      dataSources: this.dataSources,
      ...args,
      record
    });
  }

  /**
   * Render an HTML (text) template stored in Drive using placeholder rules, returning the expanded HTML string.
   * The web client renders the HTML directly for a fast in-app preview.
   */
  public renderHtmlFromHtmlTemplate(args: {
    form: FormConfig;
    questions: QuestionConfig[];
    record: WebFormSubmission;
    templateIdMap: any;
    namePrefix?: string;
  }): { success: boolean; message?: string; html?: string; fileName?: string } {
    const record = this.prepareRecordForTemplateRender(args.form, args.record);
    return renderHtmlFromHtmlTemplate({
      dataSources: this.dataSources,
      ...args,
      record
    });
  }

  /**
   * Legacy seam (used by tests and callers via spying) for generating a PDF artifact.
   * Prefer calling `renderPdfFromTemplate` / `renderPdfBytesFromTemplate` for new code.
   */
  public generatePdfArtifact(
    form: FormConfig,
    questions: QuestionConfig[],
    record: WebFormSubmission,
    followup: FollowupConfig
  ): { success: boolean; message?: string; url?: string; fileId?: string; blob?: GoogleAppsScript.Base.Blob } {
    if (!followup.pdfTemplateId) {
      return { success: false, message: 'PDF template ID missing.' };
    }
    const preparedRecord = this.prepareRecordForTemplateRender(form, record);
    return renderPdfArtifactFromTemplate({
      ss: this.ss,
      dataSources: this.dataSources,
      form,
      questions,
      record: preparedRecord,
      templateIdMap: followup.pdfTemplateId,
      folderId: followup.pdfFolderId,
      namePrefix: form.title || 'Form'
    });
  }

  private getRecordContext(form: FormConfig, questions: QuestionConfig[], recordId: string): RecordContext | null {
    const context = this.submissionService.getRecordContext(form, questions, recordId);
    if (!context?.record) return context;
    return {
      ...context,
      record: this.prepareRecordForTemplateRender(form, context.record)
    };
  }

  private prepareRecordForTemplateRender(form: FormConfig, record: WebFormSubmission): WebFormSubmission {
    const formKey = (form.configSheet || form.title || '').toString().trim().toLowerCase();
    if (formKey !== 'config: meal production' && formKey !== 'meal production') {
      return record;
    }
    if (!this.resolveLinkedRecord) {
      return record;
    }
    return hydrateMealProductionPrepIngredientsFromLeftovers(record, leftoverRecordId =>
      this.resolveLinkedRecord ? this.resolveLinkedRecord('Config: Leftover Inventory', leftoverRecordId) : null
    );
  }
}
