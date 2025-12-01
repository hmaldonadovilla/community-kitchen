// Mock implementation for Google Apps Script classes

export class MockRange {
  private values: any[][];
  
  constructor(values: any[][]) { 
    this.values = values || [[]]; // Ensure values is never undefined
  }
  
  getValues = () => {
    return this.values;
  }
  
  setValue = (val: any) => {
    return this;
  }
  
  setValues = (vals: any[][]) => {
    this.values = vals;
    return this;
  }
  
  setFontWeight = (w: string) => { return this; }
  setBackground = (c: string) => { return this; }
  setFontSize = (s: number) => { return this; }
  setDataValidation = (r: any) => { return this; }
  setFormula = (f: string) => { return this; }
  setNumberFormat = (f: string) => { return this; }
}

export class MockSheet {
  private name: string;
  private data: any[][] = [];
  
  constructor(name: string) { this.name = name; }
  
  getName() { return this.name; }
  setName(n: string) { this.name = n; }
  getSheetId() { return 0; }
  
  getRange(row: any, col?: number, numRows: number = 1, numCols: number = 1) {
    if (typeof row === 'string') {
      const rangeObj: any = {
        getValues: () => [[]],
        setValue: () => rangeObj,
        setValues: () => rangeObj,
        setFontWeight: () => rangeObj,
        setBackground: () => rangeObj,
        setFontSize: () => rangeObj,
        setDataValidation: () => rangeObj,
        setFormula: () => rangeObj,
        setNumberFormat: () => rangeObj
      };
      return rangeObj;
    }
    const colIndex = col ?? 1;
    // Return plain object with all methods to avoid binding issues
    // IMPORTANT: Chaining methods must return the range object, NOT 'this' (the Sheet)
    const rangeObj: any = {
      getValues: () => {
        if (this.data.length === 0) return [[]];
        const startRow = row - 1;
        const endRow = startRow + numRows;
        const startCol = colIndex - 1;
        const endCol = startCol + numCols;
        return this.data.slice(startRow, endRow).map(r => r.slice(startCol, endCol));
      },
      setValue: (val: any) => {
        this.ensureSize(row + numRows - 1, colIndex + numCols - 1);
        this.data[row - 1][colIndex - 1] = val;
        return rangeObj;
      },
      setValues: (vals: any[][]) => { 
        this.ensureSize(row + vals.length - 1, colIndex + (vals[0]?.length || 1) - 1);
        vals.forEach((r, rIdx) => {
          r.forEach((c, cIdx) => {
            this.data[row - 1 + rIdx][colIndex - 1 + cIdx] = c;
          });
        });
        return rangeObj; 
      },
      setFontWeight: (w: string) => rangeObj,
      setBackground: (c: string) => rangeObj,
      setFontSize: (s: number) => rangeObj,
      setDataValidation: (r: any) => rangeObj,
      setFormula: (f: string) => rangeObj,
      setNumberFormat: (f: string) => rangeObj
    };
    return rangeObj;
  }
  
  getLastRow() { return this.data.length > 0 ? this.data.length : 10; }
  getLastColumn() { return this.data[0]?.length || 10; }
  getMaxRows() { return 1000; }
  setColumnWidth(c: number, w: number) { }
  clear() { }
  hideSheet() { }
  hideColumns(col: number, num: number) { }
  activate() { return this; }
  appendRow(row: any[]) { this.data.push(row); }
  getValues() { return this.data; }
  private ensureSize(targetRow: number, targetCol: number) {
    while (this.data.length < targetRow) {
      this.data.push([]);
    }
    this.data = this.data.map(r => {
      while (r.length < targetCol) r.push('');
      return r;
    });
  }
  
  setMockData(data: any[][]) { this.data = data; }
}

export class MockSpreadsheet {
  private sheets: MockSheet[] = [];
  getSheetByName(name: string) { return this.sheets.find(s => s.getName() === name); }
  insertSheet(name: string) { 
    const s = new MockSheet(name);
    this.sheets.push(s);
    return s;
  }
  getSheets() { return this.sheets; }
  getId() { return 'mock-ss-id'; }
  setSpreadsheetLocale(locale: string) { }
}

export class MockFormItem {
  private title: string = '';
  private helpText: string = '';
  private type: any = 'TEXT'; // Default
  
  setTitle(t: string) { this.title = t; return this; }
  getTitle() { return this.title; }
  setRequired(r: boolean) { return this; }
  setValidation(v: any) { return this; }
  setChoiceValues(v: string[]) { return this; }
  setChoices(c: any[]) { return this; }
  setHelpText(t: string) { this.helpText = t; return this; }
  getHelpText() { return this.helpText; }
  getType() { return this.type; }
  getIndex() { return 0; }
  createChoice(value: string, navigationItem?: any) { return { getValue: () => value, getPageNavigationType: () => navigationItem }; }
  
