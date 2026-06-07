import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * End-to-end tests against the REAL packaged Electron app (release/mac-arm64).
 *
 * These mirror the intent of the original browser-based e2e suite
 * (smoke / dashboard / upload / edit-document) but drive the actual desktop
 * build: real window, real app:// protocol, real bundled Fastify server.
 *
 * Two app-specific adaptations vs the browser suite:
 *  1. Routing is HashRouter under app:// — navigation goes through the in-app
 *     sidebar/links, not page.goto('/path'). We click nav like a user would.
 *  2. The host shell (VSCode/Trae) leaks ELECTRON_RUN_AS_NODE=1, which makes
 *     Electron boot as plain Node (no window). We strip it from the child env,
 *     exactly like bootstrap.cjs does for spawned children.
 */

const APP_BINARY = path.resolve(
  __dirname,
  '../../release/mac-arm64/Course SOP Automator.app/Contents/MacOS/Course SOP Automator',
);

let app: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  if (!existsSync(APP_BINARY)) {
    throw new Error(
      `Packaged app not found at ${APP_BINARY}. Run "npm run dist:mac" first.`,
    );
  }

  // Strip the host shell's Electron pollution so the app boots as a GUI app,
  // not as plain Node. (Finder launches are already clean; this matches that.)
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.ELECTRON_FORCE_IS_PACKAGED;
  delete env.VSCODE_RUN_IN_ELECTRON;
  delete env.ICUBE_IS_ELECTRON;

  app = await electron.launch({ executablePath: APP_BINARY, env });
  page = await app.firstWindow();
  // Wait until the renderer (app:// + React) has actually mounted, i.e. the
  // bundled server is up and the SPA rendered — proves the app is not blank.
  await page.waitForLoadState('domcontentloaded');
  await expect(page.locator('#root')).not.toBeEmpty({ timeout: 20000 });
});

test.afterAll(async () => {
  await app?.close();
});

/** Navigate via HashRouter by setting the location hash, then settle. */
async function goHash(p: Page, hashPath: string): Promise<void> {
  await p.evaluate((h) => {
    window.location.hash = h;
  }, hashPath);
  await p.waitForTimeout(300);
}

// ─── Smoke (from smoke.spec.ts) ──────────────────────────────────────

test.describe('Smoke', () => {
  test('window opens and is not blank', async () => {
    const len = await page.evaluate(
      () => document.getElementById('root')?.innerHTML.length ?? 0,
    );
    expect(len).toBeGreaterThan(0);
  });

  test('app title is correct', async () => {
    await expect(page).toHaveTitle(/教学视频/);
  });

  test('sidebar shows 工作台', async () => {
    await goHash(page, '#/');
    await expect(page.locator('nav').first()).toContainText('工作台');
  });

  test('navigation to upload page works', async () => {
    await goHash(page, '#/');
    const uploadLink = page.getByRole('link', { name: /上传任务/ });
    await expect(uploadLink).toBeVisible();
    await uploadLink.click();
    await expect.poll(() => page.evaluate(() => window.location.hash)).toMatch(/upload/);
  });
});

// ─── Dashboard (from dashboard.spec.ts) ──────────────────────────────

test.describe('Dashboard', () => {
  test.beforeEach(async () => {
    await goHash(page, '#/');
  });

  test('shows stats cards', async () => {
    await expect(page.getByText('处理中')).toBeVisible();
    await expect(page.getByText('已完成')).toBeVisible();
    await expect(page.getByText('待导出')).toBeVisible();
  });

  test('shows "新建自动化任务" CTA button', async () => {
    const cta = page.getByRole('link', { name: /新建自动化任务/ });
    await expect(cta).toBeVisible();
    await cta.click();
    await expect.poll(() => page.evaluate(() => window.location.hash)).toMatch(/upload/);
  });

  test('shows empty state or task list', async () => {
    const bodyText = (await page.locator('body').textContent()) ?? '';
    const hasContent =
      bodyText.includes('最近任务') ||
      bodyText.includes('暂无') ||
      bodyText.includes('还没有');
    expect(hasContent).toBe(true);
  });

  test('sidebar navigation links work', async () => {
    await expect(page.getByRole('link', { name: /工作台/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /上传任务/ })).toBeVisible();
  });
});

// ─── Upload (from upload.spec.ts) ────────────────────────────────────

test.describe('Upload', () => {
  test.beforeEach(async () => {
    await goHash(page, '#/upload');
  });

  test('page loads with correct title and description', async () => {
    await expect(page.getByRole('heading', { name: /上传课程素材/ })).toBeVisible();
    await expect(page.getByText(/AI 会自动切片/)).toBeVisible();
  });

  test('video dropzone accepts file selection', async () => {
    const dropzone = page.locator('[class*="border-dashed"]').first();
    await expect(dropzone).toBeVisible();

    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles({
      name: 'test-video.mp4',
      mimeType: 'video/mp4',
      buffer: Buffer.from('fake mp4 content'),
    });

    await expect(page.getByText('test-video.mp4')).toBeVisible();
  });

  test('submit button disabled without video', async () => {
    // Fresh navigation so no file is selected from the previous test.
    await goHash(page, '#/');
    await goHash(page, '#/upload');
    const submitBtn = page.getByRole('button', { name: /开始自动化处理/ });
    await expect(submitBtn).toBeDisabled();
  });

  test('granularity selector has 3 options', async () => {
    await expect(page.getByText(/粗放概览/)).toBeVisible();
    await expect(page.getByText(/平衡/)).toBeVisible();
    await expect(page.getByText(/精细拆解/)).toBeVisible();
  });

  test('subtitle and slides slots are present', async () => {
    await expect(page.getByText(/上传字幕/)).toBeVisible();
    await expect(page.getByText(/PPT 原稿/)).toBeVisible();
  });
});

// ─── Edit / Report (from edit-document.spec.ts) ──────────────────────

test.describe('Edit / Report document', () => {
  test('edit page loads for non-existent document', async () => {
    await goHash(page, '#/documents/fake-doc-id/edit');
    await expect(page.locator('body')).toContainText(/加载|文档/, { timeout: 10000 });
  });

  test('report page loads for non-existent document', async () => {
    await goHash(page, '#/documents/fake-doc-id/report');
    await expect(page.locator('body')).toContainText(/加载|文档/, { timeout: 10000 });
  });
});

// ─── App-level integration (new — proves the packaged backend works) ─

test.describe('Packaged backend integration', () => {
  test('bundled server answers /api/health with ffmpeg ok', async () => {
    const health = await page.evaluate(async () => {
      const res = await fetch('http://127.0.0.1:4000/api/health');
      return res.json();
    });
    expect(health.ok).toBe(true);
    expect(health.data.ffmpeg).toBe('ok');
    expect(health.data.ffprobe).toBe('ok');
  });
});
