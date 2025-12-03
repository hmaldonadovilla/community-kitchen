export function encodePageToken(offset: number): string {
  const text = offset.toString();
  try {
    if (typeof Utilities !== 'undefined' && (Utilities as any).base64Encode) {
      return (Utilities as any).base64Encode(text);
    }
  } catch (_) {
    // ignore
  }
  return text;
}

export function decodePageToken(token?: string): number {
  if (!token) return 0;
  try {
    if (typeof Utilities !== 'undefined' && (Utilities as any).base64Decode) {
      const decoded = (Utilities as any).base64Decode(token);
      const asString = decoded ? String.fromCharCode(...decoded) : '0';
      const n = parseInt(asString, 10);
      return Number.isFinite(n) && n >= 0 ? n : 0;
    }
  } catch (_) {
    // ignore
  }
  const fallback = parseInt(token, 10);
  return Number.isFinite(fallback) && fallback >= 0 ? fallback : 0;
}
