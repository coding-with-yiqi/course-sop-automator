#!/usr/bin/env node
/**
 * Download platform-specific FFmpeg binaries for Electron bundling.
 *
 * Usage:
 *   node scripts/download-ffmpeg.js
 *
 * This downloads ffmpeg + ffprobe from evermeet.cx (macOS) or
 * BtbN builds (Windows/Linux) into bin/<platform>-<arch>/.
 *
 * Only run this when preparing a release — the downloaded binaries
 * are gitignored and bundled by electron-builder via extraResources.
 */

import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';

const PLATFORM = process.platform;
// Allow overriding the target arch so a release machine can fetch binaries for
// an arch it isn't running on (e.g. a Rosetta x64 node fetching native arm64
// builds, or a CI runner producing both). Downloading is arch-agnostic; we only
// need the right URL/output dir. Falls back to the host arch.
const ARCH = process.env.TARGET_ARCH || process.arch;
const OUT_DIR = path.resolve('bin', `${PLATFORM}-${ARCH}`);

const DOWNLOAD_URLS = {
  // evermeet.cx explicitly does NOT build Apple Silicon binaries ("I do not plan
  // to provide native ffmpeg binaries for Apple Silicon ARM") — its downloads are
  // x86_64 only. For arm64 we use osxexperts.net, which publishes native arm64
  // STATIC builds (self-contained, no external dylib deps). A dynamically-linked
  // ffmpeg copied from a dev machine's Homebrew (the old bug) loads fine locally
  // but dies on a clean machine that lacks the libav*.dylib it links against.
  'darwin-arm64': {
    ffmpeg: 'https://www.osxexperts.net/ffmpeg81arm.zip',
    ffprobe: 'https://www.osxexperts.net/ffprobe81arm.zip',
    // Verified by downloading + `shasum -a 256` on 2026-06-07. osxexperts
    // rebuilt 8.1 since this URL was first published, so the hashes float with
    // the build. If a future rebuild trips the check, re-verify the file is a
    // real arm64 static Mach-O before bumping these (don't blindly update).
    sha256: {
      ffmpeg: 'ebb82529562b71170807bbc6b0e7eb4f0b13af8cbb0e085bb9e8f6fe709598ad',
      ffprobe: 'a6640a77d38a6f0527c5b597e599cb36a3427a6931444ed80bc62542421950a1',
    },
  },
  'darwin-x64': {
    ffmpeg: 'https://evermeet.cx/ffmpeg/getrelease/ffmpeg/zip',
    ffprobe: 'https://evermeet.cx/ffmpeg/getrelease/ffprobe/zip',
  },
  'win32-x64': {
    url: 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip',
    extractPattern: /^ffmpeg-.*-win64-gpl\/bin\/(ffmpeg\.exe|ffprobe\.exe)$/,
  },
  'linux-x64': {
    url: 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linux64-gpl.tar.xz',
    extractPattern: /^ffmpeg-.*-linux64-gpl\/bin\/(ffmpeg|ffprobe)$/,
  },
};

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

/**
 * macOS gatekeeper trips on downloaded, unsigned binaries: it quarantines them
 * and refuses to run an unsigned Mach-O on Apple Silicon. Strip the quarantine
 * flag and ad-hoc sign so the bundled ffmpeg actually launches on a clean
 * machine (otherwise execa('ffmpeg') silently fails → server self-exits).
 */
function prepareMacBinary(binPath) {
  try {
    execSync(`xattr -dr com.apple.quarantine "${binPath}"`, { stdio: 'ignore' });
  } catch {
    /* no quarantine attr present — fine */
  }
  execSync(`codesign --force --sign - "${binPath}"`, { stdio: 'inherit' });
}

