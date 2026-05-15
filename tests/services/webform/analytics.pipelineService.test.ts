import '../../mocks/GoogleAppsScript';

jest.mock('../../../src/services/webform/driveApi', () => {
  const actual = jest.requireActual('../../../src/services/webform/driveApi');
  return {
    ...actual,
    exportDriveApiFile: jest.fn(),
    trashDriveApiFile: jest.fn(() => true)
  };
});

jest.mock('../../../src/services/webform/followup/docRenderer.copy', () => {
  const actual = jest.requireActual('../../../src/services/webform/followup/docRenderer.copy');
  return {
    ...actual,
    resolveOutputTarget: jest.fn()
  };
});

import { AnalyticsPipelineService } from '../../../src/services/webform/analytics/pipelineService';
import { exportDriveApiFile } from '../../../src/services/webform/driveApi';
import { resolveOutputTarget } from '../../../src/services/webform/followup/docRenderer.copy';

describe('AnalyticsPipelineService', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-04-23T10:00:00.000Z'));
    (global as any).GmailApp.sendEmail.mockClear();
    (global as any).Utilities.sleep.mockReset();
    (exportDriveApiFile as jest.Mock).mockReset();
    (resolveOutputTarget as jest.Mock).mockReset();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  test('buildDashboardPipelines exposes analytics-page pipelines with owner metadata', () => {
    const service = new AnalyticsPipelineService({} as any, {} as any, {} as any);
    const result = service.buildDashboardPipelines([
      {
        title: 'Meal Production',
        configSheet: 'Config: Meal Production',
        analytics: {
          pipelines: [
            {
              id: 'ingredient_usage',
              type: 'ingredientUsageReport',
              title: { en: 'Ingredients usage' },
              ui: {
                dateLabel: 'From date',
                submitLabel: 'Send report'
              },
              email: {
                recipients: ['ops@example.com']
              },
              report: {
                dateFieldId: 'MP_PREP_DATE',
                mealGroupId: 'MP_MEALS_REQUEST',
                prepGroupId: 'MP_TYPE_LI',
                ingredientGroupId: 'MP_INGREDIENTS_LI',
                prepTypeFieldId: 'PREP_TYPE',
                ingredientFieldId: 'ING',
                quantityFieldId: 'QTY',
                unitFieldId: 'UNIT'
              }
            }
          ]
        }
      } as any
    ]);

    expect(result).toEqual([
      expect.objectContaining({
        dashboardPipelineId: 'Config: Meal Production::ingredient_usage',
        ownerFormKey: 'Config: Meal Production',
        pipelineId: 'ingredient_usage',
        sourceFormKey: 'Config: Meal Production',
        sourceFormTitle: 'Meal Production',
        title: 'Ingredients usage',
        dateLabel: 'From date',
        submitLabel: 'Send report'
      })
    ]);
  });

  test('runPipeline aggregates cook ingredients, writes xlsx, and emails the attachment', () => {
    const blob: any = {
      name: '',
      setName(nextName: string) {
        this.name = nextName;
        return this;
      },
      getName() {
        return this.name;
      },
      getBytes() {
        return [1, 2, 3];
      },
      getContentType() {
        return 'application/octet-stream';
      }
    };
    (exportDriveApiFile as jest.Mock).mockReturnValue(blob);
    const createFile = jest.fn(() => ({ fileId: 'xlsx-file-1', url: 'https://example.test/xlsx-file-1' }));
    (resolveOutputTarget as jest.Mock).mockReturnValue({ createFile });

    let persistedVisible = false;
    let writtenValues: any[][] = [[]];
    const tempSheet = {
      setName: jest.fn(),
      getRange: jest.fn((row: number, col: number, numRows: number, numCols: number) => {
        type MockRange = {
          setValues: jest.Mock<MockRange, [any[][]]>;
          setFontWeight: jest.Mock<MockRange, []>;
          getValues: jest.Mock<any[][], []>;
        };
        const range: MockRange = {
          setValues: jest.fn<MockRange, [any[][]]>((vals: any[][]) => {
            writtenValues = vals.map(entry => entry.slice());
            return range;
          }),
          setFontWeight: jest.fn<MockRange, []>(() => range),
          getValues: jest.fn<any[][], []>(() => {
            if (!persistedVisible) {
              return Array.from({ length: numRows }, () => Array.from({ length: numCols }, () => ''));
            }
            return Array.from({ length: numRows }, (_, rowOffset) =>
              Array.from({ length: numCols }, (_, colOffset) => writtenValues[row - 1 + rowOffset]?.[col - 1 + colOffset] ?? '')
            );
          })
        };
        return range;
      })
    };
    const tempSpreadsheet = {
      getId: () => 'temp-spreadsheet-id',
      getSheets: () => [tempSheet],
      getSheetByName: (name: string) => (name === 'Ingredient usage' ? tempSheet : null),
      insertSheet: () => tempSheet
    };
    (global as any).SpreadsheetApp.create = jest.fn(() => tempSpreadsheet);
    (global as any).SpreadsheetApp.openById = jest.fn(() => tempSpreadsheet);
    (global as any).SpreadsheetApp.flush = jest.fn();
    (global as any).DriveApp.getFileById = jest.fn(() => ({ setTrashed: jest.fn() }));
    (global as any).Utilities.sleep.mockImplementation(() => {
      persistedVisible = true;
    });

    const records = [
      {
        formKey: 'Config: Meal Production',
        language: 'EN',
        id: 'REC-1',
        status: 'Closed',
        values: {
          MP_PREP_DATE: '2026-04-21',
          MP_MEALS_REQUEST: [
            {
              MP_TYPE_LI: [
                {
                  PREP_TYPE: 'Cook',
                  MP_INGREDIENTS_LI: [
                    { ING: 'Beans', QTY: '2', UNIT: 'kg', CAT: 'Legumes' },
                    { ING: 'Beans', QTY: '1.5', UNIT: 'kg', CAT: 'Legumes' },
                    { ING: 'Salt', QTY: '100', UNIT: 'Tbsp' },
                    { ING: 'Sugar', QTY: '20', UNIT: 'Tbsp' },
                    { ING: 'Rice', QTY: '1500', UNIT: 'gr' }
                  ]
                },
                {
                  PREP_TYPE: 'Multi-ingredient',
                  MP_INGREDIENTS_LI: [{ ING: 'Tomato', QTY: '4', UNIT: 'kg', CAT: 'Vegetables' }]
                }
              ]
            }
          ]
        }
      },
      {
        formKey: 'Config: Meal Production',
        language: 'EN',
        id: 'REC-2',
        status: 'Open',
        values: {
          MP_PREP_DATE: '2026-04-22',
          MP_MEALS_REQUEST: [
            {
              MP_TYPE_LI: [
                {
                  PREP_TYPE: 'Cook',
                  MP_INGREDIENTS_LI: [{ ING: 'Beans', QTY: '5', UNIT: 'kg', CAT: 'Legumes' }]
                }
              ]
            }
          ]
        }
      }
    ];

    const submissions = {
      ensureDestination: jest.fn(() => ({
        sheet: {
          getLastRow: () => records.length + 1,
          getRange: () => ({
            getValues: () => [[0], [1]]
          })
        },
        headers: ['RID'],
        columns: {}
      })),
      buildSubmissionRecord: jest.fn((_formKey: string, _questions: any[], _columns: any, row: any[]) => records[row[0]])
    };
    const dataSources = {
      lookupDataSourceDetails: jest.fn((_question: any, ingredient: string) => {
        if (ingredient === 'Beans') return { CATEGORY: 'Legumes' };
        if (ingredient === 'Salt') return { CATEGORY: 'Herbs', TBSP_GRAMS: '18' };
        if (ingredient === 'Sugar') return { CATEGORY: 'Herbs', TBSP_GRAMS: '12.5' };
        if (ingredient === 'Rice') return { CATEGORY: 'Dry carbohydrates' };
        return null;
      })
    };

    const service = new AnalyticsPipelineService({ getId: () => 'active-spreadsheet-id' } as any, submissions as any, dataSources as any);
    const questions = [
      {
        id: 'MP_MEALS_REQUEST',
        type: 'LINE_ITEM_GROUP',
        lineItemConfig: {
          subGroups: [
            {
              id: 'MP_TYPE_LI',
              subGroups: [
                {
                  id: 'MP_INGREDIENTS_LI',
                  fields: [{ id: 'ING', dataSource: { id: 'Ingredients Data' } }]
                }
              ]
            }
          ]
        }
      }
    ];
    const form = {
      title: 'Meal Production',
      configSheet: 'Config: Meal Production',
      destinationTab: 'Meal Production Data',
      followupConfig: {
        statusTransitions: {
          onClose: 'Closed'
        }
      }
    };
    const pipeline = {
      id: 'ingredient_usage',
      type: 'ingredientUsageReport',
      title: 'Ingredients usage',
      email: {
        recipients: ['ops@example.com'],
        subject: 'Ingredients usage {{START_DATE}} to {{END_DATE}}',
        message: 'Rows: {{ROW_COUNT}} from {{START_DATE}}'
      },
      attachment: {
        fileNameTemplate: 'Ingredients usage {{START_DATE}} to {{END_DATE}}.xlsx',
        sheetName: 'Ingredient usage'
      },
      report: {
        dateFieldId: 'MP_PREP_DATE',
        mealGroupId: 'MP_MEALS_REQUEST',
        prepGroupId: 'MP_TYPE_LI',
        ingredientGroupId: 'MP_INGREDIENTS_LI',
        prepTypeFieldId: 'PREP_TYPE',
        prepTypeValues: ['Cook'],
        ingredientFieldId: 'ING',
        quantityFieldId: 'QTY',
        unitFieldId: 'UNIT',
        categoryFieldId: 'CAT',
        categoryLookupColumn: 'CATEGORY',
        tablespoonGramsLookupColumn: 'TBSP_GRAMS'
      }
    };

    const result = service.runPipeline({
      ownerForm: form as any,
      sourceForm: form as any,
      sourceQuestions: questions as any,
      pipeline: pipeline as any,
      startDate: '2026-04-20'
    });

    expect(result.success).toBe(true);
    expect(result.summary).toMatchObject({
      startDate: '2026-04-20',
      endDate: '2026-04-23',
      recordCount: 1,
      rowCount: 4,
      attachmentName: 'Ingredients usage Mon,20-Apr-2026 to Thu,23-Apr-2026.xlsx',
      attachmentFileId: 'xlsx-file-1'
    });
    expect(writtenValues).toEqual([
      ['Ingredients', 'Quantity', 'Unit', 'Category'],
      ['Beans', 3.5, 'kg', 'Legumes'],
      ['Rice', 1.5, 'kg', 'Dry carbohydrates'],
      ['Salt', 1.8, 'kg', 'Herbs'],
      ['Sugar', 250, 'gr', 'Herbs']
    ]);
    expect(createFile).toHaveBeenCalledTimes(1);
    expect((global as any).SpreadsheetApp.openById).toHaveBeenCalledWith('temp-spreadsheet-id');
    expect((global as any).SpreadsheetApp.flush).toHaveBeenCalled();
    expect((global as any).Utilities.sleep).toHaveBeenCalledWith(1500);
    expect((global as any).GmailApp.sendEmail).toHaveBeenCalledTimes(1);
    const [, subject, body, options] = (global as any).GmailApp.sendEmail.mock.calls[0];
    expect(subject).toBe('Ingredients usage Mon,20-Apr-2026 to Thu,23-Apr-2026');
    expect(body).toBe('Rows: 4 from Mon,20-Apr-2026');
    expect(options.attachments[0].getName()).toBe('Ingredients usage Mon,20-Apr-2026 to Thu,23-Apr-2026.xlsx');
  });

  test('runPipeline writes completed meal production rows for record table reports', () => {
    const blob: any = {
      name: '',
      setName(nextName: string) {
        this.name = nextName;
        return this;
      },
      getName() {
        return this.name;
      },
      getBytes() {
        return [1, 2, 3];
      },
      getContentType() {
        return 'application/octet-stream';
      }
    };
    (exportDriveApiFile as jest.Mock).mockReturnValue(blob);
    const createFile = jest.fn(() => ({ fileId: 'xlsx-file-2', url: 'https://example.test/xlsx-file-2' }));
    (resolveOutputTarget as jest.Mock).mockReturnValue({ createFile });

    let persistedVisible = false;
    let writtenValues: any[][] = [[]];
    const tempSheet = {
      setName: jest.fn(),
      getRange: jest.fn((row: number, col: number, numRows: number, numCols: number) => {
        type MockRange = {
          setValues: jest.Mock<MockRange, [any[][]]>;
          setFontWeight: jest.Mock<MockRange, []>;
          getValues: jest.Mock<any[][], []>;
        };
        const range: MockRange = {
          setValues: jest.fn<MockRange, [any[][]]>((vals: any[][]) => {
            writtenValues = vals.map(entry => entry.slice());
            return range;
          }),
          setFontWeight: jest.fn<MockRange, []>(() => range),
          getValues: jest.fn<any[][], []>(() => {
            if (!persistedVisible) {
              return Array.from({ length: numRows }, () => Array.from({ length: numCols }, () => ''));
            }
            return Array.from({ length: numRows }, (_, rowOffset) =>
              Array.from({ length: numCols }, (_, colOffset) => writtenValues[row - 1 + rowOffset]?.[col - 1 + colOffset] ?? '')
            );
          })
        };
        return range;
      })
    };
    const tempSpreadsheet = {
      getId: () => 'temp-record-table-id',
      getSheets: () => [tempSheet],
      getSheetByName: () => tempSheet,
      insertSheet: () => tempSheet
    };
    (global as any).SpreadsheetApp.create = jest.fn(() => tempSpreadsheet);
    (global as any).SpreadsheetApp.openById = jest.fn(() => tempSpreadsheet);
    (global as any).SpreadsheetApp.flush = jest.fn();
    (global as any).DriveApp.getFileById = jest.fn(() => ({ setTrashed: jest.fn() }));
    (global as any).Utilities.sleep.mockImplementation(() => {
      persistedVisible = true;
    });

    const records = [
      {
        formKey: 'Config: Meal Production',
        language: 'EN',
        id: 'REC-1',
        status: 'Closed',
        values: {
          MP_PREP_DATE: '2026-04-21',
          MP_DISTRIBUTOR: 'Belliard',
          MP_SERVICE: 'Lunch',
          MP_COOK_NAME: 'Akkara',
          MP_MEALS_REQUEST: [
            {
              MEAL_TYPE: 'Standard',
              ORD_QTY: 10,
              FINAL_QTY: 9,
              MP_TYPE_LI: [{ PREP_TYPE: 'Leftover' }]
            },
            {
              MEAL_TYPE: 'Vegetarian',
              ORD_QTY: 3,
              FINAL_QTY: 3,
              MP_TYPE_LI: [{ PREP_TYPE: 'Cook', LEFTOVER_ID: 'LEFT-IGNORED' }]
            },
            {
              MEAL_TYPE: 'Vegan',
              ORD_QTY: 0,
              FINAL_QTY: 0
            }
          ]
        }
      },
      {
        formKey: 'Config: Meal Production',
        language: 'EN',
        id: 'REC-2',
        status: 'In production',
        values: {
          MP_PREP_DATE: '2026-04-22',
          MP_DISTRIBUTOR: 'Belliard',
          MP_SERVICE: 'Dinner',
          MP_COOK_NAME: 'Akkara',
          MP_MEALS_REQUEST: [{ MEAL_TYPE: 'Standard', ORD_QTY: 12, FINAL_QTY: '' }]
        }
      }
    ];
    const submissions = {
      ensureDestination: jest.fn(() => ({
        sheet: {
          getLastRow: () => records.length + 1,
          getRange: () => ({
            getValues: () => [[0], [1]]
          })
        },
        headers: ['RID'],
        columns: {}
      })),
      buildSubmissionRecord: jest.fn((_formKey: string, _questions: any[], _columns: any, row: any[]) => records[row[0]])
    };
    const service = new AnalyticsPipelineService({ getId: () => 'active-spreadsheet-id' } as any, submissions as any, {} as any);
    const form = {
      title: 'Meal Production',
      configSheet: 'Config: Meal Production',
      destinationTab: 'Meal Production Data',
      followupConfig: {}
    };
    const pipeline = {
      id: 'meals_produced_delivered',
      type: 'recordTableReport',
      title: 'Meals produced and delivered',
      email: {
        recipients: ['ops@example.com'],
        subject: 'Meals produced and delivered report since {{START_DATE}}',
        message: 'Please find attached the Meals produced and delivered report since {{START_DATE}}.'
      },
      attachment: {
        fileNameTemplate: 'Meals produced and delivered report since {{START_DATE}}.xlsx',
        sheetName: 'Meals produced and delivered'
      },
      report: {
        dateFieldId: 'MP_PREP_DATE',
        statusFieldId: 'Status',
        includeStatuses: ['Closed'],
        completedStatuses: ['Closed'],
        lineItem: {
          groupId: 'MP_MEALS_REQUEST',
          includeWhen: { fieldId: 'ORD_QTY', greaterThan: 0 }
        },
        columns: [
          { source: 'recordField', fieldId: 'MP_PREP_DATE' },
          { header: 'Customer', source: 'recordField', fieldId: 'MP_DISTRIBUTOR' },
          { header: 'Service', source: 'recordField', fieldId: 'MP_SERVICE' },
          { header: 'Responsible cook', source: 'recordField', fieldId: 'MP_COOK_NAME' },
          { header: 'Dietary type', source: 'lineItemField', fieldId: 'MEAL_TYPE' },
          { source: 'lineItemField', fieldId: 'FINAL_QTY' },
          {
            header: 'Leftover used',
            source: 'hasLineItem',
            groupId: 'MP_TYPE_LI',
            when: {
              all: [
                { fieldId: 'PREP_TYPE', notEmpty: true },
                { fieldId: 'PREP_TYPE', notEquals: 'Cook' }
              ]
            },
            trueLabel: 'Yes',
            falseLabel: 'No'
          }
        ]
      }
    };

    const result = service.runPipeline({
      ownerForm: form as any,
      sourceForm: form as any,
      sourceQuestions: [
        { id: 'MP_PREP_DATE', type: 'DATE', qEn: 'Date' },
        {
          id: 'MP_MEALS_REQUEST',
          type: 'LINE_ITEM_GROUP',
          lineItemConfig: {
            fields: [
              { id: 'MEAL_TYPE', labelEn: 'Dietary type' },
              { id: 'FINAL_QTY', labelEn: 'Number of portions delivered' }
            ]
          }
        }
      ] as any,
      pipeline: pipeline as any,
      startDate: '2026-04-20'
    });

    expect(result.success).toBe(true);
    expect(result.summary).toMatchObject({
      startDate: '2026-04-20',
      endDate: '2026-04-23',
      recordCount: 1,
      rowCount: 2,
      attachmentName: 'Meals produced and delivered report since Mon,20-Apr-2026.xlsx'
    });
    expect(writtenValues).toEqual([
      ['Date', 'Customer', 'Service', 'Responsible cook', 'Dietary type', 'Number of portions delivered', 'Leftover used'],
      ['2026-04-21', 'Belliard', 'Lunch', 'Akkara', 'Standard', '9', 'Yes'],
      ['2026-04-21', 'Belliard', 'Lunch', 'Akkara', 'Vegetarian', '3', 'No']
    ]);
    const [, subject, body, options] = (global as any).GmailApp.sendEmail.mock.calls[0];
    expect(subject).toBe('Meals produced and delivered report since Mon,20-Apr-2026');
    expect(body).toBe('Please find attached the Meals produced and delivered report since Mon,20-Apr-2026.');
    expect(options.attachments[0].getName()).toBe('Meals produced and delivered report since Mon,20-Apr-2026.xlsx');
  });

  test('runPipeline exports generated bank reports as multi-tab workbooks', () => {
    jest.setSystemTime(new Date('2026-05-15T10:00:00.000Z'));
    const blob: any = {
      name: '',
      setName(nextName: string) {
        this.name = nextName;
        return this;
      },
      getName() {
        return this.name;
      },
      getBytes() {
        return [1, 2, 3];
      },
      getContentType() {
        return 'application/octet-stream';
      }
    };
    (exportDriveApiFile as jest.Mock).mockReturnValue(blob);
    const createFile = jest.fn(() => ({ fileId: 'leftovers-xlsx-1', url: 'https://example.test/leftovers-xlsx-1' }));
    (resolveOutputTarget as jest.Mock).mockReturnValue({ createFile });

    let persistedVisible = false;
    const writtenBySheet: Record<string, any[][]> = {};
    const sheetsByName: Record<string, any> = {};
    const makeSheet = (initialName: string) => {
      let currentName = initialName;
      const sheet: any = {
        setName: jest.fn((nextName: string) => {
          delete sheetsByName[currentName];
          currentName = nextName;
          sheetsByName[currentName] = sheet;
          return sheet;
        }),
        getRange: jest.fn((row: number, col: number, numRows: number, numCols: number) => {
          type MockRange = {
            setValues: jest.Mock<MockRange, [any[][]]>;
            setFontWeight: jest.Mock<MockRange, []>;
            getValues: jest.Mock<any[][], []>;
          };
          const range: MockRange = {
            setValues: jest.fn<MockRange, [any[][]]>((vals: any[][]) => {
              writtenBySheet[currentName] = vals.map(entry => entry.slice());
              return range;
            }),
            setFontWeight: jest.fn<MockRange, []>(() => range),
            getValues: jest.fn<any[][], []>(() => {
              if (!persistedVisible) {
                return Array.from({ length: numRows }, () => Array.from({ length: numCols }, () => ''));
              }
              const written = writtenBySheet[currentName] || [];
              return Array.from({ length: numRows }, (_, rowOffset) =>
                Array.from({ length: numCols }, (_, colOffset) => written[row - 1 + rowOffset]?.[col - 1 + colOffset] ?? '')
              );
            })
          };
          return range;
        })
      };
      sheetsByName[currentName] = sheet;
      return sheet;
    };
    const firstSheet = makeSheet('Sheet1');
    const tempSpreadsheet = {
      getId: () => 'temp-leftover-generation-id',
      getSheets: () => [firstSheet],
      getSheetByName: (name: string) => sheetsByName[name] || null,
      insertSheet: jest.fn((name: string) => makeSheet(name))
    };
    (global as any).SpreadsheetApp.create = jest.fn(() => tempSpreadsheet);
    (global as any).SpreadsheetApp.openById = jest.fn(() => tempSpreadsheet);
    (global as any).SpreadsheetApp.flush = jest.fn();
    (global as any).DriveApp.getFileById = jest.fn(() => ({ setTrashed: jest.fn() }));
    (global as any).Utilities.sleep.mockImplementation(() => {
      persistedVisible = true;
    });

    const sourceRecords = [
      {
        formKey: 'Config: Meal Production',
        language: 'EN',
        id: 'mp-1',
        status: 'Closed',
        values: {
          MP_PREP_DATE: '2026-05-11',
          MP_DISTRIBUTOR: { DIST_NAME: 'HUB' },
          MP_SERVICE: 'Lunch',
          MP_COOK_NAME: 'Akkara',
          MP_MEALS_REQUEST: [
            {
              __ckRowId: 'meal-veg',
              MEAL_TYPE: 'Vegetarian',
              ORD_QTY: 450,
              MP_TO_COOK: 430,
              FINAL_QTY: 420,
              MP_TYPE_LI: [
                { __ckRowId: 'cook-veg', PREP_TYPE: 'Cook', RECIPE: 'Tajine' },
                { __ckRowId: 'leftover-used', PREP_TYPE: 'Single-ingredient' }
              ]
            }
          ]
        }
      }
    ];
    const bankRecords = [
      {
        formKey: 'Config: Leftover Bank',
        language: 'EN',
        id: 'leftover-mi-1',
        status: 'available',
        values: {
          LEFTOVER_KIND: 'Multi-ingredient',
          LEFTOVER_SOURCE_RECORD_ID: 'mp-1',
          LEFTOVER_SOURCE_ROW_ID: 'cook-veg',
          LEFTOVER_RECIPE: 'Tajine with chickpeas',
          LEFTOVER_PORTIONS: 12,
          LEFTOVER_STORAGE: 'Frozen'
        }
      },
      {
        formKey: 'Config: Leftover Bank',
        language: 'EN',
        id: 'leftover-si-1',
        status: 'available',
        values: {
          LEFTOVER_KIND: 'Single-ingredient',
          LEFTOVER_SOURCE_RECORD_ID: 'mp-1',
          LEFTOVER_SOURCE_ROW_ID: 'single-1',
          LEFTOVER_INGREDIENT: 'Rice',
          LEFTOVER_QTY: 3,
          LEFTOVER_UNIT: 'kg',
          LEFTOVER_STORAGE: 'Chilled'
        }
      }
    ];
    const submissions = {
      ensureDestination: jest.fn((destinationName: string) => {
        const records = destinationName === 'Leftover Bank Data' ? bankRecords : sourceRecords;
        return {
          sheet: {
            getLastRow: () => records.length + 1,
            getRange: () => ({
              getValues: () => records.map((_record, index) => [index])
            })
          },
          headers: ['RID'],
          columns: {}
        };
      }),
      buildSubmissionRecord: jest.fn((formKey: string, _questions: any[], _columns: any, row: any[]) =>
        formKey === 'Config: Leftover Bank' ? bankRecords[row[0]] : sourceRecords[row[0]]
      )
    };

    const service = new AnalyticsPipelineService({ getId: () => 'active-spreadsheet-id' } as any, submissions as any, {} as any);
    const sourceForm = {
      title: 'Meal Production',
      configSheet: 'Config: Meal Production',
      destinationTab: 'Meal Production Data',
      followupConfig: {}
    };
    const bankForm = {
      title: 'Leftover Bank',
      configSheet: 'Config: Leftover Bank',
      destinationTab: 'Leftover Bank Data',
      followupConfig: {}
    };
    const pipeline = {
      id: 'leftover_generation',
      type: 'generatedBankReport',
      title: 'Leftover generation',
      email: {
        recipients: ['ops@example.com'],
        subject: 'Leftover generation report since {{START_DATE}}',
        message: 'Please find attached the Leftover generation report since {{START_DATE}}.'
      },
      attachment: {
        fileNameTemplate: 'Leftover generation report since {{START_DATE}}.xlsx'
      },
      report: {
        dateFieldId: 'MP_PREP_DATE',
        statusFieldId: 'Status',
        includeStatuses: ['Closed'],
        bankFormKey: 'Config: Leftover Bank',
        bankSourceRecordIdFieldId: 'LEFTOVER_SOURCE_RECORD_ID',
        bankSourceRowIdFieldId: 'LEFTOVER_SOURCE_ROW_ID',
        bankKindFieldId: 'LEFTOVER_KIND',
        mealGroupId: 'MP_MEALS_REQUEST',
        prepGroupId: 'MP_TYPE_LI',
        prepTypeFieldId: 'PREP_TYPE',
        customerFieldId: 'MP_DISTRIBUTOR',
        customerDisplayField: 'DIST_NAME',
        serviceFieldId: 'MP_SERVICE',
        cookFieldId: 'MP_COOK_NAME',
        dietaryFieldId: 'MEAL_TYPE',
        originalRecipeFieldId: 'RECIPE',
        orderedPortionsFieldId: 'ORD_QTY',
        toCookPortionsFieldId: 'MP_TO_COOK',
        deliveredPortionsFieldId: 'FINAL_QTY',
        multiLeftoverNameFieldId: 'LEFTOVER_RECIPE',
        multiLeftoverPortionsFieldId: 'LEFTOVER_PORTIONS',
        singleLeftoverNameFieldId: 'LEFTOVER_INGREDIENT',
        singleLeftoverQuantityFieldId: 'LEFTOVER_QTY',
        singleLeftoverUnitFieldId: 'LEFTOVER_UNIT',
        storageFieldId: 'LEFTOVER_STORAGE'
      }
    };

    const result = service.runPipeline({
      ownerForm: sourceForm as any,
      sourceForm: sourceForm as any,
      sourceQuestions: [],
      relatedForms: {
        'Config: Leftover Bank': { form: bankForm as any, questions: [] }
      },
      pipeline: pipeline as any,
      startDate: '2026-05-01'
    });

    expect(result).toEqual(expect.objectContaining({ success: true }));
    expect(result.summary).toMatchObject({
      recordCount: 1,
      rowCount: 2,
      attachmentName: 'Leftover generation report since Fri,01-May-2026.xlsx'
    });
    expect(writtenBySheet['Generated MI leftovers']).toEqual([
      [
        'Meal Production date',
        'Customer',
        'Service',
        'Responsible cook',
        'Dietary Category',
        'Recipe',
        'Ordered portions',
        'To cook portions',
        'Delivered portions',
        'Leftover used',
        'MI leftover name',
        'MI leftover portions',
        'Frozen'
      ],
      ['Mon,11-May-2026', 'HUB', 'Lunch', 'Akkara', 'Vegetarian', 'Tajine', 450, 430, 420, 'YES', 'Tajine with chickpeas', 12, 'YES']
    ]);
    expect(writtenBySheet['Generated SI leftovers']).toEqual([
      ['Meal Production date', 'Customer', 'Service', 'Responsible cook', 'SI leftover name', 'SI leftover quantity', 'SI leftover unit', 'Frozen'],
      ['Mon,11-May-2026', 'HUB', 'Lunch', 'Akkara', 'Rice', 3, 'kg', 'NO']
    ]);
  });

  test('runPipeline adds missing expected cleaning and storage check rows', () => {
    const blob: any = {
      name: '',
      setName(nextName: string) {
        this.name = nextName;
        return this;
      },
      getName() {
        return this.name;
      },
      getBytes() {
        return [1, 2, 3];
      },
      getContentType() {
        return 'application/octet-stream';
      }
    };
    (exportDriveApiFile as jest.Mock).mockReturnValue(blob);
    (resolveOutputTarget as jest.Mock).mockReturnValue({ createFile: jest.fn(() => ({ fileId: 'xlsx-file-3' })) });

    let persistedVisible = false;
    let writtenValues: any[][] = [[]];
    const tempSheet = {
      setName: jest.fn(),
      getRange: jest.fn((row: number, col: number, numRows: number, numCols: number) => {
        type MockRange = {
          setValues: jest.Mock<MockRange, [any[][]]>;
          setFontWeight: jest.Mock<MockRange, []>;
          getValues: jest.Mock<any[][], []>;
        };
        const range: MockRange = {
          setValues: jest.fn<MockRange, [any[][]]>((vals: any[][]) => {
            writtenValues = vals.map(entry => entry.slice());
            return range;
          }),
          setFontWeight: jest.fn<MockRange, []>(() => range),
          getValues: jest.fn<any[][], []>(() => {
            if (!persistedVisible) {
              return Array.from({ length: numRows }, () => Array.from({ length: numCols }, () => ''));
            }
            return Array.from({ length: numRows }, (_, rowOffset) =>
              Array.from({ length: numCols }, (_, colOffset) => writtenValues[row - 1 + rowOffset]?.[col - 1 + colOffset] ?? '')
            );
          })
        };
        return range;
      })
    };
    const tempSpreadsheet = {
      getId: () => 'temp-checks-id',
      getSheets: () => [tempSheet],
      getSheetByName: () => tempSheet,
      insertSheet: () => tempSheet
    };
    (global as any).SpreadsheetApp.create = jest.fn(() => tempSpreadsheet);
    (global as any).SpreadsheetApp.openById = jest.fn(() => tempSpreadsheet);
    (global as any).SpreadsheetApp.flush = jest.fn();
    (global as any).DriveApp.getFileById = jest.fn(() => ({ setTrashed: jest.fn() }));
    (global as any).Utilities.sleep.mockImplementation(() => {
      persistedVisible = true;
    });

    const records = [
      {
        formKey: 'Config: Checklist',
        language: 'EN',
        id: 'CHK-1',
        status: 'Closed',
        values: {
          DATE: '2026-04-23',
          CHECK_FREQ: 'AM',
          COOK: 'Akkara'
        }
      }
    ];
    const submissions = {
      ensureDestination: jest.fn(() => ({
        sheet: {
          getLastRow: () => records.length + 1,
          getRange: () => ({
            getValues: () => [[0]]
          })
        },
        headers: ['RID'],
        columns: {}
      })),
      buildSubmissionRecord: jest.fn((_formKey: string, _questions: any[], _columns: any, row: any[]) => records[row[0]])
    };
    const service = new AnalyticsPipelineService({ getId: () => 'active-spreadsheet-id' } as any, submissions as any, {} as any);
    const form = {
      title: 'Storage & cleaning checks',
      configSheet: 'Config: Checklist',
      destinationTab: 'Checklist Data',
      followupConfig: {}
    };
    const pipeline = {
      id: 'cleaning_storage_checks',
      type: 'recordTableReport',
      title: 'Cleaning and storage checks',
      email: {
        recipients: ['ops@example.com']
      },
      report: {
        dateFieldId: 'DATE',
        statusFieldId: 'Status',
        completedStatuses: ['Closed'],
        expectedRows: {
          keyFields: ['DATE', 'CHECK_FREQ'],
          daily: [{ CHECK_FREQ: 'AM' }, { CHECK_FREQ: 'PM' }]
        },
        columns: [
          { header: 'Date', source: 'recordField', fieldId: 'DATE' },
          { header: 'Frequency', source: 'recordField', fieldId: 'CHECK_FREQ' },
          { header: 'Responsible cook', source: 'recordField', fieldId: 'COOK' },
          { header: 'Status', source: 'completionStatus', completeLabel: 'Complete', incompleteLabel: 'Incomplete', missingLabel: 'Missing' }
        ]
      }
    };

    const result = service.runPipeline({
      ownerForm: form as any,
      sourceForm: form as any,
      sourceQuestions: [],
      pipeline: pipeline as any,
      startDate: '2026-04-23'
    });

    expect(result.success).toBe(true);
    expect(result.summary).toMatchObject({
      startDate: '2026-04-23',
      endDate: '2026-04-23',
      recordCount: 1,
      rowCount: 2
    });
    expect(writtenValues).toEqual([
      ['Date', 'Frequency', 'Responsible cook', 'Status'],
      ['2026-04-23', 'AM', 'Akkara', 'Complete'],
      ['2026-04-23', 'PM', '', 'Missing']
    ]);
  });
});
