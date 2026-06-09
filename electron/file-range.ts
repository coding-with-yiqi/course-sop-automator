import path from 'node:path';

/**
 * Pure logic for serving local files over the app:// protocol with HTTP Range
 * support. Kept free of `electron` and Node stream imports so it can be unit
 * tested under vitest — the actual Response/stream wiring lives in main.ts.
 *
 * These functions encode the invariants behind real packaging bugs:
 *  - <video> needs 206 + Content-Range to load metadata + seek (electron#38749).
 *  - Wrong MIME makes the browser refuse to play / render the file.
 */

const MIME_BY_EXT: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.m4v': 'video/x-m4v',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.html': 'text/html; charset=utf-8',
};

export function mimeFor(fp: string): string {
  return MIME_BY_EXT[path.extname(fp).toLowerCase()] ?? 'application/octet-stream';
}

export interface RangePlan {
  /** 206 (partial), 200 (full), or 416 (unsatisfiable). */
  status: 206 | 200 | 416;
  /** Inclusive byte start (only meaningful for 206). */
  start: number;
  /** Inclusive byte end (only meaningful for 206). */
  end: number;
  /** Headers to put on the Response. */
  headers: Record<string, string>;
}

/**
 * Decide how to serve `total`-byte file given a (possibly null) Range header.
 * Supports a single `bytes=start-end`, open-ended `bytes=start-`, and suffix
 * `bytes=-N`. Multipart ranges are not supported (browsers don't need them for
 * <video>). Returns the status + byte window + headers; the caller streams it.
 */
export function planRange(
  total: number,
  contentType: string,
  rangeHeader: string | null | undefined,
): RangePlan {
  const match = rangeHeader?.match(/^bytes=(\d*)-(\d*)$/);
  if (match) {
    let start = match[1] === '' ? NaN : Number(match[1]);
    let end = match[2] === '' ? NaN : Number(match[2]);
    // Suffix range "bytes=-N" → last N bytes.
    if (Number.isNaN(start)) {
      start = Math.max(0, total - end);
      end = total - 1;
    } else if (Number.isNaN(end)) {
      end = total - 1;
    }
    if (start > end || start >= total) {
      return {
        status: 416,
        start: 0,
        end: 0,
        headers: { 'Content-Range': `bytes */${total}` },
      };
    }
    end = Math.min(end, total - 1);
    return {
      status: 206,
      start,
      end,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(end - start + 1),
        'Content-Range': `bytes ${start}-${end}/${total}`,
        'Accept-Ranges': 'bytes',
      },
    };
  }
  // No Range header — full body, but advertise range support so <video> seeks.
  return {
    status: 200,
    start: 0,
    end: total - 1,
    headers: {
      'Content-Type': contentType,
      'Content-Length': String(total),
      'Accept-Ranges': 'bytes',
    },
  };
}
