import { execa } from 'execa';
import { log } from '../util/log.ts';

export type BinaryStatus = 'ok' | 'missing';

async function probe(bin: 'ffmpeg' | 'ffprobe'): Promise<BinaryStatus> {
  try {
    await execa(bin, ['-version'], { timeout: 5000 });
    return 'ok';
  } catch {
    return 'missing';
  }
}

export async function detectFfmpeg(): Promise<{ ffmpeg: BinaryStatus; ffprobe: BinaryStatus }> {
  const [ffmpeg, ffprobe] = await Promise.all([probe('ffmpeg'), probe('ffprobe')]);
  return { ffmpeg, ffprobe };
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
