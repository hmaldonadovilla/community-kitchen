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
      emailFrom: 'kitchen@example.com',
      emailFromName: 'Community Kitchen',
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
    expect(forms[0].followupConfig?.emailFrom).toBe('kitchen@example.com');
    expect(forms[0].followupConfig?.emailFromName).toBe('Community Kitchen');
    expect(forms[0].followupConfig?.emailRecipients).toContain('team@example.com');
    expect(forms[0].followupConfig?.statusTransitions?.onPdf).toBe('PDF ready');
  });

  test('getForms parses follow-up submitEffects for cross-form record creation', () => {
    const followupConfig = JSON.stringify({
      submitEffects: [
        {
          type: 'createRecord',
          targetFormKey: 'Config: Leftover Inventory',
          runOn: 'create',
          status: 'Available',
          forEachLineItem: {
            groupId: 'MEALS',
            subGroupPath: ['LEFTOVERS'],
            when: {
              fieldId: 'LEFTOVER_KIND',
              equals: 'partialDish'
            }
          },
          values: {
            SOURCE_ID: '{{source.id}}',
            SOURCE_NAME: '{{source.MEAL_NAME}}',
            LEFTOVER_NAME: '{{row.LEFTOVER_NAME}}'
          }
        }
      ]
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
    expect(forms[0].followupConfig?.submitEffects).toEqual([
        {
          type: 'createRecord',
          targetFormKey: 'Config: Leftover Inventory',
          runOn: 'create',
          status: 'Available',
          forEachLineItem: {
            groupId: 'MEALS',
            subGroupPath: ['LEFTOVERS'],
            when: {
              fieldId: 'LEFTOVER_KIND',
              equals: 'partialDish'
            }
          },
          values: {
            SOURCE_ID: '{{source.id}}',
            SOURCE_NAME: '{{source.MEAL_NAME}}',
            LEFTOVER_NAME: '{{row.LEFTOVER_NAME}}'
          }
        }
      ]);
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

  test('getForms parses field disable rules with bypass fields from dashboard config', () => {
    const configJson = JSON.stringify({
      fieldDisableRules: [
        {
          id: 'future-date-lock',
          when: { fieldId: 'DATE', isInFuture: true },
          bypassFields: ['COOK']
        }
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
    expect(forms[0].fieldDisableRules).toEqual([
      {
        id: 'future-date-lock',
        when: { fieldId: 'DATE', isInFuture: true },
        bypassFields: ['COOK']
      }
    ]);
  });

  test('getForms parses list view legend from dashboard config', () => {
    const configJson = JSON.stringify({
      listViewLegend: [
        { icon: 'warning', text: { en: 'Missing DATE' }, pill: { text: { en: 'Draft' }, tone: 'muted' } },
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
      { icon: 'warning', text: { en: 'Missing DATE' }, pill: { text: { en: 'Draft' }, tone: 'muted' } },
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

  test('getForms parses list view hideHeaderRow, rowClickEnabled and legendColumns from dashboard config (listView)', () => {
    const configJson = JSON.stringify({
      listView: { hideHeaderRow: true, rowClickEnabled: false, legendColumns: 2, legendColumnWidths: [25, 75] }
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
    expect((forms[0] as any).listViewHideHeaderRow).toBe(true);
    expect((forms[0] as any).listViewRowClickEnabled).toBe(false);
    expect((forms[0] as any).listViewLegendColumns).toBe(2);
    expect((forms[0] as any).listViewLegendColumnWidths).toEqual([25, 75]);
  });

  test('getForms parses list view defaultWhen, dateHeading, search initial value, and layout', () => {
    const configJson = JSON.stringify({
      listView: {
        defaultWhen: { fieldId: 'MP_PREP_DATE', isToday: true },
        dateHeading: { fieldId: 'MP_PREP_DATE', suffix: { EN: 'activities' } },
        search: {
          mode: 'date',
          dateFieldId: 'MP_PREP_DATE',
          helperText: { EN: 'Pick a date.' },
          initialValue: { relativeDate: 'today' }
        },
        layout: {
          sections: ['metric', 'search', 'dateHeading', 'results', 'presets'],
          metricAlign: 'center'
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
    expect((forms[0] as any).listViewDefaultWhen).toEqual({ fieldId: 'MP_PREP_DATE', isToday: true });
    expect((forms[0] as any).listViewDateHeading).toEqual({ fieldId: 'MP_PREP_DATE', suffix: { en: 'activities' } });
    expect((forms[0] as any).listViewSearch).toEqual({
      mode: 'date',
      dateFieldId: 'MP_PREP_DATE',
      helperText: { en: 'Pick a date.' },
      initialValue: { relativeDate: 'today' }
    });
    expect((forms[0] as any).listViewLayout).toEqual({
      sections: ['metric', 'search', 'dateHeading', 'results', 'presets'],
      metricAlign: 'center'
    });
  });

  test('getForms parses list view metric config from dashboard config (listView.metric)', () => {
    const configJson = JSON.stringify({
      listView: {
        metric: {
          label: { EN: 'portions delivered' },
          groupId: 'MP_MEALS_REQUEST',
          fieldId: 'FINAL_QTY',
          when: { fieldId: 'status', equals: 'Closed' },
          maximumFractionDigits: 0
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
    expect((forms[0] as any).listViewMetric).toEqual({
      label: { en: 'portions delivered' },
      groupId: 'MP_MEALS_REQUEST',
      fieldId: 'FINAL_QTY',
      when: { fieldId: 'status', equals: 'Closed' },
      maximumFractionDigits: 0
    });
  });

  test('getForms parses legacy listViewMetric alias from dashboard config', () => {
    const configJson = JSON.stringify({
      listViewMetric: {
        text: 'portions delivered',
        lineItemGroupId: 'MP_MEALS_REQUEST',
        lineItemFieldId: 'FINAL_QTY',
        where: { field: 'status', equals: 'Closed' },
        decimals: 1
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
    expect((forms[0] as any).listViewMetric).toEqual({
      label: 'portions delivered',
      groupId: 'MP_MEALS_REQUEST',
      fieldId: 'FINAL_QTY',
      when: { fieldId: 'status', equals: 'Closed' },
      maximumFractionDigits: 1
    });
  });

  test('getForms parses analytics widgets from dashboard config', () => {
    const configJson = JSON.stringify({
      analytics: {
        widgets: [
          {
            id: 'portions_delivered',
            label: { EN: 'Portions delivered' },
            placements: ['listView', 'analyticsPage'],
            maximumFractionDigits: 0,
            calculation: {
              type: 'aggregate',
              aggregate: 'sum',
              groupId: 'MP_MEALS_REQUEST',
              fieldId: 'FINAL_QTY',
              when: { fieldId: 'status', equals: 'Closed' }
            }
          },
          {
            id: 'x2',
            calculation: {
              type: 'arithmetic',
              operator: 'multiply',
              operands: [{ metricId: 'portions_delivered' }, 2]
            }
          }
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
    expect((forms[0] as any).analytics).toEqual({
      widgets: [
        {
          id: 'portions_delivered',
          label: { en: 'Portions delivered' },
          placements: ['listView', 'analyticsPage'],
          maximumFractionDigits: 0,
          calculation: {
            type: 'aggregate',
            aggregate: 'sum',
            groupId: 'MP_MEALS_REQUEST',
            fieldId: 'FINAL_QTY',
            when: { fieldId: 'status', equals: 'Closed' }
          }
        },
        {
          id: 'x2',
          placements: ['analyticsPage'],
          calculation: {
            type: 'arithmetic',
            operator: 'multiply',
            operands: [{ metricId: 'portions_delivered' }, 2]
          }
        }
      ]
    });
  });

  test('getForms enforces analytics script function naming contract', () => {
    const configJson = JSON.stringify({
      analyticsWidgets: [
        {
          id: 'valid_script',
          calculation: { type: 'script', functionName: 'analytics_validScript' }
        },
        {
          id: 'invalid_script',
          calculation: { type: 'script', functionName: 'customScript' }
        }
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
    const widgets = ((forms[0] as any).analytics?.widgets || []) as any[];
    expect(widgets.map(w => w.id)).toEqual(['valid_script']);
    expect(widgets[0].calculation).toEqual({ type: 'script', functionName: 'analytics_validScript' });
  });

  test('getForms parses list view inline rule actions from dashboard config (listView.columns)', () => {
    const configJson = JSON.stringify({
      listView: {
        columns: [
          {
            type: 'rule',
            fieldId: 'action',
            label: { EN: 'Action' },
            cases: [
              {
                text: { EN: 'Actions' },
                hideText: true,
                actions: [
                  { text: { EN: 'View' }, hideText: true, icon: 'view', openView: 'summary' },
                  { text: { EN: 'Copy' }, hideText: true, icon: 'copy', openView: 'copy' }
                ]
              }
            ]
          }
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
    const action = cols.find(c => (c as any).fieldId === 'action') as any;
    expect(action?.cases?.[0]?.hideText).toBe(true);
    expect(action?.cases?.[0]?.actions?.length).toBe(2);
    expect(action?.cases?.[0]?.actions?.[0]?.icon).toBe('view');
    expect(action?.cases?.[0]?.actions?.[1]?.icon).toBe('copy');
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

  test('getForms preserves steps.include.lineGroup.validationRows from dashboard config', () => {
    const configJson = JSON.stringify({
      steps: {
        mode: 'guided',
        items: [
          {
            id: 'orderForm',
            include: [
              {
                kind: 'lineGroup',
                id: 'MP_MEALS_REQUEST',
                presentation: 'liftedRowFields',
                fields: ['MEAL_TYPE', 'QTY'],
                validationRows: { includeWhen: { fieldId: 'QTY', greaterThan: 0 } }
              }
            ]
          }
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
    expect(forms.length).toBe(1);
    expect(forms[0].steps).toBeDefined();
    expect((forms[0].steps as any)?.mode).toBe('guided');
    const step = (forms[0].steps as any)?.items?.[0];
    expect(step?.id).toBe('orderForm');
    const target = step?.include?.[0];
    expect(target?.kind).toBe('lineGroup');
    expect(target?.validationRows).toEqual({ includeWhen: { fieldId: 'QTY', greaterThan: 0 } });
  });

  test('getForms preserves steps.include.lineGroup.collapsedFieldsInHeader from dashboard config', () => {
    const configJson = JSON.stringify({
      steps: {
        mode: 'guided',
        items: [
          {
            id: 'orderForm',
            include: [
              {
                kind: 'lineGroup',
                id: 'MP_MEALS_REQUEST',
                presentation: 'liftedRowFields',
                fields: ['MEAL_TYPE', 'QTY'],
                collapsedFieldsInHeader: true
              }
            ]
          }
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
    expect(forms.length).toBe(1);
    const step = (forms[0].steps as any)?.items?.[0];
    const target = step?.include?.[0];
    expect(target?.kind).toBe('lineGroup');
    expect(target?.collapsedFieldsInHeader).toBe(true);
  });

  test('getForms preserves steps.include.lineGroup.groupOverride from dashboard config', () => {
    const configJson = JSON.stringify({
      steps: {
        mode: 'guided',
        items: [
          {
            id: 'deliveryForm',
            include: [
              {
                kind: 'lineGroup',
                id: 'MP_MEALS_REQUEST',
                groupOverride: {
                  ui: {
                    rowHeaderSummaryTemplate: '{MEAL_TYPE} | {ORD_QTY}'
                  },
                  totals: [{ type: 'sum', fieldId: 'ORD_QTY' }]
                }
              }
            ]
          }
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
    expect(forms.length).toBe(1);
    const step = (forms[0].steps as any)?.items?.[0];
    const target = step?.include?.[0];
    expect(target?.kind).toBe('lineGroup');
    expect(target?.groupOverride).toEqual({
      ui: { rowHeaderSummaryTemplate: '{MEAL_TYPE} | {ORD_QTY}' },
      totals: [{ type: 'sum', fieldId: 'ORD_QTY' }]
    });
  });

  test('getForms preserves guided steps lineGroup/subGroup field entries with renderAsLabel', () => {
    const configJson = JSON.stringify({
      steps: {
        mode: 'guided',
        items: [
          {
            id: 'orderForm',
            include: [
              {
                kind: 'lineGroup',
                id: 'MP_MEALS_REQUEST',
                presentation: 'liftedRowFields',
                fields: [{ id: 'MEAL_TYPE', renderAsLabel: true }, 'QTY'],
                subGroups: { include: [{ id: 'MP_INGREDIENTS_LI', fields: [{ id: 'ING', renderAsLabel: true }, 'UNIT'] }] }
              }
            ]
          }
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
    expect(forms.length).toBe(1);
    const step = (forms[0].steps as any)?.items?.[0];
    const target = step?.include?.[0];
    expect(target?.kind).toBe('lineGroup');
    expect(target?.fields).toEqual([{ id: 'MEAL_TYPE', renderAsLabel: true }, 'QTY']);
    expect(target?.subGroups?.include?.[0]?.id).toBe('MP_INGREDIENTS_LI');
    expect(target?.subGroups?.include?.[0]?.fields).toEqual([{ id: 'ING', renderAsLabel: true }, 'UNIT']);
  });

  test('getForms parses guided step milestone action config', () => {
    const configJson = JSON.stringify({
      steps: {
        mode: 'guided',
        items: [
          {
            id: 'portioning',
            include: ['Q1'],
            navigation: {
              submitLabel: { EN: 'Finish portioning' },
              milestoneAction: {
                type: 'followupBatch',
                preActions: ['RECONCILE_RESERVATIONS'],
                backgroundActions: ['CREATE_PDF', 'SEND_EMAIL'],
                ensureRecordId: true,
                runInBackground: true,
                validationScope: 'throughCurrentStep',
                waitForQueue: 'uploadsOnly',
                advanceAfterStart: true,
                confirmationDialog: {
                  title: { EN: 'Please confirm' },
                  message: { EN: 'Confirm milestone.' },
                  confirmLabel: { EN: 'Continue' },
                  cancelLabel: { EN: 'Cancel' }
                },
                feedbackDialog: {
                  title: { EN: 'Background actions started' },
                  message: { EN: 'You can continue.' },
                  confirmLabel: { EN: 'OK' },
                  showCancel: false,
                  showCloseButton: true,
                  dismissOnBackdrop: true
                }
              }
            }
          }
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
    const step = (forms[0].steps as any)?.items?.[0];
    expect(step?.navigation?.submitLabel).toEqual({ en: 'Finish portioning' });
    expect(step?.navigation?.milestoneAction).toEqual({
      type: 'followupBatch',
      preActions: ['RECONCILE_RESERVATIONS'],
      backgroundActions: ['CREATE_PDF', 'SEND_EMAIL'],
      ensureRecordId: true,
      runInBackground: true,
      validationScope: 'throughCurrentStep',
      waitForQueue: 'uploadsOnly',
      advanceAfterStart: true,
      confirmationDialog: {
        title: { en: 'Please confirm' },
        message: { en: 'Confirm milestone.' },
        confirmLabel: { en: 'Continue' },
        cancelLabel: { en: 'Cancel' }
      },
      feedbackDialog: {
        title: { en: 'Background actions started' },
        message: { en: 'You can continue.' },
        confirmLabel: { en: 'OK' },
        showCancel: false,
        showCloseButton: true,
        dismissOnBackdrop: true
      }
    });
  });

  test('getForms parses guided step includeWhen and excludeWhen', () => {
    const configJson = JSON.stringify({
      steps: {
        mode: 'guided',
        items: [
          {
            id: 'leftoverBank',
            includeWhen: { fieldId: '__ckDataSourceCount.Leftover Inventory Data', greaterThan: 0 },
            excludeWhen: { fieldId: 'status', equals: ['Emailed', 'Closed'] },
            include: ['Q1']
          }
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
    const step = (forms[0].steps as any)?.items?.[0];
    expect(step?.includeWhen).toEqual({ fieldId: '__ckDataSourceCount.Leftover Inventory Data', greaterThan: 0 });
    expect(step?.excludeWhen).toEqual({ fieldId: 'status', equals: ['Emailed', 'Closed'] });
  });

  test('getForms parses guided step upload wait dialog defaults and overrides', () => {
    const configJson = JSON.stringify({
      steps: {
        mode: 'guided',
        waitForUploadsDialog: {
          title: { EN: 'Please wait' },
          message: { EN: 'Please wait while your photos finish uploading.' },
          showCancel: false
        },
        items: [
          {
            id: 'production',
            include: ['Q1'],
            navigation: {
              forwardGate: 'whenValid',
              waitForUploadsDialog: {
                title: { EN: 'Hold on' },
                message: { EN: 'Your photos are still uploading.' },
                showCancel: false
              }
            }
          }
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
    const steps = forms[0].steps as any;
    const step = steps?.items?.[0];
    expect(steps?.waitForUploadsDialog).toEqual({
      title: { en: 'Please wait' },
      message: { en: 'Please wait while your photos finish uploading.' },
      showCancel: false
    });
    expect(step?.navigation?.waitForUploadsDialog).toEqual({
      title: { en: 'Hold on' },
      message: { en: 'Your photos are still uploading.' },
      showCancel: false
    });
  });

  test('getForms parses submit-time background follow-up config', () => {
    const configJson = JSON.stringify({
      submission: {
        afterSubmit: {
          preActions: ['CLOSE_RECORD'],
          backgroundActions: ['CREATE_PDF', 'SEND_EMAIL'],
          waitForQueue: 'uploadsOnly',
          navigateTo: 'summary',
          feedbackDialog: {
            title: { EN: 'Background actions started' },
            message: { EN: 'Background processing is running.' },
            confirmLabel: { EN: 'OK' },
            showCancel: false,
            showCloseButton: false,
            dismissOnBackdrop: false
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
    expect(forms[0].submissionAfterSubmit).toEqual({
      preActions: ['CLOSE_RECORD'],
      backgroundActions: ['CREATE_PDF', 'SEND_EMAIL'],
      waitForQueue: 'uploadsOnly',
      navigateTo: 'summary',
      feedbackDialog: {
        title: { en: 'Background actions started' },
        message: { en: 'Background processing is running.' },
        confirmLabel: { en: 'OK' },
        showCancel: false,
        showCloseButton: false,
        dismissOnBackdrop: false
      }
    });
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

  test('getForms parses dedup dialog config from dashboard config', () => {
    const configJson = JSON.stringify({
      dedupDialog: {
        title: { EN: 'No duplicates allowed' },
        intro: { EN: 'Record already exists for:' },
        outro: { EN: 'What would you like to do?' },
        changeLabel: { EN: 'Change details' },
        cancelLabel: { EN: 'Cancel' },
        openLabel: { EN: 'Open existing' }
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
    expect(forms[0].dedupDialog).toEqual({
      title: { en: 'No duplicates allowed' },
      intro: { en: 'Record already exists for:' },
      outro: { en: 'What would you like to do?' },
      changeLabel: { en: 'Change details' },
      cancelLabel: { en: 'Cancel' },
      openLabel: { en: 'Open existing' }
    });
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

  test('getForms parses submitEffects updateRecord from dashboard config', () => {
    const configJson = JSON.stringify({
      submitEffects: [
        {
          type: 'updateRecord',
          targetFormKey: 'Config: Leftover Inventory',
          runOn: 'update',
          recordId: '{{row.LEFTOVER_RECORD_ID}}',
          forEachLineItem: {
            groupId: 'MP_MEALS_REQUEST',
            subGroupPath: ['MP_TYPE_LI']
          },
          status: 'used',
          values: {
            LEFTOVER_USED_BY_RECORD_ID: '{{source.id}}'
          }
        }
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
    expect(forms[0].followupConfig?.submitEffects).toEqual([
      {
        type: 'updateRecord',
        targetFormKey: 'Config: Leftover Inventory',
        runOn: 'update',
        recordId: '{{row.LEFTOVER_RECORD_ID}}',
        forEachLineItem: {
          groupId: 'MP_MEALS_REQUEST',
          subGroupPath: ['MP_TYPE_LI']
        },
        status: 'used',
        values: {
          LEFTOVER_USED_BY_RECORD_ID: '{{source.id}}'
        }
      }
    ]);
  });

  test('getForms parses lifecycle rules from dashboard config', () => {
    const configJson = JSON.stringify({
      lifecycle: {
        rules: [
          {
            id: 'expire-leftovers',
            type: 'dateStatusTransition',
            dateFieldId: 'LEFTOVER_EXP_DATE',
            statusFieldId: 'LEFTOVER_STATUS',
            fromStatuses: ['available'],
            toStatus: 'expired',
            compare: 'beforeToday'
          }
        ]
      }
    });
    const mockData = [
      [],
      [],
      ['Form Title', 'Configuration Sheet Name', 'Destination Tab Name', 'Description', 'Web App URL (?form=ConfigSheetName)', 'Follow-up Config (JSON)'],
      ['Leftover Inventory', 'Config: Leftover Inventory', 'Leftover Inventory Data', 'Desc', '', configJson]
    ];
    sheet.setMockData(mockData);
    const dashboard = new Dashboard(mockSS as any);
    const forms = dashboard.getForms();
    expect(forms[0].lifecycle).toEqual({
      rules: [
        {
          id: 'expire-leftovers',
          type: 'dateStatusTransition',
          dateFieldId: 'LEFTOVER_EXP_DATE',
          statusFieldId: 'LEFTOVER_STATUS',
          fromStatuses: ['available'],
          toStatus: 'expired',
          compare: 'beforeToday'
        }
      ]
    });
  });

  test('getForms parses submitValidation.hideSubmitTopErrorMessage from dashboard config', () => {
    const configJson = JSON.stringify({
      submitValidation: {
        enforceFieldOrder: true,
        hideSubmitTopErrorMessage: true,
        submitTopErrorMessage: { EN: 'Fix required fields' },
        orderedEntryFieldErrorMessage: { EN: 'Enter 0 or more for {field}.' }
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
    expect(forms[0].submitValidation).toEqual({
      enforceFieldOrder: true,
      hideSubmitTopErrorMessage: true,
      submitTopErrorMessage: { en: 'Fix required fields' },
      orderedEntryFieldErrorMessage: { en: 'Enter 0 or more for {field}.' }
    });
  });

  test('getForms parses autosave config from dashboard config', () => {
    const configJson = JSON.stringify({
      autoSave: {
        enabled: true,
        debounceMs: 1500,
        status: 'In progress',
        enableWhenFields: ['CREATED_BY'],
        dedupTriggerFields: ['INGREDIENT_NAME'],
        dedupCheckDialog: {
          checkingTitle: { EN: 'Checking ingredient name' },
          checkingMessage: { EN: 'Please wait...' },
          availableTitle: { EN: 'Ingredient name available' },
          availableMessage: { EN: 'Continue.' },
          duplicateTitle: { EN: 'Ingredient already exists' },
          duplicateMessage: { EN: 'Pick a different name.' },
          availableAutoCloseMs: 1300,
          duplicateAutoCloseMs: 900
        }
      }
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
    expect(forms[0].autoSave?.enableWhenFields).toEqual(['CREATED_BY']);
    expect(forms[0].autoSave?.dedupTriggerFields).toEqual(['INGREDIENT_NAME']);
    expect(forms[0].autoSave?.dedupCheckDialog).toEqual({
      checkingTitle: { en: 'Checking ingredient name' },
      checkingMessage: { en: 'Please wait...' },
      availableTitle: { en: 'Ingredient name available' },
      availableMessage: { en: 'Continue.' },
      duplicateTitle: { en: 'Ingredient already exists' },
      duplicateMessage: { en: 'Pick a different name.' },
      availableAutoCloseMs: 1300,
      duplicateAutoCloseMs: 900
    });
  });

  test('getForms parses dedup delete-on-key-change setting from dashboard config aliases', () => {
    const configJson = JSON.stringify({
      recreateOnDedupKeyChange: true
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
    expect(forms[0].dedupDeleteOnKeyChange).toBe(true);
  });

  test('getForms parses audit logging config from dashboard config', () => {
    const configJson = JSON.stringify({
      auditLogging: {
        enabled: true,
        statuses: ['Ready for production'],
        snapshotButtons: ['READY_PROD'],
        sheetName: 'Meal Production Audit'
      }
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
    expect(forms[0].auditLogging).toEqual({
      enabled: true,
      statuses: ['Ready for production'],
      snapshotButtons: ['READY_PROD'],
      sheetName: 'Meal Production Audit'
    });
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
        system: {
          home: {
            hideWhenActive: true,
            dedupIncompleteDialog: {
              enabled: true,
              message: { EN: 'Dedup incomplete.' },
              confirmLabel: { EN: 'Continue and delete the record' },
              cancelLabel: { EN: 'Cancel and continue editing' },
              showCancel: true,
              showCloseButton: false,
              dismissOnBackdrop: false,
              deleteRecordOnConfirm: true
            }
          }
        },
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
    expect((forms[0].actionBars as any)?.system?.home?.dedupIncompleteDialog).toEqual({
      enabled: true,
      message: { en: 'Dedup incomplete.' },
      confirmLabel: { en: 'Continue and delete the record' },
      cancelLabel: { en: 'Cancel and continue editing' },
      showCancel: true,
      showCloseButton: false,
      dismissOnBackdrop: false,
      deleteRecordOnConfirm: true
    });
    expect((forms[0].actionBars as any)?.top?.sticky).toBe(true);
    expect((forms[0].actionBars as any)?.top?.list?.items?.length).toBeGreaterThan(0);
  });

  test('getForms parses actionBars home incompleteFieldsDialog with normalized field ids', () => {
    const configJson = JSON.stringify({
      actionBars: {
        system: {
          home: {
            incompleteFieldsDialog: {
              enabled: true,
              fields: [' INGREDIENT_NAME ', 'CREATED_BY', 'ingredient_name'],
              trigger: 'fields'
            }
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
    expect((forms[0].actionBars as any)?.system?.home?.dedupIncompleteDialog).toEqual({
      enabled: true,
      criteria: 'fieldIds',
      fieldIds: ['INGREDIENT_NAME', 'CREATED_BY']
    });
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
