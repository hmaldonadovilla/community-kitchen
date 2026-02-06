import './mocks/GoogleAppsScript';
import { WebFormService } from '../src/services/WebFormService';
import { MockSpreadsheet } from './mocks/GoogleAppsScript';

describe('WebFormService', () => {
  let ss: MockSpreadsheet;
  let service: WebFormService;

  beforeEach(() => {
    ss = new MockSpreadsheet();
    service = new WebFormService(ss as any);

    const dashboardSheet = ss.getSheetByName('Forms Dashboard');
    if (!dashboardSheet) throw new Error('Dashboard not created');

    const followupJson = JSON.stringify({
      pdfTemplateId: { EN: 'pdf-template-en', FR: 'pdf-template-fr' },
      emailTemplateId: { EN: 'email-template-en', FR: 'email-template-fr' },
      emailFrom: 'kitchen@example.com',
      emailFromName: 'Community Kitchen',
      emailRecipients: [
        'ops@example.com',
        {
          type: 'dataSource',
          recordFieldId: 'Q4',
          lookupField: 'Distributor',
          valueField: 'email',
          dataSource: { id: 'Distributor Data', projection: ['Distributor', 'email'] }
        }
      ],
      emailCc: ['chef@example.com'],
      emailBcc: [
        {
          type: 'dataSource',
          recordFieldId: 'Q4',
          lookupField: 'Distributor',
          valueField: 'bcc',
          dataSource: { id: 'Distributor Data', projection: ['Distributor', 'bcc'] }
        }
      ],
      statusTransitions: { onEmail: 'Emailed' },
      listViewMetaColumns: ['createdAt', 'status']
    });
    const dashboardData = [
      [],
      [],
      ['Form Title', 'Configuration Sheet Name', 'Destination Tab Name', 'Description', 'Form ID', 'Edit URL', 'Published URL', 'Follow-up Config (JSON)'],
      ['Delivery Form', 'Config: Delivery', 'Deliveries', 'Desc', '', '', '', followupJson]
    ];
    (dashboardSheet as any).setMockData(dashboardData);

    const configSheet = ss.insertSheet('Config: Delivery');
    const configRows = [
      ['ID', 'Type', 'Q En', 'Q Fr', 'Q Nl', 'Req', 'Opt En', 'Opt Fr', 'Opt Nl', 'Status', 'Config', 'OptionFilter', 'Validation', 'List View?', 'Edit'],
      ['Q1', 'TEXT', 'Name', 'Nom', 'Naam', true, '', '', '', 'Active', '', '', '', '', ''],
      ['Q2', 'LINE_ITEM_GROUP', 'Items', 'Articles', 'Artikelen', true, '', '', '', 'Active', 'REF:LineItems_Q2', '', '', '', ''],
      ['Q3', 'FILE_UPLOAD', 'Receipt', 'Reçu', 'Bon', false, '', '', '', 'Active', '{"maxFiles":1,"allowedExtensions":["png"]}', '', '', '', ''],
      ['Q4', 'TEXT', 'Distributor', 'Distrib', 'Distributeur', true, '', '', '', 'Active', '{"listViewSort":{"direction":"desc","priority":1}}', '', '', 'TRUE', ''],
      ['Q5', 'TEXT', 'Meal Number', 'Numéro de repas', 'Maaltijdnummer', false, '', '', '', 'Active', '{"autoIncrement":{"prefix":"MP-AA","padLength":6}}', '', '', '', ''],
      ['Q6', 'TEXT', 'Archived Note', 'Note archive', 'Archiefnotitie', false, '', '', '', 'Archived', '', '', '', '', '']
    ];
    (configSheet as any).setMockData(configRows);

    const lineSheet = ss.insertSheet('LineItems_Q2');
    const lineRows = [
      ['ID', 'Type', 'Label EN', 'Label FR', 'Label NL', 'Req', 'Opt EN', 'Opt FR', 'Opt NL'],
      ['LI1', 'TEXT', 'Item', 'Article', 'Artikel', true, '', '', ''],
      ['LI2', 'NUMBER', 'Qty', 'Qté', 'Aantal', true, '', '', '']
    ];
    (lineSheet as any).setMockData(lineRows);

    const distributorSheet = ss.insertSheet('Distributor Data');
    const distributorRows = [
      ['Distributor', 'email', 'bcc'],
      ['ACME', 'acme@example.com', 'audit@example.com'],
      ['Beta', 'beta@example.com', '']
    ];
    (distributorSheet as any).setMockData(distributorRows);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    (global as any).GmailApp.sendEmail.mockClear();
  });

  test('buildDefinition exposes line items and upload config', () => {
    const def = service.buildDefinition('Config: Delivery');
    expect(def.title).toBe('Delivery Form');
    const line = def.questions.find(q => q.id === 'Q2');
    expect(line?.lineItemConfig?.fields.length).toBe(2);
    const upload = def.questions.find(q => q.id === 'Q3');
    expect(upload?.uploadConfig?.maxFiles).toBe(1);
  });

  test('fetchBootstrapContext returns env tag from script properties', () => {
    const previous = (global as any).PropertiesService;
    const props = {
      getProperty: jest.fn((key: string) => (key === 'CK_UI_ENV_TAG' ? 'Staging' : null))
    };
    (global as any).PropertiesService = {
      getScriptProperties: () => props
    };

    try {
      const res = service.fetchBootstrapContext('Config: Delivery');
      expect(res.envTag).toBe('Staging');
    } finally {
      (global as any).PropertiesService = previous;
    }
  });

  test('submitWebForm appends rows with line item JSON and file url', () => {
    const result = service.submitWebForm({
      formKey: 'Config: Delivery',
      language: 'EN',
      Q1: 'Alice',
      Q2_json: JSON.stringify([{ LI1: 'Apples', LI2: 2 }]),
      Q3: [{
        getBytes: () => new Uint8Array([1, 2]),
        getName: () => 'photo.png'
      }]
    });

    expect(result.success).toBe(true);
    const sheet = ss.getSheetByName('Deliveries');
    expect(sheet).toBeDefined();

    const values = sheet!.getRange(1, 1, sheet!.getLastRow(), sheet!.getLastColumn()).getValues();
    expect(values[0][0]).toBe('Language');
    expect(values[1][0]).toBe('EN');
    expect(values[1][1]).toBe('Alice');
    expect(values[1][2]).toContain('Apples');
    expect(values[1][3]).toContain('http://file-url');
  });

  test('buildDefinition exposes list view configuration with default sort', () => {
    const def = service.buildDefinition('Config: Delivery');
    expect(def.listView).toBeDefined();
    expect(def.listView?.columns.map(col => col.fieldId)).toContain('Q4');
    expect(def.listView?.defaultSort).toEqual({ fieldId: 'Q4', direction: 'desc' });
    const metaCols = (def.listView?.columns || [])
      .filter((col): col is { fieldId: string; kind: 'meta' } => (col as any).kind === 'meta')
      .map(col => col.fieldId);
    expect(metaCols).toEqual(['createdAt', 'status']);
  });

  test('listViewMetaColumns: [] disables meta columns (no Updated column)', () => {
    const dashboardSheet = ss.getSheetByName('Forms Dashboard');
    if (!dashboardSheet) throw new Error('Dashboard not created');

    const followupJson = JSON.stringify({
      listViewMetaColumns: []
    });
    const dashboardData = [
      [],
      [],
      ['Form Title', 'Configuration Sheet Name', 'Destination Tab Name', 'Description', 'Form ID', 'Edit URL', 'Published URL', 'Follow-up Config (JSON)'],
      ['Delivery Form', 'Config: Delivery', 'Deliveries', 'Desc', '', '', '', followupJson]
    ];
    (dashboardSheet as any).setMockData(dashboardData);

    const def = service.buildDefinition('Config: Delivery');
    const metaCols = (def.listView?.columns || [])
      .filter((col): col is { fieldId: string; kind: 'meta' } => (col as any).kind === 'meta')
      .map(col => col.fieldId);
    expect(metaCols).toEqual([]);
  });

  test('triggerFollowupAction sends emails using data source recipients', () => {
    const followups = (service as any).followups || (service as any);
    jest.spyOn(followups, 'generatePdfArtifact' as any).mockReturnValue({
      success: true,
      url: 'http://pdf',
      fileId: 'file-1',
      blob: null
    });

    service.saveSubmissionWithId({
      formKey: 'Config: Delivery',
      language: 'EN',
      id: 'REC-1',
      Q1: 'Alice',
      Q2_json: JSON.stringify([]),
      Q3: [],
      Q4: 'ACME'
    } as any);

    const result = service.triggerFollowupAction('Config: Delivery', 'REC-1', 'SEND_EMAIL');
    expect(result.success).toBe(true);
    const call = (global as any).GmailApp.sendEmail.mock.calls[0];
    const recipientArg = call[0];
    const optionsArg = call[3] || {};
    expect(recipientArg).toContain('acme@example.com');
    expect(optionsArg.cc).toBe('chef@example.com');
    expect(optionsArg.bcc).toBe('audit@example.com');
    expect(optionsArg.from).toBe('kitchen@example.com');
    expect(optionsArg.name).toBe('Community Kitchen');
  });

  test('emailTemplateId supports conditional cases based on record field values', () => {
    const dashboardSheet = ss.getSheetByName('Forms Dashboard');
    if (!dashboardSheet) throw new Error('Dashboard not created');

    const followupJson = JSON.stringify({
      pdfTemplateId: { EN: 'pdf-template-en' },
      emailTemplateId: {
        cases: [
          { when: { fieldId: 'Q4', equals: 'ACME' }, templateId: 'email-template-acme' },
          { when: { fieldId: 'Q4', equals: 'Beta' }, templateId: 'email-template-beta' }
        ],
        default: 'email-template-default'
      },
      emailRecipients: ['ops@example.com']
    });
    const dashboardData = [
      [],
      [],
      ['Form Title', 'Configuration Sheet Name', 'Destination Tab Name', 'Description', 'Form ID', 'Edit URL', 'Published URL', 'Follow-up Config (JSON)'],
      ['Delivery Form', 'Config: Delivery', 'Deliveries', 'Desc', '', '', '', followupJson]
    ];
    (dashboardSheet as any).setMockData(dashboardData);

    const followups = (service as any).followups || (service as any);
    jest.spyOn(followups, 'generatePdfArtifact' as any).mockReturnValue({
      success: true,
      url: 'http://pdf',
      fileId: 'file-1',
      blob: null
    });

    (global as any).DocumentApp.openById.mockClear();

    service.saveSubmissionWithId({
      formKey: 'Config: Delivery',
      language: 'EN',
      id: 'REC-1',
      Q1: 'Alice',
      Q2_json: JSON.stringify([]),
      Q3: [],
      Q4: 'ACME'
    } as any);

    const result = service.triggerFollowupAction('Config: Delivery', 'REC-1', 'SEND_EMAIL');
    expect(result.success).toBe(true);
    expect((global as any).DocumentApp.openById).toHaveBeenCalledWith('email-template-acme');
  });

  test('fetchFormConfig returns full config export with archived questions', () => {
    const exported = service.fetchFormConfig('Config: Delivery');
    expect(exported.form.title).toBe('Delivery Form');
    expect(exported.formKey).toBe('Config: Delivery');
    expect(Array.isArray(exported.questions)).toBe(true);
    expect(exported.questions.some(q => q.id === 'Q6' && q.status === 'Archived')).toBe(true);
    expect(exported.definition.questions.some(q => q.id === 'Q6')).toBe(false);
    expect(Array.isArray(exported.dedupRules)).toBe(true);
    expect(Array.isArray(exported.validationErrors)).toBe(true);
    expect(typeof exported.generatedAt).toBe('string');
  });

  test('auto increment text fields populate sequential values', () => {
    service.submitWebForm({
      formKey: 'Config: Delivery',
      language: 'EN',
      Q1: 'Alice',
      Q2_json: JSON.stringify([]),
      Q3: [],
      Q4: 'ACME'
    });
    service.submitWebForm({
      formKey: 'Config: Delivery',
      language: 'EN',
      Q1: 'Bob',
      Q2_json: JSON.stringify([]),
      Q3: [],
      Q4: 'Beta'
    });

    const sheet = ss.getSheetByName('Deliveries');
    const values = sheet!.getRange(1, 1, sheet!.getLastRow(), sheet!.getLastColumn()).getValues();
    const header = values[0];
    // Option 1b: destination headers are stored as `Label [ID]`
    const mealCol = header.findIndex((c: string) => /\[Q5\]\s*$/.test((c || '').toString().trim()));
    expect(mealCol).toBeGreaterThanOrEqual(0);
    expect(values[1][mealCol]).toBe('MP-AA000001');
    expect(values[2][mealCol]).toBe('MP-AA000002');
  });

  test('updateRecord (draft) can re-open a Closed record when __ckAllowClosedUpdate is set', () => {
    // 1) Create a record and mark it Closed via draft save.
    const closeRes = service.saveSubmissionWithId({
      formKey: 'Config: Delivery',
      language: 'EN',
      id: 'REC-1',
      Q1: 'Alice',
      Q2_json: JSON.stringify([]),
      Q3: [],
      Q4: 'ACME',
      __ckSaveMode: 'draft',
      __ckStatus: 'Closed'
    } as any);
    expect(closeRes.success).toBe(true);

    // 2) Re-open via explicit flag (simulates button.action=updateRecord).
    const reopenRes = service.saveSubmissionWithId({
      formKey: 'Config: Delivery',
      language: 'EN',
      id: 'REC-1',
      Q1: 'Alice',
      Q2_json: JSON.stringify([]),
      Q3: [],
      Q4: 'ACME',
      __ckSaveMode: 'draft',
      __ckStatus: 'In progress',
      __ckAllowClosedUpdate: '1'
    } as any);
    expect(reopenRes.success).toBe(true);

    const sheet = ss.getSheetByName('Deliveries');
    expect(sheet).toBeDefined();
    const values = sheet!.getRange(1, 1, sheet!.getLastRow(), sheet!.getLastColumn()).getValues();
    const header = values[0].map((h: any) => (h || '').toString().trim().toLowerCase());
    const statusCol = header.findIndex((h: string) => h === 'status');
    expect(statusCol).toBeGreaterThanOrEqual(0);
    // Row 2 is the first record.
    expect((values[1][statusCol] || '').toString()).toBe('In progress');
  });
});
