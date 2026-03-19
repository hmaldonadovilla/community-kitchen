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
});
