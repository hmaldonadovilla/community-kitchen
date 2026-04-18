import type { Frame } from 'playwright/test';

export async function runAppsScriptWithTimeout<T>(
  frame: Frame,
  fnName: string,
  timeoutMs: number,
  ...args: unknown[]
): Promise<T> {
  return frame.evaluate(
    ({ fnName: targetFnName, args: targetArgs, timeoutMs: targetTimeoutMs }) =>
      new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error(`Apps Script RPC timed out after ${targetTimeoutMs}ms: ${targetFnName}`));
        }, targetTimeoutMs);

        const runner = globalThis?.google?.script?.run;
        if (!runner || typeof runner.withSuccessHandler !== 'function') {
          clearTimeout(timer);
          reject(new Error('google.script.run unavailable in frame.'));
          return;
        }

        try {
          runner
            .withSuccessHandler((result: unknown) => {
              clearTimeout(timer);
              resolve(result);
            })
            .withFailureHandler((err: { message?: string; toString?: () => string }) => {
              clearTimeout(timer);
              const message = (err && (err.message || err.toString?.())) || 'Apps Script call failed.';
              reject(new Error(String(message)));
            })[targetFnName](...targetArgs);
        } catch (err) {
          clearTimeout(timer);
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      }),
    { fnName, args, timeoutMs }
  ) as Promise<T>;
}

export async function runAppsScript<T>(frame: Frame, fnName: string, ...args: unknown[]): Promise<T> {
  return runAppsScriptWithTimeout<T>(frame, fnName, 45_000, ...args);
}
