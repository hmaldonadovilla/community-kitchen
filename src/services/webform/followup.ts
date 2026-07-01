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
import {
  handleCloseRecordAction,
  handleCreatePdfAction,
  handleSendEmailAction,
  type GeneratedPdfArtifact
} from './followup/actionHandlers';
import {
  renderDocPreviewFromTemplate,
  renderHtmlFromTemplate,
  renderPdfArtifactFromTemplate,
  renderPdfBytesFromTemplate,
  renderPdfFromTemplate
} from './followup/docRenderer';
import { renderHtmlFromHtmlTemplate } from './followup/htmlRenderer';
import { renderMarkdownFromTemplate } from './followup/markdownRenderer';
import { validateMealProductionFollowupActionReadiness } from './followup/mealProductionFollowupGuard';
import { hydrateMealProductionPrepIngredientsFromLeftovers } from './followup/mealProductionLeftoverIngredients';

const TEMPLATE_HYDRATED_MARKER = '__ckMealProductionTemplateHydrated';

type FollowupRuntimeState = {
  pdfArtifact?: GeneratedPdfArtifact | null;
  contextCache?: {
    key: string;
    context: RecordContext | null;
  };
};

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
  private readonly linkedRecordCache: Map<string, WebFormSubmission | null>;

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
    this.linkedRecordCache = new Map();
  }

  triggerFollowupAction(
    form: FormConfig,
    questions: QuestionConfig[],
    recordId: string,
    action: string,
    runtime?: FollowupRuntimeState
  ): FollowupActionResult {
    if (!recordId) {
      return { success: false, message: 'Record ID is required.' };
    }
    const normalizedAction = (action || '').toString().toUpperCase();
    const followup = form.followupConfig;
    if (!followup) {
      return { success: false, message: 'Follow-up actions are not configured for this form.' };
    }
    const context = this.getCachedRecordContext(form, questions, recordId, runtime);
    if (!context || !context.record) {
      return { success: false, message: 'Record not found.' };
    }
    const validationErrors = validateFollowupRequirements(questions, context.record);
    if (validationErrors.length) {
      return { success: false, message: `Validation failed: ${validationErrors.join('; ')}` };
    }
    const readinessErrors = validateMealProductionFollowupActionReadiness({
      form,
      questions,
      record: context.record,
      action: normalizedAction
    });
    if (readinessErrors.length) {
      return { success: false, message: `Validation failed: ${readinessErrors.join('; ')}` };
    }
    switch (normalizedAction) {
      case 'CREATE_PDF':
        return this.applyResultToCachedContext(
          form,
          recordId,
          runtime,
          handleCreatePdfAction({
            form,
            questions,
            recordId,
            followup,
            context,
            submissionService: this.submissionService,
            generatePdfArtifact: (...a) => this.generatePdfArtifact(...a),
            onPdfArtifact: artifact => {
              if (runtime) runtime.pdfArtifact = artifact;
            }
          })
        );
      case 'SEND_EMAIL':
        return this.applyResultToCachedContext(
          form,
          recordId,
          runtime,
          handleSendEmailAction({
            form,
            questions,
            recordId,
            followup,
            context,
            submissionService: this.submissionService,
            dataSources: this.dataSources,
            generatePdfArtifact: (...a) => this.generatePdfArtifact(...a),
            pdfArtifact: runtime?.pdfArtifact || null
          })
        );
      case 'CLOSE_RECORD':
        return this.applyResultToCachedContext(
          form,
          recordId,
          runtime,
          handleCloseRecordAction({
            form,
            questions,
            recordId,
            followup,
            context,
            submissionService: this.submissionService
          })
        );
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
    const runtime: FollowupRuntimeState = {};
    for (const action of normalizedActions) {
      const result = this.triggerFollowupAction(form, questions, recordId, action, runtime);
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

  private getCachedRecordContext(
    form: FormConfig,
    questions: QuestionConfig[],
    recordId: string,
    runtime?: FollowupRuntimeState
  ): RecordContext | null {
    const key = `${(form.configSheet || form.title || '').toString().trim()}::${(recordId || '').toString().trim()}`;
    if (runtime?.contextCache?.key === key) {
      return runtime.contextCache.context;
    }
    const context = this.getRecordContext(form, questions, recordId);
    if (runtime) {
      runtime.contextCache = { key, context };
    }
    return context;
  }

  private applyResultToCachedContext(
    form: FormConfig,
    recordId: string,
    runtime: FollowupRuntimeState | undefined,
    result: FollowupActionResult
  ): FollowupActionResult {
    if (!result?.success || !runtime?.contextCache?.context?.record) return result;
    const key = `${(form.configSheet || form.title || '').toString().trim()}::${(recordId || '').toString().trim()}`;
    if (runtime.contextCache.key !== key) return result;
    const record = runtime.contextCache.context.record;
    runtime.contextCache.context = {
      ...runtime.contextCache.context,
      record: {
        ...record,
        status: result.status !== undefined ? result.status : record.status,
        pdfUrl: result.pdfUrl !== undefined ? result.pdfUrl : record.pdfUrl,
        updatedAt: result.updatedAt !== undefined ? result.updatedAt : record.updatedAt,
        dataVersion: result.dataVersion !== undefined ? result.dataVersion : record.dataVersion
      }
    };
    return result;
  }

  private resolveLinkedRecordCached(formKey: string, recordId: string): WebFormSubmission | null {
    const normalizedFormKey = (formKey || '').toString().trim();
    const normalizedRecordId = (recordId || '').toString().trim();
    if (!normalizedFormKey || !normalizedRecordId || !this.resolveLinkedRecord) return null;
    const cacheKey = `${normalizedFormKey}::${normalizedRecordId}`;
    if (this.linkedRecordCache.has(cacheKey)) {
      return this.linkedRecordCache.get(cacheKey) || null;
    }
    const record = this.resolveLinkedRecord(normalizedFormKey, normalizedRecordId);
    this.linkedRecordCache.set(cacheKey, record || null);
    return record || null;
  }

  private markTemplateRecordHydrated(record: WebFormSubmission): WebFormSubmission {
    try {
      Object.defineProperty(record as any, TEMPLATE_HYDRATED_MARKER, {
        value: true,
        enumerable: false,
        configurable: true
      });
    } catch {
      try {
        (record as any)[TEMPLATE_HYDRATED_MARKER] = true;
      } catch {
        // ignore marker failures
      }
    }
    return record;
  }

  private prepareRecordForTemplateRender(form: FormConfig, record: WebFormSubmission): WebFormSubmission {
    const formKey = (form.configSheet || form.title || '').toString().trim().toLowerCase();
    if (formKey !== 'config: meal production' && formKey !== 'meal production') {
      return record;
    }
    if ((record as any)?.[TEMPLATE_HYDRATED_MARKER]) {
      return record;
    }
    if (!this.resolveLinkedRecord) {
      return this.markTemplateRecordHydrated(record);
    }
    return this.markTemplateRecordHydrated(
      hydrateMealProductionPrepIngredientsFromLeftovers(record, leftoverRecordId =>
        this.resolveLinkedRecordCached('Config: Leftover Bank', leftoverRecordId)
      )
    );
  }
}
