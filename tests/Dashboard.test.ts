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

  test('getForms parses list view legend from dashboard config', () => {
    const configJson = JSON.stringify({
      listViewLegend: [
        { icon: 'warning', text: { en: 'Missing DATE' } },
        { text: 'Click Action to open the record.' }
      ]
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
    expect(forms[0].listViewLegend).toEqual([
      { icon: 'warning', text: { en: 'Missing DATE' } },
      { text: 'Click Action to open the record.' }
    ]);
  });

  test('getForms parses list view title from dashboard config (listView.title)', () => {
    const configJson = JSON.stringify({
      listView: { title: { EN: 'My Records' } }
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
    expect(forms[0].listViewTitle).toEqual({ en: 'My Records' });
  });

  test('getForms allows hiding the list view title via empty string (listView.title="")', () => {
    const configJson = JSON.stringify({
      listView: { title: '' }
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
    expect(forms[0].listViewTitle).toEqual('');
  });

  test('getForms parses list view view config from dashboard config (listView.view)', () => {
    const configJson = JSON.stringify({
      listView: { view: { mode: 'cards', toggleEnabled: true, defaultMode: 'cards' } }
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
    expect(forms[0].listViewView).toEqual({ mode: 'cards', toggleEnabled: true, defaultMode: 'cards' });
  });

  test('getForms parses list view column showIn config from dashboard config (listView.columns)', () => {
    const configJson = JSON.stringify({
      listView: {
        columns: [
          { fieldId: 'Q1', showIn: 'cards' },
          { type: 'rule', fieldId: 'action', label: { EN: 'Action' }, showIn: ['table'], cases: [{ text: 'Edit' }] }
        ]
      }
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
    const cols = forms[0].listViewColumns || [];
    expect((cols.find(c => (c as any).fieldId === 'Q1') as any)?.showIn).toEqual(['cards']);
    expect((cols.find(c => (c as any).fieldId === 'action') as any)?.showIn).toEqual(['table']);
  });

  test('getForms accepts showIn: "card" as an alias for cards (rule + field columns)', () => {
    const configJson = JSON.stringify({
      listView: {
        columns: [
          { fieldId: 'Q1', showIn: 'card' },
          { type: 'rule', fieldId: 'action', label: { EN: 'Action' }, showIn: 'card', cases: [{ text: 'Edit' }] }
        ]
      }
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
    const cols = forms[0].listViewColumns || [];
    expect((cols.find(c => (c as any).fieldId === 'Q1') as any)?.showIn).toEqual(['cards']);
    expect((cols.find(c => (c as any).fieldId === 'action') as any)?.showIn).toEqual(['cards']);
  });

  test('getForms parses list view advanced search config from dashboard config (listView.search)', () => {
    const configJson = JSON.stringify({
      listView: { search: { mode: 'advanced', fields: ['Q1', 'status'] } }
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
    expect(forms[0].listViewSearch).toEqual({ mode: 'advanced', fields: ['Q1', 'status'] });
  });

  test('getForms parses list view search placeholder from dashboard config (listView.search.placeholder)', () => {
    const configJson = JSON.stringify({
      listView: { search: { mode: 'text', placeholder: { EN: 'Find recipes…' } } }
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
    expect((forms[0].listViewSearch as any)?.placeholder).toEqual({ en: 'Find recipes…' });
  });

  test('getForms parses submission confirmation message from dashboard config', () => {
    const configJson = JSON.stringify({
      submissionConfirmationMessage: { EN: 'Submitted — thank you.' }
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
    expect(forms[0].submissionConfirmationMessage).toEqual({ en: 'Submitted — thank you.' });
  });

  test('getForms parses submission confirmation title from dashboard config', () => {
    const configJson = JSON.stringify({
      submissionConfirmationTitle: { EN: 'Confirm send' }
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
    expect(forms[0].submissionConfirmationTitle).toEqual({ en: 'Confirm send' });
  });

  test('getForms parses submission confirmation button labels from dashboard config', () => {
    const configJson = JSON.stringify({
      submissionConfirmationConfirmLabel: { EN: 'Yes, submit' },
      submissionConfirmationCancelLabel: { EN: 'Not yet' }
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
    expect(forms[0].submissionConfirmationConfirmLabel).toEqual({ en: 'Yes, submit' });
    expect(forms[0].submissionConfirmationCancelLabel).toEqual({ en: 'Not yet' });
  });

  test('getForms parses submit button label from dashboard config', () => {
    const configJson = JSON.stringify({
      submitButtonLabel: { EN: 'Send' }
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
    expect(forms[0].submitButtonLabel).toEqual({ en: 'Send' });
  });

  test('getForms parses autosave config from dashboard config', () => {
    const configJson = JSON.stringify({
      autoSave: { enabled: true, debounceMs: 1500, status: 'In progress' }
    });
    const mockData = [
      [],
      [],
      [
        'Form Title',
        'Configuration Sheet Name',
        'Destination Tab Name',
        'Description',
        'Web App URL (?form=ConfigSheetName)',
        'Follow-up Config (JSON)'
      ],
      ['Meal Form', 'Config: Meals', 'Meals Data', 'Desc', '', configJson]
    ];
    sheet.setMockData(mockData);
    const dashboard = new Dashboard(mockSS as any);
    const forms = dashboard.getForms();
    expect(forms[0].autoSave).toBeDefined();
    expect(forms[0].autoSave?.enabled).toBe(true);
    expect(forms[0].autoSave?.debounceMs).toBe(1500);
    expect(forms[0].autoSave?.status).toBe('In progress');
  });

  test('getForms parses language config from dashboard config', () => {
    const configJson = JSON.stringify({
      languages: ['EN', 'FR', 'NL'],
      defaultLanguage: 'FR',
      languageSelectorEnabled: false
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
    expect(forms[0].languages).toEqual(['EN', 'FR', 'NL']);
    expect(forms[0].defaultLanguage).toBe('FR');
    expect(forms[0].languageSelectorEnabled).toBe(false);
  });

  test('getForms removes disabled languages from dashboard config', () => {
    const configJson = JSON.stringify({
      languages: 'EN,FR,NL',
      disabledLanguages: ['FR']
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
    expect(forms[0].languages).toEqual(['EN', 'NL']);
  });

  test('getForms parses actionBars and createRecordPresetButtonsEnabled from dashboard config', () => {
    const configJson = JSON.stringify({
      createRecordPresetButtonsEnabled: false,
      actionBars: {
        system: { home: { hideWhenActive: true } },
        top: {
          sticky: true,
          list: {
            items: [
              'create',
              { type: 'custom', placements: ['topBarList'], display: 'inline', actions: ['createRecordPreset'] }
            ]
          }
        },
        bottom: {
          list: {
            items: ['home', { type: 'system', id: 'actions', placements: ['listBar'], menuBehavior: 'menu' }]
          }
        }
      }
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
    expect(forms[0].createRecordPresetButtonsEnabled).toBe(false);
    expect(forms[0].actionBars?.system?.home?.hideWhenActive).toBe(true);
    expect((forms[0].actionBars as any)?.top?.sticky).toBe(true);
    expect((forms[0].actionBars as any)?.top?.list?.items?.length).toBeGreaterThan(0);
  });

  test('getForms parses appHeader logo and normalizes Drive share URLs', () => {
    const driveId = '1AbcDEF_fakeDriveId_xyz';
    const configJson = JSON.stringify({
      appHeader: { logo: `https://drive.google.com/file/d/${driveId}/view?usp=sharing` }
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
    expect(forms[0].appHeader?.logoUrl).toBe(`https://drive.google.com/uc?export=view&id=${driveId}`);
  });

  test('getForms parses groupBehavior config from dashboard JSON', () => {
    const configJson = JSON.stringify({
      groupBehavior: {
        autoCollapseOnComplete: true,
        autoOpenNextIncomplete: true,
        autoScrollOnExpand: false
      }
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
    expect(forms[0].groupBehavior).toEqual({
      autoCollapseOnComplete: true,
      autoOpenNextIncomplete: true,
      autoScrollOnExpand: false
    });
  });
});
