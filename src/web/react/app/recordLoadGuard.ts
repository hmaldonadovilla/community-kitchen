export function shouldDiscardRecordLoadResult(args: {
  requestSeq: number;
  currentSeq: number;
  sessionAtStart: number;
  currentSession: number;
}): boolean {
  return args.requestSeq !== args.currentSeq || args.sessionAtStart !== args.currentSession;
}
