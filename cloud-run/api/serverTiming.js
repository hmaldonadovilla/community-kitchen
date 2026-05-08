const createServerTiming = label => {
  const startedAt = Date.now();
  const steps = {};
  const counts = {};

  const record = (step, durationMs) => {
    const key = (step || '').toString().trim();
    if (!key) return;
    steps[key] = (steps[key] || 0) + Math.max(0, Number(durationMs) || 0);
  };

  return {
    label: (label || 'operation').toString(),
    record,
    increment(key, amount = 1) {
      const name = (key || '').toString().trim();
      if (!name) return;
      counts[name] = (counts[name] || 0) + Math.max(0, Number(amount) || 0);
    },
    async measure(step, fn) {
      const stepStartedAt = Date.now();
      try {
        return await fn();
      } finally {
        record(step, Date.now() - stepStartedAt);
      }
    },
    snapshot() {
      return {
        totalMs: Date.now() - startedAt,
        steps: { ...steps },
        counts: { ...counts }
      };
    },
    log(extra = {}) {
      const payload = {
        label: (label || 'operation').toString(),
        ...this.snapshot(),
        ...extra
      };
      try {
        console.info('[CloudRun][perf]', payload);
      } catch {
        // Ignore logging failures; timing must not affect request behavior.
      }
      return payload;
    }
  };
};

module.exports = {
  createServerTiming
};
