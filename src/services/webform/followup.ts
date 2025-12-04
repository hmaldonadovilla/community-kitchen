import {
  EmailRecipientDataSourceConfig,
  EmailRecipientEntry,
  FollowupActionResult,
  FollowupConfig,
  FormConfig,
  LocalizedString,
  QuestionConfig,
  TemplateIdMap,
  WebFormSubmission
} from '../../types';
import { DataSourceService } from './dataSources';
import { debugLog } from './debug';
import { SubmissionService } from './submissions';
import { RecordContext } from './types';

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
    switch (normalizedAction) {
      case 'CREATE_PDF':
        return this.handleCreatePdfAction(form, questions, recordId, followup);
      case 'SEND_EMAIL':
        return this.handleSendEmailAction(form, questions, recordId, followup);
      case 'CLOSE_RECORD':
        return this.handleCloseRecordAction(form, questions, recordId, followup);
      default:
        return { success: false, message: `Unsupported follow-up action "${action}".` };
    }
  }

  private handleCreatePdfAction(
    form: FormConfig,
    questions: QuestionConfig[],
    recordId: string,
    followup: FollowupConfig
  ): FollowupActionResult {
    if (!followup.pdfTemplateId) {
      return { success: false, message: 'PDF template ID missing in follow-up config.' };
    }
    const context = this.getRecordContext(form, questions, recordId);
    if (!context || !context.record) {
      return { success: false, message: 'Record not found.' };
    }
    const pdfArtifact = this.generatePdfArtifact(form, questions, context.record, followup);
    if (!pdfArtifact.success) {
      return { success: false, message: pdfArtifact.message || 'Failed to generate PDF.' };
    }
    if (context.columns.pdfUrl && pdfArtifact.url) {
      context.sheet.getRange(context.rowIndex, context.columns.pdfUrl, 1, 1).setValue(pdfArtifact.url);
    }
    const statusValue = followup.statusTransitions?.onPdf;
    let updatedAt = statusValue
      ? this.submissionService.writeStatus(context.sheet, context.columns, context.rowIndex, statusValue, followup.statusFieldId)
      : null;
    if (!updatedAt) {
      updatedAt = this.submissionService.touchUpdatedAt(context.sheet, context.columns, context.rowIndex);
    }
    this.submissionService.refreshRecordCache(form.configSheet, questions, context);
    return {
      success: true,
      status: statusValue || context.record.status,
      pdfUrl: pdfArtifact.url,
      fileId: pdfArtifact.fileId,
      updatedAt: updatedAt ? updatedAt.toISOString() : context.record.updatedAt
    };
  }

  private handleSendEmailAction(
    form: FormConfig,
    questions: QuestionConfig[],
    recordId: string,
    followup: FollowupConfig
  ): FollowupActionResult {
    if (!followup.emailTemplateId) {
      return { success: false, message: 'Email template ID missing in follow-up config.' };
    }
    if (!followup.emailRecipients || !followup.emailRecipients.length) {
      return { success: false, message: 'Email recipients not configured.' };
    }
    const context = this.getRecordContext(form, questions, recordId);
    if (!context || !context.record) {
      return { success: false, message: 'Record not found.' };
    }
    const lineItemRows = this.collectLineItemRows(context.record, questions);
    const placeholders = this.buildPlaceholderMap(context.record, questions, lineItemRows);
    const pdfArtifact = this.generatePdfArtifact(form, questions, context.record, followup);
    if (!pdfArtifact.success) {
      return { success: false, message: pdfArtifact.message || 'Failed to generate PDF.' };
    }
    if (context.columns.pdfUrl && pdfArtifact.url) {
      context.sheet.getRange(context.rowIndex, context.columns.pdfUrl, 1, 1).setValue(pdfArtifact.url);
    }
    const toRecipients = this.resolveRecipients(followup.emailRecipients, placeholders, context.record);
    if (!toRecipients.length) {
      return { success: false, message: 'Resolved email recipients are empty.' };
    }
    const ccRecipients = this.resolveRecipients(followup.emailCc, placeholders, context.record);
    const bccRecipients = this.resolveRecipients(followup.emailBcc, placeholders, context.record);
    const templateId = this.resolveTemplateId(followup.emailTemplateId, context.record.language);
    if (!templateId) {
      return { success: false, message: 'No email template matched the submission language.' };
    }
    try {
      const templateDoc = DocumentApp.openById(templateId);
      const templateBody = templateDoc.getBody().getText();
      const body = this.applyPlaceholders(templateBody, placeholders);
      const htmlBody = body.replace(/\n/g, '<br/>');
      const subject =
        this.resolveLocalizedStringValue(followup.emailSubject, context.record.language) ||
        `${form.title || 'Form'} submission ${context.record.id}`;
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
      ? this.submissionService.writeStatus(context.sheet, context.columns, context.rowIndex, statusValue, followup.statusFieldId)
      : null;
    if (!updatedAt) {
      updatedAt = this.submissionService.touchUpdatedAt(context.sheet, context.columns, context.rowIndex);
    }
    this.submissionService.refreshRecordCache(form.configSheet, questions, context);
    return {
      success: true,
      status: statusValue || context.record.status,
      pdfUrl: pdfArtifact.url,
      fileId: pdfArtifact.fileId,
      updatedAt: updatedAt ? updatedAt.toISOString() : context.record.updatedAt
    };
  }

  private handleCloseRecordAction(
    form: FormConfig,
    questions: QuestionConfig[],
    recordId: string,
    followup: FollowupConfig
  ): FollowupActionResult {
    const context = this.getRecordContext(form, questions, recordId);
    if (!context) {
      return { success: false, message: 'Record not found.' };
    }
    const statusValue = followup.statusTransitions?.onClose || 'Closed';
    const updatedAt = this.submissionService.writeStatus(context.sheet, context.columns, context.rowIndex, statusValue, followup.statusFieldId)
      || this.submissionService.touchUpdatedAt(context.sheet, context.columns, context.rowIndex);
    this.submissionService.refreshRecordCache(form.configSheet, questions, context);
    return {
      success: true,
      status: statusValue,
      updatedAt: updatedAt ? updatedAt.toISOString() : context.record?.updatedAt
    };
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
    const templateId = this.resolveTemplateId(followup.pdfTemplateId, record.language);
    if (!templateId) {
      return { success: false, message: 'No PDF template matched the submission language.' };
    }
    try {
      const templateFile = DriveApp.getFileById(templateId);
      const folder = this.resolveFollowupFolder(followup);
      const copyName = `${form.title || 'Form'} - ${record.id || this.generateUuid()}`;
      const copy = templateFile.makeCopy(copyName, folder);
      const doc = DocumentApp.openById(copy.getId());
      const lineItemRows = this.collectLineItemRows(record, questions);
      const placeholders = this.buildPlaceholderMap(record, questions, lineItemRows);
      this.addConsolidatedPlaceholders(placeholders, questions, lineItemRows);
      this.renderLineItemTables(doc, questions, lineItemRows);
      const body = doc.getBody();
      Object.entries(placeholders).forEach(([token, value]) => {
        body.replaceText(this.escapeRegExp(token), value ?? '');
      });
      doc.saveAndClose();
      const pdfBlob = copy.getAs('application/pdf');
      const pdfFile = folder.createFile(pdfBlob).setName(`${copyName}.pdf`);
      copy.setTrashed(true);
      return { success: true, url: pdfFile.getUrl(), fileId: pdfFile.getId(), blob: pdfBlob };
    } catch (err) {
      debugLog('followup.pdf.failed', { error: err ? err.toString() : 'unknown' });
      return { success: false, message: 'Failed to generate PDF.' };
    }
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
      const value = record.values ? record.values[q.id] : '';
      const formatted = this.formatTemplateValue(value);
      this.addPlaceholderVariants(map, q.id, formatted);
      const labelToken = this.slugifyPlaceholder(q.qEn || q.id);
      this.addPlaceholderVariants(map, labelToken, formatted);
      if (q.type === 'LINE_ITEM_GROUP') {
        const rows = lineItemRows[q.id] || [];
        (q.lineItemConfig?.fields || []).forEach(field => {
          const values = rows
            .map(row => row[field.id])
            .filter(val => val !== undefined && val !== null && val !== '')
            .map(val => this.formatTemplateValue(val));
          if (!values.length) return;
          const joined = values.join('\n');
          this.addPlaceholderVariants(map, `${q.id}.${field.id}`, joined);
          const fieldSlug = this.slugifyPlaceholder(field.labelEn || field.id);
          this.addPlaceholderVariants(map, `${q.id}.${fieldSlug}`, joined);
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
        map[q.id] = value.map(row => (row && typeof row === 'object' ? row : {}));
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
              .map(val => this.formatTemplateValue(val))
          )
        );
        if (!unique.length) return;
        const text = unique.join(', ');
        placeholders[`{{CONSOLIDATED(${q.id}.${field.id})}}`] = text;
        const slug = this.slugifyPlaceholder(field.labelEn || field.id);
        placeholders[`{{CONSOLIDATED(${q.id}.${slug})}}`] = text;
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
      const directive = this.extractTableGroupDirective(table);
      if (directive) {
        const inserted = this.renderGroupedLineItemTables(
          body,
          childIndex,
          table,
          directive,
          groupLookup,
          lineItemRows
        );
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
    directive: { groupId: string; fieldId: string },
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
      this.replaceGroupDirectivePlaceholders(newTable, directive, groupValue);
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

  private replaceGroupDirectivePlaceholders(
    table: GoogleAppsScript.Document.Table,
    directive: { groupId: string; fieldId: string },
    groupValue: string
  ): void {
    const pattern = `(?i){{GROUP_TABLE(${directive.groupId}.${directive.fieldId})}}`;
    for (let r = 0; r < table.getNumRows(); r++) {
      const tableRow = table.getRow(r);
      for (let c = 0; c < tableRow.getNumCells(); c++) {
        tableRow.getCell(c).replaceText(pattern, groupValue || '');
      }
    }
  }

  private normalizeText(value: any): string {
    if (value === undefined || value === null) return '';
    return value.toString().trim();
  }

  private extractTableGroupDirective(
    table: GoogleAppsScript.Document.Table
  ): { groupId: string; fieldId: string } | null {
    const text = table.getText && table.getText();
    if (!text) return null;
    const match = text.match(/{{GROUP_TABLE\(([A-Z0-9_]+)\.([A-Z0-9_]+)\)}}/i);
    if (!match) return null;
    return {
      groupId: match[1].toUpperCase(),
      fieldId: match[2].toUpperCase()
    };
  }

  private renderTableRows(
    table: GoogleAppsScript.Document.Table,
    groupLookup: Record<string, QuestionConfig>,
    lineItemRows: Record<string, any[]>,
    override?: { groupId: string; rows: any[] }
  ): void {
    for (let r = 0; r < table.getNumRows(); r++) {
      const row = table.getRow(r);
      const placeholders = this.extractLineItemPlaceholders(row.getText());
      if (!placeholders.length) continue;
      const distinctGroups = Array.from(new Set(placeholders.map(p => p.groupId)));
      if (distinctGroups.length !== 1) continue;
      const groupId = distinctGroups[0];
      const group = groupLookup[groupId];
      if (!group) continue;
      const rows = override && override.groupId === group.id
        ? override.rows
        : lineItemRows[group.id];
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
          const text = this.replaceLineItemPlaceholders(template, group, dataRow);
          const cell = targetRow.getCell(c);
          cell.clear();
          cell.appendParagraph(text || '');
        }
      });
      r += rows.length - 1;
    }
  }

  private extractLineItemPlaceholders(text: string): Array<{ groupId: string; fieldId: string }> {
    const matches: Array<{ groupId: string; fieldId: string }> = [];
    if (!text) return matches;
    const pattern = /{{([A-Z0-9_]+)\.([A-Z0-9_]+)}}/gi;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      matches.push({ groupId: match[1].toUpperCase(), fieldId: match[2].toUpperCase() });
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
    rowData: Record<string, any>
  ): string {
    if (!template) return '';
    const normalizedGroupId = group.id.toUpperCase();
    const replacements: Record<string, string> = {};
    (group.lineItemConfig?.fields || []).forEach(field => {
      const text = this.formatTemplateValue(rowData ? rowData[field.id] : '');
      const tokens = [
        `${normalizedGroupId}.${field.id.toUpperCase()}`,
        `${normalizedGroupId}.${this.slugifyPlaceholder(field.labelEn || field.id)}`
      ];
      tokens.forEach(token => {
        replacements[token] = text;
      });
    });
    return template.replace(/{{([A-Z0-9_]+)\.([A-Z0-9_]+)}}/gi, (_, groupId, fieldKey) => {
      if (groupId.toUpperCase() !== normalizedGroupId) return '';
      const token = `${normalizedGroupId}.${fieldKey.toUpperCase()}`;
      return replacements[token] ?? '';
    });
  }

  private formatTemplateValue(value: any): string {
    if (value === undefined || value === null) return '';
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
    if (value instanceof Date) {
      return value.toISOString();
    }
    return value.toString();
  }

  private addPlaceholderVariants(map: Record<string, string>, key: string, value: any): void {
    if (!key) return;
    const keys = this.buildPlaceholderKeys(key);
    const text = this.formatTemplateValue(value);
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
