import {
  buildDedupDialogDetails,
  resolveDedupDialogCopy
} from '../../../src/web/react/app/dedupDialog';

describe('dedupDialog copy', () => {
  it('returns defaults when config is missing', () => {
    const copy = resolveDedupDialogCopy(undefined, 'EN');
    expect(copy.title).toBe('Creating duplicate record for the same customer, service and date is not allowed.');
    expect(copy.intro).toBe('A meal production record already exists for:');
    expect(copy.outro).toBe('What do you want to do?');
    expect(copy.openLabel).toBe('Open existing record');
    expect(copy.changeLabel).toBe('Change customer, service or date');
    expect(copy.cancelLabel).toBe('Cancel');
  });

  it('uses localized overrides when provided', () => {
    const copy = resolveDedupDialogCopy(
      {
        title: { en: 'No duplicates', fr: 'Pas de doublons' },
        intro: { en: 'Record already exists', fr: 'Enregistrement existe deja' },
        outro: { en: 'Next step?', fr: 'Et ensuite?' },
        changeLabel: { en: 'Change details', fr: 'Modifier' },
        cancelLabel: { en: 'Cancel', fr: 'Annuler' },
        openLabel: { en: 'Open existing', fr: 'Ouvrir existant' }
      },
      'FR'
    );

    expect(copy).toEqual({
      title: 'Pas de doublons',
      intro: 'Enregistrement existe deja',
      outro: 'Et ensuite?',
      openLabel: 'Ouvrir existant',
      changeLabel: 'Modifier',
      cancelLabel: 'Annuler'
    });
  });
});

describe('dedupDialog details', () => {
  const definition: any = {
    questions: [
      {
        id: 'customer',
        type: 'CHOICE',
        label: { en: 'Customer' },
        options: [{ value: 'ck', label: 'Community Kitchen' }]
      },
      { id: 'service', type: 'TEXT', label: { en: 'Service' } },
      { id: 'serviceDate', type: 'DATE', label: { en: 'Service date' } }
    ],
    dedupRules: [
      {
        id: 'meal',
        keys: ['serviceDate', 'service', 'customer', 'customer']
      }
    ]
  };

  it('builds ordered unique display items from the matching rule', () => {
    const details = buildDedupDialogDetails({
      definition,
      dedupIdentityFieldIdMap: {},
      optionState: {},
      language: 'EN',
      ruleId: 'meal',
      values: {
        customer: 'ck',
        service: 'Lunch',
        serviceDate: '2026-05-04'
      }
    });

    expect(details.keys).toEqual(['customer', 'service', 'serviceDate']);
    expect(details.items.map(item => ({ fieldId: item.fieldId, label: item.label, value: item.value }))).toEqual([
      { fieldId: 'customer', label: 'Customer', value: 'ck' },
      { fieldId: 'service', label: 'Service', value: 'Lunch' },
      { fieldId: 'serviceDate', label: 'Service date', value: 'Mon, 04-May-2026' }
    ]);
  });

  it('falls back to the identity field map when no rule keys are available', () => {
    const details = buildDedupDialogDetails({
      definition: { ...definition, dedupRules: [] },
      dedupIdentityFieldIdMap: { service: 'service', customer: 'customer' },
      optionState: {},
      language: 'EN',
      values: {
        customer: 'ck',
        service: 'Dinner'
      }
    });

    expect(details.keys).toEqual(['customer', 'service']);
    expect(details.items.map(item => item.value)).toEqual(['ck', 'Dinner']);
  });
});
