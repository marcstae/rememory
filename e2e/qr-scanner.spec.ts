import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import {
  getRememoryBin,
  createTestProject,
  cleanupProject,
  extractBundle,
  extractBundles,
  findReadmeFile,
  RecoveryPage
} from './helpers';

test.describe('QR Scanner', () => {
  let projectDir: string;
  let bundlesDir: string;

  test.beforeAll(async () => {
    const bin = getRememoryBin();
    if (!fs.existsSync(bin)) {
      test.skip();
      return;
    }

    projectDir = createTestProject();
    bundlesDir = path.join(projectDir, 'output', 'bundles');
  });

  test.afterAll(async () => {
    cleanupProject(projectDir);
  });

  test('scan button is visible when BarcodeDetector is available', async ({ page }) => {
    const bundleDir = extractBundle(bundlesDir, 'Alice');

    // Mock BarcodeDetector before page loads
    await page.addInitScript(() => {
      (window as any).BarcodeDetector = class {
        constructor() {}
        async detect() { return []; }
        static async getSupportedFormats() { return ['qr_code']; }
      };
    });

    const recovery = new RecoveryPage(page, bundleDir);
    await recovery.open();

    await expect(page.locator('#scan-qr-btn')).toBeVisible();
  });

  test('scan button is always visible (polyfill provides BarcodeDetector)', async ({ page }) => {
    const bundleDir = extractBundle(bundlesDir, 'Alice');

    const recovery = new RecoveryPage(page, bundleDir);
    await recovery.open();

    // With the zbar-wasm polyfill, BarcodeDetector is always available
    await expect(page.locator('#scan-qr-btn')).toBeVisible();
  });

  test('clicking scan opens modal and close button dismisses it', async ({ page }) => {
    const bundleDir = extractBundle(bundlesDir, 'Alice');

    await page.addInitScript(() => {
      (window as any).BarcodeDetector = class {
        constructor() {}
        async detect() { return []; }
        static async getSupportedFormats() { return ['qr_code']; }
      };

      navigator.mediaDevices.getUserMedia = async () => {
        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 480;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, 640, 480);
        return canvas.captureStream(1);
      };
    });

    const recovery = new RecoveryPage(page, bundleDir);
    await recovery.open();

    // Modal should be hidden initially
    await expect(page.locator('#qr-scanner-modal')).not.toBeVisible();

    // Click scan button
    await page.locator('#scan-qr-btn').click();

    // Modal should be visible
    await expect(page.locator('#qr-scanner-modal')).toBeVisible();

    // Close button should dismiss modal
    await page.locator('#qr-scanner-close').click();
    await expect(page.locator('#qr-scanner-modal')).not.toBeVisible();
  });

  test('scanning a compact share adds it to the shares list', async ({ page }) => {

    const [aliceDir] = extractBundles(bundlesDir, ['Alice']);
    const recovery = new RecoveryPage(page, aliceDir);

    // Use a known valid compact share from golden fixtures (Bob, index 2)
    const compactShare = 'RM2:2:5:3:4FCmWfgQHjkaGrtwLPqV4WB81u-ZeGKZekj7yukG2-zY:10c8';

    // Mock BarcodeDetector to return our compact share after a few detect() calls
    await page.addInitScript((compact: string) => {
      let detectCallCount = 0;

      (window as any).BarcodeDetector = class {
        constructor() {}
        async detect() {
          detectCallCount++;
          if (detectCallCount > 3) {
            return [{ rawValue: compact, format: 'qr_code', boundingBox: {}, cornerPoints: [] }];
          }
          return [];
        }
        static async getSupportedFormats() { return ['qr_code']; }
      };

      navigator.mediaDevices.getUserMedia = async () => {
        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 480;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, 640, 480);
        return canvas.captureStream(1);
      };
    }, compactShare);

    await recovery.open();
    await recovery.expectShareCount(1);

    // Open scanner
    await page.locator('#scan-qr-btn').click();
    await expect(page.locator('#qr-scanner-modal')).toBeVisible();

    // Wait for the share to be detected and added
    await recovery.expectShareCount(2);

    // Modal should close after successful scan
    await expect(page.locator('#qr-scanner-modal')).not.toBeVisible();
  });

  test('scanning a URL with fragment adds the share', async ({ page }) => {

    const [aliceDir] = extractBundles(bundlesDir, ['Alice']);
    const recovery = new RecoveryPage(page, aliceDir);

    // Use a known valid compact share from golden fixtures (Carol, index 3)
    const compactShare = 'RM2:3:5:3:aKoRQv1shz6UZSAXvTLEXnS1zSQkTS3jhqA3-06G2jnA:6ec0';
    const qrUrl = `https://eljojo.github.io/rememory/recover.html#share=${encodeURIComponent(compactShare)}`;

    // Mock BarcodeDetector to return a URL with fragment
    await page.addInitScript((url: string) => {
      let detectCallCount = 0;

      (window as any).BarcodeDetector = class {
        constructor() {}
        async detect() {
          detectCallCount++;
          if (detectCallCount > 3) {
            return [{ rawValue: url, format: 'qr_code', boundingBox: {}, cornerPoints: [] }];
          }
          return [];
        }
        static async getSupportedFormats() { return ['qr_code']; }
      };

      navigator.mediaDevices.getUserMedia = async () => {
        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 480;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, 640, 480);
        return canvas.captureStream(1);
      };
    }, qrUrl);

    await recovery.open();
    await page.locator('#scan-qr-btn').click();

    // Should detect the URL, extract the fragment, and add the share
    await recovery.expectShareCount(2);
    await expect(page.locator('#qr-scanner-modal')).not.toBeVisible();
  });

  test('camera permission denied shows error and closes modal', async ({ page }) => {
    const bundleDir = extractBundle(bundlesDir, 'Alice');

    await page.addInitScript(() => {
      (window as any).BarcodeDetector = class {
        constructor() {}
        async detect() { return []; }
        static async getSupportedFormats() { return ['qr_code']; }
      };

      // Mock getUserMedia to reject (permission denied)
      navigator.mediaDevices.getUserMedia = async () => {
        throw new DOMException('Permission denied', 'NotAllowedError');
      };
    });

    const recovery = new RecoveryPage(page, bundleDir);
    await recovery.open();

    await page.locator('#scan-qr-btn').click();

    // Modal should close after error
    await expect(page.locator('#qr-scanner-modal')).not.toBeVisible();

    // A toast warning should appear
    await expect(page.locator('.toast')).toBeVisible();
  });

  test('camera tracks are stopped when modal is closed', async ({ page }) => {
    const bundleDir = extractBundle(bundlesDir, 'Alice');

    await page.addInitScript(() => {
      (window as any).__qrTestTrackStopped = false;

      (window as any).BarcodeDetector = class {
        constructor() {}
        async detect() { return []; }
        static async getSupportedFormats() { return ['qr_code']; }
      };

      // Use canvas capture stream but wrap tracks to detect stop()
      const origGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async () => {
        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 480;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, 640, 480);
        const stream = canvas.captureStream(1);

        // Wrap track.stop() to detect when it's called
        for (const track of stream.getTracks()) {
          const origStop = track.stop.bind(track);
          track.stop = () => {
            (window as any).__qrTestTrackStopped = true;
            origStop();
          };
        }
        return stream;
      };
    });

    const recovery = new RecoveryPage(page, bundleDir);
    await recovery.open();

    // Open scanner
    await page.locator('#scan-qr-btn').click();
    await expect(page.locator('#qr-scanner-modal')).toBeVisible();

    // Verify track not yet stopped
    let stopped = await page.evaluate(() => (window as any).__qrTestTrackStopped);
    expect(stopped).toBe(false);

    // Close scanner
    await page.locator('#qr-scanner-close').click();

    // Verify track was stopped
    stopped = await page.evaluate(() => (window as any).__qrTestTrackStopped);
    expect(stopped).toBe(true);
  });
});