  asMultipleChoiceItem() { return this; }
  asPageBreakItem() { return this; }
  asTextItem() { return this; }
  asDateItem() { return this; }
  asCheckboxItem() { return this; }
  asParagraphTextItem() { return this; }
}

export class MockPageBreakItem extends MockFormItem {
  setGoToPage(p: any) { return this; }
}

export class MockForm {
  private items: MockFormItem[] = [];
  
  setTitle(t: string) { }
  setDescription(d: string) { }
  setDestination(t: any, id: string) { }
  getId() { return 'mock-form-id'; }
  getEditUrl() { return 'http://edit'; }
  getPublishedUrl() { return 'http://published'; }
  
  getItems(type?: any) { return this.items; }
  deleteItem(i: any) { }
  moveItem(item: any, index: number) { }
  
  addMultipleChoiceItem() { const i = new MockFormItem(); this.items.push(i); return i; }
  addPageBreakItem() { const i = new MockPageBreakItem(); this.items.push(i); return i; }
  addDateItem() { const i = new MockFormItem(); this.items.push(i); return i; }
  addTextItem() { const i = new MockFormItem(); this.items.push(i); return i; }
  addParagraphTextItem() { const i = new MockFormItem(); this.items.push(i); return i; }
  addCheckboxItem() { const i = new MockFormItem(); this.items.push(i); return i; }
}

export class MockFolder {
  createFile(blob: any) { 
    return { getUrl: () => 'http://file-url', getName: () => (blob?.getName ? blob.getName() : 'file') }; 
  }
}

export class MockFile {
  getParents() {
    let used = false;
    return {
      hasNext: () => !used,
      next: () => { used = true; return new MockFolder(); }
    };
  }
}

// Mock Globals
(global as any).SpreadsheetApp = {
  getActiveSpreadsheet: () => {
    const ss = new MockSpreadsheet();
    (ss as any).toast = jest.fn(); // Add toast mock
    return ss;
  },
  newDataValidation: () => {
    const builder = {
      requireValueInList: () => builder,
      requireCheckbox: () => builder,
      setAllowInvalid: () => builder,
      build: () => {}
    };
    return builder;
  },
  getUi: () => ({ 
    alert: jest.fn(), 
    showModalDialog: jest.fn(),
    createMenu: () => ({ addItem: () => ({ addItem: () => ({ addToUi: () => {} }) }) })
  }),
  flush: () => {}
};

(global as any).Logger = {
  log: jest.fn(),
  clear: jest.fn(),
  getLog: jest.fn(() => '')
};

(global as any).FormApp = {
  create: () => new MockForm(),
  openById: () => new MockForm(),
  DestinationType: { SPREADSHEET: 'SPREADSHEET' },
  PageNavigationType: { SUBMIT: 'SUBMIT' },
  ItemType: { 
    MULTIPLE_CHOICE: 'MULTIPLE_CHOICE', 
    PAGE_BREAK: 'PAGE_BREAK', 
    TEXT: 'TEXT',
    CHECKBOX: 'CHECKBOX',
    DATE: 'DATE',
    PARAGRAPH_TEXT: 'PARAGRAPH_TEXT'
  },
  createTextValidation: () => ({ requireNumber: () => ({ build: () => {} }) })
};

(global as any).HtmlService = {
  createHtmlOutput: () => ({ setWidth: () => ({ setHeight: () => {} }) })
};

(global as any).DriveApp = {
  getFolderById: () => new MockFolder(),
  getFileById: () => new MockFile(),
  getRootFolder: () => new MockFolder()
};

const createMockTableCell = () => ({
  getText: () => '',
  clear: jest.fn(),
  appendParagraph: jest.fn(),
  replaceText: jest.fn()
});

const createMockTableRow = () => ({
  getText: () => '',
  getNumCells: () => 0,
  getCell: () => createMockTableCell(),
  appendTableCell: jest.fn()
});

const createMockTable = () => {
  const table: any = {
    copy: jest.fn(() => createMockTable()),
    getText: () => '',
    getNumRows: () => 0,
    getRow: () => createMockTableRow(),
    insertTableRow: jest.fn(() => createMockTableRow()),
    removeFromParent: jest.fn()
  };
  return table;
};

const createMockBody = () => {
  const body: any = {
    getText: () => '',
    replaceText: jest.fn(),
    getTables: () => [],
    getNumChildren: () => 0,
    getChild: () => null,
    getChildIndex: () => 0,
    insertTable: jest.fn(() => createMockTable()),
    removeChild: jest.fn()
  };
  return body;
};

const mockBodyInstance = createMockBody();

(global as any).DocumentApp = {
  ElementType: { TABLE: 'TABLE' },
  openById: jest.fn(() => ({
    getBody: () => mockBodyInstance,
    saveAndClose: jest.fn()
  }))
};

(global as any).GmailApp = {
  sendEmail: jest.fn()
};

(global as any).Utilities = {
  sleep: jest.fn()
};
