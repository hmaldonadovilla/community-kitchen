import http from 'http';

const { createServer } = require('../cloud-run/api/server');
const { ANALYTICS_SHEET_HEADERS, getAnalyticsSheetName } = require('../cloud-run/api/repositories/analyticsRepository');
const { QUEUE_HEADERS, QUEUE_SHEET_NAME } = require('../cloud-run/api/repositories/analyticsPipelineRepository');
const {
  FirestoreDataSourceRepository,
  GoogleSheetsDataSourceRepository,
  projectDataSourceItem,
  resolveDataSourceCollectionPath
} = require('../cloud-run/api/repositories/dataSourceRepository');
const { FormConfigRepository } = require('../cloud-run/api/repositories/configRepository');
const { GoogleDriveFileRepository } = require('../cloud-run/api/repositories/fileRepository');
const { GoogleSheetsSubmissionRepository } = require('../cloud-run/api/repositories/submissionRepository');
const { TemplateRepository } = require('../cloud-run/api/repositories/templateRepository');

const listen = (server: http.Server): Promise<string> =>
  new Promise(resolve => {
    server.listen(0, () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        throw new Error('Expected test server to bind to a local port.');
      }
      resolve(`http://127.0.0.1:${address.port}`);
    });
  });

const closeServer = (server: http.Server): Promise<void> =>
  new Promise(resolve => {
    server.close(() => resolve());
  });

