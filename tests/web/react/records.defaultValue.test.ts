import { normalizeRecordValues } from '../../../src/web/react/app/records';

describe('normalizeRecordValues (defaultValue)', () => {
  it('uses defaultValue for consent checkboxes (no options + no dataSource)', () => {
    const definition: any = {
      questions: [{ id: 'CONSENT', type: 'CHECKBOX', required: true, defaultValue: true }]
    };

    const normalized = normalizeRecordValues(definition as any);
    expect(normalized.CONSENT).toBe(true);
  });

  it('uses defaultValue for multi-select checkboxes when missing', () => {
    const definition: any = {
      questions: [
        {
          id: 'FLAGS',
          type: 'CHECKBOX',
          required: false,
          options: { en: ['A', 'B'], fr: ['A', 'B'], nl: ['A', 'B'] },
          defaultValue: ['A']
        }
      ]
    };

    const normalized = normalizeRecordValues(definition as any);
    expect(normalized.FLAGS).toEqual(['A']);
  });
});


