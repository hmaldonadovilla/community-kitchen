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
        qNl: 'Toestand',
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

  test('allows duplicate labels across questions (labels are presentation-only)', () => {
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
    expect(errors).toEqual([]);
  });

  test('detects duplicate question IDs', () => {
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
        id: 'Q1', // Duplicate ID
        type: 'TEXT',
        qEn: 'End Date',
        qFr: 'Date',
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
    expect(errors[0]).toContain('DUPLICATE QUESTION IDs');
    expect(errors[0]).toContain('"Q1"');
  });

  test('detects mismatched option counts', () => {
    const questions: QuestionConfig[] = [
      {
        id: 'Q1',
        type: 'CHOICE',
        qEn: 'Status',
        qFr: 'Statut',
        qNl: 'Toestand',
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
        qEn: 'Date', // Duplicate labels are allowed
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
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain('MISMATCHED');
  });

  test('detects missing subGroup.id in line item groups', () => {
    const questions: QuestionConfig[] = [
      {
        id: 'ITEMS',
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
          fields: [],
          subGroups: [
            {
              // id intentionally missing
              label: { en: 'Meals' },
              fields: [
                { id: 'QTY', type: 'NUMBER', labelEn: 'Qty', labelFr: 'Qté', labelNl: 'Aantal', required: true }
              ]
            } as any
          ]
        } as any
      } as any
    ];
    const errors = ConfigValidator.validate(questions, 'Config: Test');
    expect(errors.some((e: string) => e.includes('MISSING SUBGROUP IDs'))).toBe(true);
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
