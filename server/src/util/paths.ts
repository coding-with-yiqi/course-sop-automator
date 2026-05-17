import path from 'node:path';
import fs from 'node:fs';
import { env } from '../env.ts';

const root = path.resolve(env.DATA_DIR);

export const paths = {
  root,
  uploads: (taskId: string) => path.join(root, 'uploads', taskId),
  chunks: (taskId: string) => path.join(root, 'chunks', taskId),
  frames: (taskId: string, stepN: number) => path.join(root, 'frames', taskId, String(stepN)),
  exports: (documentId: string) => path.join(root, 'exports', documentId),
};

export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}
