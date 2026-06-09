#!/usr/bin/env node
/**
 * Build a STATIC, self-contained whisper.cpp CLI for Electron bundling.
 *
 * Usage:
 *   node scripts/build-whisper.js
 *
 * Why build instead of download (like ffmpeg)? There is no reliable source of
 * prebuilt static macOS whisper binaries — chasing one would repeat the ffmpeg
 * "dynamic shell from a dev machine" bug. So on the release machine we clone a
 * PINNED tag and compile with -DBUILD_SHARED_LIBS=OFF, which links all the ggml
 * libraries INTO the binary. The default build produces a whisper-cli that needs
 * @rpath/libggml*.dylib next to it; copied alone it dies on a clean machine.
 * (Verified 2026-06-08: default build → 5 @rpath dylib deps; static build → none.)
 *
 * Requires: git, cmake, Xcode command line tools (clang).
 * Output: bin/<platform>-<arch>/whisper-cli  (gitignored, bundled via extraResources)
 *
 * The model is NOT built or downloaded here — it ships on-demand to userData at
 * runtime (~190MB ggml-small-q5_1). This script only produces the engine.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';

// Pin the tag. whisper.cpp renamed the CLI (main -> whisper-cli) and shifts
// flags between releases; an unpinned clone would silently drift. Bumping this
// requires re-verifying the produced binary name + flags by hand.
const WHISPER_TAG = 'v1.7.4';
const REPO = 'https://github.com/ggerganov/whisper.cpp.git';

const PLATFORM = process.platform;
// process.arch reflects the Node binary's own arch (x64 under Rosetta), NOT the
// system arch. uname -m is also unreliable under Rosetta. On macOS the reliable
// signal is sysctl hw.optional.arm64 (1 = Apple Silicon, 0 = Intel).
function systemArch() {
  if (PLATFORM !== 'darwin') return process.arch;
  try {
    const arm64Capable = execSync('sysctl -n hw.optional.arm64').toString().trim();
    return arm64Capable === '1' ? 'arm64' : 'x64';
  } catch {
    return process.arch;
  }
}
const ARCH = process.env.TARGET_ARCH || systemArch();
const OUT_DIR = path.resolve('bin', `${PLATFORM}-${ARCH}`);
const BIN_NAME = PLATFORM === 'win32' ? 'whisper-cli.exe' : 'whisper-cli';

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/** De-quarantine + ad-hoc sign so the bundled engine launches on a clean Mac. */
function prepareMacBinary(binPath) {
  try {
    execSync(`xattr -dr com.apple.quarantine "${binPath}"`, { stdio: 'ignore' });
  } catch {
    /* no quarantine attr — fine */
  }
  execSync(`codesign --force --sign - "${binPath}"`, { stdio: 'inherit' });
}

/**
 * Verify the binary is the right arch, is truly static (no whisper/ggml dylib
 * deps that would be missing on another machine), and actually runs.
 *
 * Note: linking libc++ / libSystem / system frameworks (Metal, Accelerate) is
 * EXPECTED and fine — those exist on every Mac. We only reject bundled-but-not-
 * embedded ggml/whisper dylibs, which is the real "breaks elsewhere" failure.
 */
function verifyMacBinary(binPath, expectArch) {
  const fileOut = execSync(`file "${binPath}"`).toString();
  if (!fileOut.includes(expectArch)) {
    throw new Error(`Arch mismatch for ${binPath}: expected ${expectArch}, got: ${fileOut.trim()}`);
  }
  const otool = execSync(`otool -L "${binPath}"`).toString();
  if (/@rpath\/(libggml|libwhisper)|libggml.*\.dylib|libwhisper.*\.dylib|Cellar/.test(otool)) {
    throw new Error(
      `${binPath} links external whisper/ggml dylibs (not static) — would break on a clean machine:\n${otool}`,
    );
  }
  // -h prints help and exits 0 without needing a model.
  execSync(`"${binPath}" -h`, { stdio: 'ignore' });
}

function main() {
  if (PLATFORM !== 'darwin') {
    console.error(`build-whisper.js currently supports macOS only (got ${PLATFORM}).`);
    console.error('Windows/Linux whisper builds are out of scope for this release.');
    process.exit(1);
  }
  // Tools present?
  for (const tool of ['git', 'cmake', 'clang']) {
    try {
      execSync(`command -v ${tool}`, { stdio: 'ignore' });
    } catch {
      console.error(`Missing required tool: ${tool}. Install Xcode CLT + cmake.`);
      process.exit(1);
    }
  }

  const expectArch = ARCH === 'arm64' ? 'arm64' : 'x86_64';
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-build-'));
  console.log(`Building whisper.cpp ${WHISPER_TAG} (${expectArch}) in ${work}`);

  try {
    console.log('Cloning (shallow, pinned tag)...');
    execSync(`git clone --depth 1 --branch ${WHISPER_TAG} ${REPO} "${work}"`, { stdio: 'inherit' });

    console.log('Configuring (static)...');
    const cmakeArchFlag = PLATFORM === 'darwin' ? `-DCMAKE_OSX_ARCHITECTURES=${ARCH}` : '';
    execSync(
      `cmake -B "${work}/build" -S "${work}" -DCMAKE_BUILD_TYPE=Release ` +
        `${cmakeArchFlag} ` +
        `-DBUILD_SHARED_LIBS=OFF -DWHISPER_BUILD_SERVER=OFF -DWHISPER_BUILD_TESTS=OFF ` +
        `-DGGML_NATIVE=OFF`,
      { stdio: 'inherit' },
    );

    console.log('Building whisper-cli...');
    execSync(`cmake --build "${work}/build" --config Release --target whisper-cli -j`, {
      stdio: 'inherit',
    });

    const built = path.join(work, 'build', 'bin', BIN_NAME);
    if (!fs.existsSync(built)) {
      throw new Error(`Expected built binary not found: ${built}`);
    }

    ensureDir(OUT_DIR);
    const dest = path.join(OUT_DIR, BIN_NAME);
    fs.copyFileSync(built, dest);
    fs.chmodSync(dest, 0o755);
    prepareMacBinary(dest);
    verifyMacBinary(dest, expectArch);

    console.log(`\n✅ whisper-cli ready (${expectArch}, static, signed): ${dest}`);
    console.log('Bundled by electron-builder via extraResources. Model downloads on-demand at runtime.');
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

main();
