import './mocks/GoogleAppsScript';
import { WebFormService } from '../src/services/WebFormService';
import { MockSpreadsheet } from './mocks/GoogleAppsScript';

describe('WebFormService', () => {
  let ss: MockSpreadsheet;
  let service: WebFormService;

  beforeEach(() => {
    ss = new MockSpreadsheet();
    service = new WebFormService(ss as any);

    const dashboardSheet = ss.getSheetByName('Forms Dashboard') || ss.insertSheet('Forms Dashboard');

    const followupJson = JSON.stringify({
      appHeader: { logoUrl: 'https://assets.example.test/community-kitchen.png' },
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
      listViewMetaColumns: ['createdAt', 'status'],
      dedupDeleteOnKeyChange: true
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

  const setupInventoryReservationForms = () => {
    const inventoryFormKey = 'Config: Test Leftover Inventory';
    const ledgerFormKey = 'Config: Test Inventory Reservation Ledger';
    const dashboardSheet = ss.getSheetByName('Forms Dashboard') || ss.insertSheet('Forms Dashboard');
    const dashboardData = [
      [],
      [],
      ['Form Title', 'Configuration Sheet Name', 'Destination Tab Name', 'Description', 'Form ID', 'Edit URL', 'Published URL', 'Follow-up Config (JSON)'],
      ['Delivery Form', 'Config: Delivery', 'Deliveries', 'Desc', '', '', '', ''],
      ['Leftover Inventory', inventoryFormKey, 'Test Leftover Inventory Data', 'Desc', '', '', '', ''],
      ['Inventory Reservation Ledger', ledgerFormKey, 'Test Inventory Reservation Ledger Data', 'Desc', '', '', '', '']
    ];
    (dashboardSheet as any).setMockData(dashboardData);

    const inventoryConfig = ss.getSheetByName(inventoryFormKey) || ss.insertSheet(inventoryFormKey);
    const inventoryRows = [
      ['ID', 'Type', 'Q En', 'Q Fr', 'Q Nl', 'Req', 'Opt En', 'Opt Fr', 'Opt Nl', 'Status', 'Config', 'OptionFilter', 'Validation', 'List View?', 'Edit'],
      ['LEFTOVER_ID', 'TEXT', 'Leftover ID', 'Leftover ID', 'Leftover ID', true, '', '', '', 'Active', '', '', '', 'TRUE', ''],
      ['LEFTOVER_STATUS', 'CHOICE', 'Leftover status', 'Leftover status', 'Leftover status', true, 'available,used,expired', 'available,used,expired', 'available,used,expired', 'Active', '', '', '', 'TRUE', ''],
      ['LEFTOVER_KIND', 'TEXT', 'Leftover kind', 'Leftover kind', 'Leftover kind', false, '', '', '', 'Active', '', '', '', '', ''],
      ['LEFTOVER_QTY', 'NUMBER', 'Quantity', 'Quantity', 'Quantity', false, '', '', '', 'Active', '', '', '', '', ''],
      ['LEFTOVER_UNIT', 'TEXT', 'Unit', 'Unit', 'Unit', false, '', '', '', 'Active', '', '', '', '', ''],
      ['LEFTOVER_PORTIONS', 'NUMBER', 'Portions', 'Portions', 'Portions', false, '', '', '', 'Active', '', '', '', '', ''],
      ['LEFTOVER_RESERVED_QTY', 'NUMBER', 'Reserved quantity', 'Reserved quantity', 'Reserved quantity', false, '', '', '', 'Active', '', '', '', '', ''],
      ['LEFTOVER_RESERVED_PORTIONS', 'NUMBER', 'Reserved portions', 'Reserved portions', 'Reserved portions', false, '', '', '', 'Active', '', '', '', '', ''],
      ['LEFTOVER_USED_BY_FORM_KEY', 'TEXT', 'Used by form key', 'Used by form key', 'Used by form key', false, '', '', '', 'Active', '', '', '', '', ''],
      ['LEFTOVER_USED_BY_RECORD_ID', 'TEXT', 'Used by record ID', 'Used by record ID', 'Used by record ID', false, '', '', '', 'Active', '', '', '', '', '']
    ];
    (inventoryConfig as any).setMockData(inventoryRows);

    const ledgerConfig = ss.getSheetByName(ledgerFormKey) || ss.insertSheet(ledgerFormKey);
    const ledgerRows = [
      ['ID', 'Type', 'Q En', 'Q Fr', 'Q Nl', 'Req', 'Opt En', 'Opt Fr', 'Opt Nl', 'Status', 'Config', 'OptionFilter', 'Validation', 'List View?', 'Edit'],
      ['RESERVATION_ID', 'TEXT', 'Reservation ID', 'Reservation ID', 'Reservation ID', true, '', '', '', 'Active', '', '', '', 'TRUE', ''],
      ['RESOURCE_FORM_KEY', 'TEXT', 'Resource form key', 'Resource form key', 'Resource form key', true, '', '', '', 'Active', '', '', '', 'TRUE', ''],
      ['RESOURCE_RECORD_ID', 'TEXT', 'Resource record ID', 'Resource record ID', 'Resource record ID', true, '', '', '', 'Active', '', '', '', 'TRUE', ''],
      ['RESOURCE_ITEM_ID', 'TEXT', 'Resource item ID', 'Resource item ID', 'Resource item ID', false, '', '', '', 'Active', '', '', '', 'TRUE', ''],
      ['RESOURCE_KIND', 'TEXT', 'Resource kind', 'Resource kind', 'Resource kind', false, '', '', '', 'Active', '', '', '', '', ''],
      ['RESOURCE_QTY_FIELD_ID', 'TEXT', 'Resource quantity field ID', 'Resource quantity field ID', 'Resource quantity field ID', false, '', '', '', 'Active', '', '', '', '', ''],
      ['RESOURCE_RESERVED_QTY_FIELD_ID', 'TEXT', 'Resource reserved quantity field ID', 'Resource reserved quantity field ID', 'Resource reserved quantity field ID', false, '', '', '', 'Active', '', '', '', '', ''],
      ['RESOURCE_STATUS_FIELD_ID', 'TEXT', 'Resource status field ID', 'Resource status field ID', 'Resource status field ID', false, '', '', '', 'Active', '', '', '', '', ''],
      ['RESOURCE_UNIT_FIELD_ID', 'TEXT', 'Resource unit field ID', 'Resource unit field ID', 'Resource unit field ID', false, '', '', '', 'Active', '', '', '', '', ''],
      ['RESERVED_QTY', 'NUMBER', 'Reserved quantity', 'Reserved quantity', 'Reserved quantity', false, '', '', '', 'Active', '', '', '', 'TRUE', ''],
      ['RESERVED_UNIT', 'TEXT', 'Reserved unit', 'Reserved unit', 'Reserved unit', false, '', '', '', 'Active', '', '', '', 'TRUE', ''],
      ['STATUS', 'CHOICE', 'Status', 'Status', 'Status', true, 'active,released,consumed', 'active,released,consumed', 'active,released,consumed', 'Active', '', '', '', 'TRUE', ''],
      ['SOURCE_FORM_KEY', 'TEXT', 'Source form key', 'Source form key', 'Source form key', true, '', '', '', 'Active', '', '', '', 'TRUE', ''],
      ['SOURCE_RECORD_ID', 'TEXT', 'Source record ID', 'Source record ID', 'Source record ID', true, '', '', '', 'Active', '', '', '', 'TRUE', ''],
      ['SOURCE_PARENT_GROUP_ID', 'TEXT', 'Source parent group ID', 'Source parent group ID', 'Source parent group ID', false, '', '', '', 'Active', '', '', '', '', ''],
      ['SOURCE_PARENT_ROW_ID', 'TEXT', 'Source parent row ID', 'Source parent row ID', 'Source parent row ID', false, '', '', '', 'Active', '', '', '', '', ''],
      ['SOURCE_OUTPUT_GROUP_ID', 'TEXT', 'Source output group ID', 'Source output group ID', 'Source output group ID', false, '', '', '', 'Active', '', '', '', '', ''],
      ['SOURCE_OUTPUT_ROW_ID', 'TEXT', 'Source output row ID', 'Source output row ID', 'Source output row ID', false, '', '', '', 'Active', '', '', '', '', ''],
      ['SOURCE_OUTPUT_KEY_FIELD_ID', 'TEXT', 'Source output key field ID', 'Source output key field ID', 'Source output key field ID', false, '', '', '', 'Active', '', '', '', '', '']
    ];
    (ledgerConfig as any).setMockData(ledgerRows);

    return { inventoryFormKey, ledgerFormKey };
  };

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

  test('fetchBootstrapContext stays lean by default', () => {
    const res = service.fetchBootstrapContext('Config: Delivery');
    expect(res.definition).toBeDefined();
    expect(res.listResponse).toBeUndefined();
    expect(res.records).toBeUndefined();
    expect(res.analytics).toBeUndefined();
    expect(res.analyticsRev).toBe(0);
  });

  test('fetchDataSource can read records from another form via formKey', () => {
    const dashboardSheet = ss.getSheetByName('Forms Dashboard') || ss.insertSheet('Forms Dashboard');
    const dashboardData = [
      [],
      [],
      ['Form Title', 'Configuration Sheet Name', 'Destination Tab Name', 'Description', 'Form ID', 'Edit URL', 'Published URL', 'Follow-up Config (JSON)'],
      ['Delivery Form', 'Config: Delivery', 'Deliveries', 'Desc', '', '', '', ''],
      ['Inventory Form', 'Config: Inventory', 'Inventory Data', 'Desc', '', '', '', '']
    ];
    (dashboardSheet as any).setMockData(dashboardData);

    const inventoryConfigSheet = ss.insertSheet('Config: Inventory');
    (inventoryConfigSheet as any).setMockData([
      ['ID', 'Type', 'Q En', 'Q Fr', 'Q Nl', 'Req', 'Opt En', 'Opt Fr', 'Opt Nl', 'Status', 'Config', 'OptionFilter', 'Validation', 'List View?', 'Edit'],
      ['LEFTOVER_ID', 'TEXT', 'Leftover ID', 'Leftover ID', 'Leftover ID', true, '', '', '', 'Active', '', '', '', '', ''],
      ['LEFTOVER_STATUS', 'TEXT', 'Status', 'Status', 'Status', false, '', '', '', 'Active', '', '', '', '', '']
    ]);

    const fetchSpy = jest.spyOn((service as any).listing, 'fetchSubmissions').mockReturnValue({
      items: [
        { id: 'rec-1', LEFTOVER_ID: 'LE-1', LEFTOVER_STATUS: 'available' },
        { id: 'rec-2', LEFTOVER_ID: 'LE-2', LEFTOVER_STATUS: 'used' }
      ],
      totalCount: 2
    });

    const res = service.fetchDataSource({
      id: 'Leftover Inventory Data',
      formKey: 'Config: Inventory',
      projection: ['id', 'LEFTOVER_ID', 'LEFTOVER_STATUS'],
      statusFieldId: 'LEFTOVER_STATUS',
      statusAllowList: ['available']
    } as any, 'EN');

    expect(fetchSpy).toHaveBeenCalled();
    expect(res.items).toEqual([
      { id: 'rec-1', LEFTOVER_ID: 'LE-1', LEFTOVER_STATUS: 'available' }
    ]);
  });

  test('fetchDataSource backfills legacy entire-dish leftover fields from the source meal row only when missing', () => {
    const dashboardSheet = ss.getSheetByName('Forms Dashboard') || ss.insertSheet('Forms Dashboard');
    const dashboardData = [
      [],
      [],
      ['Form Title', 'Configuration Sheet Name', 'Destination Tab Name', 'Description', 'Form ID', 'Edit URL', 'Published URL', 'Follow-up Config (JSON)'],
      ['Delivery Form', 'Config: Delivery', 'Deliveries', 'Desc', '', '', '', ''],
      ['Leftover Inventory', 'Config: Leftover Inventory', 'Leftover Inventory Data', 'Desc', '', '', '', ''],
      ['Meal Production', 'Config: Meal Production', 'Meal Production Data', 'Desc', '', '', '', ''],
      ['Ingredients Management', 'Config: Ingredients Management', 'Ingredients Data', 'Desc', '', '', '', '']
    ];
    (dashboardSheet as any).setMockData(dashboardData);

    const inventoryConfigSheet = ss.getSheetByName('Config: Leftover Inventory') || ss.insertSheet('Config: Leftover Inventory');
    (inventoryConfigSheet as any).setMockData([
      ['ID', 'Type', 'Q En', 'Q Fr', 'Q Nl', 'Req', 'Opt En', 'Opt Fr', 'Opt Nl', 'Status', 'Config', 'OptionFilter', 'Validation', 'List View?', 'Edit'],
      ['LEFTOVER_ID', 'TEXT', 'Leftover ID', 'Leftover ID', 'Leftover ID', true, '', '', '', 'Active', '', '', '', '', ''],
      ['LEFTOVER_KIND', 'TEXT', 'Kind', 'Kind', 'Kind', false, '', '', '', 'Active', '', '', '', '', ''],
      ['LEFTOVER_RECIPE', 'TEXT', 'Recipe', 'Recipe', 'Recipe', false, '', '', '', 'Active', '', '', '', '', ''],
      ['LEFTOVER_MEAL_TYPE', 'TEXT', 'Meal type', 'Meal type', 'Meal type', false, '', '', '', 'Active', '', '', '', '', ''],
      ['DIETARY_APPLICABILITY', 'TEXT', 'Dietary applicability', 'Dietary applicability', 'Dietary applicability', false, '', '', '', 'Active', '', '', '', '', ''],
      ['LEFTOVER_SOURCE_FORM_KEY', 'TEXT', 'Source form key', 'Source form key', 'Source form key', false, '', '', '', 'Active', '', '', '', '', ''],
      ['LEFTOVER_SOURCE_RECORD_ID', 'TEXT', 'Source record id', 'Source record id', 'Source record id', false, '', '', '', 'Active', '', '', '', '', ''],
      ['LEFTOVER_SOURCE_ROW_ID', 'TEXT', 'Source row id', 'Source row id', 'Source row id', false, '', '', '', 'Active', '', '', '', '', ''],
      ['LEFTOVER_STATUS', 'TEXT', 'Status', 'Status', 'Status', false, '', '', '', 'Active', '', '', '', '', '']
    ]);

    const mealProductionConfigSheet = ss.getSheetByName('Config: Meal Production') || ss.insertSheet('Config: Meal Production');
    (mealProductionConfigSheet as any).setMockData([
      ['ID', 'Type', 'Q En', 'Q Fr', 'Q Nl', 'Req', 'Opt En', 'Opt Fr', 'Opt Nl', 'Status', 'Config', 'OptionFilter', 'Validation', 'List View?', 'Edit'],
      ['MP_MEALS_REQUEST', 'LINE_ITEM_GROUP', 'Meals', 'Meals', 'Meals', false, '', '', '', 'Active', '', '', '', '', '']
    ]);

    const ingredientsConfigSheet =
      ss.getSheetByName('Config: Ingredients Management') || ss.insertSheet('Config: Ingredients Management');
    (ingredientsConfigSheet as any).setMockData([
      ['ID', 'Type', 'Q En', 'Q Fr', 'Q Nl', 'Req', 'Opt En', 'Opt Fr', 'Opt Nl', 'Status', 'Config', 'OptionFilter', 'Validation', 'List View?', 'Edit'],
      ['INGREDIENT_NAME', 'TEXT', 'Ingredient', 'Ingredient', 'Ingredient', true, '', '', '', 'Active', '', '', '', '', ''],
      ['DIETARY_APPLICABILITY', 'TEXT', 'Dietary applicability', 'Dietary applicability', 'Dietary applicability', false, '', '', '', 'Active', '', '', '', '', ''],
      ['STATUS', 'TEXT', 'Status', 'Status', 'Status', false, '', '', '', 'Active', '', '', '', '', '']
    ]);
    const ingredientsDataSheet = ss.getSheetByName('Ingredients Data') || ss.insertSheet('Ingredients Data');
    (ingredientsDataSheet as any).setMockData([
      ['System Record ID', 'Form Record ID [INGREDIENT_NAME]', 'Dietary applicability [DIETARY_APPLICABILITY]', 'Status [STATUS]'],
      ['row-1', 'Olive oil', 'Vegetarian, Vegan, Diabetic, No-salt, Standard', 'Active'],
      ['row-2', 'Potato', 'Vegetarian, Vegan, Standard', 'Active']
    ]);

    jest.spyOn((service as any).listing, 'fetchSubmissions').mockReturnValue({
      items: [
        {
          id: 'inv-1',
          LEFTOVER_ID: 'LE-8',
          LEFTOVER_KIND: 'Entire dish',
          LEFTOVER_RECIPE: '',
          LEFTOVER_MEAL_TYPE: '',
          DIETARY_APPLICABILITY: '',
          LEFTOVER_SOURCE_FORM_KEY: 'Config: Meal Production',
          LEFTOVER_SOURCE_RECORD_ID: 'MP-1',
          LEFTOVER_SOURCE_ROW_ID: 'meal-row-1',
          LEFTOVER_STATUS: 'available'
        }
      ],
      totalCount: 1
    });

    jest.spyOn(service, 'fetchSubmissionById').mockImplementation((formKey: string, id: string) => {
      if (formKey === 'Config: Meal Production' && id === 'MP-1') {
        return {
          id: 'MP-1',
          values: {
            MP_MEALS_REQUEST: [
              {
                __ckRowId: 'meal-row-1',
                MEAL_TYPE: 'Vegetarian',
                MP_TYPE_LI: [
                  {
                    __ckRowId: 'prep-row-1',
                    PREP_TYPE: 'Cook',
                    RECIPE: 'Greek stew',
                    MP_INGREDIENTS_LI: [
                      { ING: 'Olive oil' },
                      { ING: 'Potato' }
                    ]
                  }
                ]
              }
            ]
          }
        } as any;
      }
      return null;
    });

    const res = service.fetchDataSource({
      id: 'Leftover Inventory Data',
      formKey: 'Config: Leftover Inventory',
      backfill: {
        whenMissingAnyFieldIds: ['LEFTOVER_RECIPE', 'LEFTOVER_INGREDIENT', 'LEFTOVER_MEAL_TYPE', 'DIETARY_APPLICABILITY'],
        sourceFormKeyFieldId: 'LEFTOVER_SOURCE_FORM_KEY',
        sourceRecordIdFieldId: 'LEFTOVER_SOURCE_RECORD_ID',
        sourceRowIdFieldId: 'LEFTOVER_SOURCE_ROW_ID',
        scopes: [
          {
            id: 'mealRow',
            groupId: 'MP_MEALS_REQUEST',
            matchBySourceRowId: true
          },
          {
            id: 'cookRow',
            groupId: 'MP_TYPE_LI',
            parentScopeId: 'mealRow',
            matchBySourceRowId: true,
            rowFilter: {
              includeWhen: {
                fieldId: 'PREP_TYPE',
                equals: ['Cook']
              }
            },
            fallbackMatch: 'first'
          },
          {
            id: 'partialRow',
            groupId: 'MP_LEFTOVER_CAPTURE_LI',
            matchBySourceRowId: true,
            fallbackMatch: 'first'
          }
        ],
        values: {
          LEFTOVER_RECIPE: '{{cookRow.RECIPE}}',
          LEFTOVER_MEAL_TYPE: '{{mealRow.MEAL_TYPE}}',
          LEFTOVER_INGREDIENT: '{{partialRow.LEFTOVER_INGREDIENT}}',
          DIETARY_APPLICABILITY: {
            op: 'lookupSetIntersection',
            collectionPath: 'cookRow.MP_INGREDIENTS_LI',
            itemFieldId: 'ING',
            lookupFormKey: 'Config: Ingredients Management',
            lookupKeyFieldId: 'INGREDIENT_NAME',
            lookupValueFieldId: 'DIETARY_APPLICABILITY',
            splitOn: ',',
            joinWith: ', ',
            fallback: '{{partialRow.LEFTOVER_DIETARY_APPLICABILITY}}'
          }
        }
      },
      projection: [
        'id',
        'LEFTOVER_ID',
        'LEFTOVER_KIND',
        'LEFTOVER_RECIPE',
        'LEFTOVER_MEAL_TYPE',
        'DIETARY_APPLICABILITY',
        'LEFTOVER_SOURCE_FORM_KEY',
        'LEFTOVER_SOURCE_RECORD_ID',
        'LEFTOVER_SOURCE_ROW_ID'
      ]
    } as any, 'EN');

    expect(res.items).toEqual([
      expect.objectContaining({
        id: 'inv-1',
        LEFTOVER_ID: 'LE-8',
        LEFTOVER_RECIPE: 'Greek stew',
        LEFTOVER_MEAL_TYPE: 'Vegetarian',
        DIETARY_APPLICABILITY: 'Vegetarian, Vegan, Standard'
      })
    ]);
  });

  test('fetchDataSource backfills legacy entire-dish leftover fields when source row id points to the cook row', () => {
    const dashboardSheet = ss.getSheetByName('Forms Dashboard') || ss.insertSheet('Forms Dashboard');
    const dashboardData = [
      [],
      [],
      ['Form Title', 'Configuration Sheet Name', 'Destination Tab Name', 'Description', 'Form ID', 'Edit URL', 'Published URL', 'Follow-up Config (JSON)'],
      ['Delivery Form', 'Config: Delivery', 'Deliveries', 'Desc', '', '', '', ''],
      ['Leftover Inventory', 'Config: Leftover Inventory', 'Leftover Inventory Data', 'Desc', '', '', '', ''],
      ['Meal Production', 'Config: Meal Production', 'Meal Production Data', 'Desc', '', '', '', ''],
      ['Ingredients Management', 'Config: Ingredients Management', 'Ingredients Data', 'Desc', '', '', '', '']
    ];
    (dashboardSheet as any).setMockData(dashboardData);

    const inventoryConfigSheet = ss.getSheetByName('Config: Leftover Inventory') || ss.insertSheet('Config: Leftover Inventory');
    (inventoryConfigSheet as any).setMockData([
      ['ID', 'Type', 'Q En', 'Q Fr', 'Q Nl', 'Req', 'Opt En', 'Opt Fr', 'Opt Nl', 'Status', 'Config', 'OptionFilter', 'Validation', 'List View?', 'Edit'],
      ['LEFTOVER_ID', 'TEXT', 'Leftover ID', 'Leftover ID', 'Leftover ID', true, '', '', '', 'Active', '', '', '', '', ''],
      ['LEFTOVER_KIND', 'TEXT', 'Kind', 'Kind', 'Kind', false, '', '', '', 'Active', '', '', '', '', ''],
      ['LEFTOVER_RECIPE', 'TEXT', 'Recipe', 'Recipe', 'Recipe', false, '', '', '', 'Active', '', '', '', '', ''],
      ['LEFTOVER_MEAL_TYPE', 'TEXT', 'Meal type', 'Meal type', 'Meal type', false, '', '', '', 'Active', '', '', '', '', ''],
      ['DIETARY_APPLICABILITY', 'TEXT', 'Dietary applicability', 'Dietary applicability', 'Dietary applicability', false, '', '', '', 'Active', '', '', '', '', ''],
      ['LEFTOVER_SOURCE_FORM_KEY', 'TEXT', 'Source form key', 'Source form key', 'Source form key', false, '', '', '', 'Active', '', '', '', '', ''],
      ['LEFTOVER_SOURCE_RECORD_ID', 'TEXT', 'Source record id', 'Source record id', 'Source record id', false, '', '', '', 'Active', '', '', '', '', ''],
      ['LEFTOVER_SOURCE_ROW_ID', 'TEXT', 'Source row id', 'Source row id', 'Source row id', false, '', '', '', 'Active', '', '', '', '', ''],
      ['LEFTOVER_STATUS', 'TEXT', 'Status', 'Status', 'Status', false, '', '', '', 'Active', '', '', '', '', '']
    ]);

    const mealProductionConfigSheet = ss.getSheetByName('Config: Meal Production') || ss.insertSheet('Config: Meal Production');
    (mealProductionConfigSheet as any).setMockData([
      ['ID', 'Type', 'Q En', 'Q Fr', 'Q Nl', 'Req', 'Opt En', 'Opt Fr', 'Opt Nl', 'Status', 'Config', 'OptionFilter', 'Validation', 'List View?', 'Edit'],
      ['MP_MEALS_REQUEST', 'LINE_ITEM_GROUP', 'Meals', 'Meals', 'Meals', false, '', '', '', 'Active', '', '', '', '', '']
    ]);

    const ingredientsConfigSheet =
      ss.getSheetByName('Config: Ingredients Management') || ss.insertSheet('Config: Ingredients Management');
    (ingredientsConfigSheet as any).setMockData([
      ['ID', 'Type', 'Q En', 'Q Fr', 'Q Nl', 'Req', 'Opt En', 'Opt Fr', 'Opt Nl', 'Status', 'Config', 'OptionFilter', 'Validation', 'List View?', 'Edit'],
      ['INGREDIENT_NAME', 'TEXT', 'Ingredient', 'Ingredient', 'Ingredient', true, '', '', '', 'Active', '', '', '', '', ''],
      ['DIETARY_APPLICABILITY', 'TEXT', 'Dietary applicability', 'Dietary applicability', 'Dietary applicability', false, '', '', '', 'Active', '', '', '', '', ''],
      ['STATUS', 'TEXT', 'Status', 'Status', 'Status', false, '', '', '', 'Active', '', '', '', '', '']
    ]);
    const ingredientsDataSheet = ss.getSheetByName('Ingredients Data') || ss.insertSheet('Ingredients Data');
    (ingredientsDataSheet as any).setMockData([
      ['System Record ID', 'Form Record ID [INGREDIENT_NAME]', 'Dietary applicability [DIETARY_APPLICABILITY]', 'Status [STATUS]'],
      ['row-1', 'Bulgur', 'Vegan', 'Active']
    ]);

    jest.spyOn((service as any).listing, 'fetchSubmissions').mockReturnValue({
      items: [
        {
          id: 'inv-2',
          LEFTOVER_ID: 'LE-12',
          LEFTOVER_KIND: 'Entire dish',
          LEFTOVER_RECIPE: '',
          LEFTOVER_MEAL_TYPE: '',
          DIETARY_APPLICABILITY: '',
          LEFTOVER_SOURCE_FORM_KEY: 'Config: Meal Production',
          LEFTOVER_SOURCE_RECORD_ID: 'MP-2',
          LEFTOVER_SOURCE_ROW_ID: 'cook-row-1',
          LEFTOVER_STATUS: 'available'
        }
      ],
      totalCount: 1
    });

    jest.spyOn(service, 'fetchSubmissionById').mockImplementation((formKey: string, id: string) => {
      if (formKey === 'Config: Meal Production' && id === 'MP-2') {
        return {
          id: 'MP-2',
          values: {
            MP_MEALS_REQUEST: [
              {
                __ckRowId: 'meal-row-2',
                MEAL_TYPE: 'Vegan',
                MP_TYPE_LI: [
                  {
                    __ckRowId: 'cook-row-1',
                    PREP_TYPE: 'Cook',
                    RECIPE: 'Bulgur & vegetable warm salad',
                    MP_INGREDIENTS_LI: [
                      { ING: 'Bulgur' }
                    ]
                  }
                ]
              }
            ]
          }
        } as any;
      }
      return null;
    });

    const res = service.fetchDataSource({
      id: 'Leftover Inventory Data',
      formKey: 'Config: Leftover Inventory',
      backfill: {
        whenMissingAnyFieldIds: ['LEFTOVER_RECIPE', 'LEFTOVER_INGREDIENT', 'LEFTOVER_MEAL_TYPE', 'DIETARY_APPLICABILITY'],
        sourceFormKeyFieldId: 'LEFTOVER_SOURCE_FORM_KEY',
        sourceRecordIdFieldId: 'LEFTOVER_SOURCE_RECORD_ID',
        sourceRowIdFieldId: 'LEFTOVER_SOURCE_ROW_ID',
        scopes: [
          {
            id: 'mealRow',
            groupId: 'MP_MEALS_REQUEST',
            matchBySourceRowId: true
          },
          {
            id: 'cookRow',
            groupId: 'MP_TYPE_LI',
            parentScopeId: 'mealRow',
            matchBySourceRowId: true,
            rowFilter: {
              includeWhen: {
                fieldId: 'PREP_TYPE',
                equals: ['Cook']
              }
            },
            fallbackMatch: 'first'
          },
          {
            id: 'partialRow',
            groupId: 'MP_LEFTOVER_CAPTURE_LI',
            matchBySourceRowId: true,
            fallbackMatch: 'first'
          }
        ],
        values: {
          LEFTOVER_RECIPE: '{{cookRow.RECIPE}}',
          LEFTOVER_MEAL_TYPE: '{{mealRow.MEAL_TYPE}}',
          LEFTOVER_INGREDIENT: '{{partialRow.LEFTOVER_INGREDIENT}}',
          DIETARY_APPLICABILITY: {
            op: 'lookupSetIntersection',
            collectionPath: 'cookRow.MP_INGREDIENTS_LI',
            itemFieldId: 'ING',
            lookupFormKey: 'Config: Ingredients Management',
            lookupKeyFieldId: 'INGREDIENT_NAME',
            lookupValueFieldId: 'DIETARY_APPLICABILITY',
            splitOn: ',',
            joinWith: ', ',
            fallback: '{{partialRow.LEFTOVER_DIETARY_APPLICABILITY}}'
          }
        }
      },
      projection: [
        'id',
        'LEFTOVER_ID',
        'LEFTOVER_KIND',
        'LEFTOVER_RECIPE',
        'LEFTOVER_MEAL_TYPE',
        'DIETARY_APPLICABILITY',
        'LEFTOVER_SOURCE_FORM_KEY',
        'LEFTOVER_SOURCE_RECORD_ID',
        'LEFTOVER_SOURCE_ROW_ID'
      ]
    } as any, 'EN');

    expect(res.items).toEqual([
      expect.objectContaining({
        id: 'inv-2',
        LEFTOVER_ID: 'LE-12',
        LEFTOVER_RECIPE: 'Bulgur & vegetable warm salad',
        LEFTOVER_MEAL_TYPE: 'Vegan',
        DIETARY_APPLICABILITY: 'Vegan'
      })
    ]);
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
    const dashboardSheet = ss.getSheetByName('Forms Dashboard') || ss.insertSheet('Forms Dashboard');

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

  test('fetchFormCatalog builds absolute links against the current web app url', () => {
    const previousScriptApp = (global as any).ScriptApp;
    (global as any).ScriptApp = {
      getService: () => ({
        getUrl: () => 'https://script.google.com/macros/s/current-deployment/exec'
      })
    };

    try {
      const items = service.fetchFormCatalog();
      const delivery = items.find(item => item.formKey === 'Config: Delivery');
      expect(delivery).toBeDefined();
      expect(delivery?.targetUrl).toBe(
        'https://script.google.com/macros/s/current-deployment/exec?form=Config%3A+Delivery'
      );
      expect(delivery?.logoUrl).toBe('https://assets.example.test/community-kitchen.png');
    } finally {
      (global as any).ScriptApp = previousScriptApp;
    }
  });

  test('fetchFormCatalog preserves app and page params from the stored form url', () => {
    const previousScriptApp = (global as any).ScriptApp;
    (global as any).ScriptApp = {
      getService: () => ({
        getUrl: () => 'https://script.google.com/macros/s/current-deployment/exec'
      })
    };

    const dashboardSheet = ss.getSheetByName('Forms Dashboard') || ss.insertSheet('Forms Dashboard');
    const dashboardData = [
      [],
      [],
      ['Form Title', 'Configuration Sheet Name', 'Destination Tab Name', 'Description', 'Web App URL (?form=ConfigSheetName)'],
      [
        'Delivery Form',
        'Config: Delivery',
        'Deliveries',
        'Desc',
        'https://script.google.com/macros/s/old-deployment/exec?form=Config%3A+Delivery&app=meal-production&page=analytics'
      ]
    ];
    (dashboardSheet as any).setMockData(dashboardData);

    try {
      const items = service.fetchFormCatalog();
      const delivery = items.find(item => item.formKey === 'Config: Delivery');
      expect(delivery).toBeDefined();
      expect(delivery?.targetUrl).toBe(
        'https://script.google.com/macros/s/current-deployment/exec?form=Config%3A+Delivery&app=meal-production&page=analytics'
      );
    } finally {
      (global as any).ScriptApp = previousScriptApp;
    }
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

  test('triggerFollowupActions batches actions and returns per-action results', () => {
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
      id: 'REC-BATCH-1',
      Q1: 'Alice',
      Q2_json: JSON.stringify([]),
      Q3: [],
      Q4: 'ACME'
    } as any);

    const result = (service as any).triggerFollowupActions('Config: Delivery', 'REC-BATCH-1', ['SEND_EMAIL', 'CLOSE_RECORD']);
    expect(result.success).toBe(true);
    expect(Array.isArray(result.results)).toBe(true);
    expect(result.results).toHaveLength(2);
    expect(result.results[0].action).toBe('SEND_EMAIL');
    expect(result.results[0].result?.success).toBe(true);
    expect(result.results[1].action).toBe('CLOSE_RECORD');
    expect(result.results[1].result?.success).toBe(true);
  });

  test('emailTemplateId supports conditional cases based on record field values', () => {
    const dashboardSheet = ss.getSheetByName('Forms Dashboard') || ss.insertSheet('Forms Dashboard');

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

  test('auto increment can partition prefixes by another field value', () => {
    const dashboardSheet = ss.getSheetByName('Forms Dashboard') || ss.insertSheet('Forms Dashboard');
    const dashboardData = [
      [],
      [],
      ['Form Title', 'Configuration Sheet Name', 'Destination Tab Name', 'Description', 'Form ID', 'Edit URL', 'Published URL', 'Follow-up Config (JSON)'],
      ['Leftover Inventory', 'Config: Inventory', 'Inventory Data', 'Desc', '', '', '', '']
    ];
    (dashboardSheet as any).setMockData(dashboardData);

    const configSheet = ss.insertSheet('Config: Inventory');
    const configRows = [
      ['ID', 'Type', 'Q En', 'Q Fr', 'Q Nl', 'Req', 'Opt En', 'Opt Fr', 'Opt Nl', 'Status', 'Config', 'OptionFilter', 'Validation', 'List View?', 'Edit'],
      ['LEFTOVER_KIND', 'CHOICE', 'Kind', 'Kind', 'Kind', true, 'entireDish,partialDish', 'entireDish,partialDish', 'entireDish,partialDish', 'Active', '', '', '', '', ''],
      [
        'LEFTOVER_ID',
        'TEXT',
        'Leftover ID',
        'Leftover ID',
        'Leftover ID',
        false,
        '',
        '',
        '',
        'Active',
        '{"autoIncrement":{"padLength":6,"prefixByValue":{"fieldId":"LEFTOVER_KIND","map":{"entireDish":"LE-","partialDish":"LP-"},"defaultPrefix":"LX-"}}}',
        '',
        '',
        '',
        ''
      ]
    ];
    (configSheet as any).setMockData(configRows);

    service.saveSubmissionWithId({
      formKey: 'Config: Inventory',
      language: 'EN',
      LEFTOVER_KIND: 'entireDish'
    } as any);
    service.saveSubmissionWithId({
      formKey: 'Config: Inventory',
      language: 'EN',
      LEFTOVER_KIND: 'partialDish'
    } as any);
    service.saveSubmissionWithId({
      formKey: 'Config: Inventory',
      language: 'EN',
      LEFTOVER_KIND: 'entireDish'
    } as any);

    const sheet = ss.getSheetByName('Inventory Data');
    const values = sheet!.getRange(1, 1, sheet!.getLastRow(), sheet!.getLastColumn()).getValues();
    const header = values[0];
    const idCol = header.findIndex((c: string) => /\[LEFTOVER_ID\]\s*$/.test((c || '').toString().trim()));
    expect(idCol).toBeGreaterThanOrEqual(0);
    expect(values[1][idCol]).toBe('LE-000001');
    expect(values[2][idCol]).toBe('LP-000001');
    expect(values[3][idCol]).toBe('LE-000002');
  });

  test('auto increment supports padLength 0 for variable-width ids', () => {
    const dashboardSheet = ss.getSheetByName('Forms Dashboard') || ss.insertSheet('Forms Dashboard');
    const dashboardData = [
      [],
      [],
      ['Form Title', 'Configuration Sheet Name', 'Destination Tab Name', 'Description', 'Form ID', 'Edit URL', 'Published URL', 'Follow-up Config (JSON)'],
      ['Leftover Inventory', 'Config: Inventory', 'Inventory Data', 'Desc', '', '', '', '']
    ];
    (dashboardSheet as any).setMockData(dashboardData);

    const configSheet = ss.insertSheet('Config: Inventory');
    const configRows = [
      ['ID', 'Type', 'Q En', 'Q Fr', 'Q Nl', 'Req', 'Opt En', 'Opt Fr', 'Opt Nl', 'Status', 'Config', 'OptionFilter', 'Validation', 'List View?', 'Edit'],
      ['LEFTOVER_KIND', 'CHOICE', 'Kind', 'Kind', 'Kind', true, 'entireDish,partialDish', 'entireDish,partialDish', 'entireDish,partialDish', 'Active', '', '', '', '', ''],
      [
        'LEFTOVER_ID',
        'TEXT',
        'Leftover ID',
        'Leftover ID',
        'Leftover ID',
        false,
        '',
        '',
        '',
        'Active',
        '{"autoIncrement":{"padLength":0,"prefixByValue":{"fieldId":"LEFTOVER_KIND","map":{"entireDish":"LE-","partialDish":"LP-"}}}}',
        '',
        '',
        '',
        ''
      ]
    ];
    (configSheet as any).setMockData(configRows);

    service.saveSubmissionWithId({
      formKey: 'Config: Inventory',
      language: 'EN',
      LEFTOVER_KIND: 'entireDish'
    } as any);
    service.saveSubmissionWithId({
      formKey: 'Config: Inventory',
      language: 'EN',
      LEFTOVER_KIND: 'entireDish'
    } as any);
    service.saveSubmissionWithId({
      formKey: 'Config: Inventory',
      language: 'EN',
      LEFTOVER_KIND: 'partialDish'
    } as any);

    const sheet = ss.getSheetByName('Inventory Data');
    const values = sheet!.getRange(1, 1, sheet!.getLastRow(), sheet!.getLastColumn()).getValues();
    const header = values[0];
    const idCol = header.findIndex((c: string) => /\[LEFTOVER_ID\]\s*$/.test((c || '').toString().trim()));
    expect(idCol).toBeGreaterThanOrEqual(0);
    expect(values[1][idCol]).toBe('LE-1');
    expect(values[2][idCol]).toBe('LE-2');
    expect(values[3][idCol]).toBe('LP-1');
  });

  test('saveSubmissionWithId applies follow-up submitEffects createRecord on source create only', () => {
    const dashboardSheet = ss.getSheetByName('Forms Dashboard') || ss.insertSheet('Forms Dashboard');
    const followupJson = JSON.stringify({
      submitEffects: [
        {
          type: 'createRecord',
          targetFormKey: 'Config: Inventory',
          runOn: 'create',
          status: 'Available',
          values: {
            SOURCE_RECORD_ID: '{{source.id}}',
            SOURCE_NAME: '{{source.Q1}}',
            LEFTOVER_KIND: 'entireDish'
          }
        }
      ]
    });
    const dashboardData = [
      [],
      [],
      ['Form Title', 'Configuration Sheet Name', 'Destination Tab Name', 'Description', 'Form ID', 'Edit URL', 'Published URL', 'Follow-up Config (JSON)'],
      ['Delivery Form', 'Config: Delivery', 'Deliveries', 'Desc', '', '', '', followupJson],
      ['Leftover Inventory', 'Config: Inventory', 'Inventory Data', 'Desc', '', '', '', '']
    ];
    (dashboardSheet as any).setMockData(dashboardData);

    const inventoryConfig = ss.insertSheet('Config: Inventory');
    const inventoryRows = [
      ['ID', 'Type', 'Q En', 'Q Fr', 'Q Nl', 'Req', 'Opt En', 'Opt Fr', 'Opt Nl', 'Status', 'Config', 'OptionFilter', 'Validation', 'List View?', 'Edit'],
      ['SOURCE_RECORD_ID', 'TEXT', 'Source record', 'Source record', 'Source record', false, '', '', '', 'Active', '', '', '', '', ''],
      ['SOURCE_NAME', 'TEXT', 'Source name', 'Source name', 'Source name', false, '', '', '', 'Active', '', '', '', '', ''],
      ['LEFTOVER_KIND', 'CHOICE', 'Kind', 'Kind', 'Kind', true, 'entireDish,partialDish', 'entireDish,partialDish', 'entireDish,partialDish', 'Active', '', '', '', '', ''],
      [
        'LEFTOVER_ID',
        'TEXT',
        'Leftover ID',
        'Leftover ID',
        'Leftover ID',
        false,
        '',
        '',
        '',
        'Active',
        '{"autoIncrement":{"padLength":6,"prefixByValue":{"fieldId":"LEFTOVER_KIND","map":{"entireDish":"LE-","partialDish":"LP-"}}}}',
        '',
        '',
        '',
        ''
      ]
    ];
    (inventoryConfig as any).setMockData(inventoryRows);

    const created = service.saveSubmissionWithId({
      formKey: 'Config: Delivery',
      language: 'EN',
      Q1: 'Alice',
      Q2_json: JSON.stringify([]),
      Q3: [],
      Q4: 'ACME',
      __ckSaveMode: 'draft',
      __ckStatus: 'In progress'
    } as any);
    expect(created.success).toBe(true);
    expect(created.meta?.submitEffects).toEqual(
      expect.objectContaining({
        configured: 1,
        executed: 1,
        created: 1,
        operation: 'create'
      })
    );

    const updated = service.saveSubmissionWithId({
      formKey: 'Config: Delivery',
      language: 'EN',
      id: created.meta.id,
      Q1: 'Alice Updated',
      Q2_json: JSON.stringify([]),
      Q3: [],
      Q4: 'ACME',
      __ckSaveMode: 'draft',
      __ckStatus: 'In progress'
    } as any);
    expect(updated.success).toBe(true);
    expect(updated.meta?.submitEffects).toEqual(
      expect.objectContaining({
        configured: 1,
        executed: 0,
        created: 0,
        operation: 'update'
      })
    );

    const inventorySheet = ss.getSheetByName('Inventory Data');
    expect(inventorySheet).toBeDefined();
    expect(inventorySheet!.getLastRow()).toBe(2);
    const inventoryValues = inventorySheet!.getRange(1, 1, inventorySheet!.getLastRow(), inventorySheet!.getLastColumn()).getValues();
    const header = inventoryValues[0].map((value: any) => (value || '').toString().trim());
    const sourceIdCol = header.findIndex((value: string) => /\[SOURCE_RECORD_ID\]\s*$/.test(value));
    const sourceNameCol = header.findIndex((value: string) => /\[SOURCE_NAME\]\s*$/.test(value));
    const leftoverIdCol = header.findIndex((value: string) => /\[LEFTOVER_ID\]\s*$/.test(value));
    const statusCol = header.findIndex((value: string) => value.toLowerCase() === 'status');
    expect(sourceIdCol).toBeGreaterThanOrEqual(0);
    expect(sourceNameCol).toBeGreaterThanOrEqual(0);
    expect(leftoverIdCol).toBeGreaterThanOrEqual(0);
    expect(statusCol).toBeGreaterThanOrEqual(0);
    expect((inventoryValues[1][sourceIdCol] || '').toString()).toBe((created.meta.id || '').toString());
    expect((inventoryValues[1][sourceNameCol] || '').toString()).toBe('Alice');
    expect((inventoryValues[1][leftoverIdCol] || '').toString()).toBe('LE-000001');
    expect((inventoryValues[1][statusCol] || '').toString()).toBe('Available');
  });

  test('saveSubmissionWithId can create downstream records from source line-item rows', () => {
    const dashboardSheet = ss.getSheetByName('Forms Dashboard') || ss.insertSheet('Forms Dashboard');
    const followupJson = JSON.stringify({
      submitEffects: [
        {
          type: 'createRecord',
          targetFormKey: 'Config: Inventory',
          runOn: 'create',
          status: 'Available',
          forEachLineItem: {
            groupId: 'Q2',
            when: {
              fieldId: 'LI2',
              greaterThan: 0
            }
          },
          values: {
            SOURCE_RECORD_ID: '{{source.id}}',
            SOURCE_NAME: '{{source.Q1}}',
            LEFTOVER_KIND: 'entireDish',
            LEFTOVER_NAME: '{{row.LI1}}',
            LEFTOVER_QTY: '{{row.LI2}}',
            LEFTOVER_SEQ: '{{lineItem.index}}',
            LEFTOVER_SOURCE_ROW_ID: '{{lineItem.rowId}}'
          }
        }
      ]
    });
    const dashboardData = [
      [],
      [],
      ['Form Title', 'Configuration Sheet Name', 'Destination Tab Name', 'Description', 'Form ID', 'Edit URL', 'Published URL', 'Follow-up Config (JSON)'],
      ['Delivery Form', 'Config: Delivery', 'Deliveries', 'Desc', '', '', '', followupJson],
      ['Leftover Inventory', 'Config: Inventory', 'Inventory Data', 'Desc', '', '', '', '']
    ];
    (dashboardSheet as any).setMockData(dashboardData);

    const inventoryConfig = ss.insertSheet('Config: Inventory');
    const inventoryRows = [
      ['ID', 'Type', 'Q En', 'Q Fr', 'Q Nl', 'Req', 'Opt En', 'Opt Fr', 'Opt Nl', 'Status', 'Config', 'OptionFilter', 'Validation', 'List View?', 'Edit'],
      ['SOURCE_RECORD_ID', 'TEXT', 'Source record', 'Source record', 'Source record', false, '', '', '', 'Active', '', '', '', '', ''],
      ['SOURCE_NAME', 'TEXT', 'Source name', 'Source name', 'Source name', false, '', '', '', 'Active', '', '', '', '', ''],
      ['LEFTOVER_KIND', 'CHOICE', 'Kind', 'Kind', 'Kind', true, 'entireDish,partialDish', 'entireDish,partialDish', 'entireDish,partialDish', 'Active', '', '', '', '', ''],
      ['LEFTOVER_NAME', 'TEXT', 'Leftover name', 'Leftover name', 'Leftover name', false, '', '', '', 'Active', '', '', '', '', ''],
      ['LEFTOVER_QTY', 'NUMBER', 'Leftover qty', 'Leftover qty', 'Leftover qty', false, '', '', '', 'Active', '', '', '', '', ''],
      ['LEFTOVER_SEQ', 'TEXT', 'Leftover sequence', 'Leftover sequence', 'Leftover sequence', false, '', '', '', 'Active', '', '', '', '', ''],
      ['LEFTOVER_SOURCE_ROW_ID', 'TEXT', 'Source row id', 'Source row id', 'Source row id', false, '', '', '', 'Active', '', '', '', '', ''],
      [
        'LEFTOVER_ID',
        'TEXT',
        'Leftover ID',
        'Leftover ID',
        'Leftover ID',
        false,
        '',
        '',
        '',
        'Active',
        '{"autoIncrement":{"padLength":0,"prefixByValue":{"fieldId":"LEFTOVER_KIND","map":{"entireDish":"LE-","partialDish":"LP-"}}}}',
        '',
        '',
        '',
        ''
      ]
    ];
    (inventoryConfig as any).setMockData(inventoryRows);

    const created = service.saveSubmissionWithId({
      formKey: 'Config: Delivery',
      language: 'EN',
      Q1: 'Alice',
      Q2_json: JSON.stringify([
        { LI1: 'Soup', LI2: 2 },
        { LI1: 'Salad', LI2: 3 },
        { LI1: 'Waste', LI2: 0 }
      ]),
      Q3: [],
      Q4: 'ACME',
      __ckSaveMode: 'draft',
      __ckStatus: 'In progress'
    } as any);

    expect(created.success).toBe(true);
    expect(created.meta?.submitEffects).toEqual(
      expect.objectContaining({
        configured: 1,
        executed: 1,
        created: 2,
        operation: 'create'
      })
    );

    const inventorySheet = ss.getSheetByName('Inventory Data');
    expect(inventorySheet).toBeDefined();
    expect(inventorySheet!.getLastRow()).toBe(3);
    const inventoryValues = inventorySheet!.getRange(1, 1, inventorySheet!.getLastRow(), inventorySheet!.getLastColumn()).getValues();
    const header = inventoryValues[0].map((value: any) => (value || '').toString().trim());
    const sourceIdCol = header.findIndex((value: string) => /\[SOURCE_RECORD_ID\]\s*$/.test(value));
    const sourceNameCol = header.findIndex((value: string) => /\[SOURCE_NAME\]\s*$/.test(value));
    const leftoverNameCol = header.findIndex((value: string) => /\[LEFTOVER_NAME\]\s*$/.test(value));
    const leftoverQtyCol = header.findIndex((value: string) => /\[LEFTOVER_QTY\]\s*$/.test(value));
    const leftoverSeqCol = header.findIndex((value: string) => /\[LEFTOVER_SEQ\]\s*$/.test(value));
    const leftoverSourceRowIdCol = header.findIndex((value: string) => /\[LEFTOVER_SOURCE_ROW_ID\]\s*$/.test(value));
    const leftoverIdCol = header.findIndex((value: string) => /\[LEFTOVER_ID\]\s*$/.test(value));
    expect((inventoryValues[1][sourceIdCol] || '').toString()).toBe((created.meta.id || '').toString());
    expect((inventoryValues[1][sourceNameCol] || '').toString()).toBe('Alice');
    expect((inventoryValues[1][leftoverNameCol] || '').toString()).toBe('Soup');
    expect(Number(inventoryValues[1][leftoverQtyCol] || 0)).toBe(2);
    expect((inventoryValues[1][leftoverSeqCol] || '').toString()).toBe('1');
    expect((inventoryValues[1][leftoverSourceRowIdCol] || '').toString()).toBe('Q2_0');
    expect((inventoryValues[1][leftoverIdCol] || '').toString()).toBe('LE-1');
    expect((inventoryValues[2][leftoverNameCol] || '').toString()).toBe('Salad');
    expect(Number(inventoryValues[2][leftoverQtyCol] || 0)).toBe(3);
    expect((inventoryValues[2][leftoverSeqCol] || '').toString()).toBe('2');
    expect((inventoryValues[2][leftoverSourceRowIdCol] || '').toString()).toBe('Q2_1');
    expect((inventoryValues[2][leftoverIdCol] || '').toString()).toBe('LE-2');
    expect(inventoryValues.map((row: any[]) => (row[leftoverNameCol] || '').toString())).not.toContain('Waste');
  });

  test('saveSubmissionWithId can upsert downstream records by deterministic submit-effect record id', () => {
    const dashboardSheet = ss.getSheetByName('Forms Dashboard') || ss.insertSheet('Forms Dashboard');
    const followupJson = JSON.stringify({
      submitEffects: [
        {
          type: 'createRecord',
          targetFormKey: 'Config: Inventory',
          runOn: 'both',
          recordId: 'leftover::{{source.id}}::{{lineItem.rowId}}',
          status: 'Available',
          forEachLineItem: {
            groupId: 'Q2',
            when: {
              fieldId: 'LI2',
              greaterThan: 0
            }
          },
          values: {
            SOURCE_RECORD_ID: '{{source.id}}',
            SOURCE_NAME: '{{source.Q1}}',
            LEFTOVER_KIND: 'entireDish',
            LEFTOVER_NAME: '{{row.LI1}}',
            LEFTOVER_QTY: '{{row.LI2}}',
            LEFTOVER_SOURCE_ROW_ID: '{{lineItem.rowId}}'
          }
        }
      ]
    });
    const dashboardData = [
      [],
      [],
      ['Form Title', 'Configuration Sheet Name', 'Destination Tab Name', 'Description', 'Form ID', 'Edit URL', 'Published URL', 'Follow-up Config (JSON)'],
      ['Delivery Form', 'Config: Delivery', 'Deliveries', 'Desc', '', '', '', followupJson],
      ['Leftover Inventory', 'Config: Inventory', 'Inventory Data', 'Desc', '', '', '', '']
    ];
    (dashboardSheet as any).setMockData(dashboardData);

    const inventoryConfig = ss.insertSheet('Config: Inventory');
    const inventoryRows = [
      ['ID', 'Type', 'Q En', 'Q Fr', 'Q Nl', 'Req', 'Opt En', 'Opt Fr', 'Opt Nl', 'Status', 'Config', 'OptionFilter', 'Validation', 'List View?', 'Edit'],
      ['SOURCE_RECORD_ID', 'TEXT', 'Source record', 'Source record', 'Source record', false, '', '', '', 'Active', '', '', '', '', ''],
      ['SOURCE_NAME', 'TEXT', 'Source name', 'Source name', 'Source name', false, '', '', '', 'Active', '', '', '', '', ''],
      ['LEFTOVER_KIND', 'CHOICE', 'Kind', 'Kind', 'Kind', true, 'entireDish,partialDish', 'entireDish,partialDish', 'entireDish,partialDish', 'Active', '', '', '', '', ''],
      ['LEFTOVER_NAME', 'TEXT', 'Leftover name', 'Leftover name', 'Leftover name', false, '', '', '', 'Active', '', '', '', '', ''],
      ['LEFTOVER_QTY', 'NUMBER', 'Leftover qty', 'Leftover qty', 'Leftover qty', false, '', '', '', 'Active', '', '', '', '', ''],
      ['LEFTOVER_SOURCE_ROW_ID', 'TEXT', 'Source row id', 'Source row id', 'Source row id', false, '', '', '', 'Active', '', '', '', '', ''],
      [
        'LEFTOVER_ID',
        'TEXT',
        'Leftover ID',
        'Leftover ID',
        'Leftover ID',
        false,
        '',
        '',
        '',
        'Active',
        '{"autoIncrement":{"padLength":0,"prefixByValue":{"fieldId":"LEFTOVER_KIND","map":{"entireDish":"LE-","partialDish":"LP-"}}}}',
        '',
        '',
        '',
        ''
      ]
    ];
    (inventoryConfig as any).setMockData(inventoryRows);

    const created = service.saveSubmissionWithId({
      formKey: 'Config: Delivery',
      language: 'EN',
      Q1: 'Alice',
      Q2_json: JSON.stringify([
        { LI1: 'Soup', LI2: 2 },
        { LI1: 'Salad', LI2: 3 }
      ]),
      Q3: [],
      Q4: 'ACME',
      __ckSaveMode: 'draft',
      __ckStatus: 'In progress'
    } as any);
    expect(created.success).toBe(true);

    const updated = service.saveSubmissionWithId({
      formKey: 'Config: Delivery',
      language: 'EN',
      id: created.meta.id,
      Q1: 'Alice Updated',
      Q2_json: JSON.stringify([
        { __ckRowId: 'Q2_0', LI1: 'Soup', LI2: 4 },
        { __ckRowId: 'Q2_1', LI1: 'Salad', LI2: 5 }
      ]),
      Q3: [],
      Q4: 'ACME',
      __ckSaveMode: 'draft',
      __ckStatus: 'In progress'
    } as any);
    expect(updated.success).toBe(true);
    expect(updated.meta?.submitEffects).toEqual(
      expect.objectContaining({
        configured: 1,
        executed: 1,
        created: 2,
        operation: 'update'
      })
    );

    const inventorySheet = ss.getSheetByName('Inventory Data');
    expect(inventorySheet).toBeDefined();
    expect(inventorySheet!.getLastRow()).toBe(3);
    const inventoryValues = inventorySheet!.getRange(1, 1, inventorySheet!.getLastRow(), inventorySheet!.getLastColumn()).getValues();
    const header = inventoryValues[0].map((value: any) => (value || '').toString().trim());
    const sourceNameCol = header.findIndex((value: string) => /\[SOURCE_NAME\]\s*$/.test(value));
    const leftoverQtyCol = header.findIndex((value: string) => /\[LEFTOVER_QTY\]\s*$/.test(value));
    const leftoverIdCol = header.findIndex((value: string) => /\[LEFTOVER_ID\]\s*$/.test(value));
    expect((inventoryValues[1][sourceNameCol] || '').toString()).toBe('Alice Updated');
    expect(Number(inventoryValues[1][leftoverQtyCol] || 0)).toBe(4);
    expect((inventoryValues[1][leftoverIdCol] || '').toString()).toBe('LE-1');
    expect(Number(inventoryValues[2][leftoverQtyCol] || 0)).toBe(5);
    expect((inventoryValues[2][leftoverIdCol] || '').toString()).toBe('LE-2');
  });

  test('saveSubmissionWithId can create produced entire-dish and partial leftovers on final close', () => {
    const mealProductionFormKey = 'Config: Test Meal Production Leftovers';
    const inventoryFormKey = 'Config: Produced Leftover Inventory';
    const dashboardSheet = ss.getSheetByName('Forms Dashboard') || ss.insertSheet('Forms Dashboard');
    const followupJson = JSON.stringify({
      submitEffects: [
        {
          id: 'captureProducedEntireDishLeftovers',
          type: 'createRecord',
          targetFormKey: inventoryFormKey,
          runOn: 'both',
          recordId: 'leftover::{{source.id}}::entire::{{parent.MEAL_TYPE}}',
          when: {
            fieldId: 'status',
            equals: ['Closed']
          },
          status: 'available',
          forEachLineItem: {
            groupId: 'MP_MEALS_REQUEST',
            subGroupPath: ['MP_TYPE_LI'],
            when: {
              all: [
                { fieldId: 'PREP_TYPE', equals: ['Cook'] },
                { fieldId: 'MP_LEFTOVER_PORTIONS_CAPTURE', greaterThan: 0 }
              ]
            }
          },
          values: {
            LEFTOVER_STATUS: 'available',
            LEFTOVER_KIND: 'Entire dish',
            LEFTOVER_PREP_TYPE: 'Entire dish',
            LEFTOVER_MEAL_TYPE: '{{parent.MEAL_TYPE}}',
            LEFTOVER_RECIPE: '{{row.RECIPE}}',
            LEFTOVER_PORTIONS: '{{parent.MP_LEFTOVER_PORTIONS_CAPTURE}}',
            LEFTOVER_EXP_DATE: '{{source.MP_EXP_DATE}}',
            LEFTOVER_SOURCE_FORM_KEY: mealProductionFormKey,
            LEFTOVER_SOURCE_RECORD_ID: '{{source.id}}',
            LEFTOVER_SOURCE_ROW_ID: '{{lineItem.rowId}}',
            LEFTOVER_INGREDIENTS_LI: '{{row.MP_INGREDIENTS_LI}}'
          }
        },
        {
          id: 'captureProducedLeftovers',
          type: 'createRecord',
          targetFormKey: inventoryFormKey,
          runOn: 'both',
          recordId: 'leftover::{{source.id}}::partial::{{lineItem.rowId}}',
          when: {
            fieldId: 'status',
            equals: ['Closed']
          },
          status: 'available',
          forEachLineItem: {
            groupId: 'MP_LEFTOVER_CAPTURE_LI',
            when: {
              fieldId: 'LEFTOVER_INGREDIENT',
              notEmpty: true
            }
          },
          values: {
            LEFTOVER_STATUS: 'available',
            LEFTOVER_KIND: 'Part dish',
            LEFTOVER_PREP_TYPE: 'Part dish',
            LEFTOVER_INGREDIENT: '{{row.LEFTOVER_INGREDIENT}}',
            LEFTOVER_CAT: '{{row.LEFTOVER_CAT}}',
            LEFTOVER_ALLERGEN: '{{row.LEFTOVER_ALLERGEN}}',
            LEFTOVER_QTY: '{{row.LEFTOVER_QTY}}',
            LEFTOVER_UNIT: '{{row.LEFTOVER_UNIT}}',
            LEFTOVER_EXP_DATE: '{{source.MP_EXP_DATE}}',
            LEFTOVER_SOURCE_FORM_KEY: mealProductionFormKey,
            LEFTOVER_SOURCE_RECORD_ID: '{{source.id}}',
            LEFTOVER_SOURCE_ROW_ID: '{{lineItem.rowId}}'
          }
        }
      ]
    });
    (dashboardSheet as any).setMockData([
      [],
      [],
      ['Form Title', 'Configuration Sheet Name', 'Destination Tab Name', 'Description', 'Form ID', 'Edit URL', 'Published URL', 'Follow-up Config (JSON)'],
      ['Meal Production', mealProductionFormKey, 'Test Meal Production Leftovers Data', 'Desc', '', '', '', followupJson],
      ['Leftover Inventory', inventoryFormKey, 'Produced Leftover Inventory Data', 'Desc', '', '', '', '']
    ]);

    const mealProductionConfig = ss.insertSheet(mealProductionFormKey);
    (mealProductionConfig as any).setMockData([
      ['ID', 'Type', 'Q En', 'Q Fr', 'Q Nl', 'Req', 'Opt En', 'Opt Fr', 'Opt Nl', 'Status', 'Config', 'OptionFilter', 'Validation', 'List View?', 'Edit'],
      ['MP_EXP_DATE', 'DATE', 'Expiration Date', 'Expiration Date', 'Expiration Date', false, '', '', '', 'Active', '', '', '', '', ''],
      ['MP_MEALS_REQUEST', 'LINE_ITEM_GROUP', 'Meals request', 'Meals request', 'Meals request', false, '', '', '', 'Active', 'REF:LineItems_MP_MEALS_REQUEST', '', '', '', ''],
      ['MP_LEFTOVER_CAPTURE_LI', 'LINE_ITEM_GROUP', 'Partial leftovers', 'Partial leftovers', 'Partial leftovers', false, '', '', '', 'Active', 'REF:LineItems_MP_LEFTOVER_CAPTURE_LI', '', '', '', '']
    ]);

    const mealsRequestSheet = ss.insertSheet('LineItems_MP_MEALS_REQUEST');
    (mealsRequestSheet as any).setMockData([
      ['ID', 'Type', 'Label EN', 'Label FR', 'Label NL', 'Req', 'Opt EN', 'Opt FR', 'Opt NL'],
      ['MEAL_TYPE', 'TEXT', 'Meal type', 'Meal type', 'Meal type', false, '', '', ''],
      ['MP_LEFTOVER_PORTIONS_CAPTURE', 'NUMBER', 'Leftover portions', 'Leftover portions', 'Leftover portions', false, '', '', '']
    ]);

    const partialLeftoversSheet = ss.insertSheet('LineItems_MP_LEFTOVER_CAPTURE_LI');
    (partialLeftoversSheet as any).setMockData([
      ['ID', 'Type', 'Label EN', 'Label FR', 'Label NL', 'Req', 'Opt EN', 'Opt FR', 'Opt NL'],
      ['LEFTOVER_INGREDIENT', 'TEXT', 'Ingredient', 'Ingredient', 'Ingredient', false, '', '', ''],
      ['LEFTOVER_CAT', 'TEXT', 'Category', 'Category', 'Category', false, '', '', ''],
      ['LEFTOVER_ALLERGEN', 'TEXT', 'Allergen', 'Allergen', 'Allergen', false, '', '', ''],
      ['LEFTOVER_QTY', 'NUMBER', 'Quantity', 'Quantity', 'Quantity', false, '', '', ''],
      ['LEFTOVER_UNIT', 'TEXT', 'Unit', 'Unit', 'Unit', false, '', '', '']
    ]);

    const inventoryConfig = ss.insertSheet(inventoryFormKey);
    (inventoryConfig as any).setMockData([
      ['ID', 'Type', 'Q En', 'Q Fr', 'Q Nl', 'Req', 'Opt En', 'Opt Fr', 'Opt Nl', 'Status', 'Config', 'OptionFilter', 'Validation', 'List View?', 'Edit'],
      ['LEFTOVER_STATUS', 'CHOICE', 'Status', 'Status', 'Status', true, 'available,used,expired', 'available,used,expired', 'available,used,expired', 'Active', '', '', '', '', ''],
      ['LEFTOVER_KIND', 'CHOICE', 'Kind', 'Kind', 'Kind', true, 'Entire dish,Part dish', 'Entire dish,Part dish', 'Entire dish,Part dish', 'Active', '', '', '', '', ''],
      ['LEFTOVER_PREP_TYPE', 'TEXT', 'Prep type', 'Prep type', 'Prep type', false, '', '', '', 'Active', '', '', '', '', ''],
      ['LEFTOVER_MEAL_TYPE', 'TEXT', 'Meal type', 'Meal type', 'Meal type', false, '', '', '', 'Active', '', '', '', '', ''],
      ['LEFTOVER_RECIPE', 'TEXT', 'Recipe', 'Recipe', 'Recipe', false, '', '', '', 'Active', '', '', '', '', ''],
      ['LEFTOVER_PORTIONS', 'NUMBER', 'Portions', 'Portions', 'Portions', false, '', '', '', 'Active', '', '', '', '', ''],
      ['LEFTOVER_INGREDIENT', 'TEXT', 'Ingredient', 'Ingredient', 'Ingredient', false, '', '', '', 'Active', '', '', '', '', ''],
      ['LEFTOVER_CAT', 'TEXT', 'Category', 'Category', 'Category', false, '', '', '', 'Active', '', '', '', '', ''],
      ['LEFTOVER_ALLERGEN', 'TEXT', 'Allergen', 'Allergen', 'Allergen', false, '', '', '', 'Active', '', '', '', '', ''],
      ['LEFTOVER_QTY', 'NUMBER', 'Quantity', 'Quantity', 'Quantity', false, '', '', '', 'Active', '', '', '', '', ''],
      ['LEFTOVER_UNIT', 'TEXT', 'Unit', 'Unit', 'Unit', false, '', '', '', 'Active', '', '', '', '', ''],
      ['LEFTOVER_EXP_DATE', 'DATE', 'Expiration date', 'Expiration date', 'Expiration date', false, '', '', '', 'Active', '', '', '', '', ''],
      ['LEFTOVER_SOURCE_FORM_KEY', 'TEXT', 'Source form key', 'Source form key', 'Source form key', false, '', '', '', 'Active', '', '', '', '', ''],
      ['LEFTOVER_SOURCE_RECORD_ID', 'TEXT', 'Source record id', 'Source record id', 'Source record id', false, '', '', '', 'Active', '', '', '', '', ''],
      ['LEFTOVER_SOURCE_ROW_ID', 'TEXT', 'Source row id', 'Source row id', 'Source row id', false, '', '', '', 'Active', '', '', '', '', ''],
      ['LEFTOVER_INGREDIENTS_LI', 'TEXT', 'Ingredients', 'Ingredients', 'Ingredients', false, '', '', '', 'Active', '', '', '', '', ''],
      [
        'LEFTOVER_ID',
        'TEXT',
        'Leftover ID',
        'Leftover ID',
        'Leftover ID',
        false,
        '',
        '',
        '',
        'Active',
        '{"autoIncrement":{"padLength":0,"prefixByValue":{"fieldId":"LEFTOVER_KIND","map":{"Entire dish":"LE-","Part dish":"LP-"}}}}',
        '',
        '',
        '',
        ''
      ]
    ]);

    const mealRows = [
      {
        __ckRowId: 'MEAL-1',
        MEAL_TYPE: 'Diabetic',
        MP_LEFTOVER_PORTIONS_CAPTURE: 2,
        MP_TYPE_LI: [
          {
            __ckRowId: 'COOK-1',
            PREP_TYPE: 'Cook',
            RECIPE: 'Curry & fish',
            MP_INGREDIENTS_LI: [{ ING: 'Salt', QTY: 1, UNIT: 'kg' }]
          }
        ]
      },
      {
        __ckRowId: 'MEAL-2',
        MEAL_TYPE: 'Standard',
        MP_LEFTOVER_PORTIONS_CAPTURE: 0,
        MP_TYPE_LI: [
          {
            __ckRowId: 'COOK-2',
            PREP_TYPE: 'Cook',
            RECIPE: 'Rice curry'
          }
        ]
      }
    ];
    const partialRows = [
      {
        __ckRowId: 'PART-1',
        LEFTOVER_INGREDIENT: 'Chicken wings',
        LEFTOVER_CAT: 'Animal protein Halal',
        LEFTOVER_ALLERGEN: 'None',
        LEFTOVER_QTY: 250,
        LEFTOVER_UNIT: 'gr'
      },
      {
        __ckRowId: 'PART-2',
        LEFTOVER_INGREDIENT: '',
        LEFTOVER_QTY: 0,
        LEFTOVER_UNIT: 'gr'
      }
    ];

    const closed = service.saveSubmissionWithId({
      formKey: mealProductionFormKey,
      language: 'EN',
      id: 'MP-CLOSE-1',
      MP_EXP_DATE: '2026-04-02',
      MP_MEALS_REQUEST_json: JSON.stringify(mealRows),
      MP_LEFTOVER_CAPTURE_LI_json: JSON.stringify(partialRows),
      __ckSaveMode: 'draft',
      __ckStatus: 'Closed'
    } as any);

    expect(closed.success).toBe(true);
    expect(closed.meta?.submitEffects).toEqual(
      expect.objectContaining({
        configured: 2,
        executed: 2,
        created: 2,
        operation: 'create'
      })
    );

    const inventorySheet = ss.getSheets().find((sheet: any) => sheet.getName() === 'Produced Leftover Inventory Data');
    expect(inventorySheet).toBeDefined();
    expect(inventorySheet!.getLastRow()).toBe(3);

    const inventoryValues = inventorySheet!.getRange(1, 1, inventorySheet!.getLastRow(), inventorySheet!.getLastColumn()).getValues();
    const header = inventoryValues[0].map((value: any) => (value || '').toString().trim());
    const rowObjects = inventoryValues.slice(1).map((row: any[]) =>
      Object.fromEntries(header.map((key: string, index: number) => [key.replace(/^.*\[(.+)\]\s*$/, '$1'), row[index]]))
    );

    const entireDish = rowObjects.find((entry: any) => (entry.LEFTOVER_KIND || '').toString() === 'Entire dish');
    const partialDish = rowObjects.find((entry: any) => (entry.LEFTOVER_KIND || '').toString() === 'Part dish');

    expect(entireDish).toBeDefined();
    const entireDishRow = entireDish as any;
    expect(entireDishRow.LEFTOVER_STATUS).toBe('available');
    expect(entireDishRow.LEFTOVER_PREP_TYPE).toBe('Entire dish');
    expect(entireDishRow.LEFTOVER_MEAL_TYPE).toBe('Diabetic');
    expect(entireDishRow.LEFTOVER_RECIPE).toBe('Curry & fish');
    expect(Number(entireDishRow.LEFTOVER_PORTIONS || 0)).toBe(2);
    expect(new Date(entireDishRow.LEFTOVER_EXP_DATE).getFullYear()).toBe(2026);
    expect(new Date(entireDishRow.LEFTOVER_EXP_DATE).getMonth()).toBe(3);
    expect(new Date(entireDishRow.LEFTOVER_EXP_DATE).getDate()).toBe(2);
    expect(entireDishRow.LEFTOVER_SOURCE_FORM_KEY).toBe(mealProductionFormKey);
    expect(entireDishRow.LEFTOVER_SOURCE_RECORD_ID).toBe('MP-CLOSE-1');
    expect(entireDishRow.LEFTOVER_SOURCE_ROW_ID).toBe('COOK-1');
    expect((entireDishRow.LEFTOVER_INGREDIENTS_LI || '').toString()).toBeTruthy();
    expect((entireDishRow.LEFTOVER_ID || '').toString()).toBe('LE-1');

    expect(partialDish).toBeDefined();
    const partialDishRow = partialDish as any;
    expect(partialDishRow.LEFTOVER_STATUS).toBe('available');
    expect(partialDishRow.LEFTOVER_PREP_TYPE).toBe('Part dish');
    expect(partialDishRow.LEFTOVER_INGREDIENT).toBe('Chicken wings');
    expect(partialDishRow.LEFTOVER_CAT).toBe('Animal protein Halal');
    expect(partialDishRow.LEFTOVER_ALLERGEN).toBe('None');
    expect(Number(partialDishRow.LEFTOVER_QTY || 0)).toBe(250);
    expect(partialDishRow.LEFTOVER_UNIT).toBe('gr');
    expect(new Date(partialDishRow.LEFTOVER_EXP_DATE).getFullYear()).toBe(2026);
    expect(new Date(partialDishRow.LEFTOVER_EXP_DATE).getMonth()).toBe(3);
    expect(new Date(partialDishRow.LEFTOVER_EXP_DATE).getDate()).toBe(2);
    expect(partialDishRow.LEFTOVER_SOURCE_FORM_KEY).toBe(mealProductionFormKey);
    expect(partialDishRow.LEFTOVER_SOURCE_RECORD_ID).toBe('MP-CLOSE-1');
    expect(partialDishRow.LEFTOVER_SOURCE_ROW_ID).toBe('PART-1');
    expect((partialDishRow.LEFTOVER_ID || '').toString()).toBe('LP-1');
  });

  test('saveSubmissionWithId can update downstream records from source line-item rows', () => {
    const dashboardSheet = ss.getSheetByName('Forms Dashboard') || ss.insertSheet('Forms Dashboard');
    const inventoryConfig = ss.insertSheet('Config: Inventory');
    const inventoryRows = [
      ['ID', 'Type', 'Q En', 'Q Fr', 'Q Nl', 'Req', 'Opt En', 'Opt Fr', 'Opt Nl', 'Status', 'Config', 'OptionFilter', 'Validation', 'List View?', 'Edit'],
      ['LEFTOVER_STATUS', 'TEXT', 'Status', 'Status', 'Status', false, '', '', '', 'Active', '', '', '', '', ''],
      ['LEFTOVER_USED_BY_RECORD_ID', 'TEXT', 'Used by record id', 'Used by record id', 'Used by record id', false, '', '', '', 'Active', '', '', '', '', '']
    ];
    (inventoryConfig as any).setMockData(inventoryRows);

    const followupJson = JSON.stringify({
      submitEffects: [
        {
          type: 'updateRecord',
          targetFormKey: 'Config: Inventory',
          runOn: 'update',
          recordId: '{{row.TARGET_RECORD_ID}}',
          status: 'used',
          forEachLineItem: {
            groupId: 'Q2',
            when: {
              fieldId: 'TARGET_RECORD_ID',
              notEmpty: true
            }
          },
          values: {
            LEFTOVER_STATUS: 'used',
            LEFTOVER_USED_BY_RECORD_ID: '{{source.id}}'
          }
        }
      ]
    });
    const dashboardData = [
      [],
      [],
      ['Form Title', 'Configuration Sheet Name', 'Destination Tab Name', 'Description', 'Form ID', 'Edit URL', 'Published URL', 'Follow-up Config (JSON)'],
      ['Delivery Form', 'Config: Delivery', 'Deliveries', 'Desc', '', '', '', followupJson],
      ['Leftover Inventory', 'Config: Inventory', 'Inventory Data', 'Desc', '', '', '', '']
    ];
    (dashboardSheet as any).setMockData(dashboardData);

    const seededTarget = service.saveSubmissionWithId({
      formKey: 'Config: Inventory',
      language: 'EN',
      LEFTOVER_STATUS: 'available',
      LEFTOVER_USED_BY_RECORD_ID: ''
    } as any);
    expect(seededTarget.success).toBe(true);
    const targetRecordId = (seededTarget.meta?.id || '').toString();
    expect(targetRecordId).toBeTruthy();

    const createdSource = service.saveSubmissionWithId({
      formKey: 'Config: Delivery',
      language: 'EN',
      id: 'REC-DEL-1',
      Q1: 'Alice',
      Q2_json: JSON.stringify([]),
      Q3: [],
      Q4: 'ACME',
      __ckSaveMode: 'draft',
      __ckStatus: 'In progress'
    } as any);
    expect(createdSource.success).toBe(true);

    const updated = service.saveSubmissionWithId({
      formKey: 'Config: Delivery',
      language: 'EN',
      id: 'REC-DEL-1',
      Q1: 'Alice',
      Q2_json: JSON.stringify([{ TARGET_RECORD_ID: targetRecordId }]),
      Q3: [],
      Q4: 'ACME',
      __ckSaveMode: 'draft',
      __ckStatus: 'In progress'
    } as any);
    expect(updated.success).toBe(true);
    expect(updated.meta?.submitEffects).toEqual(
      expect.objectContaining({
        configured: 1,
        executed: 1,
        created: 0,
        updated: 1,
        operation: 'update'
      })
    );

    const inventorySheet = ss.getSheetByName('Inventory Data');
    expect(inventorySheet).toBeDefined();
    const inventoryValues = inventorySheet!.getRange(1, 1, inventorySheet!.getLastRow(), inventorySheet!.getLastColumn()).getValues();
    const header = inventoryValues[0].map((value: any) => (value || '').toString().trim());
    const statusCol = header.findIndex((value: string) => /\[LEFTOVER_STATUS\]\s*$/.test(value));
    const usedByCol = header.findIndex((value: string) => /\[LEFTOVER_USED_BY_RECORD_ID\]\s*$/.test(value));
    expect((inventoryValues[1][statusCol] || '').toString()).toBe('used');
    expect((inventoryValues[1][usedByCol] || '').toString()).toBe('REC-DEL-1');
  });

  test('runDailyLifecycleRecompute applies config-driven date status transitions', () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-03-21T01:30:00+01:00'));
    try {
      const dashboardSheet = ss.getSheetByName('Forms Dashboard') || ss.insertSheet('Forms Dashboard');
      const lifecycleJson = JSON.stringify({
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
      const dashboardData = [
        [],
        [],
        ['Form Title', 'Configuration Sheet Name', 'Destination Tab Name', 'Description', 'Form ID', 'Edit URL', 'Published URL', 'Follow-up Config (JSON)'],
        ['Leftover Inventory', 'Config: Leftover Inventory', 'Leftover Inventory Data', 'Desc', '', '', '', lifecycleJson]
      ];
      (dashboardSheet as any).setMockData(dashboardData);

      const inventoryConfig = ss.getSheetByName('Config: Leftover Inventory') || ss.insertSheet('Config: Leftover Inventory');
      const inventoryRows = [
        ['ID', 'Type', 'Q En', 'Q Fr', 'Q Nl', 'Req', 'Opt En', 'Opt Fr', 'Opt Nl', 'Status', 'Config', 'OptionFilter', 'Validation', 'List View?', 'Edit'],
        ['LEFTOVER_STATUS', 'CHOICE', 'Leftover status', 'Leftover status', 'Leftover status', true, 'available,used,expired', 'available,used,expired', 'available,used,expired', 'Active', '', '', '', '', ''],
        ['LEFTOVER_EXP_DATE', 'DATE', 'Expiration date', 'Expiration date', 'Expiration date', false, '', '', '', 'Active', '', '', '', '', ''],
        ['LEFTOVER_NAME', 'TEXT', 'Name', 'Name', 'Name', false, '', '', '', 'Active', '', '', '', '', '']
      ];
      (inventoryConfig as any).setMockData(inventoryRows);

      const expired = service.saveSubmissionWithId({
        formKey: 'Config: Leftover Inventory',
        language: 'EN',
        LEFTOVER_STATUS: 'available',
        LEFTOVER_EXP_DATE: '2026-03-20',
        LEFTOVER_NAME: 'Soup'
      } as any);
      expect(expired.success).toBe(true);

      const stillAvailable = service.saveSubmissionWithId({
        formKey: 'Config: Leftover Inventory',
        language: 'EN',
        LEFTOVER_STATUS: 'available',
        LEFTOVER_EXP_DATE: '2026-03-21',
        LEFTOVER_NAME: 'Stew'
      } as any);
      expect(stillAvailable.success).toBe(true);

      const result = service.runDailyLifecycleRecompute();
      expect(result.success).toBe(true);
      expect(result.updatedForms).toBe(1);
      expect(result.updatedRecords).toBe(1);
      expect(result.errors).toEqual([]);

      const inventorySheet = ss.getSheetByName('Leftover Inventory Data');
      expect(inventorySheet).toBeDefined();
      const inventoryValues = inventorySheet!.getRange(1, 1, inventorySheet!.getLastRow(), inventorySheet!.getLastColumn()).getValues();
      const header = inventoryValues[0].map((value: any) => (value || '').toString().trim());
      const statusCol = header.findIndex((value: string) => /\[LEFTOVER_STATUS\]\s*$/.test(value));
      const expCol = header.findIndex((value: string) => /\[LEFTOVER_EXP_DATE\]\s*$/.test(value));
      expect((inventoryValues[1][expCol] || '').toString()).toContain('2026');
      expect((inventoryValues[1][statusCol] || '').toString()).toBe('expired');
      expect((inventoryValues[2][statusCol] || '').toString()).toBe('available');
    } finally {
      jest.useRealTimers();
    }
  });

  test('saveSubmissionWithId ignores __ckRecreateFromRecordId and updates the same record id', () => {
    const initial = service.saveSubmissionWithId({
      formKey: 'Config: Delivery',
      language: 'EN',
      id: 'REC-1',
      Q1: 'Alice',
      Q2_json: JSON.stringify([]),
      Q3: [],
      Q4: 'ACME',
      __ckSaveMode: 'draft',
      __ckStatus: 'In progress'
    } as any);
    expect(initial.success).toBe(true);

    const updated = service.saveSubmissionWithId({
      formKey: 'Config: Delivery',
      language: 'EN',
      id: 'REC-1',
      __ckRecreateFromRecordId: 'REC-1',
      Q1: 'Bob',
      Q2_json: JSON.stringify([]),
      Q3: [],
      Q4: 'ACME',
      __ckSaveMode: 'draft',
      __ckStatus: 'In progress'
    } as any);
    expect(updated.success).toBe(true);
    const updatedId = ((updated as any)?.meta?.id || '').toString();
    expect(updatedId).toBe('REC-1');

    const sheet = ss.getSheetByName('Deliveries');
    expect(sheet).toBeDefined();
    const values = sheet!.getRange(1, 1, sheet!.getLastRow(), sheet!.getLastColumn()).getValues();
    expect(sheet!.getLastRow()).toBe(2);

    const header = values[0].map((h: any) => (h || '').toString().trim());
    const idCol = header.findIndex((h: string) => h.toLowerCase() === 'record id');
    const q1Col = header.findIndex((h: string) => /\[Q1\]\s*$/.test(h));
    expect(idCol).toBeGreaterThanOrEqual(0);
    expect(q1Col).toBeGreaterThanOrEqual(0);
    expect((values[1][idCol] || '').toString()).toBe('REC-1');
    expect((values[1][q1Col] || '').toString()).toBe('Bob');
  });

  test('upsertInventoryReservation creates an active ledger row and updates reserved aggregate', () => {
    const { inventoryFormKey, ledgerFormKey } = setupInventoryReservationForms();
    const inventory = service.saveSubmissionWithId({
      formKey: inventoryFormKey,
      language: 'EN',
      LEFTOVER_ID: 'LE-1',
      LEFTOVER_STATUS: 'available',
      LEFTOVER_KIND: 'Entire dish',
      LEFTOVER_PORTIONS: 10,
      LEFTOVER_RESERVED_PORTIONS: 0
    } as any);
    expect(inventory.success).toBe(true);

    const result = service.upsertInventoryReservation({
      resourceFormKey: inventoryFormKey,
      resourceRecordId: (inventory.meta?.id || '').toString(),
      resourceItemId: 'LE-1',
      resourceKind: 'Entire dish',
      quantity: 3,
      sourceFormKey: 'Config: Delivery',
      sourceRecordId: 'REC-1',
      sourceParentGroupId: 'MP_MEALS_REQUEST',
      sourceParentRowId: 'ROW-1',
      ledgerFormKey
    });

    expect(result.success).toBe(true);
    expect(result.availability?.reservedQuantity).toBe(3);
    expect(result.availability?.freeQuantity).toBe(7);
    const updatedInventory = service.fetchSubmissionById(inventoryFormKey, (inventory.meta?.id || '').toString());
    expect((updatedInventory?.values as any)?.LEFTOVER_RESERVED_PORTIONS).toBe(3);
    const reservation = service.fetchSubmissionById(ledgerFormKey, (result.reservationId || '').toString());
    expect(reservation).not.toBeNull();
    expect((reservation?.values as any)?.STATUS).toBe('active');
    expect((reservation?.values as any)?.RESERVED_QTY).toBe(3);
  });

  test('upsertInventoryReservation rejects over-reservation and returns fresh availability', () => {
    const { inventoryFormKey, ledgerFormKey } = setupInventoryReservationForms();
    const inventory = service.saveSubmissionWithId({
      formKey: inventoryFormKey,
      language: 'EN',
      LEFTOVER_ID: 'LE-2',
      LEFTOVER_STATUS: 'available',
      LEFTOVER_KIND: 'Entire dish',
      LEFTOVER_PORTIONS: 10,
      LEFTOVER_RESERVED_PORTIONS: 0
    } as any);
    expect(inventory.success).toBe(true);

    const first = service.upsertInventoryReservation({
      resourceFormKey: inventoryFormKey,
      resourceRecordId: (inventory.meta?.id || '').toString(),
      resourceItemId: 'LE-2',
      resourceKind: 'Entire dish',
      quantity: 7,
      sourceFormKey: 'Config: Delivery',
      sourceRecordId: 'REC-1',
      sourceParentGroupId: 'MP_MEALS_REQUEST',
      sourceParentRowId: 'ROW-1',
      ledgerFormKey
    });
    expect(first.success).toBe(true);

    const second = service.upsertInventoryReservation({
      resourceFormKey: inventoryFormKey,
      resourceRecordId: (inventory.meta?.id || '').toString(),
      resourceItemId: 'LE-2',
      resourceKind: 'Entire dish',
      quantity: 4,
      sourceFormKey: 'Config: Delivery',
      sourceRecordId: 'REC-2',
      sourceParentGroupId: 'MP_MEALS_REQUEST',
      sourceParentRowId: 'ROW-2',
      ledgerFormKey
    });
    expect(second.success).toBe(false);
    expect(second.conflict).toBe(true);
    expect(second.availability?.reservedQuantity).toBe(7);
    expect(second.availability?.freeQuantity).toBe(3);
  });

  test('upsertInventoryReservation releases a reservation when quantity becomes zero', () => {
    const { inventoryFormKey, ledgerFormKey } = setupInventoryReservationForms();
    const inventory = service.saveSubmissionWithId({
      formKey: inventoryFormKey,
      language: 'EN',
      LEFTOVER_ID: 'LP-1',
      LEFTOVER_STATUS: 'available',
      LEFTOVER_KIND: 'Part dish',
      LEFTOVER_QTY: 250,
      LEFTOVER_UNIT: 'gr',
      LEFTOVER_RESERVED_QTY: 0
    } as any);
    expect(inventory.success).toBe(true);

    const reserved = service.upsertInventoryReservation({
      resourceFormKey: inventoryFormKey,
      resourceRecordId: (inventory.meta?.id || '').toString(),
      resourceItemId: 'LP-1',
      resourceKind: 'Part dish',
      quantity: 125,
      unit: 'gr',
      sourceFormKey: 'Config: Delivery',
      sourceRecordId: 'REC-3',
      sourceParentGroupId: 'MP_MEALS_REQUEST',
      sourceParentRowId: 'ROW-3',
      ledgerFormKey
    });
    expect(reserved.success).toBe(true);

    const released = service.upsertInventoryReservation({
      resourceFormKey: inventoryFormKey,
      resourceRecordId: (inventory.meta?.id || '').toString(),
      resourceItemId: 'LP-1',
      resourceKind: 'Part dish',
      quantity: 0,
      unit: 'gr',
      sourceFormKey: 'Config: Delivery',
      sourceRecordId: 'REC-3',
      sourceParentGroupId: 'MP_MEALS_REQUEST',
      sourceParentRowId: 'ROW-3',
      ledgerFormKey
    });
    expect(released.success).toBe(true);
    expect(released.released).toBe(true);
    expect(released.availability?.reservedQuantity).toBe(0);
    expect(released.availability?.freeQuantity).toBe(250);
    const updatedInventory = service.fetchSubmissionById(inventoryFormKey, (inventory.meta?.id || '').toString());
    expect((updatedInventory?.values as any)?.LEFTOVER_RESERVED_QTY).toBe(0);
    const reservation = service.fetchSubmissionById(ledgerFormKey, (reserved.reservationId || '').toString());
    expect((reservation?.values as any)?.STATUS).toBe('released');
  });

  test('reconcileInventoryReservations consumes reserved quantity and closes active ledger rows', () => {
    const { inventoryFormKey, ledgerFormKey } = setupInventoryReservationForms();
    const inventory = service.saveSubmissionWithId({
      formKey: inventoryFormKey,
      language: 'EN',
      LEFTOVER_ID: 'LE-3',
      LEFTOVER_STATUS: 'available',
      LEFTOVER_KIND: 'Entire dish',
      LEFTOVER_PORTIONS: 10,
      LEFTOVER_RESERVED_PORTIONS: 0,
      LEFTOVER_USED_BY_FORM_KEY: '',
      LEFTOVER_USED_BY_RECORD_ID: ''
    } as any);
    expect(inventory.success).toBe(true);

    const reserved = service.upsertInventoryReservation({
      resourceFormKey: inventoryFormKey,
      resourceRecordId: (inventory.meta?.id || '').toString(),
      resourceItemId: 'LE-3',
      resourceKind: 'Entire dish',
      quantity: 4,
      sourceFormKey: 'Config: Delivery',
      sourceRecordId: 'REC-4',
      sourceParentGroupId: 'MP_MEALS_REQUEST',
      sourceParentRowId: 'ROW-4',
      ledgerFormKey
    });
    expect(reserved.success).toBe(true);

    const reconciled = service.reconcileInventoryReservations({
      sourceFormKey: 'Config: Delivery',
      sourceRecordId: 'REC-4',
      ledgerFormKey
    });
    expect(reconciled.success).toBe(true);
    expect(reconciled.reconciledReservations).toBe(1);
    const updatedInventory = service.fetchSubmissionById(inventoryFormKey, (inventory.meta?.id || '').toString());
    expect((updatedInventory?.values as any)?.LEFTOVER_PORTIONS).toBe(6);
    expect((updatedInventory?.values as any)?.LEFTOVER_RESERVED_PORTIONS).toBe(0);
    expect((updatedInventory?.values as any)?.LEFTOVER_STATUS).toBe('available');
    expect((updatedInventory?.values as any)?.LEFTOVER_USED_BY_FORM_KEY).toBe('Config: Delivery');
    expect((updatedInventory?.values as any)?.LEFTOVER_USED_BY_RECORD_ID).toBe('REC-4');
    const reservation = service.fetchSubmissionById(ledgerFormKey, (reserved.reservationId || '').toString());
    expect((reservation?.values as any)?.STATUS).toBe('consumed');
  });

  test('reconcileInventoryReservations heals stale ledger resource record ids using resource item id fallback', () => {
    const { inventoryFormKey, ledgerFormKey } = setupInventoryReservationForms();
    const inventory = service.saveSubmissionWithId({
      formKey: inventoryFormKey,
      language: 'EN',
      LEFTOVER_ID: 'LE-HEAL-1',
      LEFTOVER_STATUS: 'available',
      LEFTOVER_KIND: 'Entire dish',
      LEFTOVER_PORTIONS: 10,
      LEFTOVER_RESERVED_PORTIONS: 0,
      LEFTOVER_USED_BY_FORM_KEY: '',
      LEFTOVER_USED_BY_RECORD_ID: ''
    } as any);
    expect(inventory.success).toBe(true);

    const reserved = service.upsertInventoryReservation({
      resourceFormKey: inventoryFormKey,
      resourceRecordId: (inventory.meta?.id || '').toString(),
      resourceItemId: 'LE-HEAL-1',
      resourceKind: 'Entire dish',
      quantity: 4,
      sourceFormKey: 'Config: Delivery',
      sourceRecordId: 'REC-HEAL-1',
      sourceParentGroupId: 'MP_MEALS_REQUEST',
      sourceParentRowId: 'ROW-HEAL-1',
      ledgerFormKey
    });
    expect(reserved.success).toBe(true);

    const ledgerContext = (service as any).getFormContextLite(ledgerFormKey);
    const staleReservationSave = (service as any).saveInternalRecord({
      context: ledgerContext,
      recordId: (reserved.reservationId || '').toString(),
      language: 'EN',
      status: 'active',
      values: {
        ...(service.fetchSubmissionById(ledgerFormKey, (reserved.reservationId || '').toString())?.values || {}),
        RESOURCE_RECORD_ID: 'leftover.'
      },
      auditAction: 'test:corruptReservationRecordId'
    });
    expect(staleReservationSave.success).toBe(true);

    const reconciled = service.reconcileInventoryReservations({
      sourceFormKey: 'Config: Delivery',
      sourceRecordId: 'REC-HEAL-1',
      ledgerFormKey
    });
    expect(reconciled.success).toBe(true);
    expect(reconciled.reconciledReservations).toBe(1);

    const updatedInventory = service.fetchSubmissionById(inventoryFormKey, (inventory.meta?.id || '').toString());
    expect((updatedInventory?.values as any)?.LEFTOVER_PORTIONS).toBe(6);
    expect((updatedInventory?.values as any)?.LEFTOVER_RESERVED_PORTIONS).toBe(0);

    const healedReservation = service.fetchSubmissionById(ledgerFormKey, (reserved.reservationId || '').toString());
    expect((healedReservation?.values as any)?.STATUS).toBe('consumed');
    expect((healedReservation?.values as any)?.RESOURCE_RECORD_ID).toBe((inventory.meta?.id || '').toString());
  });

  test('releaseInventoryReservations releases reserved quantity without consuming inventory', () => {
    const { inventoryFormKey, ledgerFormKey } = setupInventoryReservationForms();
    const inventory = service.saveSubmissionWithId({
      formKey: inventoryFormKey,
      language: 'EN',
      LEFTOVER_ID: 'LE-REL',
      LEFTOVER_STATUS: 'available',
      LEFTOVER_KIND: 'Entire dish',
      LEFTOVER_PORTIONS: 10,
      LEFTOVER_RESERVED_PORTIONS: 0
    } as any);
    expect(inventory.success).toBe(true);

    const reserved = service.upsertInventoryReservation({
      resourceFormKey: inventoryFormKey,
      resourceRecordId: (inventory.meta?.id || '').toString(),
      resourceItemId: 'LE-REL',
      resourceKind: 'Entire dish',
      quantity: 4,
      sourceFormKey: 'Config: Delivery',
      sourceRecordId: 'REC-REL',
      sourceParentGroupId: 'MP_MEALS_REQUEST',
      sourceParentRowId: 'ROW-REL',
      ledgerFormKey
    });
    expect(reserved.success).toBe(true);

    const released = service.releaseInventoryReservations({
      sourceFormKey: 'Config: Delivery',
      sourceRecordId: 'REC-REL',
      ledgerFormKey
    });
    expect(released.success).toBe(true);
    const updatedInventory = service.fetchSubmissionById(inventoryFormKey, (inventory.meta?.id || '').toString());
    expect((updatedInventory?.values as any)?.LEFTOVER_PORTIONS).toBe(10);
    expect((updatedInventory?.values as any)?.LEFTOVER_RESERVED_PORTIONS).toBe(0);
    const reservation = service.fetchSubmissionById(ledgerFormKey, (reserved.reservationId || '').toString());
    expect((reservation?.values as any)?.STATUS).toBe('released');
  });

  test('saveSubmissionWithId reconciles active reservations on final submit and keeps partially consumed inventory available', () => {
    const { inventoryFormKey, ledgerFormKey } = setupInventoryReservationForms();
    const dashboardSheet = ss.getSheetByName('Forms Dashboard') || ss.insertSheet('Forms Dashboard');
    const followupJson = JSON.stringify({
      statusTransitions: { onClose: 'Closed' },
      reservationLifecycle: {
        ledgerFormKey,
        reconcileOnFinalSubmit: true
      }
    });
    (dashboardSheet as any).setMockData([
      [],
      [],
      ['Form Title', 'Configuration Sheet Name', 'Destination Tab Name', 'Description', 'Form ID', 'Edit URL', 'Published URL', 'Follow-up Config (JSON)'],
      ['Delivery Form', 'Config: Delivery', 'Deliveries', 'Desc', '', '', '', followupJson],
      ['Leftover Inventory', inventoryFormKey, 'Test Leftover Inventory Data', 'Desc', '', '', '', ''],
      ['Inventory Reservation Ledger', ledgerFormKey, 'Test Inventory Reservation Ledger Data', 'Desc', '', '', '', '']
    ]);

    const source = service.saveSubmissionWithId({
      formKey: 'Config: Delivery',
      language: 'EN',
      id: 'REC-FINAL-1',
      Q1: 'Alice',
      Q2_json: JSON.stringify([]),
      Q3: [],
      Q4: 'ACME',
      __ckSaveMode: 'draft',
      __ckStatus: 'In progress'
    } as any);
    expect(source.success).toBe(true);

    const inventory = service.saveSubmissionWithId({
      formKey: inventoryFormKey,
      language: 'EN',
      LEFTOVER_ID: 'LE-FINAL-1',
      LEFTOVER_STATUS: 'available',
      LEFTOVER_KIND: 'Entire dish',
      LEFTOVER_PORTIONS: 10,
      LEFTOVER_RESERVED_PORTIONS: 0
    } as any);
    expect(inventory.success).toBe(true);

    const reserved = service.upsertInventoryReservation({
      resourceFormKey: inventoryFormKey,
      resourceRecordId: (inventory.meta?.id || '').toString(),
      resourceItemId: 'LE-FINAL-1',
      resourceKind: 'Entire dish',
      quantity: 4,
      sourceFormKey: 'Config: Delivery',
      sourceRecordId: 'REC-FINAL-1',
      sourceParentGroupId: 'MP_MEALS_REQUEST',
      sourceParentRowId: 'ROW-FINAL-1',
      ledgerFormKey
    });
    expect(reserved.success).toBe(true);

    const closeRes = service.saveSubmissionWithId({
      formKey: 'Config: Delivery',
      language: 'EN',
      id: 'REC-FINAL-1',
      Q1: 'Alice',
      Q2_json: JSON.stringify([]),
      Q3: [],
      Q4: 'ACME',
      __ckSaveMode: 'draft',
      __ckStatus: 'Closed'
    } as any);
    expect(closeRes.success).toBe(true);
    expect((closeRes.meta as any)?.reservationReconciliation?.success).toBe(true);
    expect((closeRes.meta as any)?.reservationReconciliation?.reconciledReservations).toBe(1);

    const updatedInventory = service.fetchSubmissionById(inventoryFormKey, (inventory.meta?.id || '').toString());
    expect((updatedInventory?.values as any)?.LEFTOVER_PORTIONS).toBe(6);
    expect((updatedInventory?.values as any)?.LEFTOVER_RESERVED_PORTIONS).toBe(0);
    expect((updatedInventory?.values as any)?.LEFTOVER_STATUS).toBe('available');
    const reservation = service.fetchSubmissionById(ledgerFormKey, (reserved.reservationId || '').toString());
    expect((reservation?.values as any)?.STATUS).toBe('consumed');
  });

  test('saveSubmissionWithId reconciles active reservations on final submit and marks fully consumed inventory used', () => {
    const { inventoryFormKey, ledgerFormKey } = setupInventoryReservationForms();
    const dashboardSheet = ss.getSheetByName('Forms Dashboard') || ss.insertSheet('Forms Dashboard');
    const followupJson = JSON.stringify({
      statusTransitions: { onClose: 'Closed' },
      reservationLifecycle: {
        ledgerFormKey,
        reconcileOnFinalSubmit: true
      }
    });
    (dashboardSheet as any).setMockData([
      [],
      [],
      ['Form Title', 'Configuration Sheet Name', 'Destination Tab Name', 'Description', 'Form ID', 'Edit URL', 'Published URL', 'Follow-up Config (JSON)'],
      ['Delivery Form', 'Config: Delivery', 'Deliveries', 'Desc', '', '', '', followupJson],
      ['Leftover Inventory', inventoryFormKey, 'Test Leftover Inventory Data', 'Desc', '', '', '', ''],
      ['Inventory Reservation Ledger', ledgerFormKey, 'Test Inventory Reservation Ledger Data', 'Desc', '', '', '', '']
    ]);

    const source = service.saveSubmissionWithId({
      formKey: 'Config: Delivery',
      language: 'EN',
      id: 'REC-FINAL-2',
      Q1: 'Alice',
      Q2_json: JSON.stringify([]),
      Q3: [],
      Q4: 'ACME',
      __ckSaveMode: 'draft',
      __ckStatus: 'In progress'
    } as any);
    expect(source.success).toBe(true);

    const inventory = service.saveSubmissionWithId({
      formKey: inventoryFormKey,
      language: 'EN',
      LEFTOVER_ID: 'LE-FINAL-2',
      LEFTOVER_STATUS: 'available',
      LEFTOVER_KIND: 'Entire dish',
      LEFTOVER_PORTIONS: 4,
      LEFTOVER_RESERVED_PORTIONS: 0
    } as any);
    expect(inventory.success).toBe(true);

    const reserved = service.upsertInventoryReservation({
      resourceFormKey: inventoryFormKey,
      resourceRecordId: (inventory.meta?.id || '').toString(),
      resourceItemId: 'LE-FINAL-2',
      resourceKind: 'Entire dish',
      quantity: 4,
      sourceFormKey: 'Config: Delivery',
      sourceRecordId: 'REC-FINAL-2',
      sourceParentGroupId: 'MP_MEALS_REQUEST',
      sourceParentRowId: 'ROW-FINAL-2',
      ledgerFormKey
    });
    expect(reserved.success).toBe(true);

    const closeRes = service.saveSubmissionWithId({
      formKey: 'Config: Delivery',
      language: 'EN',
      id: 'REC-FINAL-2',
      Q1: 'Alice',
      Q2_json: JSON.stringify([]),
      Q3: [],
      Q4: 'ACME',
      __ckSaveMode: 'draft',
      __ckStatus: 'Closed'
    } as any);
    expect(closeRes.success).toBe(true);
    expect((closeRes.meta as any)?.reservationReconciliation?.success).toBe(true);

    const updatedInventory = service.fetchSubmissionById(inventoryFormKey, (inventory.meta?.id || '').toString());
    expect((updatedInventory?.values as any)?.LEFTOVER_PORTIONS).toBe(0);
    expect((updatedInventory?.values as any)?.LEFTOVER_RESERVED_PORTIONS).toBe(0);
    expect((updatedInventory?.values as any)?.LEFTOVER_STATUS).toBe('used');
    const reservation = service.fetchSubmissionById(ledgerFormKey, (reserved.reservationId || '').toString());
    expect((reservation?.values as any)?.STATUS).toBe('consumed');
  });

  test('reconcileInventoryReservations can consume matched reservations and release stale ones in one batch', () => {
    const { inventoryFormKey, ledgerFormKey } = setupInventoryReservationForms();
    const dashboardSheet = ss.getSheetByName('Forms Dashboard') || ss.insertSheet('Forms Dashboard');
    const followupJson = JSON.stringify({
      statusTransitions: { onClose: 'Closed' },
      reservationLifecycle: {
        ledgerFormKey,
        reconcileOnFinalSubmit: true
      }
    });
    (dashboardSheet as any).setMockData([
      [],
      [],
      ['Form Title', 'Configuration Sheet Name', 'Destination Tab Name', 'Description', 'Form ID', 'Edit URL', 'Published URL', 'Follow-up Config (JSON)'],
      ['Delivery Form', 'Config: Delivery', 'Deliveries', 'Desc', '', '', '', followupJson],
      ['Leftover Inventory', inventoryFormKey, 'Test Leftover Inventory Data', 'Desc', '', '', '', ''],
      ['Inventory Reservation Ledger', ledgerFormKey, 'Test Inventory Reservation Ledger Data', 'Desc', '', '', '', '']
    ]);
    const deliveryConfigSheet = ss.getSheetByName('Config: Delivery');
    const deliveryRows = deliveryConfigSheet!.getRange(1, 1, deliveryConfigSheet!.getLastRow(), deliveryConfigSheet!.getLastColumn()).getValues();
    deliveryRows.push([
      'MP_MEALS_REQUEST',
      'LINE_ITEM_GROUP',
      'Meals request',
      'Meals request',
      'Meals request',
      true,
      '',
      '',
      '',
      'Active',
      'REF:LineItems_MP_MEALS_REQUEST',
      '',
      '',
      '',
      ''
    ]);
    (deliveryConfigSheet as any).setMockData(deliveryRows);
    const mealsRequestSheet = ss.getSheetByName('LineItems_MP_MEALS_REQUEST') || ss.insertSheet('LineItems_MP_MEALS_REQUEST');
    (mealsRequestSheet as any).setMockData([
      ['ID', 'Type', 'Label EN', 'Label FR', 'Label NL', 'Req', 'Opt EN', 'Opt FR', 'Opt NL'],
      ['MEAL_TYPE', 'TEXT', 'Meal type', 'Meal type', 'Meal type', true, '', '', '']
    ]);

    const mealRows = [
      {
        __ckRowId: 'MEAL-1',
        MEAL_TYPE: 'Diabetic',
        MP_TYPE_LI: [
          {
            __ckRowId: 'OUT-1',
            LEFTOVER_ID: 'LE-FINAL-3A'
          }
        ]
      }
    ];

    const source = service.saveSubmissionWithId({
      formKey: 'Config: Delivery',
      language: 'EN',
      id: 'REC-FINAL-3',
      Q1: 'Alice',
      Q2_json: JSON.stringify([]),
      Q3: [],
      Q4: 'ACME',
      __ckSaveMode: 'draft',
      __ckStatus: 'In progress'
    } as any);
    expect(source.success).toBe(true);
    const sourceContext = (service as any).getFormContextLite('Config: Delivery');
    const patchResult = (service as any).saveInternalRecord({
      context: sourceContext,
      recordId: 'REC-FINAL-3',
      language: 'EN',
      status: 'In progress',
      values: {
        Q1: 'Alice',
        Q2_json: JSON.stringify([]),
        Q3: [],
        Q4: 'ACME',
        MP_MEALS_REQUEST: mealRows
      },
      auditAction: 'test:seedMixedReservationSource'
    });
    expect(patchResult.success).toBe(true);
    const savedSource = service.fetchSubmissionById('Config: Delivery', 'REC-FINAL-3');
    expect((savedSource?.values as any)?.MP_MEALS_REQUEST).toEqual(mealRows);

    const inventoryA = service.saveSubmissionWithId({
      formKey: inventoryFormKey,
      language: 'EN',
      LEFTOVER_ID: 'LE-FINAL-3A',
      LEFTOVER_STATUS: 'available',
      LEFTOVER_KIND: 'Entire dish',
      LEFTOVER_PORTIONS: 5,
      LEFTOVER_RESERVED_PORTIONS: 0
    } as any);
    const inventoryB = service.saveSubmissionWithId({
      formKey: inventoryFormKey,
      language: 'EN',
      LEFTOVER_ID: 'LE-FINAL-3B',
      LEFTOVER_STATUS: 'available',
      LEFTOVER_KIND: 'Entire dish',
      LEFTOVER_PORTIONS: 7,
      LEFTOVER_RESERVED_PORTIONS: 0
    } as any);
    expect(inventoryA.success).toBe(true);
    expect(inventoryB.success).toBe(true);

    const reservedA = service.upsertInventoryReservation({
      resourceFormKey: inventoryFormKey,
      resourceRecordId: (inventoryA.meta?.id || '').toString(),
      resourceItemId: 'LE-FINAL-3A',
      resourceKind: 'Entire dish',
      quantity: 2,
      sourceFormKey: 'Config: Delivery',
      sourceRecordId: 'REC-FINAL-3',
      sourceParentGroupId: 'MP_MEALS_REQUEST',
      sourceParentRowId: 'MEAL-1',
      sourceOutputGroupId: 'MP_TYPE_LI',
      sourceOutputKeyFieldId: 'LEFTOVER_ID',
      ledgerFormKey
    });
    const reservedB = service.upsertInventoryReservation({
      resourceFormKey: inventoryFormKey,
      resourceRecordId: (inventoryB.meta?.id || '').toString(),
      resourceItemId: 'LE-FINAL-3B',
      resourceKind: 'Entire dish',
      quantity: 3,
      sourceFormKey: 'Config: Delivery',
      sourceRecordId: 'REC-FINAL-3',
      sourceParentGroupId: 'MP_MEALS_REQUEST',
      sourceParentRowId: 'MEAL-1',
      sourceOutputGroupId: 'MP_TYPE_LI',
      sourceOutputKeyFieldId: 'LEFTOVER_ID',
      ledgerFormKey
    });
    expect(reservedA.success).toBe(true);
    expect(reservedB.success).toBe(true);

    const reconcileRes = service.reconcileInventoryReservations({
      sourceFormKey: 'Config: Delivery',
      sourceRecordId: 'REC-FINAL-3',
      ledgerFormKey
    });
    expect(reconcileRes.success).toBe(true);
    expect(reconcileRes.consumedReservations).toBe(1);
    expect(reconcileRes.releasedReservations).toBe(1);

    const updatedInventoryA = service.fetchSubmissionById(inventoryFormKey, (inventoryA.meta?.id || '').toString());
    const updatedInventoryB = service.fetchSubmissionById(inventoryFormKey, (inventoryB.meta?.id || '').toString());
    expect((updatedInventoryA?.values as any)?.LEFTOVER_PORTIONS).toBe(3);
    expect((updatedInventoryA?.values as any)?.LEFTOVER_RESERVED_PORTIONS).toBe(0);
    expect((updatedInventoryA?.values as any)?.LEFTOVER_STATUS).toBe('available');
    expect((updatedInventoryB?.values as any)?.LEFTOVER_PORTIONS).toBe(7);
    expect((updatedInventoryB?.values as any)?.LEFTOVER_RESERVED_PORTIONS).toBe(0);
    expect((updatedInventoryB?.values as any)?.LEFTOVER_STATUS).toBe('available');

    const reservationA = service.fetchSubmissionById(ledgerFormKey, (reservedA.reservationId || '').toString());
    const reservationB = service.fetchSubmissionById(ledgerFormKey, (reservedB.reservationId || '').toString());
    expect((reservationA?.values as any)?.STATUS).toBe('consumed');
    expect((reservationB?.values as any)?.STATUS).toBe('released');
  });

  test('triggerFollowupAction CLOSE_RECORD reconciles active reservations', () => {
    const { inventoryFormKey, ledgerFormKey } = setupInventoryReservationForms();
    const dashboardSheet = ss.getSheetByName('Forms Dashboard') || ss.insertSheet('Forms Dashboard');
    const followupJson = JSON.stringify({
      statusTransitions: { onClose: 'Closed' },
      reservationLifecycle: {
        ledgerFormKey,
        reconcileOnFinalSubmit: true
      }
    });
    (dashboardSheet as any).setMockData([
      [],
      [],
      ['Form Title', 'Configuration Sheet Name', 'Destination Tab Name', 'Description', 'Form ID', 'Edit URL', 'Published URL', 'Follow-up Config (JSON)'],
      ['Delivery Form', 'Config: Delivery', 'Deliveries', 'Desc', '', '', '', followupJson],
      ['Leftover Inventory', inventoryFormKey, 'Test Leftover Inventory Data', 'Desc', '', '', '', ''],
      ['Inventory Reservation Ledger', ledgerFormKey, 'Test Inventory Reservation Ledger Data', 'Desc', '', '', '', '']
    ]);

    service.saveSubmissionWithId({
      formKey: 'Config: Delivery',
      language: 'EN',
      id: 'REC-CLOSE-1',
      Q1: 'Alice',
      Q2_json: JSON.stringify([]),
      Q3: [],
      Q4: 'ACME',
      __ckSaveMode: 'draft',
      __ckStatus: 'In progress'
    } as any);

    const inventory = service.saveSubmissionWithId({
      formKey: inventoryFormKey,
      language: 'EN',
      LEFTOVER_ID: 'LE-CLOSE-1',
      LEFTOVER_STATUS: 'available',
      LEFTOVER_KIND: 'Entire dish',
      LEFTOVER_PORTIONS: 5,
      LEFTOVER_RESERVED_PORTIONS: 0
    } as any);
    expect(inventory.success).toBe(true);

    const reserved = service.upsertInventoryReservation({
      resourceFormKey: inventoryFormKey,
      resourceRecordId: (inventory.meta?.id || '').toString(),
      resourceItemId: 'LE-CLOSE-1',
      resourceKind: 'Entire dish',
      quantity: 2,
      sourceFormKey: 'Config: Delivery',
      sourceRecordId: 'REC-CLOSE-1',
      sourceParentGroupId: 'MP_MEALS_REQUEST',
      sourceParentRowId: 'ROW-CLOSE-1',
      ledgerFormKey
    });
    expect(reserved.success).toBe(true);

    const closeResult = service.triggerFollowupAction('Config: Delivery', 'REC-CLOSE-1', 'CLOSE_RECORD');
    expect(closeResult.success).toBe(true);
    expect((closeResult as any).reservationReconciliation?.success).toBe(true);

    const updatedInventory = service.fetchSubmissionById(inventoryFormKey, (inventory.meta?.id || '').toString());
    expect((updatedInventory?.values as any)?.LEFTOVER_PORTIONS).toBe(3);
    expect((updatedInventory?.values as any)?.LEFTOVER_RESERVED_PORTIONS).toBe(0);
    expect((updatedInventory?.values as any)?.LEFTOVER_STATUS).toBe('available');
    const reservation = service.fetchSubmissionById(ledgerFormKey, (reserved.reservationId || '').toString());
    expect((reservation?.values as any)?.STATUS).toBe('consumed');
  });

  test('triggerFollowupActions batch reconciles reservations when CLOSE_RECORD succeeds', () => {
    const { inventoryFormKey, ledgerFormKey } = setupInventoryReservationForms();
    const dashboardSheet = ss.getSheetByName('Forms Dashboard') || ss.insertSheet('Forms Dashboard');
    const followupJson = JSON.stringify({
      pdfTemplateId: { EN: 'pdf-template-en' },
      emailTemplateId: { EN: 'email-template-en' },
      emailRecipients: ['ops@example.com'],
      statusTransitions: { onClose: 'Closed' },
      reservationLifecycle: {
        ledgerFormKey,
        reconcileOnFinalSubmit: true
      }
    });
    (dashboardSheet as any).setMockData([
      [],
      [],
      ['Form Title', 'Configuration Sheet Name', 'Destination Tab Name', 'Description', 'Form ID', 'Edit URL', 'Published URL', 'Follow-up Config (JSON)'],
      ['Delivery Form', 'Config: Delivery', 'Deliveries', 'Desc', '', '', '', followupJson],
      ['Leftover Inventory', inventoryFormKey, 'Test Leftover Inventory Data', 'Desc', '', '', '', ''],
      ['Inventory Reservation Ledger', ledgerFormKey, 'Test Inventory Reservation Ledger Data', 'Desc', '', '', '', '']
    ]);

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
      id: 'REC-CLOSE-2',
      Q1: 'Alice',
      Q2_json: JSON.stringify([]),
      Q3: [],
      Q4: 'ACME',
      __ckSaveMode: 'draft',
      __ckStatus: 'In progress'
    } as any);

    const inventory = service.saveSubmissionWithId({
      formKey: inventoryFormKey,
      language: 'EN',
      LEFTOVER_ID: 'LE-CLOSE-2',
      LEFTOVER_STATUS: 'available',
      LEFTOVER_KIND: 'Entire dish',
      LEFTOVER_PORTIONS: 4,
      LEFTOVER_RESERVED_PORTIONS: 0
    } as any);
    expect(inventory.success).toBe(true);

    const reserved = service.upsertInventoryReservation({
      resourceFormKey: inventoryFormKey,
      resourceRecordId: (inventory.meta?.id || '').toString(),
      resourceItemId: 'LE-CLOSE-2',
      resourceKind: 'Entire dish',
      quantity: 4,
      sourceFormKey: 'Config: Delivery',
      sourceRecordId: 'REC-CLOSE-2',
      sourceParentGroupId: 'MP_MEALS_REQUEST',
      sourceParentRowId: 'ROW-CLOSE-2',
      ledgerFormKey
    });
    expect(reserved.success).toBe(true);

    const result = (service as any).triggerFollowupActions('Config: Delivery', 'REC-CLOSE-2', ['SEND_EMAIL', 'CLOSE_RECORD']);
    expect(result.success).toBe(true);
    const closeEntry = result.results.find((entry: any) => entry.action === 'CLOSE_RECORD');
    expect(closeEntry?.result?.success).toBe(true);
    expect(closeEntry?.result?.reservationReconciliation?.success).toBe(true);

    const updatedInventory = service.fetchSubmissionById(inventoryFormKey, (inventory.meta?.id || '').toString());
    expect((updatedInventory?.values as any)?.LEFTOVER_PORTIONS).toBe(0);
    expect((updatedInventory?.values as any)?.LEFTOVER_RESERVED_PORTIONS).toBe(0);
    expect((updatedInventory?.values as any)?.LEFTOVER_STATUS).toBe('used');
    const reservation = service.fetchSubmissionById(ledgerFormKey, (reserved.reservationId || '').toString());
    expect((reservation?.values as any)?.STATUS).toBe('consumed');
  });

  test('SEND_EMAIL does not downgrade a record that is already closed', () => {
    const dashboardSheet = ss.getSheetByName('Forms Dashboard') || ss.insertSheet('Forms Dashboard');
    const followupJson = JSON.stringify({
      emailTemplateId: { EN: 'email-template-en' },
      emailRecipients: ['ops@example.com'],
      statusTransitions: { onEmail: 'Emailed', onClose: 'Closed' }
    });
    (dashboardSheet as any).setMockData([
      [],
      [],
      ['Form Title', 'Configuration Sheet Name', 'Destination Tab Name', 'Description', 'Form ID', 'Edit URL', 'Published URL', 'Follow-up Config (JSON)'],
      ['Delivery Form', 'Config: Delivery', 'Deliveries', 'Desc', '', '', '', followupJson]
    ]);

    service.saveSubmissionWithId({
      formKey: 'Config: Delivery',
      language: 'EN',
      id: 'REC-CLOSE-GUARD',
      Q1: 'Alice',
      Q2_json: JSON.stringify([]),
      Q3: [],
      Q4: 'ACME',
      __ckSaveMode: 'draft',
      __ckStatus: 'Closed'
    } as any);

    const result = service.triggerFollowupAction('Config: Delivery', 'REC-CLOSE-GUARD', 'SEND_EMAIL');
    expect(result.success).toBe(true);
    expect(result.status).toBe('Closed');

    const updated = service.fetchSubmissionById('Config: Delivery', 'REC-CLOSE-GUARD');
    expect((updated as any)?.status).toBe('Closed');
  });

  test('saveSubmissionWithId persists explicit non-draft closed status to the record', () => {
    const dashboardSheet = ss.getSheetByName('Forms Dashboard') || ss.insertSheet('Forms Dashboard');
    const followupJson = JSON.stringify({
      statusTransitions: { onEmail: 'Emailed', onClose: 'Closed' }
    });
    (dashboardSheet as any).setMockData([
      [],
      [],
      ['Form Title', 'Configuration Sheet Name', 'Destination Tab Name', 'Description', 'Form ID', 'Edit URL', 'Published URL', 'Follow-up Config (JSON)'],
      ['Delivery Form', 'Config: Delivery', 'Deliveries', 'Desc', '', '', '', followupJson]
    ]);

    service.saveSubmissionWithId({
      formKey: 'Config: Delivery',
      language: 'EN',
      id: 'REC-EMAIL-THEN-CLOSE',
      Q1: 'Alice',
      Q2_json: JSON.stringify([]),
      Q3: [],
      Q4: 'ACME',
      __ckSaveMode: 'draft',
      __ckStatus: 'Emailed'
    } as any);

    const closeResult = service.saveSubmissionWithId({
      formKey: 'Config: Delivery',
      language: 'EN',
      id: 'REC-EMAIL-THEN-CLOSE',
      Q1: 'Alice',
      Q2_json: JSON.stringify([]),
      Q3: [],
      Q4: 'ACME',
      __ckStatus: 'Closed'
    } as any);

    expect(closeResult.success).toBe(true);

    const updated = service.fetchSubmissionById('Config: Delivery', 'REC-EMAIL-THEN-CLOSE');
    expect((updated as any)?.status).toBe('Closed');
  });

  test('triggerFollowupAction RECONCILE_RESERVATIONS reconciles active reservations without closing the record', () => {
    const { inventoryFormKey, ledgerFormKey } = setupInventoryReservationForms();
    const dashboardSheet = ss.getSheetByName('Forms Dashboard') || ss.insertSheet('Forms Dashboard');
    const followupJson = JSON.stringify({
      reservationLifecycle: {
        ledgerFormKey,
        reconcileOnFinalSubmit: {
          enabled: true,
          ledgerFormKey,
          refreshMode: 'full'
        }
      }
    });
    (dashboardSheet as any).setMockData([
      [],
      [],
      ['Form Title', 'Configuration Sheet Name', 'Destination Tab Name', 'Description', 'Form ID', 'Edit URL', 'Published URL', 'Follow-up Config (JSON)'],
      ['Delivery Form', 'Config: Delivery', 'Deliveries', 'Desc', '', '', '', followupJson],
      ['Leftover Inventory', inventoryFormKey, 'Test Leftover Inventory Data', 'Desc', '', '', '', ''],
      ['Inventory Reservation Ledger', ledgerFormKey, 'Test Inventory Reservation Ledger Data', 'Desc', '', '', '', '']
    ]);

    service.saveSubmissionWithId({
      formKey: 'Config: Delivery',
      language: 'EN',
      id: 'REC-MILESTONE-1',
      Q1: 'Alice',
      Q2_json: JSON.stringify([]),
      Q3: [],
      Q4: 'ACME',
      __ckSaveMode: 'draft',
      __ckStatus: 'In progress'
    } as any);

    const inventory = service.saveSubmissionWithId({
      formKey: inventoryFormKey,
      language: 'EN',
      LEFTOVER_ID: 'LE-MILESTONE-1',
      LEFTOVER_STATUS: 'available',
      LEFTOVER_KIND: 'Entire dish',
      LEFTOVER_PORTIONS: 5,
      LEFTOVER_RESERVED_PORTIONS: 0
    } as any);
    expect(inventory.success).toBe(true);

    const reserved = service.upsertInventoryReservation({
      resourceFormKey: inventoryFormKey,
      resourceRecordId: (inventory.meta?.id || '').toString(),
      resourceItemId: 'LE-MILESTONE-1',
      resourceKind: 'Entire dish',
      quantity: 2,
      sourceFormKey: 'Config: Delivery',
      sourceRecordId: 'REC-MILESTONE-1',
      sourceParentGroupId: 'MP_MEALS_REQUEST',
      sourceParentRowId: 'ROW-MILESTONE-1',
      ledgerFormKey
    });
    expect(reserved.success).toBe(true);

    const result = service.triggerFollowupAction('Config: Delivery', 'REC-MILESTONE-1', 'RECONCILE_RESERVATIONS');
    expect(result.success).toBe(true);
    expect(result.reservationReconciliation?.success).toBe(true);
    expect(result.status).toBeUndefined();

    const updatedInventory = service.fetchSubmissionById(inventoryFormKey, (inventory.meta?.id || '').toString());
    expect((updatedInventory?.values as any)?.LEFTOVER_PORTIONS).toBe(3);
    expect((updatedInventory?.values as any)?.LEFTOVER_RESERVED_PORTIONS).toBe(0);
    expect((updatedInventory?.values as any)?.LEFTOVER_STATUS).toBe('available');
    const reservation = service.fetchSubmissionById(ledgerFormKey, (reserved.reservationId || '').toString());
    expect((reservation?.values as any)?.STATUS).toBe('consumed');
  });

  test('triggerFollowupActions batch supports RECONCILE_RESERVATIONS before pdf and email', () => {
    const { inventoryFormKey, ledgerFormKey } = setupInventoryReservationForms();
    const dashboardSheet = ss.getSheetByName('Forms Dashboard') || ss.insertSheet('Forms Dashboard');
    const followupJson = JSON.stringify({
      pdfTemplateId: { EN: 'pdf-template-en' },
      emailTemplateId: { EN: 'email-template-en' },
      emailRecipients: ['ops@example.com'],
      statusTransitions: { onPdf: 'PDF Created', onEmail: 'Emailed' },
      reservationLifecycle: {
        ledgerFormKey,
        reconcileOnFinalSubmit: {
          enabled: true,
          ledgerFormKey,
          refreshMode: 'full'
        }
      }
    });
    (dashboardSheet as any).setMockData([
      [],
      [],
      ['Form Title', 'Configuration Sheet Name', 'Destination Tab Name', 'Description', 'Form ID', 'Edit URL', 'Published URL', 'Follow-up Config (JSON)'],
      ['Delivery Form', 'Config: Delivery', 'Deliveries', 'Desc', '', '', '', followupJson],
      ['Leftover Inventory', inventoryFormKey, 'Test Leftover Inventory Data', 'Desc', '', '', '', ''],
      ['Inventory Reservation Ledger', ledgerFormKey, 'Test Inventory Reservation Ledger Data', 'Desc', '', '', '', '']
    ]);

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
      id: 'REC-MILESTONE-2',
      Q1: 'Alice',
      Q2_json: JSON.stringify([]),
      Q3: [],
      Q4: 'ACME',
      __ckSaveMode: 'draft',
      __ckStatus: 'In progress'
    } as any);

    const inventory = service.saveSubmissionWithId({
      formKey: inventoryFormKey,
      language: 'EN',
      LEFTOVER_ID: 'LE-MILESTONE-2',
      LEFTOVER_STATUS: 'available',
      LEFTOVER_KIND: 'Entire dish',
      LEFTOVER_PORTIONS: 4,
      LEFTOVER_RESERVED_PORTIONS: 0
    } as any);
    expect(inventory.success).toBe(true);

    const reserved = service.upsertInventoryReservation({
      resourceFormKey: inventoryFormKey,
      resourceRecordId: (inventory.meta?.id || '').toString(),
      resourceItemId: 'LE-MILESTONE-2',
      resourceKind: 'Entire dish',
      quantity: 4,
      sourceFormKey: 'Config: Delivery',
      sourceRecordId: 'REC-MILESTONE-2',
      sourceParentGroupId: 'MP_MEALS_REQUEST',
      sourceParentRowId: 'ROW-MILESTONE-2',
      ledgerFormKey
    });
    expect(reserved.success).toBe(true);

    const result = (service as any).triggerFollowupActions('Config: Delivery', 'REC-MILESTONE-2', [
      'RECONCILE_RESERVATIONS',
      'CREATE_PDF',
      'SEND_EMAIL'
    ]);
    expect(result.success).toBe(true);
    const reconcileEntry = result.results.find((entry: any) => entry.action === 'RECONCILE_RESERVATIONS');
    expect(reconcileEntry?.result?.success).toBe(true);
    expect(reconcileEntry?.result?.reservationReconciliation?.success).toBe(true);

    const updatedInventory = service.fetchSubmissionById(inventoryFormKey, (inventory.meta?.id || '').toString());
    expect((updatedInventory?.values as any)?.LEFTOVER_PORTIONS).toBe(0);
    expect((updatedInventory?.values as any)?.LEFTOVER_RESERVED_PORTIONS).toBe(0);
    expect((updatedInventory?.values as any)?.LEFTOVER_STATUS).toBe('used');
    const reservation = service.fetchSubmissionById(ledgerFormKey, (reserved.reservationId || '').toString());
    expect((reservation?.values as any)?.STATUS).toBe('consumed');
  });

  test('triggerFollowupAction applies close-state submit effects before returning success', () => {
    const dashboardSheet = ss.getSheetByName('Forms Dashboard') || ss.insertSheet('Forms Dashboard');
    const followupJson = JSON.stringify({
      statusTransitions: { onClose: 'Closed' },
      submitEffects: [
        {
          id: 'captureOnClose',
          type: 'createRecord',
          targetFormKey: 'Config: Inventory',
          runOn: 'both',
          when: {
            fieldId: 'status',
            equals: ['Closed']
          },
          values: {
            SOURCE_RECORD_ID: '{{source.id}}',
            SOURCE_STATUS: '{{source.status}}',
            LEFTOVER_KIND: 'entireDish'
          }
        }
      ]
    });
    (dashboardSheet as any).setMockData([
      [],
      [],
      ['Form Title', 'Configuration Sheet Name', 'Destination Tab Name', 'Description', 'Form ID', 'Edit URL', 'Published URL', 'Follow-up Config (JSON)'],
      ['Delivery Form', 'Config: Delivery', 'Deliveries', 'Desc', '', '', '', followupJson],
      ['Leftover Inventory', 'Config: Inventory', 'Inventory Data', 'Desc', '', '', '', '']
    ]);

    const inventoryConfig = ss.getSheetByName('Config: Inventory') || ss.insertSheet('Config: Inventory');
    (inventoryConfig as any).setMockData([
      ['ID', 'Type', 'Q En', 'Q Fr', 'Q Nl', 'Req', 'Opt En', 'Opt Fr', 'Opt Nl', 'Status', 'Config', 'OptionFilter', 'Validation', 'List View?', 'Edit'],
      ['SOURCE_RECORD_ID', 'TEXT', 'Source record', 'Source record', 'Source record', false, '', '', '', 'Active', '', '', '', '', ''],
      ['SOURCE_STATUS', 'TEXT', 'Source status', 'Source status', 'Source status', false, '', '', '', 'Active', '', '', '', '', ''],
      ['LEFTOVER_KIND', 'TEXT', 'Leftover kind', 'Leftover kind', 'Leftover kind', false, '', '', '', 'Active', '', '', '', '', '']
    ]);

    const created = service.saveSubmissionWithId({
      formKey: 'Config: Delivery',
      language: 'EN',
      id: 'REC-CLOSE-EFFECT',
      Q1: 'Alice',
      Q2_json: JSON.stringify([]),
      Q3: [],
      Q4: 'ACME',
      __ckSaveMode: 'draft',
      __ckStatus: 'In progress'
    } as any);
    expect(created.success).toBe(true);

    const closeResult = (service as any).triggerFollowupAction('Config: Delivery', 'REC-CLOSE-EFFECT', 'CLOSE_RECORD');
    expect(closeResult.success).toBe(true);
    expect(closeResult.status).toBe('Closed');
    expect(closeResult.submitEffects).toEqual(
      expect.objectContaining({
        configured: 1,
        executed: 1,
        created: 1,
        operation: 'update'
      })
    );

    const closedRecord = service.fetchSubmissionById('Config: Delivery', 'REC-CLOSE-EFFECT');
    expect((closedRecord as any)?.status).toBe('Closed');

    const inventorySheet = ss.getSheetByName('Inventory Data');
    expect(inventorySheet).toBeDefined();
    expect(inventorySheet!.getLastRow()).toBe(2);
    const values = inventorySheet!.getRange(1, 1, inventorySheet!.getLastRow(), inventorySheet!.getLastColumn()).getValues();
    const header = values[0].map((value: any) => (value || '').toString().trim());
    const sourceRecordCol = header.findIndex((value: string) => /\[SOURCE_RECORD_ID\]\s*$/.test(value));
    const sourceStatusCol = header.findIndex((value: string) => /\[SOURCE_STATUS\]\s*$/.test(value));
    expect(values[1][sourceRecordCol]).toBe('REC-CLOSE-EFFECT');
    expect(values[1][sourceStatusCol]).toBe('Closed');
  });

  test('saveSubmissionWithId can delete an existing record immediately for dedup delete-on-key-change flow', () => {
    const initial = service.saveSubmissionWithId({
      formKey: 'Config: Delivery',
      language: 'EN',
      id: 'REC-DEL',
      Q1: 'Alice',
      Q2_json: JSON.stringify([]),
      Q3: [],
      Q4: 'ACME',
      __ckSaveMode: 'draft',
      __ckStatus: 'In progress'
    } as any);
    expect(initial.success).toBe(true);

    const deleted = service.saveSubmissionWithId({
      formKey: 'Config: Delivery',
      language: 'EN',
      id: 'REC-DEL',
      __ckDeleteRecordId: 'REC-DEL',
      __ckSaveMode: 'draft'
    } as any);
    expect(deleted.success).toBe(true);

    const sheet = ss.getSheetByName('Deliveries');
    expect(sheet).toBeDefined();
    expect(sheet!.getLastRow()).toBe(1);
  });

  test('saveSubmissionWithId releases active reservations when delete-only flow removes the source record', () => {
    const { inventoryFormKey, ledgerFormKey } = setupInventoryReservationForms();
    const dashboardSheet = ss.getSheetByName('Forms Dashboard') || ss.insertSheet('Forms Dashboard');
    const followupJson = JSON.stringify({
      dedupDeleteOnKeyChange: true,
      reservationLifecycle: {
        ledgerFormKey,
        releaseOnDelete: true
      }
    });
    (dashboardSheet as any).setMockData([
      [],
      [],
      ['Form Title', 'Configuration Sheet Name', 'Destination Tab Name', 'Description', 'Form ID', 'Edit URL', 'Published URL', 'Follow-up Config (JSON)'],
      ['Delivery Form', 'Config: Delivery', 'Deliveries', 'Desc', '', '', '', followupJson],
      ['Leftover Inventory', inventoryFormKey, 'Test Leftover Inventory Data', 'Desc', '', '', '', ''],
      ['Inventory Reservation Ledger', ledgerFormKey, 'Test Inventory Reservation Ledger Data', 'Desc', '', '', '', '']
    ]);

    const source = service.saveSubmissionWithId({
      formKey: 'Config: Delivery',
      language: 'EN',
      id: 'REC-DELETE-1',
      Q1: 'Alice',
      Q2_json: JSON.stringify([]),
      Q3: [],
      Q4: 'ACME',
      __ckSaveMode: 'draft',
      __ckStatus: 'In progress'
    } as any);
    expect(source.success).toBe(true);

    const inventory = service.saveSubmissionWithId({
      formKey: inventoryFormKey,
      language: 'EN',
      LEFTOVER_ID: 'LE-DEL',
      LEFTOVER_STATUS: 'available',
      LEFTOVER_KIND: 'Entire dish',
      LEFTOVER_PORTIONS: 8,
      LEFTOVER_RESERVED_PORTIONS: 0
    } as any);
    expect(inventory.success).toBe(true);

    const reserved = service.upsertInventoryReservation({
      resourceFormKey: inventoryFormKey,
      resourceRecordId: (inventory.meta?.id || '').toString(),
      resourceItemId: 'LE-DEL',
      resourceKind: 'Entire dish',
      quantity: 3,
      sourceFormKey: 'Config: Delivery',
      sourceRecordId: 'REC-DELETE-1',
      sourceParentGroupId: 'MP_MEALS_REQUEST',
      sourceParentRowId: 'ROW-DELETE',
      ledgerFormKey
    });
    expect(reserved.success).toBe(true);

    const refreshSpy = jest.spyOn(service as any, 'refreshAnalyticsAndHomeBootstrap');
    const bumpSpy = jest.spyOn(service as any, 'bumpHomeRevision');
    refreshSpy.mockClear();
    bumpSpy.mockClear();

    const deleted = service.saveSubmissionWithId({
      formKey: 'Config: Delivery',
      language: 'EN',
      id: 'REC-DELETE-1',
      __ckDeleteRecordId: 'REC-DELETE-1',
      __ckSaveMode: 'draft'
    } as any);
    expect(deleted.success).toBe(true);
    expect((deleted.meta as any)?.reservationRelease?.releasedReservations).toBe(1);
    expect(refreshSpy).toHaveBeenCalledTimes(1);
    expect(refreshSpy).toHaveBeenCalledWith(
      expect.objectContaining({ configSheet: 'Config: Delivery' }),
      expect.any(Array),
      'saveSubmissionWithId'
    );
    const bumpReasons = bumpSpy.mock.calls.map((call: any[]) => call[1]);
    expect(bumpReasons.filter((reason: string) => reason === 'inventoryReservation.reconcile')).toHaveLength(2);
    expect(bumpReasons.filter((reason: string) => reason === 'saveSubmissionWithId')).toHaveLength(1);

    const updatedInventory = service.fetchSubmissionById(inventoryFormKey, (inventory.meta?.id || '').toString());
    expect((updatedInventory?.values as any)?.LEFTOVER_RESERVED_PORTIONS).toBe(0);
    const reservation = service.fetchSubmissionById(ledgerFormKey, (reserved.reservationId || '').toString());
    expect((reservation?.values as any)?.STATUS).toBe('released');
  });

  test('runDailyLifecycleRecompute releases stale active reservations for configured source forms', () => {
    const { inventoryFormKey, ledgerFormKey } = setupInventoryReservationForms();
    const dashboardSheet = ss.getSheetByName('Forms Dashboard') || ss.insertSheet('Forms Dashboard');
    const sourceFormKey = 'Config: Source Reservations';
    const lifecycleJson = JSON.stringify({
      reservationLifecycle: {
        ledgerFormKey,
        releaseOnDelete: true
      },
      lifecycle: {
        rules: [
          {
            id: 'releaseStaleReservations',
            type: 'releaseStaleReservations',
            dateFieldId: 'SRC_DATE',
            compare: 'beforeToday',
            ledgerFormKey
          }
        ]
      }
    });
    (dashboardSheet as any).setMockData([
      [],
      [],
      ['Form Title', 'Configuration Sheet Name', 'Destination Tab Name', 'Description', 'Form ID', 'Edit URL', 'Published URL', 'Follow-up Config (JSON)'],
      ['Delivery Form', 'Config: Delivery', 'Deliveries', 'Desc', '', '', '', ''],
      ['Source Reservations', sourceFormKey, 'Source Reservation Data', 'Desc', '', '', '', lifecycleJson],
      ['Leftover Inventory', inventoryFormKey, 'Test Leftover Inventory Data', 'Desc', '', '', '', ''],
      ['Inventory Reservation Ledger', ledgerFormKey, 'Test Inventory Reservation Ledger Data', 'Desc', '', '', '', '']
    ]);

    const sourceConfig = ss.getSheetByName(sourceFormKey) || ss.insertSheet(sourceFormKey);
    (sourceConfig as any).setMockData([
      ['ID', 'Type', 'Q En', 'Q Fr', 'Q Nl', 'Req', 'Opt En', 'Opt Fr', 'Opt Nl', 'Status', 'Config', 'OptionFilter', 'Validation', 'List View?', 'Edit'],
      ['SRC_DATE', 'DATE', 'Source date', 'Source date', 'Source date', true, '', '', '', 'Active', '', '', '', '', '']
    ]);

    const source = service.saveSubmissionWithId({
      formKey: sourceFormKey,
      language: 'EN',
      id: 'SRC-1',
      SRC_DATE: '2026-03-28',
      __ckSaveMode: 'draft',
      __ckStatus: 'In progress'
    } as any);
    expect(source.success).toBe(true);

    const inventory = service.saveSubmissionWithId({
      formKey: inventoryFormKey,
      language: 'EN',
      LEFTOVER_ID: 'LE-STALE',
      LEFTOVER_STATUS: 'available',
      LEFTOVER_KIND: 'Entire dish',
      LEFTOVER_PORTIONS: 9,
      LEFTOVER_RESERVED_PORTIONS: 0
    } as any);
    expect(inventory.success).toBe(true);

    const reserved = service.upsertInventoryReservation({
      resourceFormKey: inventoryFormKey,
      resourceRecordId: (inventory.meta?.id || '').toString(),
      resourceItemId: 'LE-STALE',
      resourceKind: 'Entire dish',
      quantity: 5,
      sourceFormKey,
      sourceRecordId: 'SRC-1',
      sourceParentGroupId: 'MP_MEALS_REQUEST',
      sourceParentRowId: 'ROW-STALE',
      ledgerFormKey
    });
    expect(reserved.success).toBe(true);

    const todaySpy = jest.spyOn(service as any, 'scriptTodayIso').mockReturnValue('2026-03-29');
    const primeSpy = jest.spyOn(service as any, 'primeHomeBootstrapCache');
    try {
      const result = service.runDailyLifecycleRecompute();
      expect(result.success).toBe(true);
      expect(primeSpy).toHaveBeenCalledTimes(1);
      expect(primeSpy).toHaveBeenCalledWith(sourceFormKey, expect.any(Number), 'runDailyLifecycleRecompute');
      const updatedInventory = service.fetchSubmissionById(inventoryFormKey, (inventory.meta?.id || '').toString());
      expect((updatedInventory?.values as any)?.LEFTOVER_PORTIONS).toBe(9);
      expect((updatedInventory?.values as any)?.LEFTOVER_RESERVED_PORTIONS).toBe(0);
      const reservation = service.fetchSubmissionById(ledgerFormKey, (reserved.reservationId || '').toString());
      expect((reservation?.values as any)?.STATUS).toBe('released');
    } finally {
      todaySpy.mockRestore();
    }
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

  test('writes change and snapshot rows to dedicated audit sheet when audit logging is enabled', () => {
    const dashboardSheet = ss.getSheetByName('Forms Dashboard') || ss.insertSheet('Forms Dashboard');

    const followupJson = JSON.stringify({
      auditLogging: {
        enabled: true,
        statuses: ['Ready for production'],
        snapshotButtons: ['READY_PROD'],
        sheetName: 'Delivery Audit'
      }
    });
    const dashboardData = [
      [],
      [],
      ['Form Title', 'Configuration Sheet Name', 'Destination Tab Name', 'Description', 'Form ID', 'Edit URL', 'Published URL', 'Follow-up Config (JSON)'],
      ['Delivery Form', 'Config: Delivery', 'Deliveries', 'Desc', '', '', '', followupJson]
    ];
    (dashboardSheet as any).setMockData(dashboardData);

    const created = service.saveSubmissionWithId({
      formKey: 'Config: Delivery',
      language: 'EN',
      id: 'REC-AUDIT-1',
      Q1: 'Alice',
      Q2_json: JSON.stringify([]),
      Q3: [],
      Q4: 'ACME',
      __ckSaveMode: 'draft',
      __ckStatus: 'In progress'
    } as any);
    expect(created.success).toBe(true);

    const updated = service.saveSubmissionWithId({
      formKey: 'Config: Delivery',
      language: 'EN',
      id: 'REC-AUDIT-1',
      Q1: 'Alice Updated',
      Q2_json: JSON.stringify([]),
      Q3: [],
      Q4: 'ACME',
      __ckSaveMode: 'draft',
      __ckStatus: 'Ready for production',
      __ckAuditAction: 'READY_PROD',
      __ckDeviceInfo: '{"userAgent":"Jest UA"}'
    } as any);
    expect(updated.success).toBe(true);

    const auditSheet = ss.getSheetByName('Delivery Audit');
    expect(auditSheet).toBeDefined();
    const rows = auditSheet!.getValues();
    const header = (rows[0] || []).map((v: any) => (v || '').toString());
    const rowData = rows.slice(1).filter(r => r && r.some((cell: any) => cell !== ''));

    const col = (name: string) => header.findIndex(h => h === name);
    const auditTypeIdx = col('auditType');
    const fieldPathIdx = col('fieldPath');
    const beforeIdx = col('beforeValue');
    const afterIdx = col('afterValue');
    const snapshotIdx = col('snapshot');
    const deviceInfoIdx = col('deviceInfo');
    const recordIdIdx = col('recordId');

    expect(auditTypeIdx).toBeGreaterThanOrEqual(0);
    expect(fieldPathIdx).toBeGreaterThanOrEqual(0);
    expect(col('auditStatus')).toBe(-1);
    expect(deviceInfoIdx).toBeGreaterThanOrEqual(0);

    const changeRows = rowData.filter(r => (r[auditTypeIdx] || '').toString() === 'change');
    const snapshotRows = rowData.filter(r => (r[auditTypeIdx] || '').toString() === 'snapshot');
    expect(changeRows.length).toBeGreaterThan(0);
    expect(snapshotRows.length).toBe(1);

    const q1Change = changeRows.find(r => (r[fieldPathIdx] || '').toString() === 'Q1');
    expect(q1Change).toBeDefined();
    expect((q1Change?.[beforeIdx] || '').toString()).toBe('Alice');
    expect((q1Change?.[afterIdx] || '').toString()).toBe('Alice Updated');
    expect((q1Change?.[deviceInfoIdx] || '').toString()).toContain('Jest UA');
    expect((q1Change?.[recordIdIdx] || '').toString()).toBe('REC-AUDIT-1');

    const snapshotRow = snapshotRows[0];
    expect((snapshotRow[snapshotIdx] || '').toString()).toContain('REC-AUDIT-1');
  });

  test('updates preserve unmanaged destination columns', () => {
    const created = service.saveSubmissionWithId({
      formKey: 'Config: Delivery',
      language: 'EN',
      id: 'REC-PRESERVE-1',
      Q1: 'Alice',
      Q2_json: JSON.stringify([]),
      Q3: [],
      Q4: 'ACME'
    } as any);
    expect(created.success).toBe(true);

    const sheet = ss.getSheetByName('Deliveries');
    expect(sheet).toBeDefined();
    const unmanagedCol = Math.max((sheet as any).getLastColumn(), 1) + 1;
    (sheet as any).getRange(1, unmanagedCol, 1, 1).setValue('Manual Notes');
    (sheet as any).getRange(2, unmanagedCol, 1, 1).setValue('Keep me');

    const updated = service.saveSubmissionWithId({
      formKey: 'Config: Delivery',
      language: 'EN',
      id: 'REC-PRESERVE-1',
      Q1: 'Alice 2',
      Q2_json: JSON.stringify([]),
      Q3: [],
      Q4: 'ACME'
    } as any);
    expect(updated.success).toBe(true);

    const unmanagedValue = (sheet as any).getRange(2, unmanagedCol, 1, 1).getValues()[0][0];
    expect((unmanagedValue || '').toString()).toBe('Keep me');
  });
});
