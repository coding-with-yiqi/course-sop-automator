import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { setupAutoUpdater } from './auto-updater.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Paths ───────────────────────────────────────────────────────────

/**
 * In dev mode (npm run dev:electron) the server source is in ../server/src.
 * In production the server bundle is in ../server/dist alongside the Electron
 * build output.
 */
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

const serverEntry = isDev
  ? path.resolve(__dirname, '../server/src/index.ts')
  : path.resolve(__dirname, '../server/dist/index.js');

const preloadPath = path.resolve(__dirname, 'preload.mjs');

const webUrl = isDev
  ? 'http://localhost:5173'
  : `file://${path.resolve(__dirname, '../web/dist/index.html')}`;

// ─── Server child process ────────────────────────────────────────────

let serverProcess: ReturnType<typeof spawn> | null = null;

function startServer(): void {
  const nodePath = process.execPath;
  const args = isDev ? ['--import', 'tsx', serverEntry] : [serverEntry];

  serverProcess = spawn(nodePath, args, {
    env: {
      ...process.env,
      DATA_DIR: path.join(app.getPath('userData'), 'data'),
      PORT: '4000',
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

app.whenReady().then(() => {
  // Only auto-start the built-in server in production.
  // In dev the user runs `npm run dev:server` separately.
  if (!isDev) {
    startServer();
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
