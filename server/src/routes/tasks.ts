import type { FastifyInstance } from 'fastify';
import { desc, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import path from 'node:path';
import fs from 'node:fs';
import { pipeline as streamPipeline } from 'node:stream/promises';
import { db } from '../db/client.ts';
import { tasks, documents } from '../db/schema.ts';
import { paths, ensureDir } from '../util/paths.ts';
import { runPipeline } from '../pipeline/orchestrator.ts';
import { replay, subscribe, type PersistedStreamEvent } from '../pipeline/eventBus.ts';
import { log } from '../util/log.ts';

export async function registerTaskRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/tasks', async (req, reply) => {
    const taskId = `task_${nanoid(12)}`;
    const documentId = `doc_${nanoid(12)}`;
    ensureDir(paths.uploads(taskId));

    let title = '';
    let videoFileName = '';
    let subtitleFileName: string | null = null;

    try {
      for await (const part of req.parts()) {
        if (part.type === 'field' && part.fieldname === 'title') {
          title = String(part.value).trim();
        } else if (part.type === 'file') {
          const isVideo = part.fieldname === 'video';
          const isSubtitle = part.fieldname === 'subtitle';
          if (!isVideo && !isSubtitle) {
            part.file.resume();
            continue;
          }
          const ext = path.extname(part.filename);
          const target = path.join(
            paths.uploads(taskId),
            isVideo ? `video${ext}` : `subtitle${ext}`,
          );
          await streamPipeline(part.file, fs.createWriteStream(target));
          if (isVideo) {
            videoFileName = part.filename;
          } else {
            subtitleFileName = part.filename;
          }
        }
      }
    } catch (err) {
      log.error({ err }, 'multipart parse failed');
      return reply
        .status(400)
        .send({ ok: false, error: { code: 'UPLOAD_FAILED', message: '上传解析失败' } });
    }

    if (!videoFileName) {
      return reply.status(400).send({
        ok: false,
        error: { code: 'BAD_REQUEST', message: '缺少 video 文件' },
      });
    }
    if (!title) {
      title = path.basename(videoFileName, path.extname(videoFileName));
    }

    const now = Date.now();
    db.insert(tasks)
      .values({
        id: taskId,
        documentId,
        title,
        status: 'queued',
        currentStage: null,
        progress: 0,
        videoFileName,
        subtitleFileName,
        videoDurationSec: null,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    runPipeline(taskId, documentId).catch((err: unknown) =>
      log.error({ err, taskId }, 'pipeline crashed'),
    );

    return { ok: true, data: { taskId, documentId } };
  });

  app.get('/api/tasks', async () => {
    const rows = db
      .select({
        task: tasks,
        stepsJson: documents.stepsJson,
      })
      .from(tasks)
      .leftJoin(documents, eq(documents.taskId, tasks.id))
      .orderBy(desc(tasks.createdAt))
      .limit(50)
      .all();
    const list = rows.map(({ task, stepsJson }) => {
      let stepCount = 0;
      if (stepsJson) {
        try {
          const parsed = JSON.parse(stepsJson) as unknown[];
          if (Array.isArray(parsed)) stepCount = parsed.length;
        } catch {
          // ignore
        }
      }
      return { ...task, stepCount };
    });
    return { ok: true, data: { tasks: list } };
  });

  app.get<{ Params: { id: string } }>('/api/tasks/:id', async (req, reply) => {
    const row = db.select().from(tasks).where(eq(tasks.id, req.params.id)).get();
    if (!row) {
      return reply
        .status(404)
        .send({ ok: false, error: { code: 'NOT_FOUND', message: 'task 不存在' } });
    }
    return { ok: true, data: { task: row } };
  });

  app.post<{ Params: { id: string } }>('/api/tasks/:id/retry', async (req, reply) => {
    const row = db.select().from(tasks).where(eq(tasks.id, req.params.id)).get();
    if (!row) {
      return reply
        .status(404)
        .send({ ok: false, error: { code: 'NOT_FOUND', message: 'task 不存在' } });
    }
    db.update(tasks)
      .set({ status: 'queued', currentStage: null, progress: 0, errorJson: null, updatedAt: Date.now() })
      .where(eq(tasks.id, row.id))
      .run();
    runPipeline(row.id, row.documentId).catch((err: unknown) =>
      log.error({ err, taskId: row.id }, 'retry pipeline crashed'),
    );
    return { ok: true, data: { taskId: row.id, documentId: row.documentId } };
  });

  app.get<{ Params: { id: string } }>('/api/tasks/:id/stream', (req, reply) => {
    const taskId = req.params.id;
    const row = db.select().from(tasks).where(eq(tasks.id, taskId)).get();
    if (!row) {
      reply.status(404).send({ ok: false, error: { code: 'NOT_FOUND', message: 'task 不存在' } });
      return;
    }

    const lastEventIdHeader = req.headers['last-event-id'];
    const lastEventId = Array.isArray(lastEventIdHeader)
      ? Number(lastEventIdHeader[0])
      : Number(lastEventIdHeader ?? 0);

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const writeEvent = (event: PersistedStreamEvent): void => {
      reply.raw.write(`id: ${event.id}\n`);
      reply.raw.write(`event: ${event.name}\n`);
      reply.raw.write(`data: ${JSON.stringify(event.payload)}\n\n`);
    };

    for (const event of replay(taskId, Number.isFinite(lastEventId) ? lastEventId : 0)) {
      writeEvent(event);
    }

    if (row.status === 'succeeded' || row.status === 'failed') {
      reply.raw.end();
      return;
    }

    const unsubscribe = subscribe(taskId, writeEvent);
    const heartbeat = setInterval(() => {
      reply.raw.write(`:hb\n\n`);
    }, 30_000);

    req.raw.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });
}
