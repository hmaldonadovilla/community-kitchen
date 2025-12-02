import { type WebFormSubmission } from '../types';

declare const google: {
  script?: {
    run?: {
      withSuccessHandler: (cb: (res: any) => void) => any;
      withFailureHandler: (cb: (err: any) => void) => any;
      saveSubmissionWithId?: (payload: WebFormSubmission) => void;
    };
  };
} | undefined;

export interface SubmitResult {
  success: boolean;
  message: string;
  meta?: any;
}

/**
 * Submit via Apps Script; surfaces dedup errors when backend rejects.
 */
export async function submitWithDedup(payload: WebFormSubmission): Promise<SubmitResult> {
  const runner = google?.script?.run;
  if (!runner || typeof runner.withSuccessHandler !== 'function') {
    return { success: false, message: 'Submission unavailable offline.' };
  }
  return new Promise(resolve => {
    try {
      const pipeline = runner
        ?.withSuccessHandler?.((res: any) => resolve(res || { success: false, message: 'Unknown response' }))
        ?.withFailureHandler?.((err: any) => resolve({ success: false, message: (err && err.message) || 'Submit failed' }));
      pipeline?.saveSubmissionWithId?.(payload);
    } catch (err: any) {
      resolve({ success: false, message: err?.message || 'Submit failed' });
    }
  });
}
