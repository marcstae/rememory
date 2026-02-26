import { Page, expect } from '@playwright/test';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import AdmZip from 'adm-zip';

// Shared setup from global-setup.ts (pre-created resources)
interface SharedSetup {
  tmpDir: string;
  standardProject: string;
  noEmbedProject: string;
  anonymousProject: string;
  makerHtml: string;
  recoverHtml: string;
  docsHtml: string;
  docsEsHtml: string;
  indexHtml: string;
  cryptoTestHtml: string;
}

let _sharedSetup: SharedSetup | null | undefined;

function getSharedSetup(): SharedSetup | null {
  if (_sharedSetup === undefined) {
    const setupPath = process.env.REMEMORY_E2E_SETUP;
    if (setupPath && fs.existsSync(setupPath)) {
      _sharedSetup = JSON.parse(fs.readFileSync(setupPath, 'utf8'));
    } else {
      _sharedSetup = null;
    }
  }
  return _sharedSetup;
}

// --- Fallback temp directory (lazily created, cleaned on process exit) ---
let _fallbackTmpDir: string | null = null;

function getFallbackTmpDir(): string {
  if (!_fallbackTmpDir) {
    _fallbackTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rememory-e2e-fallback-'));
  }
  return _fallbackTmpDir;
}

// Build crypto test HTML (internal helper)
function buildCryptoTestHtml(tmpDir: string): string {
  const { execSync } = require('child_process');
  const cryptoJsPath = path.join(tmpDir, 'crypto.js');

  execSync(
    `npx esbuild internal/html/assets/src/crypto/index.ts --bundle --format=iife --global-name=RememoryCrypto --outfile=${cryptoJsPath} --loader:.txt=text`,
    { cwd: process.cwd() }
  );

  const cryptoJs = fs.readFileSync(cryptoJsPath, 'utf8');
  const htmlPath = path.join(tmpDir, 'crypto-test.html');
  fs.writeFileSync(htmlPath, `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Crypto Test</title></head>
<body>
  <script>${cryptoJs}</script>
  <script>window.rememoryCrypto = RememoryCrypto; window.testReady = true;</script>
</body>
</html>`);

  return htmlPath;
}

// --- Self-contained resource getters (shared or fallback, cached) ---

const _resourceCache = new Map<string, string>();

/** Returns a cached resource path, trying the shared setup first, then building on demand. */
function getOrBuild(field: keyof SharedSetup, build: (tmpDir: string) => string): string {
  const cached = _resourceCache.get(field);
  if (cached) return cached;
  const shared = getSharedSetup();
  const sharedPath = shared?.[field];
  if (typeof sharedPath === 'string' && fs.existsSync(sharedPath)) {
    _resourceCache.set(field, sharedPath);
    return sharedPath;
  }
  const built = build(getFallbackTmpDir());
  _resourceCache.set(field, built);
  return built;
}

/** Helper to build an HTML resource via the rememory CLI. */
function buildHtmlResource(tmpDir: string, filename: string, args: string[]): string {
  const htmlPath = path.join(tmpDir, filename);
  execFileSync(getRememoryBin(), ['html', ...args, '-o', htmlPath], { stdio: 'inherit' });
  return htmlPath;
}

export function getCryptoTestHtml(): string {
  return getOrBuild('cryptoTestHtml', buildCryptoTestHtml);
}

export function getDocsHtml(): string {
  return getOrBuild('docsHtml', (dir) => buildHtmlResource(dir, 'docs.html', ['docs']));
}

export function getDocsEsHtml(): string {
  return getOrBuild('docsEsHtml', (dir) => buildHtmlResource(dir, 'docs.es.html', ['docs', '--lang', 'es']));
}

export function getIndexHtml(): string {
  return getOrBuild('indexHtml', (dir) => buildHtmlResource(dir, 'index.html', ['index']));
}

// Get absolute path to rememory binary
export function getRememoryBin(): string {
  const binEnv = process.env.REMEMORY_BIN || './rememory';
  return path.resolve(binEnv);
}

