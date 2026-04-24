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
                    { ING: 'Beans', QTY: '1.5', UNIT: 'kg', CAT: 'Legumes' }
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
      lookupDataSourceDetails: jest.fn((_question: any, ingredient: string) =>
        ingredient === 'Beans' ? { SUPPLIER: 'Vendor A', CATEGORY: 'Legumes' } : null
      )
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
        message: 'Rows: {{ROW_COUNT}}'
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
        supplierLookupColumn: 'SUPPLIER'
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
      rowCount: 1,
      attachmentName: 'Ingredients usage 2026-04-20 to 2026-04-23.xlsx',
      attachmentFileId: 'xlsx-file-1'
    });
    expect(createFile).toHaveBeenCalledTimes(1);
    expect((global as any).SpreadsheetApp.openById).toHaveBeenCalledWith('temp-spreadsheet-id');
    expect((global as any).SpreadsheetApp.flush).toHaveBeenCalled();
    expect((global as any).Utilities.sleep).toHaveBeenCalledWith(1500);
    expect((global as any).GmailApp.sendEmail).toHaveBeenCalledTimes(1);
    const [, subject, body, options] = (global as any).GmailApp.sendEmail.mock.calls[0];
    expect(subject).toBe('Ingredients usage 2026-04-20 to 2026-04-23');
    expect(body).toBe('Rows: 1');
    expect(options.attachments[0].getName()).toBe('Ingredients usage 2026-04-20 to 2026-04-23.xlsx');
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
          { header: 'Date', source: 'recordField', fieldId: 'MP_PREP_DATE' },
          { header: 'Customer', source: 'recordField', fieldId: 'MP_DISTRIBUTOR' },
          { header: 'Service', source: 'recordField', fieldId: 'MP_SERVICE' },
          { header: 'Responsible cook', source: 'recordField', fieldId: 'MP_COOK_NAME' },
          { header: 'Dietary type', source: 'lineItemField', fieldId: 'MEAL_TYPE' },
          { header: 'Number of portions delivered', source: 'lineItemField', fieldId: 'FINAL_QTY' },
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
      sourceQuestions: [],
      pipeline: pipeline as any,
      startDate: '2026-04-20'
    });

    expect(result.success).toBe(true);
    expect(result.summary).toMatchObject({
      startDate: '2026-04-20',
      endDate: '2026-04-23',
      recordCount: 1,
      rowCount: 2,
      attachmentName: 'Meals produced and delivered report since 2026-04-20.xlsx'
    });
    expect(writtenValues).toEqual([
      ['Date', 'Customer', 'Service', 'Responsible cook', 'Dietary type', 'Number of portions delivered', 'Leftover used'],
      ['2026-04-21', 'Belliard', 'Lunch', 'Akkara', 'Standard', '9', 'Yes'],
      ['2026-04-21', 'Belliard', 'Lunch', 'Akkara', 'Vegetarian', '3', 'No']
    ]);
    const [, subject, body, options] = (global as any).GmailApp.sendEmail.mock.calls[0];
    expect(subject).toBe('Meals produced and delivered report since 2026-04-20');
    expect(body).toBe('Please find attached the Meals produced and delivered report since 2026-04-20.');
    expect(options.attachments[0].getName()).toBe('Meals produced and delivered report since 2026-04-20.xlsx');
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
