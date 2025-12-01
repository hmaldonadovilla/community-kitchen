import './mocks/GoogleAppsScript';
import { Dashboard } from '../src/config/Dashboard';
import { MockSpreadsheet, MockSheet } from './mocks/GoogleAppsScript';

describe('Dashboard', () => {
  let mockSS: MockSpreadsheet;
  let sheet: MockSheet;

  beforeEach(() => {
    mockSS = new MockSpreadsheet();
    sheet = mockSS.insertSheet('Forms Dashboard') as MockSheet;
  });

  test('getForms parses sheet data correctly', () => {
    const mockData = [
      [], [], [],
      ['Test Form', 'Config: Test', 'Test Logs', 'Desc', '123', 'url', 'pub']
    ];
    sheet.setMockData(mockData);
    const dashboard = new Dashboard(mockSS as any);
    const forms = dashboard.getForms();
    expect(forms.length).toBe(1);
    expect(forms[0].title).toBe('Test Form');
    expect(forms[0].formId).toBe('123');
  });

  test('getForms tolerates header row shifted down', () => {
    const mockData = [
      ['Forms Dashboard'],
      [],
      [],
      ['Form Title', 'Configuration Sheet Name', 'Destination Tab Name', 'Description', 'Web App URL (?form=ConfigSheetName)', 'Follow-up Config (JSON)'],
      ['Deliveries Form', 'Config: Deliveries', 'Deliveries Data', 'Desc', 'https://example.com', '']
    ];
    sheet.setMockData(mockData);
    const dashboard = new Dashboard(mockSS as any);
    const forms = dashboard.getForms();
    expect(forms.length).toBe(1);
    expect(forms[0].configSheet).toBe('Config: Deliveries');
    expect(forms[0].rowIndex).toBe(5);
  });

  test('getForms parses follow-up config JSON', () => {
    const followupConfig = JSON.stringify({
      pdfTemplateId: 'doc123',
      emailRecipients: ['ops@example.com', 'team@example.com'],
      statusTransitions: { onPdf: 'PDF ready' }
    });
    const mockData = [
      [],
      [],
      ['Form Title', 'Configuration Sheet Name', 'Destination Tab Name', 'Description', 'Web App URL (?form=ConfigSheetName)', 'Follow-up Config (JSON)'],
      ['Meal Form', 'Config: Meals', 'Meals Data', 'Desc', '', followupConfig]
    ];
    sheet.setMockData(mockData);
    const dashboard = new Dashboard(mockSS as any);
    const forms = dashboard.getForms();
    expect(forms[0].followupConfig).toBeDefined();
    expect(forms[0].followupConfig?.pdfTemplateId).toBe('doc123');
    expect(forms[0].followupConfig?.emailRecipients).toContain('team@example.com');
    expect(forms[0].followupConfig?.statusTransitions?.onPdf).toBe('PDF ready');
  });

  test('getForms parses list view meta columns from dashboard config', () => {
    const configJson = JSON.stringify({
      listViewMetaColumns: ['createdAt', 'status', 'pdfUrl']
    });
    const mockData = [
      [],
      [],
      ['Form Title', 'Configuration Sheet Name', 'Destination Tab Name', 'Description', 'Web App URL (?form=ConfigSheetName)', 'Follow-up Config (JSON)'],
      ['Meal Form', 'Config: Meals', 'Meals Data', 'Desc', '', configJson]
    ];
    sheet.setMockData(mockData);
    const dashboard = new Dashboard(mockSS as any);
    const forms = dashboard.getForms();
    expect(forms[0].listViewMetaColumns).toEqual(['createdAt', 'status', 'pdfUrl']);
  });
});
