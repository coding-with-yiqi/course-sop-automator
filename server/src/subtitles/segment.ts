import type { Cue } from './parse.js';

export interface Chunk {
  index: number;
  startMs: number;
  endMs: number;
  mode: 'theory' | 'practice';
  cues: Cue[];
}

const PRACTICE_TRIGGERS = [
  '下面开始实操',
  '我们开始动手',
  '接下来演示',
  '跟我操作',
  '现在动手',
  '打开终端',
  '打开 vscode',
  '打开编辑器',
  '让我们写代码',
  '我们来写',
  "let's code",
  "let's write",
  'demo time',
];

const THEORY_TRIGGERS = [
  '概念上',
  '原理是',
  '定义为',
  '理论上',
  '回顾一下',
  '总结一下',
  '我们先来看',
  '先讲清楚',
];

function matchesAny(text: string, words: readonly string[]): boolean {
  const lower = text.toLowerCase();
  return words.some((w) => lower.includes(w.toLowerCase()));
}

function inferModePerCue(cues: Cue[]): Array<'theory' | 'practice'> {
  const modes: Array<'theory' | 'practice'> = [];
  let current: 'theory' | 'practice' = 'theory';
  for (const cue of cues) {
    if (matchesAny(cue.text, PRACTICE_TRIGGERS)) current = 'practice';
    else if (matchesAny(cue.text, THEORY_TRIGGERS)) current = 'theory';
    modes.push(current);
  }
  return modes;
}

export interface SegmentOptions {
  maxChunkSec?: number;
  minChunkSec?: number;
}

/**
 * Greedy segmentation. Cuts when:
 *   - accumulated length > maxChunkSec, OR
 *   - mode flips and the current chunk is at least minChunkSec long.
 * Tiny tail chunks (< minChunkSec) merge into the previous chunk.
 * Each chunk's final mode is decided by majority vote among its cues,
 * not just the first cue (the first cue often misclassifies short clips).
 */
export function segmentSubtitles(
  cues: Cue[],
  { maxChunkSec = 1500, minChunkSec = 60 }: SegmentOptions = {},
): Chunk[] {
  if (cues.length === 0) return [];
  const modes = inferModePerCue(cues);
  const modeByCue = new Map<Cue, 'theory' | 'practice'>();
  cues.forEach((cue, i) => modeByCue.set(cue, modes[i]));
  const maxMs = maxChunkSec * 1000;
  const minMs = minChunkSec * 1000;

  const chunks: Chunk[] = [];
  let current: Chunk = {
    index: 0,
    startMs: cues[0].startMs,
    endMs: cues[0].endMs,
    mode: modes[0],
    cues: [cues[0]],
  };

  for (let i = 1; i < cues.length; i += 1) {
    const cue = cues[i];
    const mode = modes[i];
    const wouldExceed = cue.endMs - current.startMs > maxMs;
    const modeFlipped = mode !== current.mode;
    const currentLength = current.endMs - current.startMs;
    const cutForFlip = modeFlipped && currentLength >= minMs;

    if (wouldExceed || cutForFlip) {
      chunks.push(current);
      current = {
        index: chunks.length,
        startMs: cue.startMs,
        endMs: cue.endMs,
        mode,
        cues: [cue],
      };
    } else {
      current.endMs = cue.endMs;
      current.cues.push(cue);
    }
  }
  chunks.push(current);

  // Merge trailing tiny chunk into previous.
  if (chunks.length >= 2) {
    const last = chunks[chunks.length - 1];
    if (last.endMs - last.startMs < minMs) {
      const prev = chunks[chunks.length - 2];
      prev.endMs = last.endMs;
      prev.cues.push(...last.cues);
      chunks.pop();
    }
  }
  return chunks.map((c, idx) => ({
    ...c,
    index: idx,
    mode: majorityMode(c.cues, modeByCue) ?? c.mode,
  }));
}

function majorityMode(
  cues: Cue[],
  modeByCue: Map<Cue, 'theory' | 'practice'>,
): 'theory' | 'practice' | null {
  let theory = 0;
  let practice = 0;
  for (const cue of cues) {
    const m = modeByCue.get(cue);
    if (m === 'theory') theory += 1;
    else if (m === 'practice') practice += 1;
  }
  if (theory === 0 && practice === 0) return null;
  return practice > theory ? 'practice' : 'theory';
}
