import '../mocks/GoogleAppsScript';

const renderPdfArtifactFromTemplate = jest.fn(() => ({
  success: true,
  url: 'https://drive.google.com/file/d/generatedPdf/view',
  fileId: 'generatedPdf'
}));

jest.mock('../../src/services/webform/followup/docRenderer', () => ({
  renderPdfArtifactFromTemplate,
  renderPdfFromTemplate: jest.fn(() => ({
    success: true,
    url: 'https://drive.google.com/file/d/generatedPdf/view',
    fileId: 'generatedPdf'
  })),
  renderPdfBytesFromTemplate: jest.fn(() => ({
    success: true,
    pdfBase64: 'ZmFrZQ==',
    mimeType: 'application/pdf',
    fileName: 'preview.pdf'
  })),
  renderDocPreviewFromTemplate: jest.fn(() => ({
    success: true,
    fileId: 'preview-doc',
    previewUrl: 'https://docs.google.com/document/d/preview-doc/edit'
  })),
  renderHtmlFromTemplate: jest.fn(() => ({
    success: true,
    html: '<div>preview</div>'
  }))
}));

import { FollowupService } from '../../src/services/webform/followup';

describe('FollowupService meal production rendering', () => {
  beforeEach(() => {
    renderPdfArtifactFromTemplate.mockClear();
  });

  it('hydrates linked leftover ingredients before regenerating a meal production PDF', () => {
    const service = new FollowupService(
      {} as any,
      {} as any,
      {} as any,
      (formKey, recordId) => {
        if (formKey !== 'Config: Leftover Inventory') return null;
        if (recordId === 'leftover-single') {
          return {
            formKey,
            language: 'EN',
            id: 'leftover-single',
            values: {
              LEFTOVER_KIND: 'Single-ingredient',
              LEFTOVER_INGREDIENT: 'Basil - fresh',
              LEFTOVER_CAT: 'Herbs - spices - condiments',
              LEFTOVER_ALLERGEN: 'None',
              LEFTOVER_UNIT: 'gr'
            }
          } as any;
        }
        if (recordId === 'leftover-multi') {
          return {
            formKey,
            language: 'EN',
            id: 'leftover-multi',
            values: {
              LEFTOVER_KIND: 'Multi-ingredient',
              LEFTOVER_INGREDIENTS_LI: [
                { ING: 'Bulgur', CAT: 'Dry carbohydrates', ALLERGEN: 'Gluten', QTY: '2.80', UNIT: 'kg' },
                { ING: 'Broccoli', CAT: 'Fresh vegetables', ALLERGEN: 'None', QTY: '2.33', UNIT: 'kg' }
              ]
            }
          } as any;
        }
        return null;
      }
    );

    const record = {
      formKey: 'Config: Meal Production',
      language: 'EN',
      id: 'meal-record-1',
      values: {
        MP_MEALS_REQUEST: [
          {
            MEAL_TYPE: 'Vegetarian',
            MP_TYPE_LI: [
              {
                PREP_TYPE: 'Single-ingredient',
                RECIPE: 'Basil - fresh',
                LEFTOVER_KIND: 'Single-ingredient',
                LEFTOVER_RECORD_ID: 'leftover-single',
                LEFTOVER_USE_QTY: '500',
                LEFTOVER_DISPLAY_UNIT: 'gr',
                MP_INGREDIENTS_LI: []
              },
              {
                PREP_TYPE: 'Multi-ingredient',
                RECIPE: 'Bulgur & vegetable warm salad mama mia',
                LEFTOVER_KIND: 'Multi-ingredient',
                LEFTOVER_RECORD_ID: 'leftover-multi',
                LEFTOVER_USAGE_MODE: 'Combine',
                MP_INGREDIENTS_LI: []
              }
            ]
          }
        ]
      }
    } as any;

    const result = service.generatePdfArtifact(
      {
        title: 'Meal Production',
        configSheet: 'Config: Meal Production'
      } as any,
      [],
      record,
      {
        pdfTemplateId: { EN: 'bundle:meal_production.pdf.html' },
        pdfFolderId: 'folder-1'
      } as any
    );

    expect(result.success).toBe(true);
    expect(renderPdfArtifactFromTemplate).toHaveBeenCalledTimes(1);
    const calls = (renderPdfArtifactFromTemplate as jest.Mock).mock.calls as any[];
    const callArgs = calls[0]?.[0] as any;
    expect(callArgs).toBeTruthy();
    const prepRows = callArgs.record.values.MP_MEALS_REQUEST[0].MP_TYPE_LI;
    expect(prepRows[0].MP_INGREDIENTS_LI).toEqual([
      expect.objectContaining({
        ING: 'Basil - fresh',
        CAT: 'Herbs - spices - condiments',
        ALLERGEN: 'None',
        QTY: '500',
        UNIT: 'gr'
      })
    ]);
    expect(prepRows[1].MP_INGREDIENTS_LI).toEqual([
      expect.objectContaining({ ING: 'Bulgur', ALLERGEN: 'Gluten' }),
      expect.objectContaining({ ING: 'Broccoli', ALLERGEN: 'None' })
    ]);
  });
});
