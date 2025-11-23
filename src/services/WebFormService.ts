import { Dashboard } from '../config/Dashboard';
import { ConfigSheet } from '../config/ConfigSheet';
import { buildWebFormHtml } from './WebFormTemplate';
import {
  FormConfig,
  QuestionConfig,
  WebFormDefinition,
  WebFormSubmission,
  WebQuestionDefinition
} from '../types';

/**
 * WebFormService generates a custom HTML web form (Apps Script Web App)
 * from the same spreadsheet configuration used for Google Forms.
 * It also handles submissions and writes responses directly into the destination tab.
 */
export class WebFormService {
  private ss: GoogleAppsScript.Spreadsheet.Spreadsheet;
  private dashboard: Dashboard;

  constructor(ss: GoogleAppsScript.Spreadsheet.Spreadsheet) {
    this.ss = ss;
    this.dashboard = new Dashboard(ss);
  }

  public buildDefinition(formKey?: string): WebFormDefinition {
    const form = this.findForm(formKey);
    const questions = ConfigSheet.getQuestions(this.ss, form.configSheet).filter(q => q.status === 'Active');

    const webQuestions: WebQuestionDefinition[] = questions.map(q => ({
      id: q.id,
      type: q.type,
      label: {
        en: q.qEn,
        fr: q.qFr,
        nl: q.qNl
      },
      required: q.required,
      options: q.options.length || q.optionsFr.length || q.optionsNl.length ? {
        en: q.options,
        fr: q.optionsFr,
        nl: q.optionsNl
      } : undefined,
      lineItemConfig: q.lineItemConfig,
      uploadConfig: q.uploadConfig,
      optionFilter: q.optionFilter,
      validationRules: q.validationRules
    }));

    return {
      title: form.title,
      description: form.description,
      destinationTab: form.destinationTab || `${form.title} Responses`,
      languages: ['EN', 'FR', 'NL'],
      questions: webQuestions
    };
  }

  public renderForm(formKey?: string): GoogleAppsScript.HTML.HtmlOutput {
    const def = this.buildDefinition(formKey);
    const targetKey = formKey || def.title;
    const html = this.buildTemplate(def, targetKey);
    const output = HtmlService.createHtmlOutput(html);
    output.setTitle(def.title || 'Form');
    return output;
  }

  public submitWebForm(formObject: any): { success: boolean; message: string } {
    const formKey = (formObject.formKey || formObject.form || '').toString();
    const languageRaw = (formObject.language || 'EN').toString().toUpperCase();
    const language = (['EN', 'FR', 'NL'].includes(languageRaw) ? languageRaw : 'EN') as 'EN' | 'FR' | 'NL';

    const form = this.findForm(formKey);
    const questions = ConfigSheet.getQuestions(this.ss, form.configSheet).filter(q => q.status === 'Active');
    const sheet = this.ensureDestination(form.destinationTab || `${form.title} Responses`, questions);

    const row: any[] = [new Date(), language];

    questions.forEach(q => {
      let value: any = '';

      if (q.type === 'LINE_ITEM_GROUP') {
        const rawLineItems = formObject[`${q.id}_json`] || formObject[q.id];
        if (rawLineItems && typeof rawLineItems === 'string') {
          value = rawLineItems;
        } else if (rawLineItems) {
          try {
            value = JSON.stringify(rawLineItems);
          } catch (_) {
            value = '';
          }
        }
      } else if (q.type === 'FILE_UPLOAD') {
        value = this.saveFiles(formObject[q.id], q.uploadConfig);
      } else {
        value = formObject[q.id];
        if (Array.isArray(value)) {
          value = value.join(', ');
        }
      }

      row.push(value ?? '');
    });

    sheet.appendRow(row);
    return { success: true, message: 'Saved to sheet' };
  }

  private findForm(formKey?: string): FormConfig {
    const forms = this.dashboard.getForms();
    if (!forms.length) throw new Error('No forms configured. Run setup first.');
    if (!formKey) return forms[0];

    const match = forms.find(f => f.configSheet === formKey || f.title.toLowerCase() === formKey.toLowerCase());
    if (!match) {
      throw new Error(`Form "${formKey}" not found in dashboard.`);
    }
    return match;
  }

  private ensureDestination(destinationTab: string, questions: QuestionConfig[]): GoogleAppsScript.Spreadsheet.Sheet {
    let sheet = this.ss.getSheetByName(destinationTab);
    if (!sheet) {
      sheet = this.ss.insertSheet(destinationTab);
    }

    const headers = ['Timestamp', 'Language', ...questions.map(q => q.qEn)];
    const existing = sheet.getRange(1, 1, 1, headers.length).getValues()[0];

    const needsHeader = existing.filter(v => v).length === 0;
    if (needsHeader) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    } else {
      // Ensure all headers exist by appending missing ones
      headers.forEach((h, idx) => {
        const current = existing[idx];
        if (!current) {
          sheet.getRange(1, idx + 1).setValue(h).setFontWeight('bold');
        }
      });
    }

    return sheet;
  }

  private saveFiles(files: any, uploadConfig?: QuestionConfig['uploadConfig']): string {
    if (!files) return '';
    const fileArray = Array.isArray(files) ? files : [files];
    const limitedFiles = uploadConfig?.maxFiles ? fileArray.slice(0, uploadConfig.maxFiles) : fileArray;

    const folder = this.getUploadFolder(uploadConfig);
    const urls: string[] = [];

    limitedFiles.forEach(file => {
      if (!file) return;

      const name = typeof file.getName === 'function' ? file.getName() : undefined;
      if (uploadConfig?.allowedExtensions && name) {
        const lower = name.toLowerCase();
        const allowed = uploadConfig.allowedExtensions.map(ext => ext.toLowerCase().replace('.', ''));
        const isAllowed = allowed.some(ext => lower.endsWith(ext));
        if (!isAllowed) return;
      }

      if (uploadConfig?.maxFileSizeMb && typeof file.getBytes === 'function') {
        const sizeMb = file.getBytes().length / (1024 * 1024);
        if (sizeMb > uploadConfig.maxFileSizeMb) return;
      }

      const created = folder.createFile(file);
      urls.push(created.getUrl());
    });

    return urls.join(', ');
  }

  private getUploadFolder(uploadConfig?: QuestionConfig['uploadConfig']): GoogleAppsScript.Drive.Folder {
    if (uploadConfig?.destinationFolderId) {
      return DriveApp.getFolderById(uploadConfig.destinationFolderId);
    }

    const file = DriveApp.getFileById(this.ss.getId());
    const parents = file.getParents();
    if (parents.hasNext()) return parents.next();
    return DriveApp.getRootFolder();
  }

  private buildTemplate(def: WebFormDefinition, formKey: string): string {
    return buildWebFormHtml(def, formKey);
  }
}
