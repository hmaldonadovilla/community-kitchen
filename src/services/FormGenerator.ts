import { Dashboard } from '../config/Dashboard';
import { ConfigSheet } from '../config/ConfigSheet';
import { ConfigValidator } from '../config/ConfigValidator';
import { FormConfig, FormResult, QuestionConfig } from '../types';

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
    const baseAppUrl = ScriptApp.getService().getUrl() || '';

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

    const headers = ['Timestamp', 'Language', ...questions.map(q => q.qEn || q.id)];
    const headerRange = sheet.getRange(1, 1, 1, headers.length);
    const existing = headerRange.getValues()[0];
    const needsHeader = existing.filter(v => v).length === 0;

    if (needsHeader) {
      headerRange.setValues([headers]).setFontWeight('bold');
    } else {
      headers.forEach((h, idx) => {
        const current = existing[idx];
        if (!current) {
          sheet.getRange(1, idx + 1).setValue(h).setFontWeight('bold');
        }
      });
    }

    return sheet;
  }
}
