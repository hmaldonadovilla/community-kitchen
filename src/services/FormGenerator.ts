import { Dashboard } from '../config/Dashboard';
import { ConfigSheet } from '../config/ConfigSheet';
import { ConfigValidator } from '../config/ConfigValidator';
import { FormBuilder } from './FormBuilder';
import { ResponseNormalizer } from './ResponseNormalizer';
import { FormConfig, FormResult } from '../types';

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
    // Create example sheets
    const exampleRows = [
      ['DATE', 'Date', 'Date Activité', 'Datum', true, '', '', '', 'Active'],
      ['TEXT', 'Recorded By', 'Enregistré par', 'Opgenomen door', true, '', '', '', 'Active'],
      ['NUMBER', 'Temperature (°C)', 'Température (°C)', 'Temperatuur (°C)', true, '', '', '', 'Active'],
      ['CHOICE', 'Cleanliness Status', 'État de propreté', 'Schoonmaakstatus', true, 'Clean, Needs Attention', 'Propre, Nécessite attention', 'Schoon, Aandacht nodig', 'Active']
    ];
    ConfigSheet.setupExample(this.ss, 'Config: Example', exampleRows);
  }

  public createAllForms(): string[] {
    const forms = this.dashboard.getForms();
    const results: string[] = [];

    forms.forEach(config => {
      try {
        const result = this.generateSingleForm(config);
        this.dashboard.updateFormDetails(config.rowIndex, result.id, result.editUrl, result.publishedUrl);
        results.push(`${config.title}: Success`);
      } catch (e: any) {
        results.push(`${config.title}: ERROR - ${e.message}`);
      }
    });

    return results;
  }

  public translateAllResponses(): string[] {
    const forms = this.dashboard.getForms();
    const results: string[] = [];

    forms.forEach(config => {
      try {
        const questions = ConfigSheet.getQuestions(this.ss, config.configSheet);
        
        if (!config.destinationTab) {
          results.push(`${config.title}: Skipped (no destination tab configured)`);
          return;
        }
        
        const normalizer = new ResponseNormalizer(this.ss);
        // Use normalize() instead of translateResponses() to ensure we fetch fresh data
        // from the raw sheet (via formulas) before translating and freezing values.
        normalizer.normalize(config.destinationTab, questions);
        
        results.push(`${config.title}: Refreshed & Translated successfully`);
      } catch (e: any) {
        results.push(`${config.title}: ERROR - ${e.message}`);
      }
    });

    return results;
  }

  private generateSingleForm(config: FormConfig): FormResult {
    const questions = ConfigSheet.getQuestions(this.ss, config.configSheet);
    
    // Validate configuration before creating form
    const errors = ConfigValidator.validate(questions, config.configSheet);
    if (errors.length > 0) {
      const errorMessage = `Configuration errors found:\n\n${errors.join('\n\n')}`;
      throw new Error(errorMessage);
    }
    
    if (questions.length === 0) throw new Error('No questions found.');

    let form: GoogleAppsScript.Forms.Form;
    let isNew = false;

    if (config.formId) {
      try {
        form = FormApp.openById(config.formId);
      } catch (e) {
        form = FormApp.create(config.title);
        isNew = true;
      }
    } else {
      form = FormApp.create(config.title);
      isNew = true;
    }

    form.setTitle(config.title);
    form.setDescription(config.description);

    let destinationTabName = config.destinationTab;

    if (isNew) {
      const oldSheets = this.ss.getSheets().map((s: GoogleAppsScript.Spreadsheet.Sheet) => s.getName());
      form.setDestination(FormApp.DestinationType.SPREADSHEET, this.ss.getId());
      SpreadsheetApp.flush();
      const newSheets = this.ss.getSheets();
      const newSheet = newSheets.find((s: GoogleAppsScript.Spreadsheet.Sheet) => !oldSheets.includes(s.getName()));

      if (newSheet && config.destinationTab) {
        if (this.ss.getSheetByName(destinationTabName)) {
          destinationTabName = destinationTabName + ' (New)';
        }
        newSheet.setName(destinationTabName);
      }
    } else {
        // Ensure destination tab name is correct for normalization
        // If not new, we assume the user hasn't renamed the tab manually or we use the config one
        // But we can't easily find which tab is linked if we didn't just create it.
        // We'll assume the config.destinationTab is the one.
    }

    const builder = new FormBuilder(form);
    // builder.clearItems(); // No longer clearing!
    builder.updateForm(questions);

    // Normalize Responses
    if (destinationTabName) {
        SpreadsheetApp.flush(); // Ensure new columns are visible
        const normalizer = new ResponseNormalizer(this.ss);
        normalizer.normalize(destinationTabName, questions);
    }

    return {
      id: form.getId(),
      editUrl: form.getEditUrl(),
      publishedUrl: form.getPublishedUrl()
    };
  }
}
