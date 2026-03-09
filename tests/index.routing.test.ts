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
  });

  it('preserves provided form key and canonicalizes truthy admin param', () => {
    const renderSpy = jest.spyOn(WebFormService.prototype, 'renderForm').mockReturnValue({} as any);

    doGet({ parameter: { form: 'Config: Meal Production', page: 'analytics', admin: '1' } } as any);

    expect(renderSpy).toHaveBeenCalledTimes(1);
    const args = renderSpy.mock.calls[0];
    expect(args[0]).toBe('Config: Meal Production');
    expect((args[1] as any).page).toBe('analytics');
    expect((args[1] as any).admin).toBe('true');
  });

  it('installs daily analytics trigger alongside existing onEdit triggers', () => {
    const created: string[] = [];
    const previousScriptApp = (global as any).ScriptApp;
    const previousBrowser = (global as any).Browser;

    (global as any).ScriptApp = {
      getProjectTriggers: () => [],
      newTrigger: (handler: string) => ({
        forSpreadsheet: () => ({
          onEdit: () => ({
            create: () => created.push(handler)
          })
        }),
        timeBased: () => ({
          everyDays: () => ({
            atHour: () => ({
              create: () => created.push(handler)
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
      expect(created).toEqual(expect.arrayContaining(['onConfigEdit', 'onResponsesEdit', 'runDailyAnalyticsRecompute']));
    } finally {
      (global as any).ScriptApp = previousScriptApp;
      (global as any).Browser = previousBrowser;
    }
  });
});
