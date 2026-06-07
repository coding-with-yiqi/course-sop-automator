import type { FastifyInstance } from 'fastify';
import { desc, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import path from 'node:path';
import fs from 'node:fs';
import { pipeline as streamPipeline } from 'node:stream/promises';
import { db } from '../db/client.js';
import { tasks, documents, stageEvents } from '../db/schema.js';
import { paths, ensureDir } from '../util/paths.js';
import { runPipeline } from '../pipeline/orchestrator.js';
import { replay, subscribe, type PersistedStreamEvent } from '../pipeline/eventBus.js';
import { log } from '../util/log.js';
import type { Granularity } from '@sop/shared';

// 任务队列：限制同时运行的管线数量为 1，避免资源耗尽
let _running = false;
const _queue: Array<{ taskId: string; documentId: string }> = [];

function enqueuePipeline(taskId: string, documentId: string): void {
  if (_running) {
    _queue.push({ taskId, documentId });
    log.info({ taskId, queueLength: _queue.length }, 'pipeline queued');
    return;
  }
  _running = true;
  runPipeline(taskId, documentId)
    .catch((err: unknown) => log.error({ err, taskId }, 'pipeline crashed'))
    .finally(() => {
      _running = false;
      const next = _queue.shift();
      if (next) {
        enqueuePipeline(next.taskId, next.documentId);
      }
    });
}

export async function registerTaskRoutes(app: FastifyInstance): Promise<void> {
  app.post('/api/tasks', async (req, reply) => {
    const taskId = `task_${nanoid(12)}`;
    const documentId = `doc_${nanoid(12)}`;
    ensureDir(paths.uploads(taskId));

    let title = '';
    let videoFileName = '';
    let subtitleFileName: string | null = null;
    let slidesFileName: string | null = null;
    let granularity: Granularity = 'normal';

    try {
      for await (const part of req.parts()) {
        if (part.type === 'field' && part.fieldname === 'title') {
          title = String(part.value).trim();
        } else if (part.type === 'field' && part.fieldname === 'granularity') {
          const v = String(part.value);
          if (v === 'coarse' || v === 'normal' || v === 'fine') granularity = v;
        } else if (part.type === 'file') {
          const isVideo = part.fieldname === 'video';
          const isSubtitle = part.fieldname === 'subtitle';
          const isSlides = part.fieldname === 'slides';
          if (!isVideo && !isSubtitle && !isSlides) {
            part.file.resume();
            continue;
          }
          const ext = path.extname(part.filename);
          const stem = isVideo ? 'video' : isSubtitle ? 'subtitle' : 'slides';
          const target = path.join(paths.uploads(taskId), `${stem}${ext}`);
          await streamPipeline(part.file, fs.createWriteStream(target));
          if (isVideo) videoFileName = part.filename;
          else if (isSubtitle) subtitleFileName = part.filename;
          else if (isSlides) slidesFileName = part.filename;
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
        slidesFileName,
        videoDurationSec: null,
        granularity,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    enqueuePipeline(taskId, documentId);

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

  app.delete<{ Params: { id: string } }>('/api/tasks/:id', async (req, reply) => {
    const row = db.select().from(tasks).where(eq(tasks.id, req.params.id)).get();
    if (!row) {
      return reply
        .status(404)
        .send({ ok: false, error: { code: 'NOT_FOUND', message: 'task 不存在' } });
    }
    db.delete(documents).where(eq(documents.taskId, row.id)).run();
    db.delete(stageEvents).where(eq(stageEvents.taskId, row.id)).run();
    db.delete(tasks).where(eq(tasks.id, row.id)).run();
    const dirs = [
      paths.uploads(row.id),
      paths.chunks(row.id),
      path.join(paths.root, 'frames', row.id),
      paths.exports(row.documentId),
    ];
    for (const dir of dirs) {
      await fs.promises.rm(dir, { recursive: true, force: true }).catch((err: unknown) => {
        log.warn({ err, dir }, 'failed to remove dir during task delete');
      });
    }
    return { ok: true, data: { taskId: row.id } };
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
    // 清掉旧事件流,否则 SSE replay 会把上一轮的 error 再喷一遍
    db.delete(stageEvents).where(eq(stageEvents.taskId, row.id)).run();
    // 清理中间产物,避免旧文件与新任务冲突
    const dirs = [
      paths.chunks(row.id),
      path.join(paths.root, 'frames', row.id),
      paths.exports(row.documentId),
    ];
    for (const dir of dirs) {
      await fs.promises.rm(dir, { recursive: true, force: true }).catch((err: unknown) => {
        log.warn({ err, dir }, 'failed to remove dir during task retry');
      });
    }
    enqueuePipeline(row.id, row.documentId);
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

    // This route writes the raw response, bypassing the @fastify/cors hook, so
    // we must set CORS headers by hand. Without them the packaged renderer (an
    // app:// origin talking cross-origin to http://127.0.0.1) has its
    // EventSource blocked by the browser — the SSE shows "已断开" and stage
    // progress never updates even though the pipeline is running.
    const origin = req.headers.origin;
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      // Mirror @fastify/cors { origin: true }: echo the caller's origin.
      'Access-Control-Allow-Origin': origin ?? '*',
      'Access-Control-Allow-Credentials': 'true',
      Vary: 'Origin',
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

    // SSE 连接超时：5 分钟无活动自动关闭，防止网络异常断开时连接泄漏
    const timeout = setTimeout(() => {
      clearInterval(heartbeat);
      unsubscribe();
      reply.raw.end();
    }, 5 * 60 * 1000);

    req.raw.on('close', () => {
      clearTimeout(timeout);
      clearInterval(heartbeat);
      unsubscribe();
    });
  });
}