describe('Cloud Run API server', () => {
  test('wraps implemented RPC calls in the shared response envelope', async () => {
    const fetchDataSource = jest.fn().mockResolvedValue({ items: [{ id: 'one' }], totalCount: 1 });
    const server = createServer({ rpcHandlers: { fetchDataSource } });
    const baseUrl = await listen(server);

    try {
      const res = await fetch(`${baseUrl}/api/rpc`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fnName: 'fetchDataSource',
          args: [{ id: 'Recipes Data' }, 'EN', ['Name'], 10, 'PAGE-2']
        })
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toMatchObject({
        ok: true,
        rpc: { fnName: 'fetchDataSource', argCount: 5 },
        result: { items: [{ id: 'one' }], totalCount: 1 }
      });
      expect(fetchDataSource).toHaveBeenCalledWith({ id: 'Recipes Data' }, 'EN', ['Name'], 10, 'PAGE-2');
    } finally {
      await closeServer(server);
    }
  });

  test('returns a clear error for unsupported RPC functions', async () => {
    const server = createServer({ rpcHandlers: {} });
    const baseUrl = await listen(server);

    try {
      const res = await fetch(`${baseUrl}/api/rpc`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ fnName: 'renderDocTemplate', args: [] })
      });
      const body = await res.json();

      expect(res.status).toBe(501);
      expect(body.ok).toBe(false);
      expect(body.error.message).toContain('Function "renderDocTemplate" is not implemented');
    } finally {
      await closeServer(server);
    }
  });

  test('routes default RPC handlers to Sheets and Drive repositories in drive backend mode', async () => {
    const getSheetValues = jest.fn().mockResolvedValue([
      ['Name', 'Locale'],
      ['Soup', 'EN']
    ]);
    const getFileMetadata = jest.fn().mockResolvedValue({
      id: 'file-1',
      name: 'template.html',
      mimeType: 'text/html'
    });
    const server = createServer({
      env: {
        CK_DATA_BACKEND: 'drive',
        CK_FILE_BACKEND: 'drive',
        CK_DEFAULT_SPREADSHEET_ID: 'spreadsheet-1'
      },
      sheetsClient: { getSheetValues },
      driveClient: { getFileMetadata }
    });
    const baseUrl = await listen(server);

    try {
      const dataRes = await fetch(`${baseUrl}/api/rpc`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fnName: 'fetchDataSource',
          args: [{ id: 'Recipes Data', localeKey: 'Locale' }, 'EN', ['Name'], 10]
        })
      });
      const fileRes = await fetch(`${baseUrl}/api/rpc`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ fnName: 'fetchDriveFileMetadata', args: ['file-1'] })
      });
      const dataBody = await dataRes.json();
      const fileBody = await fileRes.json();

      expect(dataRes.status).toBe(200);
      expect(fileRes.status).toBe(200);
      expect(dataBody.result.items).toEqual(['Soup']);
      expect(fileBody.result).toMatchObject({ id: 'file-1', name: 'template.html', accessible: true });
      expect(getSheetValues).toHaveBeenCalledWith('spreadsheet-1', 'Recipes Data');
      expect(getFileMetadata).toHaveBeenCalledWith('file-1');
    } finally {
      await closeServer(server);
    }
  });

  test('serves bundled form config and Sheets-backed submission reads through RPC', async () => {
    const questions = [
      { id: 'CUSTOMER', type: 'TEXT', qEn: 'Customer', status: 'Active' },
      { id: 'PREP_DATE', type: 'DATE', qEn: 'Prep date', status: 'Active' },
      { id: 'LINES', type: 'LINE_ITEM_GROUP', qEn: 'Lines', status: 'Active' },
      { id: 'SUBMIT', type: 'BUTTON', qEn: 'Submit', status: 'Active' }
    ];
    const bundle = {
      env: 'staging',
      forms: [
        {
          formKey: 'Config: Meal Production',
          generatedAt: '2026-04-30T10:00:00.000Z',
          form: {
            title: 'Meal Production',
            configSheet: 'Config: Meal Production',
            destinationTab: 'Meal Production Data',
            description: 'Capture meals'
          },
          questions,
          definition: {
            title: 'Meal Production',
            questions,
            listView: {
              columns: [
                { fieldId: 'CUSTOMER', kind: 'question' },
                {
                  type: 'rule',
                  fieldId: 'action',
                  cases: [{ when: { fieldId: 'status', notEquals: 'Closed' } }]
                }
              ],
              pageSize: 2,
              defaultSort: { fieldId: 'PREP_DATE', direction: 'desc' },
              search: {
                mode: 'date',
                dateFieldId: 'PREP_DATE',
                initialValue: '2026-04-30'
              }
            }
          },
          dedupRules: [],
          validationErrors: []
        }
      ]
    };
    const getSheetValues = jest.fn().mockResolvedValue([
      [
        'Language',
        'Customer [CUSTOMER]',
        'Prep date [PREP_DATE]',
        'Lines [LINES]',
        'Record ID',
        'Data Version',
        'Created At',
        'Updated At',
        'Status',
        'PDF URL'
      ],
      [
        'EN',
        'Belliard',
        '2026-04-30',
        '[{"name":"Soup"}]',
        'meal-1',
        '3',
        '2026-04-30T08:00:00Z',
        '2026-04-30T09:00:00Z',
        'Draft',
        'https://example.com/meal-1.pdf'
      ],
      [
        'EN',
        'HUB',
        '2026-04-29',
        '[{"name":"Stew"}]',
        'meal-2',
        '2',
        '2026-04-29T08:00:00Z',
        '2026-04-29T09:00:00Z',
        'Closed',
        ''
      ]
    ]);
    const server = createServer({
      env: {
        CK_ENV: 'staging',
        CK_DATA_BACKEND: 'drive',
        CK_FILE_BACKEND: 'drive',
        CK_DEFAULT_SPREADSHEET_ID: 'spreadsheet-1'
      },
      formConfigRepository: new FormConfigRepository({
        bundle,
        env: { CK_ENV: 'staging', CK_DEFAULT_SPREADSHEET_ID: 'spreadsheet-1' }
      }),
      sheetsClient: { getSheetValues }
    });
    const baseUrl = await listen(server);

    try {
      const configRes = await fetch(`${baseUrl}/api/rpc`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ fnName: 'fetchFormConfig', args: ['Config: Meal Production'] })
      });
      const bootstrapRes = await fetch(`${baseUrl}/api/rpc`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fnName: 'fetchBootstrapContextWithOptions',
          args: ['Config: Meal Production', { includeHomeData: true }]
        })
      });
      const recordRes = await fetch(`${baseUrl}/api/rpc`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ fnName: 'fetchSubmissionByRowNumber', args: ['Config: Meal Production', 2] })
      });
      const versionRes = await fetch(`${baseUrl}/api/rpc`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ fnName: 'getRecordVersion', args: ['Config: Meal Production', 'meal-1', 2] })
      });
      const configBody = await configRes.json();
      const bootstrapBody = await bootstrapRes.json();
      const recordBody = await recordRes.json();
      const versionBody = await versionRes.json();

      expect(configBody.result.formKey).toBe('Config: Meal Production');
      expect(bootstrapBody.result).toMatchObject({
        formKey: 'Config: Meal Production',
        configSource: 'cloudRunBundle',
        configEnv: 'staging',
        listResponse: {
          items: [
            expect.objectContaining({
              id: 'meal-1',
              __rowNumber: 2,
              CUSTOMER: 'Belliard',
              PREP_DATE: '2026-04-30',
              status: 'Draft'
            })
          ],
          totalCount: 1,
          contiguousItemCount: 1,
          completeData: true
        },
        records: {},
        analyticsRev: 0
      });
      expect(recordBody.result).toMatchObject({
        formKey: 'Config: Meal Production',
        id: 'meal-1',
        rowNumber: 2,
        dataVersion: 3,
        values: {
          CUSTOMER: 'Belliard',
          PREP_DATE: '2026-04-30',
          LINES: [{ name: 'Soup' }]
        }
      });
      expect(versionBody.result).toMatchObject({
        success: true,
        id: 'meal-1',
        rowNumber: 2,
        dataVersion: 3,
        updatedAt: '2026-04-30T09:00:00Z'
      });
      expect(getSheetValues).toHaveBeenCalledWith('spreadsheet-1', 'Meal Production Data');
    } finally {
      await closeServer(server);
    }
  });

  test('serves Analytics dashboard snapshots and pipelines through Cloud Run RPC', async () => {
    const form = {
      title: 'Meal Production',
      configSheet: 'Config: Meal Production',
      destinationTab: 'Meal Production Data',
      analytics: {
        widgets: [
          {
            id: 'closed_qty',
            label: { en: 'Closed meals' },
            placements: ['listView', 'analyticsPage']
          }
        ],
        pipelines: [
          {
            id: 'ingredient_usage',
            type: 'ingredientUsageReport',
            title: { en: 'Ingredient usage' },
            description: { en: 'Export ingredient usage.' },
            sourceFormKey: 'Config: Meal Production',
            order: 3,
            placements: ['analyticsPage'],
            ui: {
              dateLabel: { en: 'From date' },
              submitLabel: { en: 'Send usage report' },
              queuedNotice: { en: 'Usage report queued.' }
            }
          }
        ]
      }
    };
    const bundle = {
      env: 'staging',
      forms: [
        {
          formKey: 'Config: Meal Production',
          generatedAt: '2026-04-30T10:00:00.000Z',
          form,
          questions: [],
          definition: {
            title: 'Meal Production',
            analytics: {
              widgets: form.analytics.widgets
            }
          },
          dedupRules: [],
          validationErrors: []
        }
      ]
    };
    const analyticsSheetName = getAnalyticsSheetName(form);
    const getSheetValues = jest.fn().mockImplementation(async (_spreadsheetId, tabName) => {
      if (tabName === analyticsSheetName) {
        return [
          ANALYTICS_SHEET_HEADERS,
          [
            'closed_qty',
            JSON.stringify({ en: 'Closed meals' }),
            JSON.stringify(120),
            '120',
            '120 portions',
            JSON.stringify(['listView', 'analyticsPage']),
            '2026-04-30T09:30:00.000Z',
            '5',
            JSON.stringify({ unit: 'portions' })
          ]
        ];
      }
      return [[]];
    });
    const server = createServer({
      env: {
        CK_ENV: 'staging',
        CK_DATA_BACKEND: 'drive',
        CK_FILE_BACKEND: 'drive',
        CK_DEFAULT_SPREADSHEET_ID: 'spreadsheet-1'
      },
      formConfigRepository: new FormConfigRepository({
        bundle,
        env: { CK_ENV: 'staging', CK_DEFAULT_SPREADSHEET_ID: 'spreadsheet-1' }
      }),
      analyticsPageConfig: {
        pageTitle: 'Reports',
        pageDescription: 'Operational reports.',
        copy: {
          loadingLabel: 'Loading reports...',
          emptyLabel: 'No reports are available.',
          backToLandingLabel: 'Apps',
          pendingNavigationTitle: 'Please wait',
          pendingNavigationMessage: 'Opening forms...'
        },
        landingTile: {
          title: 'Reports',
          section: 'admin',
          order: 40
        },
        sections: [
          {
            id: 'meal-production',
            title: 'Meal Production',
            widgets: [
              {
                id: 'closed_qty_dashboard',
                sourceFormKey: 'Config: Meal Production',
                sourceWidgetId: 'closed_qty',
                title: 'Closed portions'
              }
            ]
          }
        ]
      },
      sheetsClient: { getSheetValues }
    });
    const baseUrl = await listen(server);

    try {
      const dashboardRes = await fetch(`${baseUrl}/api/rpc`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ fnName: 'fetchAnalyticsDashboard', args: [] })
      });
      const bootstrapRes = await fetch(`${baseUrl}/api/rpc`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fnName: 'fetchBootstrapContextWithOptions',
          args: ['Config: Meal Production', { includeAnalytics: true }]
        })
      });
      const dashboardBody = await dashboardRes.json();
      const bootstrapBody = await bootstrapRes.json();

      expect(dashboardRes.status).toBe(200);
      expect(dashboardBody.result).toMatchObject({
        pageTitle: 'Reports',
        sections: [
          {
            id: 'meal-production',
            widgets: [
              {
                dashboardWidgetId: 'closed_qty_dashboard',
                title: 'Closed portions',
                sourceFormKey: 'Config: Meal Production',
                sourceWidgetId: 'closed_qty',
                valueNumber: 120,
                revision: 5
              }
            ]
          }
        ],
        pipelines: [
          {
            dashboardPipelineId: 'Config: Meal Production::ingredient_usage',
            pipelineId: 'ingredient_usage',
            title: 'Ingredient usage',
            dateLabel: 'From date',
            submitLabel: 'Send usage report',
            queuedNotice: 'Usage report queued.'
          }
        ],
        updatedAt: '2026-04-30T09:30:00.000Z',
        errors: [],
        envTag: 'staging'
      });
      expect(bootstrapBody.result.analytics).toMatchObject({
        formKey: 'Config: Meal Production',
        revision: 5,
        items: [expect.objectContaining({ id: 'closed_qty', valueNumber: 120 })]
      });
      expect(bootstrapBody.result.analyticsRev).toBe(5);
      expect(getSheetValues).toHaveBeenCalledWith('spreadsheet-1', analyticsSheetName);
    } finally {
      await closeServer(server);
    }
  });

  test('queues Analytics pipeline runs through Cloud Run RPC', async () => {
    const bundle = {
      forms: [
        {
          formKey: 'Config: Meal Production',
          form: {
            title: 'Meal Production',
            configSheet: 'Config: Meal Production',
            destinationTab: 'Meal Production Data',
            analytics: {
              pipelines: [
                {
                  id: 'meals_report',
                  type: 'recordTableReport',
                  title: 'Meals report',
                  placements: ['analyticsPage'],
                  ui: { queuedNotice: 'Queued on Cloud Run.' },
                  email: { recipients: ['ops@example.test'] },
                  attachment: { folderId: 'exports-folder' },
                  report: {
                    dateFieldId: 'DATE',
                    columns: [{ header: 'Date', source: 'recordField', fieldId: 'DATE' }]
                  }
                }
              ]
            }
          },
          questions: [],
          definition: { questions: [] },
          dedupRules: []
        }
      ]
    };
    const getSheetValues = jest.fn().mockRejectedValue(new Error('Unable to parse range'));
    const addSheet = jest.fn().mockResolvedValue({ replies: [{}] });
    const updateRowValues = jest.fn().mockResolvedValue({ updatedRows: 1 });
    const appendRows = jest.fn().mockResolvedValue({ updates: { updatedRows: 1 } });
    const server = createServer({
      env: {
        CK_DATA_BACKEND: 'drive',
        CK_FILE_BACKEND: 'drive',
        CK_DEFAULT_SPREADSHEET_ID: 'spreadsheet-1'
      },
      formConfigRepository: new FormConfigRepository({ bundle }),
      sheetsClient: { getSheetValues, addSheet, updateRowValues, appendRows },
      gmailClient: { isConfigured: () => true, sendEmail: jest.fn() }
    });
    const baseUrl = await listen(server);

    try {
      const res = await fetch(`${baseUrl}/api/rpc`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fnName: 'queueAnalyticsPipelineRun',
          args: [{ ownerFormKey: 'Config: Meal Production', pipelineId: 'meals_report', startDate: '2026-04-30' }]
        })
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.result).toMatchObject({ success: true, message: 'Queued on Cloud Run.' });
      expect(addSheet).toHaveBeenCalledWith('spreadsheet-1', '__CK_ANALYTICS_PIPELINE_QUEUE', { hidden: true });
      expect(updateRowValues).toHaveBeenCalledWith(
        'spreadsheet-1',
        '__CK_ANALYTICS_PIPELINE_QUEUE',
        1,
        expect.arrayContaining(['Job ID', 'Owner Form Key', 'Pipeline ID'])
      );
      expect(appendRows).toHaveBeenCalledWith(
        'spreadsheet-1',
        '__CK_ANALYTICS_PIPELINE_QUEUE',
        [expect.arrayContaining(['Config: Meal Production', 'meals_report', '2026-04-30', expect.any(String), 'pending'])]
      );
    } finally {
      await closeServer(server);
    }
  });

  test('runs queued Analytics pipeline exports through Sheets, Drive, and Gmail clients', async () => {
    const bundle = {
      forms: [
        {
          formKey: 'Config: Meal Production',
          form: {
            title: 'Meal Production',
            configSheet: 'Config: Meal Production',
            destinationTab: 'Meal Production Data',
            analytics: {
              pipelines: [
                {
                  id: 'meals_report',
                  type: 'recordTableReport',
                  title: 'Meals report',
                  sourceFormKey: 'Config: Meal Production',
                  email: {
                    recipients: ['ops@example.test'],
                    subject: 'Meals since {{START_DATE}}',
                    message: 'Rows: {{ROW_COUNT}}'
                  },
                  attachment: {
                    folderId: 'exports-folder',
                    fileNameTemplate: 'Meals {{START_DATE}}.xlsx',
                    sheetName: 'Meals'
                  },
                  report: {
                    dateFieldId: 'DATE',
                    columns: [
                      { header: 'Date', source: 'recordField', fieldId: 'DATE' },
                      { header: 'Customer', source: 'recordField', fieldId: 'CUSTOMER' }
                    ]
                  }
                }
              ]
            }
          },
          questions: [
            { id: 'DATE', type: 'DATE', qEn: 'Date', status: 'Active' },
            { id: 'CUSTOMER', type: 'TEXT', qEn: 'Customer', status: 'Active' }
          ],
          definition: { questions: [] },
          dedupRules: []
        }
      ]
    };
    const queueRows: unknown[][] = [
      QUEUE_HEADERS,
      ['job-1', 'Config: Meal Production', 'meals_report', '2026-04-30', '2026-04-30T10:00:00Z', 'pending', '', '', '']
    ];
    const getSheetValues = jest.fn().mockImplementation(async (_spreadsheetId, tabName) => {
      if (tabName === QUEUE_SHEET_NAME) return queueRows.map(row => (row as unknown[]).slice());
      return [];
    });
    const updateRowValues = jest.fn().mockImplementation(async (_spreadsheetId, tabName, rowNumber, values) => {
      if (tabName === QUEUE_SHEET_NAME) queueRows[rowNumber - 1] = values.slice();
      return { updatedRows: 1 };
    });
    const createSpreadsheet = jest.fn().mockResolvedValue({
      spreadsheetId: 'temp-report-sheet',
      sheets: [{ properties: { sheetId: 123 } }]
    });
    const updateValuesRange = jest.fn().mockResolvedValue({ updatedRows: 2 });
    const batchUpdate = jest.fn().mockResolvedValue({ replies: [{}] });
    const exportFile = jest.fn().mockResolvedValue(Buffer.from('xlsx-bytes', 'utf8'));
    const createFile = jest.fn().mockResolvedValue({
      id: 'xlsx-1',
      webViewLink: 'https://drive.google.com/open?id=xlsx-1'
    });
    const trashFile = jest.fn().mockResolvedValue({ success: true });
    const sendEmail = jest.fn().mockResolvedValue({ id: 'gmail-message-1' });
    const server = createServer({
      env: {
        CK_DATA_BACKEND: 'drive',
        CK_FILE_BACKEND: 'drive',
        CK_DEFAULT_SPREADSHEET_ID: 'spreadsheet-1'
      },
      formConfigRepository: new FormConfigRepository({ bundle }),
      submissionRepository: {
        records: jest.fn().mockResolvedValue([
          {
            formKey: 'Config: Meal Production',
            id: 'meal-1',
            language: 'EN',
            values: { DATE: '2026-04-30', CUSTOMER: 'Belliard' },
            status: 'Closed'
          }
        ])
      },
      sheetsClient: { getSheetValues, updateRowValues, createSpreadsheet, updateValuesRange, batchUpdate },
      driveClient: { exportFile },
      fileRepository: { createFile, trashFile },
      gmailClient: { isConfigured: () => true, sendEmail }
    });
    const baseUrl = await listen(server);

    try {
      const res = await fetch(`${baseUrl}/api/rpc`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ fnName: 'runQueuedAnalyticsPipelineJobs', args: [{ limit: 1 }] })
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.result).toMatchObject({ success: true, processed: 1, errors: [] });
      expect(createSpreadsheet).toHaveBeenCalledWith('Meals Thu,30-Apr-2026', { sheetName: 'Meals' });
      expect(updateValuesRange).toHaveBeenCalledWith('temp-report-sheet', "'Meals'!A1:B2", [
        ['Date', 'Customer'],
        ['2026-04-30', 'Belliard']
      ]);
      expect(exportFile).toHaveBeenCalledWith(
        'temp-report-sheet',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      expect(createFile).toHaveBeenCalledWith(
        {
          name: 'Meals Thu,30-Apr-2026.xlsx',
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          buffer: Buffer.from('xlsx-bytes', 'utf8')
        },
        { folderId: 'exports-folder' }
      );
      expect(sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: ['ops@example.test'],
          subject: 'Meals since Thu,30-Apr-2026',
          textBody: 'Rows: 1',
          attachments: [
            {
              fileName: 'Meals Thu,30-Apr-2026.xlsx',
              mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              buffer: Buffer.from('xlsx-bytes', 'utf8')
            }
          ]
        })
      );
      expect(trashFile).toHaveBeenCalledWith('temp-report-sheet');
      expect(updateRowValues).toHaveBeenLastCalledWith(
        'spreadsheet-1',
        QUEUE_SHEET_NAME,
        2,
        expect.arrayContaining(['done'])
      );
    } finally {
      await closeServer(server);
    }
  });

  test('renders Sheets-backed summary HTML templates through Cloud Run RPC', async () => {
    const questions = [
      {
        id: 'CUSTOMER',
        type: 'TEXT',
        qEn: 'Customer',
        status: 'Active',
        dataSource: {
          id: 'Customers Data',
          projection: ['value'],
          mapping: { Name: 'value' },
          limit: 10
        }
      },
      { id: 'NOTES', type: 'PARAGRAPH', qEn: 'Notes', status: 'Active' }
    ];
    const bundle = {
      env: 'staging',
      forms: [
        {
          formKey: 'Config: Delivery',
          generatedAt: '2026-04-30T10:00:00.000Z',
          form: {
            title: 'Delivery',
            configSheet: 'Config: Delivery',
            destinationTab: 'Delivery Data',
            summaryHtmlTemplateId: 'template-html-1'
          },
          questions,
          definition: { title: 'Delivery', questions },
          dedupRules: [],
          validationErrors: []
        }
      ]
    };
    const template = [
      '<section>',
      '<h1>{{CUSTOMER}}</h1>',
      '<p>{{LABEL(NOTES)}}: {{NOTES}}</p>',
      '<p>{{CUSTOMER.EMAIL}}</p>',
      '</section>'
    ].join('');
    const getSheetValues = jest.fn().mockImplementation(async (_spreadsheetId, tabName) => {
      if (tabName === 'Customers Data') {
        return [
          ['Name', 'Email'],
          ['Belliard', 'belliard@example.test']
        ];
      }
      return [
        ['Language', 'Customer [CUSTOMER]', 'Notes [NOTES]', 'Record ID', 'Data Version', 'Created At', 'Updated At', 'Status', 'PDF URL'],
        ['EN', 'Belliard', 'Line 1\nLine 2', 'delivery-1', '4', '2026-04-30T08:00:00Z', '2026-04-30T09:00:00Z', 'Draft', '']
      ];
    });
    const driveClient = {
      getFileMetadata: jest.fn().mockResolvedValue({ id: 'template-html-1', name: 'summary.html', mimeType: 'text/html' }),
      downloadFile: jest.fn().mockResolvedValue(Buffer.from(template, 'utf8'))
    };
    const server = createServer({
      env: {
        CK_ENV: 'staging',
        CK_DATA_BACKEND: 'drive',
        CK_FILE_BACKEND: 'drive',
        CK_DEFAULT_SPREADSHEET_ID: 'spreadsheet-1'
      },
      formConfigRepository: new FormConfigRepository({
        bundle,
        env: { CK_ENV: 'staging', CK_DEFAULT_SPREADSHEET_ID: 'spreadsheet-1' }
      }),
      sheetsClient: { getSheetValues },
      driveClient
    });
    const baseUrl = await listen(server);

    try {
      const res = await fetch(`${baseUrl}/api/rpc`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ fnName: 'fetchSummaryRecord', args: ['Config: Delivery', 'EN', 'delivery-1', 2] })
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.result).toMatchObject({
        success: true,
        record: { id: 'delivery-1' }
      });
      expect(body.result.html).toContain('<h1>Belliard</h1>');
      expect(body.result.html).toContain('Notes: Line 1<br/>Line 2');
      expect(body.result.html).toContain('belliard@example.test');
      expect(driveClient.downloadFile).toHaveBeenCalledWith('template-html-1');
    } finally {
      await closeServer(server);
    }
  });

  test('renders bundled HTML PDF previews through the Cloud Run template repository', async () => {
    const createGoogleDocFromHtml = jest.fn().mockResolvedValue({
      fileId: 'preview-doc-1',
      previewUrl: 'https://docs.google.com/document/d/preview-doc-1/preview'
    });
    const renderPdfBufferFromHtml = jest.fn().mockResolvedValue(Buffer.from('%PDF preview', 'utf8'));
    const trashFile = jest.fn().mockResolvedValue({ success: true });
    const repository = new TemplateRepository({
      fileRepository: {
        createGoogleDocFromHtml,
        renderPdfBufferFromHtml,
        trashFile
      },
      configRepository: {
        fetchFormConfig: jest.fn().mockReturnValue({
          form: {
            title: 'Meal Production',
            followupConfig: {
              pdfFolderId: 'pdf-folder',
              pdfFileNameFieldId: 'MP_ID'
            }
          },
          questions: [
            { id: 'MP_ID', type: 'TEXT', qEn: 'Meal production id', status: 'Active' },
            {
              id: 'PREVIEW',
              type: 'BUTTON',
              qEn: 'Preview',
              status: 'Active',
              button: {
                action: 'renderDocTemplate',
                templateId: 'bundle:meal_production.pdf.html'
              }
            }
          ]
        })
      },
      dataSourceRepository: { fetchDataSource: jest.fn().mockResolvedValue({ items: [] }) },
      templateRenderers: {
        resolveTemplateId: jest.fn().mockReturnValue('bundle:meal_production.pdf.html'),
        renderHtmlFromHtmlTemplate: jest.fn().mockReturnValue({
          success: true,
          html: '<h1>{{MP_ID}}</h1>'
        })
      }
    });

    const preview = await repository.renderDocTemplateHtml(
      {
        formKey: 'Config: Meal Production',
        language: 'EN',
        values: { MP_ID: 'mp-1' },
        id: 'record-1'
      },
      'PREVIEW'
    );
    const pdf = await repository.renderDocTemplatePdfPreview(
      {
        formKey: 'Config: Meal Production',
        language: 'EN',
        values: { MP_ID: 'mp-1' },
        id: 'record-1'
      },
      'PREVIEW'
    );
    const cleanup = await repository.trashPreviewArtifact(preview.cleanupToken);

    expect(preview).toMatchObject({
      success: true,
      previewFileId: 'preview-doc-1',
      previewUrl: 'https://docs.google.com/document/d/preview-doc-1/preview'
    });
    expect(preview.cleanupToken).toBeTruthy();
    expect(pdf).toMatchObject({
      success: true,
      mimeType: 'application/pdf',
      fileName: 'Meal Production - Preview - mp-1.pdf'
    });
    expect(pdf.pdfBase64).toBe(Buffer.from('%PDF preview', 'utf8').toString('base64'));
    expect(createGoogleDocFromHtml).toHaveBeenCalledWith(
      expect.objectContaining({
        folderId: 'pdf-folder',
        name: 'Meal Production - Preview - mp-1 - Preview'
      })
    );
    expect(renderPdfBufferFromHtml).toHaveBeenCalledWith(
      expect.objectContaining({
        folderId: 'pdf-folder',
        name: 'Meal Production - Preview - mp-1 - Preview'
      })
    );
    expect(cleanup).toEqual({ success: true });
    expect(trashFile).toHaveBeenCalledWith('preview-doc-1');
  });

  test('renders Google Doc templates through Docs API placeholder mutation', async () => {
    const copyFile = jest.fn().mockResolvedValue({
      fileId: 'doc-copy-1',
      url: 'https://docs.google.com/document/d/doc-copy-1/edit'
    });
    const readTextFile = jest.fn().mockResolvedValue({
      raw: 'Customer: {{CUSTOMER}}\nFallback: {{DEFAULT(EMPTY, "Fallback")}}'
    });
    const batchUpdate = jest.fn().mockResolvedValue({ replies: [] });
    const exportGoogleDocToPdfBuffer = jest.fn().mockResolvedValue(Buffer.from('%PDF doc', 'utf8'));
    const createFile = jest.fn().mockResolvedValue({
      id: 'pdf-1',
      webViewLink: 'https://drive.google.com/open?id=pdf-1'
    });
    const trashFile = jest.fn().mockResolvedValue({ success: true });
    const repository = new TemplateRepository({
      fileRepository: {
        copyFile,
        readTextFile,
        exportGoogleDocToPdfBuffer,
        createFile,
        trashFile
      },
      docsClient: { batchUpdate },
      configRepository: {
        fetchFormConfig: jest.fn().mockReturnValue({
          form: {
            title: 'Delivery',
            followupConfig: {
              pdfFolderId: 'pdf-folder',
              pdfFileNameFieldId: 'CUSTOMER'
            }
          },
          questions: [
            { id: 'CUSTOMER', type: 'TEXT', qEn: 'Customer', status: 'Active' },
            {
              id: 'DOC',
              type: 'BUTTON',
              qEn: 'Doc',
              status: 'Active',
              button: {
                action: 'renderDocTemplate',
                templateId: 'google-doc-template-1'
              }
            }
          ]
        })
      },
      dataSourceRepository: { fetchDataSource: jest.fn().mockResolvedValue({ items: [] }) },
      templateRenderers: {
        resolveTemplateId: jest.fn().mockReturnValue('google-doc-template-1'),
        collectLineItemRows: jest.fn().mockReturnValue({}),
        buildPlaceholderMap: jest.fn().mockReturnValue({
          '{{CUSTOMER}}': 'Belliard',
          '{{EMPTY}}': ''
        }),
        addLabelPlaceholders: jest.fn(),
        addConsolidatedPlaceholders: jest.fn(),
        collectValidationWarnings: jest.fn().mockReturnValue([]),
        addPlaceholderVariants: jest.fn((map, key, value) => {
          map[`{{${key}}}`] = value || '';
        }),
        applyPlaceholders: jest.fn().mockReturnValue('Fallback')
      }
    });

    const result = await repository.renderDocTemplate(
      {
        formKey: 'Config: Delivery',
        language: 'EN',
        values: { CUSTOMER: 'Belliard' },
        id: 'delivery-1'
      },
      'DOC'
    );

    expect(result).toEqual({
      success: true,
      pdfUrl: 'https://drive.google.com/open?id=pdf-1',
      fileId: 'pdf-1'
    });
    expect(copyFile).toHaveBeenCalledWith('google-doc-template-1', {
      name: 'Delivery - Doc - Belliard',
      folderId: 'pdf-folder'
    });
    expect(batchUpdate).toHaveBeenCalledWith(
      'doc-copy-1',
      expect.arrayContaining([
        expect.objectContaining({
          replaceAllText: expect.objectContaining({
            containsText: { text: '{{DEFAULT(EMPTY, "Fallback")}}', matchCase: true },
            replaceText: 'Fallback'
          })
        }),
        expect.objectContaining({
          replaceAllText: expect.objectContaining({
            containsText: { text: '{{CUSTOMER}}', matchCase: true },
            replaceText: 'Belliard'
          })
        })
      ])
    );
    expect(exportGoogleDocToPdfBuffer).toHaveBeenCalledWith('doc-copy-1');
    expect(createFile).toHaveBeenCalledWith(
      { name: 'Delivery - Doc - Belliard.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF doc', 'utf8') },
      { folderId: 'pdf-folder' }
    );
    expect(trashFile).toHaveBeenCalledWith('doc-copy-1');
  });

  test('protects Cloud Run scheduled job endpoints with the scheduler secret', async () => {
    const previousSecret = process.env.CK_SCHEDULER_SECRET;
    process.env.CK_SCHEDULER_SECRET = 'scheduler-secret';
    const runDailyAnalyticsRecompute = jest.fn().mockResolvedValue({ success: true, updatedForms: 1, errors: [] });
    const server = createServer({ rpcHandlers: { runDailyAnalyticsRecompute } });
    const baseUrl = await listen(server);

    try {
      const unauthorized = await fetch(`${baseUrl}/api/jobs/runDailyAnalyticsRecompute`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}'
      });
      const authorized = await fetch(`${baseUrl}/api/jobs/runDailyAnalyticsRecompute`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: 'Bearer scheduler-secret'
        },
        body: '{}'
      });
      const authorizedBody = await authorized.json();

      expect(unauthorized.status).toBe(401);
      expect(authorized.status).toBe(200);
      expect(authorizedBody).toMatchObject({
        ok: true,
        job: { name: 'runDailyAnalyticsRecompute' },
        result: { success: true, updatedForms: 1, errors: [] }
      });
      expect(runDailyAnalyticsRecompute).toHaveBeenCalledWith({});
    } finally {
      if (previousSecret === undefined) delete process.env.CK_SCHEDULER_SECRET;
      else process.env.CK_SCHEDULER_SECRET = previousSecret;
      await closeServer(server);
    }
  });

  test('serves staging-safe Sheets-backed dedup checks and record saves through RPC', async () => {
    const questions = [
      { id: 'CUSTOMER', type: 'TEXT', qEn: 'Customer', status: 'Active' },
      { id: 'PREP_DATE', type: 'DATE', qEn: 'Prep date', status: 'Active' },
      { id: 'NOTES', type: 'TEXT', qEn: 'Notes', status: 'Active' }
    ];
    const bundle = {
      forms: [
        {
          formKey: 'Config: Meal Production',
          form: {
            title: 'Meal Production',
            configSheet: 'Config: Meal Production',
            destinationTab: 'Meal Production Data',
            followupConfig: {
              statusTransitions: {
                inProgress: { en: 'Draft' }
              }
            }
          },
          questions,
          definition: { questions },
          dedupRules: [
            {
              id: 'uniqueDailyCustomer',
              scope: 'form',
              keys: ['CUSTOMER', 'PREP_DATE'],
              matchMode: 'caseInsensitive',
              onConflict: 'reject',
              message: { en: 'Duplicate meal.' }
            }
          ]
        }
      ]
    };
    const rows = [
      ['Language', 'Customer [CUSTOMER]', 'Prep date [PREP_DATE]', 'Notes [NOTES]', 'Record ID', 'Data Version', 'Created At', 'Updated At', 'Status'],
      ['EN', 'Belliard', '2026-04-30', 'Original', 'meal-1', '3', '2026-04-30T08:00:00Z', '2026-04-30T09:00:00Z', 'Draft']
    ];
    const getSheetValues = jest.fn().mockImplementation(async () => rows.map(row => row.slice()));
    const updateRowValues = jest.fn().mockImplementation(async (_spreadsheetId, _tabName, rowNumber, values) => {
      rows[rowNumber - 1] = values.slice();
      return { updatedRows: 1 };
    });
    const server = createServer({
      env: {
        CK_DATA_BACKEND: 'drive',
        CK_FILE_BACKEND: 'drive',
        CK_DEFAULT_SPREADSHEET_ID: 'spreadsheet-1'
      },
      formConfigRepository: new FormConfigRepository({ bundle }),
      sheetsClient: { getSheetValues, updateRowValues }
    });
    const baseUrl = await listen(server);

    try {
      const conflictRes = await fetch(`${baseUrl}/api/rpc`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fnName: 'checkDedupConflict',
          args: [
            {
              formKey: 'Config: Meal Production',
              language: 'EN',
              values: { CUSTOMER: 'belliard', PREP_DATE: '2026-04-30' }
            }
          ]
        })
      });
      const saveRes = await fetch(`${baseUrl}/api/rpc`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fnName: 'saveSubmissionWithId',
          args: [
            {
              formKey: 'Config: Meal Production',
              language: 'EN',
              id: 'meal-1',
              __ckSaveMode: 'draft',
              __ckClientDataVersion: 3,
              __ckSkipSubmitEffects: true,
              values: {
                CUSTOMER: 'HUB',
                PREP_DATE: '2026-05-01',
                NOTES: 'Updated through Cloud Run'
              }
            }
          ]
        })
      });
      const conflictBody = await conflictRes.json();
      const saveBody = await saveRes.json();

      expect(conflictBody.result).toMatchObject({
        success: true,
        conflict: {
          ruleId: 'uniqueDailyCustomer',
          message: 'Duplicate meal.',
          existingRecordId: 'meal-1',
          existingRowNumber: 2
        }
      });
      expect(saveBody.result).toMatchObject({
        success: true,
        message: 'Saved to sheet',
        meta: {
          id: 'meal-1',
          rowNumber: 2,
          dataVersion: 4,
          operation: 'update'
        }
      });
      expect(updateRowValues).toHaveBeenCalledWith(
        'spreadsheet-1',
        'Meal Production Data',
        2,
        expect.arrayContaining(['EN', 'HUB', '2026-05-01', 'Updated through Cloud Run', 'meal-1', 4])
      );
      expect(rows[1][8]).toBe('Draft');
    } finally {
      await closeServer(server);
    }
  });

  test('maintains the aligned record index row after guarded Sheets saves', async () => {
    const questions = [
      { id: 'CUSTOMER', type: 'TEXT', qEn: 'Customer', status: 'Active' },
      { id: 'PREP_DATE', type: 'DATE', qEn: 'Prep date', status: 'Active' },
      { id: 'NOTES', type: 'TEXT', qEn: 'Notes', status: 'Active' }
    ];
    const bundle = {
      forms: [
        {
          formKey: 'Config: Meal Production',
          form: {
            title: 'Meal Production',
            configSheet: 'Config: Meal Production',
            destinationTab: 'Meal Production Data'
          },
          questions,
          definition: { questions },
          dedupRules: [
            {
              id: 'unique daily customer',
              scope: 'form',
              keys: ['CUSTOMER', 'PREP_DATE'],
              matchMode: 'caseInsensitive',
              onConflict: 'reject',
              message: { en: 'Duplicate meal.' }
            }
          ]
        }
      ]
    };
    const rows = [
      [
        'Language',
        'Customer [CUSTOMER]',
        'Prep date [PREP_DATE]',
        'Notes [NOTES]',
        'Record ID',
        'Data Version',
        'Created At',
        'Updated At',
        'Status'
      ]
    ];
    const indexRows: unknown[][] = [];
    const getSheetValues = jest.fn().mockImplementation(async (_spreadsheetId, tabName) => {
      if (tabName.startsWith('__CK_INDEX__')) {
        if (!indexRows.length) throw new Error('Unable to parse range');
        return indexRows.map(row => row.slice());
      }
      return rows.map(row => row.slice());
    });
    const addSheet = jest.fn().mockResolvedValue({ replies: [{}] });
    const updateRowValues = jest.fn().mockImplementation(async (_spreadsheetId, tabName, rowNumber, values) => {
      if (tabName.startsWith('__CK_INDEX__')) {
        indexRows[rowNumber - 1] = values.slice();
        return { updatedRows: 1 };
      }
      rows[rowNumber - 1] = values.slice();
      return { updatedRows: 1 };
    });
    const server = createServer({
      env: {
        CK_DATA_BACKEND: 'drive',
        CK_FILE_BACKEND: 'drive',
        CK_DEFAULT_SPREADSHEET_ID: 'spreadsheet-1'
      },
      formConfigRepository: new FormConfigRepository({ bundle }),
      sheetsClient: { getSheetValues, updateRowValues, addSheet }
    });
    const baseUrl = await listen(server);

    try {
      const saveRes = await fetch(`${baseUrl}/api/rpc`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fnName: 'saveSubmissionWithId',
          args: [
            {
              formKey: 'Config: Meal Production',
              language: 'EN',
              id: 'meal-index-1',
              __ckSaveMode: 'draft',
              __ckSkipSubmitEffects: true,
              values: {
                CUSTOMER: 'HUB',
                PREP_DATE: '2026-05-01',
                NOTES: 'Create through Cloud Run'
              }
            }
          ]
        })
      });
      const saveBody = await saveRes.json();

      expect(saveRes.status).toBe(200);
      expect(saveBody.result).toMatchObject({
        success: true,
        meta: {
          id: 'meal-index-1',
          rowNumber: 2,
          dataVersion: 1,
          operation: 'create'
        }
      });
      expect(addSheet).toHaveBeenCalledWith(
        'spreadsheet-1',
        expect.stringMatching(/^__CK_INDEX__Meal Production Data__/),
        { hidden: true }
      );
      expect(updateRowValues).toHaveBeenCalledWith(
        'spreadsheet-1',
        expect.stringMatching(/^__CK_INDEX__Meal Production Data__/),
        1,
        ['Record ID', 'Row', 'Data Version', 'Updated At (ISO)', 'Created At (ISO)', 'DEDUP:unique_daily_customer']
      );
      expect(updateRowValues).toHaveBeenCalledWith(
        'spreadsheet-1',
        expect.stringMatching(/^__CK_INDEX__Meal Production Data__/),
        2,
        ['meal-index-1', 2, 1, expect.any(String), expect.any(String), 'hub||2026-05-01']
      );
    } finally {
      await closeServer(server);
    }
  });

  test('applies createRecord submit effects through Sheets-backed saves', async () => {
    const sourceQuestions = [
      { id: 'CUSTOMER', type: 'TEXT', qEn: 'Customer', status: 'Active' },
      {
        id: 'MEALS',
        type: 'LINE_ITEM_GROUP',
        qEn: 'Meals',
        status: 'Active',
        lineItemConfig: {
          fields: [{ id: 'MEAL_TYPE', type: 'TEXT' }],
          subGroups: [
            {
              id: 'MP_TYPE_LI',
              fields: [
                { id: 'PREP_TYPE', type: 'TEXT' },
                { id: 'RECIPE', type: 'TEXT' },
                { id: 'MP_LEFTOVER_PORTIONS_CAPTURE', type: 'NUMBER' }
              ]
            }
          ]
        }
      }
    ];
    const targetQuestions = [
      { id: 'LEFTOVER_STATUS', type: 'TEXT', qEn: 'Status', status: 'Active' },
      { id: 'LEFTOVER_MEAL_TYPE', type: 'TEXT', qEn: 'Meal type', status: 'Active' },
      { id: 'LEFTOVER_RECIPE', type: 'TEXT', qEn: 'Recipe', status: 'Active' },
      { id: 'LEFTOVER_PORTIONS', type: 'NUMBER', qEn: 'Portions', status: 'Active' },
      { id: 'DIETARY_APPLICABILITY', type: 'TEXT', qEn: 'Dietary', status: 'Active' },
      {
        id: 'LEFTOVER_INGREDIENTS_LI',
        type: 'LINE_ITEM_GROUP',
        qEn: 'Ingredients',
        status: 'Active',
        lineItemConfig: {
          fields: [
            { id: 'ING', type: 'TEXT' },
            { id: 'QTY', type: 'NUMBER' }
          ]
        }
      },
      { id: 'LEFTOVER_SOURCE_RECORD_ID', type: 'TEXT', qEn: 'Source record', status: 'Active' }
    ];
    const lookupQuestions = [
      { id: 'INGREDIENT_NAME', type: 'TEXT', qEn: 'Ingredient', status: 'Active' },
      { id: 'DIETARY_APPLICABILITY', type: 'TEXT', qEn: 'Dietary', status: 'Active' }
    ];
    const bundle = {
      forms: [
        {
          formKey: 'Config: Meal Production',
          form: {
            title: 'Meal Production',
            configSheet: 'Config: Meal Production',
            destinationTab: 'Meal Production Data',
            followupConfig: {
              submitEffects: [
                {
                  id: 'captureLeftovers',
                  type: 'createRecord',
                  targetFormKey: 'Config: Leftover Inventory',
                  runOn: 'both',
                  recordId: 'leftover::{{source.id}}::{{lineItem.rowId}}',
                  when: { fieldId: 'status', equals: ['Closed'] },
                  status: 'available',
                  forEachLineItem: {
                    groupId: 'MEALS',
                    subGroupPath: ['MP_TYPE_LI'],
                    when: {
                      all: [
                        { fieldId: 'PREP_TYPE', equals: ['Cook'] },
                        { fieldId: 'MP_LEFTOVER_PORTIONS_CAPTURE', greaterThan: 0 }
                      ]
                    }
                  },
                  values: {
                    LEFTOVER_STATUS: 'available',
                    LEFTOVER_MEAL_TYPE: '{{parent.MEAL_TYPE}}',
                    LEFTOVER_RECIPE: { op: 'firstNonEmpty', values: ['{{parent.MISSING_RECIPE}}', '{{row.RECIPE}}'] },
                    LEFTOVER_PORTIONS: '{{row.MP_LEFTOVER_PORTIONS_CAPTURE}}',
                    DIETARY_APPLICABILITY: {
                      op: 'lookupSetIntersection',
                      collection: {
                        op: 'filterCollection',
                        collectionPath: 'row.MP_LEFTOVER_INGREDIENTS_CAPTURE_LI',
                        when: { fieldId: 'ING_SELECTED', equals: true },
                        pickFields: ['ING']
                      },
                      itemFieldId: 'ING',
                      lookupFormKey: 'Config: Ingredients Management',
                      lookupKeyFieldId: 'INGREDIENT_NAME',
                      lookupValueFieldId: 'DIETARY_APPLICABILITY',
                      splitOn: ',',
                      joinWith: ', ',
                      fallback: '{{parent.MEAL_TYPE}}'
                    },
                    LEFTOVER_INGREDIENTS_LI: {
                      op: 'filterCollection',
                      collectionPath: 'row.MP_LEFTOVER_INGREDIENTS_CAPTURE_LI',
                      when: { fieldId: 'ING_SELECTED', equals: true },
                      pickFields: ['ING', 'QTY']
                    },
                    LEFTOVER_SOURCE_RECORD_ID: '{{source.id}}'
                  }
                }
              ]
            }
          },
          questions: sourceQuestions,
          definition: { questions: sourceQuestions },
          dedupRules: []
        },
        {
          formKey: 'Config: Leftover Inventory',
          form: {
            title: 'Leftover Inventory',
            configSheet: 'Config: Leftover Inventory',
            destinationTab: 'Leftover Inventory Data',
            followupConfig: { statusFieldId: 'LEFTOVER_STATUS' }
          },
          questions: targetQuestions,
          definition: { questions: targetQuestions },
          dedupRules: []
        },
        {
          formKey: 'Config: Ingredients Management',
          form: {
            title: 'Ingredients Management',
            configSheet: 'Config: Ingredients Management',
            destinationTab: 'Ingredients Management Data'
          },
          questions: lookupQuestions,
          definition: { questions: lookupQuestions },
          dedupRules: []
        }
      ]
    };
    const mealRows = [
      ['Language', 'Customer [CUSTOMER]', 'Meals [MEALS]', 'Record ID', 'Data Version', 'Created At', 'Updated At', 'Status'],
      ['EN', 'Belliard', '[]', 'meal-submit-1', '2', '2026-04-30T08:00:00Z', '2026-04-30T09:00:00Z', 'Draft']
    ];
    const leftoverRows = [
      [
        'Language',
        'Status [LEFTOVER_STATUS]',
        'Meal type [LEFTOVER_MEAL_TYPE]',
        'Recipe [LEFTOVER_RECIPE]',
        'Portions [LEFTOVER_PORTIONS]',
        'Dietary [DIETARY_APPLICABILITY]',
        'Ingredients [LEFTOVER_INGREDIENTS_LI]',
        'Source record [LEFTOVER_SOURCE_RECORD_ID]',
        'Record ID',
        'Data Version',
        'Created At',
        'Updated At',
        'Status'
      ]
    ];
    const lookupRows = [
      ['Language', 'Ingredient [INGREDIENT_NAME]', 'Dietary [DIETARY_APPLICABILITY]', 'Record ID', 'Data Version', 'Created At', 'Updated At', 'Status'],
      ['EN', 'Beans', 'Vegan, Gluten-free', 'ing-1', '1', '2026-04-30T08:00:00Z', '2026-04-30T09:00:00Z', 'Active'],
      ['EN', 'Rice', 'Vegan', 'ing-2', '1', '2026-04-30T08:00:00Z', '2026-04-30T09:00:00Z', 'Active']
    ];
    const rowsByTab: Record<string, any[][]> = {
      'Meal Production Data': mealRows,
      'Leftover Inventory Data': leftoverRows,
      'Ingredients Management Data': lookupRows
    };
    const getSheetValues = jest.fn().mockImplementation(async (_spreadsheetId, tabName) => rowsByTab[tabName].map(row => row.slice()));
    const updateRowValues = jest.fn().mockImplementation(async (_spreadsheetId, tabName, rowNumber, values) => {
      rowsByTab[tabName][rowNumber - 1] = values.slice();
      return { updatedRows: 1 };
    });
    const server = createServer({
      env: {
        CK_DATA_BACKEND: 'drive',
        CK_FILE_BACKEND: 'drive',
        CK_DEFAULT_SPREADSHEET_ID: 'spreadsheet-1'
      },
      formConfigRepository: new FormConfigRepository({ bundle }),
      sheetsClient: { getSheetValues, updateRowValues }
    });
    const baseUrl = await listen(server);
    const meals = [
      {
        __ckRowId: 'meal-standard',
        MEAL_TYPE: 'Standard',
        MP_TYPE_LI: [
          {
            __ckRowId: 'cook-standard',
            PREP_TYPE: 'Cook',
            RECIPE: 'Chili',
            MP_LEFTOVER_PORTIONS_CAPTURE: 2,
            MP_LEFTOVER_INGREDIENTS_CAPTURE_LI: [
              { ING_SELECTED: true, ING: 'Beans', QTY: 1 },
              { ING_SELECTED: false, ING: 'Rice', QTY: 1 }
            ]
          }
        ]
      }
    ];

    try {
      const saveRes = await fetch(`${baseUrl}/api/rpc`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fnName: 'saveSubmissionWithId',
          args: [
            {
              formKey: 'Config: Meal Production',
              language: 'EN',
              id: 'meal-submit-1',
              __ckClientDataVersion: 2,
              status: 'Closed',
              values: {
                CUSTOMER: 'Belliard',
                MEALS: meals
              }
            }
          ]
        })
      });
      const saveBody = await saveRes.json();

      expect(saveRes.status).toBe(200);
      expect(saveBody.result).toMatchObject({
        success: true,
        meta: {
          id: 'meal-submit-1',
          operation: 'update',
          submitEffects: {
            configured: 1,
            executed: 1,
            created: 1,
            updated: 0,
            operation: 'update',
            generatedRecords: [
              expect.objectContaining({
                effectId: 'captureLeftovers',
                targetFormKey: 'Config: Leftover Inventory',
                recordId: 'leftover::meal-submit-1::cook-standard',
                values: expect.objectContaining({
                  LEFTOVER_MEAL_TYPE: 'Standard',
                  LEFTOVER_RECIPE: 'Chili',
                  LEFTOVER_PORTIONS: 2,
                  DIETARY_APPLICABILITY: 'Vegan, Gluten-free',
                  LEFTOVER_SOURCE_RECORD_ID: 'meal-submit-1'
                })
              })
            ]
          }
        }
      });
      expect(leftoverRows[1][1]).toBe('available');
      expect(leftoverRows[1][2]).toBe('Standard');
      expect(leftoverRows[1][3]).toBe('Chili');
      expect(leftoverRows[1][4]).toBe(2);
      expect(leftoverRows[1][5]).toBe('Vegan, Gluten-free');
      expect(JSON.parse(leftoverRows[1][6])).toEqual([{ ING: 'Beans', QTY: 1 }]);
      expect(leftoverRows[1][8]).toBe('leftover::meal-submit-1::cook-standard');
    } finally {
      await closeServer(server);
    }
  });

  test('applies updateRecord submit effects through Sheets-backed saves', async () => {
    const sourceQuestions = [
      { id: 'TARGET_ID', type: 'TEXT', qEn: 'Target', status: 'Active' },
      { id: 'COUNT', type: 'NUMBER', qEn: 'Count', status: 'Active' }
    ];
    const targetQuestions = [
      { id: 'COUNT', type: 'NUMBER', qEn: 'Count', status: 'Active' },
      { id: 'STATE', type: 'TEXT', qEn: 'State', status: 'Active' }
    ];
    const bundle = {
      forms: [
        {
          formKey: 'Config: Source',
          form: {
            title: 'Source',
            configSheet: 'Config: Source',
            destinationTab: 'Source Data',
            followupConfig: {
              submitEffects: [
                {
                  id: 'syncTarget',
                  type: 'updateRecord',
                  targetFormKey: 'Config: Target',
                  runOn: 'update',
                  recordId: '{{source.TARGET_ID}}',
                  values: {
                    COUNT: '{{source.COUNT}}',
                    STATE: 'synced'
                  }
                }
              ]
            }
          },
          questions: sourceQuestions,
          definition: { questions: sourceQuestions },
          dedupRules: []
        },
        {
          formKey: 'Config: Target',
          form: {
            title: 'Target',
            configSheet: 'Config: Target',
            destinationTab: 'Target Data'
          },
          questions: targetQuestions,
          definition: { questions: targetQuestions },
          dedupRules: []
        }
      ]
    };
    const rowsByTab: Record<string, any[][]> = {
      'Source Data': [
        ['Language', 'Target [TARGET_ID]', 'Count [COUNT]', 'Record ID', 'Data Version', 'Created At', 'Updated At', 'Status'],
        ['EN', 'target-1', '1', 'source-1', '3', '2026-04-30T08:00:00Z', '2026-04-30T09:00:00Z', 'Draft']
      ],
      'Target Data': [
        ['Language', 'Count [COUNT]', 'State [STATE]', 'Record ID', 'Data Version', 'Created At', 'Updated At', 'Status'],
        ['EN', '1', 'old', 'target-1', '4', '2026-04-30T08:00:00Z', '2026-04-30T09:00:00Z', 'Draft']
      ]
    };
    const getSheetValues = jest.fn().mockImplementation(async (_spreadsheetId, tabName) => rowsByTab[tabName].map(row => row.slice()));
    const updateRowValues = jest.fn().mockImplementation(async (_spreadsheetId, tabName, rowNumber, values) => {
      rowsByTab[tabName][rowNumber - 1] = values.slice();
      return { updatedRows: 1 };
    });
    const server = createServer({
      env: {
        CK_DATA_BACKEND: 'drive',
        CK_FILE_BACKEND: 'drive',
        CK_DEFAULT_SPREADSHEET_ID: 'spreadsheet-1'
      },
      formConfigRepository: new FormConfigRepository({ bundle }),
      sheetsClient: { getSheetValues, updateRowValues }
    });
    const baseUrl = await listen(server);

    try {
      const saveRes = await fetch(`${baseUrl}/api/rpc`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fnName: 'saveSubmissionWithId',
          args: [
            {
              formKey: 'Config: Source',
              language: 'EN',
              id: 'source-1',
              __ckClientDataVersion: 3,
              values: {
                TARGET_ID: 'target-1',
                COUNT: 5
              }
            }
          ]
        })
      });
      const saveBody = await saveRes.json();

      expect(saveRes.status).toBe(200);
      expect(saveBody.result).toMatchObject({
        success: true,
        meta: {
          submitEffects: {
            configured: 1,
            executed: 1,
            created: 0,
            updated: 1,
            operation: 'update',
            generatedRecords: []
          }
        }
      });
      expect(rowsByTab['Target Data'][1][1]).toBe(5);
      expect(rowsByTab['Target Data'][1][2]).toBe('synced');
      expect(rowsByTab['Target Data'][1][3]).toBe('target-1');
      expect(rowsByTab['Target Data'][1][4]).toBe(5);
    } finally {
      await closeServer(server);
    }
  });

  test('writes configured audit rows after guarded Sheets saves', async () => {
    const questions = [
      { id: 'Q1', type: 'TEXT', qEn: 'Name', status: 'Active' },
      { id: 'LINES', type: 'LINE_ITEM_GROUP', qEn: 'Lines', status: 'Active' }
    ];
    const bundle = {
      forms: [
        {
          formKey: 'Config: Delivery',
          form: {
            title: 'Delivery',
            configSheet: 'Config: Delivery',
            destinationTab: 'Delivery Data',
            followupConfig: {
              statusTransitions: {
                inProgress: { en: 'In progress' }
              }
            },
            auditLogging: {
              enabled: true,
              statuses: ['Ready'],
              snapshotButtons: ['READY'],
              sheetName: 'Delivery Audit'
            }
          },
          questions,
          definition: { questions },
          dedupRules: []
        }
      ]
    };
    const rows = [
      ['Language', 'Name [Q1]', 'Lines [LINES]', 'Record ID', 'Data Version', 'Created At', 'Updated At', 'Status'],
      [
        'EN',
        'Alice',
        JSON.stringify([{ name: 'Soup', __ckRowId: 'row-1' }]),
        'delivery-1',
        '2',
        '2026-04-30T08:00:00Z',
        '2026-04-30T09:00:00Z',
        'In progress'
      ]
    ];
    const indexRows: any[][] = [];
    const auditRows: any[][] = [];
    const getSheetValues = jest.fn().mockImplementation(async (_spreadsheetId, tabName) => {
      if (tabName.startsWith('__CK_INDEX__')) {
        if (!indexRows.length) throw new Error('Unable to parse range');
        return indexRows.map(row => row.slice());
      }
      if (tabName === 'Delivery Audit') {
        if (!auditRows.length) throw new Error('Unable to parse range');
        return auditRows.map(row => row.slice());
      }
      return rows.map(row => row.slice());
    });
    const addSheet = jest.fn().mockResolvedValue({ replies: [{}] });
    const updateRowValues = jest.fn().mockImplementation(async (_spreadsheetId, tabName, rowNumber, values) => {
      if (tabName.startsWith('__CK_INDEX__')) {
        indexRows[rowNumber - 1] = values.slice();
        return { updatedRows: 1 };
      }
      if (tabName === 'Delivery Audit') {
        auditRows[rowNumber - 1] = values.slice();
        return { updatedRows: 1 };
      }
      rows[rowNumber - 1] = values.slice();
      return { updatedRows: 1 };
    });
    const appendRows = jest.fn().mockImplementation(async (_spreadsheetId, tabName, values) => {
      if (tabName === 'Delivery Audit') {
        values.forEach((row: any[]) => auditRows.push(row.slice()));
      }
      return { updates: { updatedRows: values.length } };
    });
    const server = createServer({
      env: {
        CK_DATA_BACKEND: 'drive',
        CK_FILE_BACKEND: 'drive',
        CK_DEFAULT_SPREADSHEET_ID: 'spreadsheet-1'
      },
      formConfigRepository: new FormConfigRepository({ bundle }),
      sheetsClient: { getSheetValues, updateRowValues, appendRows, addSheet }
    });
    const baseUrl = await listen(server);

    try {
      const saveRes = await fetch(`${baseUrl}/api/rpc`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fnName: 'saveSubmissionWithId',
          args: [
            {
              formKey: 'Config: Delivery',
              language: 'EN',
              id: 'delivery-1',
              __ckSaveMode: 'draft',
              __ckStatus: 'Ready',
              __ckClientDataVersion: 2,
              __ckSkipSubmitEffects: true,
              __ckAuditAction: 'READY',
              __ckDeviceInfo: { userAgent: 'Jest UA' },
              values: {
                Q1: 'Alice Updated',
                LINES: [{ name: 'Stew', __ckRowId: 'row-1' }],
                LINES_json: JSON.stringify([{ name: 'Stew', __ckRowId: 'row-1' }])
              }
            }
          ]
        })
      });
      const saveBody = await saveRes.json();

      expect(saveRes.status).toBe(200);
      expect(saveBody.result).toMatchObject({
        success: true,
        meta: {
          id: 'delivery-1',
          rowNumber: 2,
          dataVersion: 3,
          operation: 'update'
        }
      });
      expect(addSheet).toHaveBeenCalledWith('spreadsheet-1', 'Delivery Audit');
      expect(appendRows).toHaveBeenCalledWith('spreadsheet-1', 'Delivery Audit', expect.any(Array));
      expect(auditRows[0]).toEqual([
        'date_time',
        'recordId',
        'auditType',
        'fieldPath',
        'beforeValue',
        'afterValue',
        'snapshot',
        'deviceInfo'
      ]);

      const bodyRows = auditRows.slice(1).filter(row => Array.isArray(row) && row.some(cell => cell !== ''));
      const q1Change = bodyRows.find(row => row[2] === 'change' && row[3] === 'Q1');
      const lineChange = bodyRows.find(row => row[2] === 'change' && row[3] === 'LINES[0].name');
      const snapshotRow = bodyRows.find(row => row[2] === 'snapshot');
      expect(q1Change).toEqual([
        expect.any(String),
        'delivery-1',
        'change',
        'Q1',
        'Alice',
        'Alice Updated',
        '',
        '{"userAgent":"Jest UA"}'
      ]);
      expect(lineChange).toEqual([
        expect.any(String),
        'delivery-1',
        'change',
        'LINES[0].name',
        'Soup',
        'Stew',
        '',
        '{"userAgent":"Jest UA"}'
      ]);
      expect(snapshotRow?.[6]?.toString()).toContain('delivery-1');
    } finally {
      await closeServer(server);
    }
  });

  test('previews and applies updateRecord dependency guards through Sheets-backed RPC', async () => {
    const recipeQuestions = [
      { id: 'QFTD5RD2EM', type: 'TEXT', qEn: 'Recipe name', status: 'Active' },
      {
        id: 'DEACTIVATE',
        type: 'BUTTON',
        qEn: 'Deactivate',
        status: 'Active',
        button: {
          action: 'updateRecord',
          set: { status: 'Disabled' },
          dependencyGuard: {
            targetFormKey: 'Meal Production',
            when: {
              all: [
                { fieldId: 'status', notEquals: 'Closed' },
                {
                  any: [
                    { fieldId: 'MP_PREP_DATE', isToday: true },
                    { fieldId: 'MP_PREP_DATE', isInFuture: true }
                  ]
                },
                {
                  lineItems: {
                    groupId: 'MP_MEALS_REQUEST',
                    subGroupId: 'MP_TYPE_LI',
                    when: { fieldId: 'RECIPE', equals: '{{source.QFTD5RD2EM}}' }
                  }
                }
              ]
            },
            dialog: {
              title: { en: 'Recipe used in meal production' },
              message: { en: '{{count}} open meal production record(s) will be updated.' },
              confirmLabel: { en: 'Deactivate and clear' },
              cancelLabel: { en: 'Cancel' }
            },
            mutations: [
              {
                type: 'setLineItemValues',
                groupId: 'MP_MEALS_REQUEST',
                subGroupPath: ['MP_TYPE_LI'],
                when: { fieldId: 'RECIPE', equals: '{{source.QFTD5RD2EM}}' },
                values: { RECIPE: null },
                clearSubGroups: ['MP_INGREDIENTS_LI']
              }
            ]
          }
        }
      }
    ];
    const mealQuestions = [
      { id: 'MP_PREP_DATE', type: 'DATE', qEn: 'Prep date', status: 'Active' },
      {
        id: 'MP_MEALS_REQUEST',
        type: 'LINE_ITEM_GROUP',
        qEn: 'Meals',
        status: 'Active',
        lineItemConfig: {
          fields: [{ id: 'SERVICE', type: 'TEXT' }],
          subGroups: [
            {
              id: 'MP_TYPE_LI',
              fields: [
                { id: 'RECIPE', type: 'TEXT' },
                { id: 'PORTIONS', type: 'NUMBER' }
              ],
              subGroups: [
                {
                  id: 'MP_INGREDIENTS_LI',
                  fields: [{ id: 'INGREDIENT', type: 'TEXT' }]
                }
              ]
            }
          ]
        }
      }
    ];
    const recipeDefinitionQuestions = recipeQuestions.map(question =>
      question.type === 'BUTTON'
        ? {
            id: question.id,
            type: question.type,
            status: question.status,
            button: question.button ? { action: question.button.action } : undefined
          }
        : question
    );
    const bundle = {
      forms: [
        {
          formKey: 'Config: Recipes',
          form: {
            title: 'Recipes',
            configSheet: 'Config: Recipes',
            destinationTab: 'Recipes Data'
          },
          questions: recipeQuestions,
          definition: { questions: recipeDefinitionQuestions },
          dedupRules: []
        },
        {
          formKey: 'Config: Meal Production',
          form: {
            title: 'Meal Production',
            configSheet: 'Config: Meal Production',
            destinationTab: 'Meal Production Data'
          },
          questions: mealQuestions,
          definition: { questions: mealQuestions },
          dedupRules: []
        }
      ]
    };
    const mealLines = [
      {
        __ckRowId: 'meal-row-1',
        SERVICE: 'Dinner',
        MP_TYPE_LI: [
          {
            __ckRowId: 'type-row-1',
            RECIPE: 'Chili',
            PORTIONS: 10,
            MP_INGREDIENTS_LI: [{ __ckRowId: 'ingredient-row-1', INGREDIENT: 'Beans' }]
          },
          {
            __ckRowId: 'type-row-2',
            RECIPE: 'Soup',
            PORTIONS: 5,
            MP_INGREDIENTS_LI: [{ __ckRowId: 'ingredient-row-2', INGREDIENT: 'Carrots' }]
          }
        ]
      }
    ];
    const rowsByTab: Record<string, any[][]> = {
      'Recipes Data': [
        ['Language', 'Recipe name [QFTD5RD2EM]', 'Record ID', 'Data Version', 'Created At', 'Updated At', 'Status'],
        ['EN', 'Chili', 'recipe-1', '2', '2026-04-30T08:00:00Z', '2026-04-30T09:00:00Z', 'Active']
      ],
      'Meal Production Data': [
        ['Language', 'Prep date [MP_PREP_DATE]', 'Meals [MP_MEALS_REQUEST]', 'Record ID', 'Data Version', 'Created At', 'Updated At', 'Status'],
        ['EN', '2999-01-01', JSON.stringify(mealLines), 'meal-1', '4', '2026-04-30T08:00:00Z', '2026-04-30T09:00:00Z', 'Draft'],
        ['EN', '2999-01-02', JSON.stringify(mealLines).replace('Chili', 'Lasagna'), 'meal-2', '1', '2026-04-30T08:00:00Z', '2026-04-30T09:00:00Z', 'Closed']
      ]
    };
    const getSheetValues = jest.fn().mockImplementation(async (_spreadsheetId, tabName) => rowsByTab[tabName].map(row => row.slice()));
    const updateRowValues = jest.fn().mockImplementation(async (_spreadsheetId, tabName, rowNumber, values) => {
      rowsByTab[tabName][rowNumber - 1] = values.slice();
      return { updatedRows: 1 };
    });
    const server = createServer({
      env: {
        CK_DATA_BACKEND: 'drive',
        CK_FILE_BACKEND: 'drive',
        CK_DEFAULT_SPREADSHEET_ID: 'spreadsheet-1'
      },
      formConfigRepository: new FormConfigRepository({ bundle }),
      sheetsClient: { getSheetValues, updateRowValues }
    });
    const baseUrl = await listen(server);

    try {
      const sourcePayload = {
        formKey: 'Config: Recipes',
        language: 'EN',
        id: 'recipe-1',
        status: 'Disabled',
        __ckSaveMode: 'draft',
        __ckClientDataVersion: 2,
        values: { QFTD5RD2EM: 'Chili' }
      };
      const previewRes = await fetch(`${baseUrl}/api/rpc`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fnName: 'previewUpdateRecordDependencies',
          args: [sourcePayload, 'DEACTIVATE']
        })
      });
      const applyRes = await fetch(`${baseUrl}/api/rpc`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fnName: 'applyUpdateRecordWithDependencies',
          args: [sourcePayload, 'DEACTIVATE']
        })
      });
      const previewBody = await previewRes.json();
      const applyBody = await applyRes.json();

      expect(previewRes.status).toBe(200);
      expect(previewBody.result).toMatchObject({
        success: true,
        impactedCount: 1,
        targetFormKey: 'Config: Meal Production',
        dialog: {
          title: 'Recipe used in meal production',
          message: '1 open meal production record(s) will be updated.',
          confirmLabel: 'Deactivate and clear',
          cancelLabel: 'Cancel'
        }
      });
      expect(applyRes.status).toBe(200);
      expect(applyBody.result).toMatchObject({
        success: true,
        dependency: {
          targetFormKey: 'Config: Meal Production',
          impactedCount: 1,
          updatedCount: 1
        },
        meta: {
          id: 'recipe-1',
          rowNumber: 2,
          operation: 'update'
        }
      });

      const updatedMealLines = JSON.parse(rowsByTab['Meal Production Data'][1][2]);
      expect(updatedMealLines[0].MP_TYPE_LI[0]).toMatchObject({
        __ckRowId: 'type-row-1',
        RECIPE: null,
        PORTIONS: 10,
        MP_INGREDIENTS_LI: []
      });
      expect(updatedMealLines[0].MP_TYPE_LI[1]).toMatchObject({
        __ckRowId: 'type-row-2',
        RECIPE: 'Soup',
        MP_INGREDIENTS_LI: [{ __ckRowId: 'ingredient-row-2', INGREDIENT: 'Carrots' }]
      });
      expect(rowsByTab['Recipes Data'][1][6]).toBe('Disabled');
      expect(updateRowValues).toHaveBeenCalledWith(
        'spreadsheet-1',
        'Meal Production Data',
        2,
        expect.arrayContaining(['EN', '2999-01-01', expect.any(String), 'meal-1', 5])
      );
      expect(updateRowValues).toHaveBeenCalledWith(
        'spreadsheet-1',
        'Recipes Data',
        2,
        expect.arrayContaining(['EN', 'Chili', 'recipe-1', 3])
      );
    } finally {
      await closeServer(server);
    }
  });

  test('applies and releases inventory reservation plans through Sheets-backed RPC', async () => {
    const inventoryQuestions = [
      { id: 'LEFTOVER_ID', type: 'TEXT', qEn: 'Leftover ID', status: 'Active' },
      { id: 'LEFTOVER_KIND', type: 'TEXT', qEn: 'Kind', status: 'Active' },
      { id: 'LEFTOVER_PORTIONS', type: 'NUMBER', qEn: 'Portions', status: 'Active' },
      { id: 'LEFTOVER_RESERVED_PORTIONS', type: 'NUMBER', qEn: 'Reserved portions', status: 'Active' },
      { id: 'LEFTOVER_STATUS', type: 'TEXT', qEn: 'Status', status: 'Active' }
    ];
    const ledgerQuestions = [
      'RESERVATION_ID',
      'RESOURCE_FORM_KEY',
      'RESOURCE_RECORD_ID',
      'RESOURCE_ITEM_ID',
      'RESOURCE_KIND',
      'RESOURCE_QTY_FIELD_ID',
      'RESOURCE_RESERVED_QTY_FIELD_ID',
      'RESOURCE_STATUS_FIELD_ID',
      'RESOURCE_UNIT_FIELD_ID',
      'RESERVED_QTY',
      'RESERVED_UNIT',
      'STATUS',
      'SOURCE_FORM_KEY',
      'SOURCE_RECORD_ID',
      'SOURCE_PARENT_GROUP_ID',
      'SOURCE_PARENT_ROW_ID',
      'SOURCE_OUTPUT_GROUP_ID',
      'SOURCE_OUTPUT_ROW_ID',
      'SOURCE_OUTPUT_KEY_FIELD_ID'
    ].map(id => ({ id, type: id === 'RESERVED_QTY' ? 'NUMBER' : 'TEXT', qEn: id, status: 'Active' }));
    const sourceQuestions = [{ id: 'NOTES', type: 'TEXT', qEn: 'Notes', status: 'Active' }];
    const bundle = {
      forms: [
        {
          formKey: 'Config: Leftover Inventory',
          form: {
            title: 'Leftover Inventory',
            configSheet: 'Config: Leftover Inventory',
            destinationTab: 'Leftover Inventory Data'
          },
          questions: inventoryQuestions,
          definition: { questions: inventoryQuestions },
          dedupRules: []
        },
        {
          formKey: 'Config: Inventory Reservation Ledger',
          form: {
            title: 'Inventory Reservation Ledger',
            configSheet: 'Config: Inventory Reservation Ledger',
            destinationTab: 'Inventory Reservation Ledger Data'
          },
          questions: ledgerQuestions,
          definition: { questions: ledgerQuestions },
          dedupRules: []
        },
        {
          formKey: 'Config: Meal Production',
          form: {
            title: 'Meal Production',
            configSheet: 'Config: Meal Production',
            destinationTab: 'Meal Production Data'
          },
          questions: sourceQuestions,
          definition: { questions: sourceQuestions },
          dedupRules: []
        }
      ]
    };
    const rowsByTab: Record<string, any[][]> = {
      'Leftover Inventory Data': [
        [
          'Language',
          'Leftover ID [LEFTOVER_ID]',
          'Kind [LEFTOVER_KIND]',
          'Portions [LEFTOVER_PORTIONS]',
          'Reserved portions [LEFTOVER_RESERVED_PORTIONS]',
          'Status [LEFTOVER_STATUS]',
          'Record ID',
          'Data Version',
          'Created At',
          'Updated At',
          'Status'
        ],
        ['EN', 'LO-1', 'Multi-ingredient', '10', '0', 'available', 'leftover-1', '2', '2026-04-30T08:00:00Z', '2026-04-30T09:00:00Z', 'available']
      ],
      'Inventory Reservation Ledger Data': [
        [
          'Language',
          'Reservation ID [RESERVATION_ID]',
          'Resource form key [RESOURCE_FORM_KEY]',
          'Resource record ID [RESOURCE_RECORD_ID]',
          'Resource item ID [RESOURCE_ITEM_ID]',
          'Resource kind [RESOURCE_KIND]',
          'Resource quantity field ID [RESOURCE_QTY_FIELD_ID]',
          'Resource reserved quantity field ID [RESOURCE_RESERVED_QTY_FIELD_ID]',
          'Resource status field ID [RESOURCE_STATUS_FIELD_ID]',
          'Resource unit field ID [RESOURCE_UNIT_FIELD_ID]',
          'Reserved quantity [RESERVED_QTY]',
          'Reserved unit [RESERVED_UNIT]',
          'Reservation status [STATUS]',
          'Source form key [SOURCE_FORM_KEY]',
          'Source record ID [SOURCE_RECORD_ID]',
          'Source parent group ID [SOURCE_PARENT_GROUP_ID]',
          'Source parent row ID [SOURCE_PARENT_ROW_ID]',
          'Source output group ID [SOURCE_OUTPUT_GROUP_ID]',
          'Source output row ID [SOURCE_OUTPUT_ROW_ID]',
          'Source output key field ID [SOURCE_OUTPUT_KEY_FIELD_ID]',
          'Record ID',
          'Data Version',
          'Created At',
          'Updated At',
          'Status'
        ]
      ],
      'Meal Production Data': [
        ['Language', 'Notes [NOTES]', 'Record ID', 'Data Version', 'Created At', 'Updated At', 'Status'],
        ['EN', 'Source', 'meal-1', '7', '2026-04-30T08:00:00Z', '2026-04-30T09:00:00Z', 'Draft']
      ]
    };
    const getSheetValues = jest.fn().mockImplementation(async (_spreadsheetId, tabName) => rowsByTab[tabName].map(row => row.slice()));
    const updateRowValues = jest.fn().mockImplementation(async (_spreadsheetId, tabName, rowNumber, values) => {
      rowsByTab[tabName][rowNumber - 1] = values.slice();
      return { updatedRows: 1 };
    });
    const parseBatchRange = (range: string) => {
      const match = /^'((?:[^']|'')+)'!A(\d+):/.exec(range);
      if (!match) throw new Error(`Unexpected range: ${range}`);
      return {
        tabName: match[1].replace(/''/g, "'"),
        rowNumber: Number(match[2])
      };
    };
    const batchUpdateValues = jest.fn().mockImplementation(async (_spreadsheetId, data) => {
      (Array.isArray(data) ? data : []).forEach(entry => {
        const { tabName, rowNumber } = parseBatchRange(entry.range);
        rowsByTab[tabName][rowNumber - 1] = (entry.values[0] || []).slice();
      });
      return { totalUpdatedRows: Array.isArray(data) ? data.length : 0 };
    });
    const appendRows = jest.fn().mockImplementation(async (_spreadsheetId, tabName, rows) => {
      (Array.isArray(rows) ? rows : []).forEach(row => rowsByTab[tabName].push(row.slice()));
      return { updates: { updatedRows: Array.isArray(rows) ? rows.length : 0 } };
    });
    const server = createServer({
      env: {
        CK_DATA_BACKEND: 'drive',
        CK_FILE_BACKEND: 'drive',
        CK_DEFAULT_SPREADSHEET_ID: 'spreadsheet-1'
      },
      formConfigRepository: new FormConfigRepository({ bundle }),
      sheetsClient: { getSheetValues, updateRowValues, batchUpdateValues, appendRows }
    });
    const baseUrl = await listen(server);

    try {
      const planRes = await fetch(`${baseUrl}/api/rpc`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fnName: 'applyInventoryReservationPlan',
          args: [
            {
              sourceFormKey: 'Config: Meal Production',
              sourceRecordId: 'meal-1',
              clientDataVersion: 7,
              ledgerFormKey: 'Config: Inventory Reservation Ledger',
              reservations: [
                {
                  resourceFormKey: 'Config: Leftover Inventory',
                  resourceRecordId: 'leftover-1',
                  resourceItemId: 'LO-1',
                  resourceKind: 'Multi-ingredient',
                  quantity: 3,
                  sourceOutputRowId: 'leftover-output-1'
                }
              ],
              refreshMode: 'none'
            }
          ]
        })
      });
      const planBody = await planRes.json();

      expect(planRes.status).toBe(200);
      expect(planBody.result).toMatchObject({
        success: true,
        message: 'Inventory reservations updated.',
        reservationsApplied: 1,
        reservationsReleased: 0,
        sourceClientDataVersionMatched: true,
        availability: [
          expect.objectContaining({
            resourceFormKey: 'Config: Leftover Inventory',
            resourceRecordId: 'leftover-1',
            resourceItemId: 'LO-1',
            remainingQuantity: 10,
            reservedQuantity: 3,
            freeQuantity: 7,
            currentReservationQuantity: 3,
            currentRecordReservedQuantity: 3
          })
        ]
      });
      expect(rowsByTab['Leftover Inventory Data'][1][4]).toBe(3);
      expect(rowsByTab['Inventory Reservation Ledger Data'][1][10]).toBe(3);
      expect(rowsByTab['Inventory Reservation Ledger Data'][1][12]).toBe('active');
      expect(rowsByTab['Inventory Reservation Ledger Data'][1][20]).toMatch(/^reservation::/);
      expect(appendRows).toHaveBeenCalledWith('spreadsheet-1', 'Inventory Reservation Ledger Data', expect.any(Array));
      expect(batchUpdateValues).toHaveBeenCalled();

      const releaseRes = await fetch(`${baseUrl}/api/rpc`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fnName: 'applyInventoryReservationPlan',
          args: [
            {
              sourceFormKey: 'Config: Meal Production',
              sourceRecordId: 'meal-1',
              ledgerFormKey: 'Config: Inventory Reservation Ledger',
              reservations: [],
              refreshMode: 'none'
            }
          ]
        })
      });
      const releaseBody = await releaseRes.json();

      expect(releaseRes.status).toBe(200);
      expect(releaseBody.result).toMatchObject({
        success: true,
        reservationsApplied: 0,
        reservationsReleased: 1,
        availability: [
          expect.objectContaining({
            reservedQuantity: 0,
            freeQuantity: 10,
            currentReservationQuantity: 0,
            currentRecordReservedQuantity: 0
          })
        ]
      });
      expect(rowsByTab['Leftover Inventory Data'][1][4]).toBe(0);
      expect(rowsByTab['Inventory Reservation Ledger Data'][1][10]).toBe(0);
      expect(rowsByTab['Inventory Reservation Ledger Data'][1][12]).toBe('released');
    } finally {
      await closeServer(server);
    }
  });

  test('reconciles active inventory reservations through Sheets-backed RPC', async () => {
    const inventoryQuestions = [
      { id: 'LEFTOVER_ID', type: 'TEXT', qEn: 'Leftover ID', status: 'Active' },
      { id: 'LEFTOVER_KIND', type: 'TEXT', qEn: 'Kind', status: 'Active' },
      { id: 'LEFTOVER_PORTIONS', type: 'NUMBER', qEn: 'Portions', status: 'Active' },
      { id: 'LEFTOVER_RESERVED_PORTIONS', type: 'NUMBER', qEn: 'Reserved portions', status: 'Active' },
      { id: 'LEFTOVER_STATUS', type: 'TEXT', qEn: 'Status', status: 'Active' }
    ];
    const ledgerQuestions = [
      'RESERVATION_ID',
      'RESOURCE_FORM_KEY',
      'RESOURCE_RECORD_ID',
      'RESOURCE_ITEM_ID',
      'RESOURCE_KIND',
      'RESOURCE_QTY_FIELD_ID',
      'RESOURCE_RESERVED_QTY_FIELD_ID',
      'RESOURCE_STATUS_FIELD_ID',
      'RESOURCE_UNIT_FIELD_ID',
      'RESERVED_QTY',
      'RESERVED_UNIT',
      'STATUS',
      'SOURCE_FORM_KEY',
      'SOURCE_RECORD_ID'
    ].map(id => ({ id, type: id === 'RESERVED_QTY' ? 'NUMBER' : 'TEXT', qEn: id, status: 'Active' }));
    const sourceQuestions = [{ id: 'NOTES', type: 'TEXT', qEn: 'Notes', status: 'Active' }];
    const bundle = {
      forms: [
        {
          formKey: 'Config: Leftover Inventory',
          form: { title: 'Leftover Inventory', configSheet: 'Config: Leftover Inventory', destinationTab: 'Leftover Inventory Data' },
          questions: inventoryQuestions,
          definition: { questions: inventoryQuestions },
          dedupRules: []
        },
        {
          formKey: 'Config: Inventory Reservation Ledger',
          form: {
            title: 'Inventory Reservation Ledger',
            configSheet: 'Config: Inventory Reservation Ledger',
            destinationTab: 'Inventory Reservation Ledger Data'
          },
          questions: ledgerQuestions,
          definition: { questions: ledgerQuestions },
          dedupRules: []
        },
        {
          formKey: 'Config: Meal Production',
          form: { title: 'Meal Production', configSheet: 'Config: Meal Production', destinationTab: 'Meal Production Data' },
          questions: sourceQuestions,
          definition: { questions: sourceQuestions },
          dedupRules: []
        }
      ]
    };
    const rowsByTab: Record<string, any[][]> = {
      'Leftover Inventory Data': [
        [
          'Language',
          'Leftover ID [LEFTOVER_ID]',
          'Kind [LEFTOVER_KIND]',
          'Portions [LEFTOVER_PORTIONS]',
          'Reserved portions [LEFTOVER_RESERVED_PORTIONS]',
          'Status [LEFTOVER_STATUS]',
          'Record ID',
          'Data Version',
          'Created At',
          'Updated At',
          'Status'
        ],
        ['EN', 'LO-2', 'Multi-ingredient', '8', '3', 'available', 'leftover-2', '4', '2026-04-30T08:00:00Z', '2026-04-30T09:00:00Z', 'available']
      ],
      'Inventory Reservation Ledger Data': [
        [
          'Language',
          'Reservation ID [RESERVATION_ID]',
          'Resource form key [RESOURCE_FORM_KEY]',
          'Resource record ID [RESOURCE_RECORD_ID]',
          'Resource item ID [RESOURCE_ITEM_ID]',
          'Resource kind [RESOURCE_KIND]',
          'Resource quantity field ID [RESOURCE_QTY_FIELD_ID]',
          'Resource reserved quantity field ID [RESOURCE_RESERVED_QTY_FIELD_ID]',
          'Resource status field ID [RESOURCE_STATUS_FIELD_ID]',
          'Resource unit field ID [RESOURCE_UNIT_FIELD_ID]',
          'Reserved quantity [RESERVED_QTY]',
          'Reserved unit [RESERVED_UNIT]',
          'Reservation status [STATUS]',
          'Source form key [SOURCE_FORM_KEY]',
          'Source record ID [SOURCE_RECORD_ID]',
          'Record ID',
          'Data Version',
          'Created At',
          'Updated At',
          'Status'
        ],
        [
          'EN',
          'reservation::existing',
          'Config: Leftover Inventory',
          'leftover-2',
          'LO-2',
          'Multi-ingredient',
          'LEFTOVER_PORTIONS',
          'LEFTOVER_RESERVED_PORTIONS',
          'LEFTOVER_STATUS',
          '',
          '3',
          '',
          'active',
          'Config: Meal Production',
          'meal-2',
          'reservation::existing',
          '1',
          '2026-04-30T08:00:00Z',
          '2026-04-30T09:00:00Z',
          'active'
        ]
      ],
      'Meal Production Data': [
        ['Language', 'Notes [NOTES]', 'Record ID', 'Data Version', 'Created At', 'Updated At', 'Status'],
        ['EN', 'Source', 'meal-2', '2', '2026-04-30T08:00:00Z', '2026-04-30T09:00:00Z', 'Draft']
      ]
    };
    const getSheetValues = jest.fn().mockImplementation(async (_spreadsheetId, tabName) => rowsByTab[tabName].map(row => row.slice()));
    const updateRowValues = jest.fn().mockImplementation(async (_spreadsheetId, tabName, rowNumber, values) => {
      rowsByTab[tabName][rowNumber - 1] = values.slice();
      return { updatedRows: 1 };
    });
    const server = createServer({
      env: {
        CK_DATA_BACKEND: 'drive',
        CK_FILE_BACKEND: 'drive',
        CK_DEFAULT_SPREADSHEET_ID: 'spreadsheet-1'
      },
      formConfigRepository: new FormConfigRepository({ bundle }),
      sheetsClient: { getSheetValues, updateRowValues }
    });
    const baseUrl = await listen(server);

    try {
      const reconcileRes = await fetch(`${baseUrl}/api/rpc`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fnName: 'reconcileInventoryReservations',
          args: [
            {
              sourceFormKey: 'Config: Meal Production',
              sourceRecordId: 'meal-2',
              ledgerFormKey: 'Config: Inventory Reservation Ledger',
              mode: 'consume',
              refreshMode: 'none'
            }
          ]
        })
      });
      const reconcileBody = await reconcileRes.json();

      expect(reconcileRes.status).toBe(200);
      expect(reconcileBody.result).toMatchObject({
        success: true,
        message: 'Inventory reservations reconciled.',
        reconciledReservations: 1,
        consumedReservations: 1,
        releasedReservations: 0,
        touchedInventoryRecords: 1,
        availability: [
          expect.objectContaining({
            resourceRecordId: 'leftover-2',
            remainingQuantity: 5,
            reservedQuantity: 0,
            freeQuantity: 5
          })
        ]
      });
      expect(rowsByTab['Leftover Inventory Data'][1][3]).toBe(5);
      expect(rowsByTab['Leftover Inventory Data'][1][4]).toBe(0);
      expect(rowsByTab['Inventory Reservation Ledger Data'][1][12]).toBe('consumed');
    } finally {
      await closeServer(server);
    }
  });

  test('runs supported follow-up batches through Sheets-backed Cloud Run RPC', async () => {
    const sourceQuestions = [{ id: 'NAME', type: 'TEXT', qEn: 'Name', status: 'Active' }];
    const targetQuestions = [
      { id: 'SOURCE_ID', type: 'TEXT', qEn: 'Source ID', status: 'Active' },
      { id: 'NAME', type: 'TEXT', qEn: 'Name', status: 'Active' }
    ];
    const bundle = {
      forms: [
        {
          formKey: 'Config: Source',
          form: {
            title: 'Source',
            configSheet: 'Config: Source',
            destinationTab: 'Source Data',
            followupConfig: {
              statusTransitions: { onClose: { en: 'Closed' } },
              submitEffects: [
                {
                  id: 'copyClosedSource',
                  type: 'createRecord',
                  targetFormKey: 'Config: Target',
                  runOn: 'update',
                  recordId: 'target::{{source.id}}',
                  when: { fieldId: 'status', equals: ['Closed'] },
                  status: 'created',
                  values: {
                    SOURCE_ID: '{{source.id}}',
                    NAME: '{{source.NAME}}'
                  }
                }
              ]
            }
          },
          questions: sourceQuestions,
          definition: { questions: sourceQuestions },
          dedupRules: []
        },
        {
          formKey: 'Config: Target',
          form: {
            title: 'Target',
            configSheet: 'Config: Target',
            destinationTab: 'Target Data'
          },
          questions: targetQuestions,
          definition: { questions: targetQuestions },
          dedupRules: []
        }
      ]
    };
    const rowsByTab: Record<string, any[][]> = {
      'Source Data': [
        ['Language', 'Name [NAME]', 'Record ID', 'Data Version', 'Created At', 'Updated At', 'Status'],
        ['EN', 'Meal', 'source-1', '2', '2026-04-30T08:00:00Z', '2026-04-30T09:00:00Z', 'Draft']
      ],
      'Target Data': [
        ['Language', 'Source ID [SOURCE_ID]', 'Name [NAME]', 'Record ID', 'Data Version', 'Created At', 'Updated At', 'Status']
      ]
    };
    const getSheetValues = jest.fn().mockImplementation(async (_spreadsheetId, tabName) => rowsByTab[tabName].map(row => row.slice()));
    const updateRowValues = jest.fn().mockImplementation(async (_spreadsheetId, tabName, rowNumber, values) => {
      rowsByTab[tabName][rowNumber - 1] = values.slice();
      return { updatedRows: 1 };
    });
    const server = createServer({
      env: {
        CK_DATA_BACKEND: 'drive',
        CK_FILE_BACKEND: 'drive',
        CK_DEFAULT_SPREADSHEET_ID: 'spreadsheet-1'
      },
      formConfigRepository: new FormConfigRepository({ bundle }),
      sheetsClient: { getSheetValues, updateRowValues }
    });
    const baseUrl = await listen(server);

    try {
      const followupRes = await fetch(`${baseUrl}/api/rpc`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fnName: 'triggerFollowupActions',
          args: ['Config: Source', 'source-1', ['CLOSE_RECORD']]
        })
      });
      const followupBody = await followupRes.json();

      expect(followupRes.status).toBe(200);
      expect(followupBody.result).toMatchObject({
        success: true,
        results: [
          {
            action: 'CLOSE_RECORD',
            result: {
              success: true,
              status: 'Closed',
              dataVersion: 3,
              rowNumber: 2,
              submitEffects: {
                configured: 1,
                executed: 1,
                created: 1,
                updated: 0,
                operation: 'update',
                generatedRecords: [
                  expect.objectContaining({
                    effectId: 'copyClosedSource',
                    targetFormKey: 'Config: Target',
                    recordId: 'target::source-1',
                    values: {
                      SOURCE_ID: 'source-1',
                      NAME: 'Meal'
                    }
                  })
                ]
              }
            }
          }
        ]
      });
      expect(rowsByTab['Source Data'][1][6]).toBe('Closed');
      expect(rowsByTab['Target Data'][1][1]).toBe('source-1');
      expect(rowsByTab['Target Data'][1][2]).toBe('Meal');
      expect(rowsByTab['Target Data'][1][3]).toBe('target::source-1');
    } finally {
      await closeServer(server);
    }
  });

  test('runs reservation reconciliation from follow-up batches through Sheets-backed Cloud Run RPC', async () => {
    const ledgerQuestions = ['RESERVATION_ID', 'STATUS', 'SOURCE_FORM_KEY', 'SOURCE_RECORD_ID'].map(id => ({
      id,
      type: 'TEXT',
      qEn: id,
      status: 'Active'
    }));
    const sourceQuestions = [{ id: 'NOTES', type: 'TEXT', qEn: 'Notes', status: 'Active' }];
    const bundle = {
      forms: [
        {
          formKey: 'Config: Inventory Reservation Ledger',
          form: {
            title: 'Inventory Reservation Ledger',
            configSheet: 'Config: Inventory Reservation Ledger',
            destinationTab: 'Inventory Reservation Ledger Data'
          },
          questions: ledgerQuestions,
          definition: { questions: ledgerQuestions },
          dedupRules: []
        },
        {
          formKey: 'Config: Meal Production',
          form: {
            title: 'Meal Production',
            configSheet: 'Config: Meal Production',
            destinationTab: 'Meal Production Data',
            reservationLifecycle: {
              ledgerFormKey: 'Config: Inventory Reservation Ledger',
              reconcileOnFinalSubmit: {
                enabled: true,
                ledgerFormKey: 'Config: Inventory Reservation Ledger',
                refreshMode: 'none'
              }
            }
          },
          questions: sourceQuestions,
          definition: { questions: sourceQuestions },
          dedupRules: []
        }
      ]
    };
    const rowsByTab: Record<string, any[][]> = {
      'Inventory Reservation Ledger Data': [
        [
          'Language',
          'Reservation ID [RESERVATION_ID]',
          'Reservation status [STATUS]',
          'Source form key [SOURCE_FORM_KEY]',
          'Source record ID [SOURCE_RECORD_ID]',
          'Record ID',
          'Data Version',
          'Created At',
          'Updated At',
          'Status'
        ]
      ],
      'Meal Production Data': [
        ['Language', 'Notes [NOTES]', 'Record ID', 'Data Version', 'Created At', 'Updated At', 'Status'],
        ['EN', 'Source', 'meal-3', '2', '2026-04-30T08:00:00Z', '2026-04-30T09:00:00Z', 'Draft']
      ]
    };
    const getSheetValues = jest.fn().mockImplementation(async (_spreadsheetId, tabName) => rowsByTab[tabName].map(row => row.slice()));
    const server = createServer({
      env: {
        CK_DATA_BACKEND: 'drive',
        CK_FILE_BACKEND: 'drive',
        CK_DEFAULT_SPREADSHEET_ID: 'spreadsheet-1'
      },
      formConfigRepository: new FormConfigRepository({ bundle }),
      sheetsClient: { getSheetValues, updateRowValues: jest.fn() }
    });
    const baseUrl = await listen(server);

    try {
      const followupRes = await fetch(`${baseUrl}/api/rpc`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fnName: 'triggerFollowupActions',
          args: ['Config: Meal Production', 'meal-3', ['RECONCILE_RESERVATIONS']]
        })
      });
      const followupBody = await followupRes.json();

      expect(followupRes.status).toBe(200);
      expect(followupBody.result).toMatchObject({
        success: true,
        results: [
          {
            action: 'RECONCILE_RESERVATIONS',
            result: {
              success: true,
              reservationReconciliation: {
                success: true,
                sourceRecordId: 'meal-3',
                reconciledReservations: 0,
                consumedReservations: 0,
                releasedReservations: 0,
                touchedInventoryRecords: 0
              }
            }
          }
        ]
      });
    } finally {
      await closeServer(server);
    }
  });

  test('runs PDF-backed email follow-up batches through Cloud Run when Gmail is configured', async () => {
    const questions = [
      { id: 'NAME', type: 'TEXT', qEn: 'Name', status: 'Active' },
      { id: 'DIST', type: 'TEXT', qEn: 'Distributor', status: 'Active' }
    ];
    const bundle = {
      forms: [
        {
          formKey: 'Config: Delivery',
          form: {
            title: 'Delivery',
            configSheet: 'Config: Delivery',
            destinationTab: 'Delivery Data',
            followupConfig: {
              pdfTemplateId: { EN: 'bundle:delivery.pdf.html' },
              pdfFolderId: 'pdf-folder',
              pdfFileNameFieldId: 'NAME',
              emailTemplateId: { EN: 'email-template-doc' },
              emailRecipients: [
                {
                  type: 'dataSource',
                  recordFieldId: 'DIST',
                  lookupField: 'NICKNAME',
                  valueField: 'DIST_EMAIL',
                  dataSource: {
                    id: 'Distributor Data',
                    projection: ['NICKNAME', 'DIST_EMAIL']
                  }
                }
              ],
              emailCc: ['chef@example.test'],
              emailBcc: ['audit@example.test'],
              emailSubject: { en: 'Delivery ready' },
              emailFrom: 'ops@example.test',
              emailFromName: 'Operations',
              statusTransitions: { onEmail: { en: 'Email sent' } }
            }
          },
          questions,
          definition: { questions },
          dedupRules: []
        }
      ]
    };
    const rowsByTab: Record<string, any[][]> = {
      'Delivery Data': [
        [
          'Language',
          'Name [NAME]',
          'Distributor [DIST]',
          'Record ID',
          'Data Version',
          'Created At',
          'Updated At',
          'Status',
          'PDF URL'
        ],
        ['EN', 'Soup', 'HUB', 'delivery-1', '2', '2026-04-30T08:00:00Z', '2026-04-30T09:00:00Z', 'Draft', '']
      ]
    };
    const getSheetValues = jest.fn().mockImplementation(async (_spreadsheetId, tabName) => rowsByTab[tabName].map(row => row.slice()));
    const updateRowValues = jest.fn().mockImplementation(async (_spreadsheetId, tabName, rowNumber, values) => {
      rowsByTab[tabName][rowNumber - 1] = values.slice();
      return { updatedRows: 1 };
    });
    const fileRepository = {
      readTextFile: jest.fn().mockResolvedValue({ id: 'email-template-doc', raw: 'Hello {{NAME}}', mimeType: 'text/plain' }),
      createPdfFromHtml: jest.fn().mockResolvedValue({
        success: true,
        fileId: 'pdf-1',
        url: 'https://drive.google.com/file/d/pdf-1/view',
        buffer: Buffer.from('%PDF delivery', 'utf8'),
        mimeType: 'application/pdf',
        fileName: 'Delivery - Soup.pdf'
      })
    };
    const gmailClient = {
      sendEmail: jest.fn().mockResolvedValue({ id: 'gmail-message-1', threadId: 'gmail-thread-1' })
    };
    const dataSourceRepository = {
      fetchDataSource: jest.fn().mockResolvedValue({
        items: [{ NICKNAME: 'HUB', DIST_EMAIL: 'hub@example.test' }],
        totalCount: 1
      })
    };
    const templateRenderers = {
      resolveTemplateId: jest.fn((template: any, record: any) =>
        typeof template === 'string' ? template : template?.[record?.language || 'EN'] || template?.EN
      ),
      renderHtmlFromHtmlTemplate: jest.fn().mockReturnValue({ success: true, html: '<h1>Delivery PDF</h1>' }),
      collectLineItemRows: jest.fn().mockReturnValue({}),
      buildPlaceholderMap: jest.fn((args: any) => ({
        '{{NAME}}': args.record.values.NAME,
        '{{name}}': args.record.values.NAME,
        '{{Name}}': args.record.values.NAME
      })),
      addLabelPlaceholders: jest.fn(),
      collectValidationWarnings: jest.fn().mockReturnValue([]),
      addPlaceholderVariants: jest.fn(),
      applyPlaceholders: jest.fn((template: string, placeholders: Record<string, string>) =>
        (template || '').replace(/{{[^}]+}}/g, token => placeholders[token] ?? token)
      )
    };
    const server = createServer({
      env: {
        CK_DATA_BACKEND: 'drive',
        CK_FILE_BACKEND: 'drive',
        CK_DEFAULT_SPREADSHEET_ID: 'spreadsheet-1'
      },
      formConfigRepository: new FormConfigRepository({ bundle }),
      sheetsClient: { getSheetValues, updateRowValues },
      fileRepository,
      gmailClient,
      dataSourceRepository,
      templateRenderers
    });
    const baseUrl = await listen(server);

    try {
      const followupRes = await fetch(`${baseUrl}/api/rpc`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fnName: 'triggerFollowupActions',
          args: ['Config: Delivery', 'delivery-1', ['SEND_EMAIL']]
        })
      });
      const followupBody = await followupRes.json();

      expect(followupRes.status).toBe(200);
      expect(followupBody.result).toMatchObject({
        success: true,
        results: [
          {
            action: 'SEND_EMAIL',
            result: {
              success: true,
              status: 'Email sent',
              pdfUrl: 'https://drive.google.com/file/d/pdf-1/view',
              fileId: 'pdf-1',
              emailMessageId: 'gmail-message-1',
              dataVersion: 3,
              rowNumber: 2
            }
          }
        ]
      });
      expect(fileRepository.readTextFile).toHaveBeenCalledWith('email-template-doc', ['text/plain']);
      expect(fileRepository.createPdfFromHtml).toHaveBeenCalledWith({
        html: expect.stringContaining('Delivery PDF'),
        name: 'Delivery - Soup',
        folderId: 'pdf-folder'
      });
      expect(dataSourceRepository.fetchDataSource).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'Distributor Data',
          projection: ['NICKNAME', 'DIST_EMAIL']
        }),
        'EN',
        ['NICKNAME', 'DIST_EMAIL'],
        200,
        undefined
      );
      expect(gmailClient.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: ['hub@example.test'],
          cc: ['chef@example.test'],
          bcc: ['audit@example.test'],
          subject: 'Delivery ready',
          textBody: 'Hello Soup',
          htmlBody: 'Hello Soup',
          from: 'ops@example.test',
          fromName: 'Operations',
          attachments: [
            expect.objectContaining({
              fileName: 'Delivery - Soup.pdf',
              mimeType: 'application/pdf',
              buffer: Buffer.from('%PDF delivery', 'utf8')
            })
          ]
        })
      );
      expect(rowsByTab['Delivery Data'][1][7]).toBe('Email sent');
      expect(rowsByTab['Delivery Data'][1][8]).toBe('https://drive.google.com/file/d/pdf-1/view');
    } finally {
      await closeServer(server);
    }
  });

  test('supports staging-safe delete-on-key-change requests through Sheets API', async () => {
    const questions = [
      { id: 'CUSTOMER', type: 'TEXT', qEn: 'Customer', status: 'Active' },
      { id: 'PREP_DATE', type: 'DATE', qEn: 'Prep date', status: 'Active' }
    ];
    const bundle = {
      forms: [
        {
          formKey: 'Config: Meal Production',
          form: {
            title: 'Meal Production',
            configSheet: 'Config: Meal Production',
            destinationTab: 'Meal Production Data',
            dedupDeleteOnKeyChange: true
          },
          questions,
          definition: { questions },
          dedupRules: []
        }
      ]
    };
    const rows = [
      ['Language', 'Customer [CUSTOMER]', 'Prep date [PREP_DATE]', 'Record ID', 'Data Version', 'Created At', 'Updated At', 'Status'],
      ['EN', 'Belliard', '2026-04-30', 'meal-1', '3', '2026-04-30T08:00:00Z', '2026-04-30T09:00:00Z', 'Draft'],
      ['EN', 'HUB', '2026-05-01', 'meal-2', '1', '2026-05-01T08:00:00Z', '2026-05-01T09:00:00Z', 'Draft']
    ];
    const indexRows = [
      ['Record ID', 'Row', 'Data Version', 'Updated At (ISO)', 'Created At (ISO)'],
      ['meal-1', '2', '3', '2026-04-30T09:00:00Z', '2026-04-30T08:00:00Z'],
      ['meal-2', '3', '1', '2026-05-01T09:00:00Z', '2026-05-01T08:00:00Z']
    ];
    const getSheetValues = jest.fn().mockImplementation(async (_spreadsheetId, tabName) => {
      if (tabName.startsWith('__CK_INDEX__')) return indexRows.map(row => row.slice());
      return rows.map(row => row.slice());
    });
    const deleteRow = jest.fn().mockImplementation(async (_spreadsheetId, tabName, rowNumber) => {
      if (tabName.startsWith('__CK_INDEX__')) {
        indexRows.splice(rowNumber - 1, 1);
        return { replies: [{}] };
      }
      rows.splice(rowNumber - 1, 1);
      return { replies: [{}] };
    });
    const server = createServer({
      env: {
        CK_DATA_BACKEND: 'drive',
        CK_FILE_BACKEND: 'drive',
        CK_DEFAULT_SPREADSHEET_ID: 'spreadsheet-1'
      },
      formConfigRepository: new FormConfigRepository({ bundle }),
      sheetsClient: { getSheetValues, updateRowValues: jest.fn(), deleteRow }
    });
    const baseUrl = await listen(server);

    try {
      const deleteRes = await fetch(`${baseUrl}/api/rpc`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fnName: 'saveSubmissionWithId',
          args: [
            {
              formKey: 'Config: Meal Production',
              language: 'EN',
              id: 'meal-1',
              __ckSaveMode: 'draft',
              __ckDeleteRecordId: 'meal-1',
              __ckSkipSubmitEffects: true
            }
          ]
        })
      });
      const readDeletedRes = await fetch(`${baseUrl}/api/rpc`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ fnName: 'fetchSubmissionById', args: ['Config: Meal Production', 'meal-1'] })
      });
      const readRemainingRes = await fetch(`${baseUrl}/api/rpc`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ fnName: 'fetchSubmissionById', args: ['Config: Meal Production', 'meal-2'] })
      });
      const deleteBody = await deleteRes.json();
      const readDeletedBody = await readDeletedRes.json();
      const readRemainingBody = await readRemainingRes.json();

      expect(deleteBody.result).toMatchObject({
        success: true,
        message: 'Deleted previous record.',
        meta: {
          id: 'meal-1',
          rowNumber: 2
        }
      });
      expect(deleteRow).toHaveBeenNthCalledWith(1, 'spreadsheet-1', 'Meal Production Data', 2);
      expect(deleteRow).toHaveBeenNthCalledWith(
        2,
        'spreadsheet-1',
        expect.stringMatching(/^__CK_INDEX__Meal Production Data__/),
        2
      );
      expect(readDeletedBody.result).toBeNull();
      expect(readRemainingBody.result).toMatchObject({
        id: 'meal-2',
        rowNumber: 2,
        values: {
          CUSTOMER: 'HUB',
          PREP_DATE: '2026-05-01'
        }
      });
    } finally {
      await closeServer(server);
    }
  });

  test('uploads Drive file payloads during guarded Sheets saves and returns upload metadata', async () => {
    const questions = [
      {
        id: 'PHOTO',
        type: 'FILE_UPLOAD',
        qEn: 'Photo',
        status: 'Active',
        uploadConfig: { destinationFolderId: 'uploads-folder', maxFiles: 2 }
      },
      {
        id: 'LINES',
        type: 'LINE_ITEM_GROUP',
        qEn: 'Lines',
        status: 'Active',
        lineItemConfig: {
          fields: [
            {
              id: 'LINE_PHOTO',
              type: 'FILE_UPLOAD',
              uploadConfig: { destinationFolderId: 'line-uploads-folder' }
            }
          ]
        }
      }
    ];
    const bundle = {
      forms: [
        {
          formKey: 'Config: Checklist',
          form: {
            title: 'Checklist',
            configSheet: 'Config: Checklist',
            destinationTab: 'Checklist Data',
            followupConfig: {
              statusTransitions: {
                inProgress: { en: 'Draft' }
              }
            }
          },
          questions,
          definition: { questions },
          dedupRules: []
        }
      ]
    };
    const rows = [
      ['Language', 'Photo [PHOTO]', 'Lines [LINES]', 'Record ID', 'Data Version', 'Created At', 'Updated At', 'Status']
    ];
    const getSheetValues = jest.fn().mockImplementation(async () => rows.map(row => row.slice()));
    const updateRowValues = jest.fn().mockImplementation(async (_spreadsheetId, _tabName, rowNumber, values) => {
      rows[rowNumber - 1] = values.slice();
      return { updatedRows: 1 };
    });
    const uploadFile = jest
      .fn()
      .mockResolvedValueOnce({
        id: 'drive-photo-1',
        webViewLink: 'https://drive.google.com/file/d/drive-photo-1/view'
      })
      .mockResolvedValueOnce({
        id: 'drive-line-photo-1',
        webViewLink: 'https://drive.google.com/file/d/drive-line-photo-1/view'
      });
    const server = createServer({
      env: {
        CK_DATA_BACKEND: 'drive',
        CK_FILE_BACKEND: 'drive',
        CK_DEFAULT_SPREADSHEET_ID: 'spreadsheet-1'
      },
      formConfigRepository: new FormConfigRepository({ bundle }),
      sheetsClient: { getSheetValues, updateRowValues },
      driveClient: {
        getFileMetadata: jest.fn(),
        uploadFile
      }
    });
    const baseUrl = await listen(server);

    try {
      const saveRes = await fetch(`${baseUrl}/api/rpc`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fnName: 'saveSubmissionWithId',
          args: [
            {
              formKey: 'Config: Checklist',
              language: 'EN',
              id: 'check-1',
              __ckSaveMode: 'draft',
              __ckSkipSubmitEffects: true,
              __ckReturnUploadValues: true,
              values: {
                PHOTO: [
                  {
                    name: 'top.jpg',
                    type: 'image/jpeg',
                    dataUrl: 'data:image/jpeg;base64,dG9w'
                  }
                ],
                LINES: [
                  {
                    __ckRowId: 'row-1',
                    LINE_PHOTO: {
                      name: 'line.jpg',
                      type: 'image/jpeg',
                      dataUrl: 'data:image/jpeg;base64,bGluZQ=='
                    }
                  }
                ],
                LINES_json: JSON.stringify([
                  {
                    __ckRowId: 'row-1',
                    LINE_PHOTO: {
                      name: 'line.jpg',
                      type: 'image/jpeg',
                      dataUrl: 'data:image/jpeg;base64,bGluZQ=='
                    }
                  }
                ])
              }
            }
          ]
        })
      });
      const saveBody = await saveRes.json();

      expect(saveRes.status).toBe(200);
      expect(saveBody.result).toMatchObject({
        success: true,
        meta: {
          id: 'check-1',
          rowNumber: 2,
          dataVersion: 1,
          operation: 'create',
          uploadValues: {
            top: {
              PHOTO: 'https://drive.google.com/file/d/drive-photo-1/view'
            },
            line: [
              {
                groupId: 'LINES',
                rowId: 'row-1',
                fieldId: 'LINE_PHOTO',
                value: 'https://drive.google.com/file/d/drive-line-photo-1/view'
              }
            ]
          }
        }
      });
      expect(uploadFile).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          name: 'top.jpg',
          mimeType: 'image/jpeg',
          buffer: expect.any(Buffer)
        }),
        { folderId: 'uploads-folder' }
      );
      expect(uploadFile).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          name: 'line.jpg',
          mimeType: 'image/jpeg',
          buffer: expect.any(Buffer)
        }),
        { folderId: 'line-uploads-folder' }
      );
      expect(updateRowValues).toHaveBeenCalledWith(
        'spreadsheet-1',
        'Checklist Data',
        2,
        expect.arrayContaining([
          'EN',
          'https://drive.google.com/file/d/drive-photo-1/view',
          JSON.stringify([
            {
              __ckRowId: 'row-1',
              LINE_PHOTO: 'https://drive.google.com/file/d/drive-line-photo-1/view'
            }
          ]),
          'check-1',
          1
        ])
      );
    } finally {
      await closeServer(server);
    }
  });

  test('exposes Drive uploads through the uploadFiles RPC', async () => {
    const uploadFile = jest.fn().mockResolvedValue({
      id: 'drive-file-1',
      webViewLink: 'https://drive.google.com/file/d/drive-file-1/view'
    });
    const server = createServer({
      env: {
        CK_FILE_BACKEND: 'drive',
        CK_DEFAULT_SPREADSHEET_ID: 'spreadsheet-1'
      },
      driveClient: {
        getFileMetadata: jest.fn(),
        uploadFile
      }
    });
    const baseUrl = await listen(server);

    try {
      const res = await fetch(`${baseUrl}/api/rpc`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fnName: 'uploadFiles',
          args: [
            [{ name: 'receipt.txt', type: 'text/plain', base64: 'cmVjZWlwdA==' }],
            { destinationFolderId: 'uploads-folder' }
          ]
        })
      });
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.result).toEqual({
        success: true,
        urls: 'https://drive.google.com/file/d/drive-file-1/view'
      });
      expect(uploadFile).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'receipt.txt',
          mimeType: 'text/plain',
          buffer: expect.any(Buffer)
        }),
        { folderId: 'uploads-folder' }
      );
    } finally {
      await closeServer(server);
    }
  });

  test('returns a clear Shared Drive requirement when service-account Drive uploads lack storage quota', async () => {
    const uploadFile = jest.fn().mockRejectedValue(new Error('Service Accounts do not have storage quota.'));
    const server = createServer({
      env: {
        CK_FILE_BACKEND: 'drive',
        CK_DEFAULT_SPREADSHEET_ID: 'spreadsheet-1'
      },
      driveClient: {
        getFileMetadata: jest.fn(),
        uploadFile
      }
    });
    const baseUrl = await listen(server);

    try {
      const res = await fetch(`${baseUrl}/api/rpc`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fnName: 'uploadFiles',
          args: [
            [{ name: 'receipt.txt', type: 'text/plain', base64: 'cmVjZWlwdA==' }],
            { destinationFolderId: 'uploads-folder' }
          ]
        })
      });
      const body = await res.json();

      expect(res.status).toBe(500);
      expect(body.ok).toBe(false);
      expect(body.error.message).toContain('require a Shared Drive upload folder');
      expect(uploadFile).toHaveBeenCalledTimes(1);
    } finally {
      await closeServer(server);
    }
  });
});

