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
