import { describe, it, expect } from 'vitest';
import { hammingDistance, dedupeCandidates } from './dedupe.js';

describe('hammingDistance', () => {
  it('returns 0 for identical hashes', () => {
    const a = 0b10101010n;
    const b = 0b10101010n;
    expect(hammingDistance(a, b)).toBe(0);
  });

  it('counts differing bits', () => {
    const a = 0b0000n;
    const b = 0b1111n;
    expect(hammingDistance(a, b)).toBe(4);
  });

  it('handles 64-bit hashes', () => {
    const a = 0xFFFFFFFFFFFFFFFFn;
    const b = 0x0000000000000000n;
    expect(hammingDistance(a, b)).toBe(64);
  });
});

const FIXTURE_IMG = new URL('../__tests__/fixtures/test-image.png', import.meta.url).pathname;

describe('dedupeCandidates', () => {
  it('keeps unique items and drops duplicates', async () => {
    // Use the same image file for all to simulate duplicates
    const candidates = [
      { path: FIXTURE_IMG, id: 1 },
      { path: FIXTURE_IMG, id: 2 },
      { path: FIXTURE_IMG, id: 3 },
    ];

    const result = await dedupeCandidates(candidates, { threshold: 0 });
    // Same file → hamming distance 0 ≤ threshold 0 → duplicates
    expect(result.kept.length).toBe(1);
    expect(result.dropped.length).toBe(2);
    expect(result.kept[0].id).toBe(1);
  });

  it('handles empty array', async () => {
    const result = await dedupeCandidates([], { threshold: 6 });
    expect(result.kept).toEqual([]);
    expect(result.dropped).toEqual([]);
  });

  it('drops items with non-existent paths', async () => {
    const candidates = [
      { path: '/nonexistent/file.jpg', id: 1 },
    ];
    const result = await dedupeCandidates(candidates);
    expect(result.kept).toEqual([]);
    expect(result.dropped.length).toBe(1);
  });
});