describe('FirestoreDataSourceRepository', () => {
  test('reads, filters, and projects Firestore-backed data source items', async () => {
    const listDocuments = jest.fn().mockResolvedValue({
      nextPageToken: 'NEXT',
      documents: [
        {
          name: 'projects/p/databases/d/documents/dataSources/Recipes/items/one',
          fields: {
            values: {
              mapValue: {
                fields: {
                  Name: { stringValue: 'Soup' },
                  Locale: { stringValue: 'EN' },
                  Status: { stringValue: 'active' }
                }
              }
            }
          }
        },
        {
          name: 'projects/p/databases/d/documents/dataSources/Recipes/items/two',
          fields: {
            values: {
              mapValue: {
                fields: {
                  Name: { stringValue: 'Soupe' },
                  Locale: { stringValue: 'FR' },
                  Status: { stringValue: 'active' }
                }
              }
            }
          }
        }
      ]
    });
    const repository = new FirestoreDataSourceRepository({ listDocuments });

    const result = await repository.fetchDataSource(
      {
        id: 'Recipes',
        localeKey: 'Locale',
        statusFieldId: 'Status',
        statusAllowList: ['active'],
        mapping: { label: 'Name' },
        projection: ['Name'],
        limit: 50
      },
      'EN',
      undefined,
      undefined,
      'PAGE'
    );

    expect(listDocuments).toHaveBeenCalledWith('/dataSources/Recipes/items', {
      pageSize: 50,
      orderBy: 'sortKey',
      pageToken: 'PAGE'
    });
    expect(result).toEqual({
      items: [{ Name: 'Soup', label: 'Soup' }],
      nextPageToken: 'NEXT',
      totalCount: undefined
    });
  });

  test('resolves form-scoped collection paths and scalar projections', () => {
    expect(resolveDataSourceCollectionPath({ formKey: 'Config: Meal/Production', id: 'Recipe Data' })).toBe(
      '/forms/Config%3A%20Meal_Production/dataSources/Recipe%20Data/items'
    );
    expect(projectDataSourceItem({ Name: 'Soup', Status: 'active' }, { projection: ['Name'] }, undefined)).toBe(
      'Soup'
    );
  });
});

