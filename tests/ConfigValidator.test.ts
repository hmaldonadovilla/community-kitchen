import './mocks/GoogleAppsScript';
import { ConfigValidator } from '../src/config/ConfigValidator';
import { QuestionConfig } from '../src/types';

describe('ConfigValidator', () => {
  test('accepts valid configuration', () => {
    const questions: QuestionConfig[] = [
      {
        id: 'Q1',
        type: 'TEXT',
        qEn: 'Name',
        qFr: 'Nom',
        qNl: 'Naam',
        required: true,
        options: [],
        optionsFr: [],
        optionsNl: [],
        status: 'Active'
      },
      {
        id: 'Q2',
        type: 'CHOICE',
        qEn: 'Status',
        qFr: 'Statut',
        qNl: 'Toestand', // Changed from 'Status' to avoid duplicate
        required: false,
        options: ['Clean', 'Dirty'],
        optionsFr: ['Propre', 'Sale'],
        optionsNl: ['Schoon', 'Vuil'],
        status: 'Active'
      }
    ];

    const errors = ConfigValidator.validate(questions, 'Config: Test');
    expect(errors).toEqual([]);
  });

  test('detects duplicate names within a single question', () => {
    const questions: QuestionConfig[] = [
      {
        id: 'Q1',
        type: 'CHOICE',
        qEn: 'Weather',
        qFr: 'Weather', // Duplicate!
        qNl: 'Weather NL',
        required: true,
        options: ['Sunny', 'Rainy'],
        optionsFr: ['Ensoleillé', 'Pluvieux'],
        optionsNl: ['Zonnig', 'Regenachtig'],
        status: 'Active'
      }
    ];

    const errors = ConfigValidator.validate(questions, 'Config: Test');
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('DUPLICATE NAME IN QUESTION');
    expect(errors[0]).toContain('"Weather"');
    expect(errors[0]).toContain('English');
    expect(errors[0]).toContain('French');
  });

  test('detects duplicate English names across questions', () => {
    const questions: QuestionConfig[] = [
      {
        id: 'Q1',
        type: 'TEXT',
        qEn: 'Date',
        qFr: 'Date FR', // Changed to avoid within-question duplicate
        qNl: 'Datum',
        required: true,
        options: [],
        optionsFr: [],
        optionsNl: [],
        status: 'Active'
      },
      {
        id: 'Q2',
        type: 'TEXT',
        qEn: 'Date', // Duplicate across questions
        qFr: 'Date de début',
        qNl: 'Begindatum',
        required: false,
        options: [],
        optionsFr: [],
        optionsNl: [],
        status: 'Active'
      }
    ];

    const errors = ConfigValidator.validate(questions, 'Config: Test');
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('DUPLICATE NAMES ACROSS QUESTIONS (English)');
    expect(errors[0]).toContain('"Date"');
  });

  test('detects duplicate French names across questions', () => {
    const questions: QuestionConfig[] = [
      {
        id: 'Q1',
        type: 'TEXT',
        qEn: 'Start Date',
        qFr: 'Date',
        qNl: 'Datum',
        required: true,
        options: [],
        optionsFr: [],
        optionsNl: [],
        status: 'Active'
      },
      {
        id: 'Q2',
        type: 'TEXT',
        qEn: 'End Date',
        qFr: 'Date', // Duplicate across questions
        qNl: 'Begindatum',
        required: false,
        options: [],
        optionsFr: [],
        optionsNl: [],
        status: 'Active'
      }
    ];

    const errors = ConfigValidator.validate(questions, 'Config: Test');
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('DUPLICATE NAMES ACROSS QUESTIONS (French)');
  });

  test('detects mismatched option counts', () => {
    const questions: QuestionConfig[] = [
      {
        id: 'Q1',
        type: 'CHOICE',
        qEn: 'Status',
        qFr: 'Statut',
        qNl: 'Toestand', // Changed from 'Status' to avoid within-question duplicate
        required: false,
        options: ['Clean', 'Dirty'], // 2 options
        optionsFr: ['Propre'], // 1 option - mismatch!
        optionsNl: ['Schoon', 'Vuil'], // 2 options
        status: 'Active'
      }
    ];

    const errors = ConfigValidator.validate(questions, 'Config: Test');
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('MISMATCHED OPTION COUNTS');
    expect(errors[0]).toContain('Status');
    expect(errors[0]).toContain('English:  2');
    expect(errors[0]).toContain('French:   1');
  });

  test('ignores option count validation for non-CHOICE/CHECKBOX questions', () => {
    const questions: QuestionConfig[] = [
      {
        id: 'Q1',
        type: 'TEXT',
        qEn: 'Name',
        qFr: 'Nom',
        qNl: 'Naam',
        required: true,
        options: [], // Empty is fine for TEXT
        optionsFr: [],
        optionsNl: [],
        status: 'Active'
      }
    ];

    const errors = ConfigValidator.validate(questions, 'Config: Test');
    expect(errors).toEqual([]);
  });

  test('detects multiple validation errors at once', () => {
    const questions: QuestionConfig[] = [
      {
        id: 'Q1',
        type: 'TEXT',
        qEn: 'Date',
        qFr: 'Date FR',
        qNl: 'Datum',
        required: true,
        options: [],
        optionsFr: [],
        optionsNl: [],
        status: 'Active'
      },
      {
        id: 'Q2',
        type: 'TEXT',
        qEn: 'Date', // Duplicate EN across questions
        qFr: 'Date de début',
        qNl: 'Begindatum',
        required: false,
        options: [],
        optionsFr: [],
        optionsNl: [],
        status: 'Active'
      },
      {
        id: 'Q3',
        type: 'CHOICE',
        qEn: 'Status',
        qFr: 'Statut',
        qNl: 'Toestand',
        required: false,
        options: ['Clean', 'Dirty'],
        optionsFr: ['Propre'], // Mismatched count
        optionsNl: ['Schoon', 'Vuil'],
        status: 'Active'
      }
    ];

    const errors = ConfigValidator.validate(questions, 'Config: Test');
    expect(errors.length).toBe(2); // Both duplicate names AND mismatched options
    expect(errors.some((e: string) => e.includes('DUPLICATE'))).toBe(true);
    expect(errors.some((e: string) => e.includes('MISMATCHED'))).toBe(true);
  });

  test('detects mismatched option counts inside line item groups', () => {
    const questions: QuestionConfig[] = [
      {
        id: 'Q9',
        type: 'LINE_ITEM_GROUP',
        qEn: 'Items',
        qFr: 'Articles',
        qNl: 'Artikelen',
        required: true,
        options: [],
        optionsFr: [],
        optionsNl: [],
        status: 'Active',
        lineItemConfig: {
          fields: [
            {
              id: 'unit',
              type: 'CHOICE',
              labelEn: 'Unit',
              labelFr: 'Unité',
              labelNl: 'Eenheid',
              required: true,
              options: ['Kg', 'Litre'],
              optionsFr: ['Kg'],
              optionsNl: ['Kg', 'Litre']
            }
          ]
        }
      }
    ];

    const errors = ConfigValidator.validate(questions, 'Config: Test');
    expect(errors.some((e: string) => e.includes('Line Item'))).toBe(true);
  });
});
