export type FileDataUrlPayload = { name: string; type: string; dataUrl: string };

const debugEnabled = (): boolean => Boolean((globalThis as any)?.__WEB_FORM_DEBUG__);

const logDebug = (event: string, payload?: Record<string, unknown>) => {
  if (!debugEnabled() || typeof console === 'undefined' || typeof console.info !== 'function') return;
  try {
    console.info('[ReactForm][Upload]', event, payload || {});
  } catch (_) {
    // ignore
  }
};

const normalizeCompression = (
  raw: any
): { imagesEnabled: boolean; maxDimension: number; quality: number; outputType: 'image/jpeg' | 'image/webp' | 'keep'; videosEnabled: boolean } => {
  const fallback = { imagesEnabled: false, maxDimension: 1600, quality: 0.82, outputType: 'keep' as const, videosEnabled: false };
  if (raw === true) return { ...fallback, imagesEnabled: true };
  if (!raw || typeof raw !== 'object') return fallback;
  const imagesRaw = (raw as any).images;
  const videosRaw = (raw as any).videos;

  const imagesEnabled =
    imagesRaw === true ||
    (imagesRaw && typeof imagesRaw === 'object' && ((imagesRaw as any).enabled === undefined ? true : !!(imagesRaw as any).enabled));
  const videosEnabled = videosRaw === true || (videosRaw && typeof videosRaw === 'object' ? !!(videosRaw as any).enabled : false);

  const imgObj = imagesRaw && typeof imagesRaw === 'object' ? imagesRaw : {};
  const maxDimension =
    imgObj.maxDimension !== undefined && imgObj.maxDimension !== null && Number(imgObj.maxDimension) > 0
      ? Number(imgObj.maxDimension)
      : fallback.maxDimension;
  const quality =
    imgObj.quality !== undefined && imgObj.quality !== null && Number(imgObj.quality) > 0 && Number(imgObj.quality) <= 1
      ? Number(imgObj.quality)
      : fallback.quality;
  const outputTypeRaw = (imgObj.outputType !== undefined && imgObj.outputType !== null ? String(imgObj.outputType) : '').toLowerCase();
  const outputType: 'image/jpeg' | 'image/webp' | 'keep' =
    outputTypeRaw === 'image/webp' || outputTypeRaw === 'webp'
      ? 'image/webp'
      : outputTypeRaw === 'image/jpeg' || outputTypeRaw === 'jpeg' || outputTypeRaw === 'jpg'
      ? 'image/jpeg'
      : 'keep';

  return { imagesEnabled: !!imagesEnabled, maxDimension, quality, outputType, videosEnabled: !!videosEnabled };
};

const canCanvas = (): boolean => {
  try {
    return typeof document !== 'undefined' && typeof document.createElement === 'function';
  } catch (_) {
    return false;
  }
};

const extForMime = (mime: string): string => {
  const m = (mime || '').toLowerCase();
  if (m === 'image/webp') return 'webp';
  if (m === 'image/png') return 'png';
  return 'jpg';
};

const replaceFileExtension = (name: string, nextExt: string): string => {
  const base = (name || 'upload').toString();
  const parts = base.split('.');
  if (parts.length <= 1) return `${base}.${nextExt}`;
  parts[parts.length - 1] = nextExt;
  return parts.join('.');
};