describe('GoogleSheetsDataSourceRepository', () => {
  test('reads existing Sheets data with pagination, filters, projection, and mapping', async () => {
    const getSheetValues = jest.fn().mockResolvedValue([
      ['Recipe [Name]', 'Locale', 'Status', 'Supplier'],
      ['Soup', 'EN', 'Active', 'Kitchen'],
      ['Soupe', 'FR', 'Active', 'Cuisine'],
      ['Retired', 'EN', 'Inactive', 'Archive']
    ]);
    const repository = new GoogleSheetsDataSourceRepository({
      env: { CK_DEFAULT_SPREADSHEET_ID: 'spreadsheet-1' },
      sheetsClient: { getSheetValues }
    });

    const result = await repository.fetchDataSource(
      {
        id: 'Recipes Data',
        localeKey: 'locale',
        statusFieldId: 'status',
        statusAllowList: ['Active'],
        projection: ['Name', 'Supplier'],
        mapping: { label: 'Name' },
        limit: 2
      },
      'EN',
      undefined,
      undefined,
      undefined
    );

    expect(getSheetValues).toHaveBeenCalledWith('spreadsheet-1', 'Recipes Data');
    expect(result).toEqual({
      items: [{ Name: 'Soup', label: 'Soup', Supplier: 'Kitchen' }],
      nextPageToken: expect.any(String),
      totalCount: 3
    });
  });

  test('preserves Apps Script form-backed system fields for projected Sheets data sources', async () => {
    const getSheetValues = jest.fn().mockResolvedValue([
      ['Recipe [Name]', 'Status', 'Record ID', 'Updated At', 'Data Version'],
      ['Soup', 'Active', 'recipe-1', '2026-04-30T10:00:00Z', '7'],
      ['Retired', 'Disabled', 'recipe-2', '2026-04-29T10:00:00Z', '2']
    ]);
    const repository = new GoogleSheetsDataSourceRepository({
      env: { CK_DEFAULT_SPREADSHEET_ID: 'spreadsheet-1' },
      sheetsClient: { getSheetValues }
    });

    const result = await repository.fetchDataSource(
      {
        id: 'Recipes Data',
        formKey: 'Config: Recipes',
        statusFieldId: 'status',
        statusAllowList: ['Active'],
        projection: ['Name'],
        limit: 10
      },
      'EN',
      undefined,
      undefined,
      undefined
    );

    expect(result).toEqual({
      items: [
        {
          Name: 'Soup',
          id: 'recipe-1',
          status: 'Active',
          updatedAt: '2026-04-30T10:00:00Z',
          dataVersion: '7'
        }
      ],
      nextPageToken: undefined,
      totalCount: 2
    });
  });

  test('uses explicit sheetId::tabName data source ids without a default spreadsheet id', async () => {
    const getSheetValues = jest.fn().mockResolvedValue([
      ['Name'],
      ['Soup']
    ]);
    const repository = new GoogleSheetsDataSourceRepository({ sheetsClient: { getSheetValues } });

    await repository.fetchDataSource('sheet-2::Recipes', 'EN', ['Name'], 10);

    expect(getSheetValues).toHaveBeenCalledWith('sheet-2', 'Recipes');
  });
});

