import jsQR from 'jsqr';
import {
  buildVideoFrameRegions,
  decodeQrFromVideoFrame
} from '../../../src/web/qrScanner/decoder';

jest.mock('jsqr', () => ({
  __esModule: true,
  default: jest.fn()
}));

const jsQrMock = jsQR as jest.MockedFunction<typeof jsQR>;

const createCanvas = () => {
  const context = {
    drawImage: jest.fn(),
    getImageData: jest.fn(() => ({ data: new Uint8ClampedArray(4) })),
    imageSmoothingEnabled: true
  };
  const canvas = {
    width: 0,
    height: 0,
    getContext: jest.fn(() => context)
  } as unknown as HTMLCanvasElement;
  return { canvas, context };
};

const video = {
  videoWidth: 1920,
  videoHeight: 1080
} as HTMLVideoElement;

describe('QR scanner live-frame decoder', () => {
  beforeEach(() => {
    jsQrMock.mockReset();
  });

  test('builds tight and medium centered regions before periodic full-frame work', () => {
    const regions = buildVideoFrameRegions(1920, 1080, 3);

    expect(regions).toHaveLength(3);
    expect(regions[0].sw).toBeCloseTo(518.4);
    expect(regions[0].sx).toBeCloseTo(700.8);
    expect(regions[0].sy).toBeCloseTo(280.8);
    expect(regions[1].sw).toBeCloseTo(777.6);
    expect(regions[2]).toMatchObject({
      sx: 0,
      sy: 0,
      sw: 1920,
      sh: 1080,
      maxDimension: 1280,
      inversionAttempts: 'dontInvert'
    });
  });

  test('returns a small centered code without paying for the full frame', async () => {
    const { canvas } = createCanvas();
    jsQrMock
      .mockReturnValueOnce(null)
      .mockReturnValueOnce({ data: ' https://drive.google.com/file/d/example ' } as any);

    await expect(
      decodeQrFromVideoFrame(video, canvas, null, { frameSequence: 1 })
    ).resolves.toBe('https://drive.google.com/file/d/example');
    expect(jsQrMock).toHaveBeenCalledTimes(2);
    expect(jsQrMock.mock.calls.map(call => [call[1], call[2]])).toEqual([
      [518, 518],
      [778, 778]
    ]);
    expect(jsQrMock.mock.calls.map(call => call[3])).toEqual([
      { inversionAttempts: 'dontInvert' },
      { inversionAttempts: 'dontInvert' }
    ]);
  });

  test('downscales the periodic full-frame pass to bound decoder cost', async () => {
    const { canvas } = createCanvas();
    jsQrMock.mockReturnValue(null);

    await decodeQrFromVideoFrame(video, canvas, null, { frameSequence: 3 });

    expect(jsQrMock).toHaveBeenCalledTimes(3);
    expect(jsQrMock.mock.calls[2]?.slice(1, 3)).toEqual([1280, 720]);
  });

  test('checks inverted centered codes only on the fallback interval', async () => {
    const { canvas } = createCanvas();
    jsQrMock.mockReturnValue(null);

    await decodeQrFromVideoFrame(video, canvas, null, { frameSequence: 8 });

    expect(jsQrMock).toHaveBeenCalledTimes(3);
    expect(jsQrMock.mock.calls[2]?.[3]).toEqual({ inversionAttempts: 'onlyInvert' });
  });
});
