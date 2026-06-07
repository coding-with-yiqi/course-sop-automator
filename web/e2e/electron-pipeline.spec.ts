import { test, expect, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

/**
 * REAL end-to-end pipeline test against the packaged Electron app.
 *
 * Unlike electron-app.spec.ts (which only checks that UI elements render), this
 * actually SUBMITS a real video + subtitle and asserts the whole pipeline runs
 * to completion: ingest → chunk → llm (real Kimi call) → frames (real ffmpeg) →
 * assemble → a document with steps → an exported HTML file.
 *
 * Requirements (test is skipped if unmet):
 *  - A built app at release/mac-arm64.
 *  - KIMI_API_KEY in repo-root .env (the llm stage is a hard dependency).
 *  - A small real sample under server/data/uploads (video.mp4 + subtitle.srt).
 *
 * The Kimi key is injected into the app's env so the spawned server can see it
 * (the packaged server's dotenv path doesn't resolve to the repo .env).
 */

const APP_BINARY = path.resolve(
  REPO_ROOT,
  'release/mac-arm64/Course SOP Automator.app/Contents/MacOS/Course SOP Automator',
);

// Smallest real sample = fastest pipeline run.
const SAMPLE_DIR = path.join(REPO_ROOT, 'server/data/uploads/task_me9ftluwHkWc');
const SAMPLE_VIDEO = path.join(SAMPLE_DIR, 'video.mp4');
const SAMPLE_SUBTITLE = path.join(SAMPLE_DIR, 'subtitle.srt');

/** Read KIMI_* from repo-root .env without adding a dotenv dependency. */
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
const hasKey = !!envFile.KIMI_API_KEY;
const hasApp = existsSync(APP_BINARY);
const hasSample = existsSync(SAMPLE_VIDEO) && existsSync(SAMPLE_SUBTITLE);

let app: ElectronApplication;
let page: Page;

test.describe('REAL pipeline (submit video → HTML)', () => {
  // A full pipeline run (real Kimi + ffmpeg) can take a while.
  test.describe.configure({ mode: 'serial', timeout: 5 * 60 * 1000 });

  test.skip(!hasApp, 'packaged app not found — run npm run dist:mac');
  test.skip(!hasKey, 'KIMI_API_KEY not in .env — llm stage cannot run');
  test.skip(!hasSample, 'no sample video/subtitle under server/data/uploads');

  test.beforeAll(async () => {
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    delete env.ELECTRON_FORCE_IS_PACKAGED;
    delete env.VSCODE_RUN_IN_ELECTRON;
    delete env.ICUBE_IS_ELECTRON;
    // Inject the Kimi key so the spawned server picks it up via process.env.
    env.KIMI_API_KEY = envFile.KIMI_API_KEY;
    if (envFile.KIMI_BASE_URL) env.KIMI_BASE_URL = envFile.KIMI_BASE_URL;
    if (envFile.KIMI_MODEL) env.KIMI_MODEL = envFile.KIMI_MODEL;
    if (envFile.KIMI_USER_AGENT) env.KIMI_USER_AGENT = envFile.KIMI_USER_AGENT;

    app = await electron.launch({ executablePath: APP_BINARY, env });

    // Capture the main process stdout/stderr — main.ts forwards the bundled
    // server's logs there, including the full stack of any pipeline failure.
    app.process().stdout?.on('data', (d) => process.stdout.write(`[main] ${d}`));
    app.process().stderr?.on('data', (d) => process.stdout.write(`[main:err] ${d}`));

    page = await app.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    await expect(page.locator('#root')).not.toBeEmpty({ timeout: 20000 });
  });

  test.afterAll(async () => {
    await app?.close();
  });

  test('server sees the injected Kimi key (llm: ok)', async () => {
    const health = await page.evaluate(async () => {
      const res = await fetch('http://127.0.0.1:4000/api/health');
      return res.json();
    });
    expect(health.ok).toBe(true);
    expect(health.data.llm).toBe('ok');
  });

  test('submitting a real video runs the full pipeline to a document with steps', async () => {
    // Drive the API directly from the renderer (same-origin to the bundled
    // server). We read the sample files inside the renderer via fetch over the
    // app:// origin is not possible, so we pass the bytes in from Node.
    const videoBytes = Array.from(readFileSync(SAMPLE_VIDEO));
    const subtitleText = readFileSync(SAMPLE_SUBTITLE, 'utf8');

    // 1) Create the task (multipart) and get its id.
    const taskId = await page.evaluate(
      async ({ vbytes, sub }) => {
        const fd = new FormData();
        fd.append('title', 'E2E 真实管线测试');
        fd.append('granularity', 'coarse');
        fd.append(
          'video',
          new File([new Uint8Array(vbytes)], 'video.mp4', { type: 'video/mp4' }),
        );
        fd.append(
          'subtitle',
          new File([sub], 'subtitle.srt', { type: 'application/x-subrip' }),
        );
        const res = await fetch('http://127.0.0.1:4000/api/tasks', {
          method: 'POST',
          body: fd,
        });
        const json = await res.json();
        if (!json.ok) throw new Error('createTask failed: ' + JSON.stringify(json));
        return json.data.taskId as string;
      },
      { vbytes: videoBytes, sub: subtitleText },
    );
    expect(taskId).toBeTruthy();

    // 2) Poll the task until it succeeds or fails. This is the real pipeline:
    //    ingest → chunk → llm (Kimi) → frames (ffmpeg) → assemble.
    const final = await page.evaluate(async (id) => {
      const deadline = Date.now() + 4 * 60 * 1000;
      // NOTE: Date.now() runs in the renderer, which is allowed (this is page
      // context, not the workflow sandbox).
      while (Date.now() < deadline) {
        const res = await fetch(`http://127.0.0.1:4000/api/tasks/${id}`);
        const json = await res.json();
        const task = json.data?.task;
        if (task?.status === 'succeeded' || task?.status === 'failed') {
          return task;
        }
        await new Promise((r) => setTimeout(r, 2000));
      }
      return { status: 'timeout' };
    }, taskId);

    if (final.status !== 'succeeded') {
      throw new Error(
        `pipeline did not succeed: status=${final.status} error=${JSON.stringify(final.errorJson ?? final.error ?? null)}`,
      );
    }
    expect(final.status).toBe('succeeded');

    // 3) Fetch the produced document and assert it has real steps.
    const doc = await page.evaluate(async (id) => {
      const res = await fetch(`http://127.0.0.1:4000/api/documents/${id}`);
      const json = await res.json();
      return json.data?.document;
    }, final.documentId ?? taskId);

    expect(doc).toBeTruthy();
    expect(Array.isArray(doc.steps)).toBe(true);
    expect(doc.steps.length).toBeGreaterThan(0);
    // Each step should have a title (the LLM restructured the transcript).
    expect(doc.steps[0].title).toBeTruthy();

    // 4) Export to HTML — the core deliverable — and verify it's a real file.
    const exported = await page.evaluate(async (id) => {
      const res = await fetch(`http://127.0.0.1:4000/api/documents/${id}/export/html`, {
        method: 'POST',
      });
      const json = await res.json();
      return json.data;
    }, doc.id);

    expect(exported?.downloadUrl).toBeTruthy();
    expect(exported.fileName).toMatch(/\.html$/);

    // 5) Download the HTML and sanity-check its contents.
    const html = await page.evaluate(async (url) => {
      const res = await fetch('http://127.0.0.1:4000' + url);
      return res.text();
    }, exported.downloadUrl);

    expect(html).toContain('<html');
    // Code blocks must be wrapped in <pre><code> per the product spec; at minimum
    // the first step's title should appear in the rendered document.
    expect(html).toContain(doc.steps[0].title);
  });
});
