import {
  resolveSubmitPreparationMessageKey,
  shouldShowSubmitPreparationOverlay
} from '../../../src/web/react/app/submitPreparation';

describe('submitPreparation', () => {
  test('shows the preparation overlay for non-guided forms with save work in flight', () => {
    expect(
      shouldShowSubmitPreparationOverlay({
        stepsMode: undefined,
        waitForQueue: 'all',
        autoSaveInFlight: true,
        draftSaveInFlight: false,
        uploadsInFlight: 0
      })
    ).toBe(true);

    expect(
      shouldShowSubmitPreparationOverlay({
        stepsMode: 'guided',
        waitForQueue: 'all',
        autoSaveInFlight: true,
        draftSaveInFlight: true,
        uploadsInFlight: 1
      })
    ).toBe(false);
  });

  test('respects submit queue policy when deciding whether the click needs a wait overlay', () => {
    expect(
      shouldShowSubmitPreparationOverlay({
        waitForQueue: 'uploadsOnly',
        autoSaveInFlight: true,
        draftSaveInFlight: false,
        uploadsInFlight: 0
      })
    ).toBe(false);

    expect(
      shouldShowSubmitPreparationOverlay({
        waitForQueue: 'uploadsOnly',
        autoSaveInFlight: false,
        draftSaveInFlight: false,
        uploadsInFlight: 1
      })
    ).toBe(true);

    expect(
      shouldShowSubmitPreparationOverlay({
        waitForQueue: 'none',
        autoSaveInFlight: true,
        draftSaveInFlight: true,
        uploadsInFlight: 1
      })
    ).toBe(false);
  });

  test('uses photo copy for upload-only waits and save copy for save waits', () => {
    expect(
      resolveSubmitPreparationMessageKey({
        uploadsInFlight: 1,
        autoSaveInFlight: false,
        draftSaveInFlight: false
      })
    ).toBe('navigation.waitPhotos');

    expect(
      resolveSubmitPreparationMessageKey({
        uploadsInFlight: 1,
        autoSaveInFlight: true,
        draftSaveInFlight: false
      })
    ).toBe('navigation.waitSaving');
  });
});
