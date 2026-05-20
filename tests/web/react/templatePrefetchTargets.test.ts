import { collectMarkdownTemplatePrefetchTargets } from '../../../src/web/react/components/app/templatePrefetchTargets';

describe('template prefetch targets', () => {
  it('collects template-scoped markdown render buttons for client render cache warmup', () => {
    const targets = collectMarkdownTemplatePrefetchTargets(
      {
        questions: [
          {
            id: 'HELP',
            type: 'BUTTON',
            button: {
              action: 'renderMarkdownTemplate',
              cacheScope: 'template',
              templateId: { EN: 'drive-md-en', FR: 'drive-md-fr' }
            }
          },
          {
            id: 'RECORD_REPORT',
            type: 'BUTTON',
            button: {
              action: 'renderMarkdownTemplate',
              cacheScope: 'record',
              templateId: { EN: 'record-md' }
            }
          },
          {
            id: 'HTML',
            type: 'BUTTON',
            button: {
              action: 'renderHtmlTemplate',
              cacheScope: 'template',
              templateId: { EN: 'html-id' }
            }
          }
        ]
      } as any,
      'FR' as any
    );

    expect(targets).toEqual([
      {
        buttonId: 'HELP',
        templateId: 'drive-md-fr',
        cacheOptions: {
          cacheScope: 'template',
          templateId: 'drive-md-fr'
        }
      }
    ]);
  });

  it('skips conditional markdown templates because a record is needed to choose the template', () => {
    const targets = collectMarkdownTemplatePrefetchTargets(
      {
        questions: [
          {
            id: 'CONDITIONAL',
            type: 'BUTTON',
            button: {
              action: 'renderMarkdownTemplate',
              cacheScope: 'template',
              templateId: {
                cases: [{ when: { fieldId: 'STATUS', equals: 'Open' }, templateId: { EN: 'open-md' } }],
                default: { EN: 'default-md' }
              }
            }
          }
        ]
      } as any,
      'EN' as any
    );

    expect(targets).toEqual([]);
  });
});
