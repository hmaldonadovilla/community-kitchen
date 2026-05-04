import { shouldClearStatusAfterSuccessfulSave } from '../../../src/web/react/app/saveFailureStatus';

describe('save failure status helpers', () => {
  it('clears only generic save failure errors after a later successful save', () => {
    expect(
      shouldClearStatusAfterSuccessfulSave({
        status: 'Could not save the latest changes.',
        statusTone: 'error'
      })
    ).toBe(true);
    expect(
      shouldClearStatusAfterSuccessfulSave({
        status: 'Autosave failed.',
        statusTone: 'error'
      })
    ).toBe(true);
    expect(
      shouldClearStatusAfterSuccessfulSave({
        status: 'Could not acquire the record save lock. Please retry.',
        statusTone: 'error'
      })
    ).toBe(true);
    expect(
      shouldClearStatusAfterSuccessfulSave({
        status: 'Could not queue record mutation. Please retry.',
        statusTone: 'error'
      })
    ).toBe(true);
    expect(
      shouldClearStatusAfterSuccessfulSave({
        status: 'Could not add photos.',
        statusTone: 'error'
      })
    ).toBe(true);
    expect(
      shouldClearStatusAfterSuccessfulSave({
        status:
          'Upload folder not accessible (id=abc). Service error: Drive. If this is a shared drive, ensure the script executes as a user who is a member of that drive.',
        statusTone: 'error'
      })
    ).toBe(true);
    expect(
      shouldClearStatusAfterSuccessfulSave({
        status: 'Could not save the latest changes.',
        statusTone: 'info'
      })
    ).toBe(false);
  });
});
