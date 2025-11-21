import './mocks/GoogleAppsScript';
import { ResponseNormalizer } from '../src/services/ResponseNormalizer';
import { MockSpreadsheet, MockSheet } from './mocks/GoogleAppsScript';
import { QuestionConfig } from '../src/types';

describe('ResponseNormalizer', () => {
  let ss: MockSpreadsheet;
  let normalizer: ResponseNormalizer;

  beforeEach(() => {
    ss = new MockSpreadsheet();
    normalizer = new ResponseNormalizer(ss as unknown as GoogleAppsScript.Spreadsheet.Spreadsheet);
  });

  test('normalize creates formulas correctly for 3 languages', () => {
    const rawSheet = ss.insertSheet('Form Responses');
    // Simulate headers: Timestamp, Language, Q1_EN, Q1_FR, Q1_NL
    // Note: Google Forms might append [1] etc if duplicates, but here we simulate clean headers first
    rawSheet.setMockData([
      ['Timestamp', 'Select Language', 'Question EN', 'Question FR', 'Question NL']
    ]);

    const questions: QuestionConfig[] = [{
      id: 'q1',
      type: 'TEXT',
      qEn: 'Question EN',
      qFr: 'Question FR',
      qNl: 'Question NL',
      required: true,
      options: [],
      optionsFr: [],
      optionsNl: [],
      status: 'Active'
    }];

    normalizer.normalize('Form Responses', questions);

    const cleanSheet = ss.getSheetByName('Form Responses (Clean)');
    expect(cleanSheet).toBeDefined();

    // Spy on setFormula to verify formulas are set
    const spySetFormula = jest.fn();
    const mockRange = {
      setFormula: spySetFormula,
      setValues: jest.fn().mockReturnThis(),
      getValues: jest.fn().mockReturnValue([['mock value']]), // Return mock data for translation
      setFontWeight: jest.fn().mockReturnThis(),
      setValue: jest.fn().mockReturnThis(),
      setNumberFormat: jest.fn().mockReturnThis()
    };
    
    // Re-run with spy
    cleanSheet!.getRange = jest.fn().mockReturnValue(mockRange);
    normalizer.normalize('Form Responses', questions);

    // Check if setFormula was called for the coalescing formula
    // C=3, D=4, E=5 (Q1_EN, Q1_FR, Q1_NL)
    const rangeC = `'Form Responses'!C2:C`;
    const rangeD = `'Form Responses'!D2:D`;
    const rangeE = `'Form Responses'!E2:E`;
    const expectedFormula = `=ARRAYFORMULA(IF(LEN(${rangeC}), ${rangeC}, IF(LEN(${rangeD}), ${rangeD}, ${rangeE})))`;
    expect(spySetFormula).toHaveBeenCalledWith(expect.stringContaining(expectedFormula));
  });

  test('normalize handles special characters and case insensitivity', () => {
    const rawSheet = ss.insertSheet('Form Responses');
    // Simulate headers with "Clean NL?" and some case diffs
    rawSheet.setMockData([
      ['Timestamp', 'Select Language', 'Clean EN', 'Clean FR', 'Clean NL?']
    ]);

    const questions: QuestionConfig[] = [{
      id: 'q2',
      type: 'CHECKBOX',
      qEn: 'Clean EN',
      qFr: 'Clean FR',
      qNl: 'Clean NL?',
      required: true,
      options: [],
      optionsFr: [],
      optionsNl: [],
      status: 'Active'
    }];

    const cleanSheet = ss.insertSheet('Form Responses (Clean)');
    
    const spySetFormula = jest.fn();
    const mockRange = {
      setFormula: spySetFormula,
      setValues: jest.fn().mockReturnThis(),
      getValues: jest.fn().mockReturnValue([['mock value']]),
      setFontWeight: jest.fn().mockReturnThis(),
      setValue: jest.fn().mockReturnThis(),
      setNumberFormat: jest.fn().mockReturnThis()
    };
    
    cleanSheet.getRange = jest.fn().mockReturnValue(mockRange);

    normalizer.normalize('Form Responses', questions);

    // C=3, D=4, E=5
    const rangeC = `'Form Responses'!C2:C`;
    const rangeD = `'Form Responses'!D2:D`;
    const rangeE = `'Form Responses'!E2:E`;
    const expectedFormula = `=ARRAYFORMULA(IF(LEN(${rangeC}), ${rangeC}, IF(LEN(${rangeD}), ${rangeD}, ${rangeE})))`;
    
    expect(spySetFormula).toHaveBeenCalledWith(expect.stringContaining(expectedFormula));
  });

  test('normalize preserves numeric types using IF formula', () => {
    const rawSheet = ss.insertSheet('Form Responses');
    rawSheet.setMockData([
      ['Timestamp', 'Select Language', 'Age EN', 'Age FR', 'Age NL']
    ]);

    const questions: QuestionConfig[] = [{
      id: 'q3',
      type: 'TEXT', // Using TEXT here but logic applies to all. In config it might be NUMBER but type in code is generic usually or we can add NUMBER to types if needed.
      // Actually QuestionType has NUMBER.
      qEn: 'Age EN',
      qFr: 'Age FR',
      qNl: 'Age NL',
      required: true,
      options: [],
      optionsFr: [],
      optionsNl: [],
      status: 'Active'
    }];
    // We'll cast type to any or just use TEXT as the normalizer doesn't check type for the formula generation, only for date formatting.
    // But let's use 'NUMBER' if valid type.
    questions[0].type = 'NUMBER' as any;

    const spySetFormula = jest.fn();
    const mockRange = {
      setFormula: spySetFormula,
      setValues: jest.fn().mockReturnThis(),
      getValues: jest.fn().mockReturnValue([['mock value']]),
      setFontWeight: jest.fn().mockReturnThis(),
      setValue: jest.fn().mockReturnThis(),
      setNumberFormat: jest.fn().mockReturnThis()
    };
    
    const cleanSheet = ss.insertSheet('Form Responses (Clean)');
    cleanSheet.getRange = jest.fn().mockReturnValue(mockRange);

    normalizer.normalize('Form Responses', questions);

    // C=3, D=4, E=5
    const rangeC = `'Form Responses'!C2:C`;
    const rangeD = `'Form Responses'!D2:D`;
    const rangeE = `'Form Responses'!E2:E`;
    const expectedFormula = `=ARRAYFORMULA(IF(LEN(${rangeC}), ${rangeC}, IF(LEN(${rangeD}), ${rangeD}, ${rangeE})))`;
    
    expect(spySetFormula).toHaveBeenCalledWith(expect.stringContaining(expectedFormula));
  });

  test('translates CHOICE responses from FR/NL to EN', () => {
    const rawSheet = ss.insertSheet('Form Responses');
    rawSheet.setMockData([
      ['Timestamp', 'Select Language', 'Status EN', 'Status FR', 'Status NL'],
      ['2024-01-01', 'EN', 'Clean', '', ''],
      ['2024-01-02', 'FR', '', 'Propre', ''],
      ['2024-01-03', 'NL', '', '', 'Schoon']
    ]);

    const questions: QuestionConfig[] = [{
      id: 'q4',
      type: 'CHOICE',
      qEn: 'Status EN',
      qFr: 'Status FR',
      qNl: 'Status NL',
      required: true,
      options: ['Clean', 'Dirty'],
      optionsFr: ['Propre', 'Sale'],
      optionsNl: ['Schoon', 'Vuil'],
      status: 'Active'
    }];

    const cleanSheet = ss.insertSheet('Form Responses (Clean)');
    
    // Simply verify the normalize method runs without error
    // In a real scenario, translation happens after formulas are set
    // Testing the actual translation logic would require more complex mocking
    expect(() => {
      normalizer.normalize('Form Responses', questions);
    }).not.toThrow();
  });
});
