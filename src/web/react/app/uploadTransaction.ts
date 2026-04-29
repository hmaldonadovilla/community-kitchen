const truthyValues = new Set(['1', 'true', 'yes', 'y', 'on', 'block', 'blocking', 'wait']);

export const resolveUploadBlockUntilSaved = (uploadConfig?: any): boolean => {
  if (!uploadConfig || typeof uploadConfig !== 'object') return false;
  const raw =
    uploadConfig.blockUntilSaved ??
    uploadConfig.block_until_saved ??
    uploadConfig.waitUntilSaved ??
    uploadConfig.wait_until_saved ??
    uploadConfig.waitForSave ??
    uploadConfig.wait_for_save ??
    uploadConfig.blocking;
  if (raw === true || raw === 1) return true;
  if (raw === false || raw === 0 || raw === null || raw === undefined) return false;
  return truthyValues.has(raw.toString().trim().toLowerCase());
};

