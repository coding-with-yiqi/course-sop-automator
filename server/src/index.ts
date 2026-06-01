import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import multipart from '@fastify/multipart';
import { env } from './env.ts';
import { log } from './util/log.ts';
import { detectFfmpeg, printInstallHelp } from './ffmpeg/detect.ts';
import { registerHealthRoute } from './routes/health.ts';
import { registerTaskRoutes } from './routes/tasks.ts';
import { registerDocumentRoutes } from './routes/documents.ts';
import { registerSettingsRoutes } from './routes/settings.ts';
import { runMigrations } from './db/client.ts';
import { paths, ensureDir } from './util/paths.ts';

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
