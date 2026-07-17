import jsQR from 'jsqr';

type NativeQrDetector = {
  detect: (source: CanvasImageSource) => Promise<Array<{ rawValue?: string }>>;
};

type NativeQrDetectorConstructor = new (options?: { formats?: string[] }) => NativeQrDetector;

type QrScannerGlobal = typeof globalThis & {
  BarcodeDetector?: NativeQrDetectorConstructor;
  FileReader?: typeof FileReader;
  Image?: typeof Image;
};

type CropRegion = {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  upscale: boolean;
};

type QrInversionAttempts = 'attemptBoth' | 'dontInvert' | 'onlyInvert';

export type VideoFrameDecodeOptions = {
  frameSequence?: number;
};

export type VideoFrameRegion = {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  maxDimension: number;
  inversionAttempts: QrInversionAttempts;
};

const FULL_FRAME_INTERVAL = 3;
const INVERTED_FRAME_INTERVAL = 8;

export const isLiveCameraSupported = (): boolean => {
  const mediaDevices = typeof navigator !== 'undefined' ? navigator.mediaDevices : undefined;
  return typeof mediaDevices?.getUserMedia === 'function';
};

export const isQrPhotoFallbackSupported = (): boolean => {
  const root = (typeof window !== 'undefined' ? window : globalThis) as QrScannerGlobal;
  return (
    typeof document !== 'undefined' &&
    typeof document.createElement === 'function' &&
    typeof root.FileReader === 'function' &&
    typeof root.Image === 'function'
  );
};

export const isQrScannerSupported = (): boolean => isLiveCameraSupported() || isQrPhotoFallbackSupported();

export const createNativeQrDetector = (): NativeQrDetector | null => {
  const root = (typeof window !== 'undefined' ? window : globalThis) as QrScannerGlobal;
  const BarcodeDetectorCtor = root?.BarcodeDetector;
  if (typeof BarcodeDetectorCtor !== 'function') return null;
  try {
    return new BarcodeDetectorCtor({ formats: ['qr_code'] });
  } catch {
    return null;
  }
};

const detectNativeQrValue = async (detector: NativeQrDetector | null, source: CanvasImageSource): Promise<string> => {
  if (!detector) return '';
  try {
    return (await detector.detect(source))?.[0]?.rawValue?.toString().trim() || '';
  } catch {
    return '';
  }
};

const decodeQrFromCanvas = (
  canvas: HTMLCanvasElement,
  inversionAttempts: QrInversionAttempts = 'attemptBoth'
): string => {
  const width = canvas.width;
  const height = canvas.height;
  if (!width || !height) return '';

  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const imageData = ctx.getImageData(0, 0, width, height);
  return jsQR(imageData.data, width, height, { inversionAttempts })?.data.trim() || '';
};

const centeredSquareRegion = (
  sourceWidth: number,
  sourceHeight: number,
  ratio: number,
  inversionAttempts: QrInversionAttempts = 'dontInvert'
): VideoFrameRegion => {
  const side = Math.max(1, Math.min(sourceWidth, sourceHeight) * ratio);
  return {
    sx: (sourceWidth - side) / 2,
    sy: (sourceHeight - side) / 2,
    sw: side,
    sh: side,
    maxDimension: Math.ceil(side),
    inversionAttempts
  };
};

/**
 * Prioritizes centered source-resolution detail for small labels while sampling
 * the whole frame and inverted codes less frequently to keep older phones responsive.
 */
export const buildVideoFrameRegions = (
  sourceWidth: number,
  sourceHeight: number,
  frameSequence = 0
): VideoFrameRegion[] => {
  if (!sourceWidth || !sourceHeight) return [];
  const regions = [
    centeredSquareRegion(sourceWidth, sourceHeight, 0.48),
    centeredSquareRegion(sourceWidth, sourceHeight, 0.72)
  ];
  if (frameSequence % FULL_FRAME_INTERVAL === 0) {
    regions.push({
      sx: 0,
      sy: 0,
      sw: sourceWidth,
      sh: sourceHeight,
      maxDimension: 1280,
      inversionAttempts: 'dontInvert'
    });
  }
  if (frameSequence % INVERTED_FRAME_INTERVAL === 0) {
    regions.push(centeredSquareRegion(sourceWidth, sourceHeight, 0.72, 'onlyInvert'));
  }
  return regions;
};

const drawVideoFrameRegion = (
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  region: VideoFrameRegion
): boolean => {
  const scale = Math.min(1, region.maxDimension / Math.max(region.sw, region.sh));
  const width = Math.max(1, Math.round(region.sw * scale));
  const height = Math.max(1, Math.round(region.sh * scale));
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(video, region.sx, region.sy, region.sw, region.sh, 0, 0, width, height);
  return true;
};

