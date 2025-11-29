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
      ['Form Title', 'Configuration Sheet Name', 'Destination Tab Name', 'Description', 'Web App URL (?form=ConfigSheetName)'],
      ['Deliveries Form', 'Config: Deliveries', 'Deliveries Data', 'Desc', 'https://example.com']
    ];
    sheet.setMockData(mockData);
    const dashboard = new Dashboard(mockSS as any);
    const forms = dashboard.getForms();
    expect(forms.length).toBe(1);
    expect(forms[0].configSheet).toBe('Config: Deliveries');
    expect(forms[0].rowIndex).toBe(5);
  });
});
