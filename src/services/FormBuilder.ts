import { QuestionConfig, QuestionType } from '../types';

export class FormBuilder {
  private form: GoogleAppsScript.Forms.Form;

  constructor(form: GoogleAppsScript.Forms.Form) {
    this.form = form;
  }

  public updateForm(questions: QuestionConfig[]): void {
    // 1. Setup Language Selection (Create if not exists)
    let mainLangItem = this.getMainLangItem();
    if (!mainLangItem) {
      mainLangItem = this.form.addMultipleChoiceItem();
      mainLangItem.setTitle('Select Language / Choisissez votre langue / Kies uw taal');
      mainLangItem.setRequired(true);
    }

    // 2. Setup Sections (Create if not exists)
    const sectionEn = this.getOrCreateSection('English');
    const sectionFr = this.getOrCreateSection('Français');
    const sectionNl = this.getOrCreateSection('Nederlands');

    // 3. Link choices
    mainLangItem.setChoices([
      mainLangItem.createChoice('English', sectionEn),
      mainLangItem.createChoice('Français', sectionFr),
      mainLangItem.createChoice('Nederlands', sectionNl)
    ]);
    
    sectionFr.setGoToPage(FormApp.PageNavigationType.SUBMIT);
    sectionNl.setGoToPage(FormApp.PageNavigationType.SUBMIT);

    // 4. Sync Questions
    // We need to handle ordering carefully.
    // Strategy:
    // 1. Identify the index of Section EN.
    // 2. Move/Create EN items after it.
    // 3. Identify the index of Section FR (which might have shifted).
    // 4. Move/Create FR items after it.
    // ...
    
    this.syncQuestionsForSection(questions, sectionEn, 'EN');
    this.syncQuestionsForSection(questions, sectionFr, 'FR');
    this.syncQuestionsForSection(questions, sectionNl, 'NL');
  }

  private getMainLangItem(): GoogleAppsScript.Forms.MultipleChoiceItem | null {
    const items = this.form.getItems(FormApp.ItemType.MULTIPLE_CHOICE);
    const item = items.find(i => i.getTitle().includes('Select Language'));
    if (!item) return null;
    return (typeof item.asMultipleChoiceItem === 'function') ? item.asMultipleChoiceItem() : item as unknown as GoogleAppsScript.Forms.MultipleChoiceItem;
  }

  private getOrCreateSection(title: string): GoogleAppsScript.Forms.PageBreakItem {
    const items = this.form.getItems(FormApp.ItemType.PAGE_BREAK);
    let sectionItem = items.find(i => i.getTitle() === title);
    let section: GoogleAppsScript.Forms.PageBreakItem;
    
    if (sectionItem) {
      section = (typeof sectionItem.asPageBreakItem === 'function') ? sectionItem.asPageBreakItem() : sectionItem as unknown as GoogleAppsScript.Forms.PageBreakItem;
    } else {
      section = this.form.addPageBreakItem();
      section.setTitle(title);
    }
    return section;
  }

  private syncQuestionsForSection(questions: QuestionConfig[], section: GoogleAppsScript.Forms.PageBreakItem, language: 'EN' | 'FR' | 'NL'): void {
    const activeQuestions = questions.filter(q => q.status === 'Active');
    
    let currentIndex = section.getIndex() + 1;
    
    for (const q of activeQuestions) {
      // Get language-specific options
      const options = language === 'EN' ? q.options : language === 'FR' ? q.optionsFr : q.optionsNl;
      const title = language === 'EN' ? q.qEn : language === 'FR' ? q.qFr : q.qNl;
      
      const helpText = `ID:${q.id}|LANG:${language}`;
      const existingItem = this.findItemByHelpText(helpText);
      
      let item: GoogleAppsScript.Forms.Item;
      
      if (existingItem) {
        this.updateItem(existingItem, q.type, title, q.required, options); // Adjusted call to match updateItem signature
        item = existingItem;
      } else {
        item = this.createItem(q.type, title, q.required, options);
        item.setHelpText(helpText);
      }
      
      // Move item to the correct position
      // We want it at currentIndex
      // Note: Using item object directly caused signature mismatch errors.
      // Using indices is safer: moveItem(fromIndex, toIndex)
      this.form.moveItem(item.getIndex(), currentIndex);
      currentIndex++;
    }
    
    // Archive: Remove items that are no longer active or no longer in the question list
    const allItems = this.form.getItems();
    for (const item of allItems) {
      const ht = item.getHelpText();
      if (ht && ht.includes(`LANG:${language}`)) {
        const idMatch = ht.match(/ID:([^|]+)/);
        if (idMatch) {
          const itemId = idMatch[1];
          const q = questions.find(q => q.id === itemId);
          if (!q || q.status === 'Archived') {
            this.form.deleteItem(item);
          }
        }
      }
    }
  }

