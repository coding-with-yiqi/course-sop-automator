import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { setupAutoUpdater } from './auto-updater.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

// tsc emits preload.js (not .mjs). Must match the build output exactly.
const preloadPath = path.resolve(__dirname, 'preload.js');

const webUrl = isDev
  ? 'http://localhost:5173'
  : `file://${path.resolve(__dirname, '../../web/dist/index.html')}`;

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
