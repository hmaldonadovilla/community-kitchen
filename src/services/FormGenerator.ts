import { Dashboard } from '../config/Dashboard';
import { ConfigSheet } from '../config/ConfigSheet';
import { ConfigValidator } from '../config/ConfigValidator';
import { FormConfig, FormResult, QuestionConfig } from '../types';
import { WebFormService } from './WebFormService';
import { buildResponsesRecordSchema, normalizeHeaderToken, parseHeaderKey, sanitizeHeaderCellText } from './webform/recordSchema';

export class FormGenerator {
  private ss: GoogleAppsScript.Spreadsheet.Spreadsheet;
  private dashboard: Dashboard;

  constructor(ss: GoogleAppsScript.Spreadsheet.Spreadsheet) {
    this.ss = ss;
    this.dashboard = new Dashboard(ss);
    // Enforce UK locale to ensure dd/mm/yyyy date format
    this.ss.setSpreadsheetLocale('en_GB');
  }

  public setup(): void {
    // Dashboard is created in constructor if needed
    
    // 1. Create the default example if it doesn't exist (this ensures the dashboard has at least one entry if empty)
    const exampleRows = [
      ['DATE', 'Date', 'Date Activité', 'Datum', true, '', '', '', 'Active'],
      ['TEXT', 'Recorded By', 'Enregistré par', 'Opgenomen door', true, '', '', '', 'Active'],
      ['NUMBER', 'Temperature (°C)', 'Température (°C)', 'Temperatuur (°C)', true, '', '', '', 'Active'],
      ['CHOICE', 'Cleanliness Status', 'État de propreté', 'Schoonmaakstatus', true, 'Clean, Needs Attention', 'Propre, Nécessite attention', 'Schoon, Aandacht nodig', 'Active']
    ];
    ConfigSheet.setupExample(this.ss, 'Config: Example', exampleRows);

    // 2. Scan the dashboard for any other manually added forms and create their config sheets
    const forms = this.dashboard.getForms();
    forms.forEach(form => {
      // We use the same example rows as a template for new sheets
      // ConfigSheet.setupExample checks if sheet exists, so it won't overwrite
      ConfigSheet.setupExample(this.ss, form.configSheet, exampleRows);
    });
  }

  public createAllForms(): string[] {
    const forms = this.dashboard.getForms();
    const results: string[] = [];
    const baseAppUrl = this.dashboard.getWebAppUrl() || '';

    forms.forEach(config => {
      try {
        const result = this.generateSingleForm(config, baseAppUrl);
        this.dashboard.updateFormDetails(config.rowIndex, result.appUrl);
        const appUrlMsg = result.appUrl ? ` | App URL: ${result.appUrl}` : '';
        results.push(`${config.title}: Destination ready (${result.destinationTab})${appUrlMsg}`);
      } catch (e: any) {
        results.push(`${config.title}: ERROR - ${e.message}`);
      }
    });

    try {
      WebFormService.invalidateServerCache('createAllForms');
    } catch (_) {
      // Best-effort cache invalidation; continue even if it fails.
    }

    return results;
  }

  public translateAllResponses(): string[] {
    const forms = this.dashboard.getForms();
    return forms.map(config => `${config.title}: Skipped (responses already stored in destination tab)`);
  }

  private generateSingleForm(config: FormConfig, baseAppUrl: string): FormResult {
    const questions = ConfigSheet.getQuestions(this.ss, config.configSheet).filter(q => q.status === 'Active');

    // Validate configuration before creating destination
    const errors = ConfigValidator.validate(questions, config.configSheet);
    if (errors.length > 0) {
      const errorMessage = `Configuration errors found:\n\n${errors.join('\n\n')}`;
      throw new Error(errorMessage);
    }

    if (questions.length === 0) throw new Error('No active questions found.');

    const destinationTabName = config.destinationTab || `${config.title} Responses`;
    const sheet = this.ensureDestinationTab(destinationTabName, questions);
    const appUrl = baseAppUrl ? `${baseAppUrl}?form=${encodeURIComponent(config.configSheet || config.title)}` : undefined;

    return {
      destinationTab: sheet.getName(),
      appUrl
    };
  }

  private ensureDestinationTab(destinationTab: string, questions: QuestionConfig[]): GoogleAppsScript.Spreadsheet.Sheet {
    let sheet = this.ss.getSheetByName(destinationTab);
    if (!sheet) {
      sheet = this.ss.insertSheet(destinationTab);
    }

    const metaHeaders = ['Record ID', 'Created At', 'Updated At', 'Status', 'PDF URL'];
    const lastColumn = Math.max(sheet.getLastColumn(), 1);
    const existingRow = sheet.getRange(1, 1, 1, lastColumn).getValues()[0] || [];
    const rawExistingHeaders = existingRow.map(h => (h || '').toString().trim());
    const existingHeaders = rawExistingHeaders.map(h => sanitizeHeaderCellText(h));
    const normalizedExisting = existingHeaders.map(h => normalizeHeaderToken(h));
    const hasTimestamp = normalizedExisting.some(h => h === 'timestamp');
    const hasMeaningfulHeaders = normalizedExisting.some(h => !!h);

    const schema = buildResponsesRecordSchema(questions);

    const labelCounts = (() => {
      const counts: Record<string, number> = {};
      questions
        .filter(q => q && q.type !== 'BUTTON')
        .forEach(q => {
          const key = normalizeHeaderToken((q.qEn || '').toString());
          if (!key) return;
          counts[key] = (counts[key] || 0) + 1;
        });
      return counts;
    })();

    const headers: string[] = hasMeaningfulHeaders ? [...existingHeaders] : [];

    const headerInfo = () =>
      headers.map(h => {
        const parsed = parseHeaderKey(h);
        return {
          rawNorm: normalizeHeaderToken(parsed.raw),
          keyNorm: parsed.key ? normalizeHeaderToken(parsed.key) : undefined
        };
      });

    const ensureHeader = (label: string) => {
      const target = normalizeHeaderToken(label);
      const infos = headerInfo();
      if (infos.some(h => h.rawNorm === target)) return;
      headers.push(label);
    };

    if (hasTimestamp) ensureHeader('Timestamp');
    if (!headers.length) headers.push('Language');
    else ensureHeader('Language');

    const fieldColumns: Record<string, number> = {};
    schema.forEach(field => {
      const idNorm = normalizeHeaderToken(field.id);
      const infos = headerInfo();

      const byKey = infos.findIndex(h => h.keyNorm === idNorm);
      if (byKey >= 0) {
        fieldColumns[field.id] = byKey + 1;
        return;
      }
      const byId = infos.findIndex(h => h.rawNorm === idNorm);
      if (byId >= 0) {
        headers[byId] = field.header;
        fieldColumns[field.id] = byId + 1;
        return;
      }
      const labelKey = normalizeHeaderToken(field.label);
      if (labelKey && labelCounts[labelKey] === 1) {
        const matches = infos
          .map((h, idx) => ({ h, idx }))
          .filter(entry => entry.h.rawNorm === labelKey)
          .map(entry => entry.idx);
        if (matches.length === 1) {
          const idx = matches[0];
          headers[idx] = field.header;
          fieldColumns[field.id] = idx + 1;
          return;
        }
      }
      headers.push(field.header);
      fieldColumns[field.id] = headers.length;
    });

    metaHeaders.forEach(ensureHeader);

    const headersChanged =
      headers.length !== rawExistingHeaders.length ||
      headers.some((h, idx) => (h || '') !== (rawExistingHeaders[idx] || ''));
    if (headersChanged) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    }

    return sheet;
  }
}
