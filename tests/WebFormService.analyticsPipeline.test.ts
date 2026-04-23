import './mocks/GoogleAppsScript';
import { MockSpreadsheet } from './mocks/GoogleAppsScript';

import { WebFormService } from '../src/services/WebFormService';
import { AnalyticsPipelineService } from '../src/services/webform/analytics/pipelineService';

describe('WebFormService analytics pipeline integration', () => {
  const mockFormTitle = 'Meal Production Pipeline Test';
  const mockFormKey = 'Config: Meal Production Pipeline Test';
  let ss: MockSpreadsheet;
  let service: WebFormService;

  beforeEach(() => {
    ss = new MockSpreadsheet();
    service = new WebFormService(ss as any);

    const dashboardSheet = ss.getSheetByName('Forms Dashboard') || ss.insertSheet('Forms Dashboard');
    const pipelineConfig = JSON.stringify({
      analytics: {
        pipelines: [
          {
            id: 'ingredient_usage',
            type: 'ingredientUsageReport',
            title: 'Ingredients usage',
            ui: {
              dateLabel: 'From date',
              submitLabel: 'Send report',
              queuedNotice: 'The report has been queued.'
            },
            email: {
              recipients: ['hmaldonadovilla@outlook.com']
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
    });

    const dashboardData = [
      [],
      [],
      ['Form Title', 'Configuration Sheet Name', 'Destination Tab Name', 'Description', 'Form ID', 'Edit URL', 'Published URL', 'Follow-up Config (JSON)'],
      [mockFormTitle, mockFormKey, 'Meal Production Data', 'Desc', '', '', '', pipelineConfig]
    ];
    (dashboardSheet as any).setMockData(dashboardData);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('fetchAnalyticsDashboard exposes configured analytics pipelines', () => {
    const dashboard = service.fetchAnalyticsDashboard();

    expect(dashboard.pipelines).toEqual(
      expect.arrayContaining([
      expect.objectContaining({
        dashboardPipelineId: `${mockFormKey}::ingredient_usage`,
        ownerFormKey: mockFormKey,
        pipelineId: 'ingredient_usage',
        sourceFormKey: mockFormKey,
        sourceFormTitle: mockFormTitle,
        title: 'Ingredients usage',
        dateLabel: 'From date',
        submitLabel: 'Send report',
        queuedNotice: 'The report has been queued.'
      })
      ])
    );
  });

  test('queueAnalyticsPipelineRun stores jobs and runQueuedAnalyticsPipelineJobs executes them', () => {
    const store = new Map<string, string>();
    const props: GoogleAppsScript.Properties.Properties = {
      getProperty: jest.fn((key: string) => (store.has(key) ? store.get(key) || null : null)),
      setProperty: jest.fn(),
      deleteProperty: jest.fn(),
      deleteAllProperties: jest.fn(() => {
        store.clear();
        return props;
      }),
      getKeys: jest.fn(() => Array.from(store.keys())),
      getProperties: jest.fn(() =>
        Array.from(store.entries()).reduce<Record<string, string>>((acc, [key, value]) => {
          acc[key] = value;
          return acc;
        }, {})
      ),
      setProperties: jest.fn((values: Record<string, string>, deleteAllOthers?: boolean) => {
        if (deleteAllOthers) store.clear();
        Object.entries(values || {}).forEach(([key, value]) => {
          store.set(key, value);
        });
        return props;
      })
    };
    props.setProperty = jest.fn((key: string, value: string) => {
      store.set(key, value);
      return props;
    });
    props.deleteProperty = jest.fn((key: string) => {
      store.delete(key);
      return props;
    });
    const lock = {
      waitLock: jest.fn(),
      releaseLock: jest.fn()
    };
    const triggers: any[] = [];
    const previousPropertiesService = (global as any).PropertiesService;
    const previousLockService = (global as any).LockService;
    const previousScriptApp = (global as any).ScriptApp;

    (global as any).PropertiesService = {
      getScriptProperties: () => props
    };
    (global as any).LockService = {
      getScriptLock: () => lock
    };
    (global as any).ScriptApp = {
      newTrigger: jest.fn((handler: string) => ({
        timeBased: () => ({
          after: () => ({
            create: () => {
              const trigger = {
                getHandlerFunction: () => handler,
                getUniqueId: () => 'trigger-1'
              };
              triggers.push(trigger);
              return trigger;
            }
          })
        })
      })),
      getProjectTriggers: jest.fn(() => triggers),
      deleteTrigger: jest.fn((trigger: any) => {
        const idx = triggers.indexOf(trigger);
        if (idx >= 0) triggers.splice(idx, 1);
      })
    };

    const context = {
      ownerForm: { configSheet: mockFormKey, title: mockFormTitle },
      sourceForm: { configSheet: mockFormKey, title: mockFormTitle },
      sourceQuestions: [],
      pipeline: {
        id: 'ingredient_usage',
        type: 'ingredientUsageReport',
        ui: { queuedNotice: 'The report has been queued.' }
      }
    };
    jest.spyOn(service as any, 'getAnalyticsPipelineContext').mockReturnValue(context);
    const runSpy = jest.spyOn(AnalyticsPipelineService.prototype, 'runPipeline').mockReturnValue({
      success: true,
      summary: {
        startDate: '2026-04-20',
        endDate: '2026-04-23',
        recordCount: 1,
        rowCount: 1,
        attachmentName: 'report.xlsx'
      }
    } as any);
    jest.spyOn(service as any, 'scriptTodayIso').mockReturnValue('2026-04-23');

    try {
      const queued = service.queueAnalyticsPipelineRun({
        ownerFormKey: mockFormKey,
        pipelineId: 'ingredient_usage',
        startDate: '2026-04-20'
      });

      expect(queued).toEqual({
        success: true,
        message: 'The report has been queued.'
      });
      expect(store.get('CK_ANALYTICS_PIPELINE_QUEUE')).toContain('ingredient_usage');
      expect((global as any).ScriptApp.newTrigger).toHaveBeenCalledTimes(1);

      const result = service.runQueuedAnalyticsPipelineJobs();

      expect(result).toEqual({
        success: true,
        processed: 1,
        errors: []
      });
      expect(runSpy).toHaveBeenCalledTimes(1);
      expect(store.get('CK_ANALYTICS_PIPELINE_QUEUE')).toBeUndefined();
      expect((global as any).ScriptApp.deleteTrigger).toHaveBeenCalledTimes(1);
    } finally {
      (global as any).PropertiesService = previousPropertiesService;
      (global as any).LockService = previousLockService;
      (global as any).ScriptApp = previousScriptApp;
    }
  });
});
