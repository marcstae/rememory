import { test, expect } from '@playwright/test';
import { ChildProcess, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as net from 'net';
import AdmZip from 'adm-zip';
import { getRememoryBin, extractWordsFromReadme, findReadmeFile } from './helpers';

// Find an available port
async function getAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address() as net.AddressInfo;
      srv.close(() => resolve(addr.port));
    });
    srv.on('error', reject);
  });
}

// Start rememory serve and wait for it to be ready
async function startServer(bin: string, port: number, dataDir: string): Promise<ChildProcess> {
  const proc = spawn(bin, ['serve', '--port', String(port), '--host', '127.0.0.1', '--data', dataDir, '--no-timelock'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  // Wait for server to be ready by polling the status endpoint
  const baseURL = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const resp = await fetch(`${baseURL}/api/status`);
      if (resp.ok) return proc;
    } catch {
      // not ready yet
    }
    await new Promise(r => setTimeout(r, 200));
  }

  proc.kill();
  throw new Error('Server did not start within 15 seconds');
}

test.describe('Selfhosted Server', () => {
  let proc: ChildProcess;
  let port: number;
  let baseURL: string;
  let dataDir: string;
  let tmpDir: string;
  const adminPassword = 'test-password-e2e';

  test.beforeAll(async () => {
    const bin = getRememoryBin();
    if (!fs.existsSync(bin)) {
      test.skip();
      return;
    }

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rememory-selfhosted-e2e-'));
    dataDir = path.join(tmpDir, 'data');
    port = await getAvailablePort();
    baseURL = `http://127.0.0.1:${port}`;
    proc = await startServer(bin, port, dataDir);
  });

  test.afterAll(async () => {
    if (proc) {
      proc.kill();
      // Wait briefly for cleanup
      await new Promise(r => setTimeout(r, 500));
    }
    if (tmpDir && fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  test('happy path: setup, create, home, recover, delete', async ({ page }, testInfo) => {
    testInfo.setTimeout(180000);

    // -----------------------------------------------------------
    // Step 1: Visit root — should show setup page (no password)
    // -----------------------------------------------------------
    await page.goto(baseURL);
    await expect(page.locator('h1')).toContainText('Set up ReMemory');

    // Fill in password
    await page.locator('#password').fill(adminPassword);
    await page.locator('#confirm').fill(adminPassword);
    await page.locator('button[type="submit"]').click();

    // Should land on home page after setup (root /)
    await page.waitForURL(baseURL + '/');

    // Home page should show empty state
    await expect(page.locator('.empty-state')).toBeVisible();
    await expect(page.locator('.empty-state')).toContainText('No recovery bundles here yet');

    // -----------------------------------------------------------
    // Step 2: Navigate to /create and create bundles
    // -----------------------------------------------------------
    await page.goto(`${baseURL}/create`);

    // Wait for WASM to load
    await page.waitForFunction(
      () => (window as any).rememoryReady === true,
      { timeout: 30000 }
    );

    // Fill in 2 friends
    await page.locator('.friend-entry').nth(0).locator('.friend-name').fill('Alice');
    await page.locator('.friend-entry').nth(0).locator('.friend-contact').fill('alice@test.com');
    await page.locator('.friend-entry').nth(1).locator('.friend-name').fill('Bob');
    await page.locator('.friend-entry').nth(1).locator('.friend-contact').fill('bob@test.com');

    // Add a test file
    const testFile = path.join(tmpDir, 'secret.txt');
    fs.writeFileSync(testFile, 'The secret is: correct-horse-battery-staple');
    await page.locator('#files-input').setInputFiles([testFile]);

    // Generate bundles
    await page.locator('#generate-btn').click();
    await expect(page.locator('#status-message')).toContainText('ready', { timeout: 120000 });

    // Bundles should appear for both friends
    await expect(page.locator('.bundle-item')).toHaveCount(2);

    // Verify manifest was saved to server (check API status)
    const statusResp = await fetch(`${baseURL}/api/status`);
    const status = await statusResp.json();
    expect(status.hasManifest).toBe(true);

    // Also check for the "Saved to server" toast
    await expect(page.locator('.toast-success')).toBeVisible({ timeout: 5000 });

    // Verify "Go to home page" link is present and points to /
    const homeLink = page.locator('.next-steps-hint a[href="/"]');
    await expect(homeLink).toBeVisible();
    expect(await homeLink.textContent()).toBe('Go to home page');

    // Verify meta.json does NOT contain friend names
    const bundleDirs = fs.readdirSync(path.join(dataDir, 'bundles'));
    expect(bundleDirs.length).toBeGreaterThan(0);
    const metaPath = path.join(dataDir, 'bundles', bundleDirs[0], 'meta.json');
    const metaContent = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
    expect(metaContent).not.toHaveProperty('friends');

    // Download both bundles — extract ZIP data from the page
    const bundleData = await page.evaluate(() => {
      const bundles = (window as any).rememoryBundles;
      if (!bundles) return null;
      return bundles.map((b: any) => ({
        fileName: b.fileName,
        data: Array.from(b.data as Uint8Array),
      }));
    });
    expect(bundleData).toBeTruthy();
    expect(bundleData.length).toBe(2);

    // Save bundles to disk and extract
    const bundlesDir = path.join(tmpDir, 'bundles');
    fs.mkdirSync(bundlesDir, { recursive: true });

    const extractedDirs: string[] = [];
    for (const bundle of bundleData) {
      const zipPath = path.join(bundlesDir, bundle.fileName);
      fs.writeFileSync(zipPath, Buffer.from(bundle.data));

      const extractDir = path.join(bundlesDir, path.basename(bundle.fileName, '.zip'));
      fs.mkdirSync(extractDir, { recursive: true });
      const zip = new AdmZip(zipPath);
      zip.extractAllTo(extractDir, true);
      extractedDirs.push(extractDir);
    }

    // -----------------------------------------------------------
    // Step 3: Navigate to home — single bundle card visible
    // -----------------------------------------------------------
    await page.goto(baseURL);
    await expect(page.locator('.bundle-card')).toHaveCount(1);

    // Bundle card should show date and threshold info
    const card = page.locator('.bundle-card').first();
    await expect(card.locator('.bundle-date')).toBeVisible();
    await expect(card.locator('.bundle-meta')).toContainText('2 of 2 pieces');

    // -----------------------------------------------------------
    // Step 4: Click Recover on bundle card — goes to /recover?id=
    // -----------------------------------------------------------
    const recoverLink = card.locator('.bundle-actions a');
    const recoverHref = await recoverLink.getAttribute('href');
    expect(recoverHref).toContain('/recover?id=');

    await recoverLink.click();
    await page.waitForURL(/\/recover\?id=/);

    await page.waitForFunction(
      () => (window as any).rememoryAppReady === true,
      { timeout: 30000 }
    );

    // Manifest should auto-load from server
    await expect(page.locator('#manifest-status')).toHaveClass(/loaded/, { timeout: 15000 });

    // Add both friends' shares (README.txt files from extracted bundles)
    const readmePaths = extractedDirs.map(dir => findReadmeFile(dir, '.txt'));
    await page.locator('#share-file-input').setInputFiles(readmePaths);

    // Should have 2 shares
    await expect(page.locator('.share-item')).toHaveCount(2);

    // Recovery should complete automatically (threshold is 2, both shares + manifest loaded)
    await expect(page.locator('#status-message')).toContainText('files are ready', { timeout: 60000 });
    await expect(page.locator('#download-all-btn')).toBeVisible();

    // -----------------------------------------------------------
    // Step 5: Navigate home, delete via the delete button
    // -----------------------------------------------------------
    await page.goto(baseURL);
    await expect(page.locator('.bundle-card')).toHaveCount(1);

    // Click Delete toggle on the bundle card
    await page.locator('.delete-toggle').click();
    await expect(page.locator('.delete-form.visible')).toBeVisible();

    // Enter password and confirm deletion
    await page.locator('.delete-password').fill(adminPassword);
    await page.locator('.delete-btn').click();

    // Home should show empty state again
    await expect(page.locator('.empty-state')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.empty-state')).toContainText('No recovery bundles here yet');

    // Verify manifest is gone via API
    const statusAfter = await fetch(`${baseURL}/api/status`);
    const statusDataAfter = await statusAfter.json();
    expect(statusDataAfter.hasManifest).toBe(false);
  });
});
