/**
 * PRD §6 ② validator — flags steps whose `instructionRichText` reads like a
 * literal transcript of the subtitle. The contract: at most 3 sentences per
 * step may overlap with raw subtitle wording.
 */
import type { Cue } from '../subtitles/parse.ts';

export interface LeakHit {
  stepSentence: string;
  matchedCue: string;
}

export interface StepLeakReport {
  stepNumber: number;
  stepTitle: string;
  leaks: LeakHit[];
  passed: boolean;
}

export interface ValidateOptions {
  maxLeaksPerStep?: number;
  minSentenceLength?: number;
  minOverlapLength?: number;
}

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitSentences(text: string): string[] {
  return text
    .split(/[。!??!\n;;]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Slide a window over `needle` and check if any window-length substring
 * appears in `haystack`. We don't bother with full LCS; for the leak
 * detection threshold, contiguous overlap of `windowLen` chars is a
 * pragmatic stand-in and runs in O(n·m / windowLen).
 */
function hasOverlap(needle: string, haystack: string, windowLen: number): boolean {
  if (needle.length < windowLen) return false;
  for (let i = 0; i + windowLen <= needle.length; i += 1) {
    const piece = needle.slice(i, i + windowLen);
    if (haystack.includes(piece)) return true;
  }
  return false;
}

export function checkStepLeaks(
  step: { stepNumber: number; title: string; instructionRichText: string },
  cues: Cue[],
  options: ValidateOptions = {},
): StepLeakReport {
  const {
    maxLeaksPerStep = 3,
    minSentenceLength = 10,
    minOverlapLength = 8,
  } = options;
  const stepText = stripHtml(step.instructionRichText);
  const sentences = splitSentences(stepText).filter((s) => s.length >= minSentenceLength);
  const haystack = cues.map((c) => c.text).join('\n');

  const leaks: LeakHit[] = [];
  for (const sentence of sentences) {
    if (hasOverlap(sentence, haystack, minOverlapLength)) {
      // Find the actual matching cue for reporting.
      const matched = cues.find((c) => hasOverlap(sentence, c.text, minOverlapLength));
      leaks.push({ stepSentence: sentence, matchedCue: matched?.text ?? '(unknown)' });
    }
  }

  return {
    stepNumber: step.stepNumber,
    stepTitle: step.title,
    leaks,
    passed: leaks.length <= maxLeaksPerStep,
  };
}
