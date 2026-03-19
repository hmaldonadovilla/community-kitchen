import './mocks/GoogleAppsScript';
import { MockSpreadsheet } from './mocks/GoogleAppsScript';
import { WebFormService } from '../src/services/WebFormService';

describe('WebFormService analytics integration', () => {
  let ss: MockSpreadsheet;
  let service: WebFormService;

  beforeEach(() => {
    ss = new MockSpreadsheet();
    service = new WebFormService(ss as any);

    const dashboardSheet = ss.getSheetByName('Forms Dashboard');
    if (!dashboardSheet) throw new Error('Dashboard not created');

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
    expect(home.analytics).toBeDefined();
    expect((home.analytics?.items || []).find(item => item.id === 'closed_qty')?.value).toBe(9);

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
});
