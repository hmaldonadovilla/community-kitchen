import {
  applyInventoryReservationPlanApi,
  configureBackendTransport,
  configureBackendTransportFromRuntime,
  consumePrefetchedHomeBootstrapApi,
  createHttpTransport,
  createHybridTransport,
  DEFAULT_HYBRID_HTTP_FUNCTIONS,
  fetchDataSourceApi,
  fetchBootstrapContextApi,
  fetchHomeBootstrapApi,
  invalidateClientSharedDataCaches,
  peekSummaryHtmlTemplateCache,
  queueAnalyticsPipelineRunApi,
  resolveUserFacingErrorMessage,
  seedSummaryHtmlTemplateCache,
  submit,
  syncGuidedStepReservationDraftApi,
  triggerFollowup,
  triggerFollowupBatch,
  uploadFilesApi,
  upsertInventoryReservationApi,
  reconcileInventoryReservationsApi,
  renderDocTemplateHtmlApi,
  type BackendTransport
} from '../../../src/web/react/api';
import { clearFetchDataSourceCache } from '../../../src/web/data/dataSources';

jest.mock('../../../src/web/data/dataSources', () => ({
  clearFetchDataSourceCache: jest.fn(),
  configureDataSourceFetcher: jest.fn()
}));

describe('react api transport', () => {
  afterEach(() => {
    configureBackendTransport();
    delete (globalThis as any).__CK_HOME_BOOTSTRAP_PREFETCH__;
    delete (globalThis as any).__WEB_FORM_BOOTSTRAP__;
    delete (globalThis as any).__CK_BACKEND_CONFIG__;
    delete (globalThis as any).__CK_BACKEND_MODE__;
    delete (globalThis as any).__CK_API_BASE_URL__;
    delete (globalThis as any).__CK_HTTP_FUNCTIONS__;
    delete (globalThis as any).__CK_APPS_SCRIPT_FUNCTIONS__;
    delete (globalThis as any).google;
  });

  test('posts RPC envelopes through the HTTP transport and unwraps results', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ ok: true, result: { items: [{ id: 'one' }] } })
    });
    const transport = createHttpTransport({
      apiBaseUrl: 'https://api.example.com/',
      headers: { 'x-client': 'test' },
      credentials: 'include',
      fetchImpl: fetchImpl as any
    });

    const result = await transport.invoke<{ items: Array<{ id: string }> }>('fetchDataSource', { id: 'Recipes' });

    expect(result.items).toEqual([{ id: 'one' }]);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.example.com/api/rpc',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        headers: expect.objectContaining({
          'content-type': 'application/json',
          'x-client': 'test'
        })
      })
    );
    expect(JSON.parse((fetchImpl.mock.calls[0][1] as any).body)).toEqual({
      fnName: 'fetchDataSource',
      args: [{ id: 'Recipes' }]
    });
  });

  test('routes configured hybrid calls to HTTP and leaves side-effect calls on Apps Script', async () => {
    const httpInvoke = jest.fn().mockResolvedValue('http-result');
    const appsInvoke = jest.fn().mockResolvedValue('apps-result');
    const transport = createHybridTransport({
      httpTransport: { invoke: httpInvoke },
      appsScriptTransport: { invoke: appsInvoke },
      httpFunctions: ['fetchDataSource', 'fetchHomeBootstrap']
    });

    await expect(transport.invoke('fetchDataSource', { id: 'Recipes' })).resolves.toBe('http-result');
    await expect(transport.invoke('uploadFiles', [], {})).resolves.toBe('apps-result');

    expect(httpInvoke).toHaveBeenCalledWith('fetchDataSource', { id: 'Recipes' });
    expect(appsInvoke).toHaveBeenCalledWith('uploadFiles', [], {});
    expect(transport.isHttpRouted?.('fetchHomeBootstrap')).toBe(true);
    expect(transport.isHttpRouted?.('renderHtmlTemplate')).toBe(false);
  });

  test('routes analytics dashboard reads and queued exports to HTTP by default', () => {
    const httpInvoke = jest.fn();
    const appsInvoke = jest.fn();
    const transport = createHybridTransport({
      httpTransport: { invoke: httpInvoke },
      appsScriptTransport: { invoke: appsInvoke },
      httpFunctions: Array.from(DEFAULT_HYBRID_HTTP_FUNCTIONS)
    });

    expect(transport.isHttpRouted?.('fetchAnalyticsDashboard')).toBe(true);
    expect(transport.isHttpRouted?.('queueAnalyticsPipelineRun')).toBe(true);
  });

  test('does not enable HTTP from runtime config unless mode explicitly opts in', async () => {
    const fetchImpl = jest.fn();
    configureBackendTransportFromRuntime({ apiBaseUrl: 'https://api.example.com', fetchImpl: fetchImpl as any });

    await expect(fetchHomeBootstrapApi('Config: Delivery', null)).rejects.toThrow('google.script.run is unavailable.');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('configures hybrid runtime transport for selected HTTP functions', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ ok: true, result: { notModified: false, rev: 3, listResponse: { items: [] } } })
    });

    configureBackendTransportFromRuntime({
      mode: 'hybrid',
      apiBaseUrl: 'https://api.example.com',
      httpFunctions: ['fetchHomeBootstrap'],
      fetchImpl: fetchImpl as any
    });

    const result = await fetchHomeBootstrapApi('Config: Delivery', 2);

    expect(result.rev).toBe(3);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(JSON.parse((fetchImpl.mock.calls[0][1] as any).body)).toEqual({
      fnName: 'fetchHomeBootstrap',
      args: ['Config: Delivery', 2]
    });
  });

  test('reads hybrid runtime transport config from bootstrap globals', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ ok: true, result: { items: ['ACME'], totalCount: 1 } })
    });
    (globalThis as any).__WEB_FORM_BOOTSTRAP__ = {
      backend: {
        mode: 'hybrid',
        apiBaseUrl: 'https://api.example.com',
        httpFunctions: ['fetchDataSource'],
        dataBackend: 'drive',
        fileBackend: 'drive',
        fetchImpl
      }
    };

    configureBackendTransportFromRuntime();

    const result = await fetchDataSourceApi({
      source: { id: 'Distributor Data' } as any,
      locale: 'EN',
      limit: 5
    });

    expect(result.items).toEqual(['ACME']);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(JSON.parse((fetchImpl.mock.calls[0][1] as any).body)).toEqual({
      fnName: 'fetchDataSource',
      args: [{ id: 'Distributor Data' }, 'EN', null, 5, null]
    });
  });

  test('skips Apps Script home prefetch when hybrid routes home bootstrap to HTTP', () => {
    const fetchImpl = jest.fn();
    const prefetched = Promise.resolve({ rev: 7, notModified: false, listResponse: { items: [] } });
    (globalThis as any).__CK_HOME_BOOTSTRAP_PREFETCH__ = {
      formKey: 'Config: Delivery',
      used: false,
      promise: prefetched
    };

    configureBackendTransportFromRuntime({
      mode: 'hybrid',
      apiBaseUrl: 'https://api.example.com',
      httpFunctions: ['fetchHomeBootstrap'],
      fetchImpl: fetchImpl as any
    });

    expect(consumePrefetchedHomeBootstrapApi('Config: Delivery')).toBeNull();
    expect((globalThis as any).__CK_HOME_BOOTSTRAP_PREFETCH__.used).toBe(false);
  });

  test('uses default bootstrap endpoint when no options are requested', async () => {
    const invoke = jest.fn().mockResolvedValue({ definition: {}, formKey: 'Config: Delivery' });
    const transport: BackendTransport = { invoke };
    configureBackendTransport(transport);

    await fetchBootstrapContextApi('Config: Delivery');

    expect(invoke).toHaveBeenCalledWith('fetchBootstrapContext', 'Config: Delivery');
  });

  test('uses bootstrap-with-options endpoint when analytics are requested', async () => {
    const invoke = jest.fn().mockResolvedValue({ definition: {}, formKey: 'Config: Delivery', analytics: { items: [] } });
    const transport: BackendTransport = { invoke };
    configureBackendTransport(transport);

    await fetchBootstrapContextApi('Config: Delivery', { includeAnalytics: true });

    expect(invoke).toHaveBeenCalledWith('fetchBootstrapContextWithOptions', 'Config: Delivery', { includeAnalytics: true });
  });

  test('consumes the early prefetched home bootstrap promise once for the matching form key', async () => {
    const prefetched = Promise.resolve({ rev: 7, notModified: false, listResponse: { items: [] } });
    (globalThis as any).__CK_HOME_BOOTSTRAP_PREFETCH__ = {
      formKey: 'Config: Delivery',
      used: false,
      promise: prefetched
    };

    const first = consumePrefetchedHomeBootstrapApi('Config: Delivery');
    const second = consumePrefetchedHomeBootstrapApi('Config: Delivery');

    await expect(first).resolves.toMatchObject({ rev: 7, notModified: false });
    expect(second).toBeNull();
    expect((globalThis as any).__CK_HOME_BOOTSTRAP_PREFETCH__.used).toBe(true);
  });

  test('invalidates shared data caches and optionally clears html render cache', () => {
    const payload: any = {
      formKey: 'Config: Delivery',
      language: 'EN',
      id: 'R-1',
      values: { NAME: 'Soup' }
    };
    seedSummaryHtmlTemplateCache(payload, { success: true, html: '<div>cached</div>' });

    expect(peekSummaryHtmlTemplateCache(payload)?.html).toBe('<div>cached</div>');

    invalidateClientSharedDataCaches({ includePersistedDataSources: true, includeHtmlRenderCache: true });

    expect(clearFetchDataSourceCache).toHaveBeenCalledWith({ includePersisted: true });
    expect(peekSummaryHtmlTemplateCache(payload)).toBeNull();
  });

  test('maps Drive storage internals to the caller fallback message', () => {
    expect(
      resolveUserFacingErrorMessage(
        new Error(
          'Upload folder not accessible (id=abc). Service error: Drive. If this is a shared drive, ensure the script executes as a user who is a member of that drive.'
        ),
        'Could not add photos.'
      )
    ).toBe('Could not add photos.');

    expect(
      resolveUserFacingErrorMessage(
        new Error('Drive createFile failed (folderId=abc, name=photo.jpg, sizeMb=1). Service error: Drive.'),
        'Failed to render preview.'
      )
    ).toBe('Failed to render preview.');
  });

  test('routes inventory reservation upsert through the backend transport', async () => {
    const invoke = jest.fn().mockResolvedValue({ success: true, message: 'ok' });
    configureBackendTransport({ invoke });

    const payload: any = {
      resourceFormKey: 'Config: Leftover Inventory',
      resourceRecordId: 'leftover-1',
      quantity: 3,
      sourceFormKey: 'Config: Meal Production',
      sourceRecordId: 'meal-1'
    };

    await upsertInventoryReservationApi(payload);

    expect(invoke).toHaveBeenCalledWith('upsertInventoryReservation', payload);
  });

  test('routes inventory reservation reconciliation through the backend transport', async () => {
    const invoke = jest.fn().mockResolvedValue({ success: true, message: 'ok' });
    configureBackendTransport({ invoke });

    const payload: any = {
      sourceFormKey: 'Config: Meal Production',
      sourceRecordId: 'meal-1'
    };

    await reconcileInventoryReservationsApi(payload);

    expect(invoke).toHaveBeenCalledWith('reconcileInventoryReservations', payload);
  });

  test('routes inventory reservation plan apply through the backend transport', async () => {
    const invoke = jest.fn().mockResolvedValue({ success: true, message: 'ok' });
    configureBackendTransport({ invoke });

    const payload: any = {
      sourceFormKey: 'Config: Meal Production',
      sourceRecordId: 'meal-1',
      managedScopes: [
        {
          sourceParentGroupId: 'MP_MEALS_REQUEST',
          sourceParentRowId: 'ROW-1',
          sourceOutputGroupId: 'MP_TYPE_LI'
        }
      ],
      reservations: []
    };

    await applyInventoryReservationPlanApi(payload);

    expect(invoke).toHaveBeenCalledWith('applyInventoryReservationPlan', payload);
  });

  test('routes guided reservation draft sync through the backend transport', async () => {
    const invoke = jest.fn().mockResolvedValue({ success: true, message: 'ok' });
    configureBackendTransport({ invoke });

    const payload: any = {
      stepId: 'leftoverForm',
      clientMutationSeq: 7,
      reservationPlan: {
        sourceFormKey: 'Config: Meal Production',
        sourceRecordId: 'meal-1',
        managedScopes: [],
        reservations: []
      },
      draftPayload: {
        formKey: 'Config: Meal Production',
        language: 'EN',
        id: 'meal-1',
        values: {}
      }
    };

    await syncGuidedStepReservationDraftApi(payload);

    expect(invoke).toHaveBeenCalledWith('syncGuidedStepReservationDraft', payload);
  });

  test('routes Cloud Run supported follow-up batches through the configured transport', async () => {
    const invoke = jest.fn().mockResolvedValue({ success: true, results: [] });
    configureBackendTransport({
      invoke,
      isHttpRouted: fnName => fnName === 'triggerFollowupActions'
    });

    await triggerFollowupBatch('Config: Meal Production', 'meal-1', ['RECONCILE_RESERVATIONS', 'CLOSE_RECORD']);

    expect(invoke).toHaveBeenCalledWith('triggerFollowupActions', 'Config: Meal Production', 'meal-1', [
      'RECONCILE_RESERVATIONS',
      'CLOSE_RECORD'
    ]);
  });

  test('routes PDF and email follow-up batches to Cloud Run when follow-up RPC is enabled', async () => {
    const invoke = jest.fn().mockResolvedValue({ success: true, results: [] });
    configureBackendTransport({
      invoke,
      isHttpRouted: fnName => fnName === 'triggerFollowupActions'
    });

    await expect(triggerFollowupBatch('Config: Meal Production', 'meal-1', ['CREATE_PDF', 'SEND_EMAIL'])).resolves.toEqual({
      success: true,
      results: []
    });

    expect(invoke).toHaveBeenCalledWith('triggerFollowupActions', 'Config: Meal Production', 'meal-1', [
      'CREATE_PDF',
      'SEND_EMAIL'
    ]);
  });

  test('keeps Cloud Run PDF generation and falls back only email when Cloud Run Gmail is not configured', async () => {
    const invoke = jest
      .fn()
      .mockRejectedValueOnce(new Error('Cloud Run SEND_EMAIL requires CK_GMAIL_DELEGATED_USER to be configured for Gmail domain-wide delegation.'))
      .mockResolvedValueOnce({
        success: true,
        results: [
          {
            action: 'CREATE_PDF',
            result: {
              success: true,
              fileId: 'cloud-pdf-1',
              pdfUrl: 'https://drive.google.com/file/d/cloud-pdf-1/view'
            }
          }
        ]
      });
    const runner: any = {
      success: null,
      failure: null,
      withSuccessHandler: jest.fn((handler: any) => {
        runner.success = handler;
        return runner;
      }),
      withFailureHandler: jest.fn((handler: any) => {
        runner.failure = handler;
        return runner;
      }),
      enqueueFollowupEmail: jest.fn(() => {
        runner.success({ success: true, queued: true, fileId: 'cloud-pdf-1', pdfUrl: 'https://drive.google.com/file/d/cloud-pdf-1/view' });
      })
    };
    (globalThis as any).google = { script: { run: runner } };
    configureBackendTransport({
      invoke,
      isHttpRouted: fnName => fnName === 'triggerFollowupActions'
    });

    await expect(triggerFollowupBatch('Config: Meal Production', 'meal-1', ['CREATE_PDF', 'SEND_EMAIL'])).resolves.toEqual({
      success: true,
      results: [
        {
          action: 'CREATE_PDF',
          result: {
            success: true,
            fileId: 'cloud-pdf-1',
            pdfUrl: 'https://drive.google.com/file/d/cloud-pdf-1/view'
          }
        },
        {
          action: 'SEND_EMAIL',
          result: {
            success: true,
            queued: true,
            fileId: 'cloud-pdf-1',
            pdfUrl: 'https://drive.google.com/file/d/cloud-pdf-1/view'
          }
        }
      ]
    });

    expect(invoke).toHaveBeenNthCalledWith(1, 'triggerFollowupActions', 'Config: Meal Production', 'meal-1', [
      'CREATE_PDF',
      'SEND_EMAIL'
    ]);
    expect(invoke).toHaveBeenNthCalledWith(2, 'triggerFollowupActions', 'Config: Meal Production', 'meal-1', ['CREATE_PDF']);
    expect(runner.enqueueFollowupEmail).toHaveBeenCalledWith('Config: Meal Production', 'meal-1', {
      pdfArtifact: {
        success: true,
        fileId: 'cloud-pdf-1',
        url: 'https://drive.google.com/file/d/cloud-pdf-1/view'
      }
    });
  });

  test('falls back to direct Apps Script email when direct email dispatch is required', async () => {
    const invoke = jest
      .fn()
      .mockRejectedValueOnce(new Error('Cloud Run SEND_EMAIL requires CK_GMAIL_DELEGATED_USER to be configured for Gmail domain-wide delegation.'));
    const runner: any = {
      success: null,
      failure: null,
      withSuccessHandler: jest.fn((handler: any) => {
        runner.success = handler;
        return runner;
      }),
      withFailureHandler: jest.fn((handler: any) => {
        runner.failure = handler;
        return runner;
      }),
      triggerFollowupActions: jest.fn(() => {
        runner.success({
          success: true,
          results: [
            {
              action: 'SEND_EMAIL',
              result: {
                success: true,
                status: 'Final report emailed',
                emailDispatched: true
              }
            }
          ]
        });
      }),
      enqueueFollowupEmail: jest.fn()
    };
    (globalThis as any).google = { script: { run: runner } };
    configureBackendTransport({
      invoke,
      isHttpRouted: fnName => fnName === 'triggerFollowupActions'
    });

    await expect(
      triggerFollowupBatch('Config: Meal Production', 'meal-1', ['SEND_EMAIL'], {
        emailDispatchMode: 'direct'
      })
    ).resolves.toEqual({
      success: true,
      results: [
        {
          action: 'SEND_EMAIL',
          result: {
            success: true,
            status: 'Final report emailed',
            emailDispatched: true
          }
        }
      ]
    });

    expect(runner.triggerFollowupActions).toHaveBeenCalledWith('Config: Meal Production', 'meal-1', ['SEND_EMAIL'], {
      emailDispatchMode: 'direct'
    });
    expect(runner.enqueueFollowupEmail).not.toHaveBeenCalled();
  });

  test('direct email dispatch treats queued email results as incomplete', async () => {
    const invoke = jest.fn().mockResolvedValue({
      success: true,
      results: [
        {
          action: 'SEND_EMAIL',
          result: {
            success: true,
            queued: true,
            message: 'Final report email queued.'
          }
        }
      ]
    });
    configureBackendTransport({ invoke });

    await expect(
      triggerFollowupBatch('Config: Meal Production', 'meal-1', ['SEND_EMAIL'], {
        emailDispatchMode: 'direct'
      })
    ).resolves.toEqual({
      success: false,
      results: [
        {
          action: 'SEND_EMAIL',
          result: {
            success: false,
            queued: true,
            message: 'Final report email was queued but not confirmed sent.'
          }
        }
      ]
    });
  });

  test('direct email dispatch treats ambiguous send results as incomplete', async () => {
    const invoke = jest.fn().mockResolvedValue({
      success: true,
      results: [
        {
          action: 'SEND_EMAIL',
          result: {
            success: true,
            status: 'Final report emailed'
          }
        }
      ]
    });
    configureBackendTransport({ invoke });

    await expect(
      triggerFollowupBatch('Config: Meal Production', 'meal-1', ['SEND_EMAIL'], {
        emailDispatchMode: 'direct'
      })
    ).resolves.toEqual({
      success: false,
      results: [
        {
          action: 'SEND_EMAIL',
          result: {
            success: false,
            status: 'Final report emailed',
            message: 'Final report email completed without a confirmed dispatch result.'
          }
        }
      ]
    });
  });

  test('routes standalone CREATE_PDF follow-up actions to Cloud Run', async () => {
    const invoke = jest.fn().mockResolvedValue({ success: true, fileId: 'pdf-1' });
    configureBackendTransport({
      invoke,
      isHttpRouted: fnName => fnName === 'triggerFollowupAction'
    });

    await expect(triggerFollowup('Config: Meal Production', 'meal-1', 'CREATE_PDF')).resolves.toEqual({
      success: true,
      fileId: 'pdf-1'
    });

    expect(invoke).toHaveBeenCalledWith('triggerFollowupAction', 'Config: Meal Production', 'meal-1', 'CREATE_PDF');
  });

  test('falls back CREATE_PDF follow-up actions to Apps Script when Cloud Run hits Drive quota', async () => {
    const invoke = jest.fn().mockRejectedValue(new Error('Cloud Run Drive artifact writes with service accounts require a Shared Drive folder.'));
    const runner: any = {
      success: null,
      failure: null,
      withSuccessHandler: jest.fn((handler: any) => {
        runner.success = handler;
        return runner;
      }),
      withFailureHandler: jest.fn((handler: any) => {
        runner.failure = handler;
        return runner;
      }),
      triggerFollowupAction: jest.fn(() => {
        runner.success({ success: true, fileId: 'apps-pdf-1' });
      })
    };
    (globalThis as any).google = { script: { run: runner } };
    configureBackendTransport({
      invoke,
      isHttpRouted: fnName => fnName === 'triggerFollowupAction'
    });

    await expect(triggerFollowup('Config: Meal Production', 'meal-1', 'CREATE_PDF')).resolves.toEqual({
      success: true,
      fileId: 'apps-pdf-1'
    });

    expect(invoke).toHaveBeenCalledWith('triggerFollowupAction', 'Config: Meal Production', 'meal-1', 'CREATE_PDF');
    expect(runner.triggerFollowupAction).toHaveBeenCalledWith('Config: Meal Production', 'meal-1', 'CREATE_PDF');
  });

  test('falls back Doc preview rendering to Apps Script when Cloud Run hits Drive quota', async () => {
    const invoke = jest.fn().mockRejectedValue(new Error('Cloud Run Drive artifact writes with service accounts require a Shared Drive folder.'));
    const runner: any = {
      success: null,
      failure: null,
      withSuccessHandler: jest.fn((handler: any) => {
        runner.success = handler;
        return runner;
      }),
      withFailureHandler: jest.fn((handler: any) => {
        runner.failure = handler;
        return runner;
      }),
      renderDocTemplateHtml: jest.fn(() => {
        runner.success({ success: true, previewFileId: 'apps-preview-1' });
      })
    };
    (globalThis as any).google = { script: { run: runner } };
    configureBackendTransport({
      invoke,
      isHttpRouted: fnName => fnName === 'renderDocTemplateHtml'
    });
    const payload = { formKey: 'Config: Meal Production', language: 'EN' as const, values: {} };

    await expect(renderDocTemplateHtmlApi(payload, 'REPORT')).resolves.toEqual({
      success: true,
      previewFileId: 'apps-preview-1'
    });

    expect(invoke).toHaveBeenCalledWith('renderDocTemplateHtml', payload, 'REPORT');
    expect(runner.renderDocTemplateHtml).toHaveBeenCalledWith(payload, 'REPORT');
  });

  test('falls back queued analytics exports to Apps Script when Cloud Run Gmail is not configured', async () => {
    const invoke = jest.fn().mockRejectedValue(new Error('Cloud Run SEND_EMAIL requires CK_GMAIL_DELEGATED_USER to be configured for Gmail domain-wide delegation.'));
    const runner: any = {
      success: null,
      failure: null,
      withSuccessHandler: jest.fn((handler: any) => {
        runner.success = handler;
        return runner;
      }),
      withFailureHandler: jest.fn((handler: any) => {
        runner.failure = handler;
        return runner;
      }),
      queueAnalyticsPipelineRun: jest.fn(() => {
        runner.success({ success: true, message: 'Queued by Apps Script.' });
      })
    };
    (globalThis as any).google = { script: { run: runner } };
    configureBackendTransport({
      invoke,
      isHttpRouted: fnName => fnName === 'queueAnalyticsPipelineRun'
    });
    const request = {
      ownerFormKey: 'Config: Meal Production',
      pipelineId: 'ingredients_used',
      startDate: '2026-04-30'
    };

    await expect(queueAnalyticsPipelineRunApi(request)).resolves.toEqual({
      success: true,
      message: 'Queued by Apps Script.'
    });

    expect(invoke).toHaveBeenCalledWith('queueAnalyticsPipelineRun', request);
    expect(runner.queueAnalyticsPipelineRun).toHaveBeenCalledWith(request);
  });

  test('falls back upload saves to Apps Script when Cloud Run hits service-account Drive quota', async () => {
    const invoke = jest.fn().mockRejectedValue(new Error('Service Accounts do not have storage quota.'));
    const runner: any = {
      success: null,
      failure: null,
      withSuccessHandler: jest.fn((handler: any) => {
        runner.success = handler;
        return runner;
      }),
      withFailureHandler: jest.fn((handler: any) => {
        runner.failure = handler;
        return runner;
      }),
      saveSubmissionWithId: jest.fn(() => {
        runner.success({ success: true, meta: { id: 'meal-1' } });
      }),
      uploadFiles: jest.fn(() => {
        runner.success({ success: true, urls: 'https://drive.google.com/file/d/file-1/view' });
      })
    };
    (globalThis as any).google = { script: { run: runner } };
    configureBackendTransport({
      invoke,
      isHttpRouted: fnName => fnName === 'saveSubmissionWithId' || fnName === 'uploadFiles'
    });

    await expect(
      submit({
        formKey: 'Config: Meal Production',
        language: 'EN',
        values: { PHOTO: [{ name: 'receipt.jpg', base64: 'aW1n' }] }
      })
    ).resolves.toMatchObject({ success: true, meta: { id: 'meal-1' } });
    await expect(uploadFilesApi([{ name: 'receipt.jpg', base64: 'aW1n' }], { destinationFolderId: 'folder-1' })).resolves.toEqual({
      success: true,
      urls: 'https://drive.google.com/file/d/file-1/view'
    });

    expect(invoke).toHaveBeenCalledTimes(2);
    expect(runner.saveSubmissionWithId).toHaveBeenCalledWith({
      formKey: 'Config: Meal Production',
      language: 'EN',
      values: { PHOTO: [{ name: 'receipt.jpg', base64: 'aW1n' }] }
    });
    expect(runner.uploadFiles).toHaveBeenCalledWith([{ name: 'receipt.jpg', base64: 'aW1n' }], {
      destinationFolderId: 'folder-1'
    });
  });
});
