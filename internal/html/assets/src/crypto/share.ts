// Share parsing - PEM and compact format

import { hashBytes, verifyHash } from './hash';
import { base64ToBytes, bytesToBase64 } from './shamir';

export interface ParsedShare {
  version: number;
  index: number;
  threshold: number;
  total: number;
  holder?: string;
  created?: string;
  checksum?: string;
  data: Uint8Array;
  dataB64: string;
  compact?: string;
}

// PEM format markers
const PEM_BEGIN = '-----BEGIN REMEMORY SHARE-----';
const PEM_END = '-----END REMEMORY SHARE-----';

/**
 * Parse a share from PEM format.
 */
export async function parseShare(content: string): Promise<ParsedShare> {
  // Extract PEM block
  const beginIdx = content.indexOf(PEM_BEGIN);
  const endIdx = content.indexOf(PEM_END);

  if (beginIdx === -1 || endIdx === -1) {
    throw new Error('invalid share format: missing PEM markers');
  }

  const pemContent = content.slice(beginIdx + PEM_BEGIN.length, endIdx).trim();

  // Parse headers and data
  const lines = pemContent.split('\n');
  const headers: Record<string, string> = {};
  let dataLines: string[] = [];
  let inData = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      inData = true;
      continue;
    }

    if (!inData) {
      const colonIdx = trimmed.indexOf(':');
      if (colonIdx > 0) {
        const key = trimmed.slice(0, colonIdx).trim();
        const value = trimmed.slice(colonIdx + 1).trim();
        headers[key] = value;
      }
    } else {
      dataLines.push(trimmed);
    }
  }

  // Parse required fields
  const version = parseInt(headers['Version'] || '0', 10);
  const index = parseInt(headers['Index'] || '0', 10);
  const total = parseInt(headers['Total'] || '0', 10);
  const threshold = parseInt(headers['Threshold'] || '0', 10);
  const holder = headers['Holder'];
  const created = headers['Created'];
  const checksum = headers['Checksum'];

  if (isNaN(version) || isNaN(index) || isNaN(total) || isNaN(threshold) ||
      version === 0 || index === 0 || total === 0 || threshold === 0) {
    throw new Error('invalid share: missing or invalid required fields');
  }

  // Decode base64 data (standard base64 in PEM)
  const dataB64 = dataLines.join('');
  const data = Uint8Array.from(atob(dataB64), c => c.charCodeAt(0));

  // Verify checksum (required for all shares)
  if (!checksum) {
    throw new Error('share missing checksum');
  }
  const computed = await hashBytes(data);
  if (!verifyHash(computed, checksum)) {
    throw new Error('share checksum verification failed');
  }

  return {
    version,
    index,
    threshold,
    total,
    holder,
    created,
    checksum,
    data,
    dataB64: bytesToBase64(data),
  };
}

// Compact format: RM{version}:{index}:{total}:{threshold}:{base64url}:{check}
const COMPACT_REGEX = /^RM(\d+):(\d+):(\d+):(\d+):([A-Za-z0-9_-]+):([0-9a-f]{4})$/;

/**
 * Parse a share from compact format.
 */
export async function parseCompactShare(compact: string): Promise<ParsedShare> {
  const match = compact.trim().match(COMPACT_REGEX);
  if (!match) {
    throw new Error('invalid compact share format');
  }

  const version = parseInt(match[1], 10);
  const index = parseInt(match[2], 10);
  const total = parseInt(match[3], 10);
  const threshold = parseInt(match[4], 10);
  const dataB64Url = match[5];
  const shortCheck = match[6];

  // Decode base64url data
  const data = base64ToBytes(dataB64Url);

  // Verify short checksum (first 4 hex chars of SHA-256)
  const fullHash = await hashBytes(data);
  const expectedCheck = fullHash.slice(7, 11); // Skip "sha256:" prefix
  if (shortCheck !== expectedCheck) {
    throw new Error('compact share checksum verification failed');
  }

  return {
    version,
    index,
    threshold,
    total,
    data,
    dataB64: dataB64Url,
    compact,
  };
}

/**
 * Encode a share to compact format.
 */
export async function encodeCompact(share: ParsedShare): Promise<string> {
  const dataB64 = bytesToBase64(share.data);
  const fullHash = await hashBytes(share.data);
  const shortCheck = fullHash.slice(7, 11);
  return `RM${share.version}:${share.index}:${share.total}:${share.threshold}:${dataB64}:${shortCheck}`;
}
