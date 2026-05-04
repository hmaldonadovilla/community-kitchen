import { getPerfNow } from '../../../src/web/react/app/perfClock';

describe('perfClock', () => {
  const originalPerformance = globalThis.performance;

  afterEach(() => {
    jest.restoreAllMocks();
    Object.defineProperty(globalThis, 'performance', {
      configurable: true,
      value: originalPerformance
    });
  });

  it('uses performance.now when available', () => {
    Object.defineProperty(globalThis, 'performance', {
      configurable: true,
      value: { now: jest.fn(() => 42.5) }
    });

    expect(getPerfNow()).toBe(42.5);
  });

  it('falls back to Date.now when performance is unavailable', () => {
    Object.defineProperty(globalThis, 'performance', {
      configurable: true,
      value: undefined
    });
    jest.spyOn(Date, 'now').mockReturnValue(1234);

    expect(getPerfNow()).toBe(1234);
  });
});
