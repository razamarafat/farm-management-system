import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Production smoke against the singlefile build served by `vite preview`.
// Covers the three journeys that must never break on a public deploy:
// login shell renders, PWA/version health files resolve, no page errors.
test.describe('public release smoke', () => {
  test('login shell renders, fa/rtl, no page errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 300)));

    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#root')).toBeAttached({ timeout: 15000 });

    const html = page.locator('html');
    await expect(html).toHaveAttribute('lang', 'fa');
    await expect(html).toHaveAttribute('dir', 'rtl');

    // Login form or already-authed redirect — either proves the shell booted.
    const bodyText = (await page.textContent('body')) || '';
    expect(bodyText.length).toBeGreaterThan(10);

    expect(errors, `page errors: ${errors.join(' | ')}`).toEqual([]);
  });

  test('version.json + manifest.json resolve (update + PWA health)', async ({ request }) => {
    const version = await request.get('/version.json');
    expect(version.ok()).toBeTruthy();
    const vj = await version.json();
    expect(vj.buildId).toBeTruthy();

    const manifest = await request.get('/manifest.json');
    expect(manifest.ok()).toBeTruthy();
    const mj = await manifest.json();
    expect(mj.icons?.length).toBeGreaterThanOrEqual(2);

    for (const icon of mj.icons) {
      const r = await request.get(`/${String(icon.src).replace(/^\//, '')}`);
      expect(r.ok(), `icon missing: ${icon.src}`).toBeTruthy();
    }
  });

  test('login page has no critical/serious axe violations', async ({ page }) => {
    await page.goto('/login', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#root')).toBeAttached({ timeout: 15000 });
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .disableRules(['color-contrast'])
      .analyze();
    const blocking = results.violations.filter((v) =>
      v.impact === 'critical' || v.impact === 'serious',
    );
    expect(
      blocking.map((v) => `${v.id}: ${v.help} @ ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
      'axe critical/serious violations',
    ).toEqual([]);
  });
});
