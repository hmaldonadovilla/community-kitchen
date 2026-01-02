import { validateForm } from '../../../src/web/react/app/submission';

describe('validateForm FILE_UPLOAD uploadConfig constraints', () => {
  it('enforces minFiles for top-level FILE_UPLOAD questions', () => {
    const definition: any = {
      title: 'Test',
      destinationTab: 'Test',
      languages: ['EN'],
      questions: [
        {
          id: 'PHOTOS',
          type: 'FILE_UPLOAD',
          required: true,
          label: { en: 'Photos' },
          uploadConfig: { minFiles: 2, maxFiles: 4 }
        }
      ]
    };

    const errors = validateForm({
      definition,
      language: 'EN' as any,
      values: { PHOTOS: ['https://example.com/a.jpg'] } as any,
      lineItems: {} as any
    });

    expect(errors.PHOTOS).toBe('Photos requires at least 2 files.');
  });

  it('enforces minFiles for FILE_UPLOAD fields inside LINE_ITEM_GROUP rows', () => {
    const definition: any = {
      title: 'Test',
      destinationTab: 'Test',
      languages: ['EN'],
      questions: [
        {
          id: 'LINES',
          type: 'LINE_ITEM_GROUP',
          required: false,
          lineItemConfig: {
            fields: [
              {
                id: 'PHOTO',
                type: 'FILE_UPLOAD',
                required: false,
                labelEn: 'Proof photos',
                uploadConfig: { minFiles: 2 }
              }
            ]
          }
        }
      ]
    };

    const lineItems: any = {
      LINES: [{ id: 'r1', values: { PHOTO: ['https://example.com/a.jpg'] } }]
    };

    const errors = validateForm({
      definition,
      language: 'EN' as any,
      values: {} as any,
      lineItems
    });

    expect(errors['LINES__PHOTO__r1']).toBe('Proof photos requires at least 2 files.');
  });
});


