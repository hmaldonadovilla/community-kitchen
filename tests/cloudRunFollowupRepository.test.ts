const { FollowupRepository } = require('../cloud-run/api/repositories/followupRepository');

const createTemplateRepository = (overrides: Record<string, any> = {}) => ({
  fileRepository: {},
  createRenderContext: jest.fn((_formKey: string, record: any) => ({ record, questions: [] })),
  getTextTemplateBody: jest.fn().mockResolvedValue('Hello {{NAME}}'),
  renderPdfArtifactFromTemplate: jest.fn().mockResolvedValue({
    success: true,
    fileId: 'pdf-1',
    url: 'https://drive.example/pdf-1',
    buffer: Buffer.from('%PDF test', 'utf8'),
    mimeType: 'application/pdf',
    fileName: 'Report.pdf'
  }),
  renderers: {
    collectLineItemRows: jest.fn().mockReturnValue({}),
    buildPlaceholderMap: jest.fn((args: any) => ({
      '{{NAME}}': args.record.values.NAME
    })),
    applyPlaceholders: jest.fn((template: string, placeholders: Record<string, string>) =>
      (template || '').replace(/{{[^}]+}}/g, token => placeholders[token] ?? token)
    ),
    resolveTemplateId: jest.fn((templateId: any, record: any) =>
      typeof templateId === 'string' ? templateId : templateId?.[record?.language || 'EN'] || templateId?.EN
    )
  },
  ...overrides
});

describe('Cloud Run FollowupRepository', () => {
  const followupConfig = {
    pdfTemplateId: { EN: 'pdf-template' },
    pdfFolderId: 'pdf-folder',
    emailTemplateId: { EN: 'email-template' },
    emailRecipients: ['ops@example.test'],
    statusFieldId: 'STATUS',
    statusTransitions: {
      onPdf: 'Final report created',
      onEmail: 'Final report emailed',
      onClose: 'Closed'
    }
  };
  const context = {
    formKey: 'Config: Meal Production',
    form: {
      title: 'Meal Production',
      followupConfig
    }
  };
  const openRecord = {
    id: 'mp-1',
    language: 'EN',
    status: 'Final report created',
    values: {
      NAME: 'Soup',
      STATUS: 'Final report created'
    },
    dataVersion: 2,
    pdfUrl: ''
  };
  const closedRecord = {
    ...openRecord,
    status: 'Closed',
    values: {
      ...openRecord.values,
      STATUS: 'Closed'
    },
    dataVersion: 3
  };

  test('keeps Closed terminal when email metadata is saved after a close', async () => {
    const saveSubmissionWithId = jest.fn().mockResolvedValue({
      success: true,
      meta: {
        dataVersion: 4,
        rowNumber: 12,
        updatedAt: '2026-05-11T12:00:00.000Z'
      }
    });
    const repository = new FollowupRepository({
      submissionRepository: {
        fetchSubmissionById: jest.fn().mockResolvedValueOnce(openRecord).mockResolvedValueOnce(closedRecord)
      },
      submitEffectsRepository: { saveSubmissionWithId },
      templateRepository: createTemplateRepository(),
      gmailClient: {
        sendEmail: jest.fn().mockResolvedValue({ id: 'gmail-1', threadId: 'thread-1' })
      }
    });

    const result = await repository.runSendEmail(context, 'mp-1', {
      pdfArtifact: {
        success: true,
        fileId: 'pdf-1',
        url: 'https://drive.example/pdf-1',
        buffer: Buffer.from('%PDF test', 'utf8'),
        mimeType: 'application/pdf',
        fileName: 'Report.pdf'
      }
    });

    expect(result).toMatchObject({
      success: true,
      status: 'Closed',
      pdfUrl: 'https://drive.example/pdf-1',
      emailMessageId: 'gmail-1'
    });
    expect(saveSubmissionWithId).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'mp-1',
        status: 'Closed',
        __ckStatus: 'Closed',
        STATUS: 'Closed',
        pdfUrl: 'https://drive.example/pdf-1',
        __ckClientDataVersion: 3
      })
    );
  });

  test('keeps Closed terminal when PDF metadata is saved after a close', async () => {
    const saveSubmissionWithId = jest.fn().mockResolvedValue({
      success: true,
      meta: {
        dataVersion: 4,
        rowNumber: 12,
        updatedAt: '2026-05-11T12:00:00.000Z'
      }
    });
    const templateRepository = createTemplateRepository();
    const repository = new FollowupRepository({
      submissionRepository: {
        fetchSubmissionById: jest.fn().mockResolvedValueOnce(openRecord).mockResolvedValueOnce(closedRecord)
      },
      submitEffectsRepository: { saveSubmissionWithId },
      templateRepository,
      gmailClient: {
        sendEmail: jest.fn()
      }
    });

    const result = await repository.runCreatePdf(context, 'mp-1');

    expect(result).toMatchObject({
      success: true,
      status: 'Closed',
      pdfUrl: 'https://drive.example/pdf-1',
      fileId: 'pdf-1'
    });
    expect(saveSubmissionWithId).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'mp-1',
        status: 'Closed',
        __ckStatus: 'Closed',
        STATUS: 'Closed',
        pdfUrl: 'https://drive.example/pdf-1',
        __ckClientDataVersion: 3
      })
    );
    expect(templateRepository.renderPdfArtifactFromTemplate).toHaveBeenCalledWith(
      'Config: Meal Production',
      expect.objectContaining({ id: 'mp-1', status: 'Final report created' }),
      followupConfig.pdfTemplateId,
      expect.objectContaining({ folderId: 'pdf-folder' })
    );
  });
});
