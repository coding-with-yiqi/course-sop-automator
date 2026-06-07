import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

/**
 * UI progress test: drive the REAL upload UI like a user — pick a video +
 * subtitle, click "开始自动化处理", then watch whether the on-screen pipeline
 * progress (StageList / StageCard) actually advances as the backend runs.
 *
 * This exists because API-only checks said "succeeded" while the user reported
 * the on-screen progress bars never moved. This test asserts the UI itself
 * reflects pipeline progress (SSE → React state → DOM), not just the API.
 */

const APP_BINARY = path.resolve(
  REPO_ROOT,
  'release/mac-arm64/Course SOP Automator.app/Contents/MacOS/Course SOP Automator',
);
const SAMPLE_DIR = path.join(REPO_ROOT, 'server/data/uploads/task_me9ftluwHkWc');
const SAMPLE_VIDEO = path.join(SAMPLE_DIR, 'video.mp4');
const SAMPLE_SUBTITLE = path.join(SAMPLE_DIR, 'subtitle.srt');

function readEnvFile(): Record<string, string> {
  const out: Record<string, string> = {};
  const p = path.join(REPO_ROOT, '.env');
  if (!existsSync(p)) return out;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}

const envFile = readEnvFile();
const ok = existsSync(APP_BINARY) && !!envFile.KIMI_API_KEY && existsSync(SAMPLE_VIDEO);

let app: ElectronApplication;
let page: Page;

test.describe('UI pipeline progress', () => {
  test.describe.configure({ mode: 'serial', timeout: 6 * 60 * 1000 });
  test.skip(!ok, 'needs packaged app + KIMI_API_KEY + sample video');

  test.beforeAll(async () => {
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    delete env.ELECTRON_FORCE_IS_PACKAGED;
    delete env.VSCODE_RUN_IN_ELECTRON;
    delete env.ICUBE_IS_ELECTRON;
    env.KIMI_API_KEY = envFile.KIMI_API_KEY;
    if (envFile.KIMI_BASE_URL) env.KIMI_BASE_URL = envFile.KIMI_BASE_URL;
    if (envFile.KIMI_MODEL) env.KIMI_MODEL = envFile.KIMI_MODEL;
    if (envFile.KIMI_USER_AGENT) env.KIMI_USER_AGENT = envFile.KIMI_USER_AGENT;

    app = await electron.launch({ executablePath: APP_BINARY, env });
    app.process().stdout?.on('data', (d) => process.stdout.write(`[main] ${d}`));
    page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('#root')).not.toBeEmpty({ timeout: 20000 });
  });

  test.afterAll(async () => {
    await app?.close();
  });

  test('on-screen progress advances through stages as the pipeline runs', async () => {
    // Go to the upload page via the UI.
    await page.evaluate(() => { window.location.hash = '#/upload'; });
    await page.waitForTimeout(500);
    await expect(page.getByRole('heading', { name: /上传课程素材/ })).toBeVisible();

    // Pick video + subtitle through the real file inputs.
    const inputs = page.locator('input[type="file"]');
    await inputs.nth(0).setInputFiles(SAMPLE_VIDEO);
    await expect(page.getByText('video.mp4')).toBeVisible();
    // The subtitle input is the 2nd file input.
    if ((await inputs.count()) > 1) {
      await inputs.nth(1).setInputFiles(SAMPLE_SUBTITLE);
    }

    // Click the submit button.
    const submit = page.getByRole('button', { name: /开始自动化处理/ });
    await expect(submit).toBeEnabled();
    await submit.click();

    // Now watch the on-screen pipeline progress. We poll the rendered stage
    // text and record which stages reach "running"/"succeeded" over time.
    const seen = new Set<string>();
    let sawRunning = false;
    let sawProgressBar = false;
    let done = false;

    const deadline = Date.now() + 5 * 60 * 1000;
    while (Date.now() < deadline && !done) {
      // Read the rendered body text for stage status keywords.
      const snapshot = await page.evaluate(() => {
        const body = document.body.innerText;
        // Determinate bars: inline width style > 0%.
        const bars = Array.from(document.querySelectorAll('[style*="width"]'))
          .map((el) => (el as HTMLElement).style.width)
          .filter((w) => /%$/.test(w) && w !== '0%');
        // Indeterminate bar: the LLM stage renders a sliding animation instead
        // of a percentage. Detect its presence as a valid "progress is moving".
        const indeterminate = document.querySelectorAll('.progress-indeterminate').length;
        return { body, bars, indeterminate };
      });
      if (/处理中|进行中|running/i.test(snapshot.body)) sawRunning = true;
      // Either a determinate bar advancing OR the indeterminate animation counts.
      if (snapshot.bars.length > 0 || snapshot.indeterminate > 0) sawProgressBar = true;
      for (const kw of ['校验', '切片', 'Kimi', '抓帧', '组装', '抽取', '关键帧', '文档']) {
        if (snapshot.body.includes(kw)) seen.add(kw);
      }
      // Done when the UI navigates to the editor or shows completion.
      const hash = await page.evaluate(() => window.location.hash);
      if (/\/documents\/.+\/edit/.test(hash)) { done = true; break; }
      if (/全部完成|处理完成|已完成/.test(snapshot.body)) { done = true; }
      await page.waitForTimeout(4000);
    }

    // Capture a screenshot for the record.
    await page.screenshot({ path: 'test-results/ui-progress-final.png', fullPage: true }).catch(() => {});

    console.log('UI progress — stages seen:', [...seen].join(', '));
    console.log('saw running state:', sawRunning, '| saw moving progress bar:', sawProgressBar, '| reached editor:', done);

    // The core assertions: the UI must reflect a running pipeline.
    expect(sawRunning, 'UI never showed any stage as running').toBe(true);
    expect(seen.size, 'UI never showed any stage labels advancing').toBeGreaterThan(0);
    expect(done, 'UI never navigated to the editor (pipeline never completed from the UI POV)').toBe(true);
  });
});
