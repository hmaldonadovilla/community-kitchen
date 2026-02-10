import '../mocks/GoogleAppsScript';
import { handleCreatePdfAction } from '../../src/services/webform/followup/actionHandlers';

describe('followup create-pdf reuse policy', () => {
  const makeArgs = (pdfTemplateId: any) => {
    const setValue = jest.fn();
    const sheet = {
      getParent: () => ({}),
      getRange: () => ({ setValue })
    } as any;

    const record = {
      id: 'REC-1',
      language: 'EN',
      status: 'In progress',
      updatedAt: '2026-02-10T12:00:00.000Z',
      pdfUrl: 'https://drive.google.com/file/d/oldPdfFile12345/view',
      values: {}
    } as any;

    const followup = {
      pdfTemplateId,
      pdfFolderId: 'folder-1',
      statusTransitions: {}
    } as any;

    const submissionService = {
      writeStatus: jest.fn(() => null),
      touchUpdatedAt: jest.fn(() => new Date('2026-02-10T12:34:56.000Z')),
      refreshRecordCache: jest.fn()
    } as any;

    const generatePdfArtifact = jest.fn(() => ({
      success: true,
      url: 'https://drive.google.com/file/d/newPdfFile67890/view',
      fileId: 'newPdfFile67890'
    }));

    return {
      form: { title: 'Meal Production', configSheet: 'Config: Meal Production' } as any,
      questions: [],
      recordId: 'REC-1',
      followup,
      context: {
        record,
        sheet,
        rowIndex: 2,
        columns: { pdfUrl: 3 }
      } as any,
      submissionService,
      generatePdfArtifact,
      setValue
    };
  };

  it('reuses existing PDF for non-HTML templates', () => {
    const args = makeArgs({ EN: 'doc-template-id' });
    const result = handleCreatePdfAction(args as any);

    expect(result.success).toBe(true);
    expect(args.generatePdfArtifact).not.toHaveBeenCalled();
    expect(result.pdfUrl).toBe('https://drive.google.com/file/d/oldPdfFile12345/view');
    expect(args.setValue).toHaveBeenCalledWith('https://drive.google.com/file/d/oldPdfFile12345/view');
  });

  it('regenerates PDF for bundled HTML PDF templates', () => {
    const args = makeArgs({ EN: 'bundle:meal_production.pdf.html' });
    const result = handleCreatePdfAction(args as any);

    expect(result.success).toBe(true);
    expect(args.generatePdfArtifact).toHaveBeenCalledTimes(1);
    expect(result.pdfUrl).toBe('https://drive.google.com/file/d/newPdfFile67890/view');
    expect(result.fileId).toBe('newPdfFile67890');
    expect(args.setValue).toHaveBeenCalledWith('https://drive.google.com/file/d/newPdfFile67890/view');
  });
});
