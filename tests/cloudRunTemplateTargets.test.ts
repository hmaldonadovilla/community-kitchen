const { collectTemplateIdsFromMap, collectTemplatePrefetchIds } = require('../cloud-run/api/domain/templateTargets');

describe('Cloud Run template target domain', () => {
  test('collects ids from conditional maps and prefetch groups by renderer type', () => {
    expect(
      collectTemplateIdsFromMap({
        cases: [{ templateId: { en: 'case-en' } }, { templateId: 'case-2' }],
        default: 'default-doc'
      })
    ).toEqual(['case-en', 'case-2', 'default-doc']);

    const result = collectTemplatePrefetchIds(
      {
        summaryHtmlTemplateId: 'summary-html',
        followupConfig: {
          pdfTemplateId: 'pdf-doc',
          emailTemplateId: { en: 'email-en', fr: 'email-fr' }
        }
      },
      [
        { type: 'BUTTON', button: { action: 'renderMarkdownTemplate', templateId: 'button-md' } },
        { type: 'BUTTON', button: { action: 'renderHtmlTemplate', templateId: 'button-html' } },
        { type: 'BUTTON', button: { action: 'renderDocTemplate', templateId: 'button-doc' } }
      ]
    );

    expect(result).toEqual({
      htmlIds: ['summary-html', 'button-html'],
      markdownIds: ['button-md'],
      docIds: ['pdf-doc', 'email-en', 'email-fr', 'button-doc']
    });
  });
});