export const decodeQrFromVideoFrame = async (
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  detector: NativeQrDetector | null = null,
  options: VideoFrameDecodeOptions = {}
): Promise<string> => {
  const nativeValue = await detectNativeQrValue(detector, video);
  if (nativeValue) return nativeValue;

  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) return '';

  const regions = buildVideoFrameRegions(width, height, options.frameSequence || 0);
  for (const region of regions) {
    if (!drawVideoFrameRegion(video, canvas, region)) return '';
    const value = decodeQrFromCanvas(canvas, region.inversionAttempts);
    if (value) return value;
  }
  return '';
};

const loadImageFromFile = (file: File): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    let objectUrl = '';
    const cleanup = () => {
      if (objectUrl && typeof URL !== 'undefined' && typeof URL.revokeObjectURL === 'function') {
        URL.revokeObjectURL(objectUrl);
      }
    };

    image.onload = () => {
      cleanup();
      resolve(image);
    };
    image.onerror = () => {
      cleanup();
      reject(new Error('image-load-failed'));
    };

    if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
      objectUrl = URL.createObjectURL(file);
      image.src = objectUrl;
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result?.toString() || '';
      if (!result) {
        reject(new Error('image-read-failed'));
        return;
      }
      image.src = result;
    };
    reader.onerror = () => reject(new Error('image-read-failed'));
    reader.readAsDataURL(file);
  });

const buildCropRegions = (sourceWidth: number, sourceHeight: number): CropRegion[] => {
  const regions: CropRegion[] = [
    { sx: 0, sy: 0, sw: sourceWidth, sh: sourceHeight, upscale: false }
  ];

  const addRegion = (
    sxRatio: number,
    syRatio: number,
    swRatio: number,
    shRatio: number,
    upscale: boolean
  ): void => {
    const sx = Math.max(0, sourceWidth * sxRatio);
    const sy = Math.max(0, sourceHeight * syRatio);
    const sw = Math.min(sourceWidth - sx, sourceWidth * swRatio);
    const sh = Math.min(sourceHeight - sy, sourceHeight * shRatio);
    if (sw < 32 || sh < 32) return;
    const duplicate = regions.some(
      region =>
        Math.abs(region.sx - sx) < 1 &&
        Math.abs(region.sy - sy) < 1 &&
        Math.abs(region.sw - sw) < 1 &&
        Math.abs(region.sh - sh) < 1 &&
        region.upscale === upscale
    );
    if (!duplicate) regions.push({ sx, sy, sw, sh, upscale });
  };

  [0.82, 0.64, 0.48].forEach(ratio => {
    const sw = sourceWidth * ratio;
    const sh = sourceHeight * ratio;
    regions.push({
      sx: (sourceWidth - sw) / 2,
      sy: (sourceHeight - sh) / 2,
      sw,
      sh,
      upscale: true
    });
  });

  [
    [0, 0, 0.5, 0.65],
    [0.25, 0, 0.5, 0.65],
    [0.5, 0, 0.5, 0.65],
    [0, 0.18, 0.5, 0.64],
    [0.25, 0.18, 0.5, 0.64],
    [0.5, 0.18, 0.5, 0.64],
    [0, 0.35, 0.5, 0.65],
    [0.25, 0.35, 0.5, 0.65],
    [0.5, 0.35, 0.5, 0.65],
    [0.55, 0.08, 0.35, 0.55]
  ].forEach(([sx, sy, sw, sh]) => {
    addRegion(sx, sy, sw, sh, false);
    addRegion(sx, sy, sw, sh, true);
  });

  return regions;
};

const drawRegion = (source: CanvasImageSource, canvas: HTMLCanvasElement, region: CropRegion): void => {
  const sourceMax = Math.max(region.sw, region.sh);
  const maxDimension = region.upscale ? 2400 : 4096;
  const scale = region.upscale ? Math.min(4, maxDimension / sourceMax) : Math.min(1, maxDimension / sourceMax);
  const width = Math.max(1, Math.round(region.sw * scale));
  const height = Math.max(1, Math.round(region.sh * scale));

  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(source, region.sx, region.sy, region.sw, region.sh, 0, 0, width, height);
};

export const decodeQrFromImageElement = async (
  image: HTMLImageElement,
  canvas: HTMLCanvasElement,
  detector: NativeQrDetector | null = null
): Promise<string> => {
  const nativeValue = await detectNativeQrValue(detector, image);
  if (nativeValue) return nativeValue;

  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  if (!sourceWidth || !sourceHeight) return '';

  const regions = buildCropRegions(sourceWidth, sourceHeight);
  for (const region of regions) {
    drawRegion(image, canvas, region);
    const value = decodeQrFromCanvas(canvas);
    if (value) return value;
  }
  return '';
};

export const decodeQrFromImageFile = async (
  file: File,
  canvas: HTMLCanvasElement,
  detector: NativeQrDetector | null = null
): Promise<string> => decodeQrFromImageElement(await loadImageFromFile(file), canvas, detector);
