import './mocks/GoogleAppsScript';
import { MockSpreadsheet } from './mocks/GoogleAppsScript';

jest.mock('../src/config/analyticsPage', () => {
  const actual = jest.requireActual('../src/config/analyticsPage');
  return {
    ...actual,
    ANALYTICS_PAGE_CONFIG: {
      pageTitle: 'Analytics',
      pageDescription: 'Review analytics across configured forms.',
      copy: {
        loadingLabel: 'Loading analytics...',
        emptyLabel: 'No analytics widgets are configured for this dashboard.',
        backToLandingLabel: 'Back to forms',
        pendingNavigationTitle: 'Please wait',
        pendingNavigationMessage: 'Opening forms...'
      },
      landingTile: {
        title: 'Analytics',
        description: 'Review analytics across configured forms.',
        section: 'admin',
        order: 40
      },
      sections: [
        {
          id: 'operations',
          title: 'Operations',
          widgets: [
            {
              id: 'analytics_closed_qty',
              sourceFormKey: 'Config: Analytics',
              sourceWidgetId: 'closed_qty',
              title: 'Closed quantity'
            }
          ]
        }
      ]
    }
  };
});

import { WebFormService } from '../src/services/WebFormService';
import * as templateModule from '../src/services/webform/template';

describe('WebFormService analytics integration', () => {
  let ss: MockSpreadsheet;
  let service: WebFormService;

  beforeEach(() => {
    ss = new MockSpreadsheet();
    service = new WebFormService(ss as any);

    const dashboardSheet = ss.getSheetByName('Forms Dashboard') || ss.insertSheet('Forms Dashboard');

    const dashboardConfig = JSON.stringify({
      analytics: {
        widgets: [
          {
            id: 'closed_qty',
            label: { en: 'Closed quantity' },
            placements: ['listView', 'analyticsPage'],
            maximumFractionDigits: 0,
            calculation: {
              type: 'aggregate',
              aggregate: 'sum',
              fieldId: 'QTY',
              when: { fieldId: 'NOTE', equals: 'closed' }
            }
          }
        ]
      }
    });

    const dashboardData = [
      [],
      [],
      ['Form Title', 'Configuration Sheet Name', 'Destination Tab Name', 'Description', 'Form ID', 'Edit URL', 'Published URL', 'Follow-up Config (JSON)'],
      ['Analytics Form', 'Config: Analytics', 'Analytics Data', 'Desc', '', '', '', dashboardConfig]
    ];
    (dashboardSheet as any).setMockData(dashboardData);

    const configSheet = ss.insertSheet('Config: Analytics');
    const configRows = [
      ['ID', 'Type', 'Q En', 'Q Fr', 'Q Nl', 'Req', 'Opt En', 'Opt Fr', 'Opt Nl', 'Status', 'Config', 'OptionFilter', 'Validation', 'List View?', 'Edit'],
      ['QTY', 'NUMBER', 'Quantity', 'Quantité', 'Hoeveelheid', false, '', '', '', 'Active', '', '', '', '', ''],
      ['NOTE', 'TEXT', 'Note', 'Note', 'Notitie', false, '', '', '', 'Active', '', '', '', '', '']
    ];
    (configSheet as any).setMockData(configRows);

  });

  it('recomputes analytics on save and exposes snapshots in bootstrap payloads', () => {
    const first = service.saveSubmissionWithId({
      formKey: 'Config: Analytics',
      language: 'EN',
      id: 'REC-1',
      QTY: 7,
      NOTE: 'closed'
    } as any);
    expect(first.success).toBe(true);

    const second = service.saveSubmissionWithId({
      formKey: 'Config: Analytics',
      language: 'EN',
      id: 'REC-2',
      QTY: 5,
      NOTE: 'open'
    } as any);
    expect(second.success).toBe(true);

    const third = service.saveSubmissionWithId({
      formKey: 'Config: Analytics',
      language: 'EN',
      id: 'REC-3',
      QTY: 2,
      NOTE: 'closed'
    } as any);
    expect(third.success).toBe(true);

    const bootstrap = service.fetchBootstrapContext('Config: Analytics', { includeAnalytics: true });
    expect(bootstrap.analytics).toBeDefined();
    expect(bootstrap.analyticsRev).toBeGreaterThanOrEqual(1);
    const metric = (bootstrap.analytics?.items || []).find(item => item.id === 'closed_qty');
    expect(metric).toBeDefined();
    expect(metric?.value).toBe(9);
    expect(metric?.placements).toEqual(['listView', 'analyticsPage']);

    const home = service.fetchHomeBootstrap('Config: Analytics');
    expect(home.notModified).toBe(false);
    expect(home.cache === 'hit' || home.cache === 'miss').toBe(true);
    expect(home.listResponse).toBeUndefined();
    expect((home as any).analytics).toBeUndefined();

    const notModified = service.fetchHomeBootstrap('Config: Analytics', home.rev);
    expect(notModified.notModified).toBe(true);
  });

  it('supports daily recompute endpoint', () => {
    service.saveSubmissionWithId({
      formKey: 'Config: Analytics',
      language: 'EN',
      id: 'REC-10',
      QTY: 3,
      NOTE: 'closed'
    } as any);

    const result = service.runDailyAnalyticsRecompute();
    expect(result.success).toBe(true);
    expect(result.updatedForms).toBeGreaterThanOrEqual(1);
    expect(result.errors).toEqual([]);
  });

  it('builds the centralized analytics dashboard from configured form snapshots', () => {
    service.saveSubmissionWithId({
      formKey: 'Config: Analytics',
      language: 'EN',
      id: 'REC-20',
      QTY: 18,
      NOTE: 'closed'
    } as any);
    service.saveSubmissionWithId({
      formKey: 'Config: Analytics',
      language: 'EN',
      id: 'REC-21',
      QTY: 5,
      NOTE: 'open'
    } as any);
    service.saveSubmissionWithId({
      formKey: 'Config: Analytics',
      language: 'EN',
      id: 'REC-22',
      QTY: 7,
      NOTE: 'closed'
    } as any);

    const dashboard = service.fetchAnalyticsDashboard();
    expect(dashboard.pageTitle).toBe('Analytics');
    expect(dashboard.errors).toEqual([]);
    expect(dashboard.sections).toHaveLength(1);
    expect(dashboard.sections[0]?.widgets).toHaveLength(1);
    expect(dashboard.sections[0]?.widgets[0]).toMatchObject({
      dashboardWidgetId: 'analytics_closed_qty',
      id: 'closed_qty',
      sourceFormKey: 'Config: Analytics',
      sourceFormTitle: 'Analytics Form',
      sourceWidgetId: 'closed_qty',
      title: 'Closed quantity',
      value: 25
    });
    expect((dashboard.updatedAt || '').toString()).not.toBe('');
  });

  it('renders the centralized analytics page without binding a bundled form bootstrap', () => {
    const shellSpy = jest.spyOn(templateModule, 'buildReactShellTemplate').mockReturnValue('<html>shell</html>');
    const embeddedSpy = jest.spyOn(templateModule, 'buildReactTemplate').mockReturnValue('<html>embedded</html>');
    const htmlOutput = { setTitle: jest.fn().mockReturnThis() } as any;
    const createHtmlOutputSpy = jest.spyOn((global as any).HtmlService, 'createHtmlOutput').mockReturnValue(htmlOutput);

    service.renderForm(undefined, { app: 'analytics' } as any);

    expect(shellSpy).toHaveBeenCalledTimes(1);
    expect(shellSpy).toHaveBeenCalledWith('', 'analytics', { app: 'analytics' }, undefined);
    expect(embeddedSpy).not.toHaveBeenCalled();
    expect(createHtmlOutputSpy).toHaveBeenCalledWith('<html>shell</html>');
    expect(htmlOutput.setTitle).toHaveBeenCalledWith('Community Kitchen');
  });
});