// Generate standalone HTML file for testing
export function generateStandaloneHTML(tmpDir: string, type: 'recover' | 'create', extraFlags: string[] = []): string {
  // Use pre-built HTML from global setup when available (standard flags only)
  if (extraFlags.length === 0) {
    const shared = getSharedSetup();
    if (shared) {
      const sharedPath = type === 'create' ? shared.makerHtml : shared.recoverHtml;
      if (sharedPath && fs.existsSync(sharedPath)) {
        return sharedPath;
      }
    }
  }

  const bin = getRememoryBin();
  const htmlPath = path.join(tmpDir, type === 'create' ? 'maker.html' : 'recover.html');

  execFileSync(bin, ['html', type, '-o', htmlPath, ...extraFlags], { stdio: 'inherit' });

  return htmlPath;
}

// Options for test project creation
interface TestProjectOptions {
  noEmbedManifest?: boolean;
  friends?: { name: string; email: string }[];
  threshold?: number;
}

// Cache for test projects within the same worker process.
// Multiple describe blocks in the same spec file can share a project
// instead of running init+seal+bundle repeatedly for identical configs.
const projectCache = new Map<string, string>();
const cachedPaths = new Set<string>();
const globalSetupPaths = new Set<string>();

function cacheKey(options: TestProjectOptions): string {
  const parts = [options.noEmbedManifest ? 'no-embed' : 'standard'];
  if (options.friends) parts.push(`f${options.friends.length}`);
  if (options.threshold) parts.push(`t${options.threshold}`);
  return parts.join('-');
}