describe('GoogleDriveFileRepository', () => {
  test('normalizes Drive file metadata from Google Drive API', async () => {
    const repository = new GoogleDriveFileRepository({
      driveClient: {
        getFileMetadata: jest.fn().mockResolvedValue({
          id: 'file-1',
          name: 'template.html',
          mimeType: 'text/html',
          size: '123',
          modifiedTime: '2026-04-29T10:00:00Z',
          webViewLink: 'https://drive.google.com/file/d/file-1/view'
        })
      }
    });

    await expect(repository.fetchDriveFileMetadata('file-1')).resolves.toEqual({
      id: 'file-1',
      name: 'template.html',
      mimeType: 'text/html',
      size: 123,
      modifiedTime: '2026-04-29T10:00:00Z',
      webViewLink: 'https://drive.google.com/file/d/file-1/view',
      webContentLink: '',
      accessible: true
    });
  });

  test('converts rendered HTML to a PDF artifact through Drive API', async () => {
    const uploadFile = jest
      .fn()
      .mockResolvedValueOnce({
        id: 'temp-doc-1',
        webViewLink: 'https://docs.google.com/document/d/temp-doc-1/edit'
      })
      .mockResolvedValueOnce({
        id: 'pdf-1',
        webViewLink: 'https://drive.google.com/file/d/pdf-1/view'
      });
    const exportFile = jest.fn().mockResolvedValue(Buffer.from('%PDF-1.4', 'utf8'));
    const trashFile = jest.fn().mockResolvedValue({});
    const repository = new GoogleDriveFileRepository({
      driveClient: {
        uploadFile,
        exportFile,
        trashFile
      }
    });

    await expect(
      repository.createPdfFromHtml({
        html: '<h1>Report</h1>',
        name: 'Meal Production - mp-1',
        folderId: 'pdf-folder'
      })
    ).resolves.toMatchObject({
      success: true,
      fileId: 'pdf-1',
      url: 'https://drive.google.com/file/d/pdf-1/view',
      mimeType: 'application/pdf',
      fileName: 'Meal Production - mp-1.pdf'
    });

    expect(uploadFile).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        name: 'Meal Production - mp-1',
        mimeType: 'text/html',
        buffer: expect.any(Buffer)
      }),
      expect.objectContaining({
        folderId: 'pdf-folder',
        metadataMimeType: 'application/vnd.google-apps.document'
      })
    );
    expect(exportFile).toHaveBeenCalledWith('temp-doc-1', 'application/pdf');
    expect(uploadFile).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        name: 'Meal Production - mp-1.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from('%PDF-1.4', 'utf8')
      }),
      expect.objectContaining({ folderId: 'pdf-folder' })
    );
    expect(trashFile).toHaveBeenCalledWith('temp-doc-1');
  });
});

