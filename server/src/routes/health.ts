import type { FastifyInstance } from 'fastify';
import type { HealthResponse } from '@sop/shared';
import { detectFfmpeg } from '../ffmpeg/detect.js';
import { env } from '../env.js';

export function registerHealthRoute(app: FastifyInstance): void {
  app.get('/api/health', async () => {
    const bins = await detectFfmpeg();
    const body: HealthResponse = {
      ffmpeg: bins.ffmpeg,
      ffprobe: bins.ffprobe,
      llm: env.KIMI_API_KEY ? 'ok' : 'no_key',
    };
    return { ok: true, data: body };
  });
}
