import { extractDriveFileIdFromLink } from '../../../features/uploads/domain/linkCapture';

export const extractDriveFileId = (value: string): string | undefined => {
  return extractDriveFileIdFromLink(value) || undefined;
};

export const isLikelyImageName = (name: string): boolean => /\.(png|jpe?g|webp|gif|bmp|svg|heic|heif)$/i.test(name || '');

const pushUnique = (values: string[], value?: string): void => {
  const next = (value || '').toString().trim();
  if (!next || values.includes(next)) return;
  values.push(next);
};

export const buildExistingFileThumbnailCandidates = (href: string, name: string): string[] => {
  const rawHref = (href || '').toString().trim();
  if (!rawHref) return [];

  const candidates: string[] = [];
  const driveId = extractDriveFileId(rawHref);
  if (driveId) {
    const encoded = encodeURIComponent(driveId);
    pushUnique(candidates, `https://lh3.googleusercontent.com/d/${encoded}=w800`);
    pushUnique(candidates, `https://lh3.googleusercontent.com/d/${encoded}=w400`);
    pushUnique(candidates, `https://drive.google.com/thumbnail?id=${encoded}&sz=w800`);
    pushUnique(candidates, `https://drive.google.com/thumbnail?id=${encoded}&sz=w400`);
    pushUnique(candidates, rawHref);
    pushUnique(candidates, `https://drive.google.com/uc?export=download&id=${encoded}`);
    return candidates;
  }

  if (isLikelyImageName(name) || /^data:image\//i.test(rawHref)) {
    pushUnique(candidates, rawHref);
  }
  return candidates;
};

export const buildLocalFileThumbnailKey = (file: Pick<File, 'name' | 'size' | 'lastModified' | 'type'>, index: number): string =>
  `file-${index}-${file.name}-${file.size}-${file.lastModified}-${file.type || ''}`;
