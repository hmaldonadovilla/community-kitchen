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

  const installFollowupLaneMocks = () => {
    const previousPropertiesService = (global as any).PropertiesService;
    const previousLockService = (global as any).LockService;
    const store = new Map<string, string>();
    const props: {
      getProperty: jest.Mock<string | null, [string]>;
      setProperty: jest.Mock<any, [string, string]>;
      deleteProperty: jest.Mock<any, [string]>;
    } = {
      getProperty: jest.fn((key: string) => (store.has(key) ? store.get(key) || null : null)),
      setProperty: jest.fn((key: string, value: string) => {
        store.set(key, value);
        return props;
      }),
      deleteProperty: jest.fn((key: string) => {
        store.delete(key);
        return props;
      })
    };
    const lock = {
      waitLock: jest.fn(),
      releaseLock: jest.fn()
    };
    (global as any).PropertiesService = {
      getScriptProperties: () => props
    };
    (global as any).LockService = {
      getScriptLock: () => lock
    };
    return {
      props,
      lock,
      store,
      restore: () => {
        (global as any).PropertiesService = previousPropertiesService;
        (global as any).LockService = previousLockService;
      }
    };
  };

  const installDocumentLockMocks = (tryLockImpl?: () => boolean) => {
    const previousLockService = (global as any).LockService;
    const lock = {
      tryLock: jest.fn(() => (tryLockImpl ? tryLockImpl() : true)),
      releaseLock: jest.fn()
    };
    (global as any).LockService = {
      ...(previousLockService || {}),
      getDocumentLock: () => lock
    };
    return {
      lock,
      restore: () => {
        (global as any).LockService = previousLockService;
      }
    };
  };

  const installServerCacheMocks = () => {
    const previousCacheService = (global as any).CacheService;
    const store = new Map<string, string>();
    const cache = {
      get: jest.fn((key: string) => store.get(key) || null),
      put: jest.fn((key: string, value: string) => {
        store.set(key, value);
      }),
      getAll: jest.fn((keys: string[]) =>
        keys.reduce((acc, key) => {
          if (store.has(key)) acc[key] = store.get(key) || '';
          return acc;
        }, {} as Record<string, string>)
      ),
      putAll: jest.fn((values: Record<string, string>) => {
        Object.entries(values || {}).forEach(([key, value]) => {
          store.set(key, value);
        });
      }),
      remove: jest.fn((key: string) => {
        store.delete(key);
      })
    };
    (global as any).CacheService = {
      getScriptCache: () => cache
    };
    return {
      cache,
      store,
      restore: () => {
        (global as any).CacheService = previousCacheService;
      }
    };
  };

  const installDocumentPropertiesMocks = () => {
    const previousPropertiesService = (global as any).PropertiesService;
    const store = new Map<string, string>();
    const props: {
      getProperty: jest.Mock<string | null, [string]>;
      setProperty: jest.Mock<any, [string, string]>;
      deleteProperty: jest.Mock<any, [string]>;
    } = {
      getProperty: jest.fn((key: string) => (store.has(key) ? store.get(key) || null : null)),
      setProperty: jest.fn((key: string, value: string) => {
        store.set(key, value);
        return props;
      }),
      deleteProperty: jest.fn((key: string) => {
        store.delete(key);
        return props;
      })
    };
    (global as any).PropertiesService = {
      ...(previousPropertiesService || {}),
      getDocumentProperties: () => props
    };
    return {
      props,
      store,
      restore: () => {
        (global as any).PropertiesService = previousPropertiesService;
      }
    };
  };

  afterEach(() => {
    jest.restoreAllMocks();
    (global as any).GmailApp.sendEmail.mockClear();
    (global as any).Utilities.sleep.mockReset();
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

  test('fetchHomeBootstrap does not treat null client revision as revision zero', () => {
    jest.spyOn(service as any, 'readHomeRevision').mockReturnValue(0);
    jest.spyOn(service as any, 'readCachedHomeBootstrap').mockReturnValue(null);
    jest.spyOn(service as any, 'resolveBundledConfig').mockReturnValue(null);
    jest.spyOn(service as any, 'getOrBuildDefinition').mockReturnValue({ listView: { columns: [{ fieldId: 'Q4' }] } });
    jest.spyOn(service as any, 'buildBootstrap').mockReturnValue({
      listResponse: { items: [{ id: 'rec-1', Q4: 'ACME' }], totalCount: 1 },
      records: {}
    });
    jest.spyOn(service as any, 'cacheHomeBootstrap').mockImplementation(() => {});

    const res = service.fetchHomeBootstrap('Config: Delivery', null as any);

    expect(res.notModified).toBe(false);
    expect(res.rev).toBe(0);
    expect(res.listResponse?.items).toHaveLength(1);
    expect((service as any).buildBootstrap).toHaveBeenCalled();
  });

  test('fetchHomeBootstrap applies the initial date search value to the bootstrap query', () => {
    jest.spyOn(service as any, 'readHomeRevision').mockReturnValue(0);
    jest.spyOn(service as any, 'readCachedHomeBootstrap').mockReturnValue(null);
    jest.spyOn(service as any, 'resolveBundledConfig').mockReturnValue(null);
    jest.spyOn(service as any, 'getOrBuildDefinition').mockReturnValue({
      listView: {
        columns: [{ fieldId: 'DATE' }],
        pageSize: 7,
        defaultSort: { fieldId: 'DATE', direction: 'desc' },
        search: {
          mode: 'date',
          dateFieldId: 'DATE',
          initialValue: { relativeDate: 'today' }
        }
      }
    });
    jest.spyOn(service as any, 'cacheHomeBootstrap').mockImplementation(() => {});
    jest.spyOn(service as any, 'scriptTodayIso').mockReturnValue('2026-04-23');
    const fetchSpy = jest.spyOn((service as any).listing, 'fetchSubmissionsSortedBatch').mockReturnValue({
      list: {
        items: [{ id: 'rec-1', DATE: '2026-04-23' }],
        totalCount: 1,
        dateFilterFieldId: 'DATE',
        dateFilterEquals: '2026-04-23'
      },
      records: {}
    });

    const res = service.fetchHomeBootstrap('Config: Delivery');

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      7,
      undefined,
      false,
      undefined,
      expect.objectContaining({
        fieldId: 'DATE',
        direction: 'desc',
        __dateFieldId: 'DATE',
        __dateEquals: '2026-04-23'
      })
    );
    expect(res.listResponse?.items).toHaveLength(1);
    expect(res.listResponse?.dateFilterFieldId).toBe('DATE');
    expect(res.listResponse?.dateFilterEquals).toBe('2026-04-23');
  });

  test('fetchHomeBootstrap fetches searchable paginated home lists in one capped bootstrap batch', () => {
    jest.spyOn(service as any, 'readHomeRevision').mockReturnValue(0);
    jest.spyOn(service as any, 'readCachedHomeBootstrap').mockReturnValue(null);
    jest.spyOn(service as any, 'resolveBundledConfig').mockReturnValue(null);
    jest.spyOn(service as any, 'getOrBuildDefinition').mockReturnValue({
      listView: {
        columns: [{ fieldId: 'NAME' }],
        pageSize: 5,
        paginationControlsEnabled: true,
        defaultSort: { fieldId: 'NAME', direction: 'asc' },
        search: { mode: 'text' }
      }
    });
    jest.spyOn(service as any, 'cacheHomeBootstrap').mockImplementation(() => {});
    const items = Array.from({ length: 60 }, (_, idx) => ({ id: `rec-${idx}`, NAME: `Recipe ${idx}` }));
    const fetchSpy = jest.spyOn((service as any).listing, 'fetchSubmissionsSortedBatch').mockReturnValue({
      list: {
        items,
        totalCount: 60
      },
      records: {}
    });

    const res = service.fetchHomeBootstrap('Config: Delivery');

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      200,
      undefined,
      false,
      undefined,
      expect.objectContaining({
        fieldId: 'NAME',
        direction: 'asc',
        __maxPageSize: 200
      })
    );
    expect(res.listResponse?.items).toHaveLength(60);
    expect((res.listResponse as any)?.contiguousItemCount).toBe(60);
    expect((res.listResponse as any)?.completeData).toBe(true);
  });

  test('fetchSubmissionsSortedBatch returns JSON-safe plain data on the first response', () => {
    const responseDate = new Date('2026-04-23T00:00:00.000Z');
    jest.spyOn((service as any).listing, 'fetchSubmissionsSortedBatch').mockReturnValue({
      list: {
        items: [
          {
            id: 'rec-1',
            Q1: 'Soup',
            DATE: responseDate,
            dropped: undefined
          }
        ],
        totalCount: 1,
        etag: 'etag-1'
      },
      records: {
        'rec-1': {
          id: 'rec-1',
          formKey: 'Config: Delivery',
          language: 'EN',
          status: 'Open',
          values: {
            Q1: 'Soup',
            DATE: responseDate,
            Q2: [{ LI1: 'Carrot', LI2: 2 }]
          }
        }
      }
    });

    const res = service.fetchSubmissionsSortedBatch('Config: Delivery', ['Q1'], 50, undefined, true, undefined, {
      fieldId: 'Q1',
      direction: 'asc'
    });

    expect(res.list.items[0].DATE).toBe('2026-04-23T00:00:00.000Z');
    expect(Object.prototype.hasOwnProperty.call(res.list.items[0], 'dropped')).toBe(false);
    expect((res.records['rec-1'] as any).values.DATE).toBe('2026-04-23T00:00:00.000Z');
    expect(JSON.parse(JSON.stringify(res))).toEqual(res);
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

  test('fetchDataSource auto-pages form-backed options datasources and returns filtered rows in one response', () => {
    const dashboardSheet = ss.getSheetByName('Forms Dashboard') || ss.insertSheet('Forms Dashboard');
    (dashboardSheet as any).setMockData([
      [],
      [],
      ['Form Title', 'Configuration Sheet Name', 'Destination Tab Name', 'Description', 'Form ID', 'Edit URL', 'Published URL', 'Follow-up Config (JSON)'],
      ['Delivery Form', 'Config: Delivery', 'Deliveries', 'Desc', '', '', '', ''],
      ['Inventory Form', 'Config: Inventory', 'Inventory Data', 'Desc', '', '', '', '']
    ]);

    const inventoryConfigSheet = ss.getSheetByName('Config: Inventory') || ss.insertSheet('Config: Inventory');
    (inventoryConfigSheet as any).setMockData([
      ['ID', 'Type', 'Q En', 'Q Fr', 'Q Nl', 'Req', 'Opt En', 'Opt Fr', 'Opt Nl', 'Status', 'Config', 'OptionFilter', 'Validation', 'List View?', 'Edit'],
      ['LEFTOVER_ID', 'TEXT', 'Leftover ID', 'Leftover ID', 'Leftover ID', true, '', '', '', 'Active', '', '', '', '', ''],
      ['LEFTOVER_STATUS', 'TEXT', 'Status', 'Status', 'Status', false, '', '', '', 'Active', '', '', '', '', '']
    ]);

    const fetchSpy = jest.spyOn((service as any).listing, 'fetchSubmissions');
    fetchSpy
      .mockReturnValueOnce({
        items: [
          { id: 'rec-1', LEFTOVER_ID: 'LE-1', LEFTOVER_STATUS: 'used' },
          { id: 'rec-2', LEFTOVER_ID: 'LE-2', LEFTOVER_STATUS: 'used' }
        ],
        nextPageToken: 'NTA=',
        totalCount: 62
      })
      .mockReturnValueOnce({
        items: [
          { id: 'rec-3', LEFTOVER_ID: 'LE-43', LEFTOVER_STATUS: 'available' },
          { id: 'rec-4', LEFTOVER_ID: 'LE-44', LEFTOVER_STATUS: 'available' }
        ],
        totalCount: 62
      });

    const res = service.fetchDataSource({
      id: 'Leftover Inventory Data',
      formKey: 'Config: Inventory',
      mode: 'options',
      projection: ['id', 'LEFTOVER_ID', 'LEFTOVER_STATUS'],
      statusFieldId: 'LEFTOVER_STATUS',
      statusAllowList: ['available']
    } as any, 'EN');

    expect(res.items).toEqual([
      { id: 'rec-3', LEFTOVER_ID: 'LE-43', LEFTOVER_STATUS: 'available' },
      { id: 'rec-4', LEFTOVER_ID: 'LE-44', LEFTOVER_STATUS: 'available' }
    ]);
    expect(res.nextPageToken).toBeUndefined();
    expect(res.totalCount).toBe(2);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy).toHaveBeenNthCalledWith(
      1,
      expect.any(Object),
      expect.any(Array),
      ['id', 'LEFTOVER_ID', 'LEFTOVER_STATUS'],
      250,
      undefined
    );
    expect(fetchSpy).toHaveBeenNthCalledWith(
      2,
      expect.any(Object),
      expect.any(Array),
      ['id', 'LEFTOVER_ID', 'LEFTOVER_STATUS'],
      250,
      'NTA='
    );
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
    expect(JSON.parse(JSON.stringify(res))).toEqual(res);
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

  test('triggerFollowupAction ignores rendered PDF bytes when reading email template docs', () => {
    const followups = (service as any).followups || (service as any);
    jest.spyOn(followups, 'generatePdfArtifact' as any).mockReturnValue({
      success: true,
      url: 'http://pdf',
      fileId: 'file-1',
      blob: null
    });

    const getBlob = jest.fn(() => ({
      getContentType: () => 'application/pdf',
      getDataAsString: () => '%PDF-1.4\nraw rendered PDF bytes'
    }));
    const getAs = jest.fn(() => {
      throw new Error('text export unavailable');
    });
    const serverCache = installServerCacheMocks();
    serverCache.cache.get.mockReturnValue('%PDF-1.4\ncached rendered PDF bytes');

    try {
      service.saveSubmissionWithId({
        formKey: 'Config: Delivery',
        language: 'EN',
        id: 'REC-EMAIL-PDF-BODY',
        Q1: 'Alice',
        Q2_json: JSON.stringify([]),
        Q3: [],
        Q4: 'ACME'
      } as any);

      jest.spyOn((global as any).DriveApp, 'getFileById').mockReturnValue({
        getMimeType: () => 'application/vnd.google-apps.document',
        getAs,
        getBlob
      });
      (global as any).DocumentApp.openById.mockImplementationOnce(() => ({
        getBody: () => ({
          getText: () => 'Hello {{Q1}}'
        }),
        saveAndClose: jest.fn()
      }));

      const result = service.triggerFollowupAction('Config: Delivery', 'REC-EMAIL-PDF-BODY', 'SEND_EMAIL');

      expect(result.success).toBe(true);
      expect(getAs).toHaveBeenCalledWith('text/plain');
      expect(getBlob).not.toHaveBeenCalled();
      expect((global as any).DocumentApp.openById).toHaveBeenCalledWith('email-template-en');
      expect(serverCache.cache.put).toHaveBeenCalledWith(expect.any(String), 'Hello {{Q1}}', expect.any(Number));
      const call = (global as any).GmailApp.sendEmail.mock.calls[0];
      expect(call[2]).toBe('Hello Alice');
      expect(call[3]?.htmlBody).toBe('Hello Alice');
      expect(call[2]).not.toContain('%PDF-');
    } finally {
      serverCache.restore();
    }
  });

  test('triggerFollowupActions batches actions and returns per-action results', () => {
    const followups = (service as any).followups || (service as any);
    jest.spyOn(followups, 'generatePdfArtifact' as any).mockReturnValue({
      success: true,
      url: 'http://pdf',
      fileId: 'file-1',
      blob: null
    });

    const saved = service.saveSubmissionWithId({
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
    expect(result.results[0].result?.dataVersion).toBe((saved.meta?.dataVersion || 0) + 1);
    expect(result.results[1].action).toBe('CLOSE_RECORD');
    expect(result.results[1].result?.success).toBe(true);
    expect(result.results[1].result?.dataVersion).toBe((saved.meta?.dataVersion || 0) + 2);
    expect(service.getRecordVersion('Config: Delivery', 'REC-BATCH-1').dataVersion).toBe((saved.meta?.dataVersion || 0) + 2);
  });

  test('triggerFollowupActions reuses a PDF created earlier in the same batch for email', () => {
    const followups = (service as any).followups || (service as any);
    const blob = { getName: () => 'delivery.pdf' } as any;
    const generatePdfArtifact = jest.spyOn(followups, 'generatePdfArtifact' as any).mockReturnValue({
      success: true,
      url: 'https://drive.google.com/file/d/batchPdfFile12345/view',
      fileId: 'batchPdfFile12345',
      blob
    });

    service.saveSubmissionWithId({
      formKey: 'Config: Delivery',
      language: 'EN',
      id: 'REC-BATCH-PDF-1',
      Q1: 'Alice',
      Q2_json: JSON.stringify([]),
      Q3: [],
      Q4: 'ACME'
    } as any);

    const result = (service as any).triggerFollowupActions('Config: Delivery', 'REC-BATCH-PDF-1', [
      'CREATE_PDF',
      'SEND_EMAIL'
    ]);

    expect(result.success).toBe(true);
    expect(generatePdfArtifact).toHaveBeenCalledTimes(1);
    const optionsArg = (global as any).GmailApp.sendEmail.mock.calls[0]?.[3] || {};
    expect(optionsArg.attachments).toEqual([blob]);
  });

  test('triggerFollowupActions only bumps home revision instead of rebuilding home caches', () => {
    service.saveSubmissionWithId({
      formKey: 'Config: Delivery',
      language: 'EN',
      id: 'REC-FOLLOWUP-REFRESH',
      Q1: 'Alice',
      Q2_json: JSON.stringify([]),
      Q3: [],
      Q4: 'ACME'
    } as any);

    const refreshMutationSpy = jest.spyOn(service as any, 'refreshMutationCaches');
    const refreshAnalyticsSpy = jest.spyOn(service as any, 'refreshAnalyticsAndHomeBootstrap');
    const bumpSpy = jest.spyOn(service as any, 'bumpHomeRevision');

    const result = service.triggerFollowupActions('Config: Delivery', 'REC-FOLLOWUP-REFRESH', ['CLOSE_RECORD']);

    expect(result.success).toBe(true);
    expect(refreshMutationSpy).toHaveBeenCalledWith(
      expect.objectContaining({ configSheet: 'Config: Delivery' }),
      expect.any(Array),
      'triggerFollowupActions',
      'revisionOnly'
    );
    expect(refreshAnalyticsSpy).not.toHaveBeenCalled();
    expect(bumpSpy).toHaveBeenCalledWith('Config: Delivery', 'triggerFollowupActions');
  });

  test('triggerFollowupActions fully refreshes analytics for status changes on analytics-enabled forms', () => {
    service.saveSubmissionWithId({
      formKey: 'Config: Delivery',
      language: 'EN',
      id: 'REC-FOLLOWUP-ANALYTICS',
      Q1: 'Alice',
      Q2_json: JSON.stringify([]),
      Q3: [],
      Q4: 'ACME'
    } as any);

    jest.spyOn(service as any, 'getOrBuildDefinition').mockReturnValue({
      analytics: {
        widgets: [
          {
            id: 'closed_records',
            calculation: {
              type: 'aggregate',
              aggregate: 'count',
              when: { fieldId: 'status', equals: 'Closed' }
            }
          }
        ]
      }
    });
    const refreshMutationSpy = jest.spyOn(service as any, 'refreshMutationCaches');
    const refreshAnalyticsSpy = jest.spyOn(service as any, 'refreshAnalyticsAndHomeBootstrap').mockImplementation(() => {});

    const result = service.triggerFollowupActions('Config: Delivery', 'REC-FOLLOWUP-ANALYTICS', ['CLOSE_RECORD']);

    expect(result.success).toBe(true);
    expect(refreshMutationSpy).toHaveBeenCalledWith(
      expect.objectContaining({ configSheet: 'Config: Delivery' }),
      expect.any(Array),
      'triggerFollowupActions',
      'full'
    );
    expect(refreshAnalyticsSpy).toHaveBeenCalledWith(
      expect.objectContaining({ configSheet: 'Config: Delivery' }),
      expect.any(Array),
      'triggerFollowupActions'
    );
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

  test('draft saves return generated auto increment values in metadata', () => {
    const result = service.saveSubmissionWithId({
      formKey: 'Config: Delivery',
      language: 'EN',
      values: {
        Q1: 'Copied',
        Q2_json: JSON.stringify([]),
        Q3: [],
        Q4: 'ACME',
        Q5: ''
      },
      __ckSaveMode: 'draft',
      __ckStatus: 'In progress'
    } as any);

    expect(result.success).toBe(true);
    expect(result.meta?.autoIncrementValues).toEqual({ Q5: 'MP-AA000001' });
    const saved = service.fetchSubmissionById('Config: Delivery', result.meta?.id);
    expect(saved?.values?.Q5).toBe('MP-AA000001');
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
          sourceLink: {
            sourceFormKeyFieldId: 'LEFTOVER_SOURCE_FORM_KEY',
            sourceRecordIdFieldId: 'LEFTOVER_SOURCE_RECORD_ID'
          },
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
            LEFTOVER_STORAGE: '{{parent.MP_LEFTOVER_STORAGE_CAPTURE}}',
            LEFTOVER_RECIPE: {
              op: 'firstNonEmpty',
              values: ['{{parent.MP_LEFTOVER_RECIPE_CAPTURE}}', '{{row.RECIPE}}']
            },
            LEFTOVER_PORTIONS: '{{parent.MP_LEFTOVER_PORTIONS_CAPTURE}}',
            LEFTOVER_EXP_DATE: {
              op: 'firstNonEmpty',
              values: ['{{parent.MP_LEFTOVER_EXP_DATE_CAPTURE}}', '{{source.MP_EXP_DATE}}']
            },
            LEFTOVER_SOURCE_FORM_KEY: mealProductionFormKey,
            LEFTOVER_SOURCE_RECORD_ID: '{{source.id}}',
            LEFTOVER_SOURCE_ROW_ID: '{{lineItem.rowId}}',
            LEFTOVER_INGREDIENTS_LI: {
              op: 'ifPresent',
              path: 'parent.MP_LEFTOVER_INGREDIENTS_CAPTURE_READY',
              then: {
                op: 'filterCollection',
                collectionPath: 'parent.MP_LEFTOVER_INGREDIENTS_CAPTURE_LI',
                when: {
                  fieldId: 'ING_SELECTED',
                  equals: true
                },
                pickFields: ['ING', 'QTY', 'UNIT', 'CAT', 'ALLERGEN']
              },
              else: '{{row.MP_INGREDIENTS_LI}}'
            }
          }
        },
        {
          id: 'captureProducedLeftovers',
          type: 'createRecord',
          targetFormKey: inventoryFormKey,
          sourceLink: {
            sourceFormKeyFieldId: 'LEFTOVER_SOURCE_FORM_KEY',
            sourceRecordIdFieldId: 'LEFTOVER_SOURCE_RECORD_ID'
          },
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
            LEFTOVER_STORAGE: '{{row.LEFTOVER_STORAGE}}',
            LEFTOVER_INGREDIENT: '{{row.LEFTOVER_INGREDIENT}}',
            LEFTOVER_CAT: '{{row.LEFTOVER_CAT}}',
            LEFTOVER_ALLERGEN: '{{row.LEFTOVER_ALLERGEN}}',
            LEFTOVER_QTY: '{{row.LEFTOVER_QTY}}',
            LEFTOVER_UNIT: '{{row.LEFTOVER_UNIT}}',
            LEFTOVER_EXP_DATE: {
              op: 'firstNonEmpty',
              values: ['{{row.LEFTOVER_EXP_DATE}}', '{{source.MP_EXP_DATE}}']
            },
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
      ['MP_LEFTOVER_PORTIONS_CAPTURE', 'NUMBER', 'Leftover portions', 'Leftover portions', 'Leftover portions', false, '', '', ''],
      ['MP_LEFTOVER_RECIPE_CAPTURE', 'TEXT', 'Dish name', 'Dish name', 'Dish name', false, '', '', ''],
      ['MP_LEFTOVER_STORAGE_CAPTURE', 'CHOICE', 'Storage', 'Storage', 'Storage', false, 'Chilled,Frozen', 'Réfrigéré,Congelé', 'Gekoeld,Ingevroren'],
      ['MP_LEFTOVER_EXP_DATE_CAPTURE', 'DATE', 'Leftover expiration date', 'Leftover expiration date', 'Leftover expiration date', false, '', '', ''],
      ['MP_LEFTOVER_INGREDIENTS_CAPTURE_READY', 'TEXT', 'Ingredients capture ready', 'Ingredients capture ready', 'Ingredients capture ready', false, '', '', '']
    ]);

    const partialLeftoversSheet = ss.insertSheet('LineItems_MP_LEFTOVER_CAPTURE_LI');
    (partialLeftoversSheet as any).setMockData([
      ['ID', 'Type', 'Label EN', 'Label FR', 'Label NL', 'Req', 'Opt EN', 'Opt FR', 'Opt NL'],
      ['LEFTOVER_INGREDIENT', 'TEXT', 'Ingredient', 'Ingredient', 'Ingredient', false, '', '', ''],
      ['LEFTOVER_CAT', 'TEXT', 'Category', 'Category', 'Category', false, '', '', ''],
      ['LEFTOVER_ALLERGEN', 'TEXT', 'Allergen', 'Allergen', 'Allergen', false, '', '', ''],
      ['LEFTOVER_STORAGE', 'CHOICE', 'Storage', 'Storage', 'Storage', false, 'Chilled,Frozen', 'Réfrigéré,Congelé', 'Gekoeld,Ingevroren'],
      ['LEFTOVER_EXP_DATE', 'DATE', 'Expiration date', 'Expiration date', 'Expiration date', false, '', '', ''],
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
      ['LEFTOVER_STORAGE', 'CHOICE', 'Storage', 'Storage', 'Storage', false, 'Chilled,Frozen', 'Réfrigéré,Congelé', 'Gekoeld,Ingevroren', 'Active', '', '', '', '', ''],
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
        MP_LEFTOVER_RECIPE_CAPTURE: 'Renamed curry & fish',
        MP_LEFTOVER_STORAGE_CAPTURE: 'Frozen',
        MP_LEFTOVER_EXP_DATE_CAPTURE: '2026-10-02',
        MP_LEFTOVER_INGREDIENTS_CAPTURE_READY: '1',
        MP_TYPE_LI: [
          {
            __ckRowId: 'COOK-1',
            PREP_TYPE: 'Cook',
            RECIPE: 'Curry & fish',
            MP_INGREDIENTS_LI: [{ ING: 'Salt', QTY: 1, UNIT: 'kg' }]
          }
        ],
        MP_LEFTOVER_INGREDIENTS_CAPTURE_LI: [
          {
            __ckRowId: 'CAP-1',
            ING_SELECTED: true,
            ING: 'Salt',
            QTY: 1,
            UNIT: 'kg',
            CAT: 'Herbs',
            ALLERGEN: 'None'
          },
          {
            __ckRowId: 'CAP-2',
            ING_SELECTED: false,
            ING: 'Pepper',
            QTY: 2,
            UNIT: 'gr',
            CAT: 'Herbs',
            ALLERGEN: 'None'
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
        LEFTOVER_STORAGE: 'Frozen',
        LEFTOVER_EXP_DATE: '2026-10-02',
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
    expect(closed.meta?.submitEffects?.generatedRecords).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          effectId: 'captureProducedEntireDishLeftovers',
          targetFormKey: inventoryFormKey,
          values: expect.objectContaining({
            LEFTOVER_ID: 'LE-1',
            LEFTOVER_RECIPE: 'Renamed curry & fish'
          })
        }),
        expect.objectContaining({
          effectId: 'captureProducedLeftovers',
          targetFormKey: inventoryFormKey,
          values: expect.objectContaining({
            LEFTOVER_ID: 'LP-1'
          })
        })
      ])
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
    expect(entireDishRow.LEFTOVER_RECIPE).toBe('Renamed curry & fish');
    expect(Number(entireDishRow.LEFTOVER_PORTIONS || 0)).toBe(2);
    expect(entireDishRow.LEFTOVER_STORAGE).toBe('Frozen');
    expect(new Date(entireDishRow.LEFTOVER_EXP_DATE).getFullYear()).toBe(2026);
    expect(new Date(entireDishRow.LEFTOVER_EXP_DATE).getMonth()).toBe(9);
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
    expect(partialDishRow.LEFTOVER_STORAGE).toBe('Frozen');
    expect(Number(partialDishRow.LEFTOVER_QTY || 0)).toBe(250);
    expect(partialDishRow.LEFTOVER_UNIT).toBe('gr');
    expect(new Date(partialDishRow.LEFTOVER_EXP_DATE).getFullYear()).toBe(2026);
    expect(new Date(partialDishRow.LEFTOVER_EXP_DATE).getMonth()).toBe(9);
    expect(new Date(partialDishRow.LEFTOVER_EXP_DATE).getDate()).toBe(2);
    expect(partialDishRow.LEFTOVER_SOURCE_FORM_KEY).toBe(mealProductionFormKey);
    expect(partialDishRow.LEFTOVER_SOURCE_RECORD_ID).toBe('MP-CLOSE-1');
    expect(partialDishRow.LEFTOVER_SOURCE_ROW_ID).toBe('PART-1');
    expect((partialDishRow.LEFTOVER_ID || '').toString()).toBe('LP-1');
  });

  test('saveSubmissionWithId can flatten combined prep ingredients for produced leftovers when capture rows are absent', () => {
    const mealProductionFormKey = 'Config: Test Meal Production Combined Leftovers';
    const inventoryFormKey = 'Config: Combined Leftover Inventory';
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
            LEFTOVER_KIND: 'Entire dish',
            LEFTOVER_PREP_TYPE: 'Entire dish',
            LEFTOVER_MEAL_TYPE: '{{parent.MEAL_TYPE}}',
            LEFTOVER_PORTIONS: '{{parent.MP_LEFTOVER_PORTIONS_CAPTURE}}',
            LEFTOVER_SOURCE_FORM_KEY: mealProductionFormKey,
            LEFTOVER_SOURCE_RECORD_ID: '{{source.id}}',
            LEFTOVER_SOURCE_ROW_ID: '{{lineItem.rowId}}',
            LEFTOVER_INGREDIENTS_LI: {
              op: 'ifPresent',
              path: 'parent.MP_LEFTOVER_INGREDIENTS_CAPTURE_READY',
              then: {
                op: 'filterCollection',
                collectionPath: 'parent.MP_LEFTOVER_INGREDIENTS_CAPTURE_LI',
                when: {
                  fieldId: 'ING_SELECTED',
                  equals: true
                },
                pickFields: ['ING', 'QTY', 'UNIT', 'CAT', 'ALLERGEN']
              },
              else: {
                op: 'flattenCollection',
                collectionPath: 'parent.MP_TYPE_LI',
                nestedCollectionPath: 'MP_INGREDIENTS_LI',
                rowFilter: {
                  includeWhen: {
                    any: [
                      {
                        fieldId: 'PREP_TYPE',
                        equals: ['Cook', 'Single-ingredient', 'Part dish']
                      },
                      {
                        all: [
                          {
                            fieldId: 'PREP_TYPE',
                            equals: ['Multi-ingredient', 'Entire dish']
                          },
                          {
                            fieldId: 'PREP_QTY',
                            equals: 0
                          }
                        ]
                      }
                    ]
                  }
                },
                pickFields: ['ING', 'QTY', 'UNIT', 'CAT', 'ALLERGEN']
              }
            }
          }
        }
      ]
    });
    (dashboardSheet as any).setMockData([
      [],
      [],
      ['Form Title', 'Configuration Sheet Name', 'Destination Tab Name', 'Description', 'Form ID', 'Edit URL', 'Published URL', 'Follow-up Config (JSON)'],
      ['Meal Production', mealProductionFormKey, 'Test Meal Production Combined Leftovers Data', 'Desc', '', '', '', followupJson],
      ['Leftover Inventory', inventoryFormKey, 'Combined Leftover Inventory Data', 'Desc', '', '', '', '']
    ]);

    const mealProductionConfig = ss.insertSheet(mealProductionFormKey);
    (mealProductionConfig as any).setMockData([
      ['ID', 'Type', 'Q En', 'Q Fr', 'Q Nl', 'Req', 'Opt En', 'Opt Fr', 'Opt Nl', 'Status', 'Config', 'OptionFilter', 'Validation', 'List View?', 'Edit'],
      ['MP_MEALS_REQUEST', 'LINE_ITEM_GROUP', 'Meals request', 'Meals request', 'Meals request', false, '', '', '', 'Active', 'REF:LineItems_MP_MEALS_REQUEST', '', '', '', '']
    ]);

    const mealsRequestSheet = ss.insertSheet('LineItems_MP_MEALS_REQUEST');
    (mealsRequestSheet as any).setMockData([
      ['ID', 'Type', 'Label EN', 'Label FR', 'Label NL', 'Req', 'Opt EN', 'Opt FR', 'Opt NL'],
      ['MEAL_TYPE', 'TEXT', 'Meal type', 'Meal type', 'Meal type', false, '', '', ''],
      ['MP_LEFTOVER_PORTIONS_CAPTURE', 'NUMBER', 'Leftover portions', 'Leftover portions', 'Leftover portions', false, '', '', '']
    ]);

    const inventoryConfig = ss.insertSheet(inventoryFormKey);
    (inventoryConfig as any).setMockData([
      ['ID', 'Type', 'Q En', 'Q Fr', 'Q Nl', 'Req', 'Opt En', 'Opt Fr', 'Opt Nl', 'Status', 'Config', 'OptionFilter', 'Validation', 'List View?', 'Edit'],
      ['LEFTOVER_KIND', 'TEXT', 'Kind', 'Kind', 'Kind', false, '', '', '', 'Active', '', '', '', '', ''],
      ['LEFTOVER_PREP_TYPE', 'TEXT', 'Prep type', 'Prep type', 'Prep type', false, '', '', '', 'Active', '', '', '', '', ''],
      ['LEFTOVER_MEAL_TYPE', 'TEXT', 'Meal type', 'Meal type', 'Meal type', false, '', '', '', 'Active', '', '', '', '', ''],
      ['LEFTOVER_PORTIONS', 'NUMBER', 'Portions', 'Portions', 'Portions', false, '', '', '', 'Active', '', '', '', '', ''],
      ['LEFTOVER_SOURCE_FORM_KEY', 'TEXT', 'Source form key', 'Source form key', 'Source form key', false, '', '', '', 'Active', '', '', '', '', ''],
      ['LEFTOVER_SOURCE_RECORD_ID', 'TEXT', 'Source record id', 'Source record id', 'Source record id', false, '', '', '', 'Active', '', '', '', '', ''],
      ['LEFTOVER_SOURCE_ROW_ID', 'TEXT', 'Source row id', 'Source row id', 'Source row id', false, '', '', '', 'Active', '', '', '', '', ''],
      ['LEFTOVER_INGREDIENTS_LI', 'LINE_ITEM_GROUP', 'Ingredients', 'Ingredients', 'Ingredients', false, '', '', '', 'Active', 'REF:LineItems_LEFTOVER_INGREDIENTS_LI', '', '', '', '']
    ]);

    const inventoryIngredientsSheet = ss.insertSheet('LineItems_LEFTOVER_INGREDIENTS_LI');
    (inventoryIngredientsSheet as any).setMockData([
      ['ID', 'Type', 'Label EN', 'Label FR', 'Label NL', 'Req', 'Opt EN', 'Opt FR', 'Opt NL'],
      ['ING', 'TEXT', 'Ingredient', 'Ingredient', 'Ingredient', false, '', '', ''],
      ['QTY', 'NUMBER', 'Quantity', 'Quantity', 'Quantity', false, '', '', ''],
      ['UNIT', 'TEXT', 'Unit', 'Unit', 'Unit', false, '', '', ''],
      ['CAT', 'TEXT', 'Category', 'Category', 'Category', false, '', '', ''],
      ['ALLERGEN', 'TEXT', 'Allergen', 'Allergen', 'Allergen', false, '', '', '']
    ]);

    const mealRows = [
      {
        __ckRowId: 'MEAL-1',
        MEAL_TYPE: 'Dinner',
        MP_LEFTOVER_PORTIONS_CAPTURE: 3,
        MP_TYPE_LI: [
          {
            __ckRowId: 'COOK-1',
            PREP_TYPE: 'Cook',
            RECIPE: 'Vegetable stew',
            MP_INGREDIENTS_LI: [{ ING: 'Carrot', QTY: 1, UNIT: 'kg', CAT: 'Vegetables', ALLERGEN: 'None' }]
          },
          {
            __ckRowId: 'COMBINE-1',
            PREP_TYPE: 'Multi-ingredient',
            PREP_QTY: 0,
            RECIPE: 'Courgette mix',
            MP_INGREDIENTS_LI: [{ ING: 'Courgette - frozen', QTY: 2, UNIT: 'kg', CAT: 'Frozen', ALLERGEN: 'None' }]
          },
          {
            __ckRowId: 'SINGLE-1',
            PREP_TYPE: 'Single-ingredient',
            RECIPE: 'Rice',
            MP_INGREDIENTS_LI: [{ ING: 'Rice', QTY: 500, UNIT: 'gr', CAT: 'Dry goods', ALLERGEN: 'None' }]
          },
          {
            __ckRowId: 'REHEAT-1',
            PREP_TYPE: 'Multi-ingredient',
            PREP_QTY: 2,
            RECIPE: 'Old soup',
            MP_INGREDIENTS_LI: [{ ING: 'Should stay out', QTY: 1, UNIT: 'kg', CAT: 'Frozen', ALLERGEN: 'None' }]
          }
        ]
      }
    ];

    const closed = service.saveSubmissionWithId({
      formKey: mealProductionFormKey,
      language: 'EN',
      id: 'MP-COMBINED-1',
      MP_MEALS_REQUEST_json: JSON.stringify(mealRows),
      __ckSaveMode: 'draft',
      __ckStatus: 'Closed'
    } as any);

    expect(closed.success).toBe(true);
    expect(closed.meta?.submitEffects).toEqual(
      expect.objectContaining({
        configured: 1,
        executed: 1,
        created: 1,
        operation: 'create'
      })
    );

    const generatedRecordId = 'leftover::MP-COMBINED-1::entire::Dinner';
    const savedInventory = service.fetchSubmissionById(inventoryFormKey, generatedRecordId);

    expect(savedInventory).toBeTruthy();
    expect(savedInventory?.values?.LEFTOVER_SOURCE_RECORD_ID).toBe('MP-COMBINED-1');
    expect(savedInventory?.values?.LEFTOVER_SOURCE_ROW_ID).toBe('COOK-1');
    expect(savedInventory?.values?.LEFTOVER_INGREDIENTS_LI).toEqual([
      { ING: 'Carrot', QTY: 1, UNIT: 'kg', CAT: 'Vegetables', ALLERGEN: 'None' },
      { ING: 'Courgette - frozen', QTY: 2, UNIT: 'kg', CAT: 'Frozen', ALLERGEN: 'None' },
      { ING: 'Rice', QTY: 500, UNIT: 'gr', CAT: 'Dry goods', ALLERGEN: 'None' }
    ]);
  });

  test('fetchSubmissionById hydrates meal production prep ingredients from linked leftovers for form view', () => {
    const mealProductionFormKey = 'Config: Meal Production';
    const inventoryFormKey = 'Config: Leftover Inventory';
    const dashboardSheet = ss.getSheetByName('Forms Dashboard') || ss.insertSheet('Forms Dashboard');
    (dashboardSheet as any).setMockData([
      [],
      [],
      ['Form Title', 'Configuration Sheet Name', 'Destination Tab Name', 'Description', 'Form ID', 'Edit URL', 'Published URL', 'Follow-up Config (JSON)'],
      ['Meal Production', mealProductionFormKey, 'Test Meal Production Fetch Hydration Data', 'Desc', '', '', '', ''],
      ['Leftover Inventory', inventoryFormKey, 'Leftover Inventory Data', 'Desc', '', '', '', '']
    ]);

    const mealProductionConfig = ss.insertSheet(mealProductionFormKey);
    (mealProductionConfig as any).setMockData([
      ['ID', 'Type', 'Q En', 'Q Fr', 'Q Nl', 'Req', 'Opt En', 'Opt Fr', 'Opt Nl', 'Status', 'Config', 'OptionFilter', 'Validation', 'List View?', 'Edit'],
      ['MP_MEALS_REQUEST', 'LINE_ITEM_GROUP', 'Meals request', 'Meals request', 'Meals request', false, '', '', '', 'Active', 'REF:LineItems_MP_MEALS_REQUEST', '', '', '', '']
    ]);

    const mealsRequestSheet = ss.insertSheet('LineItems_MP_MEALS_REQUEST');
    (mealsRequestSheet as any).setMockData([
      ['ID', 'Type', 'Label EN', 'Label FR', 'Label NL', 'Req', 'Opt EN', 'Opt FR', 'Opt NL'],
      ['MEAL_TYPE', 'TEXT', 'Meal type', 'Meal type', 'Meal type', false, '', '', '']
    ]);

    const inventoryConfig = ss.insertSheet(inventoryFormKey);
    (inventoryConfig as any).setMockData([
      ['ID', 'Type', 'Q En', 'Q Fr', 'Q Nl', 'Req', 'Opt En', 'Opt Fr', 'Opt Nl', 'Status', 'Config', 'OptionFilter', 'Validation', 'List View?', 'Edit'],
      ['LEFTOVER_KIND', 'TEXT', 'Kind', 'Kind', 'Kind', false, '', '', '', 'Active', '', '', '', '', ''],
      ['LEFTOVER_INGREDIENTS_LI', 'LINE_ITEM_GROUP', 'Ingredients', 'Ingredients', 'Ingredients', false, '', '', '', 'Active', 'REF:LineItems_LEFTOVER_INGREDIENTS_LI_FETCH', '', '', '', '']
    ]);

    const inventoryIngredientsSheet = ss.insertSheet('LineItems_LEFTOVER_INGREDIENTS_LI_FETCH');
    (inventoryIngredientsSheet as any).setMockData([
      ['ID', 'Type', 'Label EN', 'Label FR', 'Label NL', 'Req', 'Opt EN', 'Opt FR', 'Opt NL'],
      ['ING', 'TEXT', 'Ingredient', 'Ingredient', 'Ingredient', false, '', '', ''],
      ['QTY', 'NUMBER', 'Quantity', 'Quantity', 'Quantity', false, '', '', ''],
      ['UNIT', 'TEXT', 'Unit', 'Unit', 'Unit', false, '', '', ''],
      ['CAT', 'TEXT', 'Category', 'Category', 'Category', false, '', '', ''],
      ['ALLERGEN', 'TEXT', 'Allergen', 'Allergen', 'Allergen', false, '', '', '']
    ]);

    const leftover = service.saveSubmissionWithId({
      formKey: inventoryFormKey,
      language: 'EN',
      id: 'MI-TEST-1',
      LEFTOVER_KIND: 'Multi-ingredient',
      LEFTOVER_INGREDIENTS_LI: [
        { ING: 'Courgette - frozen', QTY: 2, UNIT: 'kg', CAT: 'Frozen', ALLERGEN: 'None' }
      ]
    } as any);
    expect(leftover.success).toBe(true);

    const mealSave = service.saveSubmissionWithId({
      formKey: mealProductionFormKey,
      language: 'EN',
      id: 'MP-FETCH-1',
      MP_MEALS_REQUEST: [
        {
          __ckRowId: 'MEAL-1',
          MEAL_TYPE: 'Dinner',
          MP_TYPE_LI: [
            {
              __ckRowId: 'COOK-1',
              PREP_TYPE: 'Cook',
              RECIPE: 'Vegetable stew',
              MP_INGREDIENTS_LI: [{ ING: 'Carrot', QTY: 1, UNIT: 'kg', CAT: 'Vegetables', ALLERGEN: 'None' }]
            },
            {
              __ckRowId: 'COMBINE-1',
              PREP_TYPE: 'Multi-ingredient',
              PREP_QTY: 0,
              LEFTOVER_RECORD_ID: 'MI-TEST-1'
            }
          ]
        }
      ],
      __ckSaveMode: 'draft',
      __ckStatus: 'In progress'
    } as any);
    expect(mealSave.success).toBe(true);

    const fetched = service.fetchSubmissionById(mealProductionFormKey, 'MP-FETCH-1');
    const mealRows = Array.isArray(fetched?.values?.MP_MEALS_REQUEST) ? fetched?.values?.MP_MEALS_REQUEST : [];
    const prepRows = Array.isArray(mealRows[0]?.MP_TYPE_LI) ? mealRows[0].MP_TYPE_LI : [];
    const combineRow = prepRows.find((row: any) => row?.__ckRowId === 'COMBINE-1');

    expect(combineRow?.MP_INGREDIENTS_LI).toEqual([
      { ING: 'Courgette - frozen', QTY: 2, UNIT: 'kg', CAT: 'Frozen', ALLERGEN: 'None' }
    ]);
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
        LEFTOVER_EXP_DATE: '2026-03-22',
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

  test('shouldApplyLifecycleRule supports onOrBeforeToday for inclusive expiry configs', () => {
    const rule = {
      type: 'dateStatusTransition',
      dateFieldId: 'LEFTOVER_EXP_DATE',
      statusFieldId: 'LEFTOVER_STATUS',
      fromStatuses: ['available'],
      toStatus: 'expired',
      compare: 'onOrBeforeToday'
    };

    expect((service as any).shouldApplyLifecycleRule(rule, 'available', '2026-03-21', '2026-03-21')).toBe(true);
    expect((service as any).shouldApplyLifecycleRule(rule, 'available', '2026-03-22', '2026-03-21')).toBe(false);
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

  test('applyInventoryReservationPlan refreshes stale form-backed datasource caches after noop inventory release writes', () => {
    const serverCache = installServerCacheMocks();
    const docProps = installDocumentPropertiesMocks();
    try {
      const { inventoryFormKey, ledgerFormKey } = setupInventoryReservationForms();
      const inventory = service.saveSubmissionWithId({
        formKey: inventoryFormKey,
        language: 'EN',
        LEFTOVER_ID: 'LP-CACHE-1',
        LEFTOVER_STATUS: 'available',
        LEFTOVER_KIND: 'Part dish',
        LEFTOVER_QTY: 500,
        LEFTOVER_UNIT: 'gr',
        LEFTOVER_RESERVED_QTY: 0
      } as any);
      expect(inventory.success).toBe(true);

      const dataSourceConfig = {
        id: 'Leftover Inventory Data',
        formKey: inventoryFormKey,
        mode: 'options',
        statusFieldId: 'LEFTOVER_STATUS',
        statusAllowList: ['available'],
        projection: [
          'id',
          'LEFTOVER_ID',
          'LEFTOVER_STATUS',
          'LEFTOVER_QTY',
          'LEFTOVER_RESERVED_QTY',
          'LEFTOVER_UNIT'
        ]
      } as any;

      const initial = service.fetchDataSource(dataSourceConfig, 'EN');
      expect(initial.items).toEqual([
        expect.objectContaining({
          LEFTOVER_ID: 'LP-CACHE-1',
          LEFTOVER_QTY: 500,
          LEFTOVER_RESERVED_QTY: 0,
          LEFTOVER_UNIT: 'gr',
          LEFTOVER_STATUS: 'available'
        })
      ]);

      const reserve = service.applyInventoryReservationPlan({
        sourceFormKey: 'Config: Delivery',
        sourceRecordId: 'REC-CACHE-1',
        ledgerFormKey,
        refreshMode: 'revisionOnly',
        managedScopes: [
          {
            sourceParentGroupId: 'MP_MEALS_REQUEST',
            sourceParentRowId: 'ROW-CACHE-1'
          }
        ],
        reservations: [
          {
            resourceFormKey: inventoryFormKey,
            resourceRecordId: (inventory.meta?.id || '').toString(),
            resourceItemId: 'LP-CACHE-1',
            resourceKind: 'Part dish',
            quantity: 500,
            unit: 'gr',
            sourceParentGroupId: 'MP_MEALS_REQUEST',
            sourceParentRowId: 'ROW-CACHE-1',
            quantityFieldId: 'LEFTOVER_QTY',
            reservedQuantityFieldId: 'LEFTOVER_RESERVED_QTY',
            statusFieldId: 'LEFTOVER_STATUS',
            unitFieldId: 'LEFTOVER_UNIT'
          }
        ]
      } as any);
      expect(reserve.success).toBe(true);

      const cachedWideProjection = service.fetchDataSource(dataSourceConfig, 'EN');
      expect(cachedWideProjection.items).toEqual([
        expect.objectContaining({
          LEFTOVER_ID: 'LP-CACHE-1',
          LEFTOVER_QTY: 500,
          LEFTOVER_RESERVED_QTY: 500,
          LEFTOVER_UNIT: 'gr',
          LEFTOVER_STATUS: 'available'
        })
      ]);

      const inventorySheet = ss.getSheetByName('Test Leftover Inventory Data');
      expect(inventorySheet).toBeDefined();
      const inventoryValues = inventorySheet!.getRange(1, 1, inventorySheet!.getLastRow(), inventorySheet!.getLastColumn()).getValues();
      const header = inventoryValues[0].map((value: any) => (value || '').toString().trim());
      const reservedQtyCol = header.findIndex((value: string) => /\[LEFTOVER_RESERVED_QTY\]\s*$/.test(value));
      expect(reservedQtyCol).toBeGreaterThanOrEqual(0);
      inventorySheet!.getRange((inventory.meta?.rowNumber || 0) as number, reservedQtyCol + 1, 1, 1).setValue(0);

      const refreshedRecord = service.fetchSubmissionById(inventoryFormKey, (inventory.meta?.id || '').toString());
      expect((refreshedRecord?.values as any)?.LEFTOVER_RESERVED_QTY).toBe(0);

      const staleWideProjection = service.fetchDataSource(dataSourceConfig, 'EN');
      expect(staleWideProjection.items).toEqual([
        expect.objectContaining({
          LEFTOVER_ID: 'LP-CACHE-1',
          LEFTOVER_QTY: 500,
          LEFTOVER_RESERVED_QTY: 500,
          LEFTOVER_UNIT: 'gr',
          LEFTOVER_STATUS: 'available'
        })
      ]);

      const release = service.applyInventoryReservationPlan({
        sourceFormKey: 'Config: Delivery',
        sourceRecordId: 'REC-CACHE-1',
        ledgerFormKey,
        refreshMode: 'revisionOnly',
        managedScopes: [
          {
            sourceParentGroupId: 'MP_MEALS_REQUEST',
            sourceParentRowId: 'ROW-CACHE-1'
          }
        ],
        reservations: []
      } as any);
      expect(release.success).toBe(true);

      const afterRelease = service.fetchDataSource(dataSourceConfig, 'EN');
      expect(afterRelease.items).toEqual([
        expect.objectContaining({
          LEFTOVER_ID: 'LP-CACHE-1',
          LEFTOVER_QTY: 500,
          LEFTOVER_RESERVED_QTY: 0,
          LEFTOVER_UNIT: 'gr',
          LEFTOVER_STATUS: 'available'
        })
      ]);
    } finally {
      docProps.restore();
      serverCache.restore();
    }
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

  test('upsertInventoryReservation retries transient reservation transaction lock failures', () => {
    const { inventoryFormKey, ledgerFormKey } = setupInventoryReservationForms();
    const inventory = service.saveSubmissionWithId({
      formKey: inventoryFormKey,
      language: 'EN',
      LEFTOVER_ID: 'LE-UPSERT-RETRY-1',
      LEFTOVER_STATUS: 'available',
      LEFTOVER_KIND: 'Entire dish',
      LEFTOVER_PORTIONS: 6,
      LEFTOVER_RESERVED_PORTIONS: 0
    } as any);
    expect(inventory.success).toBe(true);

    let tryLockCalls = 0;
    const docLock = installDocumentLockMocks(() => {
      tryLockCalls += 1;
      return tryLockCalls >= 2;
    });
    try {
      const result = service.upsertInventoryReservation({
        resourceFormKey: inventoryFormKey,
        resourceRecordId: (inventory.meta?.id || '').toString(),
        resourceItemId: 'LE-UPSERT-RETRY-1',
        resourceKind: 'Entire dish',
        quantity: 3,
        sourceFormKey: 'Config: Delivery',
        sourceRecordId: 'REC-UPSERT-RETRY-1',
        sourceParentGroupId: 'MP_MEALS_REQUEST',
        sourceParentRowId: 'ROW-UPSERT-RETRY-1',
        ledgerFormKey
      });

      expect(result.success).toBe(true);
      expect(docLock.lock.tryLock).toHaveBeenCalledTimes(2);
    } finally {
      docLock.restore();
    }
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

  test('applyInventoryReservationPlan replaces managed-scope reservations in one batch', () => {
    const { inventoryFormKey, ledgerFormKey } = setupInventoryReservationForms();
    const inventoryA = service.saveSubmissionWithId({
      formKey: inventoryFormKey,
      language: 'EN',
      LEFTOVER_ID: 'LE-PLAN-A',
      LEFTOVER_STATUS: 'available',
      LEFTOVER_KIND: 'Entire dish',
      LEFTOVER_PORTIONS: 10,
      LEFTOVER_RESERVED_PORTIONS: 0
    } as any);
    const inventoryB = service.saveSubmissionWithId({
      formKey: inventoryFormKey,
      language: 'EN',
      LEFTOVER_ID: 'LE-PLAN-B',
      LEFTOVER_STATUS: 'available',
      LEFTOVER_KIND: 'Entire dish',
      LEFTOVER_PORTIONS: 8,
      LEFTOVER_RESERVED_PORTIONS: 0
    } as any);
    expect(inventoryA.success).toBe(true);
    expect(inventoryB.success).toBe(true);

    const firstReservation = service.upsertInventoryReservation({
      resourceFormKey: inventoryFormKey,
      resourceRecordId: (inventoryA.meta?.id || '').toString(),
      resourceItemId: 'LE-PLAN-A',
      resourceKind: 'Entire dish',
      quantity: 4,
      sourceFormKey: 'Config: Meal Production',
      sourceRecordId: 'REC-PLAN-1',
      sourceParentGroupId: 'MP_MEALS_REQUEST',
      sourceParentRowId: 'ROW-1',
      sourceOutputGroupId: 'MP_TYPE_LI',
      ledgerFormKey
    });
    expect(firstReservation.success).toBe(true);

    const planResult = service.applyInventoryReservationPlan({
      sourceFormKey: 'Config: Meal Production',
      sourceRecordId: 'REC-PLAN-1',
      ledgerFormKey,
      managedScopes: [
        {
          sourceParentGroupId: 'MP_MEALS_REQUEST',
          sourceParentRowId: 'ROW-1',
          sourceOutputGroupId: 'MP_TYPE_LI'
        },
        {
          sourceParentGroupId: 'MP_MEALS_REQUEST',
          sourceParentRowId: 'ROW-2',
          sourceOutputGroupId: 'MP_TYPE_LI'
        }
      ],
      reservations: [
        {
          resourceFormKey: inventoryFormKey,
          resourceRecordId: (inventoryB.meta?.id || '').toString(),
          resourceItemId: 'LE-PLAN-B',
          resourceKind: 'Entire dish',
          quantity: 2,
          sourceParentGroupId: 'MP_MEALS_REQUEST',
          sourceParentRowId: 'ROW-2',
          sourceOutputGroupId: 'MP_TYPE_LI'
        }
      ]
    });

    expect(planResult.success).toBe(true);
    expect(planResult.reservationsApplied).toBe(1);
    expect(planResult.reservationsReleased).toBe(1);

    const updatedInventoryA = service.fetchSubmissionById(inventoryFormKey, (inventoryA.meta?.id || '').toString());
    const updatedInventoryB = service.fetchSubmissionById(inventoryFormKey, (inventoryB.meta?.id || '').toString());
    expect((updatedInventoryA?.values as any)?.LEFTOVER_RESERVED_PORTIONS).toBe(0);
    expect((updatedInventoryB?.values as any)?.LEFTOVER_RESERVED_PORTIONS).toBe(2);

    const releasedReservation = service.fetchSubmissionById(ledgerFormKey, (firstReservation.reservationId || '').toString());
    expect((releasedReservation?.values as any)?.STATUS).toBe('released');

    const expectedNextReservationId = (service as any).buildInventoryReservationId({
      resourceFormKey: inventoryFormKey,
      resourceRecordId: (inventoryB.meta?.id || '').toString(),
      resourceItemId: 'LE-PLAN-B',
      sourceFormKey: 'Config: Meal Production',
      sourceRecordId: 'REC-PLAN-1',
      sourceParentGroupId: 'MP_MEALS_REQUEST',
      sourceParentRowId: 'ROW-2'
    });
    const nextReservation = service.fetchSubmissionById(ledgerFormKey, expectedNextReservationId);
    expect((nextReservation?.values as any)?.STATUS).toBe('active');
    expect((nextReservation?.values as any)?.RESERVED_QTY).toBe(2);
  });

  test('applyInventoryReservationPlan reports safe source-record metadata for optimistic-lock adoption', () => {
    const { ledgerFormKey } = setupInventoryReservationForms();
    const createdSource = service.saveSubmissionWithId({
      formKey: 'Config: Delivery',
      language: 'EN',
      id: 'REC-PLAN-META',
      Q1: 'Alice',
      Q2_json: JSON.stringify([]),
      Q3: [],
      Q4: 'ACME',
      __ckSaveMode: 'draft',
      __ckStatus: 'In progress'
    } as any);
    expect(createdSource.success).toBe(true);

    const matched = service.applyInventoryReservationPlan({
      sourceFormKey: 'Config: Delivery',
      sourceRecordId: 'REC-PLAN-META',
      ledgerFormKey,
      clientDataVersion: createdSource.meta?.dataVersion,
      managedScopes: [],
      reservations: []
    });

    expect(matched.success).toBe(true);
    expect(matched.sourceClientDataVersionMatched).toBe(true);
    expect(matched.sourceRecordMeta).toEqual(
      expect.objectContaining({
        id: 'REC-PLAN-META',
        dataVersion: createdSource.meta?.dataVersion,
        rowNumber: createdSource.meta?.rowNumber,
        updatedAt: createdSource.meta?.updatedAt
      })
    );

    const updatedSource = service.saveSubmissionWithId({
      formKey: 'Config: Delivery',
      language: 'EN',
      id: 'REC-PLAN-META',
      Q1: 'Alice Updated',
      Q2_json: JSON.stringify([]),
      Q3: [],
      Q4: 'ACME',
      __ckSaveMode: 'draft',
      __ckStatus: 'In progress',
      __ckClientDataVersion: createdSource.meta?.dataVersion
    } as any);
    expect(updatedSource.success).toBe(true);

    const stale = service.applyInventoryReservationPlan({
      sourceFormKey: 'Config: Delivery',
      sourceRecordId: 'REC-PLAN-META',
      ledgerFormKey,
      clientDataVersion: createdSource.meta?.dataVersion,
      managedScopes: [],
      reservations: []
    });

    expect(stale.success).toBe(true);
    expect(stale.sourceClientDataVersionMatched).toBe(false);
    expect(stale.sourceRecordMeta).toEqual(
      expect.objectContaining({
        id: 'REC-PLAN-META',
        dataVersion: updatedSource.meta?.dataVersion,
        rowNumber: updatedSource.meta?.rowNumber,
        updatedAt: updatedSource.meta?.updatedAt
      })
    );
  });

  test('applyInventoryReservationPlan reuses a single active-ledger scan for the batch', () => {
    const { inventoryFormKey, ledgerFormKey } = setupInventoryReservationForms();
    const inventoryA = service.saveSubmissionWithId({
      formKey: inventoryFormKey,
      language: 'EN',
      LEFTOVER_ID: 'LE-BATCH-A',
      LEFTOVER_STATUS: 'available',
      LEFTOVER_KIND: 'Entire dish',
      LEFTOVER_PORTIONS: 10,
      LEFTOVER_RESERVED_PORTIONS: 0
    } as any);
    const inventoryB = service.saveSubmissionWithId({
      formKey: inventoryFormKey,
      language: 'EN',
      LEFTOVER_ID: 'LE-BATCH-B',
      LEFTOVER_STATUS: 'available',
      LEFTOVER_KIND: 'Entire dish',
      LEFTOVER_PORTIONS: 8,
      LEFTOVER_RESERVED_PORTIONS: 0
    } as any);
    expect(inventoryA.success).toBe(true);
    expect(inventoryB.success).toBe(true);

    const seededReservation = service.upsertInventoryReservation({
      resourceFormKey: inventoryFormKey,
      resourceRecordId: (inventoryA.meta?.id || '').toString(),
      resourceItemId: 'LE-BATCH-A',
      resourceKind: 'Entire dish',
      quantity: 4,
      sourceFormKey: 'Config: Meal Production',
      sourceRecordId: 'REC-BATCH-1',
      sourceParentGroupId: 'MP_MEALS_REQUEST',
      sourceParentRowId: 'ROW-1',
      sourceOutputGroupId: 'MP_TYPE_LI',
      ledgerFormKey
    });
    expect(seededReservation.success).toBe(true);

    const fetchByCriteriaSpy = jest.spyOn(service as any, 'fetchSubmissionRecordsByFieldCriteria');
    fetchByCriteriaSpy.mockClear();

    const result = service.applyInventoryReservationPlan({
      sourceFormKey: 'Config: Meal Production',
      sourceRecordId: 'REC-BATCH-1',
      ledgerFormKey,
      managedScopes: [
        {
          sourceParentGroupId: 'MP_MEALS_REQUEST',
          sourceParentRowId: 'ROW-1',
          sourceOutputGroupId: 'MP_TYPE_LI'
        },
        {
          sourceParentGroupId: 'MP_MEALS_REQUEST',
          sourceParentRowId: 'ROW-2',
          sourceOutputGroupId: 'MP_TYPE_LI'
        }
      ],
      reservations: [
        {
          resourceFormKey: inventoryFormKey,
          resourceRecordId: (inventoryA.meta?.id || '').toString(),
          resourceItemId: 'LE-BATCH-A',
          resourceKind: 'Entire dish',
          quantity: 2,
          sourceParentGroupId: 'MP_MEALS_REQUEST',
          sourceParentRowId: 'ROW-1',
          sourceOutputGroupId: 'MP_TYPE_LI'
        },
        {
          resourceFormKey: inventoryFormKey,
          resourceRecordId: (inventoryB.meta?.id || '').toString(),
          resourceItemId: 'LE-BATCH-B',
          resourceKind: 'Entire dish',
          quantity: 3,
          sourceParentGroupId: 'MP_MEALS_REQUEST',
          sourceParentRowId: 'ROW-2',
          sourceOutputGroupId: 'MP_TYPE_LI'
        }
      ]
    });

    expect(result.success).toBe(true);
    const criteriaCalls = fetchByCriteriaSpy.mock.calls.map(
      call => (call[2] || []) as Array<{ fieldId: string; expected: string }>
    );
    const activeStatusCalls = criteriaCalls.filter(criteria =>
      criteria.some(entry => entry.fieldId === 'STATUS' && entry.expected === 'active')
    );
    expect(activeStatusCalls).toHaveLength(1);
    expect(
      criteriaCalls.some(criteria => criteria.some(entry => entry.fieldId === 'RESOURCE_FORM_KEY' || entry.fieldId === 'RESOURCE_RECORD_ID'))
    ).toBe(false);
  });

  test('applyInventoryReservationPlan batches internal ledger and inventory writes', () => {
    const { inventoryFormKey, ledgerFormKey } = setupInventoryReservationForms();
    const inventoryA = service.saveSubmissionWithId({
      formKey: inventoryFormKey,
      language: 'EN',
      LEFTOVER_ID: 'LE-BATCH-WRITE-A',
      LEFTOVER_STATUS: 'available',
      LEFTOVER_KIND: 'Entire dish',
      LEFTOVER_PORTIONS: 10,
      LEFTOVER_RESERVED_PORTIONS: 0
    } as any);
    const inventoryB = service.saveSubmissionWithId({
      formKey: inventoryFormKey,
      language: 'EN',
      LEFTOVER_ID: 'LE-BATCH-WRITE-B',
      LEFTOVER_STATUS: 'available',
      LEFTOVER_KIND: 'Entire dish',
      LEFTOVER_PORTIONS: 8,
      LEFTOVER_RESERVED_PORTIONS: 0
    } as any);
    expect(inventoryA.success).toBe(true);
    expect(inventoryB.success).toBe(true);

    const firstReservation = service.upsertInventoryReservation({
      resourceFormKey: inventoryFormKey,
      resourceRecordId: (inventoryA.meta?.id || '').toString(),
      resourceItemId: 'LE-BATCH-WRITE-A',
      resourceKind: 'Entire dish',
      quantity: 4,
      sourceFormKey: 'Config: Meal Production',
      sourceRecordId: 'REC-BATCH-WRITE-1',
      sourceParentGroupId: 'MP_MEALS_REQUEST',
      sourceParentRowId: 'ROW-1',
      sourceOutputGroupId: 'MP_TYPE_LI',
      ledgerFormKey
    });
    expect(firstReservation.success).toBe(true);

    const batchSpy = jest.spyOn((service as any).submissions, 'saveTrustedSubmissionBatch');

    const result = service.applyInventoryReservationPlan({
      sourceFormKey: 'Config: Meal Production',
      sourceRecordId: 'REC-BATCH-WRITE-1',
      ledgerFormKey,
      managedScopes: [
        {
          sourceParentGroupId: 'MP_MEALS_REQUEST',
          sourceParentRowId: 'ROW-1',
          sourceOutputGroupId: 'MP_TYPE_LI'
        },
        {
          sourceParentGroupId: 'MP_MEALS_REQUEST',
          sourceParentRowId: 'ROW-2',
          sourceOutputGroupId: 'MP_TYPE_LI'
        }
      ],
      reservations: [
        {
          resourceFormKey: inventoryFormKey,
          resourceRecordId: (inventoryA.meta?.id || '').toString(),
          resourceItemId: 'LE-BATCH-WRITE-A',
          resourceKind: 'Entire dish',
          quantity: 2,
          sourceParentGroupId: 'MP_MEALS_REQUEST',
          sourceParentRowId: 'ROW-1',
          sourceOutputGroupId: 'MP_TYPE_LI'
        },
        {
          resourceFormKey: inventoryFormKey,
          resourceRecordId: (inventoryB.meta?.id || '').toString(),
          resourceItemId: 'LE-BATCH-WRITE-B',
          resourceKind: 'Entire dish',
          quantity: 3,
          sourceParentGroupId: 'MP_MEALS_REQUEST',
          sourceParentRowId: 'ROW-2',
          sourceOutputGroupId: 'MP_TYPE_LI'
        }
      ]
    });

    expect(result.success).toBe(true);
    expect(batchSpy).toHaveBeenCalledTimes(2);
    const savedCounts = batchSpy.mock.calls.map(call => (Array.isArray(call[0]) ? call[0].length : 0)).sort((a, b) => a - b);
    expect(savedCounts).toEqual([2, 2]);
  });

  test('applyInventoryReservationPlan releases deleted output-row reservations within the same parent row', () => {
    const { inventoryFormKey, ledgerFormKey } = setupInventoryReservationForms();
    const inventoryA = service.saveSubmissionWithId({
      formKey: inventoryFormKey,
      language: 'EN',
      LEFTOVER_ID: 'LE-DEL-A',
      LEFTOVER_STATUS: 'available',
      LEFTOVER_KIND: 'Entire dish',
      LEFTOVER_PORTIONS: 10,
      LEFTOVER_RESERVED_PORTIONS: 0
    } as any);
    const inventoryB = service.saveSubmissionWithId({
      formKey: inventoryFormKey,
      language: 'EN',
      LEFTOVER_ID: 'LE-DEL-B',
      LEFTOVER_STATUS: 'available',
      LEFTOVER_KIND: 'Entire dish',
      LEFTOVER_PORTIONS: 8,
      LEFTOVER_RESERVED_PORTIONS: 0
    } as any);
    expect(inventoryA.success).toBe(true);
    expect(inventoryB.success).toBe(true);

    const reservationA = service.upsertInventoryReservation({
      resourceFormKey: inventoryFormKey,
      resourceRecordId: (inventoryA.meta?.id || '').toString(),
      resourceItemId: 'LE-DEL-A',
      resourceKind: 'Entire dish',
      quantity: 4,
      sourceFormKey: 'Config: Meal Production',
      sourceRecordId: 'REC-DEL-1',
      sourceParentGroupId: 'MP_MEALS_REQUEST',
      sourceParentRowId: 'ROW-1',
      sourceOutputGroupId: 'MP_TYPE_LI',
      sourceOutputRowId: 'OUT-1',
      ledgerFormKey
    });
    const reservationB = service.upsertInventoryReservation({
      resourceFormKey: inventoryFormKey,
      resourceRecordId: (inventoryB.meta?.id || '').toString(),
      resourceItemId: 'LE-DEL-B',
      resourceKind: 'Entire dish',
      quantity: 3,
      sourceFormKey: 'Config: Meal Production',
      sourceRecordId: 'REC-DEL-1',
      sourceParentGroupId: 'MP_MEALS_REQUEST',
      sourceParentRowId: 'ROW-1',
      sourceOutputGroupId: 'MP_TYPE_LI',
      sourceOutputRowId: 'OUT-2',
      ledgerFormKey
    });
    expect(reservationA.success).toBe(true);
    expect(reservationB.success).toBe(true);

    const result = service.applyInventoryReservationPlan({
      sourceFormKey: 'Config: Meal Production',
      sourceRecordId: 'REC-DEL-1',
      ledgerFormKey,
      managedScopes: [
        {
          sourceParentGroupId: 'MP_MEALS_REQUEST',
          sourceParentRowId: 'ROW-1',
          sourceOutputGroupId: 'MP_TYPE_LI'
        }
      ],
      reservations: [
        {
          resourceFormKey: inventoryFormKey,
          resourceRecordId: (inventoryB.meta?.id || '').toString(),
          resourceItemId: 'LE-DEL-B',
          resourceKind: 'Entire dish',
          quantity: 3,
          sourceParentGroupId: 'MP_MEALS_REQUEST',
          sourceParentRowId: 'ROW-1',
          sourceOutputGroupId: 'MP_TYPE_LI',
          sourceOutputRowId: 'OUT-2',
          sourceOutputKeyFieldId: 'LEFTOVER_ID'
        }
      ]
    });

    expect(result.success).toBe(true);
    const releasedReservation = service.fetchSubmissionById(ledgerFormKey, (reservationA.reservationId || '').toString());
    const preservedReservation = service.fetchSubmissionById(ledgerFormKey, (reservationB.reservationId || '').toString());
    expect((releasedReservation?.values as any)?.STATUS).toBe('released');
    expect((preservedReservation?.values as any)?.STATUS).toBe('active');

    const updatedInventoryA = service.fetchSubmissionById(inventoryFormKey, (inventoryA.meta?.id || '').toString());
    const updatedInventoryB = service.fetchSubmissionById(inventoryFormKey, (inventoryB.meta?.id || '').toString());
    expect((updatedInventoryA?.values as any)?.LEFTOVER_RESERVED_PORTIONS).toBe(0);
    expect((updatedInventoryB?.values as any)?.LEFTOVER_RESERVED_PORTIONS).toBe(3);
  });

  test('applyInventoryReservationPlan releases legacy reservations whose output group id was stored as the output row id', () => {
    const { inventoryFormKey, ledgerFormKey } = setupInventoryReservationForms();
    const inventory = service.saveSubmissionWithId({
      formKey: inventoryFormKey,
      language: 'EN',
      LEFTOVER_ID: 'LE-LEGACY-SCOPE',
      LEFTOVER_STATUS: 'available',
      LEFTOVER_KIND: 'Entire dish',
      LEFTOVER_PORTIONS: 5,
      LEFTOVER_RESERVED_PORTIONS: 0
    } as any);
    expect(inventory.success).toBe(true);

    const legacyOutputRowId = 'MP_TYPE_LI_legacy123';
    const legacyReservation = service.upsertInventoryReservation({
      resourceFormKey: inventoryFormKey,
      resourceRecordId: (inventory.meta?.id || '').toString(),
      resourceItemId: 'LE-LEGACY-SCOPE',
      resourceKind: 'Entire dish',
      quantity: 5,
      sourceFormKey: 'Config: Meal Production',
      sourceRecordId: 'REC-LEGACY-SCOPE-1',
      sourceParentGroupId: 'MP_MEALS_REQUEST',
      sourceParentRowId: 'ROW-1',
      sourceOutputGroupId: legacyOutputRowId,
      sourceOutputRowId: legacyOutputRowId,
      sourceOutputKeyFieldId: 'LEFTOVER_ID',
      ledgerFormKey
    });
    expect(legacyReservation.success).toBe(true);

    const nextOutputRowId = 'MP_TYPE_LI_next456';
    const result = service.applyInventoryReservationPlan({
      sourceFormKey: 'Config: Meal Production',
      sourceRecordId: 'REC-LEGACY-SCOPE-1',
      ledgerFormKey,
      managedScopes: [
        {
          sourceParentGroupId: 'MP_MEALS_REQUEST',
          sourceParentRowId: 'ROW-1',
          sourceOutputGroupId: 'MP_TYPE_LI'
        }
      ],
      reservations: [
        {
          resourceFormKey: inventoryFormKey,
          resourceRecordId: (inventory.meta?.id || '').toString(),
          resourceItemId: 'LE-LEGACY-SCOPE',
          resourceKind: 'Entire dish',
          quantity: 5,
          sourceParentGroupId: 'MP_MEALS_REQUEST',
          sourceParentRowId: 'ROW-1',
          sourceOutputGroupId: 'MP_TYPE_LI',
          sourceOutputRowId: nextOutputRowId,
          sourceOutputKeyFieldId: 'LEFTOVER_ID'
        }
      ]
    });

    expect(result.success).toBe(true);
    expect(result.conflict).not.toBe(true);
    expect(result.reservationsApplied).toBe(1);
    expect(result.reservationsReleased).toBe(1);

    const releasedLegacyReservation = service.fetchSubmissionById(
      ledgerFormKey,
      (legacyReservation.reservationId || '').toString()
    );
    expect((releasedLegacyReservation?.values as any)?.STATUS).toBe('released');

    const nextReservationId = (service as any).buildInventoryReservationId({
      resourceFormKey: inventoryFormKey,
      resourceRecordId: (inventory.meta?.id || '').toString(),
      resourceItemId: 'LE-LEGACY-SCOPE',
      sourceFormKey: 'Config: Meal Production',
      sourceRecordId: 'REC-LEGACY-SCOPE-1',
      sourceParentGroupId: 'MP_MEALS_REQUEST',
      sourceParentRowId: 'ROW-1',
      sourceOutputRowId: nextOutputRowId
    });
    const nextReservation = service.fetchSubmissionById(ledgerFormKey, nextReservationId);
    expect((nextReservation?.values as any)?.STATUS).toBe('active');

    const updatedInventory = service.fetchSubmissionById(inventoryFormKey, (inventory.meta?.id || '').toString());
    expect((updatedInventory?.values as any)?.LEFTOVER_RESERVED_PORTIONS).toBe(5);
  });

  test('applyInventoryReservationPlan reports the final availability snapshot after releases and re-applies on the same resource', () => {
    const { inventoryFormKey, ledgerFormKey } = setupInventoryReservationForms();
    const inventory = service.saveSubmissionWithId({
      formKey: inventoryFormKey,
      language: 'EN',
      LEFTOVER_ID: 'LE-PLAN-FINAL',
      LEFTOVER_STATUS: 'available',
      LEFTOVER_KIND: 'Entire dish',
      LEFTOVER_PORTIONS: 5,
      LEFTOVER_RESERVED_PORTIONS: 0
    } as any);
    expect(inventory.success).toBe(true);

    const reservationA = service.upsertInventoryReservation({
      resourceFormKey: inventoryFormKey,
      resourceRecordId: (inventory.meta?.id || '').toString(),
      resourceItemId: 'LE-PLAN-FINAL',
      resourceKind: 'Entire dish',
      quantity: 3,
      sourceFormKey: 'Config: Meal Production',
      sourceRecordId: 'REC-PLAN-FINAL-1',
      sourceParentGroupId: 'MP_MEALS_REQUEST',
      sourceParentRowId: 'ROW-1',
      sourceOutputGroupId: 'MP_TYPE_LI',
      sourceOutputRowId: 'OUT-1',
      sourceOutputKeyFieldId: 'LEFTOVER_ID',
      ledgerFormKey
    });
    const reservationB = service.upsertInventoryReservation({
      resourceFormKey: inventoryFormKey,
      resourceRecordId: (inventory.meta?.id || '').toString(),
      resourceItemId: 'LE-PLAN-FINAL',
      resourceKind: 'Entire dish',
      quantity: 2,
      sourceFormKey: 'Config: Meal Production',
      sourceRecordId: 'REC-PLAN-FINAL-1',
      sourceParentGroupId: 'MP_MEALS_REQUEST',
      sourceParentRowId: 'ROW-2',
      sourceOutputGroupId: 'MP_TYPE_LI',
      sourceOutputRowId: 'OUT-2',
      sourceOutputKeyFieldId: 'LEFTOVER_ID',
      ledgerFormKey
    });
    expect(reservationA.success).toBe(true);
    expect(reservationB.success).toBe(true);

    const result = service.applyInventoryReservationPlan({
      sourceFormKey: 'Config: Meal Production',
      sourceRecordId: 'REC-PLAN-FINAL-1',
      ledgerFormKey,
      managedScopes: [
        {
          sourceParentGroupId: 'MP_MEALS_REQUEST',
          sourceParentRowId: 'ROW-1',
          sourceOutputGroupId: 'MP_TYPE_LI'
        },
        {
          sourceParentGroupId: 'MP_MEALS_REQUEST',
          sourceParentRowId: 'ROW-2',
          sourceOutputGroupId: 'MP_TYPE_LI'
        }
      ],
      reservations: [
        {
          resourceFormKey: inventoryFormKey,
          resourceRecordId: (inventory.meta?.id || '').toString(),
          resourceItemId: 'LE-PLAN-FINAL',
          resourceKind: 'Entire dish',
          quantity: 2,
          sourceParentGroupId: 'MP_MEALS_REQUEST',
          sourceParentRowId: 'ROW-1',
          sourceOutputGroupId: 'MP_TYPE_LI',
          sourceOutputRowId: 'OUT-1',
          sourceOutputKeyFieldId: 'LEFTOVER_ID'
        },
        {
          resourceFormKey: inventoryFormKey,
          resourceRecordId: (inventory.meta?.id || '').toString(),
          resourceItemId: 'LE-PLAN-FINAL',
          resourceKind: 'Entire dish',
          quantity: 2,
          sourceParentGroupId: 'MP_MEALS_REQUEST',
          sourceParentRowId: 'ROW-2',
          sourceOutputGroupId: 'MP_TYPE_LI',
          sourceOutputRowId: 'OUT-2',
          sourceOutputKeyFieldId: 'LEFTOVER_ID'
        }
      ]
    });

    expect(result.success).toBe(true);
    expect(result.availability).toEqual([
      expect.objectContaining({
        resourceItemId: 'LE-PLAN-FINAL',
        reservedQuantity: 4,
        currentRecordReservedQuantity: 4,
        freeQuantity: 1
      })
    ]);
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

  test('saveSubmissionWithId uses revision-only refresh for user draft saves', () => {
    const refreshMutationSpy = jest.spyOn(service as any, 'refreshMutationCaches');
    const refreshAnalyticsSpy = jest.spyOn(service as any, 'refreshAnalyticsAndHomeBootstrap');
    const bumpSpy = jest.spyOn(service as any, 'bumpHomeRevision');

    const result = service.saveSubmissionWithId({
      formKey: 'Config: Delivery',
      language: 'EN',
      id: 'REC-DRAFT-REFRESH',
      Q1: 'Alice',
      Q2_json: JSON.stringify([]),
      Q3: [],
      Q4: 'ACME',
      __ckSaveMode: 'draft',
      __ckStatus: 'In progress'
    } as any);

    expect(result.success).toBe(true);
    expect(refreshMutationSpy).toHaveBeenCalledWith(
      expect.objectContaining({ configSheet: 'Config: Delivery' }),
      expect.any(Array),
      'saveSubmissionWithId',
      'revisionOnly'
    );
    expect(refreshAnalyticsSpy).not.toHaveBeenCalled();
    expect(bumpSpy).toHaveBeenCalledWith('Config: Delivery', 'saveSubmissionWithId');
  });

  test('saveSubmissionWithId skips post-save refresh on noop updates', () => {
    service.saveSubmissionWithId({
      formKey: 'Config: Delivery',
      language: 'EN',
      id: 'REC-NOOP-REFRESH',
      Q1: 'Alice',
      Q2_json: JSON.stringify([]),
      Q3: [],
      Q4: 'ACME',
      __ckSaveMode: 'draft',
      __ckStatus: 'In progress'
    } as any);

    const refreshMutationSpy = jest.spyOn(service as any, 'refreshMutationCaches');
    const refreshAnalyticsSpy = jest.spyOn(service as any, 'refreshAnalyticsAndHomeBootstrap');
    const bumpSpy = jest.spyOn(service as any, 'bumpHomeRevision');

    const result = service.saveSubmissionWithId({
      formKey: 'Config: Delivery',
      language: 'EN',
      id: 'REC-NOOP-REFRESH',
      Q1: 'Alice',
      Q2_json: JSON.stringify([]),
      Q3: [],
      Q4: 'ACME',
      __ckSaveMode: 'draft',
      __ckStatus: 'In progress'
    } as any);

    expect(result.success).toBe(true);
    expect(result.meta?.operation).toBe('noop');
    expect(refreshMutationSpy).not.toHaveBeenCalled();
    expect(refreshAnalyticsSpy).not.toHaveBeenCalled();
    expect(bumpSpy).not.toHaveBeenCalled();
  });

  test('saveSubmissionWithId accepts compact values-only payloads', () => {
    const result = service.saveSubmissionWithId({
      formKey: 'Config: Delivery',
      language: 'EN',
      id: 'REC-COMPACT-PAYLOAD-1',
      values: {
        Q1: 'Alice',
        Q2_json: JSON.stringify([]),
        Q3: [],
        Q4: 'ACME'
      }
    } as any);

    expect(result.success).toBe(true);
    const saved = service.fetchSubmissionById('Config: Delivery', 'REC-COMPACT-PAYLOAD-1');
    expect(saved?.values?.Q1).toBe('Alice');
    expect(saved?.values?.Q4).toBe('ACME');
    expect(Array.isArray((saved?.values as any)?.Q2)).toBe(true);
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

  test('RECONCILE_RESERVATIONS reuses the outer document lock while saving inventory and ledger rows', () => {
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
      id: 'REC-LOCK-1',
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
      LEFTOVER_ID: 'LE-LOCK-1',
      LEFTOVER_STATUS: 'available',
      LEFTOVER_KIND: 'Entire dish',
      LEFTOVER_PORTIONS: 4,
      LEFTOVER_RESERVED_PORTIONS: 0
    } as any);
    expect(inventory.success).toBe(true);

    const reserved = service.upsertInventoryReservation({
      resourceFormKey: inventoryFormKey,
      resourceRecordId: (inventory.meta?.id || '').toString(),
      resourceItemId: 'LE-LOCK-1',
      resourceKind: 'Entire dish',
      quantity: 2,
      sourceFormKey: 'Config: Delivery',
      sourceRecordId: 'REC-LOCK-1',
      sourceParentGroupId: 'MP_MEALS_REQUEST',
      sourceParentRowId: 'ROW-LOCK-1',
      ledgerFormKey
    });
    expect(reserved.success).toBe(true);

    const docLock = installDocumentLockMocks();
    try {
      const result = service.triggerFollowupAction('Config: Delivery', 'REC-LOCK-1', 'RECONCILE_RESERVATIONS');
      expect(result.success).toBe(true);
      expect(docLock.lock.tryLock).toHaveBeenCalledTimes(1);
    } finally {
      docLock.restore();
    }
  });

  test('triggerFollowupActions stops the batch after the first failed action', () => {
    jest.spyOn(service as any, 'refreshAnalyticsAndHomeBootstrap').mockImplementation(() => {});
    const actionSpy = jest
      .spyOn(service as any, 'runFollowupActionWithLifecycle')
      .mockImplementation((...args: any[]) => {
        const action = args[4];
        if (action === 'RECONCILE_RESERVATIONS') {
          return {
            success: false,
            message: 'Reservation reconciliation is not configured for this form.'
          };
        }
        return {
          success: true,
          status: `${action} done`,
          updatedAt: '2026-04-08T10:00:00.000Z'
        };
      });

    const result = service.triggerFollowupActions('Config: Delivery', 'REC-STOP-1', [
      'RECONCILE_RESERVATIONS',
      'CLOSE_RECORD'
    ]);

    expect(actionSpy).toHaveBeenCalledTimes(1);
    expect(result.success).toBe(false);
    expect(result.results[0].action).toBe('RECONCILE_RESERVATIONS');
    expect(result.results[0].result?.success).toBe(false);
    expect(result.results[1].action).toBe('CLOSE_RECORD');
    expect(result.results[1].result?.success).toBe(false);
    expect(result.results[1].result?.message).toContain('Skipped because RECONCILE_RESERVATIONS failed.');
  });

  test('triggerFollowupActions retries transient reservation reconciliation lock failures', () => {
    jest.spyOn(service as any, 'refreshAnalyticsAndHomeBootstrap').mockImplementation(() => {});
    const actionSpy = jest
      .spyOn(service as any, 'runFollowupActionWithLifecycle')
      .mockImplementationOnce(() => ({
        success: false,
        message: 'Could not acquire the record save lock. Please retry.'
      }))
      .mockImplementationOnce(() => ({
        success: true,
        updatedAt: '2026-04-08T10:00:00.000Z'
      }));

    const result = service.triggerFollowupActions('Config: Delivery', 'REC-RETRY-1', ['RECONCILE_RESERVATIONS']);

    expect(actionSpy).toHaveBeenCalledTimes(2);
    expect(result.success).toBe(true);
    expect(result.results[0].result?.success).toBe(true);
  });

  test('triggerFollowupActions waits for earlier queued batch on the same record', () => {
    const lane = installFollowupLaneMocks();
    try {
      jest.spyOn(service as any, 'refreshAnalyticsAndHomeBootstrap').mockImplementation(() => {});
      const actionSpy = jest
        .spyOn(service as any, 'runFollowupActionWithLifecycle')
        .mockImplementation((...args: any[]) => ({
          success: true,
          status: `${args[4]} done`,
          updatedAt: '2026-04-08T10:00:00.000Z'
        }));

      const laneKey = (service as any).followupLanePropertyKey('Config: Delivery', 'REC-QUEUE-1');
      lane.store.set(
        laneKey,
        JSON.stringify({
          lastIssuedSeq: 1,
          nextSeq: 1,
          owner: {
            token: 'active-batch',
            sequence: 1,
            expiresAtMs: Date.now() + 60_000
          }
        })
      );

      (global as any).Utilities.sleep.mockImplementation(() => {
        lane.store.set(
          laneKey,
          JSON.stringify({
            lastIssuedSeq: 2,
            nextSeq: 2
          })
        );
      });

      const result = service.triggerFollowupActions('Config: Delivery', 'REC-QUEUE-1', ['CREATE_PDF', 'SEND_EMAIL']);

      expect((global as any).Utilities.sleep).toHaveBeenCalled();
      expect(actionSpy).toHaveBeenCalledTimes(2);
      expect(actionSpy.mock.calls.map(call => call[4])).toEqual(['CREATE_PDF', 'SEND_EMAIL']);
      expect(result.success).toBe(true);
      expect(lane.store.has(laneKey)).toBe(false);
    } finally {
      lane.restore();
    }
  });

  test('triggerFollowupActions does not block unrelated records on a different lane', () => {
    const lane = installFollowupLaneMocks();
    try {
      jest.spyOn(service as any, 'refreshAnalyticsAndHomeBootstrap').mockImplementation(() => {});
      const actionSpy = jest
        .spyOn(service as any, 'runFollowupActionWithLifecycle')
        .mockImplementation((...args: any[]) => ({
          success: true,
          status: `${args[4]} done`,
          updatedAt: '2026-04-08T10:00:00.000Z'
        }));

      const busyLaneKey = (service as any).followupLanePropertyKey('Config: Delivery', 'REC-BUSY');
      lane.store.set(
        busyLaneKey,
        JSON.stringify({
          lastIssuedSeq: 1,
          nextSeq: 1,
          owner: {
            token: 'active-batch',
            sequence: 1,
            expiresAtMs: Date.now() + 60_000
          }
        })
      );

      const result = service.triggerFollowupActions('Config: Delivery', 'REC-FREE', ['CLOSE_RECORD']);

      expect((global as any).Utilities.sleep).not.toHaveBeenCalled();
      expect(actionSpy).toHaveBeenCalledTimes(1);
      expect(actionSpy.mock.calls[0][3]).toBe('REC-FREE');
      expect(result.success).toBe(true);
    } finally {
      lane.restore();
    }
  });

  test('saveSubmissionWithId waits for an earlier same-record mutation lane owner before saving', () => {
    const lane = installFollowupLaneMocks();
    try {
      const mutationLaneKey = (service as any).recordMutationLanePropertyKey('Config: Delivery', 'REC-SAVE-WAIT-1');
      lane.store.set(
        mutationLaneKey,
        JSON.stringify({
          lastIssuedSeq: 1,
          nextSeq: 1,
          owner: {
            token: 'active-followup',
            sequence: 1,
            expiresAtMs: Date.now() + 60_000
          }
        })
      );

      (global as any).Utilities.sleep.mockImplementation(() => {
        lane.store.set(
          mutationLaneKey,
          JSON.stringify({
            lastIssuedSeq: 2,
            nextSeq: 2
          })
        );
      });

      const result = service.saveSubmissionWithId({
        formKey: 'Config: Delivery',
        language: 'EN',
        id: 'REC-SAVE-WAIT-1',
        Q1: 'Alice',
        Q2_json: JSON.stringify([]),
        Q3: [],
        Q4: 'ACME'
      } as any);

      expect((global as any).Utilities.sleep).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(lane.store.has(mutationLaneKey)).toBe(false);
    } finally {
      lane.restore();
    }
  });

  test('saveSubmissionWithId retries transient record save lock failures', () => {
    const submissions = (service as any).submissions;
    const actualSave = submissions.saveSubmissionWithId.bind(submissions);
    const saveSpy = jest
      .spyOn(submissions, 'saveSubmissionWithId')
      .mockImplementationOnce(() => ({
        success: false,
        message: 'Could not acquire the record save lock. Please retry.',
        meta: {}
      }))
      .mockImplementation((...args: any[]) => actualSave(...args));

    const result = service.saveSubmissionWithId({
      formKey: 'Config: Delivery',
      language: 'EN',
      id: 'REC-SAVE-RETRY-1',
      Q1: 'Alice',
      Q2_json: JSON.stringify([]),
      Q3: [],
      Q4: 'ACME'
    } as any);

    expect(saveSpy).toHaveBeenCalledTimes(2);
    expect((global as any).Utilities.sleep).toHaveBeenCalledWith(900);
    expect(result.success).toBe(true);
    expect(service.fetchSubmissionById('Config: Delivery', 'REC-SAVE-RETRY-1')?.values?.Q1).toBe('Alice');
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

    const refreshSpy = jest.spyOn(service as any, 'refreshMutationCaches');
    const refreshAnalyticsSpy = jest.spyOn(service as any, 'refreshAnalyticsAndHomeBootstrap');
    const bumpSpy = jest.spyOn(service as any, 'bumpHomeRevision');
    refreshSpy.mockClear();
    refreshAnalyticsSpy.mockClear();
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
    const sourceRefreshCalls = refreshSpy.mock.calls.filter(
      (call: any[]) => call[2] === 'saveSubmissionWithId'
    );
    expect(sourceRefreshCalls).toHaveLength(1);
    expect(sourceRefreshCalls[0][0]).toEqual(expect.objectContaining({ configSheet: 'Config: Delivery' }));
    expect(sourceRefreshCalls[0][1]).toEqual(expect.any(Array));
    expect(sourceRefreshCalls[0][3]).toBe('revisionOnly');
    expect(refreshAnalyticsSpy).not.toHaveBeenCalled();
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

  test('runDailyLifecycleRecompute releases active reservations for configured source forms without date checks', () => {
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
            id: 'releaseActiveReservations',
            type: 'releaseActiveReservations',
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
      ['SRC_LABEL', 'TEXT', 'Source label', 'Source label', 'Source label', false, '', '', '', 'Active', '', '', '', '', '']
    ]);

    expect(service.saveSubmissionWithId({
      formKey: sourceFormKey,
      language: 'EN',
      id: 'SRC-DAILY-1',
      SRC_LABEL: 'Open reservation owner',
      __ckSaveMode: 'draft',
      __ckStatus: 'In progress'
    } as any).success).toBe(true);

    const inventory = service.saveSubmissionWithId({
      formKey: inventoryFormKey,
      language: 'EN',
      LEFTOVER_ID: 'LE-DAILY',
      LEFTOVER_STATUS: 'available',
      LEFTOVER_KIND: 'Entire dish',
      LEFTOVER_PORTIONS: 7,
      LEFTOVER_RESERVED_PORTIONS: 0
    } as any);
    expect(inventory.success).toBe(true);

    const reserved = service.upsertInventoryReservation({
      resourceFormKey: inventoryFormKey,
      resourceRecordId: (inventory.meta?.id || '').toString(),
      resourceItemId: 'LE-DAILY',
      resourceKind: 'Entire dish',
      quantity: 4,
      sourceFormKey,
      sourceRecordId: 'SRC-DAILY-1',
      sourceParentGroupId: 'MP_MEALS_REQUEST',
      sourceParentRowId: 'ROW-DAILY',
      ledgerFormKey
    });
    expect(reserved.success).toBe(true);

    const primeSpy = jest.spyOn(service as any, 'primeHomeBootstrapCache');
    const result = service.runDailyLifecycleRecompute();
    expect(result.success).toBe(true);
    expect(result.updatedForms).toBe(1);
    expect(result.updatedRecords).toBe(1);
    expect(primeSpy).toHaveBeenCalledTimes(1);
    expect(primeSpy).toHaveBeenCalledWith(sourceFormKey, expect.any(Number), 'runDailyLifecycleRecompute');

    const updatedInventory = service.fetchSubmissionById(inventoryFormKey, (inventory.meta?.id || '').toString());
    expect((updatedInventory?.values as any)?.LEFTOVER_PORTIONS).toBe(7);
    expect((updatedInventory?.values as any)?.LEFTOVER_RESERVED_PORTIONS).toBe(0);
    const reservation = service.fetchSubmissionById(ledgerFormKey, (reserved.reservationId || '').toString());
    expect((reservation?.values as any)?.STATUS).toBe('released');
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

  test('unchanged saves return noop and preserve data version', () => {
    const created = service.saveSubmissionWithId({
      formKey: 'Config: Delivery',
      language: 'EN',
      id: 'REC-NOOP-1',
      Q1: 'Alice',
      Q2_json: JSON.stringify([]),
      Q3: [],
      Q4: 'ACME',
      __ckSaveMode: 'draft',
      __ckStatus: 'In progress'
    } as any);
    expect(created.success).toBe(true);
    expect(created.meta?.operation).toBe('create');
    expect(created.meta?.dataVersion).toBeGreaterThan(0);

    const second = service.saveSubmissionWithId({
      formKey: 'Config: Delivery',
      language: 'EN',
      id: 'REC-NOOP-1',
      Q1: 'Alice',
      Q2_json: JSON.stringify([]),
      Q3: [],
      Q4: 'ACME',
      __ckSaveMode: 'draft',
      __ckStatus: 'In progress',
      __ckClientDataVersion: created.meta?.dataVersion
    } as any);

    expect(second.success).toBe(true);
    expect(second.message).toBe('No changes to save.');
    expect(second.meta).toEqual(
      expect.objectContaining({
        id: 'REC-NOOP-1',
        operation: 'noop',
        dataVersion: created.meta?.dataVersion,
        rowNumber: created.meta?.rowNumber,
        updatedAt: created.meta?.updatedAt
      })
    );
  });

  test('noop updates do not append audit rows', () => {
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
      id: 'REC-NOOP-AUDIT',
      Q1: 'Alice',
      Q2_json: JSON.stringify([]),
      Q3: [],
      Q4: 'ACME',
      __ckSaveMode: 'draft',
      __ckStatus: 'In progress'
    } as any);
    expect(created.success).toBe(true);

    const changed = service.saveSubmissionWithId({
      formKey: 'Config: Delivery',
      language: 'EN',
      id: 'REC-NOOP-AUDIT',
      Q1: 'Alice Updated',
      Q2_json: JSON.stringify([]),
      Q3: [],
      Q4: 'ACME',
      __ckSaveMode: 'draft',
      __ckStatus: 'Ready for production',
      __ckAuditAction: 'READY_PROD',
      __ckClientDataVersion: created.meta?.dataVersion
    } as any);
    expect(changed.success).toBe(true);

    const auditSheet = ss.getSheetByName('Delivery Audit');
    expect(auditSheet).toBeDefined();
    const beforeRows = auditSheet!.getValues().length;

    const second = service.saveSubmissionWithId({
      formKey: 'Config: Delivery',
      language: 'EN',
      id: 'REC-NOOP-AUDIT',
      Q1: 'Alice Updated',
      Q2_json: JSON.stringify([]),
      Q3: [],
      Q4: 'ACME',
      __ckSaveMode: 'draft',
      __ckStatus: 'Ready for production',
      __ckAuditAction: 'READY_PROD',
      __ckClientDataVersion: changed.meta?.dataVersion
    } as any);

    expect(second.success).toBe(true);
    expect(second.meta?.operation).toBe('noop');
    expect(auditSheet!.getValues().length).toBe(beforeRows);
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

  test('backfillDataSourceIds rejects commit runs without the configured token', () => {
    expect(() =>
      service.backfillDataSourceIds('Config: Delivery', {
        dryRun: false
      } as any)
    ).toThrow('Data source ID backfill commit token is not configured.');
  });
});
