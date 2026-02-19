// Age encryption/decryption using typage (age-encryption npm package)

import { Decrypter } from 'age-encryption';

/**
 * Decrypt age-encrypted data using a passphrase (scrypt mode).
 * Returns the decrypted data as Uint8Array.
 */
export async function decrypt(
  encrypted: Uint8Array,
  passphrase: string
): Promise<Uint8Array> {
  const d = new Decrypter();
  d.addPassphrase(passphrase);

  // age-encryption expects the data in a format it can read
  // For Uint8Array input, we need to convert appropriately
  const result = await d.decrypt(encrypted, 'uint8array');
  return result;
}
