import { execa } from 'execa';
import { getFfmpegPaths } from './detect.js';

export interface ProbeResult {
  durationSec: number;
}

export async function probeVideo(filePath: string): Promise<ProbeResult> {
  const { ffprobe } = getFfmpegPaths();
  const { stdout } = await execa(
    ffprobe,
    ['-v', 'error', '-print_format', 'json', '-show_format', filePath],
    { timeout: 30_000 },
  );
  const parsed = JSON.parse(stdout) as { format?: { duration?: string } };
  const duration = parsed.format?.duration ? Number(parsed.format.duration) : NaN;
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error('ffprobe 无法识别视频时长');
  }
  return { durationSec: duration };
}
