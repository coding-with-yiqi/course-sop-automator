import { defineConfig } from '@playwright/test';

/**
 * Separate Playwright config for driving the PACKAGED Electron app.
 *
 * Unlike playwright.config.ts (which spins up a dev server + vite preview and
 * tests in a browser), this config has NO webServer: the Electron app boots its
 * own bundled Fastify server on :4000. Running both configs at once would clash
 * on :4000, so the Electron suite is opt-in via `npm run test:e2e:electron`.
 *
 * The original browser e2e suite (smoke/upload/dashboard/edit-document) is kept
 * intact and excluded here; this config only runs electron-app.spec.ts.
 */
export default defineConfig({
  testDir: './e2e',
  // All electron suites: fast UI (electron-app), real pipeline
  // (electron-pipeline), and UI progress (electron-ui-progress). The pipeline /
  // progress specs self-skip when KIMI_API_KEY / sample are absent.
  testMatch: /electron-[a-z-]+\.spec\.ts/,
  fullyParallel: false, // each spec launches its own app instance
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: 'list',
  timeout: 60 * 1000,
});