/** Sanity-check the binary is a native arm64 static build that actually runs. */
function verifyMacBinary(binPath, expectArch) {
  const fileOut = execSync(`file "${binPath}"`).toString();
  if (!fileOut.includes(expectArch)) {
    throw new Error(
      `Arch mismatch for ${binPath}: expected ${expectArch}, got: ${fileOut.trim()}`,
    );
  }
  // Static builds have no @rpath/Cellar dylib deps. otool -L on a static ffmpeg
  // lists only /usr/lib/libSystem + system frameworks. A Homebrew dynamic build
  // would list /usr/local/.../libav*.dylib — the exact bug we're fixing.
  const otool = execSync(`otool -L "${binPath}"`).toString();
  if (/Cellar|libav(codec|format|util|filter)/.test(otool)) {
    throw new Error(
      `${binPath} links external dylibs (not static) — would break on a clean machine:\n${otool}`,
    );
  }
  // It must actually run.
  execSync(`"${binPath}" -version`, { stdio: 'ignore' });
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, { redirect: 'follow' }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        fs.unlinkSync(dest);
        download(res.headers.location, dest).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}: ${url}`));
        return;
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', (err) => {
      fs.unlinkSync(dest);
      reject(err);
    });
  });
}

async function main() {
  const key = `${PLATFORM}-${ARCH}`;
  const urls = DOWNLOAD_URLS[key];

  if (!urls) {
    console.error(`Unsupported platform: ${key}`);
    console.error('Supported: darwin-arm64, darwin-x64, win32-x64, linux-x64');
    process.exit(1);
  }

  ensureDir(OUT_DIR);

  if (PLATFORM === 'darwin') {
    const expectArch = ARCH === 'arm64' ? 'arm64' : 'x86_64';
    // Download individual zip files for macOS (skip the non-URL `sha256` key)
    for (const name of ['ffmpeg', 'ffprobe']) {
      const url = urls[name];
      const zipPath = path.join(OUT_DIR, `${name}.zip`);
      console.log(`Downloading ${name} for ${key}...`);
      await download(url, zipPath);

      // Verify download integrity against the known SHA256 (when provided).
      if (urls.sha256?.[name]) {
        const got = sha256(zipPath);
        if (got !== urls.sha256[name]) {
          fs.unlinkSync(zipPath);
          throw new Error(
            `SHA256 mismatch for ${name}.zip\n  expected ${urls.sha256[name]}\n  got      ${got}`,
          );
        }
        console.log(`  ✓ sha256 verified`);
      }

      console.log(`Extracting ${name}...`);
      execSync(`unzip -o -j "${zipPath}" -d "${OUT_DIR}"`, { stdio: 'inherit' });
      fs.unlinkSync(zipPath);

      const binPath = path.join(OUT_DIR, name);
      fs.chmodSync(binPath, 0o755);
      prepareMacBinary(binPath);
      verifyMacBinary(binPath, expectArch);
      console.log(`✓ ${name} ready (${expectArch}, static, signed): ${binPath}`);
    }
  } else {
    // Windows / Linux: single archive with both binaries
    const isWin = PLATFORM === 'win32';
    const archiveName = isWin ? 'ffmpeg.zip' : 'ffmpeg.tar.xz';
    const archivePath = path.join(OUT_DIR, archiveName);

    console.log(`Downloading FFmpeg for ${key}...`);
    await download(urls.url, archivePath);

    console.log('Extracting...');
    const extractDir = path.join(OUT_DIR, '_extract');
    ensureDir(extractDir);

    if (isWin) {
      execSync(`unzip -o "${archivePath}" -d "${extractDir}"`, { stdio: 'inherit' });
    } else {
      execSync(`tar -xf "${archivePath}" -C "${extractDir}"`, { stdio: 'inherit' });
    }

    // Find and copy binaries
    const pattern = urls.extractPattern;
    function findAndCopy(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          findAndCopy(fullPath);
        } else if (entry.name.match(/^(ffmpeg|ffprobe)(\.exe)?$/)) {
          const dest = path.join(OUT_DIR, entry.name);
          fs.copyFileSync(fullPath, dest);
          if (!isWin) fs.chmodSync(dest, 0o755);
          console.log(`✓ ${entry.name} ready: ${dest}`);
        }
      }
    }
    findAndCopy(extractDir);

    // Cleanup
    fs.rmSync(extractDir, { recursive: true, force: true });
    fs.unlinkSync(archivePath);
  }

  console.log(`\n✅ FFmpeg binaries ready in: ${OUT_DIR}`);
  console.log('These will be bundled by electron-builder via extraResources.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
