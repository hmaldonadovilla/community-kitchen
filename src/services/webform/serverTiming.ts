export type ServerTimingSteps = Record<string, number>;

export type ServerTimingSummary = {
  enabled: boolean;
  totalMs: number;
  steps: ServerTimingSteps;
};

export const isServerTimingEnabled = (value: unknown): boolean => {
  const raw = (value ?? '').toString().trim().toLowerCase();
  if (!raw) return false;
  return (
    raw.includes('staging') ||
    raw.includes('stage-2') ||
    raw.includes('stage2') ||
    raw.includes('stage-two') ||
    raw.includes('nonprod') ||
    raw.includes('dev')
  );
};

export class ServerTimingRecorder {
  private readonly enabled: boolean;
  private readonly startedAt: number;
  private readonly steps: ServerTimingSteps = {};

  constructor(enabled: boolean) {
    this.enabled = !!enabled;
    this.startedAt = Date.now();
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public measure<T>(label: string, fn: () => T): T {
    if (!this.enabled) return fn();
    const startedAt = Date.now();
    try {
      return fn();
    } finally {
      this.steps[label] = Date.now() - startedAt;
    }
  }

  public snapshot(): ServerTimingSummary | null {
    if (!this.enabled) return null;
    return {
      enabled: true,
      totalMs: Date.now() - this.startedAt,
      steps: { ...this.steps }
    };
  }
}
