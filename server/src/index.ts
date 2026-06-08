import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import multipart from '@fastify/multipart';
import { env } from './env.js';
import { log } from './util/log.js';
import { detectFfmpeg, printInstallHelp } from './ffmpeg/detect.js';
import { registerHealthRoute } from './routes/health.js';
import { registerTaskRoutes } from './routes/tasks.js';
import { registerDocumentRoutes } from './routes/documents.js';
import { registerSettingsRoutes } from './routes/settings.js';
import { runMigrations } from './db/client.js';
import { paths, ensureDir } from './util/paths.js';

async function main(): Promise<void> {
  const bins = await detectFfmpeg();
  if (bins.ffmpeg === 'missing' || bins.ffprobe === 'missing') {
    printInstallHelp();
    process.exit(1);
  }
  log.info({ ffmpeg: bins.ffmpeg, ffprobe: bins.ffprobe }, 'FFmpeg detected');

  ensureDir(paths.root);
  runMigrations();
  log.info({ dataDir: paths.root }, 'data dir ready');

  const app = Fastify({});
  await app.register(cors, { origin: true });
  await app.register(multipart, { limits: { fileSize: 5 * 1024 * 1024 * 1024 } });

  await app.register(fastifyStatic, {
    root: paths.root,
    prefix: '/files/',
    decorateReply: false,
    wildcard: false,
    // <img>/<video> load cross-origin in no-cors mode and DON'T send an Origin
    // header, so @fastify/cors (which echoes Origin) never adds Access-Control-
    // Allow-Origin to these responses. Without it, the packaged app:// renderer
    // gets every /files image blocked by Chromium ORB (net::ERR_BLOCKED_BY_ORB)
    // — broken images. These are local, credential-free public assets, so an
    // unconditional ACAO:* plus CORP:cross-origin is safe and what ORB wants.
    setHeaders: (res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    },
  });

  registerHealthRoute(app);
  registerSettingsRoutes(app);
  await registerTaskRoutes(app);
  registerDocumentRoutes(app);

  try {
    await app.listen({ port: env.PORT, host: '127.0.0.1' });
    log.info(`server listening on http://127.0.0.1:${env.PORT}`);
  } catch (err) {
    log.error(err);
    process.exit(1);
  }
}

main();
