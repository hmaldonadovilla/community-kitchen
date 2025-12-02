import './mocks/GoogleAppsScript';
import { FormGenerator } from '../src/services/FormGenerator';
import { ConfigSheet } from '../src/config/ConfigSheet';
import { Dashboard } from '../src/config/Dashboard';
import { WebFormService } from '../src/services/WebFormService';
import { MockSpreadsheet } from './mocks/GoogleAppsScript';

describe('FormGenerator', () => {
  let mockSS: MockSpreadsheet;
  let generator: FormGenerator;

  beforeEach(() => {
    mockSS = new MockSpreadsheet();
    generator = new FormGenerator(mockSS as any);
    
    // Spy on ConfigSheet.setupExample
    jest.spyOn(ConfigSheet, 'setupExample');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('setup creates example config and processes dashboard rows', () => {
    // 1. Setup Dashboard sheet with data
    // Note: FormGenerator constructor creates the Dashboard sheet if it doesn't exist.
    // We must retrieve that instance instead of creating a new one, otherwise the generator won't see our mock data.
    const dashboardSheet = mockSS.getSheetByName('Forms Dashboard');
    if (!dashboardSheet) throw new Error('Dashboard sheet should have been created by FormGenerator');

    const dashboardData = [
      ['Form Title', 'Configuration Sheet Name', 'Destination Tab Name', 'Description', 'Form ID', 'Edit URL', 'Published URL'], // Header row 3
      ['Example Form', 'Config: Example', 'Form Responses', 'Desc', '', '', ''], // Row 4
      ['Custom Form', 'Config: Custom', 'Custom Responses', 'Desc', '', '', '']  // Row 5 (New custom form)
    ];
    
    // Mock Dashboard data reading
    // Dashboard.getForms reads from row 4
    // We need to ensure getRange returns the data
    // The Dashboard class implementation:
    // const data = this.sheet.getRange(4, 1, lastRow - 3, 5).getValues();
    
    // We need to set the mock data in a way that MockSheet.getRange returns it correctly
    // Our MockSheet.setMockData sets the whole data array.
    // We need to pad the first 2 rows to match row indices (1-based)
    const fullSheetData = [
      [], // Row 0 (unused)
      [], // Row 1
      dashboardData[0], // Row 3 (Headers) - Index 2
      dashboardData[1], // Row 4 - Index 3
      dashboardData[2]  // Row 5 - Index 4
    ];
    (dashboardSheet as any).setMockData(fullSheetData);

    // 2. Run setup
    generator.setup();

    // 3. Verify setupExample called for both
    // Called 3 times: 
    // 1. Explicit call for 'Config: Example' in setup()
    // 2. Loop call for 'Config: Example' (from dashboard)
    // 3. Loop call for 'Config: Custom' (from dashboard)
    expect(ConfigSheet.setupExample).toHaveBeenCalledTimes(3);
    
    // First call for default example (hardcoded in setup)
    expect(ConfigSheet.setupExample).toHaveBeenCalledWith(
      expect.anything(), 
      'Config: Example', 
      expect.anything()
    );
    
    // Second call for the custom form found in dashboard
    expect(ConfigSheet.setupExample).toHaveBeenCalledWith(
      expect.anything(), 
      'Config: Custom', 
      expect.anything()
    );
  });

  test('createAllForms invalidates server cache', () => {
    const forms = [
      {
        title: 'Menu Form',
        configSheet: 'Config: Menu',
        destinationTab: 'Menu Responses',
        description: 'desc',
        rowIndex: 4
      }
    ] as any;

    jest.spyOn(Dashboard.prototype, 'getForms').mockReturnValue(forms);
    jest.spyOn(Dashboard.prototype, 'getWebAppUrl').mockReturnValue('https://example.com/exec');
    jest.spyOn(Dashboard.prototype, 'updateFormDetails').mockImplementation(() => undefined);
    jest
      .spyOn(FormGenerator.prototype as any, 'generateSingleForm')
      .mockReturnValue({ destinationTab: 'Menu Responses', appUrl: 'https://example.com/app' });
    const invalidateSpy = jest.spyOn(WebFormService, 'invalidateServerCache').mockImplementation(() => undefined);

    generator.createAllForms();

    expect(invalidateSpy).toHaveBeenCalledWith('createAllForms');
  });
});
