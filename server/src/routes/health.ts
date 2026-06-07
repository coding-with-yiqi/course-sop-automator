import type { FastifyInstance } from 'fastify';
import type { HealthResponse } from '@sop/shared';
import { detectFfmpeg } from '../ffmpeg/detect.js';
import { env } from '../env.js';
import { getSetting } from '../db/client.js';

export function registerHealthRoute(app: FastifyInstance): void {
  app.get('/api/health', async () => {
    const bins = await detectFfmpeg();
    // Key may come from the Settings page (DB) or .env — match llmClient().
    const hasKey = !!(getSetting('KIMI_API_KEY') || env.KIMI_API_KEY);
    const body: HealthResponse = {
      ffmpeg: bins.ffmpeg,
      ffprobe: bins.ffprobe,
      llm: hasKey ? 'ok' : 'no_key',
    };
    return { ok: true, data: body };
  });
}
