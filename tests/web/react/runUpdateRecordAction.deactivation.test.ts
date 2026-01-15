import '../../mocks/GoogleAppsScript';
import type { WebFormDefinition } from '../../../src/types';
import type { LangCode } from '../../../src/web/types';
import {
  runUpdateRecordAction,
  type UpdateRecordActionDeps,
  type UpdateRecordActionRequest
} from '../../../src/web/react/features/customActions/updateRecord/runUpdateRecordAction';

function makeDeps(overrides: Partial<UpdateRecordActionDeps> = {}): UpdateRecordActionDeps {
  const language: LangCode = 'EN';
  const definition: WebFormDefinition = {
    title: 'Test',
    destinationTab: 'Responses',
    languages: ['EN'],
    questions: [],
    dataSources: [
      {
        id: 'SourceA',
        blocked: true,
        mode: 'options'
      }
    ]
  } as any;

  const logEvents: Array<{ event: string; payload?: Record<string, unknown> }> = [];
  const deps: UpdateRecordActionDeps = {
    definition,
    formKey: 'Config: Test',
    submit: async () => ({ success: true }),
    tSystem: (key: string, _lang: LangCode, fallback?: string) =>
      key === 'actions.deactivate.blockedByActiveUsage' ? 'blocked' : fallback || key,
    logEvent: (event: string, payload?: Record<string, unknown>) => {
      logEvents.push({ event, payload });
    },
    refs: {
      languageRef: { current: language } as any,
      valuesRef: { current: {} } as any,
      lineItemsRef: { current: {} } as any,
      selectedRecordIdRef: { current: 'REC-1' } as any,
      selectedRecordSnapshotRef: { current: { id: 'REC-1' } as any } as any,
      lastSubmissionMetaRef: { current: { id: 'REC-1' } } as any,
      recordDataVersionRef: { current: 1 } as any,
      recordRowNumberRef: { current: 2 } as any,
      recordSessionRef: { current: 1 } as any,
      uploadQueueRef: { current: new Map() } as any,
      autoSaveInFlightRef: { current: false } as any,
      recordStaleRef: { current: null } as any
    },
    setDraftSave: () => undefined,
    setStatus: jest.fn(),
    setStatusLevel: jest.fn(),
    setLastSubmissionMeta: jest.fn(),
    setSelectedRecordSnapshot: jest.fn(),
    setValues: jest.fn(),
    setView: jest.fn(),
    upsertListCacheRow: jest.fn(),
    busy: {
      lock: () => 1,
      setMessage: () => undefined,
      unlock: () => undefined
    }
  };

  return { ...deps, ...overrides, logEvent: deps.logEvent } as UpdateRecordActionDeps;
}

describe('runUpdateRecordAction (deactivation guard)', () => {
  test('blocks deactivation when a data source is flagged as blocked', async () => {
    const deps = makeDeps();
    const req: UpdateRecordActionRequest = {
      buttonId: 'BTN-1',
      buttonRef: 'Q1',
      qIdx: 0,
      navigateTo: 'auto',
      set: { status: 'Inactive' },
      isDeactivation: true
    };

    await runUpdateRecordAction(deps, req);

    expect(deps.setStatus).toHaveBeenCalledWith('blocked');
    expect(deps.setStatusLevel).toHaveBeenCalledWith('error');
  });
});
