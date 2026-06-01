import { execa } from 'execa';
import path from 'node:path';
import fs from 'node:fs/promises';
import pLimit from 'p-limit';
import { log } from '../util/log.ts';
import { getFfmpegPaths } from './detect.ts';

const limit = pLimit(4);

export interface ExtractTarget {
  timestampSec: number;
  outPath: string;
}

/**
 * Single-frame seek. We use **input-level seek** (`-ss` before `-i`):
 * ffmpeg jumps to the nearest keyframe in O(1), instead of demuxing from
 * frame 0. For a 2h video the demux-from-zero variant takes minutes per
 * frame; for a 5min video it takes seconds. Trade-off: precision is
 * bounded by the GOP size (usually ±1-2s for educational content with
 * standard encoders). That's fine for our use case — we don't need the
 * exact requested frame, just a representative one near the anchor.
 *
 * Returns false (instead of throwing) on per-frame failure so callers can
 * skip the screenshot without aborting the whole pipeline.
 */
async function extractOne(videoPath: string, target: ExtractTarget): Promise<boolean> {
  await fs.mkdir(path.dirname(target.outPath), { recursive: true });
  try {
    const { ffmpeg } = getFfmpegPaths();
    await execa(
      ffmpeg,
      [
        '-hide_banner',
        '-loglevel', 'error',
        '-y',
        '-ss', target.timestampSec.toFixed(3),
        '-i', videoPath,
        '-frames:v', '1',
        '-q:v', '2',
        target.outPath,
      ],
      { timeout: 60_000 },
    );
    // ffmpeg may report success but write 0 bytes when the seek lands past
    // the actual stream end (durations from container metadata are often
    // optimistic). Treat empty output as failure.
    const stat = await fs.stat(target.outPath).catch(() => null);
    if (!stat || stat.size === 0) {
      log.warn({ target }, 'ffmpeg produced empty frame, skipping');
      return false;
    }
    return true;
  } catch (err) {
    log.warn({ err: (err as Error).message, target }, 'ffmpeg extract failed, skipping');
    return false;
  }
}

export interface ExtractResult {
  target: ExtractTarget;
  ok: boolean;
}

export async function extractFrames(
  videoPath: string,
  targets: ExtractTarget[],
): Promise<ExtractResult[]> {
  return Promise.all(
    targets.map((t) =>
      limit(async () => ({
        target: t,
        ok: await extractOne(videoPath, t),
      })),
    ),
  );
}

/**
 * Given a step's anchor timestamp, return candidate timestamps clamped to the
 * video duration. Small windows (≤15s) sample every second; larger windows
 * sample at most 12 frames spread evenly so the grid never explodes.
 */
export function candidateTimestamps(
  anchorSec: number,
  durationSec: number,
  window = 2,
): number[] {
  const out: number[] = [];
  if (window <= 15) {
    // 小窗口：每秒 1 帧，密度高
    for (let off = -window; off <= window; off += 1) {
      const ts = Math.max(0.1, Math.min(durationSec - 0.1, anchorSec + off));
      out.push(Number(ts.toFixed(3)));
    }
  } else {
    // 大窗口：固定 12 帧，均匀分布
    const count: number = 12;
    const half = window;
    for (let i = 0; i < count; i++) {
      const ratio = count === 1 ? 0.5 : i / (count - 1);
      const ts = Math.max(0.1, Math.min(durationSec - 0.1, anchorSec - half + ratio * half * 2));
      out.push(Number(ts.toFixed(3)));
    }
  }
  return Array.from(new Set(out));
}
