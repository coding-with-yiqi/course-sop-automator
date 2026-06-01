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
import { execSync } from 'node:child_process';

const PLATFORM = process.platform;
const ARCH = process.arch;
const OUT_DIR = path.resolve('bin', `${PLATFORM}-${ARCH}`);

const DOWNLOAD_URLS = {
  'darwin-arm64': {
    ffmpeg: 'https://evermeet.cx/ffmpeg/getrelease/ffmpeg/zip',
    ffprobe: 'https://evermeet.cx/ffmpeg/getrelease/ffprobe/zip',
  },
  'darwin-x64': {
    ffmpeg: 'https://evermeet.cx/ffmpeg/getrelease/ffmpeg/zip',
    ffprobe: 'https://evermeet.cx/ffmpeg/getrelease/ffprobe/zip',
  },
  'win32-x64': {
    url: 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip',
    extractPattern: /^ffmpeg-.*-win64-gpl\\/bin\\/(ffmpeg\.exe|ffprobe\.exe)$/,
  },
  'linux-x64': {
    url: 'https://github.com/BtbN/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-linux64-gpl.tar.xz',
    extractPattern: /^ffmpeg-.*-linux64-gpl\\/bin\\/(ffmpeg|ffprobe)$/,
  },
};

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
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
    // Download individual zip files for macOS
    for (const [name, url] of Object.entries(urls)) {
      const zipPath = path.join(OUT_DIR, `${name}.zip`);
      console.log(`Downloading ${name} for ${key}...`);
      await download(url, zipPath);

      console.log(`Extracting ${name}...`);
      execSync(`unzip -o -j "${zipPath}" -d "${OUT_DIR}"`, { stdio: 'inherit' });
      fs.unlinkSync(zipPath);

      // Make executable
      const binPath = path.join(OUT_DIR, name);
      fs.chmodSync(binPath, 0o755);
      console.log(`✓ ${name} ready: ${binPath}`);
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
