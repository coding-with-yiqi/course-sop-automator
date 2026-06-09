import path from 'node:path';
import fs from 'node:fs';
import { env } from '../env.js';

const root = path.resolve(env.DATA_DIR);

export const paths = {
  root,
  uploads: (taskId: string) => path.join(root, 'uploads', taskId),
  chunks: (taskId: string) => path.join(root, 'chunks', taskId),
  frames: (taskId: string, stepN: number) => path.join(root, 'frames', taskId, String(stepN)),
  assets: (taskId: string, stepNumber: number) =>
    path.join(root, 'uploads', taskId, 'assets', `step${stepNumber}`),
  exports: (documentId: string) => path.join(root, 'exports', documentId),
  // On-demand whisper model lives under the writable data dir (follows the user,
  // not bundled into the app). The engine ships in resources/bin; only the
  // ~190MB model downloads here on first transcription.
  models: () => path.join(root, 'models'),
};

export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

/**
 * Check whether `absPath` is safely contained within `paths.root`.
 * Prevents directory traversal attacks by resolving the path and checking the prefix.
 */
export function isSafePath(absPath: string): boolean {
  const resolved = path.resolve(absPath);
  return resolved.startsWith(paths.root) && !resolved.includes('..');
}
