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

const decodeQrFromCanvas = (canvas: HTMLCanvasElement): string => {
  const width = canvas.width;
  const height = canvas.height;
  if (!width || !height) return '';

  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const imageData = ctx.getImageData(0, 0, width, height);
  return jsQR(imageData.data, width, height, { inversionAttempts: 'attemptBoth' })?.data.trim() || '';
};

export const decodeQrFromVideoFrame = async (
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  detector: NativeQrDetector | null = null
): Promise<string> => {
  const nativeValue = await detectNativeQrValue(detector, video);
  if (nativeValue) return nativeValue;

  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) return '';

  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.drawImage(video, 0, 0, width, height);
  return decodeQrFromCanvas(canvas);
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
