import { resolveCurrentClientDataVersion } from './submission';

/**
 * Owns pure record lifecycle decisions for App.tsx.
 *
 * Keep this boundary free of React state, DOM access, and transport calls. The
 * React component should pass current ref/state values in, while this module
 * decides record identity, known client versions, and version-check outcomes.
 */

type RecordIdentitySnapshot = {
  id?: string | null;
} | null | undefined;

export const resolveCurrentOpenRecordId = (args: {
  selectedRecordId?: string | null;
  selectedRecordSnapshot?: RecordIdentitySnapshot;
  lastSubmissionMetaId?: string | null;
}): string => args.selectedRecordId || args.selectedRecordSnapshot?.id || args.lastSubmissionMetaId || '';

export const resolveKnownClientDataVersion = (args: {
  recordDataVersion?: number | string | null;
  optimisticClientDataVersion?: number | string | null;
  lastSubmissionMetaDataVersion?: number | string | null;
  selectedRecordSnapshotDataVersion?: number | string | null;
}): number | null =>
  resolveCurrentClientDataVersion(
    args.recordDataVersion,
    args.optimisticClientDataVersion,
    args.lastSubmissionMetaDataVersion,
    args.selectedRecordSnapshotDataVersion
  );

export const resolveRecordVersionCheckBaseline = (args: {
  currentDataVersion?: number | string | null;
  cachedVersion?: number | string | null;
}): number | null => {
  const currentDataVersion = Number(args.currentDataVersion);
  if (Number.isFinite(currentDataVersion) && currentDataVersion > 0) {
    return currentDataVersion;
  }
  const cachedVersion = Number(args.cachedVersion);
  return Number.isFinite(cachedVersion) && cachedVersion > 0 ? cachedVersion : null;
};

export type RecordVersionCheckComparison =
  | {
      state: 'match';
      baselineVersion: number;
      serverVersion: number;
      serverRow: number | null;
    }
  | {
      state: 'stale';
      baselineVersion: number | null;
      serverVersion: number;
      serverRow: number | null;
    }
  | {
      state: 'unknown';
      baselineVersion: number | null;
      serverVersion: number | null;
      serverRow: number | null;
    };

export const resolveRecordVersionCheckComparison = (args: {
  currentDataVersion?: number | string | null;
  cachedVersion?: number | string | null;
  serverDataVersion?: number | string | null;
  serverRowNumber?: number | string | null;
}): RecordVersionCheckComparison => {
  const baselineVersion = resolveRecordVersionCheckBaseline({
    currentDataVersion: args.currentDataVersion,
    cachedVersion: args.cachedVersion
  });
  const serverVersionRaw = Number(args.serverDataVersion);
  const serverVersion = Number.isFinite(serverVersionRaw) && serverVersionRaw > 0 ? serverVersionRaw : null;
  const serverRowRaw = Number(args.serverRowNumber);
  const serverRow = Number.isFinite(serverRowRaw) ? serverRowRaw : null;

  if (serverVersion === null) {
    return {
      state: 'unknown',
      baselineVersion,
      serverVersion,
      serverRow
    };
  }
  if (baselineVersion !== null && serverVersion === baselineVersion) {
    return {
      state: 'match',
      baselineVersion,
      serverVersion,
      serverRow
    };
  }
  return {
    state: 'stale',
    baselineVersion,
    serverVersion,
    serverRow
  };
};
