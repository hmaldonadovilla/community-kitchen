export const mealProductionFixtures = {
  fieldIds: {
    customer: 'MP_DISTRIBUTOR',
    service: 'MP_SERVICE',
    productionDate: 'MP_PREP_DATE'
  },
  customers: {
    belliard: 'Belliard',
    hub: 'Hub',
    lePhare: 'Le Phare'
  },
  customerValues: {
    belliard: 'Belliard',
    hub: 'HUB',
    lePhare: 'Le Phare'
  },
  services: {
    lunch: 'Lunch',
    dinner: 'Dinner'
  },
  cooks: {
    akkara: 1,
    aline: 7
  },
  mealTypes: {
    diabetic: 'Diabetic',
    noSalt: 'No-salt',
    standard: 'Standard',
    vegan: 'Vegan',
    vegetarian: 'Vegetarian'
  }
} as const;
