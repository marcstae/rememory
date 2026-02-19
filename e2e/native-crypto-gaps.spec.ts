/**
 * Failing tests for missing native JS crypto features.
 *
 * These tests document features that the WASM implementation supported
 * but the native JS implementation is currently missing. They are written
 * to FAIL until the features are implemented.
 *
 * Missing features:
 * 1. Multi-language BIP39 support (es, fr, de, sl, pt, zh-TW)
 * 2. Language auto-detection for BIP39 words
 * 3. Word normalization (NFD decomposition, German umlaut digraphs)
 * 4. Extracting holderShare from dropped recover.html files
 */
import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { getRememoryBin } from './helpers';

// Helper to create test HTML that loads the crypto module
function createCryptoTestHtml(tmpDir: string): string {
  const htmlPath = path.join(tmpDir, 'crypto-test.html');
  const { execSync } = require('child_process');
  const cryptoJsPath = path.join(tmpDir, 'crypto.js');

  execSync(
    `npx esbuild internal/html/assets/src/crypto/index.ts --bundle --format=iife --global-name=RememoryCrypto --outfile=${cryptoJsPath} --loader:.txt=text`,
    { cwd: process.cwd() }
  );

  const cryptoJs = fs.readFileSync(cryptoJsPath, 'utf8');

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Crypto Test</title></head>
<body>
  <script>${cryptoJs}</script>
  <script>window.rememoryCrypto = RememoryCrypto; window.testReady = true;</script>
</body>
</html>`;

  fs.writeFileSync(htmlPath, html);
  return htmlPath;
}

// Load wordlists from Go source for test data
function loadWordlist(lang: string): string[] {
  const langToFile: Record<string, string> = {
    en: 'english.txt',
    es: 'spanish.txt',
    fr: 'french.txt',
    de: 'german.txt',
    sl: 'slovenian.txt',
    pt: 'portuguese.txt',
    'zh-TW': 'chinese_traditional.txt',
  };
  const filename = langToFile[lang];
  if (!filename) throw new Error(`Unknown language: ${lang}`);

  const filepath = path.join('internal', 'core', 'wordlists', filename);
  return fs
    .readFileSync(filepath, 'utf8')
    .trim()
    .split('\n')
    .map((w) => w.trim());
}

// Generate 24 words from a language wordlist (deterministic for testing)
function generateTestWords(lang: string): string[] {
  const wordlist = loadWordlist(lang);
  // Use indices that spell out a recognizable pattern
  const indices = [
    0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200, 1300,
    1400, 1500, 1600, 1700, 1800, 1900, 2000, 2040, 2045, 2047,
  ];
  return indices.map((i) => wordlist[i]);
}

test.describe('Multi-language BIP39 Support (EXPECTED TO FAIL)', () => {
  let tmpDir: string;
  let testHtmlPath: string;

  test.beforeAll(async () => {
    tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'rememory-multilang-crypto-')
    );
    testHtmlPath = createCryptoTestHtml(tmpDir);
  });

  test.afterAll(async () => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  // Test each non-English language
  const nonEnglishLangs = [
    { code: 'es', name: 'Spanish' },
    { code: 'fr', name: 'French' },
    { code: 'de', name: 'German' },
    { code: 'sl', name: 'Slovenian' },
    { code: 'pt', name: 'Portuguese' },
    { code: 'zh-TW', name: 'Chinese Traditional' },
  ];

  for (const { code, name } of nonEnglishLangs) {
    test(`decode ${name} BIP39 words`, async ({ page }) => {
      await page.goto('file://' + testHtmlPath);
      await page.waitForFunction(() => (window as any).testReady);

      const words = generateTestWords(code);

      const result = await page.evaluate(async (words: string[]) => {
        const crypto = (window as any).rememoryCrypto;
        try {
          // decodeWords should accept words from any supported language
          const decoded = crypto.decodeWords(words);
          return { success: true, length: decoded.length };
        } catch (err) {
          return { error: (err as Error).message };
        }
      }, words);

      // This test SHOULD pass but currently FAILS because only English is supported
      expect(result.error).toBeUndefined();
      expect(result.success).toBe(true);
    });
  }

  test('decode Spanish word "ábaco" with accent', async ({ page }) => {
    await page.goto('file://' + testHtmlPath);
    await page.waitForFunction(() => (window as any).testReady);

    // "ábaco" is word 0 in Spanish wordlist
    // The Go implementation normalizes accented characters
    const result = await page.evaluate(async () => {
      const crypto = (window as any).rememoryCrypto;
      try {
        const idx = crypto.lookupWord('ábaco');
        return { index: idx };
      } catch (err) {
        return { error: (err as Error).message };
      }
    });

    // Should find the word (Go returns index 0)
    // Currently fails because Spanish wordlist isn't loaded
    expect(result.index).toBe(0);
  });

  test('decode German word correctly', async ({ page }) => {
    await page.goto('file://' + testHtmlPath);
    await page.waitForFunction(() => (window as any).testReady);

    // Test that German words can be looked up
    const result = await page.evaluate(async () => {
      const crypto = (window as any).rememoryCrypto;
      try {
        // "abend" is word index 4 in German wordlist
        const idx = crypto.lookupWordInLang('de', 'abend');
        return { index: idx };
      } catch (err) {
        return { error: (err as Error).message };
      }
    });

    // Should find the word at index 4
    expect(result.error).toBeUndefined();
    expect(result.index).toBe(4);
  });

  test('lookupWord finds words across all languages', async ({ page }) => {
    await page.goto('file://' + testHtmlPath);
    await page.waitForFunction(() => (window as any).testReady);

    // Test that lookupWord tries all languages
    const result = await page.evaluate(async () => {
      const crypto = (window as any).rememoryCrypto;
      try {
        // "abend" is German-only, should be found
        const idx = crypto.lookupWord('abend');
        return { index: idx };
      } catch (err) {
        return { error: (err as Error).message };
      }
    });

    // Should find the word via cross-language lookup
    expect(result.error).toBeUndefined();
    expect(result.index).toBeGreaterThanOrEqual(0);
  });
});

test.describe('Language Auto-detection (EXPECTED TO FAIL)', () => {
  let tmpDir: string;
  let testHtmlPath: string;

  test.beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rememory-detect-lang-'));
    testHtmlPath = createCryptoTestHtml(tmpDir);
  });

  test.afterAll(async () => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('detect Spanish words', async ({ page }) => {
    await page.goto('file://' + testHtmlPath);
    await page.waitForFunction(() => (window as any).testReady);

    const words = generateTestWords('es');

    const result = await page.evaluate(async (words: string[]) => {
      const crypto = (window as any).rememoryCrypto;
      // Go has DetectWordListLang - does the JS have equivalent?
      if (typeof crypto.detectLanguage !== 'function') {
        return { error: 'detectLanguage function not implemented' };
      }
      try {
        const lang = crypto.detectLanguage(words);
        return { lang };
      } catch (err) {
        return { error: (err as Error).message };
      }
    }, words);

    expect(result.error).toBeUndefined();
    expect(result.lang).toBe('es');
  });

  test('detect French words', async ({ page }) => {
    await page.goto('file://' + testHtmlPath);
    await page.waitForFunction(() => (window as any).testReady);

    const words = generateTestWords('fr');

    const result = await page.evaluate(async (words: string[]) => {
      const crypto = (window as any).rememoryCrypto;
      if (typeof crypto.detectLanguage !== 'function') {
        return { error: 'detectLanguage function not implemented' };
      }
      try {
        const lang = crypto.detectLanguage(words);
        return { lang };
      } catch (err) {
        return { error: (err as Error).message };
      }
    }, words);

    expect(result.error).toBeUndefined();
    expect(result.lang).toBe('fr');
  });

  test('detect German words', async ({ page }) => {
    await page.goto('file://' + testHtmlPath);
    await page.waitForFunction(() => (window as any).testReady);

    const words = generateTestWords('de');

    const result = await page.evaluate(async (words: string[]) => {
      const crypto = (window as any).rememoryCrypto;
      if (typeof crypto.detectLanguage !== 'function') {
        return { error: 'detectLanguage function not implemented' };
      }
      try {
        const lang = crypto.detectLanguage(words);
        return { lang };
      } catch (err) {
        return { error: (err as Error).message };
      }
    }, words);

    expect(result.error).toBeUndefined();
    expect(result.lang).toBe('de');
  });

  test('auto-decode words using detected language', async ({ page }) => {
    await page.goto('file://' + testHtmlPath);
    await page.waitForFunction(() => (window as any).testReady);

    // Use Spanish words
    const words = generateTestWords('es');

    const result = await page.evaluate(async (words: string[]) => {
      const crypto = (window as any).rememoryCrypto;
      try {
        // The decodeWords function should auto-detect language
        // OR there should be a decodeWordsAuto function
        const decoded = crypto.decodeWords(words);
        return { success: true, length: decoded.length };
      } catch (err) {
        return { error: (err as Error).message };
      }
    }, words);

    // Should successfully decode Spanish words
    expect(result.error).toBeUndefined();
    expect(result.success).toBe(true);
  });
});

test.describe('Recover.html Share Extraction (EXPECTED TO FAIL)', () => {
  let tmpDir: string;
  let projectDir: string;

  test.beforeAll(async () => {
    tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'rememory-recover-extract-')
    );

    // Create a test project to get a personalized recover.html
    const { execFileSync } = require('child_process');
    const bin = getRememoryBin();
    if (!fs.existsSync(bin)) {
      console.log(`Skipping: rememory binary not found at ${bin}`);
      return;
    }
    projectDir = path.join(tmpDir, 'test-project');

    execFileSync(
      bin,
      [
        'init',
        projectDir,
        '--name',
        'Extract Test',
        '--threshold',
        '2',
        '--friend',
        'Alice,alice@test.com',
        '--friend',
        'Bob,bob@test.com',
        '--friend',
        'Carol,carol@test.com',
      ],
      { stdio: 'inherit' }
    );

    // Add secret content
    const manifestDir = path.join(projectDir, 'manifest');
    fs.writeFileSync(path.join(manifestDir, 'secret.txt'), 'Test secret');

    // Seal and bundle
    execFileSync(bin, ['seal'], { cwd: projectDir, stdio: 'inherit' });
    execFileSync(bin, ['bundle'], { cwd: projectDir, stdio: 'inherit' });
  });

  test.afterAll(async () => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('dropping recover.html extracts embedded holderShare', async ({
    page,
  }) => {
    // Extract Alice's bundle
    const bundlesDir = path.join(projectDir, 'output', 'bundles');
    const aliceZip = path.join(bundlesDir, 'bundle-alice.zip');
    const aliceDir = path.join(bundlesDir, 'bundle-alice');
    fs.mkdirSync(aliceDir, { recursive: true });

    const AdmZip = require('adm-zip');
    const zip = new AdmZip(aliceZip);
    zip.extractAllTo(aliceDir, true);

    // Extract Bob's bundle
    const bobZip = path.join(bundlesDir, 'bundle-bob.zip');
    const bobDir = path.join(bundlesDir, 'bundle-bob');
    fs.mkdirSync(bobDir, { recursive: true });
    const bobZipObj = new AdmZip(bobZip);
    bobZipObj.extractAllTo(bobDir, true);

    // Open Alice's recover.html
    const aliceRecoverHtml = path.join(aliceDir, 'recover.html');
    await page.goto(`file://${aliceRecoverHtml}`);
    await page.waitForFunction(
      () => (window as any).rememoryAppReady === true,
      { timeout: 30000 }
    );

    // Alice's share should be pre-loaded (index 1)
    await expect(page.locator('.share-item')).toHaveCount(1);

    // Now simulate dropping Bob's recover.html onto the page
    // This should extract Bob's holderShare from the personalization JSON
    const bobRecoverHtml = path.join(bobDir, 'recover.html');

    // Read Bob's recover.html content
    const bobHtmlContent = fs.readFileSync(bobRecoverHtml);

    // Create a File-like object and trigger file input
    await page.evaluate(async (htmlBytes: number[]) => {
      const file = new File([new Uint8Array(htmlBytes)], 'recover.html', {
        type: 'text/html',
      });

      // Create a DataTransfer and add the file
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);

      // Find the share file input and set files
      const input = document.querySelector(
        '#share-file-input'
      ) as HTMLInputElement;
      if (input) {
        input.files = dataTransfer.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }, Array.from(bobHtmlContent));

    // Wait a bit for processing
    await page.waitForTimeout(1000);

    // Bob's share should now be extracted and added (total 2 shares)
    // This currently FAILS because the native JS doesn't extract shares from recover.html
    await expect(page.locator('.share-item')).toHaveCount(2);

    // Verify Bob's share specifically
    await expect(
      page.locator('.share-item').filter({ hasText: 'Bob' })
    ).toBeAttached();
  });

  test('extractBundle correctly extracts holderShare from recover.html', async ({
    page,
  }) => {
    // Test the extractBundle function directly with recover.html input
    const testHtmlPath = createCryptoTestHtml(tmpDir);
    await page.goto('file://' + testHtmlPath);
    await page.waitForFunction(() => (window as any).testReady);

    // Extract Alice's bundle for testing
    const bundlesDir = path.join(projectDir, 'output', 'bundles');
    const aliceZip = path.join(bundlesDir, 'bundle-alice.zip');
    const aliceDir = path.join(bundlesDir, 'bundle-alice');

    if (!fs.existsSync(path.join(aliceDir, 'recover.html'))) {
      fs.mkdirSync(aliceDir, { recursive: true });
      const AdmZip = require('adm-zip');
      const zip = new AdmZip(aliceZip);
      zip.extractAllTo(aliceDir, true);
    }

    const recoverHtmlContent = fs.readFileSync(
      path.join(aliceDir, 'recover.html')
    );

    const result = await page.evaluate(async (htmlBytes: number[]) => {
      const crypto = (window as any).rememoryCrypto;
      try {
        const data = new Uint8Array(htmlBytes);
        const bundle = await crypto.extractBundle(data);

        return {
          hasShare: !!bundle.share || !!bundle.holderShare,
          hasManifest: !!bundle.manifest,
          shareHolder: bundle.holder,
          shareIndex: bundle.index,
        };
      } catch (err) {
        return { error: (err as Error).message };
      }
    }, Array.from(recoverHtmlContent));

    // extractBundle should extract the holderShare from personalization JSON
    expect(result.error).toBeUndefined();
    expect(result.hasShare).toBe(true);
    expect(result.shareHolder).toBe('Alice');
    expect(result.shareIndex).toBe(1);
  });
});

