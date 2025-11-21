import './mocks/GoogleAppsScript';
import { Dashboard } from '../src/config/Dashboard';
import { MockSpreadsheet, MockSheet } from './mocks/GoogleAppsScript';

describe('Dashboard', () => {
  let mockSS: MockSpreadsheet;
  let dashboard: Dashboard;

  beforeEach(() => {
    mockSS = new MockSpreadsheet();
    // Pre-create dashboard sheet with data
    const sheet = mockSS.insertSheet('Forms Dashboard');
    // Mock data: 3 header rows + 1 data row
    // Data: Title, Config, Dest, Desc, ID, Edit, Pub
    const mockData = [
      [], [], [], // Headers
      ['Test Form', 'Config: Test', 'Test Logs', 'Desc', '123', 'url', 'pub']
    ];
    (sheet as any).setMockData(mockData);
    
    dashboard = new Dashboard(mockSS as any);
  });

  test('getForms parses sheet data correctly', () => {
    const forms = dashboard.getForms();
    expect(forms.length).toBe(1);
    expect(forms[0].title).toBe('Test Form');
    expect(forms[0].formId).toBe('123');
  });
});
