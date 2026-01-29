import { selectBundledFormConfig } from '../../src/services/webform/formConfigBundle';
import { FormConfigExport, WebFormDefinition } from '../../src/types';

const makeExport = (formKey: string, title: string, configSheet: string, rowIndex: number): FormConfigExport => {
  const form = {
    title,
    configSheet,
    destinationTab: `${title} Responses`,
    description: 'Test form',
    rowIndex
  };
  const definition: WebFormDefinition = {
    title,
    destinationTab: form.destinationTab,
    languages: ['EN'],
    questions: []
  };
  return {
    formKey,
    generatedAt: '2026-01-28T00:00:00Z',
    form,
    questions: [],
    dedupRules: [],
    definition,
    validationErrors: []
  };
};

describe('selectBundledFormConfig', () => {
  const configs = [
    makeExport('Config: Meal Production', 'Meal Production', 'Config: Meal Production', 1),
    makeExport('Config: Storage', 'Storage', 'Config: Storage', 2)
  ];

  test('returns first config when no formKey provided', () => {
    const result = selectBundledFormConfig(configs, undefined);
    expect(result?.formKey).toBe('Config: Meal Production');
  });

  test('matches by configSheet, title, or formKey (case-insensitive)', () => {
    expect(selectBundledFormConfig(configs, 'config: storage')?.formKey).toBe('Config: Storage');
    expect(selectBundledFormConfig(configs, 'Meal Production')?.formKey).toBe('Config: Meal Production');
    expect(selectBundledFormConfig(configs, 'Config: Meal Production')?.formKey).toBe('Config: Meal Production');
  });
});
