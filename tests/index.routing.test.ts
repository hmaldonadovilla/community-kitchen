import './mocks/GoogleAppsScript';
import { doGet, installTriggers } from '../src/index';
import { WebFormService } from '../src/services/WebFormService';

describe('index routing', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('routes to landing bundle when form is missing and canonicalizes admin-true', () => {
    const renderSpy = jest.spyOn(WebFormService.prototype, 'renderForm').mockReturnValue({} as any);

    doGet({ parameter: { 'admin-true': '' } } as any);

    expect(renderSpy).toHaveBeenCalledTimes(1);
    const args = renderSpy.mock.calls[0];
    expect(args[0]).toBeUndefined();
    expect((args[1] as any).app).toBe('landing');
    expect((args[1] as any).admin).toBe('true');
    expect((args[2] as any)?.isEnabled?.()).toBe(true);
  });

  it('preserves provided form key and canonicalizes truthy admin param', () => {
    const renderSpy = jest.spyOn(WebFormService.prototype, 'renderForm').mockReturnValue({} as any);

    doGet({ parameter: { form: 'Config: Meal Production', page: 'analytics', admin: '1' } } as any);

    expect(renderSpy).toHaveBeenCalledTimes(1);
    const args = renderSpy.mock.calls[0];
    expect(args[0]).toBe('Config: Meal Production');
    expect((args[1] as any).page).toBe('analytics');
    expect((args[1] as any).admin).toBe('true');
    expect((args[2] as any)?.isEnabled?.()).toBe(true);
  });

  it('installs daily analytics and lifecycle triggers alongside existing onEdit triggers', () => {
    const created: string[] = [];
    const scheduledHours: Record<string, number> = {};
    const previousScriptApp = (global as any).ScriptApp;
    const previousBrowser = (global as any).Browser;
    jest.spyOn(WebFormService.prototype, 'getScheduledRecordAlertTriggerSchedules').mockReturnValue([]);

    (global as any).ScriptApp = {
      getProjectTriggers: () => [],
      deleteTrigger: jest.fn(),
      newTrigger: (handler: string) => ({
        forSpreadsheet: () => ({
          onEdit: () => ({
            create: () => created.push(handler)
          })
        }),
        timeBased: () => ({
          everyDays: () => ({
            atHour: (hour: number) => ({
              create: () => {
                created.push(handler);
                scheduledHours[handler] = hour;
              }
            })
          })
        })
      })
    };
    (global as any).Browser = {
      msgBox: jest.fn(),
      Buttons: { OK: 'OK' }
    };

    try {
      installTriggers();
      expect(created).toEqual(
        expect.arrayContaining(['onConfigEdit', 'onResponsesEdit', 'runDailyAnalyticsRecompute', 'runDailyLifecycleRecompute'])
      );
      expect(scheduledHours.runDailyAnalyticsRecompute).toBe(23);
      expect(scheduledHours.runDailyLifecycleRecompute).toBe(2);
    } finally {
      (global as any).ScriptApp = previousScriptApp;
      (global as any).Browser = previousBrowser;
    }
  });

  it('installs configured scheduled record alert triggers at their configured times', () => {
    const created: Array<{ handler: string; hour: number; minute?: number }> = [];
    const deleted: string[] = [];
    const previousScriptApp = (global as any).ScriptApp;
    const previousBrowser = (global as any).Browser;
    jest.spyOn(WebFormService.prototype, 'getScheduledRecordAlertTriggerSchedules').mockReturnValue([
      { hour: 13, minute: 0 },
      { hour: 17, minute: 0 }
    ]);

    const existingAlertTrigger = { getHandlerFunction: () => 'runScheduledRecordAlerts' };
    (global as any).ScriptApp = {
      getProjectTriggers: () => [existingAlertTrigger],
      deleteTrigger: (trigger: any) => deleted.push(trigger.getHandlerFunction()),
      newTrigger: (handler: string) => ({
        forSpreadsheet: () => ({
          onEdit: () => ({
            create: () => undefined
          })
        }),
        timeBased: () => ({
          everyDays: () => ({
            atHour: (hour: number) => ({
              nearMinute: (minute: number) => ({
                create: () => {
                  created.push({ handler, hour, minute });
                }
              }),
              create: () => {
                created.push({ handler, hour });
              }
            })
          })
        })
      })
    };
    (global as any).Browser = {
      msgBox: jest.fn(),
      Buttons: { OK: 'OK' }
    };

    try {
      installTriggers();
      expect(deleted).toEqual(['runScheduledRecordAlerts']);
      expect(created).toEqual(
        expect.arrayContaining([
          { handler: 'runScheduledRecordAlerts', hour: 13, minute: 0 },
          { handler: 'runScheduledRecordAlerts', hour: 17, minute: 0 }
        ])
      );
    } finally {
      (global as any).ScriptApp = previousScriptApp;
      (global as any).Browser = previousBrowser;
    }
  });
});
