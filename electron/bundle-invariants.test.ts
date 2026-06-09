import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}
function exists(rel: string): boolean {
  return fs.existsSync(path.join(root, rel));
}

// ── Source-level invariants (always present) ─────────────────────────────────
// These encode the *cause* of three packaging bugs so a future edit that
// reverts them fails loudly instead of only blowing up on a clean machine.

describe('preload must compile to CommonJS (page-blank bug)', () => {
  // preload.ts under "type":"module" compiled to ESM → Electron preload loads as
  // CJS → "Cannot use import statement outside a module" → preload dies → blank
  // page + electronAPI missing. Fix: preload.cts (forces .cjs CommonJS output).
  it('preload source is .cts, not .ts', () => {
    expect(exists('electron/preload.cts')).toBe(true);
    expect(exists('electron/preload.ts')).toBe(false);
  });
  it('tsconfig + main reference the .cjs output, never preload.js', () => {
    expect(read('electron/tsconfig.json')).toContain('preload.cts');
    const main = read('electron/main.ts');
    expect(main).toContain("'preload.cjs'");
    expect(main).not.toMatch(/preload\.js'/);
  });
});

describe('app:// protocol must enable streaming (video load bug)', () => {
  // Without stream:true, <video>/<audio> treat the response as one buffered blob
  // → seek breaks (seekable.end()===0), floating player fails to load metadata.
  it('bootstrap.cjs registers app scheme with stream: true', () => {
    const b = read('electron/bootstrap.cjs');
    expect(b).toContain("scheme: 'app'");
    expect(b).toMatch(/stream:\s*true/);
  });
});

describe('app:// /files handler must serve Range (video seek bug)', () => {
  // net.fetch(file://) doesn't reliably honor Range (electron#38749); the handler
  // must use our own Range-aware server, not a plain whole-file fetch.
  it('main.ts /files branch uses serveFileWithRange', () => {
    const main = read('electron/main.ts');
    expect(main).toContain('serveFileWithRange');
    // the /files branch must not have reverted to a plain net.fetch passthrough
    const filesBranch = main.slice(main.indexOf("startsWith('/files/')"));
    expect(filesBranch.slice(0, 400)).toContain('serveFileWithRange');
  });
});

// ── Built-artifact invariants (only when dist/ exists) ───────────────────────
// Verify the *compiled* output, since the bugs only manifest post-build. Guarded
// so a fresh checkout that hasn't run build:electron doesn't fail spuriously.

const hasDist = exists('electron/dist/preload.cjs') && exists('electron/dist/main.js');

describe.skipIf(!hasDist)('compiled electron artifacts', () => {
  it('preload.cjs is CommonJS (require, not top-level import)', () => {
    const js = read('electron/dist/preload.cjs');
    expect(js).toContain('require(');
    expect(js).not.toMatch(/^\s*import\s/m);
  });
  it('dist/bootstrap.cjs carries stream: true', () => {
    expect(read('electron/dist/bootstrap.cjs')).toMatch(/stream:\s*true/);
  });
  it('main.js contains the Range response logic', () => {
    const js = read('electron/dist/main.js');
    expect(js).toContain('Accept-Ranges');
    expect(js).toContain('Content-Range');
  });
});

// ── Bundled ffmpeg invariants (only when bin/ exists) ────────────────────────
// The big Bug 2: bin/darwin-arm64 shipped a dynamically-linked x86_64 ffmpeg
// (copied from dev Homebrew) → dies on a clean Apple-Silicon machine. Must be a
// native arm64, statically-linked binary that actually runs.

const arm64Ffmpeg = 'bin/darwin-arm64/ffmpeg';
const hasArmFfmpeg = process.platform === 'darwin' && exists(arm64Ffmpeg);

describe.skipIf(!hasArmFfmpeg)('bundled darwin-arm64 ffmpeg', () => {
  const abs = path.join(root, arm64Ffmpeg);

  it('is a native arm64 Mach-O (not x86_64)', () => {
    const out = execSync(`file "${abs}"`).toString();
    expect(out).toContain('arm64');
    expect(out).not.toContain('x86_64');
  });

  it('is statically linked (no Homebrew/libav dylib deps)', () => {
    const out = execSync(`otool -L "${abs}"`).toString();
    expect(out).not.toMatch(/Cellar|libav(codec|format|util|filter)/);
  });

  it('actually runs (-version exits 0)', () => {
    // throws on non-zero exit → test fails
    const out = execSync(`"${abs}" -version`).toString();
    expect(out).toMatch(/ffmpeg version/);
  });
});
