import pino from 'pino';
import { env } from '../env.js';

// pino-pretty runs in a worker thread and is loaded by string name at runtime.
// That can't survive esbuild bundling (Electron packaged build), so we only use
// the pretty transport in plain dev. In production / Electron, log raw JSON.
const usePretty =
  process.env.NODE_ENV !== 'production' && process.env.ELECTRON_MODE !== 'true';

export const log = pino({
  level: env.LOG_LEVEL,
  transport: usePretty
    ? {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'HH:MM:ss.l' },
      }
    : undefined,
});
