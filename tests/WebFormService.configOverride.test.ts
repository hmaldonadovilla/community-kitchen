import './mocks/GoogleAppsScript';
import { WebFormService } from '../src/services/WebFormService';
import { MockSpreadsheet } from './mocks/GoogleAppsScript';
import { FormConfigExport, WebFormDefinition } from '../src/types';
import { getBundledFormConfig } from '../src/services/webform/formConfigBundle';

jest.mock('../src/services/webform/formConfigBundle', () => ({
  ...jest.requireActual('../src/services/webform/formConfigBundle'),
  getBundledFormConfig: jest.fn(),
  listBundledFormConfigs: jest.fn(() => [])
}));

const buildBundledExport = (): FormConfigExport => {
  const form = {
    title: 'Bundled Form',
    configSheet: 'Config: Bundled',
    destinationTab: 'Bundled Responses',
    description: 'Bundled config',
    rowIndex: 1
  };
  const definition: WebFormDefinition = {
    title: 'Bundled Definition',
    destinationTab: form.destinationTab,
    languages: ['EN'],
    questions: []
  };
  return {
    formKey: 'Config: Bundled',
    generatedAt: '2026-01-28T00:00:00Z',
    form,
    questions: [],
    dedupRules: [],
    definition,
    validationErrors: []
  };
};

const buildBundledExportWithQuestions = (): FormConfigExport => ({
  formKey: 'Config: Bundled',
  generatedAt: '2026-01-28T00:00:00Z',
  form: {
    title: 'Bundled Form',
    configSheet: 'Config: Bundled',
    destinationTab: 'Bundled Responses',
    description: 'Bundled config',
    rowIndex: 1,
    listViewTitle: { en: 'Bundled activity' }
  } as any,
  questions: [
    {
      id: 'LEFTOVER_ID',
      type: 'TEXT',
      qEn: 'Leftover ID',
      qFr: 'Leftover ID',
      qNl: 'Leftover ID',
      required: false,
      listView: true,
      options: [],
      optionsFr: [],
      optionsNl: [],
      status: 'Active'
    } as any
  ],
  dedupRules: [],
  definition: {
    title: 'Stale Bundled Definition',
    destinationTab: 'Bundled Responses',
    questions: []
  } as any,
  validationErrors: []
});

const buildBundledExportWithEmbeddedDefinition = (): FormConfigExport => ({
  formKey: 'Config: Bundled',
  generatedAt: '2026-01-28T00:00:00Z',
  form: {
    title: 'Bundled Form',
    configSheet: 'Config: Bundled',
    destinationTab: 'Bundled Responses',
    description: 'Bundled config',
    rowIndex: 1,
    steps: {
      mode: 'guided',
      items: [
        {
          id: 'bundledStep',
          label: { en: 'Bundled step' },
          include: []
        },
        {
          id: 'finalStep',
          label: { en: 'Final step' },
          include: []
        }
      ]
    }
  } as any,
  questions: [
    {
      id: 'LEFTOVER_ID',
      type: 'TEXT',
      qEn: 'Leftover ID',
      qFr: 'Leftover ID',
      qNl: 'Leftover ID',
      required: false,
      status: 'Active'
    } as any
  ],
  dedupRules: [],
  definition: {
    title: 'Embedded Definition',
    destinationTab: 'Embedded Responses',
    steps: {
      mode: 'guided',
      items: [
        {
          id: 'staleStep',
          label: { en: 'Stale step' },
          include: []
        },
        {
          id: 'insertedStep',
          label: { en: 'Inserted step' },
          include: []
        },
        {
          id: 'finalStep',
          label: { en: 'Final step' },
          include: []
        }
      ]
    },
    questions: [
      {
        id: 'LEFTOVER_ID',
        type: 'TEXT',
        label: 'Embedded Leftover ID',
        required: false
      }
    ]
  } as any,
  validationErrors: []
});

describe('WebFormService config override', () => {
  const previousCacheService = (global as any).CacheService;

  beforeEach(() => {
    (getBundledFormConfig as jest.Mock).mockReturnValue(buildBundledExport());
  });

  afterEach(() => {
    jest.resetAllMocks();
    (global as any).CacheService = previousCacheService;
  });

  test('buildDefinition prefers bundled config without dashboard access', () => {
    const ss = new MockSpreadsheet();
    const service = new WebFormService(ss as any);
    const def = service.buildDefinition('Config: Bundled');
    expect(def.title).toBe('Bundled Form');
  });

  test('caches rebuilt bundled definitions when no embedded definition is available', () => {
    const store = new Map<string, string>();
    (global as any).CacheService = {
      getScriptCache: () => ({
        get: (key: string) => store.get(key) || null,
        put: (key: string, value: string) => {
          store.set(key, value);
        }
      })
    };
    (getBundledFormConfig as jest.Mock).mockReturnValue({
      ...buildBundledExport(),
      definition: {} as any
    });

    const ss = new MockSpreadsheet();
    const service = new WebFormService(ss as any);
    const buildSpy = jest.spyOn((service as any).definitionBuilder, 'buildDefinitionFromConfig');

    const first = service.buildDefinition('Config: Bundled');
    const second = service.buildDefinition('Config: Bundled');

    expect(first.title).toBe('Bundled Form');
    expect(second.title).toBe('Bundled Form');
    expect(buildSpy).toHaveBeenCalledTimes(1);
    expect(store.size).toBeGreaterThan(0);
  });

  test('rebuilds bundled definition from form and questions when both are present', () => {
    (getBundledFormConfig as jest.Mock).mockReturnValue(buildBundledExportWithQuestions());

    const ss = new MockSpreadsheet();
    const service = new WebFormService(ss as any);
    const buildSpy = jest.spyOn((service as any).definitionBuilder, 'buildDefinitionFromConfig');

    const def = service.buildDefinition('Config: Bundled');

    expect(def.title).toBe('Bundled Form');
    expect(def.listView?.columns.map(col => col.fieldId)).toContain('LEFTOVER_ID');
    expect(buildSpy).toHaveBeenCalledTimes(1);
  });

  test('rebuilds bundled definition from questions even when an embedded definition is present', () => {
    (getBundledFormConfig as jest.Mock).mockReturnValue(buildBundledExportWithEmbeddedDefinition());

    const ss = new MockSpreadsheet();
    const service = new WebFormService(ss as any);
    const buildSpy = jest.spyOn((service as any).definitionBuilder, 'buildDefinitionFromConfig');

    const def = service.buildDefinition('Config: Bundled');

    expect(def.title).toBe('Bundled Form');
    expect(def.destinationTab).toBe('Bundled Responses');
    expect(def.questions[0]?.label).toEqual({ en: 'Leftover ID', fr: 'Leftover ID', nl: 'Leftover ID' });
    expect(def.steps?.items?.map((step: any) => step.id)).toEqual(['bundledStep', 'staleStep', 'insertedStep', 'finalStep']);
    expect(buildSpy).toHaveBeenCalledTimes(1);
  });
});
