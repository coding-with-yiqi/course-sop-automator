import { execa } from 'execa';
import { log } from '../util/log.js';
import path from 'node:path';
import { existsSync } from 'node:fs';

export type BinaryStatus = 'ok' | 'missing';

/**
 * In Electron production builds, FFmpeg binaries are shipped in
 * `resources/bin/<platform>/`.  We prepend that directory to the
 * binary name so `execa` can find it without polluting the user's
 * global PATH.
 */
function getBundledBinDir(): string | null {
  if (process.env.ELECTRON_MODE !== 'true' || process.env.NODE_ENV === 'development') {
    return null;
  }
  // In a packaged Electron app process.resourcesPath points to
  // Contents/Resources (macOS) or resources (Win/Linux).
  const platform = process.platform;
  const arch = process.arch;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const resourcesPath = (process as any).resourcesPath as string | undefined;
  if (!resourcesPath) return null;
  const bundled = path.join(
    resourcesPath,
    'bin',
    `${platform}-${arch}`
  );
  return existsSync(bundled) ? bundled : null;
}

async function probe(bin: 'ffmpeg' | 'ffprobe'): Promise<BinaryStatus> {
  try {
    const bundledDir = getBundledBinDir();
    const binPath = bundledDir ? path.join(bundledDir, bin) : bin;
    await execa(binPath, ['-version'], { timeout: 5000 });
    return 'ok';
  } catch {
    return 'missing';
  }
}

export async function detectFfmpeg(): Promise<{ ffmpeg: BinaryStatus; ffprobe: BinaryStatus }> {
  const [ffmpeg, ffprobe] = await Promise.all([probe('ffmpeg'), probe('ffprobe')]);
  return { ffmpeg, ffprobe };
}

export function getFfmpegPaths(): { ffmpeg: string; ffprobe: string } {
  const bundledDir = getBundledBinDir();
  if (bundledDir) {
    return {
      ffmpeg: path.join(bundledDir, 'ffmpeg'),
      ffprobe: path.join(bundledDir, 'ffprobe'),
    };
  }
  return { ffmpeg: 'ffmpeg', ffprobe: 'ffprobe' };
}

export function printInstallHelp(): void {
  const platform = process.platform;
  const lines: string[] = [
    '',
    '❌ FFmpeg / ffprobe not found on PATH.',
    '   The pipeline cannot run without them.',
    '',
    '   Install with:',
  ];
  if (platform === 'darwin') lines.push('   • macOS:   brew install ffmpeg');
  else if (platform === 'linux') lines.push('   • Ubuntu:  sudo apt update && sudo apt install -y ffmpeg');
  else if (platform === 'win32') lines.push('   • Windows: https://www.gyan.dev/ffmpeg/builds/  (add to PATH)');
  else lines.push('   • See https://ffmpeg.org/download.html');
  lines.push('');
  for (const line of lines) log.error(line);
}