  private findItemByHelpText(helpText: string): GoogleAppsScript.Forms.Item | null {
    const items = this.form.getItems();
    return items.find(i => i.getHelpText() === helpText) || null;
  }

  private createItem(type: QuestionType, title: string, required: boolean, options: string[]): GoogleAppsScript.Forms.Item {
    let item: GoogleAppsScript.Forms.Item;
    switch (type) {
      case 'DATE': 
        const dateItem = this.form.addDateItem();
        dateItem.setRequired(required);
        item = dateItem as unknown as GoogleAppsScript.Forms.Item;
        break;
      case 'TEXT': 
        const textItem = this.form.addTextItem();
        textItem.setRequired(required);
        item = textItem as unknown as GoogleAppsScript.Forms.Item;
        break;
      case 'PARAGRAPH': 
        const paraItem = this.form.addParagraphTextItem();
        paraItem.setRequired(required);
        item = paraItem as unknown as GoogleAppsScript.Forms.Item;
        break;
      case 'NUMBER': 
        const numItem = this.form.addTextItem(); 
        numItem.setValidation(FormApp.createTextValidation().requireNumber().build());
        numItem.setRequired(required);
        item = numItem as unknown as GoogleAppsScript.Forms.Item;
        break;
      case 'CHOICE': 
        const choiceItem = this.form.addMultipleChoiceItem(); 
        if (options.length) choiceItem.setChoiceValues(options);
        choiceItem.setRequired(required);
        item = choiceItem as unknown as GoogleAppsScript.Forms.Item;
        break;
      case 'CHECKBOX': 
        const checkItem = this.form.addCheckboxItem(); 
        if (options.length) checkItem.setChoiceValues(options);
        checkItem.setRequired(required);
        item = checkItem as unknown as GoogleAppsScript.Forms.Item;
        break;
      default: 
        const defItem = this.form.addTextItem();
        defItem.setRequired(required);
        item = defItem as unknown as GoogleAppsScript.Forms.Item;
    }
    item.setTitle(title);
    return item;
  }

  private updateItem(item: GoogleAppsScript.Forms.Item, type: QuestionType, title: string, required: boolean, options: string[]): void {
    item.setTitle(title);
    
    if (item.getType() === FormApp.ItemType.TEXT) {
        const textItem = (typeof item.asTextItem === 'function') ? item.asTextItem() : item as unknown as GoogleAppsScript.Forms.TextItem;
        textItem.setRequired(required);
    } else if (item.getType() === FormApp.ItemType.MULTIPLE_CHOICE) {
        const mcItem = (typeof item.asMultipleChoiceItem === 'function') ? item.asMultipleChoiceItem() : item as unknown as GoogleAppsScript.Forms.MultipleChoiceItem;
        mcItem.setRequired(required);
        if (options.length) mcItem.setChoiceValues(options);
    } else if (item.getType() === FormApp.ItemType.CHECKBOX) {
        const cbItem = (typeof item.asCheckboxItem === 'function') ? item.asCheckboxItem() : item as unknown as GoogleAppsScript.Forms.CheckboxItem;
        cbItem.setRequired(required);
        if (options.length) cbItem.setChoiceValues(options);
    } else if (item.getType() === FormApp.ItemType.DATE) {
        const dateItem = (typeof item.asDateItem === 'function') ? item.asDateItem() : item as unknown as GoogleAppsScript.Forms.DateItem;
        dateItem.setRequired(required);
    } else if (item.getType() === FormApp.ItemType.PARAGRAPH_TEXT) {
        const paraItem = (typeof item.asParagraphTextItem === 'function') ? item.asParagraphTextItem() : item as unknown as GoogleAppsScript.Forms.ParagraphTextItem;
        paraItem.setRequired(required);
    }
  }
}
