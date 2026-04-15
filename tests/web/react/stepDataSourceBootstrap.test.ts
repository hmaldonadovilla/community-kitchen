import { buildStepDataSourceBootstrapSignature } from '../../../src/web/react/app/stepDataSourceBootstrap';

describe('buildStepDataSourceBootstrapSignature', () => {
  it('stays stable across config object identity churn', () => {
    const first = buildStepDataSourceBootstrapSignature({
      recordId: 'REC-1',
      language: 'EN',
      configs: [
        {
          id: 'leftoverRows',
          dataSource: {
            id: 'Leftover Inventory Data',
            formKey: 'Config: Leftover Inventory',
            projection: ['Name', 'Status']
          },
          availability: { enabled: true }
        }
      ]
    });
    const second = buildStepDataSourceBootstrapSignature({
      recordId: 'REC-1',
      language: 'EN',
      configs: [
        {
          id: 'leftoverRows',
          dataSource: {
            id: 'Leftover Inventory Data',
            formKey: 'Config: Leftover Inventory',
            projection: ['Name', 'Status']
          },
          availability: { enabled: true }
        }
      ]
    });

    expect(second).toBe(first);
  });

  it('changes when the record or bootstrap-driving config changes', () => {
    const baseline = buildStepDataSourceBootstrapSignature({
      recordId: 'REC-1',
      language: 'EN',
      configs: [
        {
          id: 'leftoverRows',
          dataSource: { id: 'Leftover Inventory Data', formKey: 'Config: Leftover Inventory' },
          availability: { enabled: true }
        }
      ]
    });

    expect(
      buildStepDataSourceBootstrapSignature({
        recordId: 'REC-2',
        language: 'EN',
        configs: [
          {
            id: 'leftoverRows',
            dataSource: { id: 'Leftover Inventory Data', formKey: 'Config: Leftover Inventory' },
            availability: { enabled: true }
          }
        ]
      })
    ).not.toBe(baseline);

    expect(
      buildStepDataSourceBootstrapSignature({
        recordId: 'REC-1',
        language: 'EN',
        configs: [
          {
            id: 'leftoverRows',
            dataSource: { id: 'Leftover Inventory Data', formKey: 'Config: Leftover Inventory' },
            reservationBehavior: { enabled: true }
          }
        ]
      })
    ).not.toBe(baseline);
  });
});
