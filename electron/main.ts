import { app, BrowserWindow, ipcMain, dialog, protocol, net } from 'electron';
import path from 'node:path';
import http from 'node:http';
import fs from 'node:fs';
import { Readable } from 'node:stream';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawn } from 'node:child_process';
import { setupAutoUpdater } from './auto-updater.js';
import { mimeFor, planRange } from './file-range.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// NOTE: protocol.registerSchemesAsPrivileged for the `app://` scheme runs in
// bootstrap.cjs BEFORE this module is dynamically imported — it must happen
// before app `ready`, which the async import() here can't guarantee. We only
// register the protocol *handler* (protocol.handle) below, inside whenReady.

// ─── Paths ───────────────────────────────────────────────────────────

/**
 * In dev mode (npm run dev:electron) the server source is in ../server/src.
 * In production the server is an esbuild bundle at ../server/dist/index.js
 * (shipped unpacked from the asar so Node can read it + its native deps).
 */
const isDev = !app.isPackaged;

const SERVER_PORT = 4000;

// __dirname is electron/dist/, so the repo/app root is two levels up.
// In production the server bundle is in app.asar.unpacked (asarUnpack), so we
// rewrite the asar path — a child node process can't execute from inside asar.
const serverEntry = isDev
  ? path.resolve(__dirname, '../../server/src/index.ts')
  : path.resolve(__dirname, '../../server/dist/index.js').replace('app.asar', 'app.asar.unpacked');

// preload.cts compiles to preload.cjs (CommonJS). Electron loads preload
// scripts as CommonJS — an ESM preload.js (the old name under "type":"module")
// throws "Cannot use import statement outside a module" and the preload never
// runs. Must match the build output exactly.
const preloadPath = path.resolve(__dirname, 'preload.cjs');

const webUrl = isDev ? 'http://localhost:5173' : 'app://renderer/index.html';

// Filesystem root the app:// handler serves from (the built web assets).
const webRoot = path.resolve(__dirname, '../../web/dist');

// Data dir for uploaded/generated files (must match DATA_DIR passed to the
// spawned server below). app:// serves /files/* directly from here so images
// load as same-origin app:// resources — no cross-origin http://127.0.0.1, no
// Chromium ORB blocking. Lazily resolved (app.getPath needs app ready).
function dataRoot(): string {
  return path.join(app.getPath('userData'), 'data');
}

/**
 * Serve a file from disk over app:// with HTTP Range support.
 *
 * Images load fine as one buffered blob, but <video> needs partial content:
 * the element issues `Range: bytes=...` to read metadata and to seek. Without a
 * 206 + Content-Range response it can't determine duration (seekable.end()===0)
 * and the floating player fails to load — Electron's net.fetch(file://) doesn't
 * reliably honor Range here (electron#38749), so we handle it ourselves.
 *
 * The byte-window/header math lives in ./file-range (planRange) so it can be
 * unit tested without importing electron; this function just does the fs/stream
 * wiring around it.
 */
function serveFileWithRange(fp: string, rangeHeader: string | null): Response {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(fp);
  } catch {
    return new Response('Not Found', { status: 404 });
  }
  const plan = planRange(stat.size, mimeFor(fp), rangeHeader);
  if (plan.status === 416) {
    return new Response('Range Not Satisfiable', { status: 416, headers: plan.headers });
  }
  const stream =
    plan.status === 206
      ? fs.createReadStream(fp, { start: plan.start, end: plan.end })
      : fs.createReadStream(fp);
  return new Response(Readable.toWeb(stream) as unknown as ReadableStream, {
    status: plan.status,
    headers: plan.headers,
  });
}

// ─── Server child process ────────────────────────────────────────────

let serverProcess: ReturnType<typeof spawn> | null = null;

function startServer(): void {
  // Run the server with Electron's bundled Node via ELECTRON_RUN_AS_NODE.
  // The server bundle never imports `electron`, so the CJS/ESM interop
  // crash that hits `import {app} from 'electron'` under this mode does
  // not apply.  Using Electron's Node keeps native modules (better-sqlite3,
  // sharp) on the same ABI electron-rebuild compiled them for.
  const nodePath = process.execPath;
  const args = isDev ? ['--import', 'tsx', serverEntry] : [serverEntry];

  console.log(`[electron] Starting server: ${nodePath} ${args.join(' ')}`);
  console.log(`[electron] Server entry: ${serverEntry}`);
  console.log(`[electron] isDev: ${isDev}, isPackaged: ${app.isPackaged}`);

  serverProcess = spawn(nodePath, args, {
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      DATA_DIR: path.join(app.getPath('userData'), 'data'),
      PORT: String(SERVER_PORT),
      ELECTRON_MODE: 'true',
      // The spawned server is a plain Node child — it has no process.resourcesPath.
      // Pass it through so the server can locate the bundled ffmpeg/ffprobe under
      // resources/bin/. Without this the server falls back to PATH and crashes on
      // machines that don't have ffmpeg installed globally (i.e. real users).
      ELECTRON_RESOURCES_PATH: process.resourcesPath,
    },
    stdio: 'pipe',
    detached: false,
  });

  serverProcess.stdout?.on('data', (data: Buffer) => {
    console.log(`[server] ${data.toString().trim()}`);
  });

  serverProcess.stderr?.on('data', (data: Buffer) => {
    console.error(`[server] ${data.toString().trim()}`);
  });

  serverProcess.on('error', (err) => {
    console.error('[electron] Server spawn error:', err);
  });

  serverProcess.on('exit', (code) => {
    console.log(`[server] exited with code ${code}`);
    serverProcess = null;
  });
}

