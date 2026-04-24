import { shouldAlwaysLogDiagnosticEvent } from '../../../src/web/react/app/utils';

describe('diagnostic logging policy', () => {
  it('keeps freshness heartbeat diagnostics visible without debug mode', () => {
    expect(shouldAlwaysLogDiagnosticEvent('record.freshness.check.start')).toBe(true);
    expect(shouldAlwaysLogDiagnosticEvent('datasource.freshness.check.start')).toBe(true);
  });

  it('continues gating ordinary noisy diagnostics behind debug mode', () => {
    expect(shouldAlwaysLogDiagnosticEvent('autosave.begin')).toBe(false);
  });
});
