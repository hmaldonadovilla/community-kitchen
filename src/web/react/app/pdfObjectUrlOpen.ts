export type PdfObjectUrlOpenResult = {
  opened: boolean;
  method: 'popup' | 'currentWindow' | 'blocked';
};

export type PdfObjectUrlPopup = {
  closed?: boolean;
  location: {
    href: string;
  };
};

const normalizeUrl = (value: unknown): string => (value === undefined || value === null ? '' : value.toString().trim());

export const openPdfObjectUrl = (args: {
  objectUrl: string;
  popup?: PdfObjectUrlPopup | null;
  assignLocation?: ((href: string) => void) | null;
}): PdfObjectUrlOpenResult => {
  const objectUrl = normalizeUrl(args.objectUrl);
  if (!objectUrl) return { opened: false, method: 'blocked' };

  try {
    if (args.popup && args.popup.closed !== true) {
      args.popup.location.href = objectUrl;
      return { opened: true, method: 'popup' };
    }
  } catch {
    // Try the current window fallback below.
  }

  try {
    if (args.assignLocation) {
      args.assignLocation(objectUrl);
      return { opened: true, method: 'currentWindow' };
    }
  } catch {
    // The caller can still show a manual link fallback.
  }

  return { opened: false, method: 'blocked' };
};
