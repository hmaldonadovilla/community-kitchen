export type UploadComparableFile = {
  name: string;
  size: number;
  lastModified: number;
};

export type UploadFieldMergeItem<TFile extends UploadComparableFile> = string | TFile;

export const getUploadFileSignature = (file: UploadComparableFile): string =>
  `${file.name}|${file.size}|${file.lastModified}`;

export const mergeUploadedFieldItems = <TFile extends UploadComparableFile>(
  args: {
    currentItems: Array<UploadFieldMergeItem<TFile>>;
    hasCurrentValue: boolean;
    fallbackItems?: Array<UploadFieldMergeItem<TFile>>;
    uploadedFiles: TFile[];
    uploadedUrls: string[];
  }
): Array<UploadFieldMergeItem<TFile>> => {
  const mergeBase = args.hasCurrentValue ? args.currentItems : args.fallbackItems || [];
  if (!mergeBase.length) return [];

  const urlBySignature = new Map<string, string>();
  args.uploadedFiles.forEach((file, index) => {
    const url = (args.uploadedUrls[index] || '').toString().trim();
    if (!url) return;
    urlBySignature.set(getUploadFileSignature(file), url);
  });

  return mergeBase.map(item => {
    if (typeof item === 'string') return item;
    const replacementUrl = urlBySignature.get(getUploadFileSignature(item));
    return replacementUrl || item;
  });
};

const normalizeUrl = (raw: unknown): string => {
  try {
    return String(raw || '').trim();
  } catch {
    return '';
  }
};

const pushUnique = <TFile extends UploadComparableFile>(
  target: Array<UploadFieldMergeItem<TFile>>,
  seen: Set<string>,
  item: UploadFieldMergeItem<TFile>
): void => {
  if (typeof item !== 'string') {
    target.push(item);
    return;
  }
  const normalized = normalizeUrl(item);
  if (!normalized || seen.has(normalized)) return;
  seen.add(normalized);
  target.push(normalized);
};

export const mergeSavedUploadUrlItems = <TFile extends UploadComparableFile>(
  args: {
    currentItems: Array<UploadFieldMergeItem<TFile>>;
    hasCurrentValue: boolean;
    fallbackItems?: Array<UploadFieldMergeItem<TFile>>;
    previousUrls: string[];
    savedUrls: string[];
  }
): Array<UploadFieldMergeItem<TFile>> => {
  if (!args.hasCurrentValue) {
    return args.savedUrls.map(normalizeUrl).filter(Boolean);
  }

  const mergeBase = args.currentItems.length ? args.currentItems : [];
  if (!mergeBase.length) return [];

  const savedByPrevious = new Map<string, string>();
  args.previousUrls.forEach((previousUrl, index) => {
    const previous = normalizeUrl(previousUrl);
    const saved = normalizeUrl(args.savedUrls[index]);
    if (previous && saved) savedByPrevious.set(previous, saved);
  });

  const seen = new Set<string>();
  const merged: Array<UploadFieldMergeItem<TFile>> = [];
  mergeBase.forEach(item => {
    if (typeof item !== 'string') {
      pushUnique(merged, seen, item);
      return;
    }
    const normalized = normalizeUrl(item);
    pushUnique(merged, seen, savedByPrevious.get(normalized) || normalized);
  });

  return merged;
};
