// CommonJS bootstrap entry. Electron loads this first so that any import-time
// failure in the ESM main process (main.js) gets written to a crash log
// instead of silently exiting with code 0.
//
// The crash log lands in the app's userData dir (writable in a packaged .app),
// not cwd which may be read-only.

// CRITICAL: some host environments (VSCode / Trae / Electron-based IDEs) export
// ELECTRON_RUN_AS_NODE=1 into the shell. Inherited by our app, it makes Electron
// run as plain Node — no GUI, no `app` lifecycle — so the process runs this entry
// script and exits 0 with no window. Strip it (and friends) before anything else.
// main.ts re-sets ELECTRON_RUN_AS_NODE=1 explicitly on the server child's env, so
// removing it from this process does not affect the spawned server.
delete process.env.ELECTRON_RUN_AS_NODE;
delete process.env.ELECTRON_FORCE_IS_PACKAGED;

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

// Register the privileged app:// scheme synchronously, BEFORE the dynamic
// import below. registerSchemesAsPrivileged must run before app `ready`, and
// the dynamic import() of main.js is async — by the time main.js evaluates,
// Electron may already be ready, so registering there throws. Doing it here in
// CJS guarantees it runs first. (`require('electron')` is reliable at this
// point; only the very-early logging above avoids it.)
try {
  const { protocol } = require('electron');
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'app',
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        // <video>/<audio> expect the protocol to stream + honor Range requests.
        // Without `stream: true` the element treats the response as a single
        // buffered blob: seeking breaks (video.seekable.end()===0) and the
        // floating player fails to load metadata. See electron#38749.
        stream: true,
      },
    },
  ]);
} catch (err) {
  log(err);
}

// Load the real ESM main process. Any import-time error is caught + logged.
import(path.join(__dirname, 'main.js')).catch(log);
