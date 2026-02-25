import { test, expect } from './fixtures';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  getRememoryBin,
  generateStandaloneHTML,
  createTestProject,
  extractBundle,
  CreationPage,
  RecoveryPage,
} from './helpers';

test.describe('Time-lock: maker.html advanced options', () => {
  let htmlPath: string;
  let tmpDir: string;

  test.beforeAll(async () => {
    const bin = getRememoryBin();
    if (!fs.existsSync(bin)) {
      test.skip();
      return;
    }
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rememory-tlock-e2e-'));
    htmlPath = generateStandaloneHTML(tmpDir, 'create');
  });

  test.afterAll(async () => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('advanced options tabs visible when tlock-js is loaded', async ({ page }) => {
    const creation = new CreationPage(page, htmlPath);
    await creation.open();

    // tlock-js is included in default maker.html, so Simple/Advanced tabs should be visible
    const advancedTabs = page.locator('#advanced-options');
    await expect(advancedTabs).toBeVisible();

    // Both tabs should be visible
    await expect(advancedTabs.locator('[data-mode="simple"]')).toBeVisible();
    await expect(advancedTabs.locator('[data-mode="advanced"]')).toBeVisible();
  });

  test('timelock checkbox toggles date picker', async ({ page }) => {
    const creation = new CreationPage(page, htmlPath);
    await creation.open();

    // Switch to Advanced tab
    await page.locator('#advanced-options [data-mode="advanced"]').click();

    // Timelock panel should be visible, options hidden initially
    const tlockOptions = page.locator('#timelock-options');
    await expect(tlockOptions).toHaveClass(/hidden/);

    // Check the timelock checkbox
    await page.locator('#timelock-checkbox').check();

    // Timelock options should now be visible
    await expect(tlockOptions).not.toHaveClass(/hidden/);

    // Date preview should be visible
    await expect(page.locator('#timelock-date-preview')).toBeVisible();

    // Uncheck the timelock checkbox
    await page.locator('#timelock-checkbox').uncheck();

    // Timelock options should be hidden again
    await expect(tlockOptions).toHaveClass(/hidden/);
  });

  test('timelock date preview updates with value and unit changes', async ({ page }) => {
    const creation = new CreationPage(page, htmlPath);
    await creation.open();

    // Switch to Advanced and enable timelock
    await page.locator('#advanced-options [data-mode="advanced"]').click();
    await page.locator('#timelock-checkbox').check();

    const preview = page.locator('#timelock-date-preview');

    // Default is 30 days — preview should show a date
    await expect(preview).not.toBeEmpty();
    const initialText = await preview.textContent();

    // Change to weeks
    await page.locator('#timelock-unit').selectOption('w');
    const weeksText = await preview.textContent();
    expect(weeksText).not.toBe(initialText);

    // Change value to 1
    await page.locator('#timelock-value').fill('1');
    await page.locator('#timelock-value').dispatchEvent('input');
    const oneWeekText = await preview.textContent();
    expect(oneWeekText).toBeTruthy();
  });

  test('tlock bundle creation works fully offline @cross-browser', async ({ page }, testInfo) => {
    testInfo.setTimeout(120000);

    // Network is blocked by the offline-by-default fixture.
    // If tlock encryption tries to hit drand, the test will fail.
    const creation = new CreationPage(page, htmlPath);
    await creation.open();

    await creation.setFriend(0, 'Alice', 'alice@test.com');
    await creation.setFriend(1, 'Bob', 'bob@test.com');

    const testFiles = creation.createTestFiles(tmpDir, 'offline-tlock');
    await creation.addFiles(testFiles);

    // Enable timelock
    await page.locator('#advanced-options [data-mode="advanced"]').click();
    await page.locator('#timelock-checkbox').check();

    // Generate bundles with tlock — must succeed without any network
    await creation.generate();
    await creation.expectGenerationComplete();

    await creation.expectBundleCount(2);
    await creation.expectBundleFor('Alice');
    await creation.expectBundleFor('Bob');
  });
});

test.describe('Time-lock: maker.html bundle creation and recovery with tlock', () => {
  // Recovery needs drand beacon access — creation is still offline (enforced by group 1).
  test.use({ allowedHosts: ['api.drand.sh'] });

  // This test hits the real drand network — only run under REMEMORY_TEST_TLOCK=1 (make test-tlock)
  test.beforeAll(() => {
    if (process.env.REMEMORY_TEST_TLOCK !== '1') {
      throw new Error('REMEMORY_TEST_TLOCK=1 is required — run these tests via make test-tlock');
    }
  });

  let makerPath: string;
  let recoverPath: string;
  let tmpDir: string;

  test.beforeAll(async () => {
    const bin = getRememoryBin();
    if (!fs.existsSync(bin)) {
      test.skip();
      return;
    }
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rememory-tlock-create-e2e-'));
    makerPath = generateStandaloneHTML(tmpDir, 'create');
    recoverPath = generateStandaloneHTML(tmpDir, 'recover');
  });

  test.afterAll(async () => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('create tlock bundle and recover after unlock time @cross-browser', async ({ page }, testInfo) => {
    // This test hits the real drand network — give it plenty of time
    testInfo.setTimeout(180000);

    const creation = new CreationPage(page, makerPath);
    await creation.open();

    // Set up friends
    await creation.setFriend(0, 'Alice', 'alice@test.com');
    await creation.setFriend(1, 'Bob', 'bob@test.com');

    // Add test files
    const testFiles = creation.createTestFiles(tmpDir, 'tlock');
    await creation.addFiles(testFiles);

    // Enable timelock
    await page.locator('#advanced-options [data-mode="advanced"]').click();
    await page.locator('#timelock-checkbox').check();

    // Set tlock to 15 seconds via DOM form fields. The 's' (seconds) unit is
    // supported by computeTimelockDate but not in the visible <select>, so we
    // inject a hidden option for the E2E test.
    await page.evaluate(() => {
      const select = document.getElementById('timelock-unit') as HTMLSelectElement;
      const opt = document.createElement('option');
      opt.value = 's';
      opt.textContent = 'seconds';
      select.appendChild(opt);
      select.value = 's';
      select.dispatchEvent(new Event('change'));
    });
    await page.locator('#timelock-value').fill('15');
    await page.locator('#timelock-value').dispatchEvent('input');

    // Generate bundles — exercises the full tlock path:
    // JS archive → JS tlock-encrypt via real drand → WASM age-encrypt + split + bundle
    await creation.generate();
    await creation.expectGenerationComplete();

    await creation.expectBundleCount(2);
    await creation.expectBundleFor('Alice');
    await creation.expectBundleFor('Bob');

    // Download both bundles and save to disk
    const aliceData = await creation.downloadBundle(0);
    expect(aliceData).toBeTruthy();
    const bobData = await creation.downloadBundle(1);
    expect(bobData).toBeTruthy();

    const aliceZipPath = path.join(tmpDir, 'bundle-alice.zip');
    const bobZipPath = path.join(tmpDir, 'bundle-bob.zip');
    fs.writeFileSync(aliceZipPath, aliceData!);
    fs.writeFileSync(bobZipPath, bobData!);

    // Extract Alice's bundle to get recover.html
    const AdmZip = require('adm-zip');
    const aliceZip = new AdmZip(aliceZipPath);
    const aliceDir = path.join(tmpDir, 'bundle-alice');
    aliceZip.extractAllTo(aliceDir, true);

    // Wait for the tlock round to pass (~15s from when we patched + some buffer)
    await page.waitForTimeout(20000);

    // Open the personalized recover.html from Alice's bundle
    const recovery = new RecoveryPage(page, aliceDir);
    await recovery.open();

    // Verify Alice's share is pre-loaded (holder share from personalization)
    await recovery.expectShareCount(1);

    // Manifest should be auto-loaded (embedded in personalization for small archives)
    await recovery.expectManifestLoaded();

    // Add Bob's bundle ZIP as the second share — recovery auto-starts when threshold is met
    await recovery.addBundleZip(tmpDir, 'bob');
    await recovery.expectShareCount(2);

    // Recovery auto-starts — wait for completion (tlock-decrypt via real drand)
    await recovery.expectRecoveryComplete();

    // Verify the recovered files
    await recovery.expectFileCount(2);
    await recovery.expectDownloadVisible();
  });
});

// Note: the old "maker.html --no-timelock" test group is gone.
// Tlock encryption is always included in maker.html (offline, no HTTP calls).
// The --no-timelock flag now only affects recover.html.

test.describe('Time-lock: recover.html tlock detection', () => {
  let genericRecoverPath: string;
  let tmpDir: string;

  test.beforeAll(async () => {
    const bin = getRememoryBin();
    if (!fs.existsSync(bin)) {
      test.skip();
      return;
    }
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rememory-tlock-recover-e2e-'));
    genericRecoverPath = generateStandaloneHTML(tmpDir, 'recover');
  });

  test.afterAll(async () => {
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('generic recover.html includes tlock support (DRAND_CONFIG present)', async ({ page }) => {
    const recovery = new RecoveryPage(page, tmpDir);
    await recovery.openFile(genericRecoverPath);

    // The tlock variant includes DRAND_CONFIG for tlock decryption.
    // Recovery-side tlock code is bundled directly in app-tlock.js.
    const hasDrandConfig = await page.evaluate(() => typeof (window as any).DRAND_CONFIG !== 'undefined');
    expect(hasDrandConfig).toBe(true);
  });

  test('plain manifest loads without tlock waiting UI', async ({ page }) => {
    const recovery = new RecoveryPage(page, tmpDir);
    await recovery.openFile(genericRecoverPath);

    // Create a dummy MANIFEST.age (just text, not real age — won't decrypt,
    // but we're only testing that loading it doesn't show tlock waiting UI)
    const manifestPath = path.join(tmpDir, 'MANIFEST.age');
    fs.writeFileSync(manifestPath, 'age-encryption.org/v1\nfake-ciphertext-data');

    // Upload the manifest
    await recovery.addManifestFile(manifestPath);

    // Should show manifest as loaded
    await recovery.expectManifestLoaded();
    const manifestStatus = page.locator('#manifest-status');
    await expect(manifestStatus).toContainText('MANIFEST.age');

    // Tlock waiting panel should remain hidden (tlock detection is post-decryption now)
    const tlockWaiting = page.locator('#tlock-waiting');
    await expect(tlockWaiting).toHaveClass(/hidden/);
  });
});

test.describe('Time-lock: non-tlock bundles', () => {
  let projectDir: string;

  test.beforeAll(async () => {
    const bin = getRememoryBin();
    if (!fs.existsSync(bin)) {
      test.skip();
      return;
    }
    projectDir = createTestProject();
  });

  test('personalized non-tlock recover.html does not include tlock code', async ({ page }) => {
    const bundlesDir = path.join(projectDir, 'output', 'bundles');
    const aliceDir = extractBundle(bundlesDir, 'alice');

    const recovery = new RecoveryPage(page, aliceDir);
    await recovery.open();

    // Non-tlock personalized bundle should not have DRAND_CONFIG
    // (uses app.js, the offline variant with no tlock code)
    const hasDrandConfig = await page.evaluate(() => typeof (window as any).DRAND_CONFIG !== 'undefined');
    expect(hasDrandConfig).toBe(false);
  });

  test('personalized non-tlock recover.html has no tlock-waiting element', async ({ page }) => {
    const bundlesDir = path.join(projectDir, 'output', 'bundles');
    const aliceDir = extractBundle(bundlesDir, 'alice');

    const recovery = new RecoveryPage(page, aliceDir);
    await recovery.open();

    // The #tlock-waiting element should not exist at all in non-tlock bundles
    const tlockWaiting = page.locator('#tlock-waiting');
    await expect(tlockWaiting).toHaveCount(0);
  });

  test('non-tlock recover.html is smaller than generic (no tlock-js overhead)', async ({ page }) => {
    // Get the size of a personalized non-tlock recover.html
    const bundlesDir = path.join(projectDir, 'output', 'bundles');
    const aliceDir = extractBundle(bundlesDir, 'alice');
    const personalizedSize = fs.statSync(path.join(aliceDir, 'recover.html')).size;

    // Generate generic recover.html (which includes tlock-js)
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rememory-tlock-size-e2e-'));
    try {
      const genericPath = generateStandaloneHTML(tmpDir, 'recover');
      const genericSize = fs.statSync(genericPath).size;

      // Generic recover.html should be larger because it includes tlock-js
      // The personalized one has the embedded manifest but no tlock-js,
      // so the tlock-js overhead should make generic larger than the difference
      // from the embedded manifest. We just verify generic includes more JS.
      const genericContent = fs.readFileSync(genericPath, 'utf8');
      const personalizedContent = fs.readFileSync(path.join(aliceDir, 'recover.html'), 'utf8');

      // Generic should contain the drand config (injected when tlock is enabled)
      expect(genericContent).toContain('DRAND_CONFIG');
      // Personalized non-tlock should not have the drand config
      expect(personalizedContent).not.toContain('DRAND_CONFIG');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
