/** getRandomValues works on HTTP LAN origins where randomUUID may be unavailable. */
export function newId(): string {
  if (typeof globalThis.crypto.randomUUID === 'function') return globalThis.crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 15) | 64;
  b[8] = (b[8] & 63) | 128;
  const s = Array.from(b, (n) => n.toString(16).padStart(2, '0')).join('');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}
export function randomInt(
  max: number,
  fill: (a: Uint32Array<ArrayBuffer>) => Uint32Array<ArrayBuffer> = (a) => crypto.getRandomValues(a),
): number {
  if (!Number.isSafeInteger(max) || max < 1 || max > 0x100000000) throw new Error('Invalid random range');
  const cap = Math.floor(0x100000000 / max) * max;
  const a = new Uint32Array(1);
  do {
    fill(a);
  } while (a[0] >= cap);
  return a[0] % max;
}
