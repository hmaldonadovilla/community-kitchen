const { FormConfigRepository } = require('../cloud-run/api/repositories/configRepository');

describe('Cloud Run FormConfigRepository', () => {
  test('exposes bundled definitions without submit lifecycle closeout hooks', () => {
    const repository = new FormConfigRepository({
      bundle: {
        forms: [
          {
            formKey: 'Config: Meal Production',
            form: {
              title: 'Meal Production',
              configSheet: 'Config: Meal Production'
            },
            definition: {
              title: 'Meal Production',
              questions: []
            }
          }
        ]
      }
    });

    const config = repository.fetchFormConfig('Config: Meal Production');

    expect(config.definition.title).toBe('Meal Production');
    expect(Object.keys(config.definition)).not.toContain('utilisation' + 'Lifecycle');
  });
});
