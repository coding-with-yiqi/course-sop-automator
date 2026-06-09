import fs from 'node:fs';
import path from 'node:path';
import { log } from '../util/log.js';

const MODEL_NAME = 'ggml-small-q5_1.bin';
const EXPECTED_BYTES = 190_085_487; // verified 2026-06-08

const PRIMARY_URL =
  'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small-q5_1.bin';
const MIRROR_URL =
  'https://hf-mirror.com/ggerganov/whisper.cpp/resolve/main/ggml-small-q5_1.bin';

export function modelFilePath(modelsDir: string): string {
  return path.join(modelsDir, MODEL_NAME);
}

export function isModelReady(modelsDir: string): boolean {
  const p = modelFilePath(modelsDir);
  if (!fs.existsSync(p)) return false;
  const size = fs.statSync(p).size;
  return size >= EXPECTED_BYTES * 0.95;
}

export interface DownloadProgress {
  downloadedBytes: number;
  totalBytes: number;
  percent: number;
}

/**
 * Download the whisper model to modelsDir.
 * Reports progress via onProgress. Returns when complete.
 *
 * Uses Node's built-in fetch() instead of https.get because Electron's
 * bundled Node links BoringSSL (not OpenSSL) and https.get stalls on large
 * file streams — the TLS handshake succeeds but data events never fire.
 * fetch() uses a different HTTP stack and works reliably (verified 2026-06-08).
 *
 * Tries the primary URL first; on network failure falls back to a mirror.
 */
export async function downloadModel(
  modelsDir: string,
  onProgress?: (p: DownloadProgress) => void,
): Promise<void> {
  fs.mkdirSync(modelsDir, { recursive: true });
  const dest = modelFilePath(modelsDir);
  const tmp = `${dest}.tmp`;

  let lastReported = -1;
  const report = (downloaded: number, total: number) => {
    const pct = total > 0 ? Math.round((downloaded / total) * 100) : 0;
    if (pct !== lastReported && onProgress) {
      lastReported = pct;
      onProgress({ downloadedBytes: downloaded, totalBytes: total, percent: pct });
    }
  };

  async function tryFetch(url: string): Promise<void> {
    log.info({ url }, 'downloading whisper model');
    const res = await fetch(url, {
      headers: { 'User-Agent': 'sop-automator/1.0' },
      // Node fetch does NOT auto-follow redirects for non-GET? It does for GET.
      // But HuggingFace returns 302; let fetch handle it.
    });

    if (!res.ok || !res.body) {
      throw new Error(`模型下载失败: HTTP ${res.status}`);
    }

    const total = parseInt(res.headers.get('content-length') || '0', 10) || EXPECTED_BYTES;
    const file = fs.createWriteStream(tmp);
    const reader = res.body.getReader();
    let downloaded = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        file.write(value);
        downloaded += value.length;
        report(downloaded, total);
      }
    } finally {
      file.end();
      await new Promise<void>((resolve) => file.on('finish', resolve));
    }

    // sanity size check
    if (downloaded < EXPECTED_BYTES * 0.9) {
      fs.unlinkSync(tmp);
      throw new Error(`模型下载不完整: ${downloaded} bytes (期望 ~${EXPECTED_BYTES})`);
    }

    fs.renameSync(tmp, dest);
    log.info({ model: dest, size: downloaded }, 'whisper model downloaded');
  }

  try {
    await tryFetch(PRIMARY_URL);
  } catch (err) {
    const e = err as Error;
    log.error({ message: e.message }, 'primary URL failed, trying mirror');
    await tryFetch(MIRROR_URL);
  }
}