test.describe('Word Normalization (EXPECTED TO FAIL)', () => {
  let tmpDir: string;
  let testHtmlPath: string;

  test.beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rememory-normalize-'));
    testHtmlPath = createCryptoTestHtml(tmpDir);
  });

  test.afterAll(async () => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('NFD normalization: "ábaco" without accent finds "ábaco"', async ({
    page,
  }) => {
    await page.goto('file://' + testHtmlPath);
    await page.waitForFunction(() => (window as any).testReady);

    // User types "abaco" (no accent) but the wordlist has "ábaco"
    // Go's NormalizeWord strips combining marks via NFD decomposition
    const result = await page.evaluate(async () => {
      const crypto = (window as any).rememoryCrypto;

      // First, check if Spanish is even supported
      // Then check if normalization works
      if (typeof crypto.lookupWordInLang !== 'function') {
        // Fall back to checking if lookupWord handles it
        try {
          const idx = crypto.lookupWord('abaco'); // without accent
          // In English, "abaco" doesn't exist, so this should fail
          // unless multi-lang + normalization is supported
          return { index: idx, note: 'used lookupWord' };
        } catch {
          return { error: 'normalization not supported' };
        }
      }

      try {
        const idx = crypto.lookupWordInLang('es', 'abaco');
        return { index: idx };
      } catch (err) {
        return { error: (err as Error).message };
      }
    });

    // Should find "ábaco" at index 0 when typing "abaco"
    // Currently fails because neither Spanish nor normalization is supported
    expect(result.error).toBeUndefined();
    expect(result.index).toBe(0);
  });

  test('Slovenian word "čudež" normalized from "cudez"', async ({ page }) => {
    await page.goto('file://' + testHtmlPath);
    await page.waitForFunction(() => (window as any).testReady);

    // Slovenian has háčky (carons): č, š, ž
    // User might type without them
    const result = await page.evaluate(async () => {
      const crypto = (window as any).rememoryCrypto;

      if (typeof crypto.lookupWordInLang !== 'function') {
        return { error: 'lookupWordInLang not implemented' };
      }

      try {
        const idx = crypto.lookupWordInLang('sl', 'cudez'); // should match "čudež"
        return { index: idx };
      } catch (err) {
        return { error: (err as Error).message };
      }
    });

    // Should find the word via normalization
    expect(result.error).toBeUndefined();
    expect(result.index).toBeGreaterThanOrEqual(0);
  });

  test('Case insensitivity: "ABANDON" matches "abandon"', async ({ page }) => {
    await page.goto('file://' + testHtmlPath);
    await page.waitForFunction(() => (window as any).testReady);

    const result = await page.evaluate(async () => {
      const crypto = (window as any).rememoryCrypto;
      try {
        const idx = crypto.lookupWord('ABANDON');
        return { index: idx };
      } catch (err) {
        return { error: (err as Error).message };
      }
    });

    // "abandon" is word 0 in English
    // Current implementation should handle case insensitivity
    expect(result.error).toBeUndefined();
    expect(result.index).toBe(0);
  });
});
