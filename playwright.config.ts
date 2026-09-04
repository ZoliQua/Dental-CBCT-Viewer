import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end smoke tests. They drive the real dev server (which sets the
 * COOP/COEP headers the viewer needs) with a headless Chromium and check the
 * critical path: landing → load the bundled sample → the MPR / panoramic views
 * mount. WebGL-only assertions (the 3D volume) are avoided so the suite is
 * reliable in headless / CI environments.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'line' : 'list',
  timeout: 90_000, // the sample volume is ~16 MB + volume build
  expect: { timeout: 45_000 },
  use: {
    baseURL: 'http://localhost:3340',
    trace: 'on-first-retry',
    // Chromium GPU is unreliable headless; the smoke path uses 2D canvas views.
    launchOptions: { args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3340',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