const compressImageFile = async (
  file: File,
  opts: { maxDimension: number; quality: number; outputType: 'image/jpeg' | 'image/webp' | 'keep' }
): Promise<File> => {
  if (!canCanvas()) return file;
  const type = (file.type || '').toLowerCase();
  if (!type.startsWith('image/')) return file;
  if (type === 'image/svg+xml') return file;
  // Animated GIFs should generally not be recompressed via canvas (will flatten animation).
  if (type === 'image/gif') return file;

  const targetType = (() => {
    if (opts.outputType !== 'keep') return opts.outputType;
    if (type === 'image/jpeg' || type === 'image/webp' || type === 'image/png') return type;
    return 'image/jpeg';
  })();

  const maxDim = Math.max(64, Math.floor(opts.maxDimension || 1600));
  const quality = Math.max(0.1, Math.min(1, opts.quality || 0.82));

  let bitmap: any = null;
  let objectUrl: string | null = null;
  try {
    if (typeof createImageBitmap === 'function') {
      bitmap = await createImageBitmap(file);
    } else {
      objectUrl = URL.createObjectURL(file);
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error('Failed to load image'));
        el.src = objectUrl as string;
      });
      bitmap = img;
    }

    const w = (bitmap as any).width || 0;
    const h = (bitmap as any).height || 0;
    if (!w || !h) return file;

    const scale = Math.min(1, maxDim / Math.max(w, h));
    const outW = Math.max(1, Math.round(w * scale));
    const outH = Math.max(1, Math.round(h * scale));

    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap as any, 0, 0, outW, outH);

    const blob: Blob | null = await new Promise(resolve => {
      try {
        canvas.toBlob(b => resolve(b), targetType, targetType === 'image/png' ? undefined : quality);
      } catch (_) {
        resolve(null);
      }
    });
    if (!blob) return file;

    // If compression didn't help, keep original.
    if (blob.size >= file.size) return file;

    const nextName = targetType !== type ? replaceFileExtension(file.name, extForMime(targetType)) : file.name;
    return new File([blob], nextName, { type: targetType, lastModified: file.lastModified });
  } finally {
    try {
      if (bitmap && typeof (bitmap as any).close === 'function') (bitmap as any).close();
    } catch (_) {
      // ignore
    }
    try {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    } catch (_) {
      // ignore
    }
  }
};

export const buildFilePayload = async (
  files: FileList | File[] | undefined | null,
  maxFiles?: number,
  uploadConfig?: any
) => {
  if (!files) return [];
  const list = Array.from(files);
  const sliced = maxFiles ? list.slice(0, maxFiles) : list;
  const compressionBase = normalizeCompression(uploadConfig?.compression);
  const allowedExts = Array.isArray(uploadConfig?.allowedExtensions)
    ? (uploadConfig.allowedExtensions || [])
        .map((v: any) => (v !== undefined && v !== null ? v.toString().trim().toLowerCase().replace(/^\./, '') : ''))
        .filter(Boolean)
    : [];
  const compression =
    compressionBase.outputType !== 'keep' && allowedExts.length
      ? (() => {
          const ext = extForMime(compressionBase.outputType);
          const ok = allowedExts.includes(ext) || (ext === 'jpg' && allowedExts.includes('jpeg'));
          if (ok) return compressionBase;
          logDebug('compression.image.outputType.notAllowed', {
            outputType: compressionBase.outputType,
            allowedExtensions: allowedExts
          });
          return { ...compressionBase, outputType: 'keep' as const };
        })()
      : compressionBase;
  if (compression.videosEnabled) {
    // We intentionally do not attempt to transcode videos client-side (would require heavy deps like ffmpeg.wasm).
    logDebug('compression.videos.unsupported', { note: 'Video compression not supported; uploading original.' });
  }
  const payloads = await Promise.all(
    sliced.map(
      async file =>
        new Promise<FileDataUrlPayload>((resolve, reject) => {
          // Optional image compression (best-effort).
          const maybeCompress = async (): Promise<File> => {
            if (!compression.imagesEnabled) return file;
            try {
              const next = await compressImageFile(file, compression);
              if (next !== file) {
                logDebug('compression.image.applied', {
                  name: file.name,
                  beforeBytes: file.size,
                  afterBytes: next.size,
                  type: file.type || null,
                  outType: next.type || null
                });
              }
              return next;
            } catch (err: any) {
              logDebug('compression.image.failed', { name: file.name, message: err?.message || err?.toString?.() || 'unknown' });
              return file;
            }
          };

          const reader = new FileReader();
          reader.onload = () => resolve({ name: file.name, type: file.type, dataUrl: (reader.result as string) || '' });
          reader.onerror = () => reject(new Error('Failed to read file'));
          void maybeCompress().then(f => {
            reader.onload = () => resolve({ name: f.name, type: f.type, dataUrl: (reader.result as string) || '' });
            reader.readAsDataURL(f);
          });
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

export const buildMaybeFilePayload = async (raw: any, maxFiles?: number, uploadConfig?: any): Promise<any> => {
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
    const payloads = await buildFilePayload(files, remaining, uploadConfig);
    const combined = [...existing, ...payloads];
    return maxFiles ? combined.slice(0, maxFiles) : combined;
  }

  // FileList and File[] (pure)
  if (isFilePayloadCandidate(raw)) {
    return await buildFilePayload(raw, maxFiles, uploadConfig);
  }
  return raw;
};



