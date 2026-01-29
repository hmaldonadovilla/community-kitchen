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
  beforeEach(() => {
    (getBundledFormConfig as jest.Mock).mockReturnValue(buildBundledExport());
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  test('buildDefinition prefers bundled config without dashboard access', () => {
    const ss = new MockSpreadsheet();
    const service = new WebFormService(ss as any);
    const def = service.buildDefinition('Config: Bundled');
    expect(def.title).toBe('Bundled Definition');
  });
});
