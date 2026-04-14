import { buildDraftPayload, buildSubmissionPayload } from '../../../src/web/react/app/submission';

describe('submission payload compaction', () => {
  const definition: any = {
    title: 'Test',
    destinationTab: 'Dest',
    languages: ['EN'],
    questions: []
  };

  test('buildDraftPayload keeps form values under the values envelope only', () => {
    const payload = buildDraftPayload({
      definition,
      formKey: 'FORM',
      language: 'EN',
      values: { A: 'Alpha' },
      lineItems: {}
    });

    expect(payload.values).toEqual({ A: 'Alpha' });
    expect((payload as any).A).toBeUndefined();
  });

  test('buildSubmissionPayload keeps form values under the values envelope only', async () => {
    const payload = await buildSubmissionPayload({
      definition,
      formKey: 'FORM',
      language: 'EN',
      values: { A: 'Alpha' },
      lineItems: {}
    });

    expect(payload.values).toEqual({ A: 'Alpha' });
    expect((payload as any).A).toBeUndefined();
  });
});
