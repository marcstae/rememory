// SHA-256 hashing utilities using Web Crypto API

/**
 * Compute SHA-256 hash of data.
 */
export async function sha256(data: Uint8Array): Promise<Uint8Array> {
  const hash = await crypto.subtle.digest('SHA-256', data as BufferSource);
  return new Uint8Array(hash);
}

/**
 * Compute SHA-256 hash and return as hex string with "sha256:" prefix.
 */
export async function hashBytes(data: Uint8Array): Promise<string> {
  const hash = await sha256(data);
  const hex = Array.from(hash)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `sha256:${hex}`;
}

/**
 * Verify a hash matches expected value.
 *
 * Note: We use standard equality here, not constant-time comparison.
 * Timing-safe comparison prevents attackers from learning secrets through
 * timing differences. But here both values are derived from public data
 * (the share string the user provided) — there's no secret to leak.
 * This is data integrity verification, not authentication.
 */
export function verifyHash(got: string, expected: string): boolean {
  return got === expected;
}
