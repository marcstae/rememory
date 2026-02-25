import { test, expect } from './fixtures';
import * as fs from 'fs';
import { getRememoryBin, getIndexHtml } from './helpers';

test.describe('Landing Page', () => {
  let indexPath: string;

  test.beforeAll(async () => {
    if (!fs.existsSync(getRememoryBin())) {
      test.skip();
      return;
    }
    indexPath = getIndexHtml();
  });

  test('index.html loads with key sections', async ({ page }) => {
    await page.goto('file://' + indexPath);

    // Main heading
    await expect(page.locator('h1')).toContainText('ReMemory');

    // Key sections
    await expect(page.locator('.intro')).toBeVisible();
    await expect(page.locator('.how-it-works')).toBeVisible();
    await expect(page.locator('.what-is')).toBeVisible();
    await expect(page.locator('.try-it')).toBeVisible();
    await expect(page.locator('.trust')).toBeVisible();
    await expect(page.locator('.background')).toBeVisible();
  });

  test('language picker is present', async ({ page }) => {
    await page.goto('file://' + indexPath);

    const langSelect = page.locator('#lang-select');
    await expect(langSelect).toBeVisible();

    // Should have multiple options
    const options = langSelect.locator('option');
    expect(await options.count()).toBeGreaterThan(1);

    // English should be available
    await expect(langSelect.locator('option[value="en"]')).toBeAttached();
    // Spanish should be available
    await expect(langSelect.locator('option[value="es"]')).toBeAttached();
  });

  test('language picker switches text to Spanish', async ({ page }) => {
    await page.goto('file://' + indexPath);

    // Start with English content
    await expect(page.locator('.how-it-works h2')).toContainText('How it works');

    // Switch to Spanish
    await page.locator('#lang-select').selectOption('es');

    // Text should be in Spanish
    await expect(page.locator('.how-it-works h2')).toContainText('Cómo funciona');
    await expect(page.locator('.what-is h2')).toContainText('Qué es y qué no es');
    await expect(page.locator('.try-it h2')).toContainText('Mira cómo funciona');
    await expect(page.locator('.background h2')).toContainText('Por qué construí esto');
  });

  test('language preference persists via localStorage', async ({ page }) => {
    await page.goto('file://' + indexPath);

    // Switch to Spanish
    await page.locator('#lang-select').selectOption('es');
    await expect(page.locator('.how-it-works h2')).toContainText('Cómo funciona');

    // Reload the page
    await page.reload();

    // Should still be in Spanish
    await expect(page.locator('#lang-select')).toHaveValue('es');
    await expect(page.locator('.how-it-works h2')).toContainText('Cómo funciona');
  });

  test('switching back to English works', async ({ page }) => {
    await page.goto('file://' + indexPath);

    // Switch to Spanish then back to English
    await page.locator('#lang-select').selectOption('es');
    await expect(page.locator('.how-it-works h2')).toContainText('Cómo funciona');

    await page.locator('#lang-select').selectOption('en');
    await expect(page.locator('.how-it-works h2')).toContainText('How it works');
  });

  test('HTML content in translations renders correctly', async ({ page }) => {
    await page.goto('file://' + indexPath);

    // Switch to Spanish
    await page.locator('#lang-select').selectOption('es');

    // Elements with data-i18n-html should render HTML (links, spans)
    // The summary should contain a link to Wikipedia
    const summary = page.locator('[data-i18n-html="summary_1"]');
    const link = summary.locator('a');
    await expect(link).toBeAttached();
    expect(await link.getAttribute('href')).toContain('wikipedia.org');
  });

  test('footer links are present', async ({ page }) => {
    await page.goto('file://' + indexPath);

    const footer = page.locator('#footer');
    await expect(footer).toBeVisible();
    await expect(footer.locator('a')).not.toHaveCount(0);
  });
});
