import { app, dialog } from 'electron';
import { autoUpdater } from 'electron-updater';
import { log } from './log.js';

/**
 * Auto-updater setup for Course SOP Automator.
 *
 * In production, electron-builder publishes update metadata to a GitHub
 * release (or generic server).  The app checks on launch and prompts the
 * user when an update is ready.
 *
 * Dev / unpackaged builds skip auto-update entirely.
 */

let initDone = false;

export function setupAutoUpdater(): void {
  if (initDone) return;
  initDone = true;

  if (!app.isPackaged) {
    log.info('Auto-updater skipped (dev mode)');
    return;
  }

  // electron-builder sets these automatically when publish is configured.
  // If you use a generic server instead of GitHub, set feedURL here.
  // autoUpdater.setFeedURL({ provider: 'generic', url: 'https://...' });

  autoUpdater.logger = log;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    log.info('Checking for update...');
  });

  autoUpdater.on('update-available', (info) => {
    log.info('Update available', info.version);
  });

  autoUpdater.on('update-not-available', () => {
    log.info('No update available');
  });

  autoUpdater.on('error', (err) => {
    log.error('Auto-updater error', err.message);
  });

  autoUpdater.on('update-downloaded', (info) => {
    log.info('Update downloaded', info.version);
    dialog
      .showMessageBox({
        type: 'info',
        title: '更新可用',
        message: `发现新版本 ${info.version}，是否立即安装并重启？`,
        buttons: ['立即安装', '稍后'],
        defaultId: 0,
      })
      .then(({ response }) => {
        if (response === 0) {
          autoUpdater.quitAndInstall();
        }
      });
  });

  // Check on launch (with a small delay so the window is already visible).
  setTimeout(() => {
    autoUpdater.checkForUpdatesAndNotify().catch((err) => {
      log.error('checkForUpdatesAndNotify failed', err.message);
    });
  }, 5000);
}
