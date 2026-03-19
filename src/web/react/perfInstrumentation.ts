export const isPerfInstrumentationEnv = (value: unknown): boolean => {
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

export const isGlobalPerfInstrumentationEnabled = (): boolean => {
  try {
    return isPerfInstrumentationEnv((globalThis as any)?.__CK_ENV_TAG__ || '');
  } catch (_) {
    return false;
  }
};
