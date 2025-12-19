export type FileDataUrlPayload = { name: string; type: string; dataUrl: string };

export const buildFilePayload = async (files: FileList | File[] | undefined | null, maxFiles?: number) => {
  if (!files) return [];
  const list = Array.from(files);
  const sliced = maxFiles ? list.slice(0, maxFiles) : list;
  const payloads = await Promise.all(
    sliced.map(
      file =>
        new Promise<FileDataUrlPayload>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve({ name: file.name, type: file.type, dataUrl: (reader.result as string) || '' });
          reader.onerror = () => reject(new Error('Failed to read file'));
          reader.readAsDataURL(file);
        })
    )
  );
  return payloads;
};

export const hasFileCtor = (): boolean => {
  try {
    return typeof File !== 'undefined';
  } catch (_) {
    return false;
  }
};

export const hasFileListCtor = (): boolean => {
  try {
    return typeof FileList !== 'undefined';
  } catch (_) {
    return false;
  }
};

export const isFilePayloadCandidate = (value: any): value is FileList | File[] => {
  if (!value) return false;
  if (hasFileListCtor() && value instanceof FileList) return true;
  if (Array.isArray(value) && hasFileCtor()) {
    return value.some(item => item instanceof File);
  }
  return false;
};

export const buildMaybeFilePayload = async (raw: any, maxFiles?: number): Promise<any> => {
  if (!raw) return raw;

  const isFile = (v: any): v is File => {
    if (!hasFileCtor()) return false;
    return v instanceof File;
  };

  // Handle mixed arrays like: ['https://...', File, ...]
  if (Array.isArray(raw)) {
    const existing: any[] = [];
    const files: File[] = [];
    raw.forEach(item => {
      if (!item) return;
      if (isFile(item)) {
        files.push(item);
        return;
      }
      if (typeof item === 'string') {
        const parts = item
          .split(',')
          .map(p => p.trim())
          .filter(Boolean);
        if (parts.length) {
          parts.forEach(p => existing.push(p));
        }
        return;
      }
      if (typeof item === 'object' && typeof (item as any).url === 'string') {
        const url = ((item as any).url as string).trim();
        if (url) existing.push(url);
      }
    });

    if (!files.length) return raw;

    const remaining = maxFiles ? Math.max(0, maxFiles - existing.length) : undefined;
    const payloads = await buildFilePayload(files, remaining);
    const combined = [...existing, ...payloads];
    return maxFiles ? combined.slice(0, maxFiles) : combined;
  }

  // FileList and File[] (pure)
  if (isFilePayloadCandidate(raw)) {
    return await buildFilePayload(raw, maxFiles);
  }
  return raw;
};



