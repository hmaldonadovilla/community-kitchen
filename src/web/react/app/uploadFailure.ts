export type UploadFailureTargetBase = {
  scope: 'top' | 'line';
  fieldPath: string;
};

export type UploadFailureState<TTarget extends UploadFailureTargetBase = UploadFailureTargetBase> = {
  message: string;
  retrying: boolean;
  target: TTarget;
  rawMessage?: string;
};

export type UploadFailureMap<TTarget extends UploadFailureTargetBase = UploadFailureTargetBase> = Record<
  string,
  UploadFailureState<TTarget>
>;

export const resolveUploadFailureUserMessage = (args: { fallback: string; rawMessage?: string | null }): string => {
  const fallback = (args.fallback || '').toString().trim();
  const raw = (args.rawMessage || '').toString().trim();
  return fallback || raw || 'The photos were not saved. Check the connection and try again.';
};

export const createUploadFailureState = <TTarget extends UploadFailureTargetBase>(args: {
  target: TTarget;
  message: string;
  rawMessage?: string | null;
}): UploadFailureState<TTarget> => ({
  message: args.message,
  retrying: false,
  target: args.target,
  rawMessage: args.rawMessage ? args.rawMessage.toString() : undefined
});

export const setUploadFailureRetrying = <TTarget extends UploadFailureTargetBase>(
  failures: UploadFailureMap<TTarget>,
  fieldPath: string,
  retrying: boolean
): UploadFailureMap<TTarget> => {
  const existing = failures[fieldPath];
  if (!existing || existing.retrying === retrying) return failures;
  return {
    ...failures,
    [fieldPath]: {
      ...existing,
      retrying
    }
  };
};

export const clearUploadFailure = <TTarget extends UploadFailureTargetBase>(
  failures: UploadFailureMap<TTarget>,
  fieldPath: string
): UploadFailureMap<TTarget> => {
  if (!failures[fieldPath]) return failures;
  const next = { ...failures };
  delete next[fieldPath];
  return next;
};
