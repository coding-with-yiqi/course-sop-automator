import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { paths, isSafePath } from './paths.js';

describe('isSafePath', () => {
  it('allows paths inside root', () => {
    const safe = path.join(paths.root, 'uploads', 'task-123', 'video.mp4');
    expect(isSafePath(safe)).toBe(true);
  });

  it('rejects paths outside root', () => {
    const bad = path.resolve(paths.root, '..', 'etc', 'passwd');
    expect(isSafePath(bad)).toBe(false);
  });

  it('rejects paths with .. traversal', () => {
    const bad = path.join(paths.root, 'uploads', '..', '..', 'secrets');
    expect(isSafePath(bad)).toBe(false);
  });

  it('rejects absolute paths outside root', () => {
    expect(isSafePath('/etc/passwd')).toBe(false);
    expect(isSafePath('/tmp/hack')).toBe(false);
  });
});
