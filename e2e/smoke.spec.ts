import { test, expect } from '@playwright/test';

/**
 * Critical-path smoke test: the app boots, the bundled sample loads into a real
 * Cornerstone volume, and the viewports mount across layouts. This guards the
 * viewport internals (which the unit tests can't reach) against regressions in
 * the loader / rendering-engine wiring.
 */

test.beforeEach(async ({ page }) => {
  // Pre-agree the disclaimer banner so it never overlaps the loader.
  await page.addInitScript(() => localStorage.setItem('disclaimer-agreed', '1'));
});

test('loads the sample and mounts the MPR + panoramic views', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto('/');
  await expect(page).toHaveTitle(/DenCT/);

  // Landing → load the bundled sample.
  const sample = page.getByTestId('load-sample');
  await expect(sample).toBeVisible();
  await sample.click();

  // The study lands in the left-panel series tree (generous timeout: ~16 MB
  // download + volume build).
  await expect(page.getByText('CBCT sample', { exact: false }).first()).toBeVisible({ timeout: 60_000 });

  // 2D view uses a 2D canvas (headless-safe): an axial viewport must mount.
  await page.getByRole('button', { name: '2D view' }).click();
  await expect(page.locator('[data-vp]').first()).toBeVisible();

  // Panoramic view reconstructs the OPG onto its own canvas.
  await page.getByRole('button', { name: 'Panoramic view' }).click();
  await expect(page.locator('[data-vp="PANORAMA"]')).toBeVisible();

  // The auto-arch control (added for the panoramic reconstruction) is present.
  await expect(page.getByRole('button', { name: /Auto arch/i })).toBeVisible();

  // Export entry point is available once a study is open.
  await expect(page.getByRole('button', { name: /Export/i })).toBeVisible();

  expect(errors, `unexpected page errors:\n${errors.join('\n')}`).toEqual([]);
});

test('switches to 2D view and cycles axial / sagittal / coronal', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('load-sample').click();
  await expect(page.getByText('CBCT sample', { exact: false }).first()).toBeVisible({ timeout: 60_000 });

  await page.getByRole('button', { name: '2D view' }).click();
  const vp = page.locator('[data-vp]').first();
  await expect(vp).toBeVisible();

  // The in-image view switcher cycles the MPR planes; each should keep a
  // viewport mounted (data-vp reflects the active plane).
  for (const plane of ['Sagittal', 'Coronal', 'Axial']) {
    const btn = page.getByRole('button', { name: plane, exact: true });
    if (await btn.count()) {
      await btn.first().click();
      await expect(page.locator('[data-vp]').first()).toBeVisible();
    }
  }
});
