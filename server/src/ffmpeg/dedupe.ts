import sharp from 'sharp';
import fs from 'node:fs/promises';

/**
 * dHash (difference hash) — 8x8 grayscale, 64-bit fingerprint.
 *   1. Resize to 9x8 grayscale.
 *   2. Compare each row's adjacent pixels (8 pairs * 8 rows = 64 bits).
 *   3. Hamming distance between two hashes ≤ 6 ≈ 95% similarity.
 */
export async function dhash(imagePath: string): Promise<bigint> {
  const raw = await sharp(imagePath)
    .greyscale()
    .resize(9, 8, { fit: 'fill' })
    .raw()
    .toBuffer();
  let bits = 0n;
  let bitIdx = 0n;
  for (let y = 0; y < 8; y += 1) {
    const rowStart = y * 9;
    for (let x = 0; x < 8; x += 1) {
      const left = raw[rowStart + x];
      const right = raw[rowStart + x + 1];
      if (left > right) bits |= 1n << bitIdx;
      bitIdx += 1n;
    }
  }
  return bits;
}

export function hammingDistance(a: bigint, b: bigint): number {
  let xor = a ^ b;
  let count = 0;
  while (xor) {
    if (xor & 1n) count += 1;
    xor >>= 1n;
  }
  return count;
}

/**
 * Drop the screenshot field from later steps when their representative frame
 * matches an earlier step (hamming distance ≤ threshold).
 *
 * Threshold 6/64 ≈ 90% identical pixels — matches PRD's 95% similarity bar
 * once you account for the binarization in dHash.
 */
export interface StepWithFrame {
  index: number;
  framePath: string;
}

export interface DedupeOptions {
  threshold?: number;
}

export async function findDuplicates(
  steps: StepWithFrame[],
  { threshold = 6 }: DedupeOptions = {},
): Promise<Set<number>> {
  const hashes = await Promise.all(steps.map((s) => dhash(s.framePath)));
  const drop = new Set<number>();
  for (let i = 1; i < steps.length; i += 1) {
    for (let j = 0; j < i; j += 1) {
      if (drop.has(steps[j].index)) continue;
      if (hammingDistance(hashes[i], hashes[j]) <= threshold) {
        drop.add(steps[i].index);
        break;
      }
    }
  }
  return drop;
}

export async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}
