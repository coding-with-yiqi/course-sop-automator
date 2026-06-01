/**
 * Minimal logger for the Electron main process.
 * Mirrors the server's pino-based API so auto-updater.ts can use it
 * without pulling in the whole server dependency tree.
 */

export const log = {
  info: (...args: unknown[]) => console.log('[electron]', ...args),
  error: (...args: unknown[]) => console.error('[electron]', ...args),
  warn: (...args: unknown[]) => console.warn('[electron]', ...args),
};
