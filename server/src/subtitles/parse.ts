import fs from 'node:fs/promises';
import path from 'node:path';
import { parseSync } from 'subtitle';

export interface Cue {
  startMs: number;
  endMs: number;
  text: string;
}

/**
 * Reads an .srt / .vtt / .txt subtitle file and returns normalized cues.
 * Throws if the file is missing or contains zero cues.
 *
 * .txt is parsed tolerantly (WeChat-style timestamped transcripts) — see
 * parseTxtCues. .srt/.vtt go through the strict `subtitle` library.
 */
export async function parseSubtitleFile(filePath: string): Promise<Cue[]> {
  const raw = await fs.readFile(filePath, 'utf8');
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.txt') {
    const { parseTxtCues } = await import('./txt.js');
    return parseTxtCues(raw);
  }
  if (ext !== '.srt' && ext !== '.vtt') {
    throw new Error(`不支持的字幕格式: ${ext}`);
  }
  const nodes = parseSync(raw);
  const cues: Cue[] = [];
  for (const node of nodes) {
    if (node.type !== 'cue') continue;
    const { start, end, text } = node.data;
    const clean = stripFormatting(text).trim();
    if (!clean) continue;
    cues.push({ startMs: start, endMs: end, text: clean });
  }
  if (cues.length === 0) {
    throw new Error('字幕文件解析为空');
  }
  return cues;
}

function stripFormatting(text: string): string {
  // Drop common WebVTT/SRT styling tags; keep newlines collapsed to spaces.
  return text
    .replace(/<\/?[^>]+>/g, '')
    .replace(/\{[^}]+\}/g, '')
    .replace(/\s+/g, ' ');
}
