import { qrScannerError } from './errors';
import { QrScannerCrypto } from './types';

const base64WebSafe = (bytes: number[]): string => {
  if (typeof Utilities === 'undefined' || typeof (Utilities as any).base64EncodeWebSafe !== 'function') {
    throw qrScannerError('CONFIGURATION_ERROR');
  }
  return (Utilities as any).base64EncodeWebSafe(bytes).toString().replace(/=+$/g, '');
};

const sha256 = (value: string): string => {
  if (typeof Utilities === 'undefined' || typeof (Utilities as any).computeDigest !== 'function') {
    throw qrScannerError('CONFIGURATION_ERROR');
  }
  const algorithm = (Utilities as any).DigestAlgorithm?.SHA_256;
  const charset = (Utilities as any).Charset?.UTF_8;
  return base64WebSafe((Utilities as any).computeDigest(algorithm, value, charset));
};

const deriveAccessToken = (launchToken: string, sessionId: string, clientNonce: string): string => {
  if (typeof Utilities === 'undefined' || typeof (Utilities as any).computeHmacSha256Signature !== 'function') {
    throw qrScannerError('CONFIGURATION_ERROR');
  }
  const payload = `CK_QR_ACCESS_V1\0${sessionId}\0${clientNonce}`;
  const charset = (Utilities as any).Charset?.UTF_8;
  return base64WebSafe((Utilities as any).computeHmacSha256Signature(payload, launchToken, charset));
};

const constantTimeStringEqual = (left: string, right: string): boolean => {
  const leftText = (left || '').toString();
  const rightText = (right || '').toString();
  let difference = leftText.length ^ rightText.length;
  const length = Math.max(leftText.length, rightText.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (leftText.charCodeAt(index) || 0) ^ (rightText.charCodeAt(index) || 0);
  }
  return difference === 0 && leftText.length > 0;
};

const randomToken = (byteLength = 24): string => {
  if (typeof Utilities === 'undefined' || typeof (Utilities as any).getUuid !== 'function') {
    throw qrScannerError('CONFIGURATION_ERROR');
  }
  const chunks = Math.max(1, Math.ceil(byteLength / 16));
  const entropy = Array.from({ length: chunks }, () => (Utilities as any).getUuid().toString()).join('|');
  return sha256(entropy).slice(0, Math.max(22, Math.ceil((byteLength * 4) / 3)));
};

export const createAppsScriptQrScannerCrypto = (): QrScannerCrypto => ({
  hash: sha256,
  deriveAccessToken,
  matches: (value: string, expectedHash?: string): boolean =>
    constantTimeStringEqual(sha256((value || '').toString()), (expectedHash || '').toString()),
  randomToken
});
