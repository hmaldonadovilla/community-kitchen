const { FormConfigRepository } = require('../cloud-run/api/repositories/configRepository');

describe('Cloud Run FormConfigRepository', () => {
  test('exposes form reservation lifecycle on bundled definitions', () => {
    const repository = new FormConfigRepository({
      bundle: {
        forms: [
          {
            formKey: 'Config: Meal Production',
            form: {
              title: 'Meal Production',
              configSheet: 'Config: Meal Production',
              reservationLifecycle: {
                ledgerFormKey: 'Config: Inventory Reservation Ledger',
                reconcileOnFinalSubmit: {
                  enabled: true,
                  refreshMode: 'revisionOnly'
                }
              }
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

    expect(config.definition.reservationLifecycle).toEqual({
      ledgerFormKey: 'Config: Inventory Reservation Ledger',
      reconcileOnFinalSubmit: {
        enabled: true,
        refreshMode: 'revisionOnly'
      }
    });
  });
});
