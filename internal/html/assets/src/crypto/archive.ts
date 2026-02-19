// Tar.gz extraction using tarparser
import { parseTar } from 'tarparser';

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
