/** An empty Yjs update (no structs, no deletions) is exactly `[0, 0]`. */
export function hasContent(update: Uint8Array): boolean {
  return update.length > 2;
}

/** Binary payloads travel as base64 over the JSON hub protocol; the server binds them to `byte[]`. */
export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  // In chunks: spreading a large array into `fromCharCode` overflows the call stack.
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

export function fromBase64(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64), char => char.charCodeAt(0));
}
