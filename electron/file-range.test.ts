import { describe, it, expect } from 'vitest';
import { mimeFor, planRange } from './file-range.js';

// Regression guard for the floating-video "can't load / can't seek" bug.
// Root cause was the app:// /files handler returning the whole file with no
// Range support → <video> couldn't read metadata or seek (electron#38749).
// planRange encodes the 206/Content-Range/Accept-Ranges contract <video> needs.

describe('mimeFor', () => {
  it('maps video extensions so <video> will play them', () => {
    expect(mimeFor('/x/video.mp4')).toBe('video/mp4');
    expect(mimeFor('/x/clip.webm')).toBe('video/webm');
    expect(mimeFor('/x/clip.mov')).toBe('video/quicktime');
  });
  it('maps image extensions', () => {
    expect(mimeFor('/x/a.png')).toBe('image/png');
    expect(mimeFor('/x/a.JPG')).toBe('image/jpeg'); // case-insensitive
  });
  it('falls back to octet-stream for unknown', () => {
    expect(mimeFor('/x/a.xyz')).toBe('application/octet-stream');
  });
});

describe('planRange', () => {
  const TOTAL = 10_000;
  const CT = 'video/mp4';

  it('no Range → 200 full + Accept-Ranges (so <video> knows it can seek)', () => {
    const p = planRange(TOTAL, CT, null);
    expect(p.status).toBe(200);
    expect(p.headers['Accept-Ranges']).toBe('bytes');
    expect(p.headers['Content-Length']).toBe(String(TOTAL));
    expect(p.headers['Content-Type']).toBe(CT);
  });

  it('bytes=0- → 206 covering the whole file', () => {
    const p = planRange(TOTAL, CT, 'bytes=0-');
    expect(p.status).toBe(206);
    expect(p.start).toBe(0);
    expect(p.end).toBe(TOTAL - 1);
    expect(p.headers['Content-Range']).toBe(`bytes 0-${TOTAL - 1}/${TOTAL}`);
    expect(p.headers['Content-Length']).toBe(String(TOTAL));
    expect(p.headers['Accept-Ranges']).toBe('bytes');
  });

  it('bytes=0-1023 → 206 first 1024 bytes', () => {
    const p = planRange(TOTAL, CT, 'bytes=0-1023');
    expect(p.status).toBe(206);
    expect(p.start).toBe(0);
    expect(p.end).toBe(1023);
    expect(p.headers['Content-Range']).toBe(`bytes 0-1023/${TOTAL}`);
    expect(p.headers['Content-Length']).toBe('1024');
  });

  it('bytes=1000- → 206 from offset to end', () => {
    const p = planRange(TOTAL, CT, 'bytes=1000-');
    expect(p.status).toBe(206);
    expect(p.start).toBe(1000);
    expect(p.end).toBe(TOTAL - 1);
    expect(p.headers['Content-Range']).toBe(`bytes 1000-${TOTAL - 1}/${TOTAL}`);
  });

  it('suffix bytes=-500 → 206 last 500 bytes', () => {
    const p = planRange(TOTAL, CT, 'bytes=-500');
    expect(p.status).toBe(206);
    expect(p.start).toBe(TOTAL - 500);
    expect(p.end).toBe(TOTAL - 1);
    expect(p.headers['Content-Length']).toBe('500');
  });

  it('end beyond total is clamped', () => {
    const p = planRange(TOTAL, CT, `bytes=0-${TOTAL + 9999}`);
    expect(p.status).toBe(206);
    expect(p.end).toBe(TOTAL - 1);
    expect(p.headers['Content-Range']).toBe(`bytes 0-${TOTAL - 1}/${TOTAL}`);
  });

  it('start >= total → 416 with Content-Range */total', () => {
    const p = planRange(TOTAL, CT, `bytes=${TOTAL + 10}-`);
    expect(p.status).toBe(416);
    expect(p.headers['Content-Range']).toBe(`bytes */${TOTAL}`);
  });

  it('start > end → 416', () => {
    const p = planRange(TOTAL, CT, 'bytes=500-100');
    expect(p.status).toBe(416);
  });

  it('malformed Range header → treated as no range (200)', () => {
    expect(planRange(TOTAL, CT, 'bytes=abc').status).toBe(200);
    expect(planRange(TOTAL, CT, 'garbage').status).toBe(200);
  });
});