function stopServer(): void {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
}

/**
 * Poll the server's /api/health until it responds, so we don't load the
 * renderer (which immediately fires API calls) before the server is up.
 */
function waitForServer(timeoutMs = 15000): Promise<boolean> {
  const start = Date.now();
  return new Promise((resolve) => {
    const tryOnce = () => {
      const req = http.get(
        { host: '127.0.0.1', port: SERVER_PORT, path: '/api/health', timeout: 1000 },
        (res) => {
          res.resume();
          if (res.statusCode === 200) {
            resolve(true);
          } else {
            retry();
          }
        },
      );
      req.on('error', retry);
      req.on('timeout', () => {
        req.destroy();
        retry();
      });
    };
    const retry = () => {
      if (Date.now() - start > timeoutMs) {
        console.error('[electron] Server did not become ready in time');
        resolve(false);
        return;
      }
      setTimeout(tryOnce, 300);
    };
    tryOnce();
  });
}

// ─── Window ──────────────────────────────────────────────────────────

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Surface renderer load failures to the main-process log instead of failing
  // silently to a blank window.
  mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error(`[electron] did-fail-load code=${code} desc=${desc} url=${url}`);
  });
  mainWindow.loadURL(webUrl);

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ─── App lifecycle ───────────────────────────────────────────────────

app.whenReady().then(async () => {
  // Serve the built renderer over app://. Map app://renderer/<path> to a file
  // under web/dist. SPA deep links use HashRouter, so non-asset paths still
  // resolve to a real file here; no index.html fallback is needed.
  if (!isDev) {
    protocol.handle('app', (request) => {
      const { pathname, search } = new URL(request.url);
      // /files/* — serve uploaded/generated files DIRECTLY from disk over app://
      // (same-origin). Going through http://127.0.0.1 made <img> loads cross-
      // origin, which Chromium ORB blocks (ERR_BLOCKED_BY_ORB → broken images),
      // and no amount of CORS/CORP headers reliably satisfied ORB. Reading the
      // file as an app:// resource sidesteps the whole cross-origin question.
      if (pathname.startsWith('/files/')) {
        const rel = decodeURIComponent(pathname.slice('/files/'.length));
        const fp = path.join(dataRoot(), rel);
        if (!fp.startsWith(dataRoot())) {
          return new Response('Forbidden', { status: 403 });
        }
        // Serve from disk with Range support so <video> can load + seek.
        return serveFileWithRange(fp, request.headers.get('range'));
      }
      // /api/* — proxy to the local server (these are fetch() calls; CORS is
      // already configured, and they don't hit ORB the way <img> does).
      if (pathname.startsWith('/api/')) {
        return net.fetch(`http://127.0.0.1:${SERVER_PORT}${pathname}${search}`, {
          method: request.method,
          headers: request.headers,
          body: request.body,
          // @ts-expect-error duplex is required by Node fetch when streaming a body
          duplex: 'half',
        });
      }
      // Everything else is a built renderer asset under web/dist.
      const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
      const filePath = path.join(webRoot, rel);
      // Guard against path traversal escaping webRoot.
      if (!filePath.startsWith(webRoot)) {
        return new Response('Forbidden', { status: 403 });
      }
      return net.fetch(pathToFileURL(filePath).toString());
    });
  }

  // Only auto-start the built-in server in production.
  // In dev the user runs `npm run dev:server` separately.
  if (!isDev) {
    startServer();
    await waitForServer();
  }

  createWindow();
  setupAutoUpdater();

  app.on('activate', () => {
    if (mainWindow === null) createWindow();
  });
});

app.on('window-all-closed', () => {
  stopServer();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  stopServer();
});

// ─── IPC ─────────────────────────────────────────────────────────────

ipcMain.handle('electron:get-path', (_event, name: string) => {
  return app.getPath(name as any);
});

ipcMain.handle('electron:show-open-dialog', async (_event, options) => {
  if (!mainWindow) return { canceled: true, filePaths: [] };
  const result = await dialog.showOpenDialog(mainWindow, options);
  return result;
});

ipcMain.handle('electron:show-save-dialog', async (_event, options) => {
  if (!mainWindow) return { canceled: true, filePath: undefined };
  const result = await dialog.showSaveDialog(mainWindow, options);
  return result;
});
