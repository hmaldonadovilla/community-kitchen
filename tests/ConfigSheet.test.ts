import './mocks/GoogleAppsScript';
import { ConfigSheet } from '../src/config/ConfigSheet';
import { MockSpreadsheet, MockSheet } from './mocks/GoogleAppsScript';

describe('ConfigSheet', () => {
  let mockSS: MockSpreadsheet;

  beforeEach(() => {
    mockSS = new MockSpreadsheet();
  });

  test('getQuestions reads data and ensures IDs', () => {
    const sheet = mockSS.insertSheet('Config: Test');
    // Mock data with IDs (new format with 11 columns)
    const exampleRows = [
      ['ID', 'Type', 'Q En', 'Q Fr', 'Q Nl', 'Req', 'Opt En', 'Opt Fr', 'Opt Nl', 'Status', 'Edit'],
      ['Q1', 'TEXT', 'Name', 'Nom', 'Naam', true, '', '', '', 'Active', false],
      ['Q2', 'DATE', 'Date', 'Date', 'Datum', false, '', '', '', 'Active', false]
    ];
    (sheet as any).setMockData(exampleRows);

    const questions = ConfigSheet.getQuestions(mockSS as any, 'Config: Test');
    
    expect(questions).toBeDefined();
    expect(questions.length).toBe(2);
    expect(questions[0].qNl).toBe('Naam');
    expect(questions[0].required).toBe(true);
    expect(questions[0].options).toEqual([]);
  });

  test('getQuestions parses REF: syntax', () => {
    const configSheet = mockSS.insertSheet('Config: Ref');
    const exampleRows = [
      ['ID', 'Type', 'Q En', 'Q Fr', 'Q Nl', 'Req', 'Opt En', 'Opt Fr', 'Opt Nl', 'Status', 'Edit'],
      ['Q3', 'CHOICE', 'Color', 'Couleur', 'Kleur', true, 'REF:Options_Q3', '', '', 'Active', false]
    ];
    (configSheet as any).setMockData(exampleRows);

    const optionsSheet = mockSS.insertSheet('Options_Q3');
    const optionRows = [
      ['Opt En', 'Opt Fr', 'Opt Nl'],
      ['Red', 'Rouge', 'Rood'],
      ['Blue', 'Bleu', 'Blauw']
    ];
    (optionsSheet as any).setMockData(optionRows);

    const questions = ConfigSheet.getQuestions(mockSS as any, 'Config: Ref');
    
    expect(questions.length).toBe(1);
    expect(questions[0].options).toEqual(['Red', 'Blue']);
    expect(questions[0].optionsFr).toEqual(['Rouge', 'Bleu']);
    expect(questions[0].optionsNl).toEqual(['Rood', 'Blauw']);
  });

  test('handleOptionEdit creates sheet and updates config', () => {
    const configSheet = mockSS.insertSheet('Config: Edit');
    const exampleRows = [
      ['ID', 'Type', 'Q En', 'Q Fr', 'Q Nl', 'Req', 'Opt En', 'Opt Fr', 'Opt Nl', 'Status', 'Edit'],
      ['Q4', 'CHOICE', 'Size', 'Taille', 'Maat', true, '', '', '', 'Active', 'Edit'] // Selected 'Edit'
    ];
    (configSheet as any).setMockData(exampleRows);

    // Mock event object
    const e = {
      range: {
        getSheet: () => configSheet,
        getColumn: () => 11,
        getRow: () => 2,
        getValue: () => 'Edit',
        setValue: jest.fn(),
        setFormula: jest.fn()
      },
      value: 'Edit'
    };

    // Mock setValue for config update
    const spySetValue = jest.fn();
    const spySetFormula = jest.fn();
    const spyClearContent = jest.fn();
    
    // Mock getRange to return a mock object with setValue/clearContent
    configSheet.getRange = jest.fn().mockImplementation((row, col) => {
       return {
           getValue: () => {
               if (col === 1) return 'Q4'; // ID column
               if (col === 2) return 'CHOICE'; // Type column
               return null;
           },
           setValue: spySetValue,
           setFormula: spySetFormula,
           clearContent: spyClearContent,
           setFontWeight: jest.fn().mockReturnThis(),
           setValues: jest.fn().mockReturnThis()
       };
    });

    ConfigSheet.handleOptionEdit(mockSS as any, e as any);

    // Verify new sheet created
    const optionsSheet = mockSS.getSheetByName('Options_Q4');
    expect(optionsSheet).toBeDefined();
    
    // Verify config updated
    expect(spySetValue).toHaveBeenCalledWith('REF:Options_Q4');
    expect(spyClearContent).toHaveBeenCalledTimes(2); // Clear FR and NL
    
    // Verify hyperlink formula set (we can't check exact URL easily due to mock ID, but we check it was called)
    // In our mock, e.range.setFormula is called? No, we call range.setFormula in code.
    // Wait, in code: range.setFormula(formula). range is e.range.
    expect(e.range.setFormula).toHaveBeenCalledWith(expect.stringContaining('=HYPERLINK'));
  });

  test('handleOptionEdit restricts option tabs to CHOICE/CHECKBOX', () => {
    const configSheet = mockSS.insertSheet('Config: TypeCheck');
    const exampleRows = [
      ['ID', 'Type', 'Q En', 'Q Fr', 'Q Nl', 'Req', 'Opt En', 'Opt Fr', 'Opt Nl', 'Status', 'Edit'],
      ['Q5', 'TEXT', 'Name', 'Nom', 'Naam', true, '', '', '', 'Active', 'Edit'] // TEXT type
    ];
    (configSheet as any).setMockData(exampleRows);

    const e = {
      range: {
        getSheet: () => configSheet,
        getColumn: () => 11,
        getRow: () => 2,
        getValue: () => 'Edit',
        setValue: jest.fn()
      },
      value: 'Edit'
    };

    // Mock getRange to return type
    configSheet.getRange = jest.fn().mockImplementation((row, col) => {
       return {
           getValue: () => {
               if (col === 1) return 'Q5';
               if (col === 2) return 'TEXT'; // Invalid type for options
               return null;
           },
           setValue: jest.fn()
       };
    });

    // Mock SpreadsheetApp.getActiveSpreadsheet().toast
    const toastSpy = jest.fn();
    const originalGetActiveSpreadsheet = (global as any).SpreadsheetApp.getActiveSpreadsheet;
    (global as any).SpreadsheetApp.getActiveSpreadsheet = jest.fn().mockReturnValue({
      toast: toastSpy
    });

    ConfigSheet.handleOptionEdit(mockSS as any, e as any);

    // Restore mock
    (global as any).SpreadsheetApp.getActiveSpreadsheet = originalGetActiveSpreadsheet;

    // Verify no sheet created
    const optionsSheet = mockSS.getSheetByName('Options_Q5');
    expect(optionsSheet).toBeUndefined();
    
    // Verify toast called
    expect(toastSpy).toHaveBeenCalledWith(
      expect.stringContaining('only available for CHOICE and CHECKBOX'),
      expect.any(String)
    );
  });
});
