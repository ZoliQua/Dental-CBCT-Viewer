import { defineConfig } from 'vitest/config';
import path from 'path';

// Unit tests only. The Playwright e2e specs live in e2e/ and are run by
// `npm run test:e2e`; keep Vitest from picking them up (its default glob would
// otherwise match e2e/*.spec.ts and fail on the @playwright/test import).
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['e2e/**', 'node_modules/**'],
  },
});
