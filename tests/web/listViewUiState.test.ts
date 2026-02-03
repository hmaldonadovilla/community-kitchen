import { resolveListViewUiState } from '../../src/web/react/app/listViewUiState';

describe('resolveListViewUiState', () => {
  it('shows loading status before first load completes', () => {
    const state = resolveListViewUiState({
      visibleCount: 0,
      hasLoadedOnce: false,
      loading: false,
      prefetching: false,
      error: null,
      assumeInitialLoad: true
    });
    expect(state).toEqual({ showLoadingStatus: true, showNoRecords: false });
  });

  it('does not show "no records" while loading', () => {
    const state = resolveListViewUiState({
      visibleCount: 0,
      hasLoadedOnce: true,
      loading: true,
      prefetching: false,
      error: null,
      assumeInitialLoad: true
    });
    expect(state.showNoRecords).toBe(false);
    expect(state.showLoadingStatus).toBe(true);
  });

  it('shows "no records" only after load completes', () => {
    const state = resolveListViewUiState({
      visibleCount: 0,
      hasLoadedOnce: true,
      loading: false,
      prefetching: false,
      error: null,
      assumeInitialLoad: true
    });
    expect(state).toEqual({ showLoadingStatus: false, showNoRecords: true });
  });

  it('does not show "no records" when there are visible rows', () => {
    const state = resolveListViewUiState({
      visibleCount: 2,
      hasLoadedOnce: true,
      loading: false,
      prefetching: false,
      error: null,
      assumeInitialLoad: true
    });
    expect(state.showNoRecords).toBe(false);
  });

  it('suppresses loading and empty states when an error is present', () => {
    const state = resolveListViewUiState({
      visibleCount: 0,
      hasLoadedOnce: true,
      loading: true,
      prefetching: false,
      error: 'Failed',
      assumeInitialLoad: true
    });
    expect(state).toEqual({ showLoadingStatus: false, showNoRecords: false });
  });

  it('does not show the main loading status during background prefetch', () => {
    const state = resolveListViewUiState({
      visibleCount: 1,
      hasLoadedOnce: true,
      loading: false,
      prefetching: true,
      error: null,
      assumeInitialLoad: true
    });
    expect(state).toEqual({ showLoadingStatus: false, showNoRecords: false });
  });
});

