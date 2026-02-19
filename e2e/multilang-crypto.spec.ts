/**
 * Multi-language BIP39 support tests.
 *
 * These test the native JS crypto module directly — word decoding,
 * language detection, word lookup, and normalization across all
 * supported languages.
 */
import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

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
  const indices = [
    0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200, 1300,
    1400, 1500, 1600, 1700, 1800, 1900, 2000, 2040, 2045, 2047,
  ];
  return indices.map((i) => wordlist[i]);
}

test.describe('Multi-language BIP39 Support', () => {
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
          const decoded = crypto.decodeWords(words);
          return { success: true, length: decoded.length };
        } catch (err) {
          return { error: (err as Error).message };
        }
      }, words);

      expect(result.error).toBeUndefined();
      expect(result.success).toBe(true);
    });
  }

  test('decode Spanish word "ábaco" with accent', async ({ page }) => {
    await page.goto('file://' + testHtmlPath);
    await page.waitForFunction(() => (window as any).testReady);

    const result = await page.evaluate(async () => {
      const crypto = (window as any).rememoryCrypto;
      try {
        const idx = crypto.lookupWord('ábaco');
        return { index: idx };
      } catch (err) {
        return { error: (err as Error).message };
      }
    });

    // "ábaco" is word 0 in the Spanish wordlist
    expect(result.index).toBe(0);
  });

  test('decode German word correctly', async ({ page }) => {
    await page.goto('file://' + testHtmlPath);
    await page.waitForFunction(() => (window as any).testReady);

    const result = await page.evaluate(async () => {
      const crypto = (window as any).rememoryCrypto;
      try {
        // "abend" is word index 4 in the German wordlist
        const idx = crypto.lookupWordInLang('de', 'abend');
        return { index: idx };
      } catch (err) {
        return { error: (err as Error).message };
      }
    });

    expect(result.error).toBeUndefined();
    expect(result.index).toBe(4);
  });

  test('lookupWord finds words across all languages', async ({ page }) => {
    await page.goto('file://' + testHtmlPath);
    await page.waitForFunction(() => (window as any).testReady);

    const result = await page.evaluate(async () => {
      const crypto = (window as any).rememoryCrypto;
      try {
        // "abend" is German-only
        const idx = crypto.lookupWord('abend');
        return { index: idx };
      } catch (err) {
        return { error: (err as Error).message };
      }
    });

    expect(result.error).toBeUndefined();
    expect(result.index).toBeGreaterThanOrEqual(0);
  });
});

test.describe('Language Auto-detection', () => {
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

    const words = generateTestWords('es');

    const result = await page.evaluate(async (words: string[]) => {
      const crypto = (window as any).rememoryCrypto;
      try {
        const decoded = crypto.decodeWords(words);
        return { success: true, length: decoded.length };
      } catch (err) {
        return { error: (err as Error).message };
      }
    }, words);

    expect(result.error).toBeUndefined();
    expect(result.success).toBe(true);
  });
});

test.describe('Word Normalization', () => {
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

    const result = await page.evaluate(async () => {
      const crypto = (window as any).rememoryCrypto;

      if (typeof crypto.lookupWordInLang !== 'function') {
        try {
          const idx = crypto.lookupWord('abaco');
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
    expect(result.error).toBeUndefined();
    expect(result.index).toBe(0);
  });

  test('Slovenian word "čudež" normalized from "cudez"', async ({ page }) => {
    await page.goto('file://' + testHtmlPath);
    await page.waitForFunction(() => (window as any).testReady);

    const result = await page.evaluate(async () => {
      const crypto = (window as any).rememoryCrypto;

      if (typeof crypto.lookupWordInLang !== 'function') {
        return { error: 'lookupWordInLang not implemented' };
      }

      try {
        const idx = crypto.lookupWordInLang('sl', 'cudez');
        return { index: idx };
      } catch (err) {
        return { error: (err as Error).message };
      }
    });

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
    expect(result.error).toBeUndefined();
    expect(result.index).toBe(0);
  });
});
