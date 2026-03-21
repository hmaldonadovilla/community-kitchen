import { resolveDraftPayloadFormKey } from '../../../src/web/react/app/submission';

describe('resolveDraftPayloadFormKey', () => {
  it('prefers the explicit form key over the destination tab context', () => {
    expect(
      resolveDraftPayloadFormKey({
        formKey: 'Config: Meal Production',
        definition: { title: 'Meal Production' } as any
      })
    ).toBe('Config: Meal Production');
  });

  it('falls back to the definition title when no explicit form key is provided', () => {
    expect(
      resolveDraftPayloadFormKey({
        formKey: '',
        definition: { title: 'Meal Production' } as any
      })
    ).toBe('Meal Production');
  });

  it('falls back to draft when no explicit form key or title is available', () => {
    expect(
      resolveDraftPayloadFormKey({
        formKey: '',
        definition: { title: '' } as any
      })
    ).toBe('draft');
  });
});
