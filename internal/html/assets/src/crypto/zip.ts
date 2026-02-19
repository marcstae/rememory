// ZIP bundle extraction using fflate
import { unzipSync } from 'fflate';

// README basenames are injected from translations at build time (window.README_NAMES)
declare global {
  interface Window {
    README_NAMES?: string[];
  }
}

export interface BundleContents {
  share?: string; // README.txt content containing the share (for ZIP)
  manifest?: Uint8Array; // MANIFEST.age content if present
  // For HTML extraction
  holderShare?: string; // PEM-encoded share from personalization
  holder?: string; // Holder name from personalization
  index?: number; // Share index
}

/**
 * Check if data looks like HTML (starts with common HTML patterns).
 */
function isHTML(data: Uint8Array): boolean {
  // Check first 1KB for HTML signatures
  const sample = new TextDecoder().decode(data.slice(0, 1024));
  return (
    sample.includes('<!DOCTYPE html') ||
    sample.includes('<!doctype html') ||
    sample.includes('<html') ||
    sample.includes('<HTML')
  );
}

/**
 * Extract personalization data from HTML content.
 */
export function extractPersonalizationFromHTML(
  htmlContent: string
): { holderShare?: string; holder?: string; manifestB64?: string } | null {
  const match = htmlContent.match(
    /window\.PERSONALIZATION\s*=\s*(\{[^\n]*\})\s*;/
  );
  if (!match || !match[1]) {
    return null;
  }

  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

/**
 * Extract share and manifest from a bundle ZIP file or recover.html file.
 * For ZIP: Looks for README*.txt (any language) and MANIFEST.age.
 * For HTML: Extracts personalization data containing holderShare and manifest.
 */
export function extractBundle(data: Uint8Array): BundleContents {
  // Check if it's HTML instead of ZIP
  if (isHTML(data)) {
    return extractBundleFromHTML(data);
  }

  // Handle as ZIP
  const files = unzipSync(data);
  const readmeNames =
    typeof window !== 'undefined' && window.README_NAMES
      ? window.README_NAMES
      : ['README'];

  let readmeContent: string | undefined;
  let manifestData: Uint8Array | undefined;
  let recoverHtmlData: Uint8Array | undefined;

  for (const [name, fileData] of Object.entries(files)) {
    const basename = name.split('/').pop() || name;
    const upperBase = basename.toUpperCase();

    // Check for README.txt in any language (README.txt, LEEME.txt, LIESMICH.txt, etc.)
    for (const readmeName of readmeNames) {
      if (upperBase === `${readmeName.toUpperCase()}.TXT`) {
        readmeContent = new TextDecoder().decode(fileData);
        break;
      }
    }

    if (upperBase === 'MANIFEST.AGE') {
      manifestData = fileData;
    }

    if (upperBase === 'RECOVER.HTML') {
      recoverHtmlData = fileData;
    }
  }

  // When no separate MANIFEST.age, check recover.html for an embedded manifest
  if (!manifestData && recoverHtmlData) {
    const htmlContent = new TextDecoder().decode(recoverHtmlData);
    const personalization = extractPersonalizationFromHTML(htmlContent);
    if (personalization?.manifestB64) {
      const binary = atob(personalization.manifestB64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      manifestData = bytes;
    }
  }

  if (!readmeContent) {
    const foundFiles = Object.keys(files).join(', ');
    throw new Error(`README file not found in bundle. Found: ${foundFiles}`);
  }

  return {
    share: readmeContent,
    manifest: manifestData,
  };
}

/**
 * Extract share and manifest from a recover.html file.
 */
function extractBundleFromHTML(data: Uint8Array): BundleContents {
  const htmlContent = new TextDecoder().decode(data);
  const personalization = extractPersonalizationFromHTML(htmlContent);

  if (!personalization) {
    throw new Error('No personalization data found in HTML');
  }

  const result: BundleContents = {};

  if (personalization.holderShare) {
    result.holderShare = personalization.holderShare;
    result.share = personalization.holderShare; // Also set share for compatibility
  }

  if (personalization.holder) {
    result.holder = personalization.holder;
  }

  if (personalization.manifestB64) {
    const binary = atob(personalization.manifestB64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    result.manifest = bytes;
  }

  // Extract index from the share PEM if present
  if (personalization.holderShare) {
    const indexMatch = personalization.holderShare.match(/Index:\s*(\d+)/);
    if (indexMatch) {
      result.index = parseInt(indexMatch[1], 10);
    }
  }

  return result;
}
