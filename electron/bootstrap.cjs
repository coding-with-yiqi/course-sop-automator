// CommonJS bootstrap entry. Electron loads this first so that any import-time
// failure in the ESM main process (main.js) gets written to a crash log
// instead of silently exiting with code 0.
//
// The crash log lands in the app's userData dir (writable in a packaged .app),
// not cwd which may be read-only.

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

function crashLogPath() {
  // Mirror the userData location electron uses, without importing electron
  // (which isn't available this early in a reliable way for logging).
  const home = os.homedir();
  if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', 'course-sop-automator', 'electron-crash.log');
  }
  if (process.platform === 'win32') {
    return path.join(home, 'AppData', 'Roaming', 'course-sop-automator', 'electron-crash.log');
  }
  return path.join(home, '.config', 'course-sop-automator', 'electron-crash.log');
}

function log(err) {
  try {
    const file = crashLogPath();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, `[${new Date().toISOString()}] ${(err && err.stack) || err}\n`);
  } catch {
    // last resort — write to stderr
    console.error('[bootstrap] crash:', err);
  }
}

process.on('uncaughtException', log);
process.on('unhandledRejection', log);

// Load the real ESM main process. Any import-time error is caught + logged.
import(path.join(__dirname, 'main.js')).catch(log);
