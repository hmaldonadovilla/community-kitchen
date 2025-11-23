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

    const dashboardData = [
      [],
      [],
      ['Form Title', 'Configuration Sheet Name', 'Destination Tab Name', 'Description', 'Form ID', 'Edit URL', 'Published URL'],
      ['Delivery Form', 'Config: Delivery', 'Deliveries', 'Desc', '', '', '']
    ];
    (dashboardSheet as any).setMockData(dashboardData);

    const configSheet = ss.insertSheet('Config: Delivery');
    const configRows = [
      ['ID', 'Type', 'Q En', 'Q Fr', 'Q Nl', 'Req', 'Opt En', 'Opt Fr', 'Opt Nl', 'Status', 'Config', 'OptionFilter', 'Validation', 'Edit'],
      ['Q1', 'TEXT', 'Name', 'Nom', 'Naam', true, '', '', '', 'Active', '', '', '', ''],
      ['Q2', 'LINE_ITEM_GROUP', 'Items', 'Articles', 'Artikelen', true, '', '', '', 'Active', 'REF:LineItems_Q2', '', '', ''],
      ['Q3', 'FILE_UPLOAD', 'Receipt', 'Reçu', 'Bon', false, '', '', '', 'Active', '{"maxFiles":1,"allowedExtensions":["png"]}', '', '', '']
    ];
    (configSheet as any).setMockData(configRows);

    const lineSheet = ss.insertSheet('LineItems_Q2');
    const lineRows = [
      ['ID', 'Type', 'Label EN', 'Label FR', 'Label NL', 'Req', 'Opt EN', 'Opt FR', 'Opt NL'],
      ['LI1', 'TEXT', 'Item', 'Article', 'Artikel', true, '', '', ''],
      ['LI2', 'NUMBER', 'Qty', 'Qté', 'Aantal', true, '', '', '']
    ];
    (lineSheet as any).setMockData(lineRows);
  });

  test('buildDefinition exposes line items and upload config', () => {
    const def = service.buildDefinition('Config: Delivery');
    expect(def.title).toBe('Delivery Form');
    const line = def.questions.find(q => q.id === 'Q2');
    expect(line?.lineItemConfig?.fields.length).toBe(2);
    const upload = def.questions.find(q => q.id === 'Q3');
    expect(upload?.uploadConfig?.maxFiles).toBe(1);
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
    expect(values[0][0]).toBe('Timestamp');
    expect(values[1][1]).toBe('EN');
    expect(values[1][2]).toBe('Alice');
    expect(values[1][3]).toContain('Apples');
    expect(values[1][4]).toContain('http://file-url');
  });
});