// Create a sealed test project with bundles (cached per config within a worker)
export function createTestProject(options: TestProjectOptions = {}): string {
  const key = cacheKey(options);
  const cached = projectCache.get(key);
  if (cached && fs.existsSync(cached)) {
    return cached;
  }

  // Use pre-created project from global setup when available (only for default config)
  if (!options.friends && !options.threshold) {
    const shared = getSharedSetup();
    if (shared) {
      const sharedPath = options.noEmbedManifest ? shared.noEmbedProject : shared.standardProject;
      if (sharedPath && fs.existsSync(sharedPath)) {
        projectCache.set(key, sharedPath);
        globalSetupPaths.add(sharedPath);
        return sharedPath;
      }
    }
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rememory-e2e-'));
  const projectDir = path.join(tmpDir, 'test-project');
  const bin = getRememoryBin();

  const friends = options.friends || [
    { name: 'Alice', email: 'alice@test.com' },
    { name: 'Bob', email: 'bob@test.com' },
    { name: 'Carol', email: 'carol@test.com' },
  ];
  const threshold = options.threshold || 2;
  const friendArgs = friends.flatMap(f => ['--friend', `${f.name},${f.email}`]);

  execFileSync(bin, [
    'init', projectDir, '--name', 'E2E Test', '--threshold', String(threshold),
    ...friendArgs,
  ], { stdio: 'inherit' });

  // Add secret content
  const manifestDir = path.join(projectDir, 'manifest');
  fs.writeFileSync(path.join(manifestDir, 'secret.txt'), 'The secret password is: correct-horse-battery-staple');
  fs.writeFileSync(path.join(manifestDir, 'notes.txt'), 'Remember to feed the cat!');

  // Seal and generate bundles
  const extraFlags = options.noEmbedManifest ? ['--no-embed-manifest'] : [];
  execFileSync(bin, ['seal', ...extraFlags], { cwd: projectDir, stdio: 'inherit' });
  execFileSync(bin, ['bundle', ...extraFlags], { cwd: projectDir, stdio: 'inherit' });

  projectCache.set(key, projectDir);
  cachedPaths.add(projectDir);
  return projectDir;
}

// Create a sealed anonymous test project with bundles (cached within a worker)
export function createAnonymousTestProject(): string {
  const key = 'anonymous';
  const cached = projectCache.get(key);
  if (cached && fs.existsSync(cached)) {
    return cached;
  }

  // Use pre-created project from global setup when available
  const shared = getSharedSetup();
  if (shared?.anonymousProject && fs.existsSync(shared.anonymousProject)) {
    projectCache.set(key, shared.anonymousProject);
    globalSetupPaths.add(shared.anonymousProject);
    return shared.anonymousProject;
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rememory-e2e-anon-'));
  const projectDir = path.join(tmpDir, 'test-anon-project');
  const bin = getRememoryBin();

  // Create anonymous project with 3 shares, threshold 2
  execFileSync(bin, [
    'init', projectDir, '--name', 'Anonymous E2E Test', '--anonymous', '--shares', '3', '--threshold', '2',
  ], { stdio: 'inherit' });

  // Add secret content
  const manifestDir = path.join(projectDir, 'manifest');
  fs.writeFileSync(path.join(manifestDir, 'secret.txt'), 'Anonymous secret: correct-horse-battery-staple');
  fs.writeFileSync(path.join(manifestDir, 'notes.txt'), 'Anonymous notes!');

  // Seal and generate bundles
  execFileSync(bin, ['seal'], { cwd: projectDir, stdio: 'inherit' });
  execFileSync(bin, ['bundle'], { cwd: projectDir, stdio: 'inherit' });

  projectCache.set(key, projectDir);
  cachedPaths.add(projectDir);
  return projectDir;
}

// Safe cleanup: only removes the directory if it's not a cached project
// that other describe blocks might still need.
export function cleanupProject(projectDir: string): void {
  if (!projectDir || !fs.existsSync(projectDir)) return;
  if (cachedPaths.has(projectDir)) return; // shared project, leave it for process exit cleanup
  if (globalSetupPaths.has(projectDir)) return; // shared by global setup, cleaned by global teardown
  fs.rmSync(projectDir, { recursive: true, force: true });
}

// Clean up all cached projects and fallback resources when the worker process exits
process.on('exit', () => {
  for (const dir of cachedPaths) {
    if (globalSetupPaths.has(dir)) continue; // cleaned by global teardown
    try {
      // Walk up to the tmpDir parent (projectDir is tmpDir/test-project)
      const tmpDir = path.dirname(dir);
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    } catch { /* best effort */ }
  }
  if (_fallbackTmpDir && fs.existsSync(_fallbackTmpDir)) {
    try { fs.rmSync(_fallbackTmpDir, { recursive: true, force: true }); } catch { /* best effort */ }
  }
});

// Extract a bundle ZIP and return the extracted directory path
// Note: friendName is case-insensitive, bundle files are lowercase
export function extractBundle(bundlesDir: string, friendName: string): string {
  const lowerName = friendName.toLowerCase();
  const bundleZip = path.join(bundlesDir, `bundle-${lowerName}.zip`);
  const extractDir = path.join(bundlesDir, `bundle-${lowerName}`);

  // Skip extraction if already done (same describe block reuses bundlesDir)
  if (fs.existsSync(extractDir) && fs.readdirSync(extractDir).length > 0) {
    return extractDir;
  }

  fs.mkdirSync(extractDir, { recursive: true });

  // Use adm-zip for cross-platform extraction
  const zip = new AdmZip(bundleZip);
  zip.extractAllTo(extractDir, true);

  return extractDir;
}

// Extract multiple bundles
export function extractBundles(bundlesDir: string, friendNames: string[]): string[] {
  return friendNames.map(name => extractBundle(bundlesDir, name));
}

// Extract anonymous bundle by share number
export function extractAnonymousBundle(bundlesDir: string, shareNum: number): string {
  return extractBundle(bundlesDir, `share-${shareNum}`);
}

// Extract multiple anonymous bundles
export function extractAnonymousBundles(bundlesDir: string, shareNums: number[]): string[] {
  return shareNums.map(num => extractAnonymousBundle(bundlesDir, num));
}

// Load README filenames from translations (source of truth)
function loadReadmeFilenames(): string[] {
  const translationsDir = path.join(__dirname, '..', 'internal', 'translations', 'readme');
  const seen = new Set<string>();
  for (const file of fs.readdirSync(translationsDir)) {
    if (!file.endsWith('.json')) continue;
    const data = JSON.parse(fs.readFileSync(path.join(translationsDir, file), 'utf8'));
    if (data.readme_filename) {
      seen.add(data.readme_filename);
    }
  }
  return Array.from(seen);
}
const README_FILENAMES = loadReadmeFilenames();

// Find the README .txt file in an extracted bundle directory (any language)
export function findReadmeFile(bundleDir: string, ext: string = '.txt'): string {
  for (const name of README_FILENAMES) {
    const filePath = path.join(bundleDir, name + ext);
    if (fs.existsSync(filePath)) return filePath;
  }
  throw new Error(`No README${ext} file found in ${bundleDir}`);
}

// Extract the 25 recovery words from a README file as a space-separated string
export function extractWordsFromReadme(readmePath: string): string {
  const readme = fs.readFileSync(readmePath, 'utf8');
  // Match word grid: look for "25 RECOVERY WORDS" (any language) or numbered word lines
  const wordsMatch = readme.match(/\b25\b[^\n]*:\n\n([\s\S]*?)\n\n/);
  if (!wordsMatch) throw new Error('Could not find recovery words in ' + readmePath);

  const wordLines = wordsMatch[1].trim().split('\n');
  const leftWords: string[] = [];
  const rightWords: string[] = [];
  const half = 13; // 25 words: 13 left (1-13), 12 right (14-25)
  for (const line of wordLines) {
    const matches = line.match(/\d+\.\s+(\S+)/g);
    if (matches) {
      for (const m of matches) {
        const wordMatch = m.match(/(\d+)\.\s+(\S+)/);
        if (wordMatch) {
          const idx = parseInt(wordMatch[1], 10);
          const word = wordMatch[2];
          if (idx <= half) {
            leftWords.push(word);
          } else {
            rightWords.push(word);
          }
        }
      }
    }
  }
  return [...leftWords, ...rightWords].join(' ');
}

// Page helper class for recovery tool interactions
export class RecoveryPage {
  constructor(private page: Page, private bundleDir: string) {}

  // Navigate to recover.html and wait for WASM
  async open(): Promise<void> {
    await this.page.goto(`file://${path.join(this.bundleDir, 'recover.html')}`);
    await this.page.waitForFunction(
      () => (window as any).rememoryAppReady === true,
      { timeout: 30000 }
    );
  }

  // Navigate to a standalone recover.html file (no personalization)
  async openFile(htmlPath: string): Promise<void> {
    await this.page.goto(`file://${htmlPath}`);
    await this.page.waitForFunction(
      () => (window as any).rememoryAppReady === true,
      { timeout: 30000 }
    );
  }

  // Add shares from README files (supports translated filenames)
  async addShares(...bundleDirs: string[]): Promise<void> {
    const readmePaths = bundleDirs.map(dir => findReadmeFile(dir, '.txt'));
    await this.page.locator('#share-file-input').setInputFiles(readmePaths);
  }

  // Add shares from PDF files
  async addSharePDFs(...bundleDirs: string[]): Promise<void> {
    const pdfPaths = bundleDirs.map(dir => findReadmeFile(dir, '.pdf'));
    await this.page.locator('#share-file-input').setInputFiles(pdfPaths);
  }

  // Add bundle ZIP file directly (tests ZIP extraction)
  async addBundleZip(bundlesDir: string, friendName: string): Promise<void> {
    const zipPath = path.join(bundlesDir, `bundle-${friendName.toLowerCase()}.zip`);
    await this.page.locator('#share-file-input').setInputFiles(zipPath);
  }

  // Add manifest file — tries MANIFEST.age first, falls back to recover.html
  async addManifest(bundleDir?: string): Promise<void> {
    const dir = bundleDir || this.bundleDir;
    const manifestPath = path.join(dir, 'MANIFEST.age');
    const recoverPath = path.join(dir, 'recover.html');
    const filePath = fs.existsSync(manifestPath) ? manifestPath : recoverPath;
    await this.page.locator('#manifest-file-input').setInputFiles(filePath);
  }

  // Add a specific file as the manifest source (e.g. a personalized recover.html)
  async addManifestFile(filePath: string): Promise<void> {
    await this.page.locator('#manifest-file-input').setInputFiles(filePath);
  }

  // Click recover button
  async recover(): Promise<void> {
    await this.page.locator('#recover-btn').click();
  }

  // Assertions
  async expectShareCount(count: number): Promise<void> {
    await expect(this.page.locator('.share-item')).toHaveCount(count);
  }

  async expectShareHolder(name: string): Promise<void> {
    // Use toBeAttached() since shares may be hidden when threshold is met
    await expect(this.page.locator('.share-item').filter({ hasText: name })).toBeAttached();
  }

  async expectReadyToRecover(): Promise<void> {
    await expect(this.page.locator('#threshold-info')).toHaveClass(/ready/);
  }

  async expectNeedMoreShares(count: number): Promise<void> {
    const expected = count === 1 ? 'One last piece needed' : `${count} more pieces needed`;
    await expect(this.page.locator('#threshold-info')).toContainText(expected);
  }

  async expectManifestLoaded(): Promise<void> {
    // Longer timeout: reading large recover.html files via FileReader can be slow (especially Firefox)
    await expect(this.page.locator('#manifest-status')).toHaveClass(/loaded/, { timeout: 15000 });
  }

  async expectManifestDropZoneVisible(): Promise<void> {
    await expect(this.page.locator('#manifest-drop-zone')).toBeVisible();
  }

  async expectRecoverEnabled(): Promise<void> {
    await expect(this.page.locator('#recover-btn')).toBeEnabled();
  }

  async expectRecoverDisabled(): Promise<void> {
    await expect(this.page.locator('#recover-btn')).toBeDisabled();
  }

  async expectRecoveryComplete(): Promise<void> {
    await expect(this.page.locator('#status-message')).toContainText('files are ready', { timeout: 60000 });
  }

  async expectFileCount(count: number): Promise<void> {
    await expect(this.page.locator('.file-item')).toHaveCount(count);
  }

  async expectDownloadVisible(): Promise<void> {
    await expect(this.page.locator('#download-all-btn')).toBeVisible();
  }

  async expectNoLoadingIndicator(): Promise<void> {
    // No loading indicator exists anymore (WASM was removed)
    // Just verify body doesn't have a loading cursor
    const cursor = await this.page.evaluate(() => document.body.style.cursor);
    expect(cursor).not.toBe('wait');
  }

  async expectUIElements(): Promise<void> {
    await expect(this.page.locator('h1')).toContainText('Recover Files');
    await expect(this.page.locator('#share-drop-zone')).toBeVisible();
    // Manifest drop zone may be hidden when manifest is embedded in personalization
  }

  // Dismiss dialogs (for duplicate share tests)
  onDialog(action: 'dismiss' | 'accept' = 'dismiss'): void {
    this.page.on('dialog', dialog => dialog[action]());
  }

  // Paste functionality
  async clickPasteButton(): Promise<void> {
    await this.page.locator('#paste-toggle-btn').click();
  }

  async expectPasteAreaVisible(): Promise<void> {
    await expect(this.page.locator('#paste-area')).toBeVisible();
  }

  async pasteShare(content: string): Promise<void> {
    await this.page.locator('#paste-input').fill(content);
  }

  async submitPaste(): Promise<void> {
    await this.page.locator('#paste-submit-btn').click();
  }

  // Holder share label check
  async expectHolderShareLabel(): Promise<void> {
    await expect(this.page.locator('.share-item').first()).toContainText('Your piece');
  }

  // Contact list assertions
  async expectContactListVisible(): Promise<void> {
    await expect(this.page.locator('#contact-list-section')).toBeVisible();
  }

  async expectContactItem(name: string): Promise<void> {
    await expect(this.page.locator('.contact-item').filter({ hasText: name })).toBeVisible();
  }

  async expectContactCollected(name: string): Promise<void> {
    const contact = this.page.locator('.contact-item').filter({ hasText: name });
    await expect(contact).toHaveClass(/collected/);
  }

  async expectContactNotCollected(name: string): Promise<void> {
    const contact = this.page.locator('.contact-item').filter({ hasText: name });
    await expect(contact).not.toHaveClass(/collected/);
  }

  // Steps collapse assertions
  async expectStepsVisible(): Promise<void> {
    await expect(this.page.locator('.card').first()).toBeVisible();
  }

  async expectStepsCollapsed(): Promise<void> {
    // Longer timeout: reading manifest from recover.html can be slow (especially Firefox)
    await expect(this.page.locator('.card.collapsed').first()).toBeAttached({ timeout: 15000 });
  }
}

// Page helper class for bundle creation tool interactions
export class CreationPage {
  constructor(private page: Page, private htmlPath: string) {}

  // Navigate to maker.html and wait for WASM
  async open(): Promise<void> {
    await this.page.goto(`file://${this.htmlPath}`);
    await this.page.waitForFunction(
      () => (window as any).rememoryReady === true,
      { timeout: 30000 }
    );
  }

  // Friends management
  async addFriend(): Promise<void> {
    await this.page.locator('#add-friend-btn').click();
  }

  async removeFriend(index: number): Promise<void> {
    const removeButtons = this.page.locator('.friend-entry .remove-btn');
    await removeButtons.nth(index).click();
  }

  async setFriend(index: number, name: string, contact?: string): Promise<void> {
    const entry = this.page.locator('.friend-entry').nth(index);
    await entry.locator('.friend-name').fill(name);
    if (contact) {
      await entry.locator('.friend-contact').fill(contact);
    }
  }

  async expectFriendCount(count: number): Promise<void> {
    await expect(this.page.locator('.friend-entry')).toHaveCount(count);
  }

  async expectFriendData(index: number, name: string, contact?: string): Promise<void> {
    const entry = this.page.locator('.friend-entry').nth(index);
    await expect(entry.locator('.friend-name')).toHaveValue(name);
    if (contact !== undefined) {
      await expect(entry.locator('.friend-contact')).toHaveValue(contact);
    }
  }

  // Threshold
  async setThreshold(value: number): Promise<void> {
    await this.page.locator('#threshold-select').selectOption(String(value));
  }

  async expectThresholdOptions(options: string[]): Promise<void> {
    const select = this.page.locator('#threshold-select');
    for (const option of options) {
      await expect(select.locator('option', { hasText: option })).toBeAttached();
    }
  }

  async expectThresholdVisible(): Promise<void> {
    await expect(this.page.locator('#threshold-section')).toBeVisible();
  }

  async expectThresholdHidden(): Promise<void> {
    await expect(this.page.locator('#threshold-section')).not.toBeVisible();
  }

  // YAML import
  async importYAML(content: string): Promise<void> {
    // Open the import details
    const details = this.page.locator('.import-section');
    const isOpen = await details.getAttribute('open');
    if (isOpen === null) {
      await details.locator('> summary').click();
    }
    await this.page.locator('#yaml-import').fill(content);
    await this.page.locator('#import-btn').click();
  }

  // Files
  createTestFiles(tmpDir: string, prefix: string = 'default'): string[] {
    const filesDir = path.join(tmpDir, `test-files-${prefix}`);
    fs.mkdirSync(filesDir, { recursive: true });

    const file1 = path.join(filesDir, `${prefix}-secret.txt`);
    const file2 = path.join(filesDir, `${prefix}-notes.txt`);

    fs.writeFileSync(file1, `This is a secret password (${prefix}): correct-horse-battery-staple`);
    fs.writeFileSync(file2, `Remember to feed the cat! (${prefix})`);

    return [file1, file2];
  }

  async addFiles(filePaths: string[]): Promise<void> {
    await this.page.locator('#files-input').setInputFiles(filePaths);
  }

  async expectFilesPreviewVisible(): Promise<void> {
    await expect(this.page.locator('#files-preview')).toBeVisible();
  }

  async expectFileCount(count: number): Promise<void> {
    await expect(this.page.locator('#files-preview .file-item')).toHaveCount(count);
  }

  // Generation
  async expectGenerateEnabled(): Promise<void> {
    await expect(this.page.locator('#generate-btn')).toBeEnabled();
  }

  async expectGenerateDisabled(): Promise<void> {
    await expect(this.page.locator('#generate-btn')).toBeDisabled();
  }

  async expectGeneratePrimary(): Promise<void> {
    await expect(this.page.locator('#generate-btn')).toHaveClass(/btn-primary/);
  }

  async expectGenerateSecondary(): Promise<void> {
    await expect(this.page.locator('#generate-btn')).toHaveClass(/btn-secondary/);
  }

  async expectStepActive(step: number): Promise<void> {
    await expect(this.page.locator(`#step-number-${step}`)).not.toHaveClass(/pending/);
  }

  async expectStepPending(step: number): Promise<void> {
    await expect(this.page.locator(`#step-number-${step}`)).toHaveClass(/pending/);
  }

  async generate(): Promise<void> {
    await this.page.locator('#generate-btn').click();
  }

  async expectGenerationComplete(): Promise<void> {
    await expect(this.page.locator('#status-message')).toContainText('ready', { timeout: 120000 });
  }

  async expectBundleCount(count: number): Promise<void> {
    await expect(this.page.locator('.bundle-item')).toHaveCount(count);
  }

  async expectBundleFor(name: string): Promise<void> {
    await expect(this.page.locator('.bundle-item').filter({ hasText: name })).toBeVisible();
  }

  // Download bundle and return data
  async downloadBundle(index: number): Promise<Uint8Array | null> {
    // Get bundle data from the page's state
    const data = await this.page.evaluate((idx) => {
      const state = (window as any).rememoryBundles;
      if (!state || !state[idx]) return null;
      return Array.from(state[idx].data as Uint8Array);
    }, index);

    if (!data) return null;
    return new Uint8Array(data);
  }

  // UI assertions
  async expectUIElements(): Promise<void> {
    await expect(this.page.locator('.logo')).toContainText('ReMemory');
    await expect(this.page.locator('#friends-list')).toBeVisible();
    await expect(this.page.locator('#files-drop-zone')).toBeVisible();
    await expect(this.page.locator('#generate-btn')).toBeVisible();
  }

  async expectPageTitle(title: string): Promise<void> {
    await expect(this.page.locator('h1')).toContainText(title);
  }

  // Language
  async setLanguage(lang: string): Promise<void> {
    await this.page.locator('#lang-select').selectOption(lang);
  }

  // Dismiss dialogs (for validation error tests)
  onDialog(action: 'dismiss' | 'accept' = 'dismiss'): void {
    this.page.on('dialog', dialog => dialog[action]());
  }

  // Anonymous mode methods
  async selectAnonymousMode(): Promise<void> {
    await this.page.locator('.mode-tab[data-mode="anonymous"]').click();
  }

  async selectNamedMode(): Promise<void> {
    await this.page.locator('.mode-tab[data-mode="named"]').click();
  }

  async toggleAnonymousMode(): Promise<void> {
    const anonTab = this.page.locator('.mode-tab[data-mode="anonymous"]');
    const isActive = await anonTab.evaluate(el => el.classList.contains('active'));
    if (isActive) {
      await this.page.locator('.mode-tab[data-mode="named"]').click();
    } else {
      await anonTab.click();
    }
  }

  async expectAnonymousModeActive(): Promise<void> {
    await expect(this.page.locator('.mode-tab[data-mode="anonymous"]')).toHaveClass(/active/);
  }

  async expectNamedModeActive(): Promise<void> {
    await expect(this.page.locator('.mode-tab[data-mode="named"]')).toHaveClass(/active/);
  }

  async expectAnonymousModeChecked(): Promise<void> {
    await this.expectAnonymousModeActive();
  }

  async expectAnonymousModeUnchecked(): Promise<void> {
    await this.expectNamedModeActive();
  }

  async expectFriendsListHidden(): Promise<void> {
    await expect(this.page.locator('#friends-section')).toHaveClass(/hidden/);
  }

  async expectFriendsListVisible(): Promise<void> {
    await expect(this.page.locator('#friends-section')).not.toHaveClass(/hidden/);
  }

  async expectSharesInputVisible(): Promise<void> {
    await expect(this.page.locator('#shares-input')).toBeVisible();
  }

  async expectSharesInputHidden(): Promise<void> {
    await expect(this.page.locator('#shares-input')).toHaveClass(/hidden/);
  }

  async setNumShares(count: number): Promise<void> {
    await this.page.locator('#num-shares').fill(String(count));
    // Trigger input event to update state
    await this.page.locator('#num-shares').dispatchEvent('input');
  }

  async expectNumShares(count: number): Promise<void> {
    await expect(this.page.locator('#num-shares')).toHaveValue(String(count));
  }

  // Export YAML and return content
  async exportYAML(): Promise<string> {
    // Listen for download event and intercept the Blob
    const yamlContent = await this.page.evaluate(async () => {
      return new Promise<string>((resolve, reject) => {
        // Override URL.createObjectURL to capture the blob
        const originalCreateObjectURL = URL.createObjectURL;
        let resolved = false;
        
        // Set a timeout in case the download never happens (5 seconds)
        const timeout = setTimeout(() => {
          if (!resolved) {
            URL.createObjectURL = originalCreateObjectURL;
            reject(new Error('YAML download timeout'));
          }
        }, 5000);
        
        URL.createObjectURL = (blob: Blob | MediaSource) => {
          if (blob instanceof Blob && !resolved) {
            resolved = true;
            clearTimeout(timeout);
            const reader = new FileReader();
            reader.onload = () => {
              URL.createObjectURL = originalCreateObjectURL;
              resolve(reader.result as string);
            };
            reader.onerror = () => {
              URL.createObjectURL = originalCreateObjectURL;
              reject(new Error('Failed to read blob'));
            };
            reader.readAsText(blob);
            return originalCreateObjectURL(blob);
          }
          // Handle MediaSource or non-Blob cases
          return originalCreateObjectURL(blob);
        };
        
        // Click the download button
        const btn = document.getElementById('download-yaml-btn');
        if (!btn) {
          clearTimeout(timeout);
          URL.createObjectURL = originalCreateObjectURL;
          reject(new Error('Download button not found'));
          return;
        }
        btn.click();
      });
    });
    
    return yamlContent;
  }
}
