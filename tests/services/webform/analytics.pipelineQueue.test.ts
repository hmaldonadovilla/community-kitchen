import {
  DEFAULT_ANALYTICS_PIPELINE_NOTICE,
  buildAnalyticsPipelineJob,
  formatAnalyticsPipelineJobError,
  normalizeAnalyticsPipelineRunRequest,
  parseAnalyticsPipelineQueue,
  resolveAnalyticsPipelineQueuedNotice,
  serializeAnalyticsPipelineQueue,
  validateAnalyticsPipelineRunRequest
} from '../../../src/services/webform/analytics/pipelineQueue';

describe('analytics pipeline queue domain', () => {
  test('normalizes and validates pipeline run requests', () => {
    const request = normalizeAnalyticsPipelineRunRequest({
      ownerFormKey: ' Config: Meals ',
      pipelineId: ' ingredients ',
      startDate: '30/04/2026'
    });

    expect(request).toEqual({
      ownerFormKey: 'Config: Meals',
      pipelineId: 'ingredients',
      startDate: '2026-04-30'
    });
    expect(validateAnalyticsPipelineRunRequest(request, '2026-04-30')).toBe('');
    expect(validateAnalyticsPipelineRunRequest(request, '2026-04-29')).toBe('The selected date must be today or earlier.');
    expect(validateAnalyticsPipelineRunRequest({ ownerFormKey: '', pipelineId: '', startDate: '' }, '2026-04-30')).toBe(
      'Invalid analytics pipeline request.'
    );
  });

  test('resolves queued notices from localized objects with fallback', () => {
    expect(resolveAnalyticsPipelineQueuedNotice({ ui: { queuedNotice: { fr: 'File ajoutee', en: 'Queued' } } })).toBe('Queued');
    expect(resolveAnalyticsPipelineQueuedNotice({ ui: { queuedNotice: { nl: 'Wachtrij' } } })).toBe('Wachtrij');
    expect(resolveAnalyticsPipelineQueuedNotice({ ui: { queuedNotice: '  ' } })).toBe(DEFAULT_ANALYTICS_PIPELINE_NOTICE);
  });

  test('builds, serializes, and parses valid queue jobs', () => {
    const request = normalizeAnalyticsPipelineRunRequest({
      ownerFormKey: 'Config: Meals',
      pipelineId: 'ingredients',
      startDate: '2026-04-30'
    });
    const job = buildAnalyticsPipelineJob({
      id: 'job-1',
      request,
      queuedAt: '2026-05-01T10:00:00.000Z'
    });

    expect(parseAnalyticsPipelineQueue(serializeAnalyticsPipelineQueue([job]))).toEqual([job]);
    expect(parseAnalyticsPipelineQueue(JSON.stringify([{ ...job, id: '' }, job]))).toEqual([job]);
    expect(parseAnalyticsPipelineQueue('{bad json')).toEqual([]);
  });

  test('formats job errors consistently', () => {
    expect(formatAnalyticsPipelineJobError({ ownerFormKey: 'Config: Meals', pipelineId: 'ingredients' }, 'Failed')).toBe(
      'Config: Meals/ingredients: Failed'
    );
  });
});
