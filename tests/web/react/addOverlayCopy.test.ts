import { resolveAddOverlayCopy } from '../../../src/web/react/features/lineItems/domain/addOverlayCopy';

describe('add overlay copy domain', () => {
  test('resolves localized optional overlay copy', () => {
    expect(
      resolveAddOverlayCopy(
        {
          addOverlay: {
            title: { en: ' Add item ', fr: ' Ajouter ' },
            helperText: ' Pick one ',
            searchHelperText: { en: ' Search ', nl: ' Zoeken ' },
            placeholder: null
          }
        },
        'fr'
      )
    ).toEqual({
      title: 'Ajouter',
      helperText: 'Pick one',
      searchHelperText: 'Search',
      placeholder: undefined
    });
  });

  test('returns undefined copy fields when add overlay config is missing', () => {
    expect(resolveAddOverlayCopy({}, 'en')).toEqual({
      title: undefined,
      helperText: undefined,
      searchHelperText: undefined,
      placeholder: undefined
    });
  });
});