describe('GoogleSheetsSubmissionRepository', () => {
  test('reads list items and hydrated records from bundled config destination tabs', async () => {
    const repository = new GoogleSheetsSubmissionRepository({
      env: { CK_DEFAULT_SPREADSHEET_ID: 'spreadsheet-1' },
      configRepository: new FormConfigRepository({
        bundle: {
          forms: [
            {
              formKey: 'Config: Recipes',
              form: { title: 'Recipes', configSheet: 'Config: Recipes', destinationTab: 'Recipes Data' },
              questions: [
                { id: 'NAME', type: 'TEXT', qEn: 'Name', status: 'Active' },
                { id: 'ACTIVE_ON', type: 'DATE', qEn: 'Active on', status: 'Active' }
              ],
              definition: {
                questions: [
                  { id: 'NAME', type: 'TEXT', qEn: 'Name', status: 'Active' },
                  { id: 'ACTIVE_ON', type: 'DATE', qEn: 'Active on', status: 'Active' }
                ]
              }
            }
          ]
        }
      }),
      sheetsClient: {
        getSheetValues: jest.fn().mockResolvedValue([
          ['Language', 'Name [NAME]', 'Active on [ACTIVE_ON]', 'Record ID', 'Data Version', 'Created At', 'Updated At', 'Status'],
          ['EN', 'Soup', '2026-04-30', 'recipe-1', '4', '2026-04-29T10:00:00Z', '2026-04-30T10:00:00Z', 'Active']
        ])
      }
    });

    const result = await repository.fetchSubmissionsBatch('Config: Recipes', ['NAME'], 10, undefined, true);

    expect(result.list.items).toEqual([
      expect.objectContaining({
        id: 'recipe-1',
        __rowNumber: 2,
        NAME: 'Soup',
        status: 'Active',
        dataVersion: 4
      })
    ]);
    expect(result.records['recipe-1']).toMatchObject({
      id: 'recipe-1',
      dataVersion: 4,
      rowNumber: 2,
      values: {
        NAME: 'Soup',
        ACTIVE_ON: '2026-04-30'
      }
    });
  });

  test('saveSubmissionWithId returns noop only when unchanged-row contract is requested', async () => {
    const rows = [
      ['Language', 'Name [NAME]', 'Active on [ACTIVE_ON]', 'Record ID', 'Data Version', 'Created At', 'Updated At', 'Status'],
      ['EN', 'Soup', '2026-04-30', 'recipe-1', '4', '2026-04-29T10:00:00Z', '2026-04-30T10:00:00Z', 'Active']
    ];
    const indexRows: any[][] = [];
    const repository = new GoogleSheetsSubmissionRepository({
      env: { CK_DEFAULT_SPREADSHEET_ID: 'spreadsheet-1' },
      configRepository: new FormConfigRepository({
        bundle: {
          forms: [
            {
              formKey: 'Config: Recipes',
              form: { title: 'Recipes', configSheet: 'Config: Recipes', destinationTab: 'Recipes Data' },
              questions: [
                { id: 'NAME', type: 'TEXT', qEn: 'Name', status: 'Active' },
                { id: 'ACTIVE_ON', type: 'DATE', qEn: 'Active on', status: 'Active' }
              ],
              definition: {
                questions: [
                  { id: 'NAME', type: 'TEXT', qEn: 'Name', status: 'Active' },
                  { id: 'ACTIVE_ON', type: 'DATE', qEn: 'Active on', status: 'Active' }
                ]
              }
            }
          ]
        }
      }),
      sheetsClient: {
        getSheetValues: jest.fn().mockImplementation(async (_spreadsheetId, tabName) =>
          tabName === 'Recipes Data' ? rows.map(row => row.slice()) : indexRows.map(row => row.slice())
        ),
        updateRowValues: jest.fn().mockImplementation(async (_spreadsheetId, tabName, rowNumber, values) => {
          const target = tabName === 'Recipes Data' ? rows : indexRows;
          while (target.length < rowNumber) target.push([]);
          target[rowNumber - 1] = values.slice();
          return { updatedRows: 1 };
        })
      }
    });
    const updateRowValues = repository.sheetsClient.updateRowValues;

    const basePayload = {
      formKey: 'Config: Recipes',
      language: 'EN',
      id: 'recipe-1',
      values: {
        NAME: 'Soup',
        ACTIVE_ON: '2026-04-30'
      },
      __ckSkipSubmitEffects: true,
      __ckSaveMode: 'draft',
      __ckStatus: 'Active',
      __ckClientDataVersion: 4
    };

    const withoutContract = await repository.saveSubmissionWithId(basePayload);
    expect(withoutContract).toMatchObject({
      success: true,
      message: 'Saved to sheet',
      meta: {
        id: 'recipe-1',
        dataVersion: 5,
        operation: 'update'
      }
    });
    expect(updateRowValues.mock.calls.filter((call: any[]) => call[1] === 'Recipes Data')).toHaveLength(1);

    const withContract = await repository.saveSubmissionWithId({
      ...basePayload,
      __ckClientDataVersion: 5,
      __ckNoopIfUnchanged: '1'
    });
    expect(withContract).toMatchObject({
      success: true,
      message: 'No changes to save.',
      meta: {
        id: 'recipe-1',
        dataVersion: 5,
        operation: 'noop',
        noop: true,
        noopReason: 'unchanged'
      }
    });
    expect(updateRowValues.mock.calls.filter((call: any[]) => call[1] === 'Recipes Data')).toHaveLength(1);
  });
});
