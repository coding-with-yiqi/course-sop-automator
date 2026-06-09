import fs from 'node:fs/promises';
import path from 'node:path';
import { execa } from 'execa';
import { log } from '../util/log.js';
import { getFfmpegPaths } from '../ffmpeg/detect.js';
import { parseSubtitleFile } from '../subtitles/parse.js';
import type { Cue } from '../subtitles/parse.js';

export interface TranscribeOptions {
  videoPath: string;
  modelPath: string;
  whisperCliPath: string;
  /** Language code for whisper (default 'zh'). */
  language?: string;
  /** Called with 0..100 as whisper reports progress. */
  onProgress?: (percent: number) => void;
  /** Called with human-readable status lines. */
  onMessage?: (message: string) => void;
}

/**
 * Transcribe a video to cues using bundled whisper.cpp.
 *
 * Pipeline (all verified by hand 2026-06-08):
 *   1. ffmpeg extract 16kHz mono WAV (whisper's required input format)
 *   2. whisper-cli -osrt → .srt file
 *   3. Re-use parseSubtitleFile (same path as uploaded subtitles) → Cue[]
 *   4. Delete the temporary WAV (try/finally, even on error)
 *
 * Progress is scraped from whisper stderr:
 *   "whisper_print_progress_callback: progress = 42%"
 * We de-duplicate so the same percentage isn't reported twice.
 */
export async function transcribeVideo(opts: TranscribeOptions): Promise<Cue[]> {
  const { videoPath, modelPath, whisperCliPath, language = 'zh' } = opts;
  const { ffmpeg } = getFfmpegPaths();

  // Temporary WAV in the same directory as the video so we stay on the same
  // filesystem (fast rename/unlink). Use a deterministic name so a retry
  // doesn't leave garbage behind.
  const wavPath = path.join(path.dirname(videoPath), `_transcribe_${path.basename(videoPath)}.wav`);

  let wavCreated = false;
  try {
    // 1) Extract audio
    if (opts.onMessage) opts.onMessage('提取音频...');
    await execa(ffmpeg, [
      '-y',
      '-i', videoPath,
      '-ar', '16000',
      '-ac', '1',
      '-c:a', 'pcm_s16le',
      wavPath,
    ], { timeout: 300_000 });
    wavCreated = true;

    // 2) Transcribe with progress scraping
    if (opts.onMessage) opts.onMessage('语音转录中...');
    const srtPrefix = path.join(path.dirname(videoPath), `_transcribe_out_${Date.now()}`);

    let lastPct = -1;
    const { stderr } = await execa(
      whisperCliPath,
      [
        '-m', modelPath,
        '-f', wavPath,
        '-osrt',
        '-of', srtPrefix,
        '-l', language,
        '--print-progress',
      ],
      {
        timeout: 600_000,
        // whisper prints progress to stderr; we want it live.
        stderr: 'pipe',
      },
    );

    // Scrape progress lines and fire callback (deduplicated)
    const progressRe = /progress\s*=\s*(\d+)%/gi;
    let m: RegExpExecArray | null;
    while ((m = progressRe.exec(stderr)) !== null) {
      const pct = parseInt(m[1], 10);
      if (pct > lastPct && opts.onProgress) {
        lastPct = pct;
        opts.onProgress(pct);
      }
    }

    // 3) Parse the generated SRT back into cues (same parser as uploaded subtitles)
    const srtPath = `${srtPrefix}.srt`;
    const cues = await parseSubtitleFile(srtPath);

    // Clean up the SRT file immediately (cues are already in memory)
    try { await fs.unlink(srtPath); } catch { /* ignore */ }

    if (cues.length === 0) {
      throw new TranscribeError('未检测到语音,请确认视频包含人声,或上传人工字幕。');
    }

    return cues;
  } finally {
    // 4) Always delete the temporary WAV, even on error.
    if (wavCreated) {
      try { await fs.unlink(wavPath); } catch { /* ignore */ }
    }
  }
}

export class TranscribeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TranscribeError';
  }
}
