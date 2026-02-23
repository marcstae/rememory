// Archive extraction (tar.gz and ZIP) and tlock container detection
import { parseTar } from 'tarparser';
import { unzipSync } from 'fflate';
import type { TlockContainerMeta } from '../types';

export interface ExtractedFile {
  name: string;
  data: Uint8Array;
}

/**
 * Extract files from a tar.gz archive.
 */
export async function extractTarGz(data: Uint8Array): Promise<ExtractedFile[]> {
  const entries = await parseTar(data);

  return entries
    .filter(entry => entry.type === 'file')
    .map(entry => ({
      name: entry.name,
      data: entry.data,
    }));
}

/**
 * Extract files from a ZIP archive.
 */
export function extractZip(data: Uint8Array): ExtractedFile[] {
  const files = unzipSync(data);
  const result: ExtractedFile[] = [];

  for (const [name, fileData] of Object.entries(files)) {
    // Skip directories (they end with / and have empty data)
    if (name.endsWith('/')) continue;
    result.push({ name, data: fileData });
  }

  if (result.length === 0) {
    throw new Error('empty archive');
  }

  return result;
}

/**
 * Detect archive format and extract files.
 * ZIP archives start with PK (0x50 0x4B), gzip with 0x1F 0x8B.
 */
export async function extractArchive(data: Uint8Array): Promise<ExtractedFile[]> {
  if (data.length < 2) {
    throw new Error('archive too small to detect format');
  }

  // ZIP: starts with PK\x03\x04
  if (data[0] === 0x50 && data[1] === 0x4B) {
    return extractZip(data);
  }

  // gzip: starts with \x1f\x8b
  if (data[0] === 0x1f && data[1] === 0x8b) {
    return extractTarGz(data);
  }

  throw new Error('unrecognized archive format');
}

/**
 * Check if data is a tlock container ZIP (contains tlock.json).
 * Uses only fflate — no tlock.js dependency.
 */
export function isTlockContainer(data: Uint8Array): boolean {
  if (data.length < 4 || data[0] !== 0x50 || data[1] !== 0x4B || data[2] !== 0x03 || data[3] !== 0x04) {
    return false;
  }
  try {
    const files = unzipSync(data);
    return 'tlock.json' in files;
  } catch {
    return false;
  }
}

/**
 * Open a tlock container ZIP and return the metadata and tlock-encrypted ciphertext.
 * Uses only fflate — no tlock.js dependency.
 */
export function openTlockContainer(data: Uint8Array): { meta: TlockContainerMeta; ciphertext: Uint8Array } {
  const files = unzipSync(data);

  const metaData = files['tlock.json'];
  if (!metaData) {
    throw new Error('tlock container: missing tlock.json');
  }

  const ciphertext = files['manifest.tlock.age'];
  if (!ciphertext) {
    throw new Error('tlock container: missing manifest.tlock.age');
  }

  const meta: TlockContainerMeta = JSON.parse(new TextDecoder().decode(metaData));
  if (!meta.v) {
    throw new Error('tlock container: tlock.json missing version field');
  }

  return { meta, ciphertext };
}
