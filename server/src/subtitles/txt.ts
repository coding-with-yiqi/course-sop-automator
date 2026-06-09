import type { Cue } from './parse.js';

/**
 * Tolerant parser for plain-text "subtitles" that carry timestamps but are not
 * valid .srt/.vtt (e.g. WeChat exports). We do NOT require a fixed layout —
 * we scan line by line and pull a timestamp off the front of each line,
 * accepting the formats real tools emit:
 *
 *   00:00:11        你好世界         (HH:MM:SS)
 *   [00:00:11]      你好世界         (bracketed)
 *   00:11           你好世界         (MM:SS)
 *   00:00:11,000    你好世界         (comma millis)
 *   00:00:11.000    你好世界         (dot millis)
 *   00:00:11 --> 00:00:13  你好     (range — end is honored)
 *
 * The separator between the timestamp and the text may be spaces, a tab, or a
 * newline (timestamp on its own line, text on the next — the .srt habit).
 *
 * A cue's END is the explicit range-end when present, otherwise the START of the
 * next cue, otherwise start + DEFAULT_TAIL_MS for the final cue.
 *
 * If NOT A SINGLE timestamp is found anywhere, this is plain prose with no
 * anchor for frame extraction — we throw a friendly error rather than silently
 * producing misaligned screenshots. (CLAUDE.md: frames are anchored entirely on
 * subtitle timestamps.)
 */

const DEFAULT_TAIL_MS = 4000;

// One timestamp token: optional [, optional HH:, MM:SS, optional ,mmm or .mmm, optional ]
// Capturing groups: 1=hours(optional) 2=minutes 3=seconds 4=millis(optional)
const TS = /\[?\s*(?:(\d{1,2}):)?(\d{1,2}):(\d{2})(?:[.,](\d{1,3}))?\s*\]?/;
// A line that STARTS with a timestamp (after optional leading index / whitespace).
const LINE_LEADING_TS = new RegExp(`^\\s*(?:\\d+\\s+)?${TS.source}`);
// Range end: "--> 00:00:13" anywhere after the leading timestamp.
const RANGE = new RegExp(`-->\\s*${TS.source}`);

interface RawHit {
  startMs: number;
  endMs: number | null; // explicit range end, if any
  text: string;
}

function toMs(h: string | undefined, m: string, s: string, ms: string | undefined): number {
  const hours = h ? parseInt(h, 10) : 0;
  const mins = parseInt(m, 10);
  const secs = parseInt(s, 10);
  // Pad fractional seconds to milliseconds: "5" -> 500, "05" -> 50, "500" -> 500
  const millis = ms ? parseInt(ms.padEnd(3, '0').slice(0, 3), 10) : 0;
  return ((hours * 60 + mins) * 60 + secs) * 1000 + millis;
}

/**
 * Parse a timestamped plain-text transcript into cues. Tolerant of format
 * variation; throws if no timestamps are present at all.
 */
export function parseTxtCues(raw: string): Cue[] {
  const lines = raw.split(/\r?\n/);
  const hits: RawHit[] = [];
  let pendingStart: { startMs: number; endMs: number | null } | null = null;

  for (const line of lines) {
    const lead = LINE_LEADING_TS.exec(line);
    if (lead) {
      const startMs = toMs(lead[1], lead[2], lead[3], lead[4]);
      // explicit range end on the same line?
      let endMs: number | null = null;
      const range = RANGE.exec(line);
      if (range) endMs = toMs(range[1], range[2], range[3], range[4]);

      // text = everything after the consumed timestamp portion
      const consumedEnd = range ? range.index + range[0].length : lead.index + lead[0].length;
      const text = line.slice(consumedEnd).trim();

      if (text) {
        // timestamp + text on one line
        hits.push({ startMs, endMs, text });
        pendingStart = null;
      } else {
        // timestamp alone on its line; text expected on following line(s)
        pendingStart = { startMs, endMs };
      }
      continue;
    }

    // a non-timestamp line: if a bare timestamp is pending, this is its text
    const body = line.trim();
    if (pendingStart && body) {
      hits.push({ startMs: pendingStart.startMs, endMs: pendingStart.endMs, text: body });
      pendingStart = null;
    }
    // otherwise: prose with no preceding timestamp — drop it (no anchor)
  }

  if (hits.length === 0) {
    throw new Error(
      'TXT 字幕里没有找到任何时间戳,无法定位截图。请上传带时间戳的字幕(.srt/.vtt/.txt),或改用自动转录。',
    );
  }

  // Resolve end times: explicit range-end > next cue start > start + tail.
  const cues: Cue[] = [];
  for (let i = 0; i < hits.length; i++) {
    const h = hits[i];
    let endMs = h.endMs;
    if (endMs == null) {
      const next = hits[i + 1];
      endMs = next ? next.startMs : h.startMs + DEFAULT_TAIL_MS;
    }
    // guard against zero/negative spans (clock went backwards or duplicate ts)
    if (endMs <= h.startMs) endMs = h.startMs + DEFAULT_TAIL_MS;
    cues.push({ startMs: h.startMs, endMs, text: h.text });
  }
  return cues;
}
