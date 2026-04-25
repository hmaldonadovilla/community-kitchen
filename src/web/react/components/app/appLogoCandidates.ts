/**
 * Builds stable image URL candidates for app header logos, preferring Drive
 * thumbnail endpoints over share/view URLs that often return 403 in web apps.
 */
export const extractDriveImageId = (value: string): string | undefined => {
  const raw = (value || '').toString().trim();
  if (!raw) return undefined;

  const byPath = raw.match(/\/file\/d\/([a-zA-Z0-9_-]{10,})/);
  if (byPath?.[1]) return byPath[1];
  const byQuery = raw.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  if (byQuery?.[1]) return byQuery[1];
  const byGoogleusercontent = raw.match(/googleusercontent\.com\/d\/([a-zA-Z0-9_-]{10,})/);
  if (byGoogleusercontent?.[1]) return byGoogleusercontent[1];
  if (/^[a-zA-Z0-9_-]{10,}$/.test(raw)) return raw;
  return undefined;
};

const isDriveUcViewUrl = (value: string): boolean => {
  try {
    const parsedUrl = new URL(value);
    return (
      parsedUrl.hostname === 'drive.google.com' &&
      parsedUrl.pathname === '/uc' &&
      parsedUrl.searchParams.get('export') === 'view' &&
      Boolean(parsedUrl.searchParams.get('id'))
    );
  } catch {
    return false;
  }
};

export const buildAppLogoCandidates = (logoUrl?: string): string[] => {
  const raw = (logoUrl || '').toString().trim();
  if (!raw) return [];

  const candidates: string[] = [];
  const push = (value?: string) => {
    const next = (value || '').toString().trim();
    if (!next || candidates.includes(next)) return;
    candidates.push(next);
  };

  const driveId = extractDriveImageId(raw);
  if (!driveId) {
    push(raw);
    return candidates;
  }

  const encoded = encodeURIComponent(driveId);
  push(`https://drive.google.com/thumbnail?id=${encoded}&sz=w256`);
  push(`https://drive.google.com/thumbnail?id=${encoded}&sz=w512`);
  push(`https://lh3.googleusercontent.com/d/${encoded}=w256`);
  push(`https://lh3.googleusercontent.com/d/${encoded}=w512`);

  if (!isDriveUcViewUrl(raw)) {
    push(raw);
  }
  push(`https://drive.google.com/uc?export=download&id=${encoded}`);

  return candidates;
};
