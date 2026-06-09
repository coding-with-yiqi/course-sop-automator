import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'node:path';

// getBundledBinDir reads process.env + existsSync. Mock fs so we control whether
// the bundled dir "exists" without touching disk.
const existsMock = vi.fn();
vi.mock('node:fs', () => ({ existsSync: (p: string) => existsMock(p) }));
// log.ts pulls in env/pino; stub it so importing detect.ts stays cheap.
vi.mock('../util/log.js', () => ({ log: { error: () => {}, info: () => {} } }));

const ORIG = { ...process.env };

async function loadDetect() {
  vi.resetModules();
  return import('./detect.js');
}

describe('getFfmpegPaths — bundled ffmpeg resolution (clean-machine bug)', () => {
  beforeEach(() => {
    existsMock.mockReset();
    process.env = { ...ORIG };
    delete process.env.ELECTRON_MODE;
    delete process.env.ELECTRON_RESOURCES_PATH;
    delete process.env.NODE_ENV;
    // detect.ts reads (process as any).resourcesPath as a fallback — clear it.
    delete (process as unknown as { resourcesPath?: string }).resourcesPath;
  });
  afterEach(() => {
    process.env = { ...ORIG };
  });

  it('not in Electron mode → falls back to bare PATH names', async () => {
    const { getFfmpegPaths } = await loadDetect();
    const p = getFfmpegPaths();
    expect(p.ffmpeg).toBe('ffmpeg');
    expect(p.ffprobe).toBe('ffprobe');
  });

  it('Electron mode + ELECTRON_RESOURCES_PATH (existing) → uses bundled binary', async () => {
    // This is the core fix: the spawned server child has no process.resourcesPath,
    // so it MUST read the path the main process passed via env, or real users
    // (no global ffmpeg) get a server that exits on startup.
    process.env.ELECTRON_MODE = 'true';
    process.env.ELECTRON_RESOURCES_PATH = '/Apps/X.app/Contents/Resources';
    existsMock.mockReturnValue(true); // bundled dir exists

    const { getFfmpegPaths } = await loadDetect();
    const expectedDir = path.join(
      '/Apps/X.app/Contents/Resources',
      'bin',
      `${process.platform}-${process.arch}`,
    );
    const p = getFfmpegPaths();
    expect(p.ffmpeg).toBe(path.join(expectedDir, 'ffmpeg'));
    expect(p.ffprobe).toBe(path.join(expectedDir, 'ffprobe'));
    // and it should have probed the env-derived dir, not cwd
    expect(existsMock).toHaveBeenCalledWith(expectedDir);
  });

  it('Electron mode but bundled dir missing → falls back to PATH', async () => {
    process.env.ELECTRON_MODE = 'true';
    process.env.ELECTRON_RESOURCES_PATH = '/nope';
    existsMock.mockReturnValue(false);

    const { getFfmpegPaths } = await loadDetect();
    expect(getFfmpegPaths().ffmpeg).toBe('ffmpeg');
  });

  it('Electron mode but NODE_ENV=development → not bundled (dev uses PATH)', async () => {
    process.env.ELECTRON_MODE = 'true';
    process.env.NODE_ENV = 'development';
    process.env.ELECTRON_RESOURCES_PATH = '/Apps/X.app/Contents/Resources';
    existsMock.mockReturnValue(true);

    const { getFfmpegPaths } = await loadDetect();
    expect(getFfmpegPaths().ffmpeg).toBe('ffmpeg');
  });

  it('Electron mode, no resources path anywhere → falls back to PATH', async () => {
    process.env.ELECTRON_MODE = 'true';
    // no ELECTRON_RESOURCES_PATH, no process.resourcesPath
    const { getFfmpegPaths } = await loadDetect();
    expect(getFfmpegPaths().ffmpeg).toBe('ffmpeg');
  });
});
